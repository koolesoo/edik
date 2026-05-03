import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCrestMap } from '../context/CrestContext';
import { useEffectWhenVisible } from '../hooks/useEffectWhenVisible';
import { ProfileTeamOverviewSkeleton } from '../components/DataSkeletons';
import {
  describeAxiosError,
  dropApiCacheKey,
  dropRplFixturesCache,
  formatRuFixtureCardDateTime,
  getPremierLeagueStandings,
  getPremierLeagueTeamOverview,
} from '../services/api';
import { preferCrest } from '../localCrests';
import { translateTeamName, RPL_TEAM_PICKER_DEFAULTS, teamMatchesFavorite } from '../teamNames';

const RPL_BALL_ICON_URL = 'https://cdn.premierliga.ru/resources/images/icons/match/ball.svg';

const normalizeTeamKey = (name) => String(name || '')
  .toLowerCase()
  .replace(/\bfc\b/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const PROFILE_OVERVIEW_CACHE_PREFIX = 'footstat.profileTeamOverview.v1';

const profileOverviewStorageKey = (username, favoriteTeam) => {
  const u = normalizeTeamKey(String(username || ''));
  const t = normalizeTeamKey(favoriteTeam);
  return `${PROFILE_OVERVIEW_CACHE_PREFIX}:${u}:${t}`;
};

function readProfileOverviewCache(username, favoriteTeam) {
  try {
    const raw = localStorage.getItem(profileOverviewStorageKey(username, favoriteTeam));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    if (normalizeTeamKey(data.teamName) !== normalizeTeamKey(favoriteTeam)) return null;
    return data;
  } catch {
    return null;
  }
}

function writeProfileOverviewCache(username, favoriteTeam, overview) {
  if (!String(username || '').trim() || !String(favoriteTeam || '').trim() || !overview) return;
  try {
    localStorage.setItem(profileOverviewStorageKey(username, favoriteTeam), JSON.stringify(overview));
  } catch {
    /* квота / приватный режим */
  }
}

const getCrestForTeamName = (teamName, crestByTeam = {}) => {
  if (!teamName) return '';
  let fromMap = crestByTeam[teamName];
  if (!fromMap) {
    const normalizedTarget = normalizeTeamKey(teamName);
    const matchedEntry = Object.entries(crestByTeam).find(([key]) => normalizeTeamKey(key) === normalizedTarget);
    fromMap = matchedEntry?.[1] || '';
  }
  return preferCrest(teamName, fromMap);
};

const formatProfileFixtureDate = (line) => {
  const d0 = line?.displayDate && String(line.displayDate).trim();
  if (d0) {
    const f = formatRuFixtureCardDateTime(d0);
    if (f) return f;
  }
  const raw = line?.utcDate || line?.date;
  if (raw) {
    const f = formatRuFixtureCardDateTime(raw);
    if (f) return f;
  }
  if (d0) return d0;
  return 'Дата уточняется';
};

const SwapTeamGlyph = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
    <path
      d="M8 7h12M8 7l4-4M8 7l4 4M16 17H4m12 0-4 4m4-4-4-4"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TrashGlyph = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
    <path
      d="M3 6h18M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2m2 0v14a2 2 0 01-2 2H8a2 2 0 01-2-2V6h12zM10 11v6M14 11v6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const VenueHomeGlyph = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true" className="profile-fixture-venue-icon">
    <path
      d="M4 10.5 12 4l8 6.5V20a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1v-9.5z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
    />
  </svg>
);

const VenueAwayGlyph = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true" className="profile-fixture-venue-icon">
    <path d="M5 17.5L18.5 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path
      d="M11.2 12.3L15 20M10 10.5L6 7.5M5 17.5l-2 2.5M5 17.5l-1-3M5 17.5l-3-0.5"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const profileFixtureKey = (f) => {
  const h = f.homeTeamName || f.homeTeam?.name || '';
  const a = f.awayTeamName || f.awayTeam?.name || '';
  return `${h}|${a}|${f.utcDate || ''}|${f.displayDate || ''}`;
};

const profileFixtureKickoffMs = (f) => {
  const raw = String(f.utcDate || f.date || '').trim();
  if (raw) {
    const t = new Date(raw).getTime();
    if (!Number.isNaN(t)) return t;
  }
  const d = String(f.displayDate || '').trim();
  if (d) {
    const t2 = Date.parse(d);
    if (!Number.isNaN(t2)) return t2;
  }
  return null;
};

const profileFixtureScores = (f) => {
  const h = f.homeScore ?? f.score?.fullTime?.home;
  const a = f.awayScore ?? f.score?.fullTime?.away;
  const hn = h == null ? NaN : Number(h);
  const an = a == null ? NaN : Number(a);
  return { hn, an };
};

/** Сыгранный матч: явный статус «завершён» или есть счёт и дата уже в прошлом (на случай других кодов API). */
const isProfilePastResultFixture = (f) => {
  const s = String(f.status || '').toUpperCase().replace(/\s+/g, '_');
  if (['FINISHED', 'FT', 'FULL_TIME', 'MATCH_FINISHED', 'COMPLETED', 'ENDED', 'PLAYED', 'RESULT', 'CLOSED'].includes(s)) {
    return true;
  }
  const { hn, an } = profileFixtureScores(f);
  if (!Number.isFinite(hn) || !Number.isFinite(an)) return false;
  const kt = profileFixtureKickoffMs(f);
  if (kt == null) return false;
  return kt < Date.now();
};

const parseFixtureLine = (line, crestByTeam = {}) => {
  if (line && typeof line === 'object' && !Array.isArray(line)) {
    const home = line.homeTeamName || line.homeTeam?.name || 'Home';
    const away = line.awayTeamName || line.awayTeam?.name || 'Away';
    return {
      teams: `${home} vs ${away}`,
      date: formatProfileFixtureDate(line),
      status: line.status || 'SCHEDULED',
      homeTeamName: home,
      awayTeamName: away,
      homeCrest: line.homeCrest || getCrestForTeamName(home, crestByTeam) || '',
      awayCrest: line.awayCrest || getCrestForTeamName(away, crestByTeam) || '',
      homeScore: line.homeScore ?? line.score?.fullTime?.home ?? null,
      awayScore: line.awayScore ?? line.score?.fullTime?.away ?? null,
    };
  }

  const text = String(line || '');
  const dateMatch = text.match(/(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})/);
  const statusMatch = text.match(/\[([A-Z_]+)\]\s*$/);
  const cleaned = text.replace(/\s*\[[A-Z_]+\]\s*$/, '');
  const teams = dateMatch?.index != null ? cleaned.slice(0, dateMatch.index).trim() : cleaned.trim();
  return {
    teams: teams || 'Матч',
    date: dateMatch
      ? (formatRuFixtureCardDateTime(`${dateMatch[1]} ${dateMatch[2]}`) || `${dateMatch[1]} ${dateMatch[2]}`)
      : 'Дата уточняется',
    status: statusMatch?.[1] || 'SCHEDULED',
    homeTeamName: teams.split(/\s+vs\s+/i)[0] || 'Home',
    awayTeamName: teams.split(/\s+vs\s+/i)[1] || 'Away',
    homeCrest: getCrestForTeamName(teams.split(/\s+vs\s+/i)[0], crestByTeam) || '',
    awayCrest: getCrestForTeamName(teams.split(/\s+vs\s+/i)[1], crestByTeam) || '',
    homeScore: null,
    awayScore: null,
  };
};

const ProfilePage = () => {
  const { currentUser, isAuthenticated, setFavoriteTeamForCurrentUser } = useAuth();
  const [teamOverview, setTeamOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState('');
  const { crestByTeam, mergeStandingsRows, rplStandingsTeamOrder } = useCrestMap();
  const [pendingFavoriteTeam, setPendingFavoriteTeam] = useState('');
  const navigate = useNavigate();
  const [isDeleteSheetOpen, setIsDeleteSheetOpen] = useState(false);
  const [isChangeFavoriteOpen, setIsChangeFavoriteOpen] = useState(false);
  const [changeFavoriteSelection, setChangeFavoriteSelection] = useState('');

  const clearFavoriteTeam = () => {
    const u = currentUser?.username;
    const fav = String(currentUser?.favoriteTeam || '').trim();
    if (u && fav) {
      try {
        localStorage.removeItem(profileOverviewStorageKey(u, fav));
      } catch {
        /* ignore */
      }
    }
    setFavoriteTeamForCurrentUser('');
    setTeamOverview(null);
    setOverviewLoading(false);
    setOverviewError('');
    setIsDeleteSheetOpen(false);
  };

  const teamOptions = useMemo(() => {
    if (rplStandingsTeamOrder.length > 0) {
      const labels = rplStandingsTeamOrder.map((api) => translateTeamName(api) || api);
      return [...new Set(labels)].sort((a, b) => a.localeCompare(b, 'ru'));
    }
    const seen = new Map();
    for (const name of RPL_TEAM_PICKER_DEFAULTS) {
      const ru = translateTeamName(name) || name;
      const k = ru.toLowerCase();
      if (!seen.has(k)) seen.set(k, ru);
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b, 'ru'));
  }, [rplStandingsTeamOrder]);

  useEffect(() => {
    if (!isAuthenticated || currentUser?.favoriteTeam) return;
    if (!teamOptions.length) return;
    if (pendingFavoriteTeam && teamOptions.includes(pendingFavoriteTeam)) return;
    setPendingFavoriteTeam(teamOptions[0]);
  }, [isAuthenticated, currentUser?.favoriteTeam, teamOptions, pendingFavoriteTeam]);

  const applyFavoriteTeam = () => {
    if (!pendingFavoriteTeam) return;
    setFavoriteTeamForCurrentUser(pendingFavoriteTeam);
  };

  const openChangeFavoriteSheet = () => {
    const cur = translateTeamName(currentUser?.favoriteTeam) || String(currentUser?.favoriteTeam || '').trim();
    const next = teamOptions.includes(cur) ? cur : (teamOptions[0] || '');
    setChangeFavoriteSelection(next);
    setIsChangeFavoriteOpen(true);
  };

  const applyChangeFavoriteTeam = () => {
    if (!changeFavoriteSelection) return;
    const cur = translateTeamName(currentUser?.favoriteTeam) || String(currentUser?.favoriteTeam || '').trim();
    if (changeFavoriteSelection === cur) {
      setIsChangeFavoriteOpen(false);
      return;
    }
    setFavoriteTeamForCurrentUser(changeFavoriteSelection);
    setIsChangeFavoriteOpen(false);
  };

  /** Сброс только при выходе или смене клуба (не при каждом повторном запросе). */
  useLayoutEffect(() => {
    if (!isAuthenticated) {
      setTeamOverview(null);
      return;
    }
    const fav = String(currentUser?.favoriteTeam || '').trim();
    const ov = String(teamOverview?.teamName || '').trim();
    if (fav && ov && normalizeTeamKey(fav) !== normalizeTeamKey(ov)) {
      setTeamOverview(null);
    }
  }, [isAuthenticated, currentUser?.favoriteTeam, teamOverview?.teamName]);

  /** Последний успешный обзор из localStorage — сразу при открытии и пока идёт новый запрос. */
  useEffect(() => {
    if (!isAuthenticated || !currentUser?.username) return;
    const fav = String(currentUser.favoriteTeam || '').trim();
    if (!fav) return;
    const cached = readProfileOverviewCache(currentUser.username, fav);
    if (!cached) return;
    setTeamOverview((prev) => {
      if (prev && normalizeTeamKey(prev.teamName) === normalizeTeamKey(fav)) return prev;
      return cached;
    });
  }, [isAuthenticated, currentUser?.username, currentUser?.favoriteTeam]);

  const handleRefresh = useCallback(async (opts = {}) => {
    if (!isAuthenticated) return;
    const force = Boolean(opts.force);
    if (force) {
      dropApiCacheKey('rpl.standings');
      if (currentUser?.favoriteTeam) {
        dropRplFixturesCache(currentUser.favoriteTeam);
      }
    }
    setOverviewLoading(true);
    setOverviewError('');
    try {
      const standings = await getPremierLeagueStandings();
      if (Array.isArray(standings)) {
        mergeStandingsRows(standings);
      }
      if (currentUser?.favoriteTeam) {
        const data = await getPremierLeagueTeamOverview(currentUser.favoriteTeam);
        setTeamOverview(data);
        writeProfileOverviewCache(currentUser.username, currentUser.favoriteTeam, data);
      } else {
        setTeamOverview(null);
      }
    } catch (error) {
      setOverviewError(describeAxiosError(error) || 'Не удалось загрузить данные');
    } finally {
      setOverviewLoading(false);
    }
  }, [currentUser?.favoriteTeam, currentUser?.username, isAuthenticated, mergeStandingsRows]);

  useEffectWhenVisible(() => {
    if (!isAuthenticated) return;
    void handleRefresh();
  }, [isAuthenticated, currentUser?.favoriteTeam, handleRefresh]);

  const displayOverview = isAuthenticated ? teamOverview : null;
  const hasFavoriteTeam = Boolean(currentUser?.favoriteTeam);
  const showProfileOverviewSkeleton = Boolean(
    hasFavoriteTeam && overviewLoading && !teamOverview,
  );
  const profileHeroCrest = useMemo(
    () =>
      preferCrest(
        displayOverview?.standing?.team || displayOverview?.teamName || '',
        displayOverview?.standing?.crest || '',
      ),
    [
      displayOverview?.standing?.team,
      displayOverview?.standing?.crest,
      displayOverview?.teamName,
    ],
  );

  const { lastMatchFixture, upcomingFixtures } = useMemo(() => {
    const list = Array.isArray(displayOverview?.fixtures) ? displayOverview.fixtures : [];
    const pastResults = list.filter(isProfilePastResultFixture);
    let last = null;
    if (pastResults.length) {
      last = [...pastResults].sort((a, b) => {
        const ta = profileFixtureKickoffMs(a) ?? 0;
        const tb = profileFixtureKickoffMs(b) ?? 0;
        return tb - ta;
      })[0];
    }
    const lastKey = last ? profileFixtureKey(last) : '';
    const upcoming = list.filter((f) => {
      if (isProfilePastResultFixture(f)) return false;
      const k = profileFixtureKey(f);
      if (lastKey && k === lastKey) return false;
      const s = String(f.status || '').toUpperCase();
      return ['SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED', 'LIVE', 'DELAYED'].includes(s);
    });
    return { lastMatchFixture: last, upcomingFixtures: upcoming };
  }, [displayOverview?.fixtures]);

  /** До двух матчей в одной строке: последний + ближайший, или два ближайших без последнего. */
  const profileFixturesLayout = useMemo(() => {
    let topRow = [];
    let restUpcoming = [];
    let pairLabels = null;
    if (lastMatchFixture) {
      topRow = [{ fixture: lastMatchFixture, key: 'last' }];
      if (upcomingFixtures[0]) {
        topRow.push({ fixture: upcomingFixtures[0], key: 'up-next' });
        restUpcoming = upcomingFixtures.slice(1);
        pairLabels = ['Последний', 'Ближайшие матчи'];
      }
    } else if (upcomingFixtures.length > 0) {
      topRow = [{ fixture: upcomingFixtures[0], key: 'up0' }];
      if (upcomingFixtures[1]) {
        topRow.push({ fixture: upcomingFixtures[1], key: 'up1' });
        restUpcoming = upcomingFixtures.slice(2);
        pairLabels = ['Ближайшие матчи'];
      }
    }
    return { topRow, restUpcoming, pairLabels };
  }, [lastMatchFixture, upcomingFixtures]);

  const renderProfileFixtureCard = (fixture, index, cardKey = '') => {
    const parsed = parseFixtureLine(fixture, crestByTeam);
    const raw = fixture && typeof fixture === 'object' && !Array.isArray(fixture) ? fixture : {};
    const utcRaw = String(raw.utcDate || raw.date || '').trim();
    const kickoffMs = utcRaw ? new Date(utcRaw) : null;
    const kickoffValid = kickoffMs && !Number.isNaN(kickoffMs.getTime());
    const kickoffIso = kickoffValid ? kickoffMs.toISOString() : '';
    const centerDateTime = parsed.date && parsed.date !== 'Дата уточняется' ? parsed.date : '—';
    const homeDisplayName = translateTeamName(parsed.homeTeamName || 'Home') || parsed.homeTeamName || 'Home';
    const awayDisplayName = translateTeamName(parsed.awayTeamName || 'Away') || parsed.awayTeamName || 'Away';
    const homeShort = String(homeDisplayName || 'HM')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
    const awayShort = String(awayDisplayName || 'AW')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
    const homeScoreNum = Number(parsed.homeScore);
    const awayScoreNum = Number(parsed.awayScore);
    const hasNumericScore = Number.isFinite(homeScoreNum) && Number.isFinite(awayScoreNum);
    const homeWon = hasNumericScore ? homeScoreNum > awayScoreNum : false;
    const awayWon = hasNumericScore ? awayScoreNum > homeScoreNum : false;
    const livescoreMatchId = raw.livescoreMatchId ?? raw.fixtureId ?? null;
    const favoriteRaw = displayOverview?.standing?.team
      || displayOverview?.teamName
      || currentUser?.favoriteTeam
      || '';
    const isUserHome = teamMatchesFavorite(parsed.homeTeamName, favoriteRaw);
    const isUserAway = teamMatchesFavorite(parsed.awayTeamName, favoriteRaw);
    const profileOpponentMode = (isUserHome || isUserAway) && !(isUserHome && isUserAway);
    const atHomeVenue = profileOpponentMode && isUserHome;
    const opponentDisplayName = profileOpponentMode
      ? (isUserHome ? awayDisplayName : homeDisplayName)
      : '';
    const opponentCrest = profileOpponentMode
      ? (isUserHome ? parsed.awayCrest : parsed.homeCrest)
      : '';
    const opponentShort = String(opponentDisplayName || 'FC')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
    const openStats = () => {
      if (!livescoreMatchId) return;
      navigate('/match-stats', {
        state: {
          match: {
            homeTeam: parsed.homeTeamName,
            awayTeam: parsed.awayTeamName,
            homeCrest: parsed.homeCrest,
            awayCrest: parsed.awayCrest,
            homeScore: parsed.homeScore,
            awayScore: parsed.awayScore,
            utcDate: raw.utcDate || '',
            date: raw.displayDate || parsed.date,
            status: parsed.status,
            livescoreMatchId,
            fixtureId: raw.fixtureId ?? null,
          },
          returnMode: 'results',
        },
      });
    };
    const clickable = Boolean(livescoreMatchId);
    const cardAria = profileOpponentMode
      ? `Открыть статистику матча против ${opponentDisplayName}, ${atHomeVenue ? 'дома' : 'в гостях'}, ${centerDateTime}`
      : (clickable ? `Открыть статистику матча ${homeDisplayName} — ${awayDisplayName}` : undefined);
    const liKey = `${parsed.homeTeamName}-${parsed.awayTeamName}-${parsed.date}-${index}-${cardKey || 'card'}`;
    return (
      <li
        className="fixture-list-item fixture-list-item--profile"
        key={liKey}
      >
        <div
          className={`fixture-match-card fixture-match-card--profile${clickable ? ' fixture-match-card--clickable' : ''}`}
          role={clickable ? 'button' : undefined}
          tabIndex={clickable ? 0 : undefined}
          onClick={clickable ? openStats : undefined}
          onKeyDown={
            clickable
              ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openStats();
                }
              }
              : undefined
          }
          aria-label={cardAria}
        >
          {profileOpponentMode ? (
            <div className="profile-fixture-card-body">
              <div className="match-stats-emblem fixture-card-emblem profile-fixture-opponent-crest">
                {opponentCrest ? (
                  <img src={opponentCrest} alt="" className="match-stats-emblem-img" loading="lazy" />
                ) : (
                  <span className="match-stats-emblem-fallback" aria-hidden="true">
                    {opponentShort || 'FC'}
                  </span>
                )}
              </div>
              <div className="profile-fixture-card-text">
                <span className="profile-fixture-opponent-label">Соперник</span>
                <span className="profile-fixture-opponent-name">{opponentDisplayName}</span>
                <div className="profile-fixture-meta-row">
                  <time className="profile-fixture-kickoff profile-fixture-kickoff--row" dateTime={kickoffIso || undefined}>
                    {centerDateTime}
                  </time>
                </div>
                <div className="profile-fixture-venue-row">
                  <span className={`profile-fixture-venue-pill ${atHomeVenue ? 'profile-fixture-venue-pill--home' : 'profile-fixture-venue-pill--away'}`}>
                    {atHomeVenue ? <VenueHomeGlyph /> : <VenueAwayGlyph />}
                    <span>{atHomeVenue ? 'Дома' : 'В гостях'}</span>
                  </span>
                </div>
              </div>
            </div>
          ) : (
          <div className="match-stats-scoreboard fixture-card-scoreboard fixture-card-scoreboard--league-rows">
            <div className="match-stats-emblem fixture-card-emblem fixture-card-emblem--home">
              {parsed.homeCrest ? (
                <img src={parsed.homeCrest} alt="" className="match-stats-emblem-img" loading="lazy" />
              ) : (
                <span className="match-stats-emblem-fallback" aria-hidden="true">
                  {homeShort || 'HM'}
                </span>
              )}
            </div>
            <div className="fixture-card-center-stack">
              <div
                className="match-stats-score-mid fixture-card-score-mid fixture-card-score-mid--profile"
                aria-label="Дата и время матча"
              >
                <time className="profile-fixture-kickoff" dateTime={kickoffIso || undefined}>
                  {centerDateTime}
                </time>
              </div>
            </div>
            <div className="match-stats-emblem fixture-card-emblem fixture-card-emblem--away">
              {parsed.awayCrest ? (
                <img src={parsed.awayCrest} alt="" className="match-stats-emblem-img" loading="lazy" />
              ) : (
                <span className="match-stats-emblem-fallback" aria-hidden="true">
                  {awayShort || 'AW'}
                </span>
              )}
            </div>
            <span
              className={`match-stats-abbr fixture-card-abbr--home ${homeWon ? 'fixture-card-abbr--strong' : ''} ${awayWon ? 'fixture-card-abbr--muted' : ''}`}
            >
              {homeDisplayName}
            </span>
            <span
              className={`match-stats-abbr fixture-card-abbr--away ${awayWon ? 'fixture-card-abbr--strong' : ''} ${homeWon ? 'fixture-card-abbr--muted' : ''}`}
            >
              {awayDisplayName}
            </span>
          </div>
          )}
        </div>
      </li>
    );
  };

  return (
    <motion.main
      className="page page--hero-bleed"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <section className="page-hero">
        <div className="page-hero-card">
          <Link to="/account" className="profile-hero-sheet" aria-label="Открыть профиль">
            <div className="profile-hero-sheet-row">
              <span className="profile-hero-avatar" aria-hidden="true">
                <img
                  className="profile-hero-ball-img"
                  src={RPL_BALL_ICON_URL}
                  alt=""
                  width={28}
                  height={28}
                  loading="eager"
                  decoding="async"
                />
              </span>
              <div className="profile-hero-sheet-text">
                <span className="profile-hero-name">
                  {isAuthenticated ? (currentUser.displayName || currentUser.username) : 'Профиль'}
                </span>
                <span className="profile-hero-edit-label">Редактировать</span>
              </div>
            </div>
          </Link>
        </div>
      </section>
      {!isAuthenticated ? (
        <section className="section-surface section-surface--plain profile-after-hero">
          <div className="profile-empty-state">
            <p className="body-lg">
              Авторизуйтесь в экране профиля, чтобы привязать любимый клуб и видеть его матчи.
            </p>
            <Link to="/matches" className="pill-btn pill-btn--secondary profile-empty-state-cta">
              Перейти к матчам
            </Link>
          </div>
        </section>
      ) : null}
      {isAuthenticated ? (
      <section
        className="section-surface section-surface--team-feature"
        aria-busy={hasFavoriteTeam && overviewLoading}
      >
        {overviewError ? (
          <p className="body-lg action-message" role="alert" style={{ marginBottom: 12 }}>
            {overviewError}
          </p>
        ) : null}
        {hasFavoriteTeam ? (
          <>
            <div className="preview-head">
              <div className="preview-team-main">
                {profileHeroCrest ? (
                  <img
                    className="profile-team-logo-lg"
                    src={profileHeroCrest}
                    alt={displayOverview?.teamName || currentUser?.favoriteTeam || 'Team'}
                  />
                ) : (
                  <div className="profile-team-logo-lg profile-team-logo-lg--fallback" aria-hidden="true">
                    {(displayOverview?.teamName || currentUser?.favoriteTeam || 'FC').slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="preview-team-main-text">
                  <h3 className="headline-md">{translateTeamName(displayOverview?.teamName || currentUser?.favoriteTeam || 'Любимая команда')}</h3>
                  {!showProfileOverviewSkeleton && displayOverview?.standing ? (
                    <Link
                      to={`/tables?team=${encodeURIComponent(String(displayOverview.standing.team || ''))}`}
                      className="profile-to-standings-link"
                      aria-label="Открыть таблицу турнира на строке этой команды"
                    >
                      <span>К таблице</span>
                      <span className="profile-to-standings-chevron" aria-hidden="true">›</span>
                    </Link>
                  ) : null}
                </div>
              </div>
              <div className="preview-head-actions">
                <button
                  type="button"
                  className="profile-fav-icon-btn profile-fav-icon-btn--change"
                  onClick={openChangeFavoriteSheet}
                  aria-label="Сменить любимую команду"
                  title="Сменить команду"
                >
                  <SwapTeamGlyph />
                </button>
                <button
                  type="button"
                  className="profile-fav-icon-btn profile-fav-icon-btn--remove"
                  onClick={() => setIsDeleteSheetOpen(true)}
                  aria-label="Удалить любимую команду из профиля"
                  title="Удалить из профиля"
                >
                  <TrashGlyph />
                </button>
              </div>
            </div>
            {showProfileOverviewSkeleton ? (
              <ProfileTeamOverviewSkeleton />
            ) : (
              <>
                {displayOverview?.standing ? (
                  <>
                    <div className="team-overview-grid">
                      <div className="team-stat-pill">
                        <span className="label-md">Позиция</span>
                        <p className="title-sm">{displayOverview.standing.position}</p>
                      </div>
                      <div className="team-stat-pill">
                        <span className="label-md">Очки</span>
                        <p className="title-sm">{displayOverview.standing.points}</p>
                      </div>
                      <div className="team-stat-pill">
                        <span className="label-md">Матчи</span>
                        <p className="title-sm">{displayOverview.standing.played}</p>
                      </div>
                      <div className="team-stat-pill">
                        <span className="label-md">Разница мячей</span>
                        <p className="title-sm">{displayOverview.standing.goalDiff}</p>
                      </div>
                      <div className="team-stat-pill">
                        <span className="label-md">Победы / Ничьи / Поражения</span>
                        <p className="title-sm">
                          {displayOverview.standing.won} / {displayOverview.standing.draw} / {displayOverview.standing.lost}
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="body-lg profile-team-placeholder">Данные о позиции команды пока недоступны</p>
                )}
                <div className="profile-fixtures">
                  {profileFixturesLayout.topRow.length === 0 ? (
                    <p className="body-lg profile-team-placeholder">
                      Нет данных по матчам команды
                    </p>
                  ) : (
                    <>
                      {profileFixturesLayout.pairLabels?.length === 2 ? (
                        <div className="profile-fixtures-pair-head">
                          <p className="title-sm">{profileFixturesLayout.pairLabels[0]}</p>
                          <p className="title-sm">{profileFixturesLayout.pairLabels[1]}</p>
                        </div>
                      ) : profileFixturesLayout.pairLabels?.length === 1 ? (
                        <p className="title-sm profile-fixtures-pair-title-full">
                          {profileFixturesLayout.pairLabels[0]}
                        </p>
                      ) : (
                        <p className="title-sm">
                          {lastMatchFixture && profileFixturesLayout.topRow[0]?.key === 'last'
                            ? 'Последний матч'
                            : 'Ближайшие матчи'}
                        </p>
                      )}
                      <ul
                        className={
                          profileFixturesLayout.topRow.length === 2
                            ? 'fixture-list fixture-list--profile-pair'
                            : 'fixture-list'
                        }
                      >
                        {profileFixturesLayout.topRow.map(({ fixture: f, key: k }, i) => (
                          renderProfileFixtureCard(f, i, k)
                        ))}
                      </ul>
                      {profileFixturesLayout.restUpcoming.length > 0 ? (
                        <>
                          <p className="title-sm profile-fixtures-subtitle">Ещё в календаре</p>
                          <ul className="fixture-list">
                            {profileFixturesLayout.restUpcoming.map((fixture, index) => (
                              renderProfileFixtureCard(fixture, index + 2, `more-${index}`)
                            ))}
                          </ul>
                        </>
                      ) : null}
                      {lastMatchFixture && upcomingFixtures.length === 0 ? (
                        <p className="body-lg profile-team-placeholder">Нет запланированных матчей в выборке</p>
                      ) : null}
                    </>
                  )}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="profile-empty-state">
            <p className="body-lg">
              Выберите любимую команду прямо здесь, чтобы видеть ее матчи и статистику.
            </p>
            <div className="profile-team-picker">
              <select
                id="profileFavoriteTeamSelect"
                className="select-control"
                value={pendingFavoriteTeam}
                onChange={(event) => setPendingFavoriteTeam(event.target.value)}
                aria-label="Выбор любимой команды"
              >
                {teamOptions.map((team) => (
                  <option key={team} value={team}>
                    {translateTeamName(team)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="pill-btn pill-btn--primary profile-empty-state-cta"
                onClick={applyFavoriteTeam}
                disabled={!pendingFavoriteTeam}
              >
                Сохранить команду
              </button>
            </div>
          </div>
        )}
      </section>
      ) : null}
      {!hasFavoriteTeam ? (
        <section className="section-surface page-lists-shell">
          <p className="body-lg">
            Как это работает: выберите любимую команду в профиле. Здесь же можно поменять выбор
            в любой момент — команда сразу появится в профиле со статистикой и ближайшими матчами.
          </p>
        </section>
      ) : null}
      {isChangeFavoriteOpen ? (
        <div className="sheet-backdrop" role="presentation" onClick={() => setIsChangeFavoriteOpen(false)}>
          <section
            className="bottom-sheet section-surface"
            role="dialog"
            aria-modal="true"
            aria-label="Смена любимой команды"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="headline-md">Другая команда</p>
            <select
              id="profileChangeFavoriteSelect"
              className="select-control"
              value={changeFavoriteSelection}
              onChange={(event) => setChangeFavoriteSelection(event.target.value)}
              aria-label="Новая любимая команда"
            >
              {teamOptions.map((team) => (
                <option key={team} value={team}>
                  {translateTeamName(team)}
                </option>
              ))}
            </select>
            <div className="bottom-sheet-actions">
              <button type="button" className="pill-btn pill-btn--secondary" onClick={() => setIsChangeFavoriteOpen(false)}>
                Отмена
              </button>
              <button
                type="button"
                className="pill-btn pill-btn--primary"
                onClick={applyChangeFavoriteTeam}
                disabled={
                  !changeFavoriteSelection
                  || changeFavoriteSelection
                    === (translateTeamName(currentUser?.favoriteTeam) || String(currentUser?.favoriteTeam || '').trim())
                }
              >
                Сменить
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {isDeleteSheetOpen ? (
        <div className="sheet-backdrop" role="presentation" onClick={() => setIsDeleteSheetOpen(false)}>
          <section
            className="bottom-sheet section-surface"
            role="dialog"
            aria-modal="true"
            aria-label="Подтверждение удаления команды"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="headline-md">Удалить из профиля?</p>
            <p className="body-lg">Любимая команда будет убрана. Позже можно выбрать ее снова в матчах.</p>
            <div className="bottom-sheet-actions">
              <button type="button" className="pill-btn pill-btn--secondary" onClick={() => setIsDeleteSheetOpen(false)}>
                Отмена
              </button>
              <button type="button" className="pill-btn pill-btn--primary" onClick={clearFavoriteTeam}>
                Удалить
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </motion.main>
  );
};

export default ProfilePage;