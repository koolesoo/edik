from flask import Flask, request, jsonify
import psycopg2
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import logging
from flask_cors import CORS


app = Flask(__name__)
CORS(app)

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Конфигурация БД
DB_CONFIG = {
    "host": "localhost",
    "database": "football",
    "user": "myuser",
    "password": "1234"
}


def get_db_connection():
    """Устанавливает соединение с PostgreSQL"""
    return psycopg2.connect(**DB_CONFIG)

DB_CONFIG = {
    "host": "localhost",
    "database": "football",
    "user": "myuser",
    "password": "1234"
}


def get_db_conn():
    return psycopg2.connect(**DB_CONFIG)


def db_operation(func):
    """Декоратор для обработки операций с БД"""

    @wraps(func)
    def wrapper(*args, **kwargs):
        conn = None
        cur = None
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            result = func(cur, *args, **kwargs)
            conn.commit()
            return result
        except psycopg2.Error as e:
            if conn:
                conn.rollback()
            logger.error(f"Database error: {e}")
            return jsonify({"error": "Database operation failed"}), 500
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            return jsonify({"error": "Internal server error"}), 500
        finally:
            if cur:
                cur.close()
            if conn:
                conn.close()

    return wrapper


@app.route("/api/register", methods=["POST"])
@db_operation
def register(cur):
    """Регистрация нового пользователя"""
    data = request.get_json()

    if not data or 'username' not in data or 'password' not in data:
        return jsonify({"error": "Username and password are required"}), 400

    username = data['username'].strip()
    password = data['password']
    name = data.get('name', '').strip()
    signature = data.get('signature', '').strip()

    if len(username) < 4:
        return jsonify({"error": "Username must be at least 4 characters"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    cur.execute("SELECT id FROM users WHERE username = %s", (username,))
    if cur.fetchone():
        return jsonify({"error": "Username already exists"}), 409

    password_hash = generate_password_hash(password)

    cur.execute(
        """INSERT INTO users (username, password_hash, name, signature) 
           VALUES (%s, %s, %s, %s) RETURNING id""",
        (username, password_hash, name, signature)
    )
    user_id = cur.fetchone()[0]

    return jsonify({
        "message": "User registered successfully",
        "user": {
            "id": user_id,
            "username": username,
            "name": name,
            "signature": signature
        }
    }), 201


@app.route("/api/login", methods=["POST"])
@db_operation
def login(cur):
    """Аутентификация пользователя"""
    data = request.get_json()

    if not data or 'username' not in data or 'password' not in data:
        return jsonify({"error": "Username and password are required"}), 400

    username = data['username'].strip()
    password = data['password']

    cur.execute(
        """SELECT id, username, password_hash, name, signature 
           FROM users WHERE username = %s""",
        (username,)
    )
    user = cur.fetchone()

    if not user:
        return jsonify({"error": "Invalid credentials"}), 401

    user_id, db_username, password_hash, name, signature = user

    if not check_password_hash(password_hash, password):
        return jsonify({"error": "Invalid credentials"}), 401

    return jsonify({
        "message": "Login successful",
        "user": {
            "id": user_id,
            "username": db_username,
            "name": name,
            "signature": signature
        }
    })


@app.route("/api/fav-team", methods=["GET", "POST", "DELETE", "OPTIONS"])
@db_operation
def handle_favorite_team(cur):
    """Обработка любимой команды пользователя"""
    if request.method == "OPTIONS":
        return jsonify({"message": "OK"}), 200

    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    team_id = data.get("team_id")
    team_name = data.get("team_name", "").strip()

    if request.method == "GET":
        user_id = request.args.get("user_id")
        if not user_id:
            return jsonify({"error": "User ID is required"}), 400

        cur.execute("SELECT team_id FROM fav_team WHERE user_id = %s", (user_id,))
        result = cur.fetchone()
        return jsonify({"team_id": result[0] if result else None})

    if not user_id:
        return jsonify({"error": "User ID is required"}), 400

    try:
        if request.method == "POST":
            if not team_id:
                return jsonify({"error": "Team ID is required"}), 400
            if not team_name:
                return jsonify({"error": "Team name is required"}), 400

            # Проверка, есть ли такая команда
            cur.execute("SELECT id FROM teams WHERE id = %s", (team_id,))
            if not cur.fetchone():
                cur.execute(
                    "INSERT INTO teams (id, team_name) VALUES (%s, %s)",
                    (team_id, team_name)
                )

            # Удаление старой команды
            cur.execute("DELETE FROM fav_team WHERE user_id = %s", (user_id,))

            # Вставка новой
            cur.execute(
                "INSERT INTO fav_team (user_id, team_id) VALUES (%s, %s) RETURNING id",
                (user_id, team_id)
            )
            fav_id = cur.fetchone()[0]

            # Обновление кэша матчей
            try:
                from cash import update_team_matches
                update_team_matches(user_id, team_id)
            except Exception as e:
                logger.warning(f"⚠️ Не удалось обновить last/next матчи: {e}")

            return jsonify({
                "message": "Favorite team added successfully",
                "fav_team_id": fav_id
            }), 201

        elif request.method == "DELETE":
            cur.execute("DELETE FROM fav_team WHERE user_id = %s", (user_id,))
            return jsonify({
                "message": "Favorite team removed successfully"
            }), 200

    except psycopg2.Error as e:
        logger.error(f"Database error: {e}")
        return jsonify({"error": "Database operation failed"}), 500


@app.route("/api/fav-team/<int:user_id>", methods=["GET"])
@db_operation
def get_favorite_team_by_id(cur, user_id):
    """Получение любимой команды по ID пользователя"""
    try:
        cur.execute(
            "SELECT team_id FROM fav_team WHERE user_id = %s",
            (user_id,)
        )
        result = cur.fetchone()

        if result:
            return jsonify({"team_id": result[0]})
        return jsonify({"team_id": None})
    except psycopg2.Error as e:
        logger.error(f"Database error: {e}")
        return jsonify({"error": "Database operation failed"}), 500


@app.route("/api/matches/<int:league_id>")
def get_matches_by_league(league_id):
    date_from = request.args.get("dateFrom")
    date_to = request.args.get("dateTo")

    if not date_from or not date_to:
        return jsonify({"error": "Missing dateFrom or dateTo"}), 400

    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, utc_date, home_team_name, home_team_crest,
                   away_team_name, away_team_crest,
                   full_time_home, full_time_away, winner
            FROM matches_cache
            WHERE league_id = %s
              AND DATE(utc_date) BETWEEN %s AND %s
            ORDER BY utc_date ASC
        """, (league_id, date_from, date_to))

        matches = cur.fetchall()
        cur.close()
        conn.close()

        result = []
        for row in matches:
            match = {
                "id": row[0],
                "utcDate": row[1].isoformat(),
                "homeTeam": {"name": row[2], "crest": row[3]},
                "awayTeam": {"name": row[4], "crest": row[5]},
                "score": {
                    "fullTime": {
                        "home": row[6],
                        "away": row[7]
                    },
                    "winner": row[8]
                }
            }
            result.append(match)

        return jsonify({"matches": result})

    except Exception as e:
        return jsonify({"error": str(e)}), 500
@app.route("/api/competitions", methods=["GET"])
def get_competitions():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT id, name, area_name, area_flag, emblem
            FROM competitions_cache
            ORDER BY area_name, name
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        competitions = []
        for row in rows:
            competitions.append({
                "id": row[0],
                "name": row[1],
                "area": {
                    "name": row[2],
                    "flag": row[3]
                },
                "emblem": row[4]
            })

        return jsonify({"competitions": competitions})

    except Exception as e:
        logger.error(f"Error fetching competitions: {e}")
        return jsonify({"error": "Internal server error"}), 500
@app.route("/api/standings/<int:competition_id>", methods=["GET"])
def get_standings(competition_id):
    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Получаем название чемпионата
        cur.execute("SELECT name FROM competitions_cache WHERE id = %s", (competition_id,))
        comp = cur.fetchone()
        comp_name = comp[0] if comp else "Неизвестный чемпионат"

        # Получаем standings
        cur.execute("""
            SELECT team_id, team_name, crest, position, played,
                   won, draw, lost, points
            FROM standings_cache
            WHERE competition_id = %s
            ORDER BY position
        """, (competition_id,))
        rows = cur.fetchall()

        cur.close()
        conn.close()

        standings = [{
            "type": "TOTAL",
            "stage": "REGULAR_SEASON",
            "table": [{
                "team": {"id": r[0], "name": r[1], "crest": r[2]},
                "position": r[3],
                "playedGames": r[4],
                "won": r[5],
                "draw": r[6],
                "lost": r[7],
                "points": r[8]
            } for r in rows]
        }]

        return jsonify({
            "competition": {
                "id": competition_id,
                "name": comp_name
            },
            "standings": standings
        })

    except Exception as e:
        logger.error(f"Error fetching standings: {e}")
        return jsonify({"error": "Internal server error"}), 500

@app.route("/api/teams", methods=["GET"])
def get_all_teams():
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("SELECT id, team_name, crest FROM teams ORDER BY team_name")
        rows = cur.fetchall()
        cur.close()
        conn.close()

        teams = [{
            "id": r[0],
            "name": r[1],
            "crest": r[2]
        } for r in rows]

        return jsonify({"teams": teams})

    except Exception as e:
        logger.error(f"Ошибка при получении всех команд: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route("/api/teams/grouped-by-competition", methods=["GET"])
def get_teams_grouped_by_competition():
    try:
        conn = get_db_conn()
        cur = conn.cursor()

        cur.execute("""
            SELECT 
                sc.competition_id,
                cc.name AS competition_name,
                cc.area_name,
                cc.area_flag,
                sc.team_id,
                sc.team_name,
                sc.crest
            FROM standings_cache sc
            JOIN competitions_cache cc ON sc.competition_id = cc.id
            WHERE sc.team_id IS NOT NULL AND sc.team_name IS NOT NULL
            GROUP BY sc.competition_id, cc.name, cc.area_name, cc.area_flag, sc.team_id, sc.team_name, sc.crest
            ORDER BY cc.area_name, cc.name, sc.team_name
        """)

        rows = cur.fetchall()
        cur.close()
        conn.close()

        grouped = {}
        for row in rows:
            comp_id, comp_name, area_name, area_flag, team_id, team_name, crest = row
            key = f"{comp_id}-{comp_name}"

            if key not in grouped:
                grouped[key] = {
                    "competition_id": comp_id,
                    "competition_name": comp_name,
                    "country": area_name,
                    "flag": area_flag,
                    "teams": []
                }

            grouped[key]["teams"].append({
                "id": team_id,
                "name": team_name,
                "crest": crest
            })

        return jsonify(list(grouped.values()))

    except Exception as e:
        logger.error(f"Ошибка при получении группированных команд: {e}")
        return jsonify({"error": "Internal server error"}), 500
@app.route("/api/fav-team/full/<int:user_id>", methods=["GET"])
@db_operation
def get_full_fav_team(cur, user_id):
    """
    Возвращает любимую команду пользователя вместе с матчами и дополнительной инфой.
    """
    cur.execute("""
        SELECT ft.team_id, t.team_name, t.crest, ft.last_match, ft.next_match, t.website, t.squad, t.running_competitions
        FROM fav_team ft
        JOIN teams t ON ft.team_id = t.id
        WHERE ft.user_id = %s
    """, (user_id,))
    result = cur.fetchone()

    if result:
        team_id, name, crest, last_match, next_match, website, squad, running_competitions = result
        return jsonify({
            "team": {
                "id": team_id,
                "name": name,
                "crest": crest,
                "website": website,
                "squad": squad,
                "runningCompetitions": running_competitions
            },
            "last_match": last_match,
            "next_match": next_match
        })
    else:
        return jsonify({
            "team": None,
            "last_match": None,
            "next_match": None
        })
@app.route("/api/telegram-bind", methods=["POST"])
@db_operation
def bind_telegram(cur):
    """Привязка Telegram-аккаунта к пользователю"""
    data = request.get_json()
    user_id = data.get("user_id")
    chat_id = data.get("chat_id")

    if not user_id or not chat_id:
        return jsonify({"error": "user_id and chat_id required"}), 400

    try:
        cur.execute("UPDATE users SET telegram_chat_id = %s WHERE id = %s", (chat_id, user_id))
        return jsonify({"message": "Telegram chat linked successfully"}), 200
    except Exception as e:
        logger.error(f"Ошибка при привязке Telegram: {e}")
        return jsonify({"error": "Ошибка при сохранении chat_id"}), 500
@app.route("/api/user-by-chat/<int:chat_id>", methods=["GET"])
@db_operation
def get_user_by_chat_id(cur, chat_id):
    cur.execute("SELECT id, username, name FROM users WHERE telegram_chat_id = %s", (chat_id,))
    user = cur.fetchone()
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"id": user[0], "username": user[1], "name": user[2]})
@app.route("/api/fav-team/standings/<int:user_id>", methods=["GET"])
@db_operation
def get_fav_team_standings(cur, user_id):
    # 1. Получаем ID команды и следующий матч
    cur.execute("""
        SELECT ft.team_id, ft.next_match::jsonb
        FROM fav_team ft
        WHERE ft.user_id = %s
    """, (user_id,))
    result = cur.fetchone()

    if not result:
        return jsonify({"error": "Любимая команда не найдена"}), 404

    team_id, next_match = result
    if not next_match:
        return jsonify({"error": "Нет данных о следующем матче"}), 404

    # 2. Извлекаем competition_id
    try:
        comp_id = next_match.get("competition", {}).get("id")
        if not comp_id:
            return jsonify({"error": "Не найден competition.id в next_match"}), 400
    except Exception as e:
        return jsonify({"error": "Ошибка обработки next_match"}), 500

    # 3. Ищем в standings_cache
    cur.execute("""
        SELECT cc.name, sc.position, sc.played, sc.won, sc.draw, sc.lost, sc.points
        FROM standings_cache sc
        JOIN competitions_cache cc ON sc.competition_id = cc.id
        WHERE sc.competition_id = %s AND sc.team_id = %s
    """, (comp_id, team_id))

    row = cur.fetchone()

    if not row:
        return jsonify({"error": "Позиция команды не найдена"}), 404

    comp_name, position, played, won, draw, lost, points = row

    return jsonify({
        "competition": comp_name,
        "team_id": team_id,
        "position": position,
        "points": points,
        "played": played,
        "won": won,
        "draw": draw,
        "lost": lost
    })


import traceback

@app.route("/api/predictions", methods=["POST", "OPTIONS"])
@db_operation
def submit_prediction(cur):
    if request.method == "OPTIONS":
        return jsonify({"message": "OK"}), 200

    try:
        data = request.get_json()
        print("🔥 Получен запрос:", data)

        user_id = int(data.get("user_id"))
        match_id = int(data.get("match_id"))
        home_score = int(data.get("predicted_home_score"))
        away_score = int(data.get("predicted_away_score"))

        # Проверяем — есть ли матч в matches_cache
        cur.execute("SELECT 1 FROM matches_cache WHERE id = %s", (match_id,))
        if not cur.fetchone():
            # Автозагрузка через внешний API
            from cash import load_match_details
            print(f"ℹ️ Матч {match_id} не найден в кэше, загружаем...")
            load_match_details(match_id)

        # Повторная проверка (на случай если загрузка не удалась)
        cur.execute("SELECT 1 FROM matches_cache WHERE id = %s", (match_id,))
        if not cur.fetchone():
            return jsonify({"error": f"Матч {match_id} не найден и не удалось загрузить"}), 400

        # Запись предикта
        cur.execute("""
            INSERT INTO predictions (user_id, match_id, predicted_home_score, predicted_away_score)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (user_id, match_id) DO UPDATE
            SET predicted_home_score = EXCLUDED.predicted_home_score,
                predicted_away_score = EXCLUDED.predicted_away_score,
                updated_at = CURRENT_TIMESTAMP
        """, (user_id, match_id, home_score, away_score))

        print("✅ Прогноз успешно сохранён")
        return jsonify({"message": "Прогноз принят"}), 200

    except Exception as e:
        print("❌ Ошибка в submit_prediction:")
        traceback.print_exc()
        return jsonify({
            "error": "Ошибка сервера",
            "details": str(e)
        }), 500
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)