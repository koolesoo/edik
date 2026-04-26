import React from 'react';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { getPremierLeagueStandings, getPremierLeagueTable } from '../services/api';
import CenterLoader from '../components/CenterLoader';

const Tables = () => {
  const [standingsRows, setStandingsRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
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

    const loadTable = async () => {
      try {
        setLoading(true);
        const standings = await getPremierLeagueStandings();
        if (Array.isArray(standings) && standings.length > 0) {
          setStandingsRows(standings);
          return;
        }

        const fallbackData = await getPremierLeagueTable();
        setStandingsRows(parseRows(fallbackData));
      } catch (err) {
        setError(err.message || 'Ошибка загрузки таблицы');
      } finally {
        setLoading(false);
      }
    };

    loadTable();
  }, []);

  const normalizeStandings = (rows) => {
    if (!rows.length) {
      return [];
    }

    // Supports both object rows and fallback string format:
    // "1. Team | P | W | D | L | GD | Pts"
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

  const renderTeamIdentity = (row) => {
    const teamName = String(row?.team || '-');
    const shortName = teamName
      .split(' ')
      .filter(Boolean)
      .slice(0, 3)
      .map((part) => part[0])
      .join('')
      .toUpperCase();

    return (
      <div className="table-team-cell">
        {row?.crest ? (
          <img src={row.crest} alt={teamName} className="table-team-logo" loading="lazy" />
        ) : (
          <div className="table-team-logo table-team-logo--fallback" aria-hidden="true">
            {shortName || teamName.slice(0, 3).toUpperCase()}
          </div>
        )}
        <span>{teamName}</span>
      </div>
    );
  };

  const tableRows = normalizeStandings(standingsRows);
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

  if (loading) {
    return <CenterLoader />;
  }

  return (
    <motion.main
      className="page"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <section className="section-surface">
        <div className="panel-head">
          <div>
            <h2 className="headline-md">Таблица Premier League</h2>
          </div>
        </div>
        {error ? (
          <p className="body-lg" style={{ marginTop: 16 }}>Ошибка: {error}</p>
        ) : tableRows.length === 0 ? (
          <p className="body-lg" style={{ marginTop: 16 }}>Данные таблицы пока отсутствуют.</p>
        ) : (
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
                {tableRows.map((row, idx) => (
                  <tr key={`${row.team}-${idx}`}>
                    <td className="col-num">{row.position}</td>
                    <td>{renderTeamIdentity(row)}</td>
                    <td className="col-num">{row.played}</td>
                    <td className="col-num col-goals">{formatAttackOrDiff(row)}</td>
                    <td className="col-num"><strong>{row.points}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </motion.main>
  );
};

export default Tables;