import React from 'react';

const clampProgress = (value) => Math.max(0, Math.min(100, value));

const ProgressPill = ({ value }) => {
  const safeValue = clampProgress(value);

  return (
    <div className="progress-pill-track" aria-hidden="true">
      <div className="progress-pill-fill" style={{ width: `${safeValue}%` }} />
    </div>
  );
};

export default ProgressPill;
