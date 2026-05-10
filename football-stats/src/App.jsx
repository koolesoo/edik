import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Navigate, Routes, Route, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LiveScoresPage from './pages/LiveScoresPage';
import ProfileLayout from './pages/ProfileLayout';
import ProfileTeamPage from './pages/profilePage';
import AccountPage from './pages/AccountPage';
import MatchStatsPage from './pages/MatchStatsPage';
import { RequireAdmin } from './components/RequireAdmin';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminCreateTournament from './pages/admin/AdminCreateTournament';
import AdminCreateTeam from './pages/admin/AdminCreateTeam';
import AdminCreateMatch from './pages/admin/AdminCreateMatch';
import AdminMatchStatsPage from './pages/admin/AdminMatchStatsPage';
import TabBar from './components/TabBar';
import Tables from './pages/Tables';
import { CrestProvider } from './context/CrestContext';
import './App.css';

const LegacyAdminRedirect = () => {
  const loc = useLocation();
  const rest = loc.pathname.replace(/^\/admin\/?/, '').replace(/\/$/, '');
  const target = rest ? `/profile/data/${rest}` : '/profile/data';
  return <Navigate to={target} replace />;
};

const App = () => {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return (
    <Router>
      <CrestProvider>
        <div className="app-shell">
          {!isOnline ? (
            <div className="network-banner" role="status" aria-live="polite">
              Нет сети. Данные могут не обновляться.
            </div>
          ) : null}
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/matches" element={<LiveScoresPage mode="results" />} />
            <Route path="/profile" element={<ProfileLayout />}>
              <Route index element={<ProfileTeamPage />} />
              <Route path="data" element={<RequireAdmin />}>
                <Route index element={<AdminDashboard />} />
                <Route path="create/tournament" element={<AdminCreateTournament />} />
                <Route path="create/team" element={<AdminCreateTeam />} />
                <Route path="create/match" element={<AdminCreateMatch />} />
                <Route path="stats/:matchId" element={<AdminMatchStatsPage />} />
              </Route>
            </Route>
            <Route path="/admin/*" element={<LegacyAdminRedirect />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/tables" element={<Tables />} />
            <Route path="/match-stats" element={<MatchStatsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <TabBar />
        </div>
      </CrestProvider>
    </Router>
  );
};

export default App;