# Статистика РПЛ

**Проверяющим ВКР:** пошаговый запуск, структура репозитория, переменные окружения и материалы для отчёта — в **[`docs/for-reviewers.md`](docs/for-reviewers.md)**.

Веб-приложение **«Статистика РПЛ»**: матчи РПЛ (live и по дням), турнирная таблица, детальная статистика матча и профиль с любимой командой. В браузере вкладка называется **«Статистика РПЛ»** (`football-stats/index.html`).

## Состав репозитория

| Путь | Назначение |
|------|------------|
| `football-stats/` | Фронтенд: **React 19**, **Vite 6**, **React Router**, **Framer Motion**, `axios` |
| `app.py` | **Flask** на порту **5001**: прокси к [LiveScore API](https://www.live-score-api.com/) |
| `livescore_api.py` | Клиент LiveScore, маршруты вида `/api/livescore/rpl/*` |
| `requirements.txt` | Зависимости Python для прокси |
| `scripts/curl_livescore_rpl.sh` | Пример curl к API и к локальному Flask |
| `scripts/dev-lan.sh` | Одновременный запуск Flask и Vite для отладки по LAN |
| `docs/` | Инструкции для проверяющих, Android, экономия запросов к API, диаграммы |
| `docker-compose.yml` | Локальная PostgreSQL для серверной авторизации (опционально) |
| `auth_api.py` | Регистрация и JWT при заданных `DATABASE_URL` и `JWT_SECRET` |

Корневой `.env` или `football-stats/.env` (и локальные `*.local.env`, не в git): шаблон — **`.env.example`**. Полная сводка переменных (LiveScore, опционально PostgreSQL/JWT, опционально `VITE_*` для фронта) — в **[`docs/for-reviewers.md`](docs/for-reviewers.md)** (раздел 4.0).

## Функции фронтенда (кратко)

- **Live / Игры** — список матчей, выбор даты, переход к статистике матча.
- **Таблица** — турнирная таблица РПЛ, параметр `?team=` для фокуса на строке.
- **Статистика матча** — показатели от провайдера при наличии `match_id`; при пустом ответе API — расчёт на клиенте по контексту встречи (с пояснением на экране). Заголовок вкладки: `Хозяева — Гости · Статистика РПЛ`.
- **Профиль** — любимая команда (локальный «аккаунт»), обзор из таблицы + календарь; карточки матчей: соперник, дата/время, **Дома** (иконка дома) / **В гостях** (контурный самолёт).
- **Профиль → аккаунт** — имя, вход/регистрация (локально в `localStorage`).

Запросы к API идут через **`football-stats/src/services/api.js`**: кэш, TTL, дедупликация (подробнее в [`docs/minimize-api-requests.md`](docs/minimize-api-requests.md)).

## Запуск локально

### 1. Прокси (Flask)

Из **корня** репозитория:

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
```

Сервер слушает **http://127.0.0.1:5001**.

### 2. Фронтенд (Vite)

```bash
cd football-stats
npm ci
npm run dev
```

По умолчанию **http://localhost:5173**. В `vite.config.js` настроен прокси **`/api` → `http://127.0.0.1:5001`**, чтобы фронт ходил к Flask без CORS.

## Сборка

```bash
cd football-stats
npm run build
```

Результат в `football-stats/dist/`. Каталоги `dist/` и кэш Vite не коммитятся (`.gitignore`).

## Проверка API

```bash
./scripts/curl_livescore_rpl.sh
```

(при необходимости поправьте URL и ключи под свою среду.)

## Полезные ссылки внутри проекта

- **Проверка и защита ВКР:** [`docs/for-reviewers.md`](docs/for-reviewers.md)
- Подробности по фронту и скриптам: [`football-stats/README.md`](football-stats/README.md)
- Диаграммы (SVG/PNG): [`docs/diagrams/README.md`](docs/diagrams/README.md)
- Сборка Android (Capacitor): [`docs/ANDROID_SETUP.md`](docs/ANDROID_SETUP.md)
- Экономия запросов к внешнему API: [`docs/minimize-api-requests.md`](docs/minimize-api-requests.md)
