"""
PostgreSQL + JWT: регистрация, вход, профиль (имя, любимая команда) на сервере.
Требует переменные окружения: DATABASE_URL, JWT_SECRET (достаточно длинная строка).
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any

import jwt
from flask import Blueprint, jsonify, request
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from werkzeug.security import check_password_hash, generate_password_hash

logger = logging.getLogger(__name__)

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

_pool: ConnectionPool | None = None
_jwt_secret: str | None = None
JWT_ALG = "HS256"
JWT_TTL_SEC = 7 * 24 * 3600


def auth_configured() -> bool:
    return bool(os.environ.get("DATABASE_URL", "").strip() and os.environ.get("JWT_SECRET", "").strip())


def init_auth_pool() -> None:
    global _pool, _jwt_secret
    dsn = os.environ.get("DATABASE_URL", "").strip()
    secret = os.environ.get("JWT_SECRET", "").strip()
    if not dsn or not secret:
        _pool = None
        _jwt_secret = None
        return
    if len(secret) < 16:
        raise RuntimeError("JWT_SECRET должен быть не короче 16 символов.")
    _jwt_secret = secret
    if _pool is not None:
        return
    _pool = ConnectionPool(
        conninfo=dsn,
        min_size=1,
        max_size=8,
        kwargs={"row_factory": dict_row},
        open=True,
    )
    _ensure_schema()
    logger.info("auth: подключение к PostgreSQL, таблица users проверена.")


def shutdown_auth_pool() -> None:
    global _pool
    if _pool is not None:
        try:
            _pool.close()
        except Exception as e:
            logger.warning("auth: ошибка при закрытии пула: %s", e)
        _pool = None


def _ensure_schema() -> None:
    assert _pool is not None
    with _pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(128) NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    display_name VARCHAR(255) NOT NULL,
                    favorite_team VARCHAR(512) NOT NULL DEFAULT '',
                    role VARCHAR(32) NOT NULL DEFAULT 'user',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
        conn.commit()


def _row_to_user(row: dict[str, Any]) -> dict[str, Any]:
    role = row.get("role") or "user"
    if role not in ("admin", "user"):
        role = "user"
    created = row.get("created_at")
    created_iso = created.isoformat() if hasattr(created, "isoformat") else str(created or "")
    return {
        "id": row["id"],
        "username": row["username"],
        "displayName": row.get("display_name") or row["username"],
        "favoriteTeam": row.get("favorite_team") or "",
        "role": role,
        "createdAt": created_iso,
    }


def _issue_token(user_id: int) -> str:
    assert _jwt_secret
    now = int(time.time())
    payload = {"sub": str(user_id), "iat": now, "exp": now + JWT_TTL_SEC}
    return jwt.encode(payload, _jwt_secret, algorithm=JWT_ALG)


def _decode_token(token: str) -> int | None:
    if not _jwt_secret:
        return None
    try:
        payload = jwt.decode(token, _jwt_secret, algorithms=[JWT_ALG])
        uid = int(payload.get("sub", 0))
        return uid if uid > 0 else None
    except jwt.PyJWTError:
        return None


def _get_bearer_user_id() -> int | None:
    if _pool is None:
        return None
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:].strip()
    if not token:
        return None
    return _decode_token(token)


def _not_configured():
    return (
        jsonify(
            {
                "error": "Авторизация на сервере не настроена. Задайте DATABASE_URL и JWT_SECRET "
                "для Flask и перезапустите приложение.",
            }
        ),
        503,
    )


@auth_bp.route("/register", methods=["POST"])
def register():
    if _pool is None:
        return _not_configured()
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", "")).strip()
    role = "admin" if str(data.get("role", "")).strip() == "admin" else "user"
    if not username or not password:
        return jsonify({"error": "Введите логин и пароль"}), 400
    pw_hash = generate_password_hash(password, method="pbkdf2:sha256")
    display_name = username
    row = None
    try:
        with _pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id FROM users WHERE LOWER(username) = LOWER(%s)",
                    (username,),
                )
                if cur.fetchone():
                    return jsonify({"error": "Пользователь уже существует"}), 409
                cur.execute(
                    """
                    INSERT INTO users (username, password_hash, display_name, favorite_team, role)
                    VALUES (%s, %s, %s, '', %s)
                    RETURNING id, username, display_name, favorite_team, role, created_at
                    """,
                    (username, pw_hash, display_name, role),
                )
                row = cur.fetchone()
            conn.commit()
    except Exception as e:
        logger.exception("auth register: %s", e)
        return jsonify({"error": "Не удалось создать пользователя"}), 500
    if not row:
        return jsonify({"error": "Не удалось создать пользователя"}), 500
    user = _row_to_user(row)
    token = _issue_token(row["id"])
    return jsonify({"token": token, "user": user})


@auth_bp.route("/login", methods=["POST"])
def login():
    if _pool is None:
        return _not_configured()
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", "")).strip()
    if not username or not password:
        return jsonify({"error": "Введите логин и пароль"}), 400
    try:
        with _pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, username, password_hash, display_name, favorite_team, role, created_at
                    FROM users WHERE LOWER(username) = LOWER(%s)
                    """,
                    (username,),
                )
                row = cur.fetchone()
    except Exception as e:
        logger.exception("auth login: %s", e)
        return jsonify({"error": "Ошибка входа"}), 500
    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Неверный логин или пароль"}), 401
    user = _row_to_user(row)
    token = _issue_token(row["id"])
    return jsonify({"token": token, "user": user})


@auth_bp.route("/me", methods=["GET"])
def me_get():
    if _pool is None:
        return _not_configured()
    uid = _get_bearer_user_id()
    if not uid:
        return jsonify({"error": "Нужна авторизация"}), 401
    try:
        with _pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, username, display_name, favorite_team, role, created_at
                    FROM users WHERE id = %s
                    """,
                    (uid,),
                )
                row = cur.fetchone()
    except Exception as e:
        logger.exception("auth me_get: %s", e)
        return jsonify({"error": "Ошибка запроса профиля"}), 500
    if not row:
        return jsonify({"error": "Пользователь не найден"}), 401
    return jsonify(_row_to_user(row))


@auth_bp.route("/me", methods=["PATCH"])
def me_patch():
    if _pool is None:
        return _not_configured()
    uid = _get_bearer_user_id()
    if not uid:
        return jsonify({"error": "Нужна авторизация"}), 401
    data = request.get_json(silent=True) or {}
    display_name = data.get("displayName")
    favorite_team = data.get("favoriteTeam")

    sets: list[str] = []
    params: list[Any] = []

    if display_name is not None:
        dn = str(display_name).strip()
        if not dn:
            return jsonify({"error": "Имя не может быть пустым"}), 400
        sets.append("display_name = %s")
        params.append(dn)
    if favorite_team is not None:
        ft = str(favorite_team).strip()
        if len(ft) > 500:
            return jsonify({"error": "Слишком длинное название команды"}), 400
        sets.append("favorite_team = %s")
        params.append(ft)

    if not sets:
        return jsonify({"error": "Нет полей для обновления"}), 400

    params.append(uid)
    try:
        with _pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE users SET {', '.join(sets)} WHERE id = %s RETURNING id, username, display_name, favorite_team, role, created_at",
                    params,
                )
                row = cur.fetchone()
            conn.commit()
    except Exception as e:
        logger.exception("auth me_patch: %s", e)
        return jsonify({"error": "Не удалось обновить профиль"}), 500
    if not row:
        return jsonify({"error": "Пользователь не найден"}), 401
    return jsonify(_row_to_user(row))

