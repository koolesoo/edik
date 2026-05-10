import React from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';

const RPL_BALL_ICON_URL = 'https://cdn.premierliga.ru/resources/images/icons/match/ball.svg';

const ProfileLayout = () => {
  const { currentUser, isAuthenticated } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  return (
    <motion.main
      className="page page--hero-bleed"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <section className="page-hero">
        <div className="page-hero-card">
          <Link to="/account" className="profile-hero-sheet" aria-label="Открыть профиль">
            <div className="profile-hero-sheet-row">
              <span className="profile-hero-avatar" aria-hidden="true">
                <img
                  className="profile-hero-ball-img"
                  src={RPL_BALL_ICON_URL}
                  alt=""
                  width={28}
                  height={28}
                  loading="eager"
                  decoding="async"
                />
              </span>
              <div className="profile-hero-sheet-text">
                <span className="profile-hero-name">
                  {isAuthenticated ? (currentUser.displayName || currentUser.username) : 'Профиль'}
                </span>
                <span className="profile-hero-edit-label">Редактировать</span>
              </div>
            </div>
          </Link>
          {isAuthenticated && isAdmin ? (
            <div className="tables-source-toggle" role="tablist" aria-label="Раздел профиля">
              <NavLink
                end
                to="/profile"
                className={({ isActive }) =>
                  `segmented-btn${isActive ? ' segmented-btn--active' : ''}`
                }
              >
                Команда
              </NavLink>
              <NavLink
                to="/profile/data"
                className={({ isActive }) =>
                  `segmented-btn${isActive ? ' segmented-btn--active' : ''}`
                }
              >
                Данные
              </NavLink>
            </div>
          ) : null}
        </div>
      </section>
      <Outlet />
    </motion.main>
  );
};

export default ProfileLayout;
