import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { addTeam, listTournaments } from '../../services/adminCatalog';

const MotionSection = motion.section;

const AdminCreateTeam = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { authReady } = useAuth();
  const initialTid = params.get('tournamentId') || '';
  const tournaments = useMemo(() => (authReady ? listTournaments() : []), [authReady]);
  const [tournamentId, setTournamentId] = useState(initialTid);
  const [name, setName] = useState('');
  const [crestUrl, setCrestUrl] = useState('');
  const [err, setErr] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setErr('');
    try {
      addTeam(tournamentId, name, crestUrl);
      navigate('/profile/data');
    } catch (ex) {
      setErr(ex?.message || 'Ошибка');
    }
  };

  return (
    <MotionSection className="admin-page" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}>
      <section className="section-surface section-surface--plain account-section">
        <div className="profile-top-actions">
          <button type="button" className="profile-back-btn floating-surface" onClick={() => navigate('/profile/data')} aria-label="Назад">
            <span className="profile-back-chevron" aria-hidden="true">‹</span>
          </button>
          <h2 className="headline-md">Новая команда</h2>
        </div>
        {tournaments.length === 0 ? (
          <p className="body-lg admin-muted admin-create-hint">
            Сначала нужен турнир —
            {' '}
            <Link to="/profile/data/create/tournament" className="admin-inline-link">создать турнир</Link>
            .
          </p>
        ) : null}
        <form className="auth-form admin-create-form" onSubmit={handleSubmit}>
          <label className="label-md" htmlFor="teamTournament">Турнир</label>
          <select
            id="teamTournament"
            className="pill-input admin-select"
            value={tournamentId}
            onChange={(e) => setTournamentId(e.target.value)}
            required
          >
            <option value="">— выберите турнир —</option>
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <label className="label-md" htmlFor="teamName">Название команды</label>
          <input id="teamName" className="pill-input" value={name} onChange={(e) => setName(e.target.value)} required />
          <label className="label-md" htmlFor="teamCrest">URL эмблемы (необязательно)</label>
          <input id="teamCrest" className="pill-input" value={crestUrl} onChange={(e) => setCrestUrl(e.target.value)} placeholder="https://…" />
          <div className="admin-create-actions">
            <button type="button" className="pill-btn pill-btn--secondary" onClick={() => navigate('/profile/data')}>
              Отмена
            </button>
            <button type="submit" className="pill-btn pill-btn--primary">Создать</button>
          </div>
        </form>
        {err ? <p className="body-lg auth-feedback auth-feedback--error">{err}</p> : null}
      </section>
    </MotionSection>
  );
};

export default AdminCreateTeam;
