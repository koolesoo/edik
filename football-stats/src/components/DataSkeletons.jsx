import React from 'react';

/** Скелет списка матчей (Live / Игры), когда ещё нет данных с API */
export function FixtureListSkeleton({ rows = 6 }) {
  return (
    <div className="fixture-list-skeleton" role="status" aria-live="polite" aria-label="Загрузка матчей">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="fixture-skeleton-row skeleton-shimmer" />
      ))}
    </div>
  );
}

/** Скелет таблицы турнира */
export function StandingsTableSkeleton({ bodyRows = 14 }) {
  return (
    <section className="page-lists-shell standings-skeleton-shell" role="status" aria-live="polite" aria-label="Загрузка таблицы">
      <div className="table-wrap">
        <table className="standings-table standings-table--skeleton">
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
            {Array.from({ length: bodyRows }, (_, i) => (
              <tr key={i}>
                <td className="col-num">
                  <div className="skeleton-line skeleton-line--label skeleton-shimmer" />
                </td>
                <td>
                  <div className="skeleton-line skeleton-line--row skeleton-shimmer" />
                </td>
                <td className="col-num">
                  <div className="skeleton-line skeleton-line--label skeleton-shimmer" />
                </td>
                <td className="col-num col-goals">
                  <div className="skeleton-line skeleton-line--label skeleton-shimmer" />
                </td>
                <td className="col-num">
                  <div className="skeleton-line skeleton-line--label skeleton-shimmer" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Скелет блоков статистики матча */
export function MatchStatsListSkeleton({ rows = 6 }) {
  return (
    <div className="match-stats-list match-stats-list--skeleton" role="status" aria-live="polite" aria-label="Загрузка статистики">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="match-stats-stat-block match-stats-stat-block--skeleton skeleton-shimmer">
          <div className="match-stats-stat-head">
            <span className="skeleton-line skeleton-line--value match-stats-skel-pill" />
            <span className="skeleton-line skeleton-line--row match-stats-skel-label" />
            <span className="skeleton-line skeleton-line--value match-stats-skel-pill" />
          </div>
          <div className="match-stats-dual-bar" aria-hidden="true">
            <div className="match-stats-track match-stats-track--skeleton">
              <div className="match-stats-skel-bar-fill" />
            </div>
            <div className="match-stats-track match-stats-track--skeleton">
              <div className="match-stats-skel-bar-fill match-stats-skel-bar-fill--short" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Скелет блока «любимая команда» в профиле */
export function ProfileTeamOverviewSkeleton() {
  return (
    <div className="profile-overview-skeleton" role="status" aria-live="polite" aria-label="Загрузка данных команды">
      <div className="profile-overview-skeleton-head skeleton-shimmer" />
      <div className="team-overview-grid profile-overview-skeleton-grid">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="team-stat-pill profile-overview-skeleton-pill skeleton-shimmer">
            <span className="skeleton-line skeleton-line--label" />
            <span className="skeleton-line skeleton-line--title" />
          </div>
        ))}
      </div>
      <div className="skeleton-line skeleton-line--row profile-overview-skel-title skeleton-shimmer" />
      <div className="fixture-list-skeleton profile-overview-skel-fixtures">
        {[0, 1].map((i) => (
          <div key={i} className="fixture-skeleton-row fixture-skeleton-row--compact skeleton-shimmer" />
        ))}
      </div>
    </div>
  );
}
