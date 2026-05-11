import React from 'react';
import { getRplLeagueMarkUrl } from '../localCrests';

/**
 * Шторка страницы: строка брендинга РПЛ (разметка + типографика, не растровый скрин).
 */
export default function RplHeroPanel({ title, children }) {
  return (
    <div className="panel-head tables-hero-panel">
      <div className="tables-hero-head-left">
        <div className="tables-hero-rpl-brand-row">
          <img
            className="tables-hero-rpl-mark-icon"
            src={getRplLeagueMarkUrl()}
            alt=""
            width={36}
            height={36}
            loading="eager"
            decoding="async"
          />
          <span className="tables-hero-rpl-sep" aria-hidden="true" />
          <span className="tables-hero-rpl-mir">МИР</span>
          <div className="tables-hero-rpl-titlestack">
            <span className="tables-hero-rpl-line">Российская</span>
            <span className="tables-hero-rpl-line">премьер-лига</span>
          </div>
        </div>
        <h2 className="headline-md tables-hero-page-title">{title}</h2>
        <div className="tables-hero-chip-slot">{children}</div>
      </div>
    </div>
  );
}
