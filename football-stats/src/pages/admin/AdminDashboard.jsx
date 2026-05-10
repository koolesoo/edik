import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const MotionSection = motion.section;

const AdminDashboard = () => (
    <MotionSection
      className="admin-page"
      aria-labelledby="admin-dashboard-heading"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <section className="section-surface section-surface--plain account-section account-section--admin-hub">
        <h2 className="headline-md admin-dashboard-title" id="admin-dashboard-heading">
          Управление данными
        </h2>

        <p className="body-lg admin-muted">
          Добавляйте турниры, команды и матчи на отдельных экранах. Дальнейшая информация отображается в привычных разделах приложения рядом с РПЛ.
        </p>

        <div className="admin-hub-actions">
          <Link className="pill-btn admin-hub-pill" to="/profile/data/create/tournament">
            Новый турнир
          </Link>
          <Link className="pill-btn admin-hub-pill" to="/profile/data/create/team">
            Новая команда
          </Link>
          <Link className="pill-btn admin-hub-pill" to="/profile/data/create/match">
            Новый матч
          </Link>
        </div>

        <div className="inner-auth-card admin-data-info">
          <p className="body-lg admin-muted admin-data-info-text">
            <strong className="admin-data-info-strong">Где смотреть</strong>
            {' — '}
            матчи ваших турниров: вкладки Live и «Все игры». Таблица: вкладка «Таблицы», переключатель между РПЛ и названием турнира.
          </p>
        </div>
      </section>
    </MotionSection>
);

export default AdminDashboard;
