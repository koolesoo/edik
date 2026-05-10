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

/** Скелет блоков статистики матча (число строк = числу метрик на экране) */
export function MatchStatsListSkeleton({ rows = 7 }) {
  return (
    <div className="match-stats-list match-stats-list--skeleton" role="status" aria-live="polite" aria-label="Загрузка статистики">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="match-stats-stat-block match-stats-stat-block--skeleton">
          <div className="match-stats-stat-head">
            <span className="skeleton-line skeleton-line--value match-stats-skel-pill skeleton-shimmer" />
            <span className="skeleton-line skeleton-line--meta match-stats-skel-label skeleton-shimmer" />
            <span className="skeleton-line skeleton-line--value match-stats-skel-pill skeleton-shimmer" />
          </div>
          <div className="match-stats-dual-bar" aria-hidden="true">
            <div className="match-stats-track match-stats-track--skeleton">
              <div className="match-stats-skel-bar-fill match-stats-skel-bar-fill--home skeleton-shimmer" />
            </div>
            <div className="match-stats-track match-stats-track--skeleton">
              <div className="match-stats-skel-bar-fill match-stats-skel-bar-fill--away skeleton-shimmer" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Скелет блока «любимая команда» в профиле (под уже показанным preview-head) */
export function ProfileTeamOverviewSkeleton() {
  return (
    <div className="profile-overview-skeleton" role="status" aria-live="polite" aria-label="Загрузка данных команды">
      <div className="team-overview-grid profile-overview-skeleton-grid">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="team-stat-pill profile-overview-skeleton-pill">
            <span className="skeleton-line skeleton-line--label profile-overview-skel-pill-label skeleton-shimmer" />
            <span className="skeleton-line skeleton-line--title profile-overview-skel-pill-value skeleton-shimmer" />
          </div>
        ))}
      </div>
      <div className="profile-fixtures profile-overview-skel-fixtures-block">
        <div className="profile-fixtures-pair-head profile-fixtures-pair-head--skeleton">
          <span className="skeleton-line skeleton-shimmer profile-overview-skel-pair-title" />
          <span className="skeleton-line skeleton-shimmer profile-overview-skel-pair-title" />
        </div>
        <ul className="fixture-list fixture-list--profile-pair profile-overview-skel-fixture-list">
          {[0, 1].map((i) => (
            <li key={i} className="fixture-list-item fixture-list-item--profile">
              <div className="fixture-match-card fixture-match-card--profile profile-fixture-skeleton-card">
                <div className="profile-fixture-card-body profile-fixture-skeleton-body">
                  <div className="skeleton-line skeleton-line--circle profile-fixture-skel-crest skeleton-shimmer" />
                  <div className="profile-fixture-skel-text">
                    <span className="skeleton-line skeleton-line--meta profile-fixture-skel-line skeleton-shimmer" />
                    <span className="skeleton-line skeleton-line--row profile-fixture-skel-line profile-fixture-skel-line--name skeleton-shimmer" />
                    <span className="skeleton-line skeleton-line--meta profile-fixture-skel-line profile-fixture-skel-line--meta skeleton-shimmer" />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
