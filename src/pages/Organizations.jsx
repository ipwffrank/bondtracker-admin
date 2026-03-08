import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export default function Organizations() {
  const [orgs, setOrgs] = useState([]);
  const [userCounts, setUserCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const unsubOrgs = onSnapshot(collection(db, 'organizations'), snap => {
      setOrgs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, err => { console.error(err); setLoading(false); });

    const unsubUsers = onSnapshot(collection(db, 'users'), snap => {
      const counts = {};
      snap.docs.forEach(d => {
        const orgId = d.data().organizationId;
        if (orgId) counts[orgId] = (counts[orgId] || 0) + 1;
      });
      setUserCounts(counts);
    });

    return () => { unsubOrgs(); unsubUsers(); };
  }, []);

  const filtered = orgs
    .filter(o => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (o.name || o.id).toLowerCase().includes(q) || o.id.toLowerCase().includes(q);
    })
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

  const totalUsers = Object.values(userCounts).reduce((a, b) => a + b, 0);

  function formatDate(ts) {
    if (!ts) return '—';
    return (ts.toDate?.() || new Date(ts)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#f8fafc', margin: 0, letterSpacing: '-0.3px', fontFamily: "'Sora', sans-serif" }}>Organizations</h1>
        <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0' }}>{orgs.length} organizations · {totalUsers} total users</p>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <input
          placeholder="Search by name or org ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '300px', padding: '8px 14px', background: '#162B44', border: '1px solid #1E3557', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', fontFamily: "'Outfit', sans-serif" }}
        />
      </div>

      <div style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr 80px 1fr', padding: '10px 20px', borderBottom: '1px solid #1E3557', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          <span>Organization</span><span>Org ID</span><span>Users</span><span>Created</span>
        </div>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>{orgs.length === 0 ? 'No organizations yet.' : 'No results match your search.'}</div>
        ) : filtered.map(org => (
          <div key={org.id} style={{ display: 'grid', gridTemplateColumns: '2fr 3fr 80px 1fr', padding: '14px 20px', borderBottom: '1px solid #0B1520', alignItems: 'center' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc' }}>{org.name || org.id}</div>
            <div style={{ fontSize: '12px', color: '#64748b', fontFamily: "'JetBrains Mono', monospace", background: '#0B1520', padding: '3px 8px', borderRadius: '4px', display: 'inline-block', letterSpacing: '0.02em' }}>{org.id}</div>
            <div>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#C8A258', background: 'rgba(200,162,88,0.1)', padding: '3px 10px', borderRadius: '100px', border: '1px solid rgba(200,162,88,0.25)' }}>
                {userCounts[org.id] || 0}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>{formatDate(org.createdAt)}</div>
          </div>
        ))}
      </div>

      {orgs.length > 0 && (
        <div style={{ marginTop: '16px', padding: '14px 20px', background: '#162B44', border: '1px solid #1E3557', borderRadius: '10px', display: 'flex', gap: '32px' }}>
          {[['Total Orgs', orgs.length], ['Total Users', totalUsers], ['Avg Users/Org', orgs.length > 0 ? (totalUsers / orgs.length).toFixed(1) : '0']].map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>{label}</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#f8fafc' }}>{val}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
