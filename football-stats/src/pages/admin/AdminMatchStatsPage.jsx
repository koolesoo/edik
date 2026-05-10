import React from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MatchStatsForm } from '../../components/MatchStatsForm';
import { getMatchById, getTeamById } from '../../services/adminCatalog';

const MotionSection = motion.section;

const AdminMatchStatsPage = () => {
  const { matchId: rawId } = useParams();
  const navigate = useNavigate();
  const matchId = rawId ? decodeURIComponent(rawId) : '';
  const match = matchId ? getMatchById(matchId) : null;

  if (!matchId || !match) {
    return <Navigate to="/profile/data" replace />;
  }

  const home = getTeamById(match.homeTeamId);
  const away = getTeamById(match.awayTeamId);

  return (
    <MotionSection className="admin-page" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}>
      <section className="section-surface section-surface--plain account-section">
        <div className="profile-top-actions">
          <button type="button" className="profile-back-btn floating-surface" onClick={() => navigate('/profile/data')} aria-label="Назад">
            <span className="profile-back-chevron" aria-hidden="true">‹</span>
          </button>
          <h2 className="headline-md">Статистика матча</h2>
        </div>
        <p className="body-lg admin-muted">
          {(home?.name || '?')}
          {' — '}
          {(away?.name || '?')}
          {' '}
          (
          {match.homeScore}
          :
          {match.awayScore}
          )
        </p>
        <MatchStatsForm matchId={matchId} />
      </section>
    </MotionSection>
  );
};

export default AdminMatchStatsPage;
