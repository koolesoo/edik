import axios from 'axios';
import { preferCrest } from '../localCrests';
import { standingMatchRank } from '../teamNames';

/** Полный URL бэкенда (если фронт без прокси). Пример: `http://127.0.0.1:5001/api` — нужен CORS на Flask. */
const envApiBase = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE
  ? String(import.meta.env.VITE_API_BASE).trim().replace(/\/$/, '')
  : '';
const premierLeagueBaseUrl = envApiBase.length > 0 ? envApiBase : '/api';

const api = axios.create({
  // Backend `/api` (Flask): Russian Premier League via LiveScore API proxy.
  baseURL: premierLeagueBaseUrl,
  timeout: 35_000,
});

export const isNetworkFailure = (error) => {
  if (error?.response) return false;
  const code = error?.code;
  const msg = String(error?.message || '').toLowerCase();
  return (
    code === 'ERR_NETWORK'
    || code === 'ECONNREFUSED'
    || msg.includes('network error')
    || msg.includes('failed to fetch')
  );
};

export const describeAxiosError = (error) => {
  if (isNetworkFailure(error)) {
    return 'Нет связи с сервером API. Запустите Flask из корня проекта (python app.py, порт 5001), затем откройте фронт командой npm run dev или npm run preview из папки football-stats. Либо задайте VITE_API_BASE на полный URL до /api.';
  }
  if (error?.code === 'ECONNABORTED' || String(error?.message || '').toLowerCase().includes('timeout')) {
    return 'Превышено время ожидания ответа сервера.';
  }
  const body = error?.response?.data;
  if (typeof body === 'string') return body;
  if (body && typeof body.error === 'string') return body.error;
  if (body && typeof body.message === 'string') return body.message;
  const st = Number(error?.response?.status);
  if (st >= 500) {
    return `Сервер вернул ${st}. Проверьте логи Flask и переменные LIVESCORE_API_KEY / LIVESCORE_API_SECRET (файл .env в корне проекта или export в том же терминале, откуда запускаете python app.py).`;
  }
  return error?.message || 'Ошибка запроса';
};

const FIXTURES_CACHE_KEY = 'footstat.pl.fixtures.cache.v1';
/** v3: сброс кэша после появления URL логотипов (competitions/table + crest в standings). */
const API_CACHE_KEY = 'footstat.api.cache.v3';
/** Default TTL for generic cached entries (keep conservative for daily API budget). */
const API_CACHE_TTL_MS = 60 * 1000;

/** In-flight dedupe: parallel identical keys share one HTTP round-trip. */
const inflightByKey = new Map();

const isRateLimitError = (error) => Number(error?.response?.status) === 429;
/** Ошибки прокси LiveScore / Flask — отдаём кэш при наличии. */
const isBadGateway = (error) => [500, 502, 503].includes(Number(error?.response?.status));
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

  if (inflightByKey.has(key)) {
    return inflightByKey.get(key);
  }

  const promise = (async () => {
    try {
      const payload = await requestFn();
      setApiCacheEntry(key, payload);
      return payload;
    } catch (error) {
      if ((isRateLimitError(error) || isOffline() || isBadGateway(error)) && cached?.payload != null) {
        return cached.payload;
      }
      throw error;
    } finally {
      inflightByKey.delete(key);
    }
  })();

  inflightByKey.set(key, promise);
  return promise;
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

/** Parse `dd.mm.yyyy` / `dd.mm.yyyy hh:mm` or ISO-like string. */
const parseFixtureDisplayOrUtc = (raw) => {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  const dot = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (dot) {
    const d = new Date(
      Number(dot[3]),
      Number(dot[2]) - 1,
      Number(dot[1]),
      dot[4] != null ? Number(dot[4]) : 12,
      dot[5] != null ? Number(dot[5]) : 0,
      0,
      0,
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** «11 мая 15:15» — день и месяц (род. падеж в ru-RU), без года и без запятой перед временем. */
const formatRuFixtureMetaDateTime = (d) => {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  const datePart = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const timePart = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} ${timePart}`;
};

/** Единый формат для подписи даты матча в UI. */
export const formatRuFixtureCardDateTime = (raw) => {
  const d = parseFixtureDisplayOrUtc(raw);
  return d ? formatRuFixtureMetaDateTime(d) : '';
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
    displayDate: dateMatch
      ? (formatRuFixtureCardDateTime(`${dateMatch[1]} ${dateMatch[2]}`) || `${dateMatch[1]} ${dateMatch[2]}`)
      : 'Дата уточняется',
    status,
    homeCrest: '',
    awayCrest: '',
    homeScore: null,
    awayScore: null,
  };
};

const normalizeFixtureObject = (fixture) => {
  if (fixture && typeof fixture === 'object' && !Array.isArray(fixture)) {
    const utcRaw = String(fixture.utcDate || fixture.date || fixture.kickoff || '').trim();
    const homeName = fixture.homeTeam?.name || fixture.homeTeamName || '';
    const awayName = fixture.awayTeam?.name || fixture.awayTeamName || '';
    const homeCrestRaw = fixture.homeTeam?.crest
      || fixture.homeTeam?.logo
      || fixture.homeCrest
      || fixture.homeLogo
      || fixture.homeTeamLogo
      || fixture.home_team_crest
      || '';
    const awayCrestRaw = fixture.awayTeam?.crest
      || fixture.awayTeam?.logo
      || fixture.awayCrest
      || fixture.awayLogo
      || fixture.awayTeamLogo
      || fixture.away_team_crest
      || '';
    const homeCrest = preferCrest(homeName, homeCrestRaw);
    const awayCrest = preferCrest(awayName, awayCrestRaw);
    const displayFromApi = String(fixture.displayDate || fixture.dateLabel || '').trim();
    const displayDate = formatRuFixtureCardDateTime(displayFromApi)
      || formatRuFixtureCardDateTime(utcRaw)
      || displayFromApi
      || '';
    return {
      homeTeamName: homeName,
      awayTeamName: awayName,
      utcDate: utcRaw,
      displayDate,
      status: fixture.status || 'SCHEDULED',
      homeCrest,
      awayCrest,
      homeScore: fixture.score?.fullTime?.home ?? fixture.homeScore ?? null,
      awayScore: fixture.score?.fullTime?.away ?? fixture.awayScore ?? null,
      livescoreMatchId: fixture.livescoreMatchId ?? null,
      fixtureId: fixture.fixtureId ?? null,
    };
  }
  return parseFixtureString(fixture);
};

export const getMatches = async (leagueId, dateFrom, dateTo) => {
  void leagueId;
  const key = `rpl.matches.${dateFrom}.${dateTo}`;
  try {
    return await cachedRequest(
      key,
      async () => {
        const response = await api.get('/livescore/rpl/matches', {
          params: { date: dateFrom },
        });
        if (Array.isArray(response.data)) return response.data;
        return response.data?.matches ?? [];
      },
      10 * 60 * 1000,
    );
  } catch (error) {
    console.error('Ошибка при получении матчей:', error.response?.data || error.message);
    throw new Error(describeAxiosError(error));
  }
};

/** Все live-матчи РПЛ сразу (вкладка Live), без привязки к выбранной команде. */
export const getRplLiveMatches = async () => {
  const key = 'rpl.live.all';
  try {
    return await cachedRequest(
      key,
      async () => {
        const response = await api.get('/livescore/rpl/live');
        if (Array.isArray(response.data)) return response.data;
        return response.data?.matches ?? [];
      },
      10 * 60 * 1000,
    );
  } catch (error) {
    console.error('Ошибка live РПЛ:', error.response?.data || error.message);
    throw new Error(describeAxiosError(error));
  }
};

export const getStandings = async (competitionId) => {
  void competitionId;
  return getPremierLeagueStandings();
};

export const getPremierLeagueTable = async () => {
  return cachedRequest(
    'rpl.table',
    async () => {
      const response = await api.get('/livescore/rpl/standings');
      const rows = response?.data?.standings?.[0]?.table ?? [];
      const header = ['Position', 'Team', 'Played', 'Wins', 'Draws', 'Losses', 'Goal Difference', 'Points'];
      const body = rows.map((row) => {
        const gd = Number(row.goalsFor ?? 0) - Number(row.goalsAgainst ?? 0);
        return `${row.position}. ${row.team?.name || '-'} | ${row.playedGames ?? 0} | ${row.won ?? 0} | ${row.draw ?? 0} | ${row.lost ?? 0} | ${gd} | ${row.points ?? 0}`;
      });
      return [header.join(' | '), ...body];
    },
    10 * 60 * 1000,
  );
};

const inflightFixturesByKey = new Map();

/** Сброс записи в локальном API-кэше (после явного «обновить» в UI). */
export const dropApiCacheKey = (key) => {
  if (!key) return;
  inflightByKey.delete(key);
  try {
    const cache = readApiCache();
    if (cache[key]) {
      delete cache[key];
      writeApiCache(cache);
    }
  } catch {
    // ignore
  }
};

export const dropRplFixturesCache = (teamName) => {
  const cacheKey = `rpl.fixtures.${String(teamName || '').toLowerCase()}`;
  inflightFixturesByKey.delete(cacheKey);
  dropApiCacheKey(cacheKey);
};

export const getPremierLeagueFixtures = async (teamName) => {
  const cacheKey = `rpl.fixtures.${String(teamName || '').toLowerCase()}`;
  const cachedByKey = getApiCacheEntry(cacheKey, 10 * 60 * 1000);
  if (cachedByKey?.isFresh && Array.isArray(cachedByKey.payload)) {
    return cachedByKey.payload;
  }

  if (inflightFixturesByKey.has(cacheKey)) {
    return inflightFixturesByKey.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const response = await api.get('/livescore/rpl/team-matches', {
        params: { team: teamName },
      });
      const payload = response?.data?.matches ?? [];

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

      if ((isRateLimitError(error) || isOffline() || isBadGateway(error)) && cachedByKey?.payload) {
        return cachedByKey.payload;
      }
      const cached = getCachedFixtures(teamName);
      if (cached?.length) {
        return cached;
      }
      if (isNetworkFailure(error)) {
        throw new Error(describeAxiosError(error));
      }
      throw error;
    } finally {
      inflightFixturesByKey.delete(cacheKey);
    }
  })();

  inflightFixturesByKey.set(cacheKey, promise);
  return promise;
};

export const getMatchStatistics = async (matchId) => {
  if (matchId == null || matchId === '') return [];
  const key = `rpl.matchStats.${matchId}`;
  try {
    return await cachedRequest(
      key,
      async () => {
        const response = await api.get('/livescore/rpl/match-stats', {
          params: { match_id: matchId },
        });
        return Array.isArray(response.data?.data) ? response.data.data : [];
      },
      10 * 60 * 1000,
    );
  } catch (error) {
    console.error('Ошибка статистики матча:', error.response?.data || error.message);
    return [];
  }
};

export const getPremierLeagueStandings = async () => {
  try {
    return await cachedRequest(
      'rpl.standings',
      async () => {
        const response = await api.get('/livescore/rpl/standings');
        const rows = response?.data?.standings?.[0]?.table ?? [];
        return rows.map((row) => ({
          position: Number(row.position ?? 0),
          team: row.team?.name || '-',
          crest: preferCrest(row.team?.name || '-', row.team?.crest || row.team?.logo || ''),
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
      10 * 60 * 1000,
    );
  } catch (error) {
    console.error('Ошибка таблицы РПЛ:', error.response?.data || error.message);
    throw new Error(describeAxiosError(error));
  }
};

export const getPremierLeagueTeamOverview = async (teamName) => {
  const normalized = String(teamName || '').toLowerCase();
  const [table, fixtures] = await Promise.all([
    getPremierLeagueStandings(),
    getPremierLeagueFixtures(teamName),
  ]);

  let standing = null;
  let bestRank = -1;
  for (const row of table) {
    const r = standingMatchRank(row.team, teamName);
    if (r > bestRank) {
      bestRank = r;
      standing = row;
    }
  }
  if (bestRank < 0) standing = null;
  let fixtureList = [];
  if (Array.isArray(fixtures) && fixtures.length > 0) {
    const seen = new Set();
    for (const raw of fixtures) {
      const n = normalizeFixtureObject(raw);
      const key = `${n.homeTeamName}|${n.awayTeamName}|${n.displayDate}|${n.status}`;
      if (seen.has(key)) continue;
      seen.add(key);
      fixtureList.push(n);
      if (fixtureList.length >= 6) break;
    }
  }

  return {
    teamName,
    standing,
    fixtures: fixtureList,
  };
};

export default api;