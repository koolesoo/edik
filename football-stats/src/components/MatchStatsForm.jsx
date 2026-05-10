import React, { useEffect, useState } from 'react';
import { emptyStatBundle, getMatchStats, setMatchStats } from '../services/adminCatalog';

const STAT_FIELDS = [
  { key: 'possession', label: 'Владение %', share: true },
  { key: 'shots', label: 'Удары' },
  { key: 'on_target', label: 'Удары в створ' },
  { key: 'corners', label: 'Угловые' },
  { key: 'offsides', label: 'Офсайды' },
  { key: 'fouls', label: 'Фолы' },
];

export const MatchStatsForm = ({ matchId, onSaved }) => {
  const [bundle, setBundle] = useState(() => {
    const existing = matchId ? getMatchStats(matchId) : null;
    return existing || emptyStatBundle();
  });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    const existing = matchId ? getMatchStats(matchId) : null;
    setBundle(existing || emptyStatBundle());
    setMsg('');
    setErr('');
  }, [matchId]);

  const updateSide = (metricKey, side, raw) => {
    const n = Number(raw);
    const val = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
    setBundle((prev) => ({
      ...prev,
      [metricKey]: { ...(prev[metricKey] || { home: 0, away: 0 }), [side]: val },
    }));
  };

  const handleSave = (event) => {
    event.preventDefault();
    setErr('');
    setMsg('');
    if (!matchId) {
      setErr('Выберите матч');
      return;
    }
    try {
      let next = { ...bundle };
      const p = next.possession || { home: 50, away: 50 };
      let h = Number(p.home) || 0;
      let a = Number(p.away) || 0;
      const sum = h + a;
      if (sum <= 0) {
        h = 50;
        a = 50;
      } else {
        h = Math.round((h / sum) * 100);
        a = 100 - h;
      }
      next = { ...next, possession: { home: h, away: a } };
      setMatchStats(matchId, next);
      setMsg('Статистика сохранена.');
      onSaved?.();
    } catch (e) {
      setErr(e?.message || 'Не удалось сохранить');
    }
  };

  if (!matchId) {
    return <p className="body-lg admin-muted">Матч не выбран.</p>;
  }

  return (
    <form className="admin-stats-form" onSubmit={handleSave}>
      <div className="admin-stats-grid">
        <div className="admin-stats-head">
          <span className="admin-stats-col-label">Показатель</span>
          <span className="admin-stats-col-label">Хозяева</span>
          <span className="admin-stats-col-label">Гости</span>
        </div>
        {STAT_FIELDS.map(({ key, label, share }) => {
          const pair = bundle[key] || { home: 0, away: 0 };
          return (
            <div className="admin-stats-row" key={key}>
              <span className="admin-stats-metric">{label}</span>
              <input
                className="pill-input admin-stats-input"
                type="number"
                min={0}
                max={share ? 100 : undefined}
                value={pair.home ?? ''}
                onChange={(e) => updateSide(key, 'home', e.target.value)}
              />
              <input
                className="pill-input admin-stats-input"
                type="number"
                min={0}
                max={share ? 100 : undefined}
                value={pair.away ?? ''}
                onChange={(e) => updateSide(key, 'away', e.target.value)}
              />
            </div>
          );
        })}
      </div>
      <button type="submit" className="pill-btn pill-btn--primary">
        Сохранить статистику
      </button>
      {msg ? <p className="body-lg auth-feedback auth-feedback--success">{msg}</p> : null}
      {err ? <p className="body-lg auth-feedback auth-feedback--error">{err}</p> : null}
    </form>
  );
};
