import React from 'react';

export default function Navbar({ role, setRole }) {
  return (
    <nav style={{
      background: 'white',
      borderBottom: '1px solid var(--border)',
      padding: '0 24px',
      height: '60px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      boxShadow: 'var(--shadow-sm)'
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: 32, height: 32,
          background: 'var(--accent)',
          borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <svg width="18" height="18" fill="white" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
          </svg>
        </div>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: '1.2rem', letterSpacing: '-0.01em' }}>
          TalentScout<span style={{ color: 'var(--accent)' }}> AI</span>
        </span>
      </div>

      {/* Role Toggle */}
      <div style={{
        display: 'flex',
        background: 'var(--bg-subtle)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        padding: '4px',
        gap: '4px'
      }}>
        {['candidate', 'recruiter'].map(r => (
          <button
            key={r}
            onClick={() => setRole(r)}
            style={{
              padding: '7px 18px',
              borderRadius: '7px',
              border: 'none',
              fontFamily: 'var(--font-sans)',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'var(--transition)',
              background: role === r ? 'white' : 'transparent',
              color: role === r ? 'var(--accent)' : 'var(--text-secondary)',
              boxShadow: role === r ? 'var(--shadow-sm)' : 'none'
            }}
          >
            {r === 'candidate' ? '👤 Candidate' : '🔍 Recruiter'}
          </button>
        ))}
      </div>

      {/* Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        <span className="status-dot green" />
        Powered by Mistral
      </div>
    </nav>
  );
}
