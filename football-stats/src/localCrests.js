import { translateTeamName } from './teamNames';

const RPL_CDN_CREST_BASE = 'https://cdn.premierliga.ru/resources/15/10';

/** Официальные SVG с CDN РПЛ; иначе — `public/crests/` в `CREST_FILE_BY_RU`. */
const CDN_CREST_URL_BY_RU = {
  Зенит: `${RPL_CDN_CREST_BASE}/club_zen_color_main.svg`,
  'Спартак Москва': `${RPL_CDN_CREST_BASE}/club_spa_color_main.svg`,
  Краснодар: `${RPL_CDN_CREST_BASE}/club_kra_color_main.svg`,
  Локомотив: `${RPL_CDN_CREST_BASE}/club_lok_color_main.svg`,
  'Локомотив Москва': `${RPL_CDN_CREST_BASE}/club_lok_color_main.svg`,
  Балтика: `${RPL_CDN_CREST_BASE}/club_bal_color_main.svg`,
  ЦСКА: `${RPL_CDN_CREST_BASE}/club_cska_color_main.svg`,
  'ЦСКА Москва': `${RPL_CDN_CREST_BASE}/club_cska_color_main.svg`,
  Рубин: `${RPL_CDN_CREST_BASE}/club_rub_color_main.svg`,
  'Динамо Москва': `${RPL_CDN_CREST_BASE}/club_dyn_color_main.svg`,
  Ахмат: `${RPL_CDN_CREST_BASE}/club_akh_color_main.svg`,
  Ростов: `${RPL_CDN_CREST_BASE}/club_ros_color_main.svg`,
  'Крылья Советов': `${RPL_CDN_CREST_BASE}/club_krs_color_main.svg`,
  Акрон: `${RPL_CDN_CREST_BASE}/club_akr_color_main.svg`,
  Оренбург: `${RPL_CDN_CREST_BASE}/club_ore_color_main.svg`,
  'Динамо Махачкала': `${RPL_CDN_CREST_BASE}/club_dmh_color_main.svg`,
  Махачкала: `${RPL_CDN_CREST_BASE}/club_dmh_color_main.svg`,
  'Пари НН': `${RPL_CDN_CREST_BASE}/club_pnn_color_main.svg`,
  Сочи: `${RPL_CDN_CREST_BASE}/club_sch_color_main.svg`,
};

const crestPublicUrl = (file) => {
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const safeFile = file.split('/').map((part) => encodeURIComponent(part)).join('/');
  return `${prefix}crests/${safeFile}`;
};

/** Марка РПЛ (`public/crests/РПЛ.png`) — шапка профиля и вкладка «Команда» без клубной эмблемы. */
export function getRplLeagueMarkUrl() {
  return crestPublicUrl('РПЛ.png');
}

/** Русские имена → файл в `public/crests/`, если нет записи в `CDN_CREST_URL_BY_RU`. */
const CREST_FILE_BY_RU = {};

const normalizeKey = (s) => String(s || '').trim().replace(/\s+/g, ' ');

export function getLocalCrestUrl(teamName) {
  const n = normalizeKey(teamName);
  if (!n || n === '-') return '';

  if (CDN_CREST_URL_BY_RU[n]) return CDN_CREST_URL_BY_RU[n];

  const ru = translateTeamName(n);
  if (ru && CDN_CREST_URL_BY_RU[ru]) return CDN_CREST_URL_BY_RU[ru];

  if (CREST_FILE_BY_RU[n]) return crestPublicUrl(CREST_FILE_BY_RU[n]);

  if (ru && CREST_FILE_BY_RU[ru]) return crestPublicUrl(CREST_FILE_BY_RU[ru]);

  return '';
}

/** Локальный логотип из репозитория, иначе URL из API. */
export function preferCrest(teamName, remoteCrest) {
  const local = getLocalCrestUrl(teamName);
  if (local) return local;
  const r = String(remoteCrest || '').trim();
  return r || '';
}
