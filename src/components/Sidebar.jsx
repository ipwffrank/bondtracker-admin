import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Logo from './Logo';

const navItems = [
  { path: '/', label: 'Dashboard', exact: true, d: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z', d2: 'M9 22V12h6v10' },
  { path: '/demo-leads', label: 'Demo Leads', d: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { path: '/organizations', label: 'Organizations', d: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { path: '/users', label: 'Users', d: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm8 4a3 3 0 100-6 3 3 0 000 6zm3 3v-1a3 3 0 00-3-3' },
  { path: '/activity-monitor', label: 'Activity Monitor', d: 'M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z', d2: 'M13 2v7h7M9 13h6M9 17h4' },
  { path: '/analytics', label: 'Analytics', d: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { path: '/host-admins', label: 'Host Admins', d: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
  { path: '/audit-trail', label: 'Audit Trail', d: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { path: '/password-reset', label: 'Password Reset', d: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z' },
];

const activeStyle = (isActive) => ({
  display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '8px',
  textDecoration: 'none', color: isActive ? '#C8A258' : '#94a3b8',
  background: isActive ? 'rgba(200,162,88,0.1)' : 'transparent',
  fontSize: '14px', fontWeight: isActive ? '600' : '500', transition: 'all 0.15s',
  border: isActive ? '1px solid rgba(200,162,88,0.2)' : '1px solid transparent',
  fontFamily: "'Outfit', sans-serif",
});

function NavIcon({ d, d2 }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={d} />
      {d2 && <path d={d2} />}
    </svg>
  );
}

export default function Sidebar() {
  const { hostUser, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: '220px', background: '#0B1520', borderRight: '1px solid #132940', display: 'flex', flexDirection: 'column', zIndex: 100 }}>
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid #132940' }}>
        <Logo size="sm" variant="dark" />
        <div style={{ display: 'inline-block', marginTop: '8px', fontSize: '10px', fontWeight: '700', color: '#C8A258', letterSpacing: '0.12em', textTransform: 'uppercase', background: 'rgba(200,162,88,0.1)', border: '1px solid rgba(200,162,88,0.2)', borderRadius: '4px', padding: '2px 7px', fontFamily: "'Outfit', sans-serif" }}>Host Admin</div>
      </div>
      <nav style={{ flex: 1, padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.exact}
            style={({ isActive }) => activeStyle(isActive)}
            onMouseEnter={e => { if (!e.currentTarget.getAttribute('aria-current')) { e.currentTarget.style.color = '#cbd5e1'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; } }}
            onMouseLeave={e => { if (!e.currentTarget.getAttribute('aria-current')) { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'transparent'; } }}
          >
            <NavIcon d={item.d} d2={item.d2} />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div style={{ padding: '14px 16px', borderTop: '1px solid #132940' }}>
        <div style={{ fontSize: '11px', color: '#475569', marginBottom: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'Outfit', sans-serif" }}>{hostUser?.email}</div>
        <button
          onClick={handleLogout}
          style={{ width: '100%', padding: '7px 12px', background: 'transparent', border: '1px solid #1E3557', borderRadius: '6px', color: '#64748b', fontSize: '12px', cursor: 'pointer', textAlign: 'center', fontFamily: "'Outfit', sans-serif", transition: 'all 0.15s' }}
          onMouseEnter={e => { e.target.style.borderColor = '#ef4444'; e.target.style.color = '#ef4444'; }}
          onMouseLeave={e => { e.target.style.borderColor = '#1E3557'; e.target.style.color = '#64748b'; }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
