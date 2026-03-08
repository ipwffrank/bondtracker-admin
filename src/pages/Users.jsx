import React, { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, getDoc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

function RoleBadge({ isAdmin }) {
  return (
    <span style={{
      fontSize: '11px', fontWeight: '600', padding: '3px 9px', borderRadius: '100px',
      background: isAdmin ? 'rgba(245,158,11,0.15)' : 'rgba(100,116,139,0.12)',
      color: isAdmin ? '#f59e0b' : '#94a3b8',
      border: `1px solid ${isAdmin ? 'rgba(245,158,11,0.3)' : 'rgba(100,116,139,0.25)'}`,
    }}>
      {isAdmin ? 'Admin' : 'User'}
    </span>
  );
}

function formatTime(ts) {
  if (!ts) return { line1: 'Never', line2: null };
  const date = ts.toDate?.() || new Date(ts);
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return { line1: 'Just now', line2: null };
  if (diff < 3600000) return { line1: `${Math.floor(diff / 60000)}m ago`, line2: null };
  const line1 = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const line2 = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return { line1, line2 };
}

const selectStyle = {
  width: '100%', padding: '8px 12px', background: '#0B1520', border: '1px solid #1E3557',
  borderRadius: '8px', color: '#f8fafc', fontSize: '13px', fontFamily: "'Outfit', sans-serif",
  cursor: 'pointer', boxSizing: 'border-box',
};

export default function Users() {
  const [users, setUsers] = useState([]);
  const [orgDetails, setOrgDetails] = useState({});
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orgFilter, setOrgFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [editState, setEditState] = useState({ isAdmin: false, organizationId: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Subscribe to users and orgs
  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), snap => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, err => { console.error(err); setLoading(false); });

    const unsubOrgs = onSnapshot(collection(db, 'organizations'), snap => {
      setOrgs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubUsers(); unsubOrgs(); };
  }, []);

  // Load org-level details (lastLogin, isAdmin, role) for each user
  useEffect(() => {
    if (users.length === 0) return;
    async function loadOrgDetails() {
      const details = {};
      await Promise.all(users.map(async user => {
        if (!user.organizationId) return;
        try {
          const snap = await getDoc(doc(db, 'organizations', user.organizationId, 'users', user.id));
          if (snap.exists()) {
            const d = snap.data();
            details[user.id] = { lastLogin: d.lastLogin, isAdmin: d.isAdmin, role: d.role };
          }
        } catch {}
      }));
      setOrgDetails(details);
    }
    loadOrgDetails();
  }, [users]);

  const filtered = users
    .map(u => ({ ...u, ...orgDetails[u.id] }))
    .filter(u => {
      if (orgFilter !== 'ALL' && u.organizationId !== orgFilter) return false;
      if (roleFilter === 'admin' && !u.isAdmin) return false;
      if (roleFilter === 'user' && u.isAdmin) return false;
      if (search) {
        const q = search.toLowerCase();
        return `${u.name} ${u.email} ${u.organizationName || ''}`.toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      const at = a.createdAt?.toMillis?.() || 0;
      const bt = b.createdAt?.toMillis?.() || 0;
      return bt - at;
    });

  const openEdit = (user) => {
    setSelectedUser(user);
    setEditState({ isAdmin: user.isAdmin || false, organizationId: user.organizationId || '' });
    setSaved(false);
  };

  // FIX: properly update org-level records when role or org changes
  const handleSave = async () => {
    if (!selectedUser) return;
    setSaving(true);
    setSaved(false);
    try {
      const org = orgs.find(o => o.id === editState.organizationId);
      const roleData = { isAdmin: editState.isAdmin, role: editState.isAdmin ? 'admin' : 'user' };

      // 1. Update root users document
      await updateDoc(doc(db, 'users', selectedUser.id), {
        ...roleData,
        organizationId: editState.organizationId,
        organizationName: org?.name || editState.organizationId,
      });

      // 2. Update NEW org-level user document (correct org)
      if (editState.organizationId) {
        await setDoc(
          doc(db, 'organizations', editState.organizationId, 'users', selectedUser.id),
          roleData,
          { merge: true }
        );
      }

      // 3. If org changed, remove user from OLD org's sub-collection
      if (selectedUser.organizationId && selectedUser.organizationId !== editState.organizationId) {
        try {
          await deleteDoc(doc(db, 'organizations', selectedUser.organizationId, 'users', selectedUser.id));
        } catch {}
      }

      setSaved(true);
      // Refresh selected user state to reflect new org
      setSelectedUser(prev => ({ ...prev, ...roleData, organizationId: editState.organizationId, organizationName: org?.name || editState.organizationId }));
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '20px' }}>
      {/* User list */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#f8fafc', margin: 0, letterSpacing: '-0.3px', fontFamily: "'Sora', sans-serif" }}>Users</h1>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0' }}>{users.length} total users across {orgs.length} organizations</p>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
          <input
            placeholder="Search name, email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, padding: '8px 14px', background: '#162B44', border: '1px solid #1E3557', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', fontFamily: "'Outfit', sans-serif" }}
          />
          <select value={orgFilter} onChange={e => setOrgFilter(e.target.value)} style={{ padding: '8px 14px', background: '#162B44', border: '1px solid #1E3557', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', fontFamily: "'Outfit', sans-serif", cursor: 'pointer', minWidth: '160px' }}>
            <option value="ALL">All Organizations</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name || o.id}</option>)}
          </select>
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ padding: '8px 14px', background: '#162B44', border: '1px solid #1E3557', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', fontFamily: "'Outfit', sans-serif", cursor: 'pointer' }}>
            <option value="ALL">All Roles</option>
            <option value="admin">Admin</option>
            <option value="user">User</option>
          </select>
        </div>

        <div style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 70px', padding: '10px 16px', borderBottom: '1px solid #1E3557', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <span>User</span>
            <span>Organization</span>
            <span>Role</span>
            <span>Last Login</span>
            <span />
          </div>
          {loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>No users found.</div>
          ) : filtered.map(user => {
            const t = formatTime(user.lastLogin);
            return (
              <div key={user.id} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 70px', padding: '12px 16px', borderBottom: '1px solid #0B1520', alignItems: 'center', background: selectedUser?.id === user.id ? 'rgba(200,162,88,0.06)' : 'transparent', borderLeft: selectedUser?.id === user.id ? '2px solid #C8A258' : '2px solid transparent' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#f8fafc' }}>{user.name}</div>
                  <div style={{ fontSize: '12px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
                </div>
                <div style={{ fontSize: '13px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.organizationName || user.organizationId || '—'}</div>
                <div><RoleBadge isAdmin={user.isAdmin} /></div>
                <div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>{t.line1}</div>
                  {t.line2 && <div style={{ fontSize: '11px', color: '#475569' }}>{t.line2}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <button
                    onClick={() => openEdit(user)}
                    style={{ padding: '5px 12px', background: 'transparent', border: '1px solid #1E3557', borderRadius: '6px', color: '#94a3b8', fontSize: '12px', cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}
                    onMouseEnter={e => { e.target.style.borderColor = '#C8A258'; e.target.style.color = '#C8A258'; }}
                    onMouseLeave={e => { e.target.style.borderColor = '#1E3557'; e.target.style.color = '#94a3b8'; }}
                  >
                    Edit
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit panel */}
      {selectedUser && (
        <div style={{ width: '280px', flexShrink: 0, background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', overflow: 'hidden', alignSelf: 'flex-start' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #1E3557', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc' }}>Edit User</div>
            <button onClick={() => setSelectedUser(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '20px', lineHeight: 1 }}>×</button>
          </div>
          <div style={{ padding: '18px' }}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '15px', fontWeight: '600', color: '#f8fafc' }}>{selectedUser.name}</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{selectedUser.email}</div>
              {selectedUser.lastLogin && (() => {
                const t = formatTime(selectedUser.lastLogin);
                return <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>Last login: {t.line1}{t.line2 ? ` · ${t.line2}` : ''}</div>;
              })()}
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Organization</label>
              <select value={editState.organizationId} onChange={e => setEditState(s => ({ ...s, organizationId: e.target.value }))} style={selectStyle}>
                <option value="">— no org —</option>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name || o.id}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Role</label>
              <select value={editState.isAdmin ? 'admin' : 'user'} onChange={e => setEditState(s => ({ ...s, isAdmin: e.target.value === 'admin' }))} style={selectStyle}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              style={{ width: '100%', padding: '9px', background: saved ? '#B8913A' : '#C8A258', border: 'none', borderRadius: '8px', color: '#0F2137', fontSize: '13px', fontWeight: '700', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: "'Outfit', sans-serif", transition: 'background 0.2s' }}
            >
              {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
            </button>
            {saved && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
                Role updated in both root and org-level records
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
