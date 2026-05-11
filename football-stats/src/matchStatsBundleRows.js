import { emptyStatBundle } from './services/adminCatalog';

export const parseGoalCount = (raw) => {
  const n = Number.parseInt(String(raw ?? '').replace(/\s+/g, ''), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
};

/** @param {{ key: string, home: number, away: number }[]} rows */
export const normalizeShotsAgainstGoals = (rows, homeScoreRaw, awayScoreRaw) => {
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

const clampPct = (n) => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));

/** Единый список метрик для страницы матча и превью в форме админа. */
export const DISPLAY_STATS = [
  { key: 'possession', label: 'Владение мячом', suffix: '%', scaleMode: 'share', tier: 'basic' },
  { key: 'shots', label: 'Удары', suffix: '', scaleMode: 'max', tier: 'basic' },
  { key: 'on_target', label: 'Удары в створ', suffix: '', scaleMode: 'max', tier: 'basic' },
  { key: 'corners', label: 'Угловые', suffix: '', scaleMode: 'max', tier: 'basic' },
  { key: 'offsides', label: 'Офсайды', suffix: '', scaleMode: 'max', tier: 'basic' },
  { key: 'fouls', label: 'Фолы', suffix: '', scaleMode: 'max', tier: 'basic' },
  { key: 'passes', label: 'Передачи', suffix: '', scaleMode: 'max', tier: 'pro' },
  { key: 'pass_accuracy', label: 'Точность передач', suffix: '%', scaleMode: 'max', tier: 'pro' },
  { key: 'big_chances', label: 'Большие моменты', suffix: '', scaleMode: 'max', tier: 'pro' },
  { key: 'saves', label: 'Сейвы', suffix: '', scaleMode: 'max', tier: 'pro' },
  { key: 'tackles', label: 'Отборы', suffix: '', scaleMode: 'max', tier: 'pro' },
  { key: 'interceptions', label: 'Перехваты', suffix: '', scaleMode: 'max', tier: 'pro' },
  { key: 'clearances', label: 'Выносы', suffix: '', scaleMode: 'max', tier: 'pro' },
  { key: 'yellow_cards', label: 'Жёлтые карточки', suffix: '', scaleMode: 'max', tier: 'pro' },
  { key: 'red_cards', label: 'Красные карточки', suffix: '', scaleMode: 'max', tier: 'pro' },
  { key: 'dangerous_attacks', label: 'Опасные атаки', suffix: '', scaleMode: 'max', tier: 'pro' },
];

/**
 * Строки для полосок из локального бандла (как на странице матча).
 * @param {Record<string, { home?: number, away?: number }>} bundle
 * @param {unknown} homeScoreRaw
 * @param {unknown} awayScoreRaw
 * @param {{ skipShotGoalClamp?: boolean }} [opts] — для ручного ввода в каталоге: не поднимать удары/в створ до числа голов.
 */
export const buildRowsFromBundle = (bundle, homeScoreRaw, awayScoreRaw, opts = {}) => {
  const { skipShotGoalClamp = false } = opts;
  const b = { ...emptyStatBundle(), ...(bundle && typeof bundle === 'object' ? bundle : {}) };
  let rows = DISPLAY_STATS.map((def) => ({
    key: def.key,
    label: def.label,
    home: Number(b[def.key]?.home ?? 0),
    away: Number(b[def.key]?.away ?? 0),
    suffix: def.suffix,
    scaleMode: def.scaleMode,
    tier: def.tier,
  }));
  if (!skipShotGoalClamp) {
    rows = normalizeShotsAgainstGoals(rows, homeScoreRaw, awayScoreRaw);
  }
  return rows.map((row) =>
    row.key === 'pass_accuracy'
      ? { ...row, home: clampPct(row.home), away: clampPct(row.away) }
      : row,
  );
};
