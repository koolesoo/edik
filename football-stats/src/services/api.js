import axios from 'axios';

const footballDataBaseUrl = import.meta.env.VITE_FOOTBALL_DATA_API_BASE_URL || '/api';
const premierLeagueBaseUrl = import.meta.env.VITE_PREMIER_LEAGUE_API_BASE_URL || 'http://127.0.0.1:5000';

const api = axios.create({
  baseURL: footballDataBaseUrl,
  headers: {
    'X-Auth-Token': import.meta.env.VITE_FOOTBALL_DATA_API_KEY,
  },
});

const premierLeagueApi = axios.create({
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

const formatFixtureLine = (match) => {
  const home = match?.homeTeam?.name || 'Home';
  const away = match?.awayTeam?.name || 'Away';
  const date = new Date(match?.utcDate || Date.now());
  const datePart = date.toLocaleDateString('ru-RU');
  const timePart = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const status = match?.status ? ` [${match.status}]` : '';
  return `${home} vs ${away} ${datePart} ${timePart}${status}`;
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

const normalizeTableRows = (rows) => rows.map((row) => ({
  position: row.position,
  team: row.team?.name || '-',
  crest: row.team?.crest || '',
  played: row.playedGames,
  goalsFor: row.goalsFor ?? null,
  goalsAgainst: row.goalsAgainst ?? null,
  won: row.won,
  draw: row.draw,
  lost: row.lost,
  goalDiff: (row.goalsFor ?? 0) - (row.goalsAgainst ?? 0),
  points: row.points,
}));

export const getCompetitions = async () => {
  return cachedRequest(
    'competitions',
    async () => {
      const response = await api.get('/competitions');
      return response.data.competitions ?? [];
    },
    5 * 60 * 1000,
  );
};

export const getTeams = async () => {
  const response = await api.get('/teams');
  return response.data.teams ?? [];
};

export const getGroupedTeams = async () => {
  return [];
};

export const getMatches = async (leagueId, dateFrom, dateTo) => {
  try {
    const params = {};
    if (dateFrom) {
      params.dateFrom = dateFrom;
    }
    if (dateTo) {
      params.dateTo = dateTo;
    }

    const response = await api.get(`/competitions/${leagueId}/matches`, {
      params,
    });
    return response.data.matches ?? [];
  } catch (error) {
    console.error('Ошибка при получении матчей:', error.response?.data || error.message);
    throw error;
  }
};

export const getStandings = async (competitionId) => {
  const response = await api.get(`/competitions/${competitionId}/standings`);
  return response.data;
};

export const getPremierLeagueTable = async () => {
  return cachedRequest(
    'pl.table',
    async () => {
      try {
        const response = await premierLeagueApi.get('/table');
        return response.data;
      } catch (error) {
        // Fallback to football-data.org if PL API is unavailable.
        const response = await api.get('/competitions/PL/standings');
        const rows = response?.data?.standings?.[0]?.table ?? [];
        const header = ['Position', 'Team', 'Played', 'Wins', 'Draws', 'Losses', 'Goal Difference', 'Points'];
        const body = rows.map((row) => {
          const gd = (row.goalsFor ?? 0) - (row.goalsAgainst ?? 0);
          return `${row.position}. ${row.team.name} | ${row.playedGames} | ${row.won} | ${row.draw} | ${row.lost} | ${gd} | ${row.points}`;
        });
        return [header.join(' | '), ...body];
      }
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
    const response = await premierLeagueApi.get(`/fixtures/${encodeURIComponent(teamName)}`);
    const payload = Array.isArray(response.data) ? response.data : [];
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

    // Fallback: take nearby PL fixtures and filter by team name.
    try {
      const today = new Date();
      const from = new Date(today);
      from.setDate(today.getDate() - 3);
      const to = new Date(today);
      to.setDate(today.getDate() + 14);
      const dateFrom = from.toISOString().split('T')[0];
      const dateTo = to.toISOString().split('T')[0];

      const response = await api.get('/competitions/PL/matches', { params: { dateFrom, dateTo } });
      let matches = response.data.matches ?? [];
      if (!matches.length) {
        // If the date window is empty, request season data without date bounds.
        const seasonResponse = await api.get('/competitions/PL/matches');
        matches = seasonResponse.data.matches ?? [];
      }
      const normalizedTeam = String(teamName || '').toLowerCase();
      const filtered = matches.filter((match) => {
        const home = (match?.homeTeam?.name || '').toLowerCase();
        const away = (match?.awayTeam?.name || '').toLowerCase();
        return home.includes(normalizedTeam) || away.includes(normalizedTeam);
      });

      const list = filtered.length ? filtered : matches;
      const payload = list.slice(0, 8).map(formatFixtureLine);
      saveFixturesCache(teamName, payload);
      setApiCacheEntry(cacheKey, payload);
      return payload;
    } catch (fallbackError) {
      if ((isRateLimitError(fallbackError) || isOffline()) && cachedByKey?.payload) {
        return cachedByKey.payload;
      }
      const cached = getCachedFixtures(teamName);
      if (cached?.length) {
        return cached;
      }
      if (isRateLimitError(fallbackError)) {
        throw new Error('Превышен лимит API (429). Попробуйте снова чуть позже.');
      }
      throw fallbackError;
    }
  }
};

export const getPremierLeagueStandings = async () => {
  return cachedRequest(
    'pl.standings',
    async () => {
      try {
        const response = await api.get('/competitions/PL/standings');
        const rows = response?.data?.standings?.[0]?.table ?? [];
        return normalizeTableRows(rows);
      } catch (error) {
        const fallback = await getPremierLeagueTable();
        if (!Array.isArray(fallback)) {
          return [];
        }
        return fallback
          .filter((row, index) => !(index === 0 && String(row).toLowerCase().includes('position')))
          .map((row) => {
            const [positionAndTeam, played, won, draw, lost, goalDiff, points] = String(row)
              .split('|')
              .map((part) => part.trim());
            const positionMatch = positionAndTeam.match(/^(\d+)\.\s*(.*)$/);
            return {
              position: Number(positionMatch?.[1] || 0),
              team: positionMatch?.[2] || positionAndTeam || '-',
              crest: '',
              played: Number(played || 0),
              goalsFor: null,
              goalsAgainst: null,
              won: Number(won || 0),
              draw: Number(draw || 0),
              lost: Number(lost || 0),
              goalDiff: Number(goalDiff || 0),
              points: Number(points || 0),
            };
          });
      }
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