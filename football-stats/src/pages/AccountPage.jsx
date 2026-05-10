import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const MotionMain = motion.main;

const AccountPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, isAuthenticated, register, login, logout, updateDisplayNameForCurrentUser } = useAuth();
  const [mode, setMode] = useState('login');
  const [registerRole, setRegisterRole] = useState('user');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  useEffect(() => {
    setDisplayName(currentUser?.displayName || '');
  }, [currentUser?.displayName]);

  useEffect(() => {
    if (location.state?.adminDenied) {
      setFormError('Доступ только для аккаунта администратора.');
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state?.adminDenied, location.pathname, navigate]);

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    setFormSuccess('');
    try {
      if (mode === 'register') {
        await register({ username, password, role: registerRole });
        setFormSuccess('Аккаунт создан.');
      } else {
        await login({ username, password });
        setFormSuccess('Вход выполнен.');
      }
      setPassword('');
    } catch (error) {
      setFormError(error.message || 'Не удалось выполнить авторизацию');
    }
  };

  const handleDisplayNameSave = (event) => {
    event.preventDefault();
    setFormError('');
    setFormSuccess('');
    try {
      updateDisplayNameForCurrentUser(displayName);
      setFormSuccess('Имя обновлено.');
    } catch (error) {
      setFormError(error.message || 'Не удалось обновить имя');
    }
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/profile');
  };

  return (
    <MotionMain
      className="page"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <section className="section-surface section-surface--plain account-section">
        <div className="profile-top-actions">
          <button
            type="button"
            className="profile-back-btn floating-surface"
            onClick={handleBack}
            aria-label="Назад"
            title="Назад"
          >
            <span className="profile-back-chevron" aria-hidden="true">‹</span>
          </button>
          <h2 className="headline-md">Профиль</h2>
        </div>

        {!isAuthenticated ? (
          <div className="auth-stack">
            <div className="auth-mode-toggle">
              <button
                type="button"
                className={`segmented-btn ${mode === 'login' ? 'segmented-btn--active' : ''}`}
                onClick={() => setMode('login')}
              >
                Вход
              </button>
              <button
                type="button"
                className={`segmented-btn ${mode === 'register' ? 'segmented-btn--active' : ''}`}
                onClick={() => setMode('register')}
              >
                Регистрация
              </button>
            </div>
            {mode === 'register' ? (
              <div className="auth-mode-toggle auth-role-toggle" aria-label="Тип аккаунта">
                <button
                  type="button"
                  className={`segmented-btn ${registerRole === 'user' ? 'segmented-btn--active' : ''}`}
                  onClick={() => setRegisterRole('user')}
                >
                  Пользователь
                </button>
                <button
                  type="button"
                  className={`segmented-btn ${registerRole === 'admin' ? 'segmented-btn--active' : ''}`}
                  onClick={() => setRegisterRole('admin')}
                >
                  Администратор
                </button>
              </div>
            ) : null}
            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <label className="label-md" htmlFor="accountUsername">Логин</label>
              <input
                id="accountUsername"
                className="pill-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="Введите логин"
              />
              <label className="label-md" htmlFor="accountPassword">Пароль</label>
              <input
                id="accountPassword"
                type="password"
                className="pill-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                placeholder="Введите пароль"
              />
              <button type="submit" className="pill-btn pill-btn--primary">
                {mode === 'register' ? 'Создать аккаунт' : 'Войти'}
              </button>
            </form>
          </div>
        ) : (
          <div className="profile-stack">
            {currentUser?.role === 'admin' ? (
              <Link className="pill-btn pill-btn--secondary admin-entry-link" to="/profile/data">
                Управление данными
              </Link>
            ) : null}
            <form className="auth-form" onSubmit={handleDisplayNameSave}>
              <label className="label-md" htmlFor="displayName">Имя</label>
              <input
                id="displayName"
                className="pill-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Введите имя"
              />
              <button type="submit" className="pill-btn pill-btn--primary">Сохранить имя</button>
            </form>
            <button type="button" className="pill-btn pill-btn--secondary" onClick={logout}>
              Выйти
            </button>
          </div>
        )}

        {formError ? <p className="body-lg auth-feedback auth-feedback--error">{formError}</p> : null}
        {formSuccess ? <p className="body-lg auth-feedback auth-feedback--success">{formSuccess}</p> : null}
      </section>
    </MotionMain>
  );
};

export default AccountPage;
