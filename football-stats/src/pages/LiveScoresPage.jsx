import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCrestMap } from '../context/CrestContext';
import {
  describeAxiosError,
  dropApiCacheKey,
  getMatches,
  getPremierLeagueStandings,
  getRplLiveMatches,
} from '../services/api';
import ApiLastUpdatedChip from '../components/ApiLastUpdatedChip';
import { FixtureListSkeleton } from '../components/DataSkeletons';
import RplHeroPanel from '../components/RplHeroPanel';
import { formatDateLongRuMsk, formatDateTimeLineRuMsk, formatMskClockHms, formatTimeShortRuMsk } from '../dateTimeMsk';
import { useEffectWhenVisible } from '../hooks/useEffectWhenVisible';
import { preferCrest } from '../localCrests';
import { translateTeamName, RPL_TEAM_PICKER_DEFAULTS } from '../teamNames';
import {
  getAdminFixtureObjectsForIsoDate,
  getAdminFixtureObjectsLive,
  listTournaments,
} from '../services/adminCatalog';

const RESULTS_DAY_RADIUS = 14;
const FIXTURES_CACHE_PREFIX = 'footstat:fixtures:';

const toIsoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildDateCarousel = (centerIsoDate, dayRadius = RESULTS_DAY_RADIUS) => {
  const center = new Date(`${centerIsoDate}T12:00:00`);
  if (Number.isNaN(center.getTime())) {
    const today = new Date();
    return [toIsoDate(today)];
  }
  return Array.from({ length: dayRadius * 2 + 1 }, (_, index) => {
    const date = new Date(center);
    date.setDate(center.getDate() + index - dayRadius);
    return toIsoDate(date);
  });
};

const formatCarouselDate = (isoDate) => {
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
};

const formatCarouselTopLabel = (isoDate, todayIsoDate) => {
  if (isoDate === todayIsoDate) return 'Сегодня';
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const weekday = date.toLocaleDateString('ru-RU', { weekday: 'short' });
  return weekday.slice(0, 2).replace('.', '');
};

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const addMonths = (date, delta) => new Date(date.getFullYear(), date.getMonth() + delta, 1);
const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const buildCalendarDays = (monthDate) => {
  const first = startOfMonth(monthDate);
  const startWeekday = (first.getDay() + 6) % 7; // Monday-first
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - startWeekday);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
};

const isRateLimitError = (error) => {
  const status = error?.response?.status;
  if (status === 429) return true;
  const message = String(error?.message || '').toLowerCase();
  return message.includes('429') || message.includes('rate limit');
};

const parseFixture = (fixture, crestByTeam = {}, options = {}) => {
  if (fixture && typeof fixture === 'object' && !Array.isArray(fixture)) {
    const homeName = fixture.homeTeam?.name || fixture.homeTeamName || '';
    const awayName = fixture.awayTeam?.name || fixture.awayTeamName || '';
    const status = fixture.status || 'SCHEDULED';
    const fallbackDayIso = String(options.fallbackDayIso || '').trim();

    const tryParseMs = (raw) => {
      if (raw == null || raw === '') return null;
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    let dateRaw = fixture.utcDate
      || fixture.date
      || fixture.kickoff
      || fixture.matchDate
      || fixture.startTime
      || fixture.datetime
      || '';
    let parsedDate = tryParseMs(dateRaw);

    if (!parsedDate && fallbackDayIso && /^\d{4}-\d{2}-\d{2}$/.test(fallbackDayIso)) {
      const tm = String(fixture.time || fixture.scheduled || '').trim();
      let synthetic = '';
      if (/^\d{1,2}:\d{2}/.test(tm)) {
        const tNorm = tm.length === 5 && tm.indexOf(':') === tm.lastIndexOf(':') ? `${tm}:00` : tm;
        synthetic = `${fallbackDayIso}T${tNorm}Z`;
      } else {
        synthetic = `${fallbackDayIso}T12:00:00Z`;
      }
      const dTry = tryParseMs(synthetic);
      if (dTry) {
        parsedDate = dTry;
        dateRaw = synthetic;
      }
    }

    const isValidDate = Boolean(parsedDate);
    const date = isValidDate
      ? formatDateTimeLineRuMsk(parsedDate)
      : (fixture.dateLabel || 'Дата уточняется');
    const dateOnly = isValidDate
      ? formatDateLongRuMsk(parsedDate)
      : (() => {
          const dl = String(fixture.dateLabel || '').trim();
          if (!dl) return 'Дата уточняется';
          return dl.replace(/\s+\d{1,2}:\d{2}([.,]\d+)?(\s+|$).*/, '').trim() || dl;
        })();
    const kickoffTime = isValidDate
      ? formatTimeShortRuMsk(parsedDate)
      : '--:--';
    const utcRaw = isValidDate ? (fixture.utcDate || dateRaw) : (fixture.utcDate || dateRaw || '');

    return {
      teams: `${homeName || 'Home'} vs ${awayName || 'Away'}`,
      homeTeam: homeName,
      awayTeam: awayName,
      homeCrest: preferCrest(
        homeName,
        fixture.homeTeam?.crest || fixture.homeCrest || crestByTeam[homeName] || '',
      ),
      awayCrest: preferCrest(
        awayName,
        fixture.awayTeam?.crest || fixture.awayCrest || crestByTeam[awayName] || '',
      ),
      homeScore: fixture.score?.fullTime?.home,
      awayScore: fixture.score?.fullTime?.away,
      date,
      dateOnly,
      utcDate: utcRaw,
      kickoffTime,
      status,
      livescoreMatchId: fixture.livescoreMatchId ?? null,
      fixtureId: fixture.fixtureId ?? null,
      sourceAdmin: Boolean(fixture.sourceAdmin),
      adminTournamentId:
        fixture.adminTournamentId != null ? String(fixture.adminTournamentId) : '',
      adminTournamentName: String(fixture.adminTournamentName || ''),
    };
  }

  const text = String(fixture || '');
  const dateMatch = text.match(/(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})/);
  const statusMatch = text.match(/\[([A-Z_]+)\]\s*$/);
  const status = statusMatch ? statusMatch[1] : '';

  let teamsPart = text;
  if (dateMatch?.index != null) {
    teamsPart = text.slice(0, dateMatch.index).trim();
  }
  teamsPart = teamsPart.replace(/\[[A-Z_]+\]\s*$/, '').trim();

  const [homeTeam = '', awayTeam = ''] = teamsPart.split(/\s+vs\s+/i);

  const dateOnlyFromDdMmYyyy = (ddMmYyyy) => {
    const m = String(ddMmYyyy || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return ddMmYyyy || 'Дата уточняется';
    const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0);
    if (Number.isNaN(dt.getTime())) return ddMmYyyy;
    return dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return {
    teams: teamsPart,
    homeTeam: homeTeam.trim(),
    awayTeam: awayTeam.trim(),
    homeCrest: preferCrest(homeTeam.trim(), crestByTeam[homeTeam.trim()] || ''),
    awayCrest: preferCrest(awayTeam.trim(), crestByTeam[awayTeam.trim()] || ''),
    homeScore: null,
    awayScore: null,
    date: dateMatch ? `${dateMatch[1]} ${dateMatch[2]}` : 'Дата уточняется',
    dateOnly: dateMatch ? dateOnlyFromDdMmYyyy(dateMatch[1]) : 'Дата уточняется',
    kickoffTime: dateMatch?.[2] || '--:--',
    status: status || 'SCHEDULED',
    utcDate: '',
    livescoreMatchId: null,
    fixtureId: null,
    sourceAdmin: false,
    adminTournamentId: '',
    adminTournamentName: '',
  };
};

/** Плашка статуса в том же стиле, что и экран статистики матча */
const STATUS_PILL_LABELS = {
  FINISHED: 'ЗАВЕРШЁН',
  IN_PLAY: 'LIVE',
  PAUSED: 'ПЕРЕРЫВ',
  TIMED: 'ПО РАСПИСАНИЮ',
  SCHEDULED: 'СКОРО',
};

const normalizeFixturesPayload = (payload) => {
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => {
      if (typeof item === 'string') {
        return [item];
      }
      if (Array.isArray(item)) {
        return item.filter((v) => typeof v === 'string' || (v && typeof v === 'object'));
      }
      if (item && typeof item === 'object') {
        if (item.homeTeam || item.awayTeam || item.homeTeamName || item.awayTeamName) {
          return [item];
        }
        return Object.values(item).filter((v) => typeof v === 'string' || (v && typeof v === 'object'));
      }
      return [];
    });
  }
  if (payload && typeof payload === 'object') {
    if (payload.homeTeam || payload.awayTeam || payload.homeTeamName || payload.awayTeamName) {
      return [payload];
    }
    return Object.values(payload).filter((v) => typeof v === 'string' || (v && typeof v === 'object'));
  }
  return [];
};

const LiveScoresPage = ({ mode = 'results' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, currentUser, setFavoriteTeamForCurrentUser } = useAuth();
  const [fixtures, setFixtures] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(
    () => location.state?.selectedTeam || RPL_TEAM_PICKER_DEFAULTS[0],
  );
  const [selectedDate, setSelectedDate] = useState(() => location.state?.selectedDate || toIsoDate(new Date()));
  const [lastUpdated, setLastUpdated] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [actionMessage, setActionMessage] = useState('');
  const { crestByTeam, mergeStandingsRows } = useCrestMap();
  const dateCarouselRef = useRef(null);
  const fixturesRef = useRef([]);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [gamesSource, setGamesSource] = useState('rpl');
  const [adminTournaments, setAdminTournaments] = useState([]);
  const liveStatuses = new Set(['IN_PLAY', 'PAUSED']);
  const isLiveMode = mode === 'live';
  const cacheKey = isLiveMode
    ? `${FIXTURES_CACHE_PREFIX}live:all`
    : `${FIXTURES_CACHE_PREFIX}results:${selectedDate}`;

  useEffect(() => {
    fixturesRef.current = fixtures;
  }, [fixtures]);

  useEffect(() => {
    setAdminTournaments(listTournaments());
  }, []);

  useEffect(() => {
    if (gamesSource !== 'rpl' && !adminTournaments.some((t) => t.id === gamesSource)) {
      setGamesSource('rpl');
    }
  }, [adminTournaments, gamesSource]);

  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || '[]');
      const apiOnly = Array.isArray(cached) ? cached.filter((row) => row && !row.sourceAdmin) : [];
      const adminExtra = isLiveMode ? getAdminFixtureObjectsLive() : getAdminFixtureObjectsForIsoDate(selectedDate);
      setFixtures([...apiOnly, ...adminExtra]);
    } catch (_) {
      setFixtures([]);
    }
  }, [cacheKey, isLiveMode, selectedDate]);

  const handleRefresh = useCallback(async (opts = {}) => {
    const force = Boolean(opts.force);
    try {
      if (force) {
        dropApiCacheKey('rpl.standings');
        if (isLiveMode) {
          dropApiCacheKey('rpl.live.all');
        } else {
          dropApiCacheKey(`rpl.matches.${selectedDate}.${selectedDate}`);
        }
      }
      setIsRefreshing(true);
      setError(null);
      const standings = await getPremierLeagueStandings();
      if (Array.isArray(standings)) {
        mergeStandingsRows(standings);
      }
      const data = isLiveMode
        ? await getRplLiveMatches()
        : await getMatches(0, selectedDate, selectedDate);
      const apiNormalized = normalizeFixturesPayload(data);
      const adminExtra = isLiveMode ? getAdminFixtureObjectsLive() : getAdminFixtureObjectsForIsoDate(selectedDate);
      const merged = [...apiNormalized, ...adminExtra];
      setFixtures(merged);
      setLastUpdated(formatMskClockHms());
      setError(null);
      setActionMessage('');
      try {
        localStorage.setItem(cacheKey, JSON.stringify(apiNormalized));
      } catch (_) {
        // Ignore storage failures.
      }
    } catch (err) {
      const is429 = isRateLimitError(err);
      if (is429) {
        let cached = [];
        try {
          cached = JSON.parse(localStorage.getItem(cacheKey) || '[]');
        } catch (_) {
          cached = [];
        }
        if (Array.isArray(cached) && cached.length > 0) {
          const apiOnly = cached.filter((row) => row && !row.sourceAdmin);
          const adminExtra = isLiveMode ? getAdminFixtureObjectsLive() : getAdminFixtureObjectsForIsoDate(selectedDate);
          setFixtures([...apiOnly, ...adminExtra]);
        }
        setError(null);
        setActionMessage('Показываем кэшированные данные.');
      } else if (fixturesRef.current.length > 0) {
        setError(null);
        setActionMessage('Показываем последние сохраненные данные.');
      } else {
        setError(describeAxiosError(err) || err.message || 'Не удалось загрузить матчи');
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [cacheKey, isLiveMode, mergeStandingsRows, selectedDate]);

  useEffectWhenVisible(() => {
    setAdminTournaments(listTournaments());
    void handleRefresh();
  }, [cacheKey, handleRefresh]);

  const renderTeamInline = (teamName, crest, isLiked, onLike, score, align = 'left') => {
    const safeName = teamName || 'Team';
    const displayName = translateTeamName(safeName) || safeName;
    const shortName = safeName
      .split(' ')
      .filter(Boolean)
      .slice(0, 3)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 3);

    return (
      <span className={`fixture-team-inline fixture-team-inline--${align}`}>
        <button
          type="button"
          className={`fixture-like-dot ${isLiked ? 'fixture-like-dot--active' : ''}`}
          onClick={onLike}
          disabled={!teamName}
          aria-label={`Лайк ${displayName}`}
        >
          {isLiked ? '♥' : '♡'}
        </button>
        {crest ? <img src={crest} alt={displayName} className="fixture-team-logo" loading="lazy" /> : (
          <span className="fixture-team-logo fixture-team-logo--fallback" aria-hidden="true">
            {shortName || safeName.slice(0, 3).toUpperCase()}
          </span>
        )}
        <span className="fixture-team-name">{displayName}</span>
        <span className="fixture-team-score">{score ?? '-'}</span>
      </span>
    );
  };

  const isUpcomingFixture = (status) => status === 'SCHEDULED' || status === 'TIMED';

  const handleLikeTeam = (teamName) => {
    if (!teamName) return;
    if (!isAuthenticated) {
      setActionMessage('Чтобы сохранить любимую команду, войдите в профиль.');
      navigate('/profile');
      return;
    }
    setFavoriteTeamForCurrentUser(teamName);
    setActionMessage(`Команда ${translateTeamName(teamName)} сохранена в профиль ${currentUser.username}.`);
  };

  const openMatchStats = (match) => {
    navigate('/match-stats', {
      state: {
        match,
        returnMode: mode,
        selectedDate,
        selectedTeam,
      },
    });
  };

  const parseOpts = !isLiveMode && selectedDate
    ? { fallbackDayIso: selectedDate }
    : isLiveMode
      ? { fallbackDayIso: toIsoDate(new Date()) }
      : {};
  const parsedFixtures = fixtures.map((fixture) => parseFixture(fixture, crestByTeam, parseOpts));
  // Live-лента с API уже отфильтрована провайдером; показываем и FINISHED (ещё в ленте ~3 ч).
  const displayFixtures = isLiveMode
    ? parsedFixtures.filter((fixture) =>
      liveStatuses.has(fixture.status) || fixture.status === 'FINISHED',
    )
    : parsedFixtures;
  const rplParsed = displayFixtures.filter((p) => !p.sourceAdmin);
  const adminParsed = displayFixtures.filter((p) => p.sourceAdmin);
  const adminGrouped = useMemo(() => {
    const map = new Map();
    for (const p of adminParsed) {
      const tid = String(p.adminTournamentId || '_');
      const label = String(p.adminTournamentName || 'Турнир').trim() || 'Турнир';
      if (!map.has(tid)) map.set(tid, { tid, label, fixtures: [] });
      map.get(tid).fixtures.push(p);
    }
    return Array.from(map.values());
  }, [adminParsed]);
  const visibleRplParsed = gamesSource === 'rpl' ? rplParsed : [];
  /** Только выбранный сегмент: РПЛ — только API; турнир админа — только его матчи */
  const visibleAdminGrouped =
    gamesSource === 'rpl'
      ? []
      : adminGrouped.filter((g) => g.tid === String(gamesSource));
  const hasVisibleFixtures =
    visibleRplParsed.length > 0 || visibleAdminGrouped.some((g) => g.fixtures.length > 0);
  const showFixtureSkeleton = isRefreshing && displayFixtures.length === 0 && !error;

  const renderFixtureCard = (parsed, index, rowKey) => {
    const homeScoreNum = Number(parsed.homeScore);
    const awayScoreNum = Number(parsed.awayScore);
    const hasNumericScore = Number.isFinite(homeScoreNum) && Number.isFinite(awayScoreNum);
    const homeWon = hasNumericScore ? homeScoreNum > awayScoreNum : false;
    const awayWon = hasNumericScore ? awayScoreNum > homeScoreNum : false;
    const homeDisplayName = translateTeamName(parsed.homeTeam || 'Home');
    const awayDisplayName = translateTeamName(parsed.awayTeam || 'Away');
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
    const rawStatus = String(parsed.status || 'TIMED').toUpperCase();
    const statusPill = STATUS_PILL_LABELS[rawStatus] || rawStatus;
    const dateDisplay = (() => {
      if (parsed.kickoffTime && parsed.kickoffTime !== '--:--') return parsed.kickoffTime;
      if (parsed.dateOnly && parsed.dateOnly !== 'Дата уточняется') return parsed.dateOnly;
      if (parsed.date && parsed.date !== 'Дата уточняется') return parsed.date;
      return '—';
    })();
    const kickoffIso = (() => {
      const raw = parsed.utcDate;
      if (!raw) return '';
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? '' : d.toISOString();
    })();
    return (
      <motion.div
        key={rowKey}
        className={`match-row${parsed.sourceAdmin ? ' match-row--admin-fixture' : ''}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30, delay: index * 0.2 }}
      >
        <div
          className="fixture-match-card fixture-match-card--clickable"
          role="button"
          tabIndex={0}
          onClick={() => openMatchStats(parsed)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openMatchStats(parsed);
            }
          }}
          aria-label={`Открыть статистику матча ${homeDisplayName} — ${awayDisplayName}`}
        >
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
              <div className="match-stats-score-mid fixture-card-score-mid" aria-label="Счёт">
                <span className="match-stats-score-num">
                  {parsed.homeScore ?? '-'}
                  {' '}
                  :
                  {' '}
                  {parsed.awayScore ?? '-'}
                </span>
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
            <div className="fixture-card-status-slot">
              <time className="match-stats-datetime fixture-card-datetime fixture-card-datetime--by-status" dateTime={kickoffIso || undefined}>
                {dateDisplay}
              </time>
              <span
                className={`match-stats-status-pill ${rawStatus === 'FINISHED' ? 'match-stats-status-pill--finished' : ''}`}
              >
                {statusPill}
              </span>
            </div>
            <span
              className={`match-stats-abbr fixture-card-abbr--away ${awayWon ? 'fixture-card-abbr--strong' : ''} ${homeWon ? 'fixture-card-abbr--muted' : ''}`}
            >
              {awayDisplayName}
            </span>
          </div>
        </div>
      </motion.div>
    );
  };
  const carouselDates = buildDateCarousel(selectedDate);
  const todayIsoDate = toIsoDate(new Date());
  const selectedDateObj = new Date(`${selectedDate}T12:00:00`);
  const calendarDays = buildCalendarDays(calendarMonth);
  const calendarWeekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const monthLabel = calendarMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });

  useEffect(() => {
    if (isLiveMode) return;
    const container = dateCarouselRef.current;
    if (!container) return;
    const activeIndex = carouselDates.indexOf(selectedDate);
    if (activeIndex < 0) return;
    const activeNode = container.children[activeIndex];
    if (!(activeNode instanceof HTMLElement)) return;
    // Keep the selected date as the first visible item while preserving
    // the ability to scroll back to previous dates.
    container.scrollTo({ left: activeNode.offsetLeft, behavior: 'smooth' });
  }, [selectedDate, carouselDates, isLiveMode]);

  return (
    <motion.main
      className="page page--hero-bleed"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <section className="page-hero">
        <div className="page-hero-card">
          <RplHeroPanel title={isLiveMode ? 'Live-матчи' : 'Игры'}>
            {gamesSource === 'rpl' ? (
              <ApiLastUpdatedChip
                timeLabel={lastUpdated}
                onRefresh={() => void handleRefresh({ force: true })}
                isRefreshing={isRefreshing}
              />
            ) : (
              <span className="body-lg tables-local-chip">Локальный турнир</span>
            )}
          </RplHeroPanel>
          {adminTournaments.length > 0 ? (
            <div className="tables-source-toggle" role="tablist" aria-label="Источник расписания">
              <button
                type="button"
                className={`segmented-btn ${gamesSource === 'rpl' ? 'segmented-btn--active' : ''}`}
                onClick={() => setGamesSource('rpl')}
              >
                РПЛ
              </button>
              {adminTournaments.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`segmented-btn ${gamesSource === t.id ? 'segmented-btn--active' : ''}`}
                  onClick={() => setGamesSource(t.id)}
                >
                  {t.name}
                </button>
              ))}
            </div>
          ) : null}
          {error ? (
            <p className="body-lg action-message" role="alert">
              Ошибка: {error}
            </p>
          ) : null}
          {!isLiveMode ? (
            <div className="date-carousel-wrap">
              <div className="date-carousel-row">
                <div className="date-carousel" role="tablist" aria-label="Выбор даты" ref={dateCarouselRef}>
                  {carouselDates.map((isoDate) => (
                    <button
                      key={isoDate}
                      type="button"
                      className={`date-pill ${selectedDate === isoDate ? 'date-pill--active' : ''}`}
                      onClick={() => setSelectedDate(isoDate)}
                    >
                      <span className="date-pill-top">{formatCarouselTopLabel(isoDate, todayIsoDate)}</span>
                      <span className="date-pill-main">{formatCarouselDate(isoDate)}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="calendar-icon-btn floating-surface"
                  aria-label="Выбрать дату в календаре"
                  onClick={() => {
                    const selected = new Date(`${selectedDate}T12:00:00`);
                    if (!Number.isNaN(selected.getTime())) {
                      setCalendarMonth(startOfMonth(selected));
                    }
                    setIsCalendarOpen(true);
                  }}
                >
                  <span className="calendar-icon" aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : null}
          {actionMessage ? (
            <p className="body-lg action-message">{actionMessage}</p>
          ) : null}
        </div>
      </section>
      <section className="matches-grid" aria-busy={showFixtureSkeleton}>
        {showFixtureSkeleton ? (
          <FixtureListSkeleton rows={isLiveMode ? 4 : 6} />
        ) : null}
        {!showFixtureSkeleton && hasVisibleFixtures ? (
          <>
            {visibleRplParsed.map((parsed, index) => renderFixtureCard(parsed, index, `rpl-${parsed.livescoreMatchId || parsed.teams}-${index}`))}
            {visibleAdminGrouped.map((group) => (
              <React.Fragment key={group.tid}>
                {group.fixtures.map((parsed, index) =>
                  renderFixtureCard(
                    parsed,
                    index,
                    `adm-${group.tid}-${parsed.livescoreMatchId || parsed.teams}-${index}`,
                  ),
                )}
              </React.Fragment>
            ))}
          </>
        ) : !showFixtureSkeleton ? (
          <div className="empty-state-card">
            <p className="headline-md">Матчей пока нет</p>
            <p className="body-lg">
              {isLiveMode
                ? 'Сейчас нет идущих матчей — зайдите позже'
                : gamesSource !== 'rpl'
                  ? 'На выбранный день в этом турнире матчей нет — выберите другую дату или источник РПЛ.'
                  : 'На выбранный день матчей нет – выберите другую дату'}
            </p>
          </div>
        ) : null}
      </section>
      {isCalendarOpen ? (
        <div className="sheet-backdrop" role="presentation" onClick={() => setIsCalendarOpen(false)}>
          <section
            className="bottom-sheet section-surface calendar-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Выбор даты"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="calendar-sheet-head">
              <button type="button" className="calendar-nav-btn" onClick={() => setCalendarMonth((prev) => addMonths(prev, -1))}>
                ‹
              </button>
              <p className="title-sm calendar-month-label">{monthLabel}</p>
              <button type="button" className="calendar-nav-btn" onClick={() => setCalendarMonth((prev) => addMonths(prev, 1))}>
                ›
              </button>
            </div>
            <div className="calendar-weekdays">
              {calendarWeekdays.map((day) => (
                <span key={day} className="calendar-weekday">{day}</span>
              ))}
            </div>
            <div className="calendar-grid">
              {calendarDays.map((day) => {
                const inCurrentMonth = day.getMonth() === calendarMonth.getMonth();
                const isSelected = !Number.isNaN(selectedDateObj.getTime()) && isSameDay(day, selectedDateObj);
                const isToday = isSameDay(day, new Date());
                return (
                  <button
                    key={`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`}
                    type="button"
                    className={`calendar-day ${inCurrentMonth ? '' : 'calendar-day--outside'} ${isSelected ? 'calendar-day--selected' : ''} ${isToday ? 'calendar-day--today' : ''}`}
                    onClick={() => {
                      setSelectedDate(toIsoDate(day));
                      setIsCalendarOpen(false);
                    }}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="bottom-sheet-actions">
              <button type="button" className="pill-btn pill-btn--secondary" onClick={() => setIsCalendarOpen(false)}>
                Закрыть
              </button>
              <button
                type="button"
                className="pill-btn pill-btn--primary"
                onClick={() => {
                  const now = new Date();
                  setSelectedDate(toIsoDate(now));
                  setCalendarMonth(startOfMonth(now));
                  setIsCalendarOpen(false);
                }}
              >
                Сегодня
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </motion.main>
  );
};

export default LiveScoresPage;