import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMatches, getPremierLeagueFixtures, getPremierLeagueStandings } from '../services/api';

const DEFAULT_TEAMS = [
  'Arsenal',
  'Liverpool',
  'Manchester City',
  'Manchester United',
  'Chelsea',
  'Tottenham',
];
const PREMIER_LEAGUE_ID = 2021;
const RESULTS_DAY_RADIUS = 14;
const FIXTURES_CACHE_PREFIX = 'footstat:fixtures:';

const toIsoDate = (date) => date.toISOString().split('T')[0];

const buildDateCarousel = (centerIsoDate, dayRadius = RESULTS_DAY_RADIUS) => {
  const center = new Date(`${centerIsoDate}T12:00:00`);
  if (Number.isNaN(center.getTime())) {
    const today = new Date();
    return [toIsoDate(today)];
  }
  return Array.from({ length: dayRadius * 2 + 1 }, (_, index) => {
    const date = new Date(center);
    date.setDate(center.getDate() + index - dayRadius);
    return toIsoDate(date);
  });
};

const formatCarouselDate = (isoDate) => {
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
};

const formatCarouselTopLabel = (isoDate, todayIsoDate) => {
  if (isoDate === todayIsoDate) return 'Сегодня';
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const weekday = date.toLocaleDateString('ru-RU', { weekday: 'short' });
  return weekday.slice(0, 2).replace('.', '');
};

const isRateLimitError = (error) => {
  const status = error?.response?.status;
  if (status === 429) return true;
  const message = String(error?.message || '').toLowerCase();
  return message.includes('429') || message.includes('rate limit');
};

const parseFixture = (fixture, crestByTeam = {}) => {
  if (fixture && typeof fixture === 'object' && !Array.isArray(fixture)) {
    const homeName = fixture.homeTeam?.name || fixture.homeTeamName || '';
    const awayName = fixture.awayTeam?.name || fixture.awayTeamName || '';
    const status = fixture.status || 'SCHEDULED';
    const dateRaw = fixture.utcDate || fixture.date || fixture.kickoff || '';
    const parsedDate = dateRaw ? new Date(dateRaw) : null;
    const isValidDate = parsedDate && !Number.isNaN(parsedDate.getTime());
    const date = isValidDate
      ? `${parsedDate.toLocaleDateString('ru-RU')} ${parsedDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
      : (fixture.dateLabel || 'Дата уточняется');
    const kickoffTime = isValidDate
      ? parsedDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      : '--:--';

    return {
      teams: `${homeName || 'Home'} vs ${awayName || 'Away'}`,
      homeTeam: homeName,
      awayTeam: awayName,
      homeCrest: fixture.homeTeam?.crest || fixture.homeCrest || crestByTeam[homeName] || '',
      awayCrest: fixture.awayTeam?.crest || fixture.awayCrest || crestByTeam[awayName] || '',
      homeScore: fixture.score?.fullTime?.home,
      awayScore: fixture.score?.fullTime?.away,
      date,
      kickoffTime,
      status,
    };
  }

  const text = String(fixture || '');
  const dateMatch = text.match(/(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})/);
  const statusMatch = text.match(/\[([A-Z_]+)\]\s*$/);
  const status = statusMatch ? statusMatch[1] : '';

  let teamsPart = text;
  if (dateMatch?.index != null) {
    teamsPart = text.slice(0, dateMatch.index).trim();
  }
  teamsPart = teamsPart.replace(/\[[A-Z_]+\]\s*$/, '').trim();

  const [homeTeam = '', awayTeam = ''] = teamsPart.split(/\s+vs\s+/i);

  return {
    teams: teamsPart,
    homeTeam: homeTeam.trim(),
    awayTeam: awayTeam.trim(),
    homeCrest: crestByTeam[homeTeam.trim()] || '',
    awayCrest: crestByTeam[awayTeam.trim()] || '',
    homeScore: null,
    awayScore: null,
    date: dateMatch ? `${dateMatch[1]} ${dateMatch[2]}` : 'Дата уточняется',
    kickoffTime: dateMatch?.[2] || '--:--',
    status: status || 'SCHEDULED',
  };
};

const statusLabelMap = {
  IN_PLAY: 'LIVE',
  PAUSED: 'Перерыв',
  FINISHED: 'Завершен',
  TIMED: 'По расписанию',
  SCHEDULED: 'Скоро',
};

const statusIconMap = {
  IN_PLAY: '🔴',
  PAUSED: '⏸',
  FINISHED: '✓',
  TIMED: '🕒',
  SCHEDULED: '📅',
};

const LiveScoresPage = ({ mode = 'results' }) => {
  const navigate = useNavigate();
  const { isAuthenticated, currentUser, setFavoriteTeamForCurrentUser } = useAuth();
  const [fixtures, setFixtures] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(DEFAULT_TEAMS[0]);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [lastUpdated, setLastUpdated] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [crestByTeam, setCrestByTeam] = useState({});
  const dateCarouselRef = useRef(null);
  const fixturesRef = useRef([]);
  const liveStatuses = new Set(['IN_PLAY', 'PAUSED']);
  const isLiveMode = mode === 'live';
  const cacheKey = isLiveMode
    ? `${FIXTURES_CACHE_PREFIX}live:${selectedTeam}`
    : `${FIXTURES_CACHE_PREFIX}results:${selectedDate}`;

  useEffect(() => {
    fixturesRef.current = fixtures;
  }, [fixtures]);

  useEffect(() => {
    let isCancelled = false;

    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || '[]');
      if (Array.isArray(cached) && cached.length > 0) {
        setFixtures(cached);
        setLoading(false);
      }
    } catch (_) {
      // Ignore cache read failures.
    }

    const loadCrests = async () => {
      try {
        const standings = await getPremierLeagueStandings();
        if (!isCancelled && Array.isArray(standings)) {
          const map = standings.reduce((acc, row) => {
            if (row?.team && row?.crest) {
              acc[row.team] = row.crest;
            }
            return acc;
          }, {});
          setCrestByTeam(map);
        }
      } catch (_) {
        // Ignore crest map failures: fixtures still render without logos.
      }
    };

    const normalizeFixtures = (payload) => {
      if (Array.isArray(payload)) {
        return payload.flatMap((item) => {
          if (typeof item === 'string') {
            return [item];
          }
          if (Array.isArray(item)) {
            return item.filter((v) => typeof v === 'string' || (v && typeof v === 'object'));
          }
          if (item && typeof item === 'object') {
            if (item.homeTeam || item.awayTeam || item.homeTeamName || item.awayTeamName) {
              return [item];
            }
            return Object.values(item).filter((v) => typeof v === 'string' || (v && typeof v === 'object'));
          }
          return [];
        });
      }
      if (payload && typeof payload === 'object') {
        if (payload.homeTeam || payload.awayTeam || payload.homeTeamName || payload.awayTeamName) {
          return [payload];
        }
        return Object.values(payload).filter((v) => typeof v === 'string' || (v && typeof v === 'object'));
      }
      return [];
    };

    const fetchFixtures = async () => {
      try {
        setIsRefreshing(true);
        const data = isLiveMode
          ? await getPremierLeagueFixtures(selectedTeam)
          : await getMatches(PREMIER_LEAGUE_ID, selectedDate, selectedDate);
        if (!isCancelled) {
          const normalized = normalizeFixtures(data);
          setFixtures(normalized);
          setLastUpdated(new Date().toLocaleTimeString('ru-RU'));
          setError(null);
          setActionMessage('');
          try {
            localStorage.setItem(cacheKey, JSON.stringify(normalized));
          } catch (_) {
            // Ignore storage failures.
          }
        }
      } catch (err) {
        if (!isCancelled) {
          const is429 = isRateLimitError(err);
          if (is429) {
            let cached = [];
            try {
              cached = JSON.parse(localStorage.getItem(cacheKey) || '[]');
            } catch (_) {
              cached = [];
            }
            if (Array.isArray(cached) && cached.length > 0) {
              setFixtures(cached);
            }
            setError(null);
            setActionMessage('Показываем кэшированные данные.');
          } else if (fixturesRef.current.length > 0) {
            setError(null);
            setActionMessage('Показываем последние сохраненные данные.');
          } else {
            setError(err.message || 'Не удалось загрузить матчи');
          }
        }
      } finally {
        if (!isCancelled) {
          setIsRefreshing(false);
          setLoading(false);
        }
      }
    };

    loadCrests();
    fetchFixtures();
    const timer = setInterval(fetchFixtures, 30000);
    return () => {
      isCancelled = true;
      clearInterval(timer);
    };
  }, [selectedTeam, selectedDate, isLiveMode]);

  const renderTeamInline = (teamName, crest, isLiked, onLike, score, align = 'left') => {
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
      <span className={`fixture-team-inline fixture-team-inline--${align}`}>
        <button
          type="button"
          className={`fixture-like-dot ${isLiked ? 'fixture-like-dot--active' : ''}`}
          onClick={onLike}
          disabled={!teamName}
          aria-label={`Лайк ${safeName}`}
        >
          {isLiked ? '♥' : '♡'}
        </button>
        {crest ? <img src={crest} alt={safeName} className="fixture-team-logo" loading="lazy" /> : (
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

  const handleLikeTeam = (teamName) => {
    if (!teamName) return;
    if (!isAuthenticated) {
      setActionMessage('Чтобы сохранить любимую команду, войдите в профиль.');
      navigate('/profile');
      return;
    }
    setFavoriteTeamForCurrentUser(teamName);
    setActionMessage(`Команда ${teamName} сохранена в профиль ${currentUser.username}.`);
  };

  const openMatchStats = (match) => {
    navigate('/match-stats', { state: { match } });
  };

  const parsedFixtures = fixtures.map((fixture) => parseFixture(fixture, crestByTeam));
  const displayFixtures = isLiveMode
    ? parsedFixtures.filter((fixture) => liveStatuses.has(fixture.status))
    : parsedFixtures;
  const carouselDates = buildDateCarousel(selectedDate);
  const todayIsoDate = toIsoDate(new Date());

  useEffect(() => {
    if (isLiveMode) return;
    const container = dateCarouselRef.current;
    if (!container) return;
    const activeIndex = carouselDates.indexOf(selectedDate);
    if (activeIndex < 0) return;
    const activeNode = container.children[activeIndex];
    if (!(activeNode instanceof HTMLElement)) return;
    // Keep the selected date as the first visible item while preserving
    // the ability to scroll back to previous dates.
    container.scrollTo({ left: activeNode.offsetLeft, behavior: 'smooth' });
  }, [selectedDate, carouselDates, isLiveMode]);

  if (loading) {
    return (
      <motion.main
        className="page"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <section className="section-surface section-surface--plain">
          <div className="skeleton-line skeleton-line--title skeleton-shimmer" />
          {!isLiveMode ? (
            <div className="skeleton-date-row">
              <div className="skeleton-line skeleton-line--pill skeleton-shimmer" />
              <div className="skeleton-line skeleton-line--pill skeleton-shimmer" />
              <div className="skeleton-line skeleton-line--pill skeleton-shimmer" />
              <div className="skeleton-line skeleton-line--circle skeleton-shimmer" />
            </div>
          ) : null}
        </section>
        <section className="matches-grid">
          {Array.from({ length: 5 }).map((_, index) => (
            <div className="section-surface fixture-card skeleton-card" key={`matches-skeleton-${index}`}>
              <div className="skeleton-line skeleton-line--row skeleton-shimmer" />
              <div className="skeleton-line skeleton-line--row skeleton-shimmer" />
              <div className="skeleton-line skeleton-line--meta skeleton-shimmer" />
            </div>
          ))}
        </section>
      </motion.main>
    );
  }
  if (error) return <main className="page"><p className="body-lg">Ошибка: {error}</p></main>;

  return (
    <motion.main
      className="page"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <section className="section-surface section-surface--plain">
        <div className="panel-head">
          <div className="live-title-wrap">
            <h2 className="headline-md">
              {isLiveMode ? 'Live-матчи' : 'Все игры'}
            </h2>
          </div>
        </div>
        {!isLiveMode ? (
          <div className="date-carousel-wrap">
            <div className="date-carousel-row">
              <div className="date-carousel" role="tablist" aria-label="Выбор даты" ref={dateCarouselRef}>
              {carouselDates.map((isoDate) => (
                <button
                  key={isoDate}
                  type="button"
                  className={`date-pill ${selectedDate === isoDate ? 'date-pill--active' : ''}`}
                  onClick={() => setSelectedDate(isoDate)}
                >
                  <span className="date-pill-top">{formatCarouselTopLabel(isoDate, todayIsoDate)}</span>
                  <span className="date-pill-main">{formatCarouselDate(isoDate)}</span>
                </button>
              ))}
              </div>
              <button
                type="button"
                className="calendar-icon-btn floating-surface"
                aria-label="Перейти к сегодняшней дате"
                onClick={() => setSelectedDate(todayIsoDate)}
              >
                <span className="calendar-icon" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
        {actionMessage ? (
          <p className="body-lg action-message">{actionMessage}</p>
        ) : null}
      </section>
      <section className="matches-grid">
        {displayFixtures.length > 0 ? (
          displayFixtures.map((parsed, index) => {
            return (
              <motion.div
                key={`${parsed.teams}-${parsed.date}-${index}`}
                className="match-row"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30, delay: index * 0.2 }}
              >
                <div className="section-surface fixture-card">
                  <div className="fixture-row">
                    <div className="fixture-main fixture-main--scoreline">
                      {renderTeamInline(
                        parsed.homeTeam || 'Home',
                        parsed.homeCrest,
                        currentUser?.favoriteTeam === parsed.homeTeam,
                        () => handleLikeTeam(parsed.homeTeam),
                        parsed.homeScore,
                        'left',
                      )}
                      {renderTeamInline(
                        parsed.awayTeam || 'Away',
                        parsed.awayCrest,
                        currentUser?.favoriteTeam === parsed.awayTeam,
                        () => handleLikeTeam(parsed.awayTeam),
                        parsed.awayScore,
                        'left',
                      )}
                    </div>
                  </div>
                  <div className="fixture-meta-row">
                    <p className="fixture-sub">{parsed.kickoffTime || '--:--'}</p>
                    {!isUpcomingFixture(parsed.status) ? (
                      <span className={`status-chip status-chip--${parsed.status}`}>
                        <span className="status-chip-icon" aria-hidden="true">
                          {statusIconMap[parsed.status] || '•'}
                        </span>
                        {statusLabelMap[parsed.status] || parsed.status}
                      </span>
                    ) : null}
                  </div>
                  <div className="fixture-actions">
                    <button
                      type="button"
                      className="fixture-stats-btn"
                      onClick={() => openMatchStats(parsed)}
                    >
                      Статистика
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })
        ) : (
          <div className="empty-state-card">
            <p className="headline-md">Матчей пока нет</p>
            <p className="body-lg">
              {isLiveMode
                ? 'Сейчас в эфире нет активных игр. Загляните чуть позже.'
                : 'На выбранный день матчи не найдены. Данные обновятся автоматически.'}
            </p>
          </div>
        )}
      </section>
    </motion.main>
  );
};

export default LiveScoresPage;