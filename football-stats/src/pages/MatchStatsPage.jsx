import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatDateTimeLineRuMsk, formatDayMonthRuMsk, formatTimeShortRuMsk } from '../dateTimeMsk';
import { MatchStatsListSkeleton } from '../components/DataSkeletons';
import { MatchStatsForm } from '../components/MatchStatsForm';
import { getMatchById, isLocalMatchId, updateMatchScores } from '../services/adminCatalog';
import { DISPLAY_STATS, normalizeShotsAgainstGoals, parseGoalCount } from '../matchStatsBundleRows';
import { useAuth } from '../context/AuthContext';
import { dropApiCacheKey, getMatchStatistics } from '../services/api';
import { preferCrest } from '../localCrests';
import { translateTeamName } from '../teamNames';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const hashSeed = (text) => {
  let hash = 0;
  const str = String(text || '');
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) % 1000003;
  }
  return hash;
};

const normToken = (s) => String(s || '').toUpperCase().replace(/[\s-]+/g, '_');

/**
 * Сопоставление полей API LiveScore (часто на англ.) с нашими ключами.
 * @param {string} type
 * @param {string} label
 * @returns {string | null}
 */
const classifyStatKey = (type, label) => {
  const rawLabel = String(label || '');
  const rawType = String(type || '');
  const ruLine = `${rawType} ${rawLabel}`.toLowerCase();

  if (/владение|ball possession/i.test(ruLine)) return 'possession';
  if (/удар.*в створ|в створ|в ворота|on target|on goal|attempts on goal/i.test(ruLine)) {
    return 'on_target';
  }
  if (/офсайд/i.test(ruLine)) return 'offsides';
  if (/углов|corner/i.test(ruLine)) return 'corners';
  if (/фолы?|foul/i.test(ruLine)) return 'fouls';
  if (/точност.*передач|pass accuracy|passing accuracy/i.test(ruLine)) return 'pass_accuracy';
  if (/передач|total passes|^passes$/i.test(ruLine) && !/точност|accuracy/i.test(ruLine)) return 'passes';
  if (/больш(ие|ой)|big chances?|big chance/i.test(ruLine)) return 'big_chances';
  if (/сейв|goalkeeper saves?|^saves$/i.test(ruLine)) return 'saves';
  if (/отбор|tackles?/i.test(ruLine)) return 'tackles';
  if (/перехват|interceptions?/i.test(ruLine)) return 'interceptions';
  if (/вынос|clearances?/i.test(ruLine)) return 'clearances';
  if (/жёлты|желты|yellow cards?/i.test(ruLine)) return 'yellow_cards';
  if (/красн|red cards?/i.test(ruLine)) return 'red_cards';
  if (/опасн.*атак|dangerous attacks?/i.test(ruLine)) return 'dangerous_attacks';
  if (
    /^удары?$|total shots|всего ударов/i.test(rawLabel.trim())
    || /^удары?$/i.test(rawType.trim())
    || /^shots$/i.test(rawType.trim())
  ) {
    if (!/в створ|в ворота|on goal|on target/i.test(ruLine)) return 'shots';
  }

  const t = normToken(type);
  const l = normToken(label);
  const both = `${t}|${l}`;

  if (/POSSESSION|BALL_POSSESSION|ВЛАДЕНИЕ/.test(both)) return 'possession';
  if (/ATTEMPTS_ON_GOAL|ON_TARGET|ON_GOAL|SHOTS_ON_TARGET|SHOTS_ON_GOAL|GOAL_ATTEMPT|УДАРЫ_В_СТВОР|В_СТВОР/.test(both)) {
    return 'on_target';
  }
  if (/OFFSIDE|ОФСАЙД/.test(both)) return 'offsides';
  if (/CORNER|УГЛОВ/.test(both)) return 'corners';
  if (/FOUL|ФОЛ/.test(both)) return 'fouls';
  if (/PASS_ACCURACY|PASSING_ACCURACY|ТОЧНОСТЬ_ПЕРЕДАЧ/.test(both)) return 'pass_accuracy';
  if (/TOTAL_PASSES|PASSES_COMPLETED|ПЕРЕДАЧ(И)?$/.test(both) && !/ACCURACY/.test(both)) return 'passes';
  if (/BIG_CHANCE|BIG_CHANCES|БОЛЬШИЕ_МОМЕНТЫ/.test(both)) return 'big_chances';
  if (/GOALKEEPER_SAVE|GOALKEEPER_SAVES|^SAVES$|СЕЙВ/.test(both)) return 'saves';
  if (/TACKLE|ОТБОР/.test(both)) return 'tackles';
  if (/INTERCEPTION|ПЕРЕХВАТ/.test(both)) return 'interceptions';
  if (/CLEARANCE|ВЫНОС/.test(both)) return 'clearances';
  if (/YELLOW_CARD|ЖЁЛТ|ЖЕЛТ/.test(both)) return 'yellow_cards';
  if (/RED_CARD|КРАСН/.test(both)) return 'red_cards';
  if (/DANGEROUS_ATTACK|ОПАСН/.test(both)) return 'dangerous_attacks';
  if (/FREE_KICK|GOAL_KICK|PENALT|BLOCKED_SHOT|SUBSTIT|^ATTACKS?$/.test(both)) {
    return null;
  }
  if (/TOTAL_SHOTS|SHOTS_TOTAL|SHOTS_OFF|OFF_TARGET|^SHOTS?$/.test(both)) return 'shots';
  if (/\bSHOT\b/.test(String(type || '').toUpperCase()) && !/ON|TARGET|BLOCK|SAVE|GOAL_KICK/.test(t)) {
    return 'shots';
  }
  return null;
};

/**
 * @param {Array<{ type?: string, label?: string, home?: number, away?: number }>} rows
 * @returns {StatRow[]}
 */
const buildDisplayStatsFromApi = (rows) => {
  const acc = {};
  for (const r of rows) {
    const key = classifyStatKey(r.type, r.label);
    if (!key) continue;
    acc[key] = {
      home: Number(r.home ?? 0),
      away: Number(r.away ?? 0),
    };
  }
  return DISPLAY_STATS.map((def) => ({
    key: def.key,
    label: def.label,
    home: acc[def.key]?.home ?? 0,
    away: acc[def.key]?.away ?? 0,
    suffix: def.suffix,
    scaleMode: def.scaleMode,
    tier: def.tier,
  }));
};

/**
 * @param {string} homeTeam
 * @param {string} awayTeam
 * @param {string} seedText
 * @returns {StatRow[]}
 */
/** Показатели для экрана, если API не вернуло строк статистики: детерминированный расчёт от пар команд и времени. */
const buildClientFallbackStats = (homeTeam, awayTeam, seedText) => {
  const seed = hashSeed(`${homeTeam}-${awayTeam}-${seedText}`);
  const delta = (seed % 11) - 5;

  const homePossession = clamp(50 + delta, 44, 56);
  const awayPossession = 100 - homePossession;

  const homeShots = clamp(11 + Math.round(delta / 2), 8, 16);
  const awayShots = clamp(11 - Math.round(delta / 2), 8, 16);

  const homeOnTarget = clamp(
    Math.round(homeShots * (0.34 + ((seed % 3) * 0.03))),
    0,
    homeShots,
  );
  const awayOnTarget = clamp(
    Math.round(awayShots * (0.34 + (((seed + 1) % 3) * 0.03))),
    0,
    awayShots,
  );

  const homeCorners = clamp(5 + Math.round(delta / 3), 3, 9);
  const awayCorners = clamp(5 - Math.round(delta / 3), 3, 9);

  const homeOffsides = clamp((seed % 4), 0, 4);
  const awayOffsides = clamp(((seed + 2) % 5), 0, 4);

  const homeFouls = clamp(11 - Math.round(delta / 2), 8, 16);
  const awayFouls = clamp(11 + Math.round(delta / 2), 8, 16);

  const statsByKey = {
    possession: { home: homePossession, away: awayPossession },
    shots: { home: homeShots, away: awayShots },
    on_target: { home: homeOnTarget, away: awayOnTarget },
    corners: { home: homeCorners, away: awayCorners },
    offsides: { home: homeOffsides, away: awayOffsides },
    fouls: { home: homeFouls, away: awayFouls },
    passes: {
      home: clamp(380 + seed % 80, 280, 520),
      away: clamp(380 - seed % 60, 280, 520),
    },
    pass_accuracy: {
      home: clamp(78 + (seed % 8), 65, 92),
      away: clamp(76 + ((seed + 3) % 9), 65, 92),
    },
    big_chances: { home: clamp((seed % 4) + 1, 0, 6), away: clamp(((seed + 1) % 4) + 1, 0, 6) },
    saves: { home: clamp(2 + (seed % 5), 0, 9), away: clamp(2 + ((seed + 2) % 5), 0, 9) },
    tackles: { home: clamp(16 + delta, 10, 28), away: clamp(16 - delta, 10, 28) },
    interceptions: { home: clamp(8 + (seed % 6), 3, 18), away: clamp(8 + ((seed + 1) % 6), 3, 18) },
    clearances: { home: clamp(18 + (seed % 7), 8, 32), away: clamp(17 + ((seed + 2) % 7), 8, 32) },
    yellow_cards: { home: clamp((seed % 4), 0, 5), away: clamp(((seed + 2) % 4), 0, 5) },
    red_cards: { home: seed % 17 === 0 ? 1 : 0, away: (seed + 5) % 19 === 0 ? 1 : 0 },
    dangerous_attacks: { home: clamp(42 + delta * 2, 28, 72), away: clamp(42 - delta * 2, 28, 72) },
  };

  return DISPLAY_STATS.map((def) => {
    const pair = statsByKey[def.key] || { home: 0, away: 0 };
    return {
      key: def.key,
      label: def.label,
      home: pair.home,
      away: pair.away,
      suffix: def.suffix,
      scaleMode: def.scaleMode,
      tier: def.tier,
    };
  });
};

/**
 * @param {string} raw
 * @returns {Date | null}
 */
const parseFlexibleKickoff = (raw) => {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    const dTry = new Date(s);
    if (!Number.isNaN(dTry.getTime())) return dTry;
  }

  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;

  const rest = s.slice(10);
  const tm = rest.match(/^T(\d{2}):(\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:?\d{2})?/i);
  if (tm) {
    const hh = Number(tm[1]);
    const mm = Number(tm[2]);
    const ss = Number(tm[3] || 0);
    if (hh >= 0 && hh < 24 && mm >= 0 && mm < 60) {
      if (tm[4] === 'Z' || tm[4]) {
        return new Date(Date.UTC(y, mo - 1, day, hh, mm, ss));
      }
      return new Date(y, mo - 1, day, hh, mm, ss);
    }
  }

  return new Date(y, mo - 1, day, 12, 0, 0);
};

/**
 * @param {string} raw
 * @returns {string}
 */
const formatRuDateTimeLine = (raw) => {
  const d = parseFlexibleKickoff(raw);
  if (!d || Number.isNaN(d.getTime())) return '';
  return formatDateTimeLineRuMsk(d);
};

/**
 * Подпись даты/времени матча: читаемый русский текст.
 * @param {string | undefined} utcLike
 * @param {string | undefined} fallbackLine
 */
const formatMatchKickoffDisplay = (utcLike, fallbackLine) => {
  const fromUtc = utcLike != null && utcLike !== '' ? formatRuDateTimeLine(String(utcLike)) : '';
  if (fromUtc) return fromUtc;

  const fb = String(fallbackLine || '').trim();
  if (!fb) return 'Дата уточняется';
  if (!/^\d{4}-\d{2}-\d{2}/.test(fb)) return fb;

  const d = parseFlexibleKickoff(fb);
  if (d && !Number.isNaN(d.getTime())) {
    return formatDateTimeLineRuMsk(d);
  }
  return 'Дата уточняется';
};

/**
 * @param {string | undefined} utcLike
 * @param {string | undefined} fallbackLine
 */
const matchKickoffIso = (utcLike, fallbackLine) => {
  const d = parseFlexibleKickoff(utcLike) || parseFlexibleKickoff(fallbackLine);
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toISOString();
};

const STATUS_LABELS = {
  FINISHED: 'ЗАВЕРШЁН',
  IN_PLAY: 'LIVE',
  PAUSED: 'ПЕРЕРЫВ',
  TIMED: 'ПО РАСПИСАНИЮ',
  SCHEDULED: 'СКОРО',
};

const MatchStatsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const match = location.state?.match || {};
  const homeTeam = match.homeTeam || 'Home';
  const awayTeam = match.awayTeam || 'Away';
  const homeDisplayName = translateTeamName(homeTeam) || homeTeam;
  const awayDisplayName = translateTeamName(awayTeam) || awayTeam;
  const homeCrest = preferCrest(homeTeam, match.homeCrest || '');
  const awayCrest = preferCrest(awayTeam, match.awayCrest || '');
  const homeScore = match.homeScore ?? '-';
  const awayScore = match.awayScore ?? '-';
  const kickoffRaw = match.utcDate || match.date || '';
  const kickoffParts = useMemo(() => {
    const d = parseFlexibleKickoff(match.utcDate) || parseFlexibleKickoff(match.date);
    if (!d || Number.isNaN(d.getTime())) return null;
    return {
      dateLine: formatDayMonthRuMsk(d),
      timeLine: formatTimeShortRuMsk(d),
    };
  }, [match.utcDate, match.date]);
  const kickoffFallback = useMemo(
    () => formatMatchKickoffDisplay(match.utcDate, match.date),
    [match.utcDate, match.date],
  );
  const kickoffIso = useMemo(
    () => matchKickoffIso(match.utcDate, match.date),
    [match.utcDate, match.date],
  );
  const homeShort = String(homeDisplayName).split(' ').filter(Boolean).slice(0, 2).map((v) => v[0]).join('').toUpperCase();
  const awayShort = String(awayDisplayName).split(' ').filter(Boolean).slice(0, 2).map((v) => v[0]).join('').toUpperCase();
  const returnMode = location.state?.returnMode === 'live' ? 'live' : 'results';
  const returnPath =
    location.state?.returnPath != null && String(location.state.returnPath).trim() !== ''
      ? String(location.state.returnPath)
      : returnMode === 'live'
        ? '/'
        : '/matches';
  const returnState = {
    selectedDate: location.state?.selectedDate,
    selectedTeam: location.state?.selectedTeam,
  };

  const rawStatus = String(match.status || 'TIMED').toUpperCase();
  const statusLabel = STATUS_LABELS[rawStatus] || rawStatus;

  const livescoreMatchId = match.livescoreMatchId ?? match.fixtureId ?? null;
  const isAdminLocalMatch = isLocalMatchId(livescoreMatchId);
  const [liveH, setLiveH] = useState(0);
  const [liveA, setLiveA] = useState(0);
  const [scoreMsg, setScoreMsg] = useState('');
  const [scoreErr, setScoreErr] = useState('');
  /** После сохранения счёта перечитываем каталог для шапки (location.state устаревает). */
  const [scoreCardRev, setScoreCardRev] = useState(0);
  const [apiStats, setApiStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState('');
  /** Локальный матч админа: по умолчанию обычные полоски; форма — только по кнопке. */
  const [adminStatsEditing, setAdminStatsEditing] = useState(false);

  useEffect(() => {
    if (!livescoreMatchId) return;
    if (isAdminLocalMatch && currentUser?.role === 'admin' && adminStatsEditing) {
      const m = getMatchById(String(livescoreMatchId));
      if (m) {
        setLiveH(Number(m.homeScore) || 0);
        setLiveA(Number(m.awayScore) || 0);
      } else {
        setLiveH(parseGoalCount(match.homeScore));
        setLiveA(parseGoalCount(match.awayScore));
      }
      return;
    }
    setLiveH(parseGoalCount(match.homeScore));
    setLiveA(parseGoalCount(match.awayScore));
  }, [
    livescoreMatchId,
    isAdminLocalMatch,
    currentUser?.role,
    adminStatsEditing,
    match.homeScore,
    match.awayScore,
    scoreCardRev,
  ]);

  const catalogMatchSnapshot = useMemo(() => {
    if (!isAdminLocalMatch || !livescoreMatchId) return null;
    return getMatchById(String(livescoreMatchId));
  }, [isAdminLocalMatch, livescoreMatchId, scoreCardRev]);

  const editingScoresInForm = Boolean(
    isAdminLocalMatch && currentUser?.role === 'admin' && adminStatsEditing,
  );
  const scoreGHome = editingScoresInForm
    ? liveH
    : catalogMatchSnapshot != null
      ? Number(catalogMatchSnapshot.homeScore) || 0
      : parseGoalCount(match.homeScore);
  const scoreGAway = editingScoresInForm
    ? liveA
    : catalogMatchSnapshot != null
      ? Number(catalogMatchSnapshot.awayScore) || 0
      : parseGoalCount(match.awayScore);

  const displayHomeScore =
    catalogMatchSnapshot != null ? Number(catalogMatchSnapshot.homeScore) || 0 : homeScore;
  const displayAwayScore =
    catalogMatchSnapshot != null ? Number(catalogMatchSnapshot.awayScore) || 0 : awayScore;

  const loadStatsSeq = useRef(0);
  const loadStats = useCallback(
    async ({ force = false } = {}) => {
      if (!livescoreMatchId) return;
      if (document.hidden) return;
      if (force && !isAdminLocalMatch) {
        dropApiCacheKey(`rpl.matchStats.${livescoreMatchId}`);
      }
      const seq = (loadStatsSeq.current += 1);
      setStatsLoading(true);
      setStatsError('');
      try {
        const rows = await getMatchStatistics(livescoreMatchId);
        if (seq !== loadStatsSeq.current) return;
        setApiStats(Array.isArray(rows) ? rows : []);
      } catch (err) {
        if (seq !== loadStatsSeq.current) return;
        setStatsError(err?.message || 'Не удалось загрузить статистику');
      } finally {
        if (seq === loadStatsSeq.current) {
          setStatsLoading(false);
        }
      }
    },
    [livescoreMatchId, isAdminLocalMatch],
  );

  const canSaveLocalOrLiveScore = Boolean(
    livescoreMatchId && isAdminLocalMatch && currentUser?.role === 'admin' && adminStatsEditing,
  );

  const handleSaveScores = useCallback(() => {
    setScoreErr('');
    if (!canSaveLocalOrLiveScore) return;
    try {
      updateMatchScores(livescoreMatchId, liveH, liveA);
      setScoreMsg('Счёт сохранён.');
      setScoreCardRev((n) => n + 1);
      void loadStats({ force: true });
    } catch (e) {
      setScoreErr(e?.message || 'Не удалось сохранить счёт');
    }
  }, [canSaveLocalOrLiveScore, livescoreMatchId, liveH, liveA, loadStats]);

  useEffect(() => {
    if (!livescoreMatchId) {
      setApiStats(null);
      setStatsLoading(false);
      setStatsError('');
      return undefined;
    }

    let cancelled = false;
    let removeVisListener = null;

    const run = () => {
      if (cancelled || document.hidden) return;
      void loadStats({ force: false });
    };

    if (document.hidden) {
      const onVis = () => {
        if (cancelled || document.hidden) return;
        document.removeEventListener('visibilitychange', onVis);
        run();
      };
      document.addEventListener('visibilitychange', onVis);
      removeVisListener = () => document.removeEventListener('visibilitychange', onVis);
    } else {
      run();
    }

    return () => {
      cancelled = true;
      if (removeVisListener) removeVisListener();
    };
  }, [livescoreMatchId, loadStats]);

  useEffect(() => {
    setAdminStatsEditing(false);
    setScoreCardRev(0);
  }, [livescoreMatchId]);

  const stats = useMemo(() => {
    const base =
      apiStats && apiStats.length > 0
        ? buildDisplayStatsFromApi(apiStats)
        : buildClientFallbackStats(homeTeam, awayTeam, kickoffRaw || kickoffFallback);
    const shotFixed = isAdminLocalMatch
      ? base
      : normalizeShotsAgainstGoals(base, scoreGHome, scoreGAway);
    return shotFixed.map((row) => {
      if (row.key !== 'pass_accuracy') return row;
      return {
        ...row,
        home: clamp(Math.round(Number(row.home) || 0), 0, 100),
        away: clamp(Math.round(Number(row.away) || 0), 0, 100),
      };
    });
  }, [apiStats, homeTeam, awayTeam, kickoffFallback, kickoffRaw, isAdminLocalMatch, scoreGHome, scoreGAway]);

  const apiReturnedEmpty = Boolean(
    !statsLoading
      && livescoreMatchId
      && !isAdminLocalMatch
      && Array.isArray(apiStats)
      && apiStats.length === 0
      && !statsError,
  );
  const showStatsSkeleton = Boolean(statsLoading && apiStats === null && livescoreMatchId);
  const showAdminInlineEditor = Boolean(
    isAdminLocalMatch && currentUser?.role === 'admin' && adminStatsEditing,
  );
  const showMatchStatsBars = Boolean(
    !showStatsSkeleton && (!isAdminLocalMatch || currentUser?.role !== 'admin' || !adminStatsEditing),
  );

  useEffect(() => {
    const prev = document.title;
    document.title = `${homeDisplayName} — ${awayDisplayName} · Статистика РПЛ`;
    return () => {
      document.title = prev;
    };
  }, [homeDisplayName, awayDisplayName]);

  return (
    <motion.main
      className="page match-stats-page"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <section className="match-stats-hero">
        <div className="match-stats-hero-card">
          <div className="match-stats-toolbar">
            <button
              type="button"
              className="profile-back-btn floating-surface stats-back-btn"
              onClick={() => navigate(returnPath, { state: returnState })}
              aria-label="Назад к матчам"
              title="Назад к матчам"
            >
              <span className="profile-back-chevron" aria-hidden="true">‹</span>
            </button>
            {isAdminLocalMatch && currentUser?.role === 'admin' && !adminStatsEditing ? (
              <button
                type="button"
                className="pill-btn pill-btn--secondary match-stats-edit-stats-btn"
                onClick={() => {
                  setScoreMsg('');
                  setScoreErr('');
                  setAdminStatsEditing(true);
                }}
              >
                Редактировать статистику
              </button>
            ) : null}
          </div>

          <div className="match-stats-kickoff-stack">
            <time
              className="match-stats-datetime match-stats-datetime--stack"
              dateTime={kickoffIso || undefined}
            >
              {kickoffParts ? (
                <>
                  <span className="match-stats-kickoff-date">{kickoffParts.dateLine}</span>
                  <span className="match-stats-kickoff-time">{kickoffParts.timeLine}</span>
                </>
              ) : (
                kickoffFallback
              )}
            </time>
            <span
              className={`match-stats-status-pill match-stats-status-pill--hero ${rawStatus === 'FINISHED' ? 'match-stats-status-pill--finished' : ''}`}
            >
              {statusLabel}
            </span>
          </div>

          <div className="match-stats-scoreboard">
            <div className="match-stats-side match-stats-side--home">
              <div className="match-stats-emblem">
                {homeCrest ? (
                  <img src={homeCrest} alt="" className="match-stats-emblem-img" loading="lazy" />
                ) : (
                  <span className="match-stats-emblem-fallback" aria-hidden="true">
                    {homeShort || homeTeam.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <span className="match-stats-abbr">{homeDisplayName}</span>
            </div>

            <div
              className={`match-stats-score-mid${editingScoresInForm ? ' match-stats-score-mid--hero-edit' : ''}`}
              aria-label="Счёт"
            >
              {editingScoresInForm ? (
                <div className="match-stats-hero-score-inline">
                  <div className="match-stats-hero-score-digits" role="group">
                    <input
                      type="number"
                      min={0}
                      className="match-stats-score-input match-stats-score-input--hero"
                      value={liveH}
                      onChange={(e) => setLiveH(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                      aria-label="Голы хозяев"
                    />
                    <span className="match-stats-hero-score-colon" aria-hidden="true">
                      :
                    </span>
                    <input
                      type="number"
                      min={0}
                      className="match-stats-score-input match-stats-score-input--hero"
                      value={liveA}
                      onChange={(e) => setLiveA(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                      aria-label="Голы гостей"
                    />
                  </div>
                  <button
                    type="button"
                    className="pill-btn pill-btn--secondary match-stats-hero-score-save"
                    onClick={handleSaveScores}
                  >
                    Сохранить счёт
                  </button>
                  {scoreMsg ? (
                    <p className="match-stats-hero-score-feedback match-stats-hero-score-feedback--ok">{scoreMsg}</p>
                  ) : null}
                  {scoreErr ? (
                    <p className="match-stats-hero-score-feedback match-stats-hero-score-feedback--err">{scoreErr}</p>
                  ) : null}
                  {scoreMsg ? (
                    <button
                      type="button"
                      className="pill-btn pill-btn--ghost match-stats-hero-score-clear-msg"
                      onClick={() => {
                        setScoreMsg('');
                        setScoreErr('');
                      }}
                    >
                      Изменить снова
                    </button>
                  ) : null}
                </div>
              ) : (
                <span className="match-stats-score-num">
                  {displayHomeScore}
                  {' '}
                  :
                  {' '}
                  {displayAwayScore}
                </span>
              )}
            </div>

            <div className="match-stats-side match-stats-side--away">
              <div className="match-stats-emblem">
                {awayCrest ? (
                  <img src={awayCrest} alt="" className="match-stats-emblem-img" loading="lazy" />
                ) : (
                  <span className="match-stats-emblem-fallback" aria-hidden="true">
                    {awayShort || awayTeam.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <span className="match-stats-abbr">{awayDisplayName}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="match-stats-shell">
        <section className="match-stats-body" aria-busy={showStatsSkeleton}>
          {statsLoading && !showStatsSkeleton ? (
            <p className="body-lg match-stats-hint">Загрузка статистики…</p>
          ) : null}
          {statsError ? (
            <p className="body-lg match-stats-hint match-stats-hint--error" role="alert">
              {statsError}
            </p>
          ) : null}
          {!livescoreMatchId ? (
            <p className="body-lg match-stats-hint">
              Ориентировочная статистика (нет id матча для API).
            </p>
          ) : null}
          {showAdminInlineEditor ? (
            <div className="match-stats-admin-editor">
              <div className="match-stats-admin-editor-head">
                <button
                  type="button"
                  className="pill-btn pill-btn--ghost match-stats-close-editor-btn"
                  onClick={() => {
                    setAdminStatsEditing(false);
                    void loadStats({ force: true });
                  }}
                >
                  Закрыть редактор
                </button>
              </div>
              <MatchStatsForm
                matchId={String(livescoreMatchId)}
                scoreGHome={scoreGHome}
                scoreGAway={scoreGAway}
                onSaved={() => {
                  setAdminStatsEditing(false);
                  void loadStats({ force: true });
                }}
                scoreEdit={null}
              />
            </div>
          ) : null}
          {apiReturnedEmpty ? (
            <p className="body-lg match-stats-hint">
              Показатели от провайдера для этого матча отсутствуют — ниже отображается расчёт на клиенте по контексту встречи.
            </p>
          ) : null}

          {showStatsSkeleton ? (
            <MatchStatsListSkeleton rows={DISPLAY_STATS.length} />
          ) : showMatchStatsBars ? (
          <div className="match-stats-list">
            {stats.map((row, rowIdx) => {
              const maxVal = Math.max(row.home, row.away, 1);
              const homeMaxPct = (row.home / maxVal) * 100;
              const awayMaxPct = (row.away / maxVal) * 100;
              const posSum = row.home + row.away;
              const homeSharePct = posSum > 0 ? (row.home / posSum) * 100 : 50;
              const awaySharePct = posSum > 0 ? (row.away / posSum) * 100 : 50;

              const homeW = row.scaleMode === 'share' ? homeSharePct : homeMaxPct;
              const awayW = row.scaleMode === 'share' ? awaySharePct : awayMaxPct;

              const barStrong = 'var(--primary-container)';
              const barSoft = 'rgba(242, 242, 242, 0.22)';
              const tie = row.home === row.away;
              const homeBg = tie ? barStrong : (row.home > row.away ? barStrong : barSoft);
              const awayBg = tie ? barStrong : (row.away > row.home ? barStrong : barSoft);

              return (
                <React.Fragment key={row.key}>
                  {row.tier === 'pro' && stats[rowIdx - 1]?.tier !== 'pro' ? (
                    <h3 className="match-stats-tier-title title-sm">Профи‑статистика</h3>
                  ) : null}
                  <div className="match-stats-stat-block">
                    <div className="match-stats-stat-head">
                      <span className="match-stats-stat-val">
                        {row.home}
                        {row.suffix}
                      </span>
                      <span className="match-stats-stat-label">{row.label}</span>
                      <span className="match-stats-stat-val">
                        {row.away}
                        {row.suffix}
                      </span>
                    </div>
                    <div className="match-stats-dual-bar" aria-hidden="true">
                      <div className="match-stats-track">
                        <div
                          className="match-stats-fill match-stats-fill--from-right"
                          style={{
                            width: `${homeW}%`,
                            background: homeBg,
                          }}
                        />
                      </div>
                      <div className="match-stats-track">
                        <div
                          className="match-stats-fill match-stats-fill--from-left"
                          style={{
                            width: `${awayW}%`,
                            background: awayBg,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
          ) : null}
        </section>
      </div>
    </motion.main>
  );
};

export default MatchStatsPage;
