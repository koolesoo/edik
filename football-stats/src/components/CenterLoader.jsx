import React from 'react';

const CenterLoader = ({ inline = false }) => {
  if (inline) {
    return (
      <div className="loader-inline" aria-live="polite" aria-busy="true">
        <div className="center-loader" role="status" aria-label="Загрузка">
          <span className="center-loader-ring" />
        </div>
      </div>
    );
  }

  return (
    <main className="page loader-page" aria-live="polite" aria-busy="true">
      <div className="center-loader" role="status" aria-label="Загрузка">
        <span className="center-loader-ring" />
      </div>
    </main>
  );
};

export default CenterLoader;
