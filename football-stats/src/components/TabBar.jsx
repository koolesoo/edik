import React, { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useCrestMap } from '../context/CrestContext';
import { preferCrest } from '../localCrests';
import gameIcon from '../assets/game-icon-v2.svg';
import liveIcon from '../assets/live-icon.svg';
import './TabBar.css';

const MotionTabPill = motion.div;

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

function TabItemLink({ to, end, pillTransition, children }) {
  return (
    <NavLink end={end} to={to} className={({ isActive }) => `tab-item${isActive ? ' active' : ''}`}>
      {({ isActive }) => (
        <>
          {isActive ? (
            <MotionTabPill
              layoutId="tab-bar-active-pill"
              className="tab-item-highlight"
              transition={pillTransition}
              aria-hidden="true"
            />
          ) : null}
          {children}
        </>
      )}
    </NavLink>
  );
}

const TabBar = () => {
  const { currentUser } = useAuth();
  const { crestByTeam } = useCrestMap();
  const reduceMotion = useReducedMotion();

  const pillTransition = useMemo(
    () =>
      reduceMotion
        ? { duration: 0.12, ease: 'easeOut' }
        : { type: 'spring', stiffness: 400, damping: 36, mass: 0.82 },
    [reduceMotion],
  );

  const favoriteTeam = currentUser?.favoriteTeam || '';
  const favoriteTeamCrest = useMemo(() => {
    if (!favoriteTeam) return '';
    let fromMap = crestByTeam[favoriteTeam];
    if (!fromMap) {
      const normalized = normalizeTeamKey(favoriteTeam);
      const matchedEntry = Object.entries(crestByTeam).find(([team]) => normalizeTeamKey(team) === normalized);
      fromMap = matchedEntry?.[1] || '';
    }
    return preferCrest(favoriteTeam, fromMap);
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
    <LayoutGroup id="main-tab-bar">
      <div className="tab-bar floating-surface">
        <TabItemLink to="/" pillTransition={pillTransition}>
          <div className="tab-icon">
            <img src={liveIcon} alt="" className="tab-live-icon" loading="lazy" />
          </div>
          <span className="tab-label-full">Live</span>
          <span className="tab-label-short">Live</span>
        </TabItemLink>

        <TabItemLink to="/matches" pillTransition={pillTransition}>
          <div className="tab-icon">
            <img src={gameIcon} alt="" className="tab-matches-icon" loading="lazy" />
          </div>
          <span className="tab-label-full">Все игры</span>
          <span className="tab-label-short">Игры</span>
        </TabItemLink>

        <TabItemLink to="/tables" pillTransition={pillTransition}>
          <div className="tab-icon">
            <TabIcon path={iconPaths.tables} />
          </div>
          <span className="tab-label-full">Таблицы</span>
          <span className="tab-label-short">Таблица</span>
        </TabItemLink>

        <TabItemLink to="/profile" end pillTransition={pillTransition}>
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
        </TabItemLink>
      </div>
    </LayoutGroup>
  );
};

export default TabBar;
