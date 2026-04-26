CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT DEFAULT '',
    signature TEXT DEFAULT '',
    telegram_chat_id BIGINT UNIQUE
);

CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY,
    team_name TEXT NOT NULL,
    crest TEXT,
    website TEXT,
    squad JSONB,
    running_competitions JSONB
);

CREATE TABLE IF NOT EXISTS fav_team (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    last_match JSONB,
    next_match JSONB,
    UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS competitions_cache (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    area_name TEXT,
    area_flag TEXT,
    emblem TEXT,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matches_cache (
    id INTEGER PRIMARY KEY,
    league_id INTEGER NOT NULL,
    utc_date TIMESTAMPTZ NOT NULL,
    home_team_name TEXT NOT NULL,
    home_team_crest TEXT,
    away_team_name TEXT NOT NULL,
    away_team_crest TEXT,
    full_time_home INTEGER,
    full_time_away INTEGER,
    winner TEXT,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS standings_cache (
    competition_id INTEGER NOT NULL REFERENCES competitions_cache(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL,
    team_name TEXT NOT NULL,
    crest TEXT,
    position INTEGER,
    played INTEGER,
    won INTEGER,
    draw INTEGER,
    lost INTEGER,
    points INTEGER,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (competition_id, team_id)
);

CREATE TABLE IF NOT EXISTS predictions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    match_id INTEGER NOT NULL REFERENCES matches_cache(id) ON DELETE CASCADE,
    predicted_home_score INTEGER NOT NULL,
    predicted_away_score INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, match_id)
);

CREATE TABLE IF NOT EXISTS teams_cache (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    crest TEXT,
    area TEXT,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS match_details_cache (
    id INTEGER PRIMARY KEY,
    utc_date TIMESTAMPTZ NOT NULL,
    home_team_name TEXT NOT NULL,
    home_team_crest TEXT,
    away_team_name TEXT NOT NULL,
    away_team_crest TEXT,
    full_time_home INTEGER,
    full_time_away INTEGER,
    winner TEXT,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);
