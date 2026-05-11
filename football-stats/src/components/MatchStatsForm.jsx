import React, { useEffect, useMemo, useState } from 'react';
import { emptyStatBundle, getMatchStats, setMatchStats } from '../services/adminCatalog';
import { DISPLAY_STATS, buildRowsFromBundle } from '../matchStatsBundleRows';
import { MatchStatsStatBlock } from './MatchStatsBarList';

const clampPct = (n) => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));

/**
 * @param {object} props
 * @param {string} props.matchId
 * @param {() => void} [props.onSaved]
 * @param {number} props.scoreGHome
 * @param {number} props.scoreGAway
 * @param {null | {
 *   home: number,
 *   away: number,
 *   setHome: (n: number) => void,
 *   setAway: (n: number) => void,
 *   onSaveScores: () => void,
 *   msg: string,
 *   err: string,
 *   clearScoreMsg: () => void,
 * }} [props.scoreEdit]
 */
export const MatchStatsForm = ({ matchId, onSaved, scoreGHome, scoreGAway, scoreEdit = null }) => {
  const [bundle, setBundle] = useState(() => {
    const existing = matchId ? getMatchStats(matchId) : null;
    return existing || emptyStatBundle();
  });
  /** Смена ключа сбрасывает DOM полей (иногда controlled number «залипает» после сброса). */
  const [fieldMountKey, setFieldMountKey] = useState(0);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    const existing = matchId ? getMatchStats(matchId) : null;
    setBundle(existing || emptyStatBundle());
    setMsg('');
    setErr('');
    setFieldMountKey((k) => k + 1);
  }, [matchId]);

  /** Всегда полный объект метрик (не «дырявый»), чтобы в полях не подставлялись нули вместо дефолтов. */
  const mergedBundle = useMemo(() => ({ ...emptyStatBundle(), ...bundle }), [bundle]);

  const previewRows = useMemo(
    () => buildRowsFromBundle(mergedBundle, scoreGHome, scoreGAway, { skipShotGoalClamp: true }),
    [mergedBundle, scoreGHome, scoreGAway],
  );

  const updateSide = (metricKey, side, raw) => {
    const n = Number(raw);
    const val = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
    setBundle((prev) => ({
      ...prev,
      [metricKey]: { ...(prev[metricKey] || { home: 0, away: 0 }), [side]: val },
    }));
  };

  const setPossessionHome = (raw) => {
    const h = clampPct(Number(raw));
    setBundle((prev) => ({
      ...prev,
      possession: { home: h, away: 100 - h },
    }));
  };

  const setPossessionAway = (raw) => {
    const a = clampPct(Number(raw));
    setBundle((prev) => ({
      ...prev,
      possession: { home: 100 - a, away: a },
    }));
  };

  const handleReset = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setErr('');
    setMsg('');
    const next = emptyStatBundle();
    setFieldMountKey((k) => k + 1);
    setBundle(next);
    if (!matchId) return;
    try {
      setMatchStats(matchId, next);
      queueMicrotask(() => {
        onSaved?.();
      });
    } catch (resetErr) {
      setErr(resetErr?.message || 'Не удалось записать сброс в каталог');
    }
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
      let next = { ...mergedBundle };
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

      const pa = next.pass_accuracy || { home: 0, away: 0 };
      next = {
        ...next,
        pass_accuracy: {
          home: clampPct(pa.home),
          away: clampPct(pa.away),
        },
      };

      setMatchStats(matchId, next);
      setBundle(next);
      setMsg('Статистика сохранена.');
      onSaved?.();
    } catch (e) {
      setErr(e?.message || 'Не удалось сохранить');
    }
  };

  const clearStatMsg = () => {
    setMsg('');
  };

  if (!matchId) {
    return <p className="body-lg admin-muted">Матч не выбран.</p>;
  }

  return (
    <form className="admin-stats-form" onSubmit={handleSave}>
      {scoreEdit ? (
        <div className="admin-match-score-block section-surface" style={{ marginBottom: '1rem' }}>
          <p className="label-md" style={{ marginBottom: '0.5rem' }}>
            Счёт
          </p>
          <div className="admin-match-score-row">
            <input
              className="pill-input admin-stats-input"
              type="number"
              min={0}
              value={scoreEdit.home}
              onChange={(e) => scoreEdit.setHome(Math.max(0, Math.round(Number(e.target.value) || 0)))}
              aria-label="Голы хозяев"
            />
            <span className="admin-score-sep">:</span>
            <input
              className="pill-input admin-stats-input"
              type="number"
              min={0}
              value={scoreEdit.away}
              onChange={(e) => scoreEdit.setAway(Math.max(0, Math.round(Number(e.target.value) || 0)))}
              aria-label="Голы гостей"
            />
            <button type="button" className="pill-btn pill-btn--ghost" onClick={scoreEdit.onSaveScores}>
              Сохранить счёт
            </button>
          </div>
          {scoreEdit.msg ? <p className="body-lg auth-feedback auth-feedback--success">{scoreEdit.msg}</p> : null}
          {scoreEdit.err ? <p className="body-lg auth-feedback auth-feedback--error">{scoreEdit.err}</p> : null}
          {scoreEdit.msg ? (
            <button type="button" className="pill-btn pill-btn--ghost admin-score-edit-again" onClick={scoreEdit.clearScoreMsg}>
              Внести изменения в счёт
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="admin-stats-preview" key={fieldMountKey}>
        {DISPLAY_STATS.map((def) => {
          const row = previewRows.find((r) => r.key === def.key);
          if (!row) return null;
          const pair = mergedBundle[def.key] || { home: 0, away: 0 };
          const h = Number.isFinite(Number(pair.home)) ? Math.round(Number(pair.home)) : 0;
          const a = Number.isFinite(Number(pair.away)) ? Math.round(Number(pair.away)) : 0;

          return (
            <MatchStatsStatBlock
              key={def.key}
              row={row}
              editable
              editHome={h}
              editAway={a}
              onHomeChange={(raw) => {
                if (def.key === 'possession') setPossessionHome(raw);
                else updateSide(def.key, 'home', raw);
              }}
              onAwayChange={(raw) => {
                if (def.key === 'possession') setPossessionAway(raw);
                else updateSide(def.key, 'away', raw);
              }}
            />
          );
        })}
      </div>

      <div className="admin-stats-form-actions">
        <button type="submit" className="pill-btn pill-btn--primary">
          Сохранить статистику
        </button>
        <button type="button" className="pill-btn pill-btn--ghost" onClick={handleReset}>
          Сбросить к нулям
        </button>
        {msg ? (
          <button type="button" className="pill-btn pill-btn--ghost" onClick={clearStatMsg}>
            Внести изменения
          </button>
        ) : null}
      </div>
      {msg ? <p className="body-lg auth-feedback auth-feedback--success">{msg}</p> : null}
      {err ? <p className="body-lg auth-feedback auth-feedback--error">{err}</p> : null}
    </form>
  );
};
