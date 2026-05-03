import React from 'react';

export const RPL_LOGO_CDN = 'https://cdn.premierliga.ru/resources/images/logo';

/**
 * Шторка страницы: бренд РПЛ (как на premierliga.ru) + заголовок + слот под чип.
 */
export default function RplHeroPanel({ title, children }) {
  return (
    <div className="panel-head tables-hero-panel">
      <div className="tables-hero-head-left">
        <a
          className="tables-hero-rpl-brand"
          href="https://premierliga.ru/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Российская премьер-лига — официальный сайт"
        >
          <div className="tables-hero-rpl-promo">
            <div className="tables-hero-rpl-promo__mark tables-hero-rpl-promo__mark--bear">
              <img
                src={`${RPL_LOGO_CDN}/bear.svg`}
                alt=""
                width={26}
                height={26}
                loading="eager"
                decoding="async"
              />
            </div>
            <div className="tables-hero-rpl-divider" aria-hidden="true" />
            <div className="tables-hero-rpl-promo__mark tables-hero-rpl-promo__mark--mir">
              <img
                src={`${RPL_LOGO_CDN}/mir.svg`}
                alt=""
                width={46}
                height={20}
                loading="eager"
                decoding="async"
              />
            </div>
          </div>
          <div className="tables-hero-rpl-wordmark" aria-hidden="true">
            <img
              src={`${RPL_LOGO_CDN}/rpl.svg`}
              alt=""
              width={84}
              height={26}
              loading="eager"
              decoding="async"
            />
          </div>
        </a>
        <h2 className="headline-md tables-hero-page-title">{title}</h2>
        <div className="tables-hero-chip-slot">{children}</div>
      </div>
    </div>
  );
}
