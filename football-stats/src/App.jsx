import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LiveScoresPage from './pages/LiveScoresPage';
import ProfilePage from './pages/profilePage';
import AccountPage from './pages/AccountPage';
import TabBar from './components/TabBar';
import Tables from './pages/Tables';
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
        </Routes>
        <TabBar />
      </div>
    </Router>
  );
};

export default App;