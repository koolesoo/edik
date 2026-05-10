import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatDateTimeLineRuMsk, formatDayMonthRuMsk, formatTimeShortRuMsk } from '../dateTimeMsk';
import { MatchStatsListSkeleton } from '../components/DataSkeletons';
import { isLocalMatchId } from '../services/adminCatalog';
import { dropApiCacheKey, getMatchStatistics } from '../services/api';
import { preferCrest } from '../localCrests';
import { translateTeamName } from '../teamNames';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Целое число голов из счёта карточки матча (не число → 0). */
const parseGoalCount = (raw) => {
  const n = Number.parseInt(String(raw ?? '').replace(/\s+/g, ''), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
};

/**
 * Инварианты: удары в створ ≤ всего ударов; удары в створ ≥ голов; всего ударов ≥ голов.
 * @param {StatRow[]} rows
 * @param {unknown} homeScoreRaw
 * @param {unknown} awayScoreRaw
 * @returns {StatRow[]}
 */
const normalizeShotsAgainstGoals = (rows, homeScoreRaw, awayScoreRaw) => {
  const gHome = parseGoalCount(homeScoreRaw);
  const gAway = parseGoalCount(awayScoreRaw);
  const shotRow = rows.find((r) => r.key === 'shots');
  const otRow = rows.find((r) => r.key === 'on_target');
  if (!shotRow || !otRow) return rows;

  let homeShots = Math.max(0, Math.round(Number(shotRow.home) || 0));
  let awayShots = Math.max(0, Math.round(Number(shotRow.away) || 0));
  let homeOt = Math.max(0, Math.round(Number(otRow.home) || 0));
  let awayOt = Math.max(0, Math.round(Number(otRow.away) || 0));

  homeShots = Math.max(homeShots, gHome);
  awayShots = Math.max(awayShots, gAway);
  homeOt = Math.max(Math.min(homeOt, homeShots), gHome);
  awayOt = Math.max(Math.min(awayOt, awayShots), gAway);

  return rows.map((row) => {
    if (row.key === 'shots') return { ...row, home: homeShots, away: awayShots };
    if (row.key === 'on_target') return { ...row, home: homeOt, away: awayOt };
    return row;
  });
};

const hashSeed = (text) => {
  let hash = 0;
  const str = String(text || '');
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) % 1000003;
  }
  return hash;
};

/** @typedef {{ key: string, label: string, home: number, away: number, suffix: string, scaleMode: 'share' | 'max' }} StatRow */

const DISPLAY_STATS = [
  { key: 'possession', label: 'Владение мячом', suffix: '%', scaleMode: 'share' },
  { key: 'shots', label: 'Удары', suffix: '', scaleMode: 'max' },
  { key: 'on_target', label: 'Удары в створ', suffix: '', scaleMode: 'max' },
  { key: 'corners', label: 'Угловые', suffix: '', scaleMode: 'max' },
  { key: 'offsides', label: 'Офсайды', suffix: '', scaleMode: 'max' },
  { key: 'fouls', label: 'Фолы', suffix: '', scaleMode: 'max' },
];

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
  if (/DANGEROUS_ATTACK|^ATTACKS?$|FREE_KICK|GOAL_KICK|PENALT|RED_CARD|SAVE|BLOCKED|SUBSTIT/.test(both)) {
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
  }));
};

/**
 * @param {string} homeTeam
 * @param {string} awayTeam
 * @param {string} seedText
 * @returns {StatRow[]}
 */
const buildFakeStats = (homeTeam, awayTeam, seedText) => {
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

  return [
    { key: 'possession', label: 'Владение мячом', home: homePossession, away: awayPossession, suffix: '%', scaleMode: 'share' },
    { key: 'shots', label: 'Удары', home: homeShots, away: awayShots, suffix: '', scaleMode: 'max' },
    { key: 'on_target', label: 'Удары в створ', home: homeOnTarget, away: awayOnTarget, suffix: '', scaleMode: 'max' },
    { key: 'corners', label: 'Угловые', home: homeCorners, away: awayCorners, suffix: '', scaleMode: 'max' },
    { key: 'offsides', label: 'Офсайды', home: homeOffsides, away: awayOffsides, suffix: '', scaleMode: 'max' },
    { key: 'fouls', label: 'Фолы', home: homeFouls, away: awayFouls, suffix: '', scaleMode: 'max' },
  ];
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
  const [apiStats, setApiStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState('');

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

  const stats = useMemo(() => {
    const base =
      apiStats && apiStats.length > 0
        ? buildDisplayStatsFromApi(apiStats)
        : buildFakeStats(homeTeam, awayTeam, kickoffRaw || kickoffFallback);
    return normalizeShotsAgainstGoals(base, homeScore, awayScore);
  }, [apiStats, homeTeam, awayTeam, kickoffFallback, kickoffRaw, homeScore, awayScore]);

  const apiReturnedEmpty = Boolean(
    !statsLoading
      && livescoreMatchId
      && !isAdminLocalMatch
      && Array.isArray(apiStats)
      && apiStats.length === 0
      && !statsError,
  );
  const adminLocalStatsMissing = Boolean(
    !statsLoading
      && isAdminLocalMatch
      && Array.isArray(apiStats)
      && apiStats.length === 0
      && !statsError,
  );
  const showStatsSkeleton = Boolean(statsLoading && apiStats === null && livescoreMatchId);

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

            <div className="match-stats-score-mid" aria-label="Счёт">
              <span className="match-stats-score-num">
                {homeScore}
                {' '}
                :
                {' '}
                {awayScore}
              </span>
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
          {isAdminLocalMatch && Array.isArray(apiStats) && apiStats.length > 0 ? (
            <p className="body-lg match-stats-hint">Локальные данные администратора.</p>
          ) : null}
          {adminLocalStatsMissing ? (
            <p className="body-lg match-stats-hint">
              Статистика для этого матча не задана — ниже ориентировочные значения.
            </p>
          ) : null}
          {apiReturnedEmpty ? (
            <p className="body-lg match-stats-hint">
              Детальная статистика с сервера пуста — ниже ориентировочные значения.
            </p>
          ) : null}

          {showStatsSkeleton ? (
            <MatchStatsListSkeleton rows={7} />
          ) : (
          <div className="match-stats-list">
            {stats.map((row) => {
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
                <div className="match-stats-stat-block" key={row.key}>
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
              );
            })}
          </div>
          )}
        </section>
      </div>
    </motion.main>
  );
};

export default MatchStatsPage;
