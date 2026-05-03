import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { preferCrest } from '../localCrests';
import { translateTeamName } from '../teamNames';

const CrestContext = createContext(null);

export const CrestProvider = ({ children }) => {
  const [crestByTeam, setCrestByTeam] = useState({});
  /** Имена клубов в порядке таблицы API (по одному на команду) — для селекторов без дублей EN/RU. */
  const [rplStandingsTeamOrder, setRplStandingsTeamOrder] = useState([]);

  const mergeStandingsRows = useCallback((standings) => {
    if (!Array.isArray(standings) || standings.length === 0) return;
    const order = standings
      .map((row) => (typeof row?.team === 'string' ? row.team.trim() : ''))
      .filter(Boolean);
    if (order.length) setRplStandingsTeamOrder(order);

    setCrestByTeam((prev) => {
      const next = { ...prev };
      standings.forEach((row) => {
        if (!row?.team) return;
        const apiName = row.team;
        const crest = preferCrest(apiName, row.crest || row.logo || '');
        const ru = translateTeamName(apiName);
        const register = (label) => {
          if (!label) return;
          if (crest) next[label] = crest;
          else if (next[label] == null) next[label] = '';
        };
        register(apiName);
        if (ru && ru !== apiName) register(ru);
      });
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ crestByTeam, mergeStandingsRows, rplStandingsTeamOrder }),
    [crestByTeam, mergeStandingsRows, rplStandingsTeamOrder],
  );

  return <CrestContext.Provider value={value}>{children}</CrestContext.Provider>;
};

export const useCrestMap = () => {
  const ctx = useContext(CrestContext);
  if (!ctx) {
    throw new Error('useCrestMap must be used within CrestProvider');
  }
  return ctx;
};
