import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { addMatch, listTeams, listTournaments } from '../../services/adminCatalog';

const MotionSection = motion.section;

const AdminCreateMatch = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { authReady } = useAuth();
  const initialTid = params.get('tournamentId') || '';
  const tournaments = useMemo(() => (authReady ? listTournaments() : []), [authReady]);
  const [tournamentId, setTournamentId] = useState(initialTid);
  const teams = useMemo(
    () => (authReady && tournamentId ? listTeams(tournamentId) : []),
    [authReady, tournamentId],
  );
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [homeScore, setHomeScore] = useState('0');
  const [awayScore, setAwayScore] = useState('0');
  const [kickoff, setKickoff] = useState('');
  const [matchStatus, setMatchStatus] = useState('FINISHED');
  const [err, setErr] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setErr('');
    try {
      addMatch({
        tournamentId,
        homeTeamId,
        awayTeamId,
        homeScore,
        awayScore,
        utcDate: kickoff || undefined,
        status: matchStatus,
      });
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
          <h2 className="headline-md">Новый матч</h2>
        </div>
        {tournaments.length === 0 ? (
          <p className="body-lg admin-muted admin-create-hint">
            Сначала нужен турнир —
            {' '}
            <Link to="/profile/data/create/tournament" className="admin-inline-link">создать турнир</Link>
            .
          </p>
        ) : null}
        <form className="auth-form admin-create-form admin-match-form" onSubmit={handleSubmit}>
          <label className="label-md" htmlFor="matchTournament">Турнир</label>
          <select
            id="matchTournament"
            className="pill-input admin-select"
            value={tournamentId}
            onChange={(e) => {
              setTournamentId(e.target.value);
              setHomeTeamId('');
              setAwayTeamId('');
            }}
            required
          >
            <option value="">— выберите турнир —</option>
            {tournaments.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {tournamentId && teams.length < 2 ? (
            <p className="body-lg admin-muted">
              В этом турнире нужно минимум две команды —
              {' '}
              <Link to={`/profile/data/create/team?tournamentId=${encodeURIComponent(tournamentId)}`} className="admin-inline-link">
                добавить команду
              </Link>
              .
            </p>
          ) : null}
          {tournamentId && teams.length >= 2 ? (
            <>
              <label className="label-md" htmlFor="matchHome">Хозяева</label>
              <select
                id="matchHome"
                className="pill-input admin-select"
                value={homeTeamId}
                onChange={(e) => setHomeTeamId(e.target.value)}
                required
              >
                <option value="">— команда —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <label className="label-md" htmlFor="matchAway">Гости</label>
              <select
                id="matchAway"
                className="pill-input admin-select"
                value={awayTeamId}
                onChange={(e) => setAwayTeamId(e.target.value)}
                required
              >
                <option value="">— команда —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <div className="admin-score-row">
                <input
                  className="pill-input"
                  type="number"
                  min={0}
                  value={homeScore}
                  onChange={(e) => setHomeScore(e.target.value)}
                  aria-label="Голы хозяев"
                />
                <span className="admin-score-sep">:</span>
                <input
                  className="pill-input"
                  type="number"
                  min={0}
                  value={awayScore}
                  onChange={(e) => setAwayScore(e.target.value)}
                  aria-label="Голы гостей"
                />
              </div>
              <label className="label-md" htmlFor="matchKickoff">Дата и время</label>
              <input id="matchKickoff" className="pill-input" type="datetime-local" value={kickoff} onChange={(e) => setKickoff(e.target.value)} />
              <label className="label-md" htmlFor="matchStatus">Статус</label>
              <select id="matchStatus" className="pill-input admin-select" value={matchStatus} onChange={(e) => setMatchStatus(e.target.value)}>
                <option value="FINISHED">Завершён</option>
                <option value="TIMED">По расписанию</option>
                <option value="IN_PLAY">Идёт</option>
              </select>
            </>
          ) : null}
          <div className="admin-create-actions">
            <button type="button" className="pill-btn pill-btn--secondary" onClick={() => navigate('/profile/data')}>
              Отмена
            </button>
            <button type="submit" className="pill-btn pill-btn--primary" disabled={!tournamentId || teams.length < 2}>
              Создать
            </button>
          </div>
        </form>
        {err ? <p className="body-lg auth-feedback auth-feedback--error">{err}</p> : null}
      </section>
    </MotionSection>
  );
};

export default AdminCreateMatch;
