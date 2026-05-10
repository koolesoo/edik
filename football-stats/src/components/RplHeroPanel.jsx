import React from 'react';

/**
 * Шторка страницы: заголовок + слот под чип (обновление и т.п.).
 */
export default function RplHeroPanel({ title, children }) {
  return (
    <div className="panel-head tables-hero-panel">
      <div className="tables-hero-head-left">
        <h2 className="headline-md tables-hero-page-title">{title}</h2>
        <div className="tables-hero-chip-slot">{children}</div>
      </div>
    </div>
  );
}
