import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Logo from '../components/Logo';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, hostUser, isHost } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (hostUser && isHost) navigate('/', { replace: true });
  }, [hostUser, isHost, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = { width: '100%', padding: '10px 14px', background: '#0B1520', border: '1px solid #1E3557', borderRadius: '8px', color: '#f8fafc', fontSize: '14px', fontFamily: "'Outfit', sans-serif", boxSizing: 'border-box', transition: 'border-color 0.2s' };

  return (
    <div style={{ minHeight: '100vh', background: '#0F2137', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Outfit', sans-serif" }}>
      <div style={{ background: '#162B44', borderRadius: '16px', border: '1px solid #1E3557', padding: '40px', width: '100%', maxWidth: '400px', boxShadow: '0 25px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <Logo size="md" variant="dark" />
            <div style={{ fontSize: '10px', fontWeight: '700', color: '#C8A258', letterSpacing: '0.12em', textTransform: 'uppercase', background: 'rgba(200,162,88,0.1)', border: '1px solid rgba(200,162,88,0.2)', borderRadius: '4px', padding: '2px 7px' }}>Host Admin</div>
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#f8fafc', margin: '0 0 6px', fontFamily: "'Sora', sans-serif" }}>Sign in</h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>Restricted access — authorized personnel only</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" style={inputStyle}
              onFocus={e => e.target.style.borderColor = '#C8A258'} onBlur={e => e.target.style.borderColor = '#1E3557'} />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" style={inputStyle}
              onFocus={e => e.target.style.borderColor = '#C8A258'} onBlur={e => e.target.style.borderColor = '#1E3557'} />
          </div>
          {error && <div style={{ marginBottom: '16px', padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '13px' }}>{error}</div>}
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px', background: '#C8A258', border: 'none', borderRadius: '8px', color: '#0F2137', fontSize: '14px', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, fontFamily: "'Outfit', sans-serif" }}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
