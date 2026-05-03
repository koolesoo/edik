/** Подсказки: русский запрос пользователя → подстрока в англ. имени API (LiveScore). */
const RPL_QUERY_HINTS = [
  ['зенит', 'zenit'],
  ['краснодар', 'krasnodar'],
  ['цска', 'cska'],
  ['спартак', 'spartak'],
  /* «динамо» + «dinamo» нельзя — совпадение и у Москвы, и у Махачкалы; см. teamMatchesFavorite */
  ['локомотив', 'lokomotiv'],
  ['ростов', 'rostov'],
  ['рубин', 'rubin'],
  ['ахмат', 'akhmat'],
  ['нижний', 'nizhny'],
  ['пари', 'nizhny'],
  ['крылья', 'krylya'],
  ['советов', 'krylya'],
  ['сочи', 'sochi'],
  ['урал', 'ural'],
  ['оренбург', 'orenburg'],
  ['балтика', 'baltika'],
  ['факел', 'fakel'],
  ['динамо махачкала', 'makhachkala'],
  ['махачкала', 'makhachkala'],
  ['акрон', 'akron'],
  ['тольятти', 'akron'],
  ['самара', 'krylya'],
  ['казан', 'rubin'],
  ['калининград', 'baltika'],
];

const TEAM_NAME_MAP = {
  // РПЛ — как в competitions/table.json (LiveScore), плюс варианты написания
  'Zenit St. Petersburg': 'Зенит',
  Zenit: 'Зенит',
  'FC Zenit': 'Зенит',
  'Spartak Moscow': 'Спартак Москва',
  'FC Spartak Moscow': 'Спартак Москва',
  Spartak: 'Спартак Москва',
  'FC Krasnodar': 'Краснодар',
  Krasnodar: 'Краснодар',
  'PFC CSKA Moscow': 'ЦСКА',
  'CSKA Moscow': 'ЦСКА',
  CSKA: 'ЦСКА',
  'FC Lokomotiv Moscow': 'Локомотив',
  'Lokomotiv Moscow': 'Локомотив',
  Lokomotiv: 'Локомотив',
  'ЦСКА Москва': 'ЦСКА',
  'Локомотив Москва': 'Локомотив',
  'Dinamo Moscow': 'Динамо Москва',
  'Dynamo Moscow': 'Динамо Москва',
  'FC Dynamo Moscow': 'Динамо Москва',
  'FC Rostov': 'Ростов',
  Rostov: 'Ростов',
  'FC Rubin Kazan': 'Рубин',
  'Rubin Kazan': 'Рубин',
  Rubin: 'Рубин',
  'FC Ural': 'Урал',
  Ural: 'Урал',
  'Akron Tolyatti': 'Акрон',
  Akron: 'Акрон',
  'FC Baltika Kaliningrad': 'Балтика',
  Baltika: 'Балтика',
  'FC Nizhny Novgorod': 'Пари НН',
  'Пари Нижний Новгород': 'Пари НН',
  'FC Orenburg': 'Оренбург',
  Orenburg: 'Оренбург',
  'FK Akhmat': 'Ахмат',
  Akhmat: 'Ахмат',
  'FK Makhachkala': 'Динамо Махачкала',
  Makhachkala: 'Динамо Махачкала',
  'Dinamo Makhachkala': 'Динамо Махачкала',
  'FC Dinamo Makhachkala': 'Динамо Махачкала',
  Махачкала: 'Динамо Махачкала',
  'Krylya Sovetov Samara': 'Крылья Советов',
  'Krylya Sovetov': 'Крылья Советов',
  'PFC Sochi': 'Сочи',
  Sochi: 'Сочи',
  // EPL / прочее (оставлено для совместимости)
  'Arsenal FC': 'Арсенал',
  'Manchester City FC': 'Манчестер Сити',
  'Manchester United FC': 'Манчестер Юнайтед',
  'Liverpool FC': 'Ливерпуль',
  'Aston Villa FC': 'Астон Вилла',
  'Brighton & Hove Albion FC': 'Брайтон',
  'AFC Bournemouth': 'Борнмут',
  'Chelsea FC': 'Челси',
  'Brentford FC': 'Брентфорд',
  'Fulham FC': 'Фулхэм',
  'Everton FC': 'Эвертон',
  'Sunderland AFC': 'Сандерленд',
  'Crystal Palace FC': 'Кристал Пэлас',
  'Newcastle United FC': 'Ньюкасл',
  'Leeds United FC': 'Лидс',
  'Nottingham Forest FC': 'Ноттингем Форест',
  'West Ham United FC': 'Вест Хэм',
  'Tottenham Hotspur FC': 'Тоттенхэм',
  'Burnley FC': 'Бёрнли',
  'Wolverhampton Wanderers FC': 'Вулверхэмптон',
};

const normalizeTeamName = (name) => String(name || '')
  .trim()
  .replace(/\s+/g, ' ');

/** Сравнение клубов из таблицы / query (?team=) с учётом FC/FK и регистра. */
export const normalizeStandingsTeamKey = (name) => String(name || '')
  .toLowerCase()
  .replace(/\b(fc|fk|pfc|afc|sc)\b/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const stripLeadingClubToken = (s) => s.replace(/^(FC|FK|PFC|AFC|SC)\s+/i, '').trim();

/**
 * Базовый список клубов РПЛ для селекторов (до/вместе с таблицей с API).
 * После загрузки турнира имена из таблицы добавляются в профиле автоматически.
 */
export const RPL_TEAM_PICKER_DEFAULTS = [
  'Зенит',
  'Краснодар',
  'Спартак Москва',
  'ЦСКА',
  'Динамо Москва',
  'Локомотив',
  'Ростов',
  'Рубин',
  'Крылья Советов',
  'Ахмат',
  'Пари НН',
  'Сочи',
  'Урал',
  'Оренбург',
  'Балтика',
  'Факел',
  'Акрон',
  'Динамо Махачкала',
];

export const translateTeamName = (name) => {
  const normalized = normalizeTeamName(name);
  if (!normalized) return '';
  if (TEAM_NAME_MAP[normalized]) return TEAM_NAME_MAP[normalized];

  const withoutSuffix = normalized
    .replace(/\s+(FC|AFC)$/i, '')
    .trim();
  if (TEAM_NAME_MAP[withoutSuffix]) return TEAM_NAME_MAP[withoutSuffix];

  const noPrefix = stripLeadingClubToken(normalized);
  if (TEAM_NAME_MAP[noPrefix]) return TEAM_NAME_MAP[noPrefix];
  if (TEAM_NAME_MAP[stripLeadingClubToken(withoutSuffix)]) {
    return TEAM_NAME_MAP[stripLeadingClubToken(withoutSuffix)];
  }

  const matchByBase = Object.entries(TEAM_NAME_MAP).find(([key]) =>
    key.replace(/\s+(FC|AFC)$/i, '').trim().toLowerCase() === withoutSuffix.toLowerCase(),
  );
  if (matchByBase) return matchByBase[1];

  const matchNoPrefix = Object.entries(TEAM_NAME_MAP).find(([key]) =>
    stripLeadingClubToken(key).toLowerCase() === noPrefix.toLowerCase(),
  );
  return matchNoPrefix?.[1] || normalized;
};

/** Сопоставление строки из API (англ.) с избранным клубом (часто по-русски). */
export const teamMatchesFavorite = (apiTeamName, favoriteRaw) => {
  const fav = normalizeTeamName(favoriteRaw).toLowerCase();
  if (!fav || !apiTeamName) return false;
  const en = String(apiTeamName).toLowerCase();
  const ru = translateTeamName(apiTeamName).toLowerCase();
  if (en === fav || ru === fav) return true;
  if (en.includes(fav) || fav.includes(en) || ru.includes(fav) || fav.includes(ru)) return true;

  const favMakhachkala =
    fav.includes('махачкала') || fav.includes('махачкал') || fav.includes('makhachkala');
  const favMoscowDinamo =
    (fav.includes('динамо') || fav.includes('dinamo') || fav.includes('dynamo')) &&
    (fav.includes('москв') || fav.includes('moscow'));
  const apiMakhachkala = en.includes('makhachkala') || ru.includes('махачкала');
  const apiMoscowDinamo =
    ((en.includes('dinamo') || en.includes('dynamo')) &&
      en.includes('moscow') &&
      !en.includes('makhachkala')) ||
    (ru.includes('динамо') && ru.includes('москва') && !ru.includes('махачкала'));
  if (favMakhachkala || favMoscowDinamo) {
    if (favMakhachkala) return apiMakhachkala;
    if (favMoscowDinamo) return apiMoscowDinamo;
  }

  for (const [ruHint, enHint] of RPL_QUERY_HINTS) {
    if (fav.includes(ruHint) && en.includes(enHint)) return true;
  }
  return false;
};

/** Чем выше — тем лучше совпадение (если подходит несколько строк таблицы). */
export const standingMatchRank = (apiTeamName, favoriteRaw) => {
  const fav = normalizeTeamName(favoriteRaw).toLowerCase();
  if (!fav || !apiTeamName) return -1;
  if (!teamMatchesFavorite(apiTeamName, favoriteRaw)) return -1;
  const en = String(apiTeamName).toLowerCase();
  const ru = translateTeamName(apiTeamName).toLowerCase();
  if (ru === fav || en === fav) return 1000;
  if (ru.includes(fav)) return 800;
  if (fav.includes(ru)) return 750;
  if (en.includes(fav) || fav.includes(en)) return 500;
  return 100;
};

export default TEAM_NAME_MAP;
