import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Дочерние маршруты доступны только вошедшему пользователю с role === 'admin'.
 * С `<Outlet />` для вложенных маршрутов (например `/profile/data/*`).
 */
export const RequireAdmin = ({ children }) => {
  const { currentUser, isAuthenticated, authReady } = useAuth();
  const location = useLocation();

  if (!authReady) {
    return null;
  }
  if (!isAuthenticated) {
    return <Navigate to="/account" replace state={{ from: location.pathname }} />;
  }
  if (currentUser?.role !== 'admin') {
    return <Navigate to="/account" replace state={{ adminDenied: true }} />;
  }
  return children ?? <Outlet />;
};
