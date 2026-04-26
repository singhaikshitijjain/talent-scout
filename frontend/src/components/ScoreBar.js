import React from 'react';

function getScoreColor(score) {
  if (score >= 80) return 'var(--success)';
  if (score >= 60) return 'var(--accent)';
  if (score >= 40) return 'var(--warning)';
  return 'var(--danger)';
}

export function ScoreBar({ label, score, showNum = true }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.8rem' }}>
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        {showNum && <span style={{ fontWeight: 600, color: getScoreColor(score) }}>{score}</span>}
      </div>
      <div className="progress-bar">
        <div
          className="progress-bar-fill"
          style={{ width: `${score}%`, background: getScoreColor(score) }}
        />
      </div>
    </div>
  );
}

export function ScoreBadge({ score, size = 'md' }) {
  const color = getScoreColor(score);
  const sizes = { sm: { w: 52, fs: '1.1rem' }, md: { w: 64, fs: '1.4rem' }, lg: { w: 80, fs: '1.8rem' } };
  const s = sizes[size] || sizes.md;

  return (
    <div style={{
      width: s.w, height: s.w,
      borderRadius: '50%',
      border: `3px solid ${color}`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'white'
    }}>
      <span style={{ fontFamily: 'var(--font-serif)', fontSize: s.fs, color, lineHeight: 1 }}>{score}</span>
    </div>
  );
}

export function RecommendationBadge({ rec }) {
  const map = {
    strong_hire: { label: 'Strong Hire', cls: 'badge-green' },
    hire: { label: 'Hire', cls: 'badge-blue' },
    maybe: { label: 'Maybe', cls: 'badge-yellow' },
    pass: { label: 'Pass', cls: 'badge-red' },
    unknown: { label: 'Pending', cls: 'badge-gray' }
  };
  const { label, cls } = map[rec] || map.unknown;
  return <span className={`badge ${cls}`}>{label}</span>;
}
