/** Локальный каталог турниров/команд/матчей и ручная статистика (только для админ-UI). Без HTTP. */

const CATALOG_KEY = 'footstat.admin.catalog.v1';

export const LOCAL_MATCH_PREFIX = 'loc_';

export const isLocalMatchId = (matchId) =>
  matchId != null && String(matchId).startsWith(LOCAL_MATCH_PREFIX);

const newId = (prefix) =>
  `${prefix}${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`}`;

const emptyCatalog = () => ({
  tournaments: [],
  teams: [],
  matches: [],
  matchStatsByMatchId: {},
});

export const readCatalog = () => {
  try {
    if (typeof localStorage === 'undefined') return emptyCatalog();
    const raw = localStorage.getItem(CATALOG_KEY);
    if (!raw) return emptyCatalog();
    const p = JSON.parse(raw);
    return {
      tournaments: Array.isArray(p.tournaments) ? p.tournaments : [],
      teams: Array.isArray(p.teams) ? p.teams : [],
      matches: Array.isArray(p.matches) ? p.matches : [],
      matchStatsByMatchId:
        p.matchStatsByMatchId && typeof p.matchStatsByMatchId === 'object' ? p.matchStatsByMatchId : {},
    };
  } catch {
    return emptyCatalog();
  }
};

const writeCatalog = (cat) => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(CATALOG_KEY, JSON.stringify(cat));
};

/** Форма статистики совпадает с ключами MatchStatsPage DISPLAY_STATS. */
export const emptyStatBundle = () => ({
  possession: { home: 50, away: 50 },
  shots: { home: 0, away: 0 },
  on_target: { home: 0, away: 0 },
  corners: { home: 0, away: 0 },
  offsides: { home: 0, away: 0 },
  fouls: { home: 0, away: 0 },
});

/**
 * Строки в формате, который понимает classifyStatKey / buildDisplayStatsFromApi.
 * @param {string} matchId
 * @returns {Array<{ type?: string, label?: string, home?: number, away?: number }>}
 */
export const getMatchStatisticsApiRows = (matchId) => {
  const cat = readCatalog();
  const raw = cat.matchStatsByMatchId[String(matchId)];
  if (!raw || typeof raw !== 'object') return [];

  const num = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const p = raw.possession || {};
  const shots = raw.shots || {};
  const ot = raw.on_target || {};
  const cor = raw.corners || {};
  const off = raw.offsides || {};
  const fouls = raw.fouls || {};

  return [
    { type: 'Ball possession', label: 'Possession', home: num(p.home, 50), away: num(p.away, 50) },
    { type: 'Total shots', label: 'Shots', home: num(shots.home), away: num(shots.away) },
    { type: 'Attempts on goal', label: 'On target', home: num(ot.home), away: num(ot.away) },
    { type: 'Corner kicks', label: 'Corners', home: num(cor.home), away: num(cor.away) },
    { type: 'Offsides', label: 'Offsides', home: num(off.home), away: num(off.away) },
    { type: 'Fouls', label: 'Fouls', home: num(fouls.home), away: num(fouls.away) },
  ];
};

export const listTournaments = () => readCatalog().tournaments.slice();

export const addTournament = (name) => {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('Укажите название турнира');
  const cat = readCatalog();
  const id = newId('tourn_');
  cat.tournaments.push({
    id,
    name: clean,
    createdAt: new Date().toISOString(),
  });
  writeCatalog(cat);
  return id;
};

export const deleteTournament = (tournamentId) => {
  const cat = readCatalog();
  const tid = String(tournamentId);
  cat.tournaments = cat.tournaments.filter((t) => t.id !== tid);
  const removedMatchIds = cat.matches.filter((m) => m.tournamentId === tid).map((m) => m.id);
  cat.teams = cat.teams.filter((tm) => tm.tournamentId !== tid);
  cat.matches = cat.matches.filter((m) => m.tournamentId !== tid);
  for (const mid of removedMatchIds) {
    delete cat.matchStatsByMatchId[mid];
  }
  writeCatalog(cat);
};

export const listTeams = (tournamentId) => {
  const tid = String(tournamentId || '');
  return readCatalog().teams.filter((t) => t.tournamentId === tid);
};

export const addTeam = (tournamentId, name, crestUrl = '') => {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Укажите название команды');
  const tid = String(tournamentId || '');
  const cat = readCatalog();
  if (!cat.tournaments.some((t) => t.id === tid)) throw new Error('Турнир не найден');
  const id = newId('team_');
  cat.teams.push({
    id,
    tournamentId: tid,
    name: cleanName,
    crestUrl: String(crestUrl || '').trim(),
  });
  writeCatalog(cat);
  return id;
};

export const deleteTeam = (teamId) => {
  const cat = readCatalog();
  const tid = String(teamId);
  cat.teams = cat.teams.filter((t) => t.id !== tid);
  const removedMatchIds = cat.matches
    .filter((m) => m.homeTeamId === tid || m.awayTeamId === tid)
    .map((m) => m.id);
  cat.matches = cat.matches.filter((m) => m.homeTeamId !== tid && m.awayTeamId !== tid);
  for (const mid of removedMatchIds) {
    delete cat.matchStatsByMatchId[mid];
  }
  writeCatalog(cat);
};

export const listMatches = (tournamentId) => {
  const tid = String(tournamentId || '');
  return readCatalog().matches.filter((m) => m.tournamentId === tid);
};

export const addMatch = ({
  tournamentId,
  homeTeamId,
  awayTeamId,
  homeScore = 0,
  awayScore = 0,
  utcDate,
  status = 'FINISHED',
}) => {
  const tid = String(tournamentId || '');
  const h = String(homeTeamId || '');
  const a = String(awayTeamId || '');
  if (!tid || !h || !a) throw new Error('Выберите турнир и обе команды');
  if (h === a) throw new Error('Команды должны различаться');
  const cat = readCatalog();
  if (!cat.tournaments.some((t) => t.id === tid)) throw new Error('Турнир не найден');
  const teamsIn = cat.teams.filter((t) => t.tournamentId === tid);
  if (!teamsIn.some((t) => t.id === h) || !teamsIn.some((t) => t.id === a)) {
    throw new Error('Обе команды должны принадлежать выбранному турниру');
  }
  const id = newId(LOCAL_MATCH_PREFIX);
  const iso =
    utcDate && String(utcDate).trim() ? String(utcDate).trim() : new Date().toISOString();
  cat.matches.push({
    id,
    tournamentId: tid,
    homeTeamId: h,
    awayTeamId: a,
    homeScore: Number(homeScore) || 0,
    awayScore: Number(awayScore) || 0,
    utcDate: iso,
    status: String(status || 'FINISHED').toUpperCase(),
  });
  writeCatalog(cat);
  return id;
};

export const deleteMatch = (matchId) => {
  const cat = readCatalog();
  const mid = String(matchId);
  cat.matches = cat.matches.filter((m) => m.id !== mid);
  delete cat.matchStatsByMatchId[mid];
  writeCatalog(cat);
};

export const getMatchStats = (matchId) => {
  const cat = readCatalog();
  const raw = cat.matchStatsByMatchId[String(matchId)];
  if (!raw || typeof raw !== 'object') return null;
  return { ...emptyStatBundle(), ...raw };
};

export const setMatchStats = (matchId, bundle) => {
  const mid = String(matchId);
  const cat = readCatalog();
  if (!cat.matches.some((m) => m.id === mid)) throw new Error('Матч не найден');
  const base = emptyStatBundle();
  const next = { ...base, ...bundle };
  cat.matchStatsByMatchId[mid] = next;
  writeCatalog(cat);
};

export const getTeamById = (teamId) => readCatalog().teams.find((t) => t.id === teamId) || null;

export const getMatchById = (matchId) => readCatalog().matches.find((m) => m.id === matchId) || null;

export const getTournamentById = (tournamentId) =>
  readCatalog().tournaments.find((t) => t.id === String(tournamentId)) || null;

const isoDayFromUtc = (raw) => {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
};

/**
 * Сырые объекты матчей в формате, который понимает parseFixture на LiveScoresPage.
 * @param {string} isoDate YYYY-MM-DD
 */
export const getAdminFixtureObjectsForIsoDate = (isoDate) => {
  const target = String(isoDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) return [];
  const cat = readCatalog();
  const out = [];
  for (const m of cat.matches) {
    if (isoDayFromUtc(m.utcDate) !== target) continue;
    const tourn = cat.tournaments.find((t) => t.id === m.tournamentId);
    const home = cat.teams.find((t) => t.id === m.homeTeamId);
    const away = cat.teams.find((t) => t.id === m.awayTeamId);
    if (!home || !away) continue;
    out.push({
      homeTeamName: home.name,
      awayTeamName: away.name,
      homeTeam: { name: home.name, crest: home.crestUrl || '' },
      awayTeam: { name: away.name, crest: away.crestUrl || '' },
      utcDate: m.utcDate,
      status: m.status,
      score: {
        fullTime: {
          home: Number(m.homeScore) || 0,
          away: Number(m.awayScore) || 0,
        },
      },
      livescoreMatchId: m.id,
      fixtureId: m.id,
      sourceAdmin: true,
      adminTournamentId: m.tournamentId,
      adminTournamentName: tourn?.name || 'Локальный турнир',
    });
  }
  return out;
};

/** Для Live-ленты: «идёт», «перерыв» и сегодняшние завершённые локальные матчи. */
export const getAdminFixtureObjectsLive = () => {
  const today = isoDayFromUtc(new Date().toISOString());
  const cat = readCatalog();
  const out = [];
  for (const m of cat.matches) {
    const st = String(m.status || '').toUpperCase();
    const day = isoDayFromUtc(m.utcDate);
    if (st === 'IN_PLAY' || st === 'PAUSED') {
      // include always
    } else if (st === 'FINISHED' && day === today) {
      // recent finished same day
    } else {
      continue;
    }
    const tourn = cat.tournaments.find((t) => t.id === m.tournamentId);
    const home = cat.teams.find((t) => t.id === m.homeTeamId);
    const away = cat.teams.find((t) => t.id === m.awayTeamId);
    if (!home || !away) continue;
    out.push({
      homeTeamName: home.name,
      awayTeamName: away.name,
      homeTeam: { name: home.name, crest: home.crestUrl || '' },
      awayTeam: { name: away.name, crest: away.crestUrl || '' },
      utcDate: m.utcDate,
      status: m.status,
      score: {
        fullTime: {
          home: Number(m.homeScore) || 0,
          away: Number(m.awayScore) || 0,
        },
      },
      livescoreMatchId: m.id,
      fixtureId: m.id,
      sourceAdmin: true,
      adminTournamentId: m.tournamentId,
      adminTournamentName: tourn?.name || 'Локальный турнир',
    });
  }
  return out;
};

/**
 * Таблица турнира по завершённым матчам (3-1-0). Формат как у getPremierLeagueStandings.
 */
export const getStandingsRowsForTournament = (tournamentId) => {
  const tid = String(tournamentId || '');
  const teams = listTeams(tid);
  const stats = {};
  for (const t of teams) {
    stats[t.id] = {
      team: t.name,
      crest: t.crestUrl || '',
      played: 0,
      won: 0,
      draw: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      points: 0,
    };
  }
  const matches = listMatches(tid).filter((m) => String(m.status || '').toUpperCase() === 'FINISHED');
  for (const m of matches) {
    const sh = stats[m.homeTeamId];
    const sa = stats[m.awayTeamId];
    if (!sh || !sa) continue;
    const hs = Number(m.homeScore) || 0;
    const as = Number(m.awayScore) || 0;
    sh.played += 1;
    sa.played += 1;
    sh.gf += hs;
    sh.ga += as;
    sa.gf += as;
    sa.ga += hs;
    if (hs > as) {
      sh.won += 1;
      sa.lost += 1;
      sh.points += 3;
    } else if (hs < as) {
      sa.won += 1;
      sh.lost += 1;
      sa.points += 3;
    } else {
      sh.draw += 1;
      sa.draw += 1;
      sh.points += 1;
      sa.points += 1;
    }
  }
  const rows = teams.map((t) => {
    const s = stats[t.id];
    return {
      position: 0,
      team: s.team,
      crest: s.crest,
      played: s.played,
      goalsFor: s.gf,
      goalsAgainst: s.ga,
      won: s.won,
      draw: s.draw,
      lost: s.lost,
      goalDiff: s.gf - s.ga,
      points: s.points,
    };
  });
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return String(a.team).localeCompare(String(b.team), 'ru');
  });
  rows.forEach((r, i) => {
    r.position = i + 1;
  });
  return rows;
};
