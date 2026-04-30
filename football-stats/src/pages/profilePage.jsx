import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getPremierLeagueStandings, getPremierLeagueTeamOverview } from '../services/api';

const normalizeTeamKey = (name) => String(name || '')
  .toLowerCase()
  .replace(/\bfc\b/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const getCrestForTeamName = (teamName, crestByTeam = {}) => {
  if (!teamName) return '';
  if (crestByTeam[teamName]) return crestByTeam[teamName];
  const normalizedTarget = normalizeTeamKey(teamName);
  const matchedEntry = Object.entries(crestByTeam).find(([key]) => normalizeTeamKey(key) === normalizedTarget);
  return matchedEntry?.[1] || '';
};

const parseFixtureLine = (line, crestByTeam = {}) => {
  if (line && typeof line === 'object' && !Array.isArray(line)) {
    const home = line.homeTeamName || 'Home';
    const away = line.awayTeamName || 'Away';
    return {
      teams: `${home} vs ${away}`,
      date: line.displayDate || 'Дата уточняется',
      status: line.status || 'SCHEDULED',
      homeTeamName: home,
      awayTeamName: away,
      homeCrest: line.homeCrest || getCrestForTeamName(home, crestByTeam) || '',
      awayCrest: line.awayCrest || getCrestForTeamName(away, crestByTeam) || '',
      homeScore: line.homeScore ?? null,
      awayScore: line.awayScore ?? null,
    };
  }

  const text = String(line || '');
  const dateMatch = text.match(/(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})/);
  const statusMatch = text.match(/\[([A-Z_]+)\]\s*$/);
  const cleaned = text.replace(/\s*\[[A-Z_]+\]\s*$/, '');
  const teams = dateMatch?.index != null ? cleaned.slice(0, dateMatch.index).trim() : cleaned.trim();
  return {
    teams: teams || 'Матч',
    date: dateMatch ? `${dateMatch[1]} ${dateMatch[2]}` : 'Дата уточняется',
    status: statusMatch?.[1] || 'SCHEDULED',
    homeTeamName: teams.split(/\s+vs\s+/i)[0] || 'Home',
    awayTeamName: teams.split(/\s+vs\s+/i)[1] || 'Away',
    homeCrest: getCrestForTeamName(teams.split(/\s+vs\s+/i)[0], crestByTeam) || '',
    awayCrest: getCrestForTeamName(teams.split(/\s+vs\s+/i)[1], crestByTeam) || '',
    homeScore: null,
    awayScore: null,
  };
};

const ProfilePage = () => {
  const { currentUser, isAuthenticated, setFavoriteTeamForCurrentUser } = useAuth();
  const [teamOverview, setTeamOverview] = useState(null);
  const [, setOverviewError] = useState('');
  const [isLoadingOverview, setIsLoadingOverview] = useState(false);
  const [crestByTeam, setCrestByTeam] = useState({});

  const statusLabelMap = useMemo(
    () => ({
      IN_PLAY: 'LIVE',
      PAUSED: 'Перерыв',
      FINISHED: 'Завершен',
      TIMED: 'По расписанию',
      SCHEDULED: 'Скоро',
    }),
    [],
  );

  const statusIconMap = useMemo(
    () => ({
      IN_PLAY: '🔴',
      PAUSED: '⏸',
      FINISHED: '✓',
      TIMED: '🕒',
      SCHEDULED: '📅',
    }),
    [],
  );
  const [isDeleteSheetOpen, setIsDeleteSheetOpen] = useState(false);

  const renderTeamInlineNoLike = (teamName, crest, score) => {
    const safeName = teamName || 'Team';
    const shortName = safeName
      .split(' ')
      .filter(Boolean)
      .slice(0, 3)
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 3);

    return (
      <span className="fixture-team-inline fixture-team-inline--left fixture-team-inline--nolike">
        {crest ? (
          <img src={crest} alt={safeName} className="fixture-team-logo" loading="lazy" />
        ) : (
          <span className="fixture-team-logo fixture-team-logo--fallback" aria-hidden="true">
            {shortName || safeName.slice(0, 3).toUpperCase()}
          </span>
        )}
        <span className="fixture-team-name">{safeName}</span>
        <span className="fixture-team-score">{score ?? '-'}</span>
      </span>
    );
  };

  const isUpcomingFixture = (status) => status === 'SCHEDULED' || status === 'TIMED';

  const clearFavoriteTeam = () => {
    setFavoriteTeamForCurrentUser('');
    setTeamOverview(null);
    setOverviewError('');
    setIsDeleteSheetOpen(false);
  };

  useEffect(() => {
    if (!isAuthenticated || !currentUser?.favoriteTeam) {
      setTeamOverview(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setOverviewError('');
      setIsLoadingOverview(true);
      try {
        const data = await getPremierLeagueTeamOverview(currentUser.favoriteTeam);
        if (!cancelled) {
          setTeamOverview(data);
        }
      } catch (error) {
        if (!cancelled) {
          setOverviewError(error.message || 'Не удалось загрузить данные команды');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingOverview(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, currentUser?.favoriteTeam]);

  useEffect(() => {
    let cancelled = false;
    const loadCrests = async () => {
      try {
        const standings = await getPremierLeagueStandings();
        if (!cancelled && Array.isArray(standings)) {
          const map = standings.reduce((acc, row) => {
            if (row?.team && row?.crest) {
              acc[row.team] = row.crest;
            }
            return acc;
          }, {});
          setCrestByTeam(map);
        }
      } catch (_) {
        // Silent fallback: fixture list still renders.
      }
    };
    loadCrests();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayOverview = isAuthenticated ? teamOverview : null;
  const hasFavoriteTeam = Boolean(currentUser?.favoriteTeam);

  if (isLoadingOverview) {
    return (
      <motion.main
        className="page"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <section className="section-surface section-surface--team-feature">
          <div className="skeleton-line skeleton-line--title skeleton-shimmer" />
          <div className="team-overview-grid">
            {Array.from({ length: 4 }).map((_, index) => (
              <div className="team-stat-pill skeleton-card" key={`profile-stat-skeleton-${index}`}>
                <div className="skeleton-line skeleton-line--label skeleton-shimmer" />
                <div className="skeleton-line skeleton-line--value skeleton-shimmer" />
              </div>
            ))}
          </div>
          <div className="profile-fixtures">
            <div className="skeleton-line skeleton-line--label skeleton-shimmer" />
            {Array.from({ length: 3 }).map((_, index) => (
              <div className="section-surface fixture-card skeleton-card" key={`profile-fixture-skeleton-${index}`}>
                <div className="skeleton-line skeleton-line--row skeleton-shimmer" />
                <div className="skeleton-line skeleton-line--row skeleton-shimmer" />
                <div className="skeleton-line skeleton-line--meta skeleton-shimmer" />
              </div>
            ))}
          </div>
        </section>
      </motion.main>
    );
  }

  return (
    <motion.main
      className="page"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <section className="section-surface section-surface--plain">
        <div className="profile-top-actions">
          <Link to="/account" className="profile-badge floating-surface" aria-label="Открыть профиль">
            <span className="profile-badge-icon" aria-hidden="true" />
            <span className="profile-badge-content">
              <span className="profile-badge-text">{isAuthenticated ? (currentUser.displayName || currentUser.username) : 'Профиль'}</span>
              <span className="profile-badge-edit">Редактировать</span>
            </span>
          </Link>
        </div>
        {!isAuthenticated ? (
          <div className="profile-empty-state">
            <p className="body-lg">
              Авторизуйтесь в экране профиля, чтобы привязать любимый клуб и видеть его матчи.
            </p>
            <Link to="/matches" className="pill-btn pill-btn--secondary profile-empty-state-cta">
              Перейти к матчам
            </Link>
          </div>
        ) : null}
      </section>
      {isAuthenticated ? (
      <section className="section-surface section-surface--team-feature">
        {hasFavoriteTeam ? (
          <>
            <div className="preview-head">
              <div className="preview-team-main">
                {displayOverview?.standing?.crest ? (
                  <img className="profile-team-logo-lg" src={displayOverview.standing.crest} alt={displayOverview.teamName || 'Team'} />
                ) : (
                  <div className="profile-team-logo-lg profile-team-logo-lg--fallback" aria-hidden="true">
                    {(displayOverview?.teamName || currentUser?.favoriteTeam || 'FC').slice(0, 2).toUpperCase()}
                  </div>
                )}
                <h3 className="headline-md">{displayOverview?.teamName || currentUser?.favoriteTeam || 'Любимая команда'}</h3>
              </div>
              <button
                type="button"
                className="icon-btn-trash"
                onClick={() => setIsDeleteSheetOpen(true)}
                aria-label="Удалить любимую команду"
                title="Удалить любимую команду"
              >
                ✕
              </button>
            </div>
            {displayOverview?.standing ? (
          <div className="team-overview-grid">
            <div className="team-stat-pill">
              <span className="label-md">Позиция</span>
              <p className="title-sm">{displayOverview.standing.position}</p>
            </div>
            <div className="team-stat-pill">
              <span className="label-md">Очки</span>
              <p className="title-sm">{displayOverview.standing.points}</p>
            </div>
            <div className="team-stat-pill">
              <span className="label-md">Матчи</span>
              <p className="title-sm">{displayOverview.standing.played}</p>
            </div>
            <div className="team-stat-pill">
              <span className="label-md">Разница мячей</span>
              <p className="title-sm">{displayOverview.standing.goalDiff}</p>
            </div>
            <div className="team-stat-pill">
              <span className="label-md">Победы / Ничьи / Поражения</span>
              <p className="title-sm">
                {displayOverview.standing.won} / {displayOverview.standing.draw} / {displayOverview.standing.lost}
              </p>
            </div>
          </div>
        ) : (
          <p className="body-lg">Данные о позиции команды пока недоступны.</p>
        )}
            <div className="profile-fixtures">
              <p className="title-sm">Ближайшие матчи</p>
              {displayOverview?.fixtures?.length > 0 ? (
                <ul className="fixture-list">
                  {displayOverview.fixtures.map((fixture, index) => {
                    const parsed = parseFixtureLine(fixture, crestByTeam);
                    return (
                      <li
                        className="fixture-list-item fixture-list-item--profile fixture-card"
                        key={`${parsed.homeTeamName}-${parsed.awayTeamName}-${parsed.date}-${index}`}
                      >
                        <div className="fixture-row">
                          <div className="fixture-main fixture-main--scoreline">
                            {renderTeamInlineNoLike(parsed.homeTeamName, parsed.homeCrest, parsed.homeScore)}
                            {renderTeamInlineNoLike(parsed.awayTeamName, parsed.awayCrest, parsed.awayScore)}
                          </div>
                        </div>
                        <div className="fixture-meta-row">
                          <p className="fixture-sub">{parsed.date}</p>
                          {!isUpcomingFixture(parsed.status) ? (
                            <span className={`status-chip status-chip--${parsed.status}`}>
                              <span className="status-chip-icon" aria-hidden="true">
                                {statusIconMap[parsed.status] || '•'}
                              </span>
                              {statusLabelMap[parsed.status] || parsed.status}
                            </span>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="body-lg">Нет данных по ближайшим матчам.</p>}
            </div>
          </>
        ) : (
          <div className="profile-empty-state">
            <p className="body-lg">
              Выберите команду на экране результатов, чтобы видеть ее матчи и статистику.
            </p>
            <Link to="/matches" className="pill-btn pill-btn--secondary profile-empty-state-cta">
              Перейти к матчам
            </Link>
          </div>
        )}
      </section>
      ) : null}
      <section className="section-surface">
        <p className="body-lg">
          Как это работает: нажмите <strong>♡</strong> рядом с командой в карточках на странице «Результаты» —
          команда привяжется к вашему пользователю и появится в профиле.
        </p>
      </section>
      {isDeleteSheetOpen ? (
        <div className="sheet-backdrop" role="presentation" onClick={() => setIsDeleteSheetOpen(false)}>
          <section
            className="bottom-sheet section-surface"
            role="dialog"
            aria-modal="true"
            aria-label="Подтверждение удаления команды"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="headline-md">Удалить из профиля?</p>
            <p className="body-lg">Любимая команда будет убрана. Позже можно выбрать ее снова в матчах.</p>
            <div className="bottom-sheet-actions">
              <button type="button" className="pill-btn pill-btn--secondary" onClick={() => setIsDeleteSheetOpen(false)}>
                Отмена
              </button>
              <button type="button" className="pill-btn pill-btn--primary" onClick={clearFavoriteTeam}>
                Удалить
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </motion.main>
  );
};

export default ProfilePage;