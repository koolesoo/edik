import React, { useCallback, useLayoutEffect, useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import ApiLastUpdatedChip from '../components/ApiLastUpdatedChip';
import { StandingsTableSkeleton } from '../components/DataSkeletons';
import RplHeroPanel from '../components/RplHeroPanel';
import { formatMskClockHms } from '../dateTimeMsk';
import { useEffectWhenVisible } from '../hooks/useEffectWhenVisible';
import { describeAxiosError, dropApiCacheKey, getPremierLeagueStandings, getPremierLeagueTable } from '../services/api';
import { preferCrest } from '../localCrests';
import { translateTeamName, normalizeStandingsTeamKey, teamMatchesFavorite } from '../teamNames';
import { useCrestMap } from '../context/CrestContext';
import { useAuth } from '../context/AuthContext';
import { getStandingsRowsForTournament, listTournaments } from '../services/adminCatalog';

const rowMatchesFocusTeam = (row, rawQuery) => {
  if (!rawQuery || !row?.team) return false;
  let q = String(rawQuery).trim();
  try {
    q = decodeURIComponent(q);
  } catch {
    /* оставляем как есть */
  }
  if (!q) return false;
  const api = String(row.team);
  if (api === q) return true;
  if (normalizeStandingsTeamKey(api) === normalizeStandingsTeamKey(q)) return true;
  const ruApi = translateTeamName(api).toLowerCase();
  const ruQ = translateTeamName(q).toLowerCase();
  if (ruApi && ruApi === ruQ) return true;
  if (normalizeStandingsTeamKey(ruApi) === normalizeStandingsTeamKey(ruQ)) return true;
  return false;
};

const parseRows = (payload) => {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && Array.isArray(payload.table)) {
    return payload.table;
  }
  if (payload && Array.isArray(payload.data)) {
    return payload.data;
  }
  return [];
};

const normalizeStandings = (rows) => {
  if (!rows.length) {
    return [];
  }

  return rows
    .map((row, index) => {
      if (typeof row === 'string') {
        if (index === 0 && row.toLowerCase().includes('position')) {
          return null;
        }
        const [positionAndTeam, played, won, draw, lost, goalDiff, points] = row.split('|').map((part) => part.trim());
        const positionMatch = positionAndTeam?.match(/^(\d+)\.\s*(.*)$/);
        return {
          position: positionMatch ? positionMatch[1] : '-',
          team: positionMatch ? positionMatch[2] : positionAndTeam || '-',
          crest: '',
          played: played || '-',
          goalsFor: null,
          goalsAgainst: null,
          won: won || '-',
          draw: draw || '-',
          lost: lost || '-',
          goalDiff: goalDiff || '-',
          points: points || '-',
        };
      }

      if (row && typeof row === 'object') {
        return {
          position: row.position ?? '-',
          team: row.team || '-',
          crest: row.crest || '',
          played: row.played ?? '-',
          goalsFor: row.goalsFor ?? null,
          goalsAgainst: row.goalsAgainst ?? null,
          won: row.won ?? '-',
          draw: row.draw ?? '-',
          lost: row.lost ?? '-',
          goalDiff: row.goalDiff ?? '-',
          points: row.points ?? '-',
        };
      }

      return null;
    })
    .filter(Boolean);
};

const Tables = () => {
  const [searchParams] = useSearchParams();
  const queryTeam = searchParams.get('team');
  const { currentUser, isAuthenticated } = useAuth();
  const favoriteTeamRaw = useMemo(() => {
    if (!isAuthenticated || !currentUser?.favoriteTeam) return '';
    return String(currentUser.favoriteTeam).trim();
  }, [isAuthenticated, currentUser?.favoriteTeam]);

  const rowMatchesFocus = useCallback(
    (row) => {
      if (queryTeam) {
        return rowMatchesFocusTeam(row, queryTeam);
      }
      if (!favoriteTeamRaw) return false;
      return (
        teamMatchesFavorite(row.team, favoriteTeamRaw) || rowMatchesFocusTeam(row, favoriteTeamRaw)
      );
    },
    [queryTeam, favoriteTeamRaw],
  );

  const [standingsRows, setStandingsRows] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const { mergeStandingsRows } = useCrestMap();
  const [tableSource, setTableSource] = useState('rpl');
  const [adminTournaments, setAdminTournaments] = useState([]);

  useEffect(() => {
    setAdminTournaments(listTournaments());
  }, [currentUser?.username, currentUser?.role]);

  useEffect(() => {
    setTableSource('rpl');
  }, [currentUser?.username, currentUser?.role]);

  const tableRows = useMemo(() => normalizeStandings(standingsRows), [standingsRows]);

  const localTableRows = useMemo(() => {
    if (tableSource === 'rpl') return [];
    return normalizeStandings(getStandingsRowsForTournament(tableSource));
  }, [tableSource]);

  const displayRows = tableSource === 'rpl' ? tableRows : localTableRows;

  useEffect(() => {
    if (tableSource !== 'rpl' && !adminTournaments.some((t) => t.id === tableSource)) {
      setTableSource('rpl');
    }
  }, [adminTournaments, tableSource]);

  useLayoutEffect(() => {
    if (!queryTeam || displayRows.length === 0) return;
    const hasMatch = displayRows.some((row) => rowMatchesFocusTeam(row, queryTeam));
    if (!hasMatch) return;
    const el = document.getElementById('standings-focus-row');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [queryTeam, displayRows]);

  const handleRefresh = useCallback(async (opts = {}) => {
    const silent = Boolean(opts.silent);
    const force = Boolean(opts.force);
    try {
      if (force) {
        dropApiCacheKey('rpl.standings');
        dropApiCacheKey('rpl.table');
      }
      if (!silent) setIsRefreshing(true);
      setError('');
      const standings = await getPremierLeagueStandings();
      if (Array.isArray(standings) && standings.length > 0) {
        mergeStandingsRows(standings);
        setStandingsRows(standings);
        setLastUpdated(formatMskClockHms());
        return;
      }

      const fallbackData = await getPremierLeagueTable();
      setStandingsRows(parseRows(fallbackData));
      setLastUpdated(formatMskClockHms());
    } catch (err) {
      setError(describeAxiosError(err) || err.message || 'Ошибка загрузки таблицы');
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  }, [mergeStandingsRows]);

  useEffectWhenVisible(() => {
    setAdminTournaments(listTournaments());
    void handleRefresh({ silent: false });
  }, [currentUser?.username, currentUser?.role, handleRefresh]);

  const renderTeamIdentity = (row) => {
    const teamName = String(row?.team || '-');
    const crestSrc = preferCrest(teamName, row?.crest || '');
    const displayTeamName = translateTeamName(teamName);
    const shortName = teamName
      .split(' ')
      .filter(Boolean)
      .slice(0, 3)
      .map((part) => part[0])
      .join('')
      .toUpperCase();

    return (
      <div className="table-team-cell">
        {crestSrc ? (
          <img src={crestSrc} alt={displayTeamName} className="table-team-logo" loading="lazy" />
        ) : (
          <div className="table-team-logo table-team-logo--fallback" aria-hidden="true">
            {shortName || teamName.slice(0, 3).toUpperCase()}
          </div>
        )}
        <span>{displayTeamName}</span>
      </div>
    );
  };

  const formatAttackOrDiff = (row) => {
    if (row.goalsFor != null && row.goalsAgainst != null) {
      return `${row.goalsFor}-${row.goalsAgainst}`;
    }
    if (row.goalDiff != null && row.goalDiff !== '-') {
      const diff = Number(row.goalDiff);
      if (!Number.isNaN(diff)) {
        return diff > 0 ? `+${diff}` : String(diff);
      }
      return String(row.goalDiff);
    }
    return '-';
  };

  const showTableSkeleton = tableSource === 'rpl' && isRefreshing && tableRows.length === 0 && !error;

  return (
    <motion.main
      className="page page--hero-bleed"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <section className="page-hero">
        <div className="page-hero-card">
          <RplHeroPanel title="Таблица">
            {tableSource === 'rpl' ? (
              <ApiLastUpdatedChip
                timeLabel={lastUpdated}
                onRefresh={() => void handleRefresh({ silent: false, force: true })}
                isRefreshing={isRefreshing}
              />
            ) : (
              <span className="body-lg tables-local-chip">Локальный турнир</span>
            )}
          </RplHeroPanel>
          {currentUser?.role === 'admin' && adminTournaments.length > 0 ? (
            <div className="tables-source-toggle" role="tablist" aria-label="Источник таблицы">
              <button
                type="button"
                className={`segmented-btn ${tableSource === 'rpl' ? 'segmented-btn--active' : ''}`}
                onClick={() => setTableSource('rpl')}
              >
                РПЛ
              </button>
              {adminTournaments.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`segmented-btn ${tableSource === t.id ? 'segmented-btn--active' : ''}`}
                  onClick={() => setTableSource(t.id)}
                >
                  {t.name}
                </button>
              ))}
            </div>
          ) : null}
          {error && tableSource === 'rpl' ? (
            <p className="body-lg action-message" role="alert">
              Ошибка: {error}
            </p>
          ) : null}
          {!error && tableSource === 'rpl' && !isRefreshing && tableRows.length === 0 ? (
            <p className="body-lg action-message">Нет строк таблицы. Проверьте соединение с сервером.</p>
          ) : null}
          {tableSource !== 'rpl' && !showTableSkeleton && displayRows.length === 0 ? (
            <p className="body-lg action-message">
              Нет данных для таблицы. Добавьте команды и завершённые матчи в разделе «Управление данными».
            </p>
          ) : null}
        </div>
      </section>
      {!error && showTableSkeleton ? <StandingsTableSkeleton /> : null}
      {!error && !showTableSkeleton && displayRows.length > 0 ? (
        <section className="page-lists-shell">
          <div className="table-wrap">
            <table className="standings-table">
              <thead>
                <tr>
                  <th className="col-num">#</th>
                  <th>Команда</th>
                  <th className="col-num">И</th>
                  <th className="col-num col-goals">З-П</th>
                  <th className="col-num">О</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, idx) => {
                  const isFocus = rowMatchesFocus(row);
                  return (
                    <tr
                      key={`${row.team}-${idx}`}
                      id={isFocus ? 'standings-focus-row' : undefined}
                      className={isFocus ? 'standings-row--focus' : undefined}
                    >
                      <td className="col-num">{row.position}</td>
                      <td>{renderTeamIdentity(row)}</td>
                      <td className="col-num">{row.played}</td>
                      <td className="col-num col-goals">{formatAttackOrDiff(row)}</td>
                      <td className="col-num"><strong>{row.points}</strong></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </motion.main>
  );
};

export default Tables;