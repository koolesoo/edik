import React, { createContext, useContext, useMemo, useRef, useState } from 'react';

const USERS_KEY = 'footstat.users.v2';
const LEGACY_USERS_KEY = 'footstat.users.v1';
const SESSION_KEY = 'footstat.session.v1';

const migrateUsersFromStorage = () => {
  try {
    const rawV2 = localStorage.getItem(USERS_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2);
      return Array.isArray(parsed) ? parsed : [];
    }
    const rawV1 = localStorage.getItem(LEGACY_USERS_KEY);
    if (!rawV1) return [];
    const parsed = JSON.parse(rawV1);
    if (!Array.isArray(parsed)) return [];
    const merged = parsed.map((u) => ({
      ...u,
      role: u.role === 'admin' ? 'admin' : 'user',
    }));
    localStorage.setItem(USERS_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return [];
  }
};

const normalizeUser = (user) => ({
  ...user,
  role: user.role === 'admin' ? 'admin' : 'user',
});

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
  const [users, setUsers] = useState(() => {
    const list = migrateUsersFromStorage();
    return Array.isArray(list) ? list.map(normalizeUser) : [];
  });
  const [session, setSession] = useState(() => readJson(SESSION_KEY, null));
  const usersRef = useRef(users);
  usersRef.current = users;

  const persistUsers = (nextUsers) => {
    try {
      localStorage.setItem(USERS_KEY, JSON.stringify(nextUsers));
    } catch {
      throw new Error('Не удалось сохранить в браузере (режим инкогнито, квота или запрет хранилища).');
    }
    setUsers(nextUsers);
  };

  const persistSession = (nextSession) => {
    if (!nextSession) {
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch {
        /* выход из сессии в памяти оставляем даже при ошибке хранилища */
      }
      setSession(null);
      return;
    }
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    } catch {
      throw new Error('Не удалось сохранить сессию в браузере.');
    }
    setSession(nextSession);
  };

  const register = ({ username, password, role: registrationRole }) => {
    const cleanUsername = String(username || '').trim();
    const cleanPassword = String(password || '').trim();
    if (!cleanUsername || !cleanPassword) {
      throw new Error('Введите логин и пароль');
    }
    const role = registrationRole === 'admin' ? 'admin' : 'user';
    const list = Array.isArray(usersRef.current) ? usersRef.current : [];
    if (list.some((user) => user.username.toLowerCase() === cleanUsername.toLowerCase())) {
      throw new Error('Пользователь уже существует');
    }
    const newUser = {
      username: cleanUsername,
      displayName: cleanUsername,
      password: cleanPassword,
      favoriteTeam: '',
      role,
      createdAt: new Date().toISOString(),
    };
    const nextUsers = [...list, newUser];
    persistUsers(nextUsers);
    persistSession({ username: newUser.username });
    return newUser;
  };

  const login = ({ username, password }) => {
    const cleanUsername = String(username || '').trim();
    const cleanPassword = String(password || '').trim();
    const list = Array.isArray(usersRef.current) ? usersRef.current : [];
    const found = list.find(
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
    const uname = session?.username;
    if (!uname) {
      throw new Error('Нужна авторизация');
    }
    const list = Array.isArray(usersRef.current) ? usersRef.current : [];
    if (!list.some((u) => u.username === uname)) {
      throw new Error('Пользователь не найден. Выйдите и войдите снова.');
    }
    const nextUsers = list.map((user) =>
      user.username === uname ? { ...user, favoriteTeam: teamName } : user,
    );
    persistUsers(nextUsers);
  };

  const updateDisplayNameForCurrentUser = (displayName) => {
    const uname = session?.username;
    if (!uname) {
      throw new Error('Нужна авторизация');
    }
    const cleanName = String(displayName || '').trim();
    if (!cleanName) {
      throw new Error('Имя не может быть пустым');
    }
    const list = Array.isArray(usersRef.current) ? usersRef.current : [];
    if (!list.some((u) => u.username === uname)) {
      throw new Error('Пользователь не найден. Выйдите и войдите снова.');
    }
    const nextUsers = list.map((user) =>
      user.username === uname ? { ...user, displayName: cleanName } : user,
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
