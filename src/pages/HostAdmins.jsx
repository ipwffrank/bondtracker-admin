import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export default function HostAdmins() {
  const { hostUser } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState(null);

  const loadAdmins = async () => {
    try {
      const snap = await getDocs(collection(db, 'hostAdmins'));
      setAdmins(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
    } catch (err) {
      console.error('Failed to load host admins:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAdmins(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setAdding(true);
    setMessage(null);
    try {
      // Look up user in Firebase Auth via Netlify function
      const res = await fetch('/.netlify/functions/lookup-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      let data;
      try { data = await res.json(); } catch { data = { error: `HTTP ${res.status}` }; }
      if (!res.ok) throw new Error(data.error || 'Lookup failed');

      // Check if already a host admin
      if (admins.find(a => a.uid === data.uid)) {
        setMessage({ type: 'error', text: 'This user is already a host admin.' });
        return;
      }

      // Create hostAdmins document
      await setDoc(doc(db, 'hostAdmins', data.uid), {
        email: data.email,
        displayName: data.displayName || '',
        addedAt: new Date(),
        addedBy: hostUser?.email || '',
      });

      setMessage({ type: 'success', text: `${data.email} added as host admin.` });
      setEmail('');
      await loadAdmins();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (admin) => {
    if (admin.uid === hostUser?.uid) {
      setMessage({ type: 'error', text: 'You cannot remove yourself.' });
      return;
    }
    if (!window.confirm(`Remove ${admin.email || admin.uid} as host admin?`)) return;
    try {
      await deleteDoc(doc(db, 'hostAdmins', admin.uid));
      setMessage({ type: 'success', text: `${admin.email || admin.uid} removed.` });
      await loadAdmins();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const inputStyle = {
    flex: 1, padding: '11px 14px', background: '#0B1520', border: '1px solid #1E3557',
    borderRadius: '10px', color: '#f8fafc', fontSize: '14px', fontFamily: "'Outfit', sans-serif",
    outline: 'none', transition: 'border-color 0.2s',
  };

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#f8fafc', margin: 0, letterSpacing: '-0.3px', fontFamily: "'Sora', sans-serif" }}>
          Host Admins
        </h1>
        <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0' }}>Manage who can access this admin dashboard</p>
      </div>

      {/* Add form */}
      <div style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', padding: '24px', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#f8fafc', margin: '0 0 16px', fontFamily: "'Sora', sans-serif" }}>Add Host Admin</h2>

        {message && (
          <div style={{
            padding: '11px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px',
            background: message.type === 'success' ? 'rgba(200,162,88,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${message.type === 'success' ? 'rgba(200,162,88,0.25)' : 'rgba(239,68,68,0.25)'}`,
            color: message.type === 'success' ? '#C8A258' : '#fca5a5',
            fontFamily: "'Outfit', sans-serif",
          }}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '10px' }}>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            style={inputStyle} placeholder="user@example.com"
            onFocus={e => e.target.style.borderColor = '#C8A258'}
            onBlur={e => e.target.style.borderColor = '#1E3557'}
          />
          <button type="submit" disabled={adding} style={{
            padding: '11px 24px', background: '#C8A258', color: '#0F2137',
            border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
            fontFamily: "'Outfit', sans-serif", cursor: 'pointer', whiteSpace: 'nowrap',
            opacity: adding ? 0.6 : 1, transition: 'all 0.2s',
          }}>
            {adding ? 'Adding...' : 'Add Admin'}
          </button>
        </form>
        <p style={{ color: '#475569', fontSize: '12px', margin: '10px 0 0', fontFamily: "'Outfit', sans-serif" }}>
          User must have an existing Firebase Auth account.
        </p>
      </div>

      {/* Admins list */}
      <div style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px 0' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#f8fafc', margin: '0 0 16px', fontFamily: "'Sora', sans-serif" }}>
            Current Host Admins ({admins.length})
          </h2>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontFamily: "'Outfit', sans-serif" }}>Loading...</div>
        ) : admins.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontFamily: "'Outfit', sans-serif" }}>No host admins found.</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 100px', padding: '12px 24px', borderBottom: '1px solid #1E3557', fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.05em', fontFamily: "'Outfit', sans-serif" }}>
              <div>EMAIL</div>
              <div>NAME</div>
              <div>UID</div>
              <div></div>
            </div>
            {admins.map(admin => (
              <div key={admin.uid} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 100px', padding: '14px 24px', borderBottom: '1px solid #0B1520', fontSize: '13px', fontFamily: "'Outfit', sans-serif", alignItems: 'center', transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ color: '#f8fafc', fontWeight: 500 }}>{admin.email || '—'}</div>
                <div style={{ color: '#94a3b8' }}>{admin.displayName || '—'}</div>
                <div style={{ color: '#475569', fontSize: '11px', fontFamily: 'monospace' }}>{admin.uid}</div>
                <div style={{ textAlign: 'right' }}>
                  {admin.uid === hostUser?.uid ? (
                    <span style={{ fontSize: '11px', color: '#C8A258', fontWeight: 600 }}>You</span>
                  ) : (
                    <button
                      onClick={() => handleRemove(admin)}
                      style={{
                        background: 'transparent', border: '1px solid #1E3557', borderRadius: '6px',
                        color: '#64748b', fontSize: '12px', padding: '4px 10px', cursor: 'pointer',
                        fontFamily: "'Outfit', sans-serif", transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.target.style.borderColor = '#ef4444'; e.target.style.color = '#ef4444'; }}
                      onMouseLeave={e => { e.target.style.borderColor = '#1E3557'; e.target.style.color = '#64748b'; }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
