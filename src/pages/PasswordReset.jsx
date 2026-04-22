import React, { useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export default function PasswordReset() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null); // { type, text }
  const [recentResets, setRecentResets] = useState([]);

  const handleReset = async (e) => {
    e.preventDefault();
    if (!email.trim()) { setMessage({ type: 'error', text: 'Please enter an email address.' }); return; }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/.netlify/functions/host-reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      let data;
      try { data = await res.json(); } catch { data = { error: `HTTP ${res.status}` }; }
      if (!res.ok) throw new Error(data.error || 'Failed');
      setMessage({ type: 'success', text: data.message });
      setRecentResets(prev => [{ email: email.trim(), time: new Date() }, ...prev.slice(0, 9)]);
      setEmail('');
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  // Look up user info
  const [userInfo, setUserInfo] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);

  const lookupUser = async () => {
    if (!email.trim()) return;
    setLookingUp(true);
    setUserInfo(null);
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email.trim())));
      if (!snap.empty) {
        const d = snap.docs[0].data();
        setUserInfo({ name: d.name || d.displayName || '—', org: d.organizationName || d.organizationId || '—', role: d.role || 'user' });
      } else {
        setUserInfo({ notFound: true });
      }
    } catch {
      setUserInfo({ notFound: true });
    } finally {
      setLookingUp(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '11px 14px', background: '#0B1520', border: '1px solid #1E3557',
    borderRadius: '10px', color: '#f8fafc', fontSize: '15px', fontFamily: "'Manrope', sans-serif",
    outline: 'none', transition: 'border-color 0.2s',
  };

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#f8fafc', margin: 0, letterSpacing: '-0.3px', fontFamily: "'Manrope', sans-serif" }}>
          Password Reset
        </h1>
        <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0' }}>Send password reset emails to users</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Reset Form */}
        <div style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', padding: '28px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#f8fafc', margin: '0 0 20px', fontFamily: "'Manrope', sans-serif" }}>Send Reset Link</h2>

          {message && (
            <div style={{
              padding: '11px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px',
              background: message.type === 'success' ? 'rgba(200,162,88,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${message.type === 'success' ? 'rgba(200,162,88,0.25)' : 'rgba(239,68,68,0.25)'}`,
              color: message.type === 'success' ? '#C8A258' : '#fca5a5',
              fontFamily: "'Manrope', sans-serif",
            }}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleReset}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#94a3b8', marginBottom: '7px', fontFamily: "'Manrope', sans-serif" }}>User Email</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input
                type="email" value={email} onChange={e => { setEmail(e.target.value); setUserInfo(null); }}
                style={inputStyle} placeholder="user@firm.com"
                onFocus={e => e.target.style.borderColor = '#C8A258'}
                onBlur={e => { e.target.style.borderColor = '#1E3557'; lookupUser(); }}
              />
            </div>

            {/* User info lookup */}
            {lookingUp && <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px', fontFamily: "'Manrope', sans-serif" }}>Looking up user...</div>}
            {userInfo && !userInfo.notFound && (
              <div style={{ background: '#0B1520', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px', fontSize: '13px', fontFamily: "'Manrope', sans-serif" }}>
                <div style={{ color: '#f8fafc', fontWeight: 500 }}>{userInfo.name}</div>
                <div style={{ color: '#64748b', fontSize: '12px' }}>Org: {userInfo.org} &middot; Role: {userInfo.role}</div>
              </div>
            )}
            {userInfo?.notFound && (
              <div style={{ fontSize: '12px', color: '#f59e0b', marginBottom: '12px', fontFamily: "'Manrope', sans-serif" }}>User not found in database</div>
            )}

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '13px', background: '#C8A258', color: '#0F2137',
              border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 600,
              fontFamily: "'Manrope', sans-serif", cursor: 'pointer',
              opacity: loading ? 0.6 : 1, transition: 'all 0.2s',
            }}>
              {loading ? 'Sending...' : 'Send Password Reset'}
            </button>
          </form>
        </div>

        {/* Recent Resets */}
        <div style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', padding: '28px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#f8fafc', margin: '0 0 20px', fontFamily: "'Manrope', sans-serif" }}>Recent Resets (This Session)</h2>
          {recentResets.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '13px', fontFamily: "'Manrope', sans-serif" }}>No resets sent this session.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recentResets.map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#0B1520', borderRadius: '8px', fontSize: '13px', fontFamily: "'Manrope', sans-serif" }}>
                  <span style={{ color: '#f8fafc' }}>{r.email}</span>
                  <span style={{ color: '#64748b', fontSize: '11px' }}>{r.time.toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
