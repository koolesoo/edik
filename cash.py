import requests
import psycopg2
from datetime import date, timedelta
from time import sleep
import json
from typing import Optional
from datetime import datetime
import time

# === Конфигурация ===
API_KEY = "50814c2f650749009a71ac0fd8dcb7f4"
HEADERS = {"X-Auth-Token": API_KEY}

DB_CONFIG = {
    "host": "localhost",
    "database": "football",
    "user": "myuser",
    "password": "1234"
}

# === Подключение к БД ===
def get_db_conn():
    return psycopg2.connect(**DB_CONFIG)

# === Загрузка чемпионатов ===
def load_competitions():
    print("→ Загружаем чемпионаты...")
    response = requests.get("https://api.football-data.org/v4/competitions", headers=HEADERS)
    response.raise_for_status()
    competitions = response.json()["competitions"]

    conn = get_db_conn()
    cur = conn.cursor()

    for comp in competitions:
        cur.execute("""
            INSERT INTO competitions_cache (id, name, area_name, area_flag, emblem)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE 
            SET name = EXCLUDED.name,
                area_name = EXCLUDED.area_name,
                area_flag = EXCLUDED.area_flag,
                emblem = EXCLUDED.emblem,
                last_updated = NOW()
        """, (
            comp["id"],
            comp["name"],
            comp["area"]["name"],
            comp["area"].get("flag"),
            comp.get("emblem")
        ))

    conn.commit()
    cur.close()
    conn.close()
    print(f"✅ Загружено и сохранено {len(competitions)} чемпионатов.")

# === Загрузка матчей по одной лиге ===
def load_matches_for_league(league_id, date_from=None, date_to=None, retry=False):
    date_from = date_from or (date.today() - timedelta(days=90)).isoformat()
    date_to = date_to or date.today().isoformat()

    print(f"→ Загружаем матчи: Лига {league_id} | {date_from} → {date_to}")
    url = f"https://api.football-data.org/v4/competitions/{league_id}/matches"

    try:
        response = requests.get(url, headers=HEADERS, params={
            "dateFrom": date_from,
            "dateTo": date_to
        })
    except Exception as e:
        print(f"❌ Ошибка сети: {e}")
        return

    if response.status_code == 429:
        print(f"⚠️ Лимит API превышен при запросе для лиги {league_id}")
        retry_after = response.headers.get("Retry-After")
        wait_time = int(retry_after) if retry_after else 60
        print(f"⏳ Ждём {wait_time} секунд перед повтором...")
        sleep(wait_time)
        if not retry:
            return load_matches_for_league(league_id, date_from, date_to, retry=True)
        else:
            print(f"❌ Повторная попытка не удалась. Пропускаем лигу {league_id}")
            return

    if response.status_code != 200:
        print(f"❌ Ошибка API {response.status_code} для лиги {league_id}")
        return

    matches = response.json().get("matches", [])
    print(f"   Найдено матчей: {len(matches)}")

    conn = get_db_conn()
    cur = conn.cursor()

    for match in matches:
        cur.execute("""
            INSERT INTO matches_cache (
                id, league_id, utc_date,
                home_team_name, home_team_crest,
                away_team_name, away_team_crest,
                full_time_home, full_time_away,
                winner
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE
            SET full_time_home = EXCLUDED.full_time_home,
                full_time_away = EXCLUDED.full_time_away,
                winner = EXCLUDED.winner,
                last_updated = NOW()
        """, (
            match["id"],
            league_id,
            match["utcDate"],
            match["homeTeam"]["name"],
            match["homeTeam"].get("crest"),
            match["awayTeam"]["name"],
            match["awayTeam"].get("crest"),
            match["score"]["fullTime"].get("home"),
            match["score"]["fullTime"].get("away"),
            match["score"].get("winner")
        ))

    conn.commit()
    cur.close()
    conn.close()
    print(f"✅ Сохранено {len(matches)} матчей для лиги {league_id}")

# === Загрузка матчей по всем лигам ===
def load_all_leagues_matches():
    print("→ Получаем список лиг из БД...")
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("SELECT id FROM competitions_cache")
    leagues = cur.fetchall()
    cur.close()
    conn.close()

    today = date.today()
    three_months_ago = today - timedelta(days=90)

    for (league_id,) in leagues:
        load_matches_for_league(
            league_id=league_id,
            date_from=three_months_ago.isoformat(),
            date_to=today.isoformat()
        )
        sleep(1)  # базовая пауза между запросами (мягко помогает не упереться в лимит)

def load_match_details(match_id):
    print(f"→ Загружаем детали матча {match_id}...")
    url = f"https://api.football-data.org/v4/matches/{match_id}"
    response = requests.get(url, headers=HEADERS)

    if response.status_code == 429:
        retry_after = response.headers.get("Retry-After", 60)
        print(f"⚠️ Лимит API. Ждём {retry_after} секунд...")
        sleep(int(retry_after))
        return load_match_details(match_id)

    if response.status_code != 200:
        print(f"❌ Ошибка при загрузке матча {match_id}: {response.status_code}")
        return

    match = response.json()

    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO match_details_cache (
            id, utc_date,
            home_team_name, home_team_crest,
            away_team_name, away_team_crest,
            full_time_home, full_time_away,
            winner
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE
        SET full_time_home = EXCLUDED.full_time_home,
            full_time_away = EXCLUDED.full_time_away,
            winner = EXCLUDED.winner,
            last_updated = NOW()
    """, (
        match["id"],
        match["utcDate"],
        match["homeTeam"]["name"],
        match["homeTeam"].get("crest"),
        match["awayTeam"]["name"],
        match["awayTeam"].get("crest"),
        match["score"]["fullTime"].get("home"),
        match["score"]["fullTime"].get("away"),
        match["score"].get("winner")
    ))

    conn.commit()
    cur.close()
    conn.close()
    print(f"✅ Сохранено: матч {match_id}")

def load_all_teams():
    print("→ Загружаем список всех команд...")
    response = requests.get("https://api.football-data.org/v4/teams", headers=HEADERS)

    if response.status_code == 429:
        retry_after = response.headers.get("Retry-After", 60)
        print(f"⚠️ Лимит API. Ждём {retry_after} секунд...")
        sleep(int(retry_after))
        return load_all_teams()

    if response.status_code != 200:
        print(f"❌ Ошибка загрузки команд: {response.status_code}")
        return

    teams = response.json().get("teams", [])

    conn = get_db_conn()
    cur = conn.cursor()
    for team in teams:
        cur.execute("""
            INSERT INTO teams_cache (id, name, crest, area)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name,
                crest = EXCLUDED.crest,
                area = EXCLUDED.area,
                last_updated = NOW()
        """, (
            team["id"],
            team["name"],
            team.get("crest"),
            team["area"]["name"]
        ))

    conn.commit()
    cur.close()
    conn.close()
    print(f"✅ Загружено {len(teams)} команд")
def load_all_match_details():
    print("→ Получаем список match_id из matches_cache...")
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("SELECT id FROM matches_cache")
    match_ids = cur.fetchall()
    cur.close()
    conn.close()

    for (match_id,) in match_ids:
        load_match_details(match_id)
        sleep(1)  # для лимита в 10 запросов в минуту
def load_standings(competition_id):
    print(f"→ Загружаем standings для чемпионата {competition_id}")
    url = f"https://api.football-data.org/v4/competitions/{competition_id}/standings"
    response = requests.get(url, headers=HEADERS)

    if response.status_code == 429:
        retry_after = int(response.headers.get("Retry-After", 60))
        print(f"⚠️ Лимит API. Ждём {retry_after} сек...")
        sleep(retry_after)
        return load_standings(competition_id)

    if response.status_code != 200:
        print(f"❌ Ошибка API: {response.status_code}")
        return

    standings_data = response.json()["standings"][0]["table"]  # Только первая таблица

    conn = get_db_conn()
    cur = conn.cursor()

    for team in standings_data:
        cur.execute("""
            INSERT INTO standings_cache (
                competition_id, team_id, team_name, crest,
                position, played, won, draw, lost, points
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (competition_id, team_id) DO UPDATE
            SET position = EXCLUDED.position,
                played = EXCLUDED.played,
                won = EXCLUDED.won,
                draw = EXCLUDED.draw,
                lost = EXCLUDED.lost,
                points = EXCLUDED.points,
                crest = EXCLUDED.crest
        """, (
            competition_id,
            team["team"]["id"],
            team["team"]["name"],
            team["team"].get("crest"),
            team["position"],
            team["playedGames"],
            team["won"],
            team["draw"],
            team["lost"],
            team["points"]
        ))

    conn.commit()
    cur.close()
    conn.close()
    print(f"✅ Standings сохранены: {competition_id}")
def load_all_standings():
    print("→ Получаем список чемпионатов из competitions_cache...")
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("SELECT id FROM competitions_cache")
    competitions = cur.fetchall()
    cur.close()
    conn.close()

    for (competition_id,) in competitions:
        load_standings(competition_id)
        sleep(1)  # чтобы не превысить лимит в 10 запросов в минуту

def cache_teams_from_standings():
    print("→ Кэшируем команды из standings...")

    conn = get_db_conn()
    cur = conn.cursor()

    cur.execute("""
        SELECT DISTINCT team_id, team_name, crest
        FROM standings_cache
    """)
    teams = cur.fetchall()

    for team_id, team_name, crest in teams:
        cur.execute("""
            INSERT INTO teams (id, team_name, crest)
            VALUES (%s, %s, %s)
            ON CONFLICT (id) DO NOTHING
        """, (team_id, team_name, crest))

    conn.commit()
    cur.close()
    conn.close()
    print(f"✅ Сохранено {len(teams)} команд из standings")
def update_team_crests_from_standings():
    conn = get_db_conn()
    cur = conn.cursor()

    cur.execute("""
        UPDATE teams t
        SET crest = sc.crest
        FROM standings_cache sc
        WHERE t.id = sc.team_id
          AND (t.crest IS NULL OR t.crest = '')
    """)

    conn.commit()
    cur.close()
    conn.close()
    print("✅ crest обновлены из standings")
def update_team_matches_from_cache(user_id: int, team_id: int):
    """Обновляет last/next матч из matches_cache."""
    conn = get_db_conn()
    cur = conn.cursor()

    try:
        cur.execute("""
            SELECT id, utc_date, home_team_name, home_team_crest,
                   away_team_name, away_team_crest,
                   full_time_home, full_time_away, winner
            FROM matches_cache
            WHERE home_team_name = (SELECT team_name FROM teams WHERE id = %s)
               OR away_team_name = (SELECT team_name FROM teams WHERE id = %s)
            ORDER BY utc_date
        """, (team_id, team_id))

        matches = cur.fetchall()
        now = datetime.utcnow()

        last_match = None
        next_match = None

        for match in matches:
            match_data = {
                "id": match[0],
                "date": match[1].isoformat(),
                "home_team": {"name": match[2], "crest": match[3]},
                "away_team": {"name": match[4], "crest": match[5]},
                "score": {"home": match[6], "away": match[7]},
                "winner": match[8]
            }

            if match[1] < now:
                last_match = match_data
            elif not next_match:
                next_match = match_data

        cur.execute("""
            UPDATE fav_team
            SET last_match = %s,
                next_match = %s
            WHERE user_id = %s AND team_id = %s
        """, (
            json.dumps(last_match) if last_match else None,
            json.dumps(next_match) if next_match else None,
            user_id,
            team_id
        ))
        conn.commit()
        print(f"✅ [CACHE] Обновлено для команды {team_id} юзера {user_id}")

    except Exception as e:
        print(f"❌ [CACHE] Ошибка для команды {team_id}: {e}")
    finally:
        cur.close()
        conn.close()

def update_team_matches_from_api(team_id: int, user_id: int, attempt: int = 1):
    if attempt > 3:
        print(f"❌ [API] Слишком много попыток для команды {team_id}")
        return

    print(f"→ [API] Загружаем матчи для команды {team_id} и юзера {user_id}...")
    url = f"https://api.football-data.org/v4/teams/{team_id}/matches"

    try:
        response = requests.get(url, headers=HEADERS, params={"limit": 20}, timeout=10)

        if response.status_code == 429:
            retry_after = int(response.headers.get("Retry-After", 60))
            print(f"⚠️ Лимит API. Ждём {retry_after} сек...")
            sleep(retry_after)
            return update_team_matches_from_api(team_id, user_id, attempt + 1)

        if response.status_code != 200:
            print(f"❌ Ошибка API: {response.status_code}")
            return

        matches = response.json().get("matches", [])
        played = [m for m in matches if m["status"] == "FINISHED"]
        upcoming = [m for m in matches if m["status"] in ("SCHEDULED", "TIMED")]

        last_match = played[-1] if played else None
        next_match = upcoming[0] if upcoming else None

        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute("""
            UPDATE fav_team
            SET last_match = %s,
                next_match = %s
            WHERE user_id = %s AND team_id = %s
        """, (
            json.dumps(last_match) if last_match else None,
            json.dumps(next_match) if next_match else None,
            user_id,
            team_id
        ))
        conn.commit()
        print(f"✅ [API] Обновлено для команды {team_id} юзера {user_id}")
        cur.close()
        conn.close()

    except requests.exceptions.Timeout:
        print(f"⏱️ [API] Таймаут при запросе матчей для команды {team_id}")
    except Exception as e:
        print(f"❌ [API] Ошибка: {e}")

def update_fav_team_matches(team_id, user_id):
    print(f"→ Обновляем матчи для команды {team_id} и юзера {user_id}...")

    url = f"https://api.football-data.org/v4/teams/{team_id}/matches"
    response = requests.get(url, headers=HEADERS, params={"limit": 20})

    if response.status_code == 429:
        retry_after = int(response.headers.get("Retry-After", 60))
        print(f"⚠️ Лимит API. Ждём {retry_after} сек...")
        sleep(retry_after)
        return update_fav_team_matches(team_id, user_id)

    if response.status_code != 200:
        print(f"❌ Ошибка API: {response.status_code}")
        return

    matches = response.json().get("matches", [])

    # Отделяем сыгранные и будущие
    played_matches = [m for m in matches if m["status"] == "FINISHED"]
    upcoming_matches = [m for m in matches if m["status"] in ("SCHEDULED", "TIMED")]

    # Берём последний сыгранный и ближайший следующий
    last_match = played_matches[-1] if played_matches else None
    next_match = upcoming_matches[0] if upcoming_matches else None

    conn = get_db_conn()
    cur = conn.cursor()

    cur.execute("""
        UPDATE fav_team
        SET last_match = %s,
            next_match = %s
        WHERE user_id = %s AND team_id = %s
    """, (
        json.dumps(last_match) if last_match else None,
        json.dumps(next_match) if next_match else None,
        user_id,
        team_id
    ))

    conn.commit()
    cur.close()
    conn.close()

    print(f"✅ Обновлено для команды {team_id} юзера {user_id}")
def update_all_fav_teams_matches():
    print("→ Обновляем last/next матчи для всех любимых команд...")
    conn = get_db_conn()
    cur = conn.cursor()

    cur.execute("SELECT team_id, user_id FROM fav_team")
    fav_teams = cur.fetchall()

    for team_id, user_id in fav_teams:
        try:
            update_fav_team_matches(team_id, user_id)
        except Exception as e:
            print(f"❌ Ошибка для team_id={team_id}, user_id={user_id}: {e}")

    cur.close()
    conn.close()

def update_team_matches(user_id: int, team_id: int):
    conn = get_db_conn()
    cur = conn.cursor()

    try:
        cur.execute("""
            SELECT id, utc_date, home_team_name, home_team_crest,
                   away_team_name, away_team_crest,
                   full_time_home, full_time_away, winner
            FROM matches_cache
            WHERE (home_team_name = (SELECT team_name FROM teams WHERE id = %s)
                   OR away_team_name = (SELECT team_name FROM teams WHERE id = %s))
            ORDER BY utc_date
        """, (team_id, team_id))

        matches = cur.fetchall()
        now = datetime.utcnow()

        last_match = None
        next_match = None

        for match in matches:
            match_data = {
                "id": match[0],
                "date": match[1].isoformat(),
                "home_team": {"name": match[2], "crest": match[3]},
                "away_team": {"name": match[4], "crest": match[5]},
                "score": {"home": match[6], "away": match[7]},
                "winner": match[8]
            }

            if match[1] < now:
                last_match = match_data
            elif next_match is None and match[1] >= now:
                next_match = match_data

        cur.execute("""
            UPDATE fav_team
            SET last_match = %s,
                next_match = %s
            WHERE user_id = %s AND team_id = %s
        """, (
            json.dumps(last_match) if last_match else None,
            json.dumps(next_match) if next_match else None,
            user_id,
            team_id
        ))

        conn.commit()

    except Exception as e:
        print(f"⚠️ Ошибка при обновлении матчей команды {team_id}: {e}")
    finally:
        cur.close()
        conn.close()
def enrich_teams_from_api():
    print("→ Обогащаем команды данными из API...")

    conn = get_db_conn()
    cur = conn.cursor()

    cur.execute("SELECT id FROM teams")
    team_ids = [row[0] for row in cur.fetchall()]

    for team_id in team_ids:
        try:
            url = f"https://api.football-data.org/v4/teams/{team_id}"
            response = requests.get(url, headers=HEADERS)

            if response.status_code == 429:
                retry_after = int(response.headers.get("Retry-After", 60))
                print(f"⚠️ Лимит API. Ждём {retry_after} сек...")
                sleep(retry_after)
                continue

            if response.status_code != 200:
                print(f"❌ Пропускаем team {team_id}, статус {response.status_code}")
                continue

            team_data = response.json()

            website = team_data.get("website")
            squad = team_data.get("squad")
            running_competitions = team_data.get("runningCompetitions")

            cur.execute("""
                UPDATE teams
                SET website = %s,
                    squad = %s,
                    running_competitions = %s
                WHERE id = %s
            """, (
                website,
                json.dumps(squad) if squad else None,
                json.dumps(running_competitions) if running_competitions else None,
                team_id
            ))

            conn.commit()
            print(f"✅ Обновлено: команда {team_id}")

        except Exception as e:
            print(f"⚠️ Ошибка обработки команды {team_id}: {e}")
            continue

    cur.close()
    conn.close()
    print("🏁 Обогащение завершено.")

def update_team_cache(user_id: int, team_id: int):
    print(f"📦 Обновление кэша команды {team_id} для пользователя {user_id}")

    try:
        update_team_matches(user_id, team_id)
        print("✅ Last/Next матч обновлены")
    except Exception as e:
        print(f"⚠️ Не удалось обновить матчи: {e}")

    try:
        enrich_team(team_id)
        print("✅ Информация о команде обновлена")
    except Exception as e:
        print(f"⚠️ Не удалось обогатить команду: {e}")

    try:
        update_team_standings(team_id)
        print("✅ Таблица обновлена")
    except Exception as e:
        print(f"⚠️ Не удалось обновить таблицу: {e}")
# === Точка входа ===
if __name__ == "__main__":
    while True:
        load_all_leagues_matches()
        print("⏱ Запуск обновления кэша всех любимых команд...")
        update_all_fav_teams_matches()
        print("✅ Ожидание 7 секунд до следующего запуска...\n")
        time.sleep(12)