import React, { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getPremierLeagueStandings } from '../services/api';
import gameIcon from '../assets/game-icon-v2.svg';
import liveIcon from '../assets/live-icon.svg';
import './TabBar.css';

const TabIcon = ({ path }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
    <path d={path} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const normalizeTeamKey = (name) => String(name || '')
  .toLowerCase()
  .replace(/\bfc\b/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const iconPaths = {
  tables: 'M8 4h8v2h3v3a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5V6h3V4z M10 14h4v2a2 2 0 0 1-2 2a2 2 0 0 1-2-2z M9 20h6',
  team: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M5 20a7 7 0 0 1 14 0',
};

const TabBar = () => {
  const { currentUser } = useAuth();
  const [crestByTeam, setCrestByTeam] = useState({});

  useEffect(() => {
    let cancelled = false;
    const loadCrests = async () => {
      try {
        const standings = await getPremierLeagueStandings();
        if (!cancelled && Array.isArray(standings)) {
          const nextMap = standings.reduce((acc, row) => {
            if (row?.team && row?.crest) acc[row.team] = row.crest;
            return acc;
          }, {});
          setCrestByTeam(nextMap);
        }
      } catch (_) {
        // No-op: fallback icon remains visible.
      }
    };
    loadCrests();
    return () => {
      cancelled = true;
    };
  }, []);

  const favoriteTeam = currentUser?.favoriteTeam || '';
  const favoriteTeamCrest = useMemo(() => {
    if (!favoriteTeam) return '';
    if (crestByTeam[favoriteTeam]) return crestByTeam[favoriteTeam];
    const normalized = normalizeTeamKey(favoriteTeam);
    const matchedEntry = Object.entries(crestByTeam).find(([team]) => normalizeTeamKey(team) === normalized);
    return matchedEntry?.[1] || '';
  }, [crestByTeam, favoriteTeam]);

  const favoriteTeamAbbr = useMemo(
    () =>
      String(favoriteTeam || 'TM')
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase(),
    [favoriteTeam],
  );

  return (
    <div className="tab-bar floating-surface">
      <NavLink
        to="/"
        className={({ isActive }) => (isActive ? 'tab-item active' : 'tab-item')}
      >
        <div className="tab-icon">
          <img src={liveIcon} alt="" className="tab-live-icon" loading="lazy" />
        </div>
        <span className="tab-label-full">Live</span>
        <span className="tab-label-short">Live</span>
      </NavLink>

      <NavLink
        to="/matches"
        className={({ isActive }) => (isActive ? 'tab-item active' : 'tab-item')}
      >
        <div className="tab-icon">
          <img src={gameIcon} alt="" className="tab-matches-icon" loading="lazy" />
        </div>
        <span className="tab-label-full">Все игры</span>
        <span className="tab-label-short">Игры</span>
      </NavLink>

      <NavLink
        to="/tables"
        className={({ isActive }) => (isActive ? 'tab-item active' : 'tab-item')}
      >
        <div className="tab-icon">
          <TabIcon path={iconPaths.tables} />
        </div>
        <span className="tab-label-full">Таблицы</span>
        <span className="tab-label-short">Таблица</span>
      </NavLink>

      <NavLink
        to="/profile"
        className={({ isActive }) => (isActive ? 'tab-item active' : 'tab-item')}
      >
        <div className="tab-icon">
          {favoriteTeamCrest ? (
            <img src={favoriteTeamCrest} alt="" className="tab-team-logo" loading="lazy" />
          ) : (
            <span className="tab-team-fallback" aria-hidden="true">
              {favoriteTeam ? favoriteTeamAbbr : <TabIcon path={iconPaths.team} />}
            </span>
          )}
        </div>
        <span className="tab-label-full">Команда</span>
        <span className="tab-label-short">Команда</span>
      </NavLink>
    </div>
  );
};

export default TabBar;