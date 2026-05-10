import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { addTournament } from '../../services/adminCatalog';

const MotionSection = motion.section;

const AdminCreateTournament = () => {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [err, setErr] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setErr('');
    try {
      addTournament(name);
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
          <h2 className="headline-md">Новый турнир</h2>
        </div>
        <form className="auth-form admin-create-form" onSubmit={handleSubmit}>
          <label className="label-md" htmlFor="newTournName">Название</label>
          <input
            id="newTournName"
            className="pill-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например, Корпоративная лига"
            required
          />
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

export default AdminCreateTournament;
