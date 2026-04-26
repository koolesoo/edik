import React from 'react';
import { NavLink } from 'react-router-dom';
import './TabBar.css';

const TabIcon = ({ path }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
    <path d={path} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const iconPaths = {
  home: 'M3 10.5L12 3l9 7.5V21h-6v-6H9v6H3z',
  matches: 'M4 5h16v14H4z M4 10h16 M9 5v14 M15 5v14',
  tables: 'M4 4h16v16H4z M4 10h16 M10 4v16',
  team: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M5 20a7 7 0 0 1 14 0',
};

const TabBar = () => {
  return (
    <div className="tab-bar floating-surface">
      <NavLink
        to="/"
        className={({ isActive }) => (isActive ? 'tab-item active' : 'tab-item')}
      >
        <div className="tab-icon">
          <TabIcon path={iconPaths.home} />
        </div>
        <span>Live</span>
      </NavLink>

      <NavLink
        to="/matches"
        className={({ isActive }) => (isActive ? 'tab-item active' : 'tab-item')}
      >
        <div className="tab-icon">
          <TabIcon path={iconPaths.matches} />
        </div>
        <span>Все игры</span>
      </NavLink>

      <NavLink
        to="/tables"
        className={({ isActive }) => (isActive ? 'tab-item active' : 'tab-item')}
      >
        <div className="tab-icon">
          <TabIcon path={iconPaths.tables} />
        </div>
        <span>Таблицы</span>
      </NavLink>

      <NavLink
        to="/profile"
        className={({ isActive }) => (isActive ? 'tab-item active' : 'tab-item')}
      >
        <div className="tab-icon">
          <TabIcon path={iconPaths.team} />
        </div>
        <span>Команда</span>
      </NavLink>
    </div>
  );
};

export default TabBar;