import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const hashSeed = (text) => {
  let hash = 0;
  const str = String(text || '');
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) % 1000003;
  }
  return hash;
};

const buildFakeStats = (homeTeam, awayTeam, date) => {
  const seed = hashSeed(`${homeTeam}-${awayTeam}-${date}`);
  const delta = (seed % 11) - 5; // -5..+5

  const homePossession = clamp(50 + delta, 44, 56);
  const awayPossession = 100 - homePossession;

  const homeShots = clamp(11 + Math.round(delta / 2), 8, 16);
  const awayShots = clamp(11 - Math.round(delta / 2), 8, 16);

  const homeOnTarget = clamp(Math.round(homeShots * (0.34 + ((seed % 3) * 0.03))), 2, homeShots - 2);
  const awayOnTarget = clamp(Math.round(awayShots * (0.34 + (((seed + 1) % 3) * 0.03))), 2, awayShots - 2);

  const homeCorners = clamp(5 + Math.round(delta / 3), 3, 9);
  const awayCorners = clamp(5 - Math.round(delta / 3), 3, 9);

  const homeFouls = clamp(11 - Math.round(delta / 2), 8, 16);
  const awayFouls = clamp(11 + Math.round(delta / 2), 8, 16);

  const homePass = clamp(82 + Math.round(delta / 2), 76, 89);
  const awayPass = clamp(82 - Math.round(delta / 2), 76, 89);

  return [
    { label: 'Владение', home: homePossession, away: awayPossession, suffix: '%' },
    { label: 'Удары', home: homeShots, away: awayShots, suffix: '' },
    { label: 'Удары в створ', home: homeOnTarget, away: awayOnTarget, suffix: '' },
    { label: 'Угловые', home: homeCorners, away: awayCorners, suffix: '' },
    { label: 'Фолы', home: homeFouls, away: awayFouls, suffix: '' },
    { label: 'Точность паса', home: homePass, away: awayPass, suffix: '%' },
  ];
};

const formatKickoff = (rawDate) => {
  if (!rawDate) return 'Дата уточняется';
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return String(rawDate);
  return parsed.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const MatchStatsPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const match = location.state?.match || {};
  const homeTeam = match.homeTeam || 'Home';
  const awayTeam = match.awayTeam || 'Away';
  const kickoff = formatKickoff(match.date);

  const stats = useMemo(
    () => buildFakeStats(homeTeam, awayTeam, kickoff),
    [homeTeam, awayTeam, kickoff],
  );

  return (
    <motion.main
      className="page"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <section className="section-surface">
        <button type="button" className="profile-back-btn floating-surface stats-back-btn" onClick={() => navigate(-1)}>
          <span className="profile-back-chevron" aria-hidden="true">‹</span>
          <span>Назад к матчам</span>
        </button>
        <h2 className="headline-md">Статистика матча</h2>
        <p className="body-lg stats-teams">{homeTeam} vs {awayTeam}</p>
        <p className="fixture-sub">{kickoff}</p>
      </section>

      <section className="section-surface">
        <div className="stats-list">
          {stats.map((row) => {
            const total = Math.max(1, row.home + row.away);
            const homeWidth = `${(row.home / total) * 100}%`;
            const awayWidth = `${(row.away / total) * 100}%`;
            const homeLead = row.home >= row.away;
            const awayLead = row.away >= row.home;
            return (
              <div className="stats-row" key={row.label}>
                <div className="stats-row-head">
                  <strong>{row.home}{row.suffix}</strong>
                  <span>{row.label}</span>
                  <strong>{row.away}{row.suffix}</strong>
                </div>
                <div className="stats-bars">
                  <div className={`stats-bar ${homeLead ? 'stats-bar--lead' : 'stats-bar--trail'}`} style={{ width: homeWidth }} />
                  <div className={`stats-bar ${awayLead ? 'stats-bar--lead' : 'stats-bar--trail'}`} style={{ width: awayWidth }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </motion.main>
  );
};

export default MatchStatsPage;
