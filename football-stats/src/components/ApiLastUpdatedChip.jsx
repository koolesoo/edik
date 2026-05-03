import React from 'react';

/** Две стрелки по кругу (компактная иконка обновления). */
function SyncArrowsIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 4v6h-6" />
        <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10" />
        <path d="M1 20v-6h6" />
        <path d="M3.51 15a9 9 0 0 0 14.85 3.36L23 14" />
      </g>
    </svg>
  );
}

/**
 * Чип времени последнего успешного ответа API; при onRefresh — один интерактивный чип с иконкой.
 */
export default function ApiLastUpdatedChip({ timeLabel, onRefresh, isRefreshing }) {
  if (!timeLabel && !onRefresh) return null;

  const timePart = timeLabel ? `Обновлено ${timeLabel}` : 'Обновить';
  const syncLabel = isRefreshing ? 'Идёт обновление' : timePart;

  if (onRefresh) {
    return (
      <button
        type="button"
        className={`meta-pill meta-pill--sync${isRefreshing ? ' meta-pill--sync-busy' : ''}`}
        title={
          isRefreshing
            ? 'Идёт обновление'
            : 'Время последнего успешного ответа сервера (МСК). Нажмите, чтобы обновить.'
        }
        aria-busy={isRefreshing}
        aria-label={isRefreshing ? 'Идёт обновление' : 'Обновить данные с сервера'}
        disabled={isRefreshing}
        onClick={() => void onRefresh()}
      >
        <span className="meta-pill-sync-label">{syncLabel}</span>
        <SyncArrowsIcon className="meta-pill-sync-icon" />
      </button>
    );
  }

  return (
    <span className="meta-pill" title="Время последнего успешного ответа сервера (МСК)">
      {isRefreshing ? 'Идёт обновление' : `Обновлено ${timeLabel}`}
    </span>
  );
}
