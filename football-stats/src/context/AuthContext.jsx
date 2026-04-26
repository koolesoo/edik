import React, { createContext, useContext, useMemo, useState } from 'react';

const USERS_KEY = 'footstat.users.v1';
const SESSION_KEY = 'footstat.session.v1';

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [users, setUsers] = useState(() => readJson(USERS_KEY, []));
  const [session, setSession] = useState(() => readJson(SESSION_KEY, null));

  const persistUsers = (nextUsers) => {
    setUsers(nextUsers);
    localStorage.setItem(USERS_KEY, JSON.stringify(nextUsers));
  };

  const persistSession = (nextSession) => {
    setSession(nextSession);
    if (!nextSession) {
      localStorage.removeItem(SESSION_KEY);
      return;
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
  };

  const register = ({ username, password }) => {
    const cleanUsername = String(username || '').trim();
    const cleanPassword = String(password || '').trim();
    if (!cleanUsername || !cleanPassword) {
      throw new Error('Введите логин и пароль');
    }
    if (users.some((user) => user.username.toLowerCase() === cleanUsername.toLowerCase())) {
      throw new Error('Пользователь уже существует');
    }
    const newUser = {
      username: cleanUsername,
      displayName: cleanUsername,
      password: cleanPassword,
      favoriteTeam: '',
      createdAt: new Date().toISOString(),
    };
    const nextUsers = [...users, newUser];
    persistUsers(nextUsers);
    persistSession({ username: newUser.username });
    return newUser;
  };

  const login = ({ username, password }) => {
    const cleanUsername = String(username || '').trim();
    const cleanPassword = String(password || '').trim();
    const found = users.find(
      (user) =>
        user.username.toLowerCase() === cleanUsername.toLowerCase() && user.password === cleanPassword,
    );
    if (!found) {
      throw new Error('Неверный логин или пароль');
    }
    persistSession({ username: found.username });
    return found;
  };

  const logout = () => {
    persistSession(null);
  };

  const currentUser = useMemo(() => {
    if (!session?.username) return null;
    return users.find((user) => user.username === session.username) || null;
  }, [session, users]);

  const setFavoriteTeamForCurrentUser = (teamName) => {
    if (!currentUser) {
      throw new Error('Нужна авторизация');
    }
    const nextUsers = users.map((user) =>
      user.username === currentUser.username ? { ...user, favoriteTeam: teamName } : user,
    );
    persistUsers(nextUsers);
  };

  const updateDisplayNameForCurrentUser = (displayName) => {
    if (!currentUser) {
      throw new Error('Нужна авторизация');
    }
    const cleanName = String(displayName || '').trim();
    if (!cleanName) {
      throw new Error('Имя не может быть пустым');
    }
    const nextUsers = users.map((user) =>
      user.username === currentUser.username ? { ...user, displayName: cleanName } : user,
    );
    persistUsers(nextUsers);
  };

  const value = {
    currentUser,
    isAuthenticated: Boolean(currentUser),
    register,
    login,
    logout,
    setFavoriteTeamForCurrentUser,
    updateDisplayNameForCurrentUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
};
