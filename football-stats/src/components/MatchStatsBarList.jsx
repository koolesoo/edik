import React from 'react';

/**
 * Одна строка статистики с полосками (как на странице матча).
 * @param {object} props
 * @param {{ key: string, label: string, home: number, away: number, suffix: string, scaleMode: string, tier?: string }} props.row
 * @param {boolean} [props.editable]
 * @param {number} [props.editHome] значения полей при editable (из бандла)
 * @param {number} [props.editAway]
 * @param {(raw: string) => void} [props.onHomeChange]
 * @param {(raw: string) => void} [props.onAwayChange]
 */
export const MatchStatsStatBlock = ({
  row,
  editable = false,
  editHome,
  editAway,
  onHomeChange,
  onAwayChange,
}) => {
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

  const pctInput = row.key === 'possession' || row.key === 'pass_accuracy';
  const homeVal = editable ? editHome ?? row.home : row.home;
  const awayVal = editable ? editAway ?? row.away : row.away;

  const renderVal = (side) => {
    const isHome = side === 'home';
    const val = isHome ? homeVal : awayVal;
    const onCh = isHome ? onHomeChange : onAwayChange;

    if (!editable || !onCh) {
      return (
        <span className="match-stats-stat-val">
          {val}
          {row.suffix}
        </span>
      );
    }

    return (
      <span className={`match-stats-stat-val match-stats-stat-val--editable${pctInput ? ' match-stats-stat-val--pct' : ''}`}>
        <input
          type="number"
          inputMode="numeric"
          className="match-stats-stat-input"
          min={pctInput ? 0 : undefined}
          max={pctInput ? 100 : undefined}
          value={Number.isFinite(Number(val)) ? Number(val) : 0}
          onChange={(e) => onCh(e.target.value)}
          aria-label={isHome ? `${row.label}, хозяева` : `${row.label}, гости`}
        />
        {row.suffix ? <span className="match-stats-stat-suffix">{row.suffix}</span> : null}
      </span>
    );
  };

  return (
    <div className="match-stats-stat-block">
      <div className={`match-stats-stat-head${editable ? ' match-stats-stat-head--editable' : ''}`}>
        {renderVal('home')}
        <span className="match-stats-stat-label">{row.label}</span>
        {renderVal('away')}
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
};

/**
 * @param {{ key: string, label: string, home: number, away: number, suffix: string, scaleMode: string, tier?: string }[]} rows
 */
export const MatchStatsBarList = ({ rows, showProTierTitle = true }) => (
  <div className="match-stats-list match-stats-list--embedded">
    {rows.map((row, rowIdx) => (
      <React.Fragment key={row.key}>
        {showProTierTitle && row.tier === 'pro' && rows[rowIdx - 1]?.tier !== 'pro' ? (
          <h3 className="match-stats-tier-title title-sm">Профи‑статистика</h3>
        ) : null}
        <MatchStatsStatBlock row={row} />
      </React.Fragment>
    ))}
  </div>
);
