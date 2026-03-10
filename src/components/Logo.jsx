import React from 'react';

const sizes = { sm: { mark: 28, wordmark: 15 }, md: { mark: 36, wordmark: 18 }, lg: { mark: 48, wordmark: 24 } };

const rotorStyle = `
@keyframes axle-rotor-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
.axle-rotor-blades {
  transform-origin: 22px 22px;
  animation: axle-rotor-spin 12s linear infinite;
}
`;

export default function Logo({ variant = 'dark', size = 'md', animated = true }) {
  const s = sizes[size] || sizes.md;
  const isDark = variant === 'dark';
  const gold = isDark ? '#C8A258' : '#0F2137';
  const bg = isDark ? '#0F2137' : '#F0EDE8';
  const text = isDark ? '#FFFFFF' : '#0F2137';

  return (
    <>
      <style>{rotorStyle}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: `${s.mark * 0.3}px` }}>
        <svg width={s.mark} height={s.mark} viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: gold, display: 'block' }}>
          <g className={animated ? 'axle-rotor-blades' : undefined}>
            <path d="M22 8 Q30 14 28 22" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
            <path d="M34 28 Q28 34 22 32" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.7" />
            <path d="M10 24 Q14 16 22 16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity="0.5" />
          </g>
          <circle cx="22" cy="22" r="4" fill="currentColor" />
          <circle cx="22" cy="22" r="1.8" fill={bg} />
        </svg>
        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: `${s.wordmark}px`, fontWeight: 700, color: text, letterSpacing: '4px' }}>AXLE</span>
      </div>
    </>
  );
}
