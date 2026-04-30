import axios from 'axios';

const premierLeagueBaseUrl = '/api';

const api = axios.create({
  // External API from tarun7r/Premier-League-API.
  baseURL: premierLeagueBaseUrl,
});

const FIXTURES_CACHE_KEY = 'footstat.pl.fixtures.cache.v1';
const API_CACHE_KEY = 'footstat.api.cache.v1';
const API_CACHE_TTL_MS = 60 * 1000;

const isRateLimitError = (error) => Number(error?.response?.status) === 429;
const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

const readFixturesCache = () => {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(FIXTURES_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const readApiCache = () => {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(API_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeApiCache = (cache) => {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(API_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore cache write errors.
  }
};

const setApiCacheEntry = (key, payload) => {
  if (!key) return;
  const cache = readApiCache();
  cache[key] = { updatedAt: Date.now(), payload };
  writeApiCache(cache);
};

const getApiCacheEntry = (key, maxAgeMs = API_CACHE_TTL_MS) => {
  if (!key) return null;
  const cache = readApiCache();
  const entry = cache[key];
  if (!entry) return null;
  const age = Date.now() - Number(entry.updatedAt || 0);
  return {
    payload: entry.payload,
    isFresh: age <= maxAgeMs,
  };
};

const cachedRequest = async (key, requestFn, maxAgeMs = API_CACHE_TTL_MS) => {
  const cached = getApiCacheEntry(key, maxAgeMs);
  if (cached?.isFresh) {
    return cached.payload;
  }

  try {
    const payload = await requestFn();
    setApiCacheEntry(key, payload);
    return payload;
  } catch (error) {
    if ((isRateLimitError(error) || isOffline()) && cached?.payload != null) {
      return cached.payload;
    }
    throw error;
  }
};

const saveFixturesCache = (teamName, payload) => {
  try {
    if (typeof localStorage === 'undefined') return;
    const teamKey = String(teamName || '').toLowerCase();
    if (!teamKey) return;
    const cache = readFixturesCache();
    cache[teamKey] = {
      updatedAt: Date.now(),
      payload: Array.isArray(payload) ? payload : [],
    };
    localStorage.setItem(FIXTURES_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore caching issues: network data remains source of truth.
  }
};

const getCachedFixtures = (teamName) => {
  const teamKey = String(teamName || '').toLowerCase();
  if (!teamKey) return null;
  const cache = readFixturesCache();
  const cached = cache[teamKey];
  if (!cached || !Array.isArray(cached.payload)) return null;
  return cached.payload;
};

const parseFixtureString = (line) => {
  const text = String(line || '');
  const dateMatch = text.match(/(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})/);
  const statusMatch = text.match(/\[([A-Z_]+)\]\s*$/);
  const status = statusMatch ? statusMatch[1] : 'SCHEDULED';
  let teamsPart = text;
  if (dateMatch?.index != null) {
    teamsPart = text.slice(0, dateMatch.index).trim();
  }
  teamsPart = teamsPart.replace(/\[[A-Z_]+\]\s*$/, '').trim();
  const [homeTeamName = '', awayTeamName = ''] = teamsPart.split(/\s+vs\s+/i);
  return {
    homeTeamName: homeTeamName.trim(),
    awayTeamName: awayTeamName.trim(),
    displayDate: dateMatch ? `${dateMatch[1]} ${dateMatch[2]}` : 'Дата уточняется',
    status,
    homeCrest: '',
    awayCrest: '',
    homeScore: null,
    awayScore: null,
  };
};

const normalizeFixtureObject = (fixture) => {
  if (fixture && typeof fixture === 'object' && !Array.isArray(fixture)) {
    const homeCrest = fixture.homeTeam?.crest
      || fixture.homeTeam?.logo
      || fixture.homeCrest
      || fixture.homeLogo
      || fixture.homeTeamLogo
      || fixture.home_team_crest
      || '';
    const awayCrest = fixture.awayTeam?.crest
      || fixture.awayTeam?.logo
      || fixture.awayCrest
      || fixture.awayLogo
      || fixture.awayTeamLogo
      || fixture.away_team_crest
      || '';
    return {
      homeTeamName: fixture.homeTeam?.name || fixture.homeTeamName || '',
      awayTeamName: fixture.awayTeam?.name || fixture.awayTeamName || '',
      displayDate: fixture.displayDate || fixture.dateLabel || '',
      status: fixture.status || 'SCHEDULED',
      homeCrest,
      awayCrest,
      homeScore: fixture.score?.fullTime?.home ?? fixture.homeScore ?? null,
      awayScore: fixture.score?.fullTime?.away ?? fixture.awayScore ?? null,
    };
  }
  return parseFixtureString(fixture);
};

export const getCompetitions = async () => {
  return [];
};

export const getTeams = async () => {
  return [];
};

export const getGroupedTeams = async () => {
  return [];
};

export const getMatches = async (leagueId, dateFrom, dateTo) => {
  try {
    const response = await api.get(`/matches/${leagueId}`, {
      params: {
        dateFrom,
        dateTo,
      },
    });
    if (Array.isArray(response.data)) return response.data;
    return response.data?.matches ?? [];
  } catch (error) {
    console.error('Ошибка при получении матчей:', error.response?.data || error.message);
    return [];
  }
};

export const getStandings = async (competitionId) => {
  void competitionId;
  return getPremierLeagueStandings();
};

export const getPremierLeagueTable = async () => {
  return cachedRequest(
    'pl.table',
    async () => {
      const response = await api.get('/standings/2021');
      const rows = response?.data?.standings?.[0]?.table ?? [];
      const header = ['Position', 'Team', 'Played', 'Wins', 'Draws', 'Losses', 'Goal Difference', 'Points'];
      const body = rows.map((row) => {
        const gd = Number(row.goalsFor ?? 0) - Number(row.goalsAgainst ?? 0);
        return `${row.position}. ${row.team?.name || '-'} | ${row.playedGames ?? 0} | ${row.won ?? 0} | ${row.draw ?? 0} | ${row.lost ?? 0} | ${gd} | ${row.points ?? 0}`;
      });
      return [header.join(' | '), ...body];
    },
    2 * 60 * 1000,
  );
};

export const getPremierLeagueFixtures = async (teamName) => {
  const cacheKey = `pl.fixtures.${String(teamName || '').toLowerCase()}`;
  const cachedByKey = getApiCacheEntry(cacheKey, 90 * 1000);
  if (cachedByKey?.isFresh && Array.isArray(cachedByKey.payload)) {
    return cachedByKey.payload;
  }

  try {
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - 10);
    const to = new Date(today);
    to.setDate(today.getDate() + 30);
    const dateFrom = from.toISOString().split('T')[0];
    const dateTo = to.toISOString().split('T')[0];

    const response = await api.get('/matches/2021', { params: { dateFrom, dateTo } });
    const matches = response?.data?.matches ?? [];
    const normalizedTeam = String(teamName || '').toLowerCase();
    const payload = matches.filter((match) => {
      const home = String(match?.homeTeam?.name || '').toLowerCase();
      const away = String(match?.awayTeam?.name || '').toLowerCase();
      return home.includes(normalizedTeam) || away.includes(normalizedTeam);
    });

    saveFixturesCache(teamName, payload);
    setApiCacheEntry(cacheKey, payload);
    return payload;
  } catch (error) {
    if (isRateLimitError(error)) {
      const cached = getCachedFixtures(teamName);
      if (cached?.length) {
        return cached;
      }
      throw new Error('Превышен лимит API (429). Попробуйте снова чуть позже.');
    }

    if ((isRateLimitError(error) || isOffline()) && cachedByKey?.payload) {
      return cachedByKey.payload;
    }
    const cached = getCachedFixtures(teamName);
    if (cached?.length) {
      return cached;
    }
    throw error;
  }
};

export const getPremierLeagueStandings = async () => {
  return cachedRequest(
    'pl.standings',
    async () => {
      const response = await api.get('/standings/2021');
      const rows = response?.data?.standings?.[0]?.table ?? [];
      return rows.map((row) => ({
        position: Number(row.position ?? 0),
        team: row.team?.name || '-',
        crest: row.team?.crest || '',
        played: Number(row.playedGames ?? 0),
        goalsFor: Number(row.goalsFor ?? 0),
        goalsAgainst: Number(row.goalsAgainst ?? 0),
        won: Number(row.won ?? 0),
        draw: Number(row.draw ?? 0),
        lost: Number(row.lost ?? 0),
        goalDiff: Number(row.goalsFor ?? 0) - Number(row.goalsAgainst ?? 0),
        points: Number(row.points ?? 0),
      }));
    },
    2 * 60 * 1000,
  );
};

export const getPremierLeagueTeamOverview = async (teamName) => {
  const normalized = String(teamName || '').toLowerCase();
  const [table, fixtures] = await Promise.all([
    getPremierLeagueStandings(),
    getPremierLeagueFixtures(teamName),
  ]);

  const standing = table.find((row) => String(row.team).toLowerCase().includes(normalized)) || null;
  const fixtureList = Array.isArray(fixtures)
    ? fixtures.slice(0, 6).map(normalizeFixtureObject)
    : [];

  return {
    teamName,
    standing,
    fixtures: fixtureList,
  };
};

export default api;