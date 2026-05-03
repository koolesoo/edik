/** Расписание РПЛ в интерфейсе — всегда московское время. */
export const RPL_TIMEZONE = 'Europe/Moscow';

const optsDateLong = {
  timeZone: RPL_TIMEZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
};

const optsTimeHm = {
  timeZone: RPL_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
};

const optsDateTimeLine = {
  timeZone: RPL_TIMEZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

const optsDayMonth = {
  timeZone: RPL_TIMEZONE,
  day: 'numeric',
  month: 'long',
};

export function formatDateLongRuMsk(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU', optsDateLong);
}

export function formatTimeShortRuMsk(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ru-RU', optsTimeHm);
}

/** Как в шапке статистики: «3 мая 2026 г. в 12:00» — по Москве. */
export function formatDateTimeLineRuMsk(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru-RU', optsDateTimeLine);
}

/** «3 мая» по Москве (без года). */
export function formatDayMonthRuMsk(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', optsDayMonth);
}

const optsClockHms = {
  timeZone: RPL_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
};

/** Часы:минуты:секунды по Москве — для чипа «Обновлено». */
export function formatMskClockHms(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ru-RU', optsClockHms);
}

