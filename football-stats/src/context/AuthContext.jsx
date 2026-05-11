import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { describeAxiosError } from '../services/api';
import { setAdminCatalogContext } from '../services/adminCatalog';

const TOKEN_KEY = 'footstat.auth.jwt.v1';

const readToken = () => {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? String(raw).trim() : '';
  } catch {
    return '';
  }
};

const persistToken = (token) => {
  try {
    if (!token) {
      localStorage.removeItem(TOKEN_KEY);
      return;
    }
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    throw new Error('Не удалось сохранить токен в браузере.');
  }
};

const normalizeUser = (user) => ({
  id: user?.id != null && Number.isFinite(Number(user.id)) ? Number(user.id) : null,
  username: user.username,
  displayName: user.displayName ?? user.username,
  favoriteTeam: user.favoriteTeam ?? '',
  role: user.role === 'admin' ? 'admin' : 'user',
  createdAt: user.createdAt ?? '',
});

const mapAuthError = (e) => {
  const body = e?.response?.data;
  if (body && typeof body.error === 'string') return new Error(body.error);
  return new Error(describeAxiosError(e));
};

const authHeaders = () => {
  const t = readToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const syncCatalogFromUser = useCallback((user) => {
    if (!user) {
      setAdminCatalogContext(null, null, false);
      return;
    }
    setAdminCatalogContext(user.id, user.username, user.role === 'admin');
  }, []);

  const applyAuthSuccess = useCallback(
    (payload) => {
      const token = payload?.token;
      const user = payload?.user;
      if (!token || !user) {
        throw new Error('Некорректный ответ сервера');
      }
      persistToken(token);
      const normalized = normalizeUser(user);
      setCurrentUser(normalized);
      syncCatalogFromUser(normalized);
    },
    [syncCatalogFromUser],
  );

  useEffect(() => {
    let cancelled = false;
    const token = readToken();
    if (!token) {
      setAdminCatalogContext(null, null, false);
      setAuthReady(true);
      return undefined;
    }
    api
      .get('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!cancelled) {
          const normalized = normalizeUser(res.data);
          setCurrentUser(normalized);
          syncCatalogFromUser(normalized);
        }
      })
      .catch(() => {
        if (!cancelled) {
          persistToken('');
          setCurrentUser(null);
          setAdminCatalogContext(null, null, false);
        }
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [syncCatalogFromUser]);

  const register = useCallback(
    async ({ username, password, role: registrationRole }) => {
      const cleanUsername = String(username || '').trim();
      const cleanPassword = String(password || '').trim();
      if (!cleanUsername || !cleanPassword) {
        throw new Error('Введите логин и пароль');
      }
      const role = registrationRole === 'admin' ? 'admin' : 'user';
      try {
        const res = await api.post('/auth/register', {
          username: cleanUsername,
          password: cleanPassword,
          role,
        });
        applyAuthSuccess(res.data);
        return normalizeUser(res.data.user);
      } catch (e) {
        throw mapAuthError(e);
      }
    },
    [applyAuthSuccess],
  );

  const login = useCallback(
    async ({ username, password }) => {
      const cleanUsername = String(username || '').trim();
      const cleanPassword = String(password || '').trim();
      try {
        const res = await api.post('/auth/login', { username: cleanUsername, password: cleanPassword });
        applyAuthSuccess(res.data);
        return normalizeUser(res.data.user);
      } catch (e) {
        throw mapAuthError(e);
      }
    },
    [applyAuthSuccess],
  );

  const logout = useCallback(() => {
    persistToken('');
    setCurrentUser(null);
    setAdminCatalogContext(null, null, false);
  }, []);

  const patchMe = useCallback(async (body) => {
    try {
      const res = await api.patch('/auth/me', body, { headers: authHeaders() });
      const next = normalizeUser(res.data);
      setCurrentUser(next);
      syncCatalogFromUser(next);
      return next;
    } catch (e) {
      throw mapAuthError(e);
    }
  }, [syncCatalogFromUser]);

  const setFavoriteTeamForCurrentUser = useCallback(
    async (teamName) => {
      if (!readToken()) {
        throw new Error('Нужна авторизация');
      }
      await patchMe({ favoriteTeam: String(teamName || '').trim() });
    },
    [patchMe],
  );

  const updateDisplayNameForCurrentUser = useCallback(
    async (displayName) => {
      if (!readToken()) {
        throw new Error('Нужна авторизация');
      }
      const cleanName = String(displayName || '').trim();
      if (!cleanName) {
        throw new Error('Имя не может быть пустым');
      }
      await patchMe({ displayName: cleanName });
    },
    [patchMe],
  );

  const value = useMemo(
    () => ({
      currentUser,
      isAuthenticated: Boolean(currentUser),
      authReady,
      register,
      login,
      logout,
      setFavoriteTeamForCurrentUser,
      updateDisplayNameForCurrentUser,
    }),
    [
      currentUser,
      authReady,
      register,
      login,
      logout,
      setFavoriteTeamForCurrentUser,
      updateDisplayNameForCurrentUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
};
