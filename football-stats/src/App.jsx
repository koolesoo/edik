import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Navigate, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LiveScoresPage from './pages/LiveScoresPage';
import ProfilePage from './pages/profilePage';
import AccountPage from './pages/AccountPage';
import MatchStatsPage from './pages/MatchStatsPage';
import TabBar from './components/TabBar';
import Tables from './pages/Tables';
import { CrestProvider } from './context/CrestContext';
import './App.css';

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
            <Route path="/profile" element={<ProfilePage />} />
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