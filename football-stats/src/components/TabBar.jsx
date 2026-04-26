import React from 'react';
import { NavLink } from 'react-router-dom';
import './TabBar.css';

const TabBar = () => {
  return (
    <div className="tab-bar floating-surface">
      <NavLink
        to="/"
        className={({ isActive }) => (isActive ? 'tab-item active' : 'tab-item')}
      >
        <div className="tab-icon">
          <img src="/images/home.png" alt="Главная" />
        </div>
        <span>Live</span>
      </NavLink>

      <NavLink
        to="/matches"
        className={({ isActive }) => (isActive ? 'tab-item active' : 'tab-item')}
      >
        <div className="tab-icon">
          <img src="/images/matches.png" alt="Матчи" />
        </div>
        <span>Все игры</span>
      </NavLink>

      <NavLink
        to="/tables"
        className={({ isActive }) => (isActive ? 'tab-item active' : 'tab-item')}
      >
        <div className="tab-icon">
          <img src="/images/trophy.png" alt="Таблицы" />
        </div>
        <span>Таблицы</span>
      </NavLink>

      <NavLink
        to="/profile"
        className={({ isActive }) => (isActive ? 'tab-item active' : 'tab-item')}
      >
        <div className="tab-icon">
          <img src="/images/user.png" alt="Моя команда" />
        </div>
        <span>Команда</span>
      </NavLink>
    </div>
  );
};

export default TabBar;