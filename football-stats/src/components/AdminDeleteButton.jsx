import React from 'react';

/** Компактная кнопка-иконка корзины для списков админки. */
export const AdminDeleteButton = ({ onClick, title = 'Удалить', disabled = false }) => (
  <button
    type="button"
    className="admin-delete-btn"
    onClick={onClick}
    disabled={disabled}
    aria-label={title}
    title={title}
  >
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <path
        d="M3 6h18M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2m2 0v14a2 2 0 01-2 2H8a2 2 0 01-2-2V6h12zM10 11v6M14 11v6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </button>
);
