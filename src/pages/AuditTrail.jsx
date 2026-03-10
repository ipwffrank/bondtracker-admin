import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';

const ACTION_LABELS = {
  export_activities_excel: 'Export Activities (Excel)',
  export_activities_pdf: 'Export Activities (PDF)',
  export_clients_excel: 'Export Clients (Excel)',
  export_clients_pdf: 'Export Clients (PDF)',
  export_pipeline_issues_excel: 'Export Pipeline Issues (Excel)',
  export_pipeline_issues_pdf: 'Export Pipeline Issues (PDF)',
  export_orderbook_excel: 'Export Order Book (Excel)',
  export_orderbook_pdf: 'Export Order Book (PDF)',
  export_analytics_excel: 'Export Analytics (Excel)',
  export_analytics_pdf: 'Export Analytics (PDF)',
  export_analytics_csv: 'Export Analytics (CSV)',
};

function formatTime(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function formatFullDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString();
}

export default function AuditTrail() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [orgNames, setOrgNames] = useState({});
  const [filterOrg, setFilterOrg] = useState('all');
  const [filterAction, setFilterAction] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    async function load() {
      try {
        // Get all orgs
        const orgsSnap = await getDocs(collection(db, 'organizations'));
        const names = {};
        const allLogs = [];

        for (const orgDoc of orgsSnap.docs) {
          const orgId = orgDoc.id;
          const orgData = orgDoc.data();
          names[orgId] = orgData.name || orgData.domain || orgId;

          const logsSnap = await getDocs(
            query(collection(db, 'organizations', orgId, 'auditLogs'), orderBy('timestamp', 'desc'), limit(200))
          );
          logsSnap.docs.forEach(d => {
            allLogs.push({ id: d.id, organizationId: orgId, ...d.data() });
          });
        }

        allLogs.sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0));
        setOrgNames(names);
        setLogs(allLogs);
      } catch (err) {
        console.error('Failed to load audit logs:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const uniqueOrgs = [...new Set(logs.map(l => l.organizationId))];
  const uniqueActions = [...new Set(logs.map(l => l.action))];

  const filtered = logs.filter(log => {
    if (filterOrg !== 'all' && log.organizationId !== filterOrg) return false;
    if (filterAction !== 'all' && log.action !== filterAction) return false;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      if (!(log.userName || '').toLowerCase().includes(s) && !(log.userEmail || '').toLowerCase().includes(s) && !(log.details || '').toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const selectStyle = {
    padding: '7px 12px', background: '#0B1520', border: '1px solid #1E3557',
    borderRadius: '8px', color: '#f8fafc', fontSize: '13px', fontFamily: "'Outfit', sans-serif",
    outline: 'none', cursor: 'pointer',
  };

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#f8fafc', margin: 0, letterSpacing: '-0.3px', fontFamily: "'Sora', sans-serif" }}>
          Audit Trail
        </h1>
        <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0' }}>Track all data export actions across organizations</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'TOTAL EVENTS', value: logs.length },
          { label: 'ORGANIZATIONS', value: uniqueOrgs.length },
          { label: 'TODAY', value: logs.filter(l => { const d = l.timestamp?.toDate?.(); return d && (new Date() - d) < 86400000; }).length },
        ].map(s => (
          <div key={s.label} style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', padding: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.08em', marginBottom: '8px', fontFamily: "'Outfit', sans-serif" }}>{s.label}</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#f8fafc', fontFamily: "'Sora', sans-serif" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input
          type="text" placeholder="Search user or details..."
          value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
          style={{ ...selectStyle, flex: 1, minWidth: '200px' }}
        />
        <select value={filterOrg} onChange={e => setFilterOrg(e.target.value)} style={selectStyle}>
          <option value="all">All Organizations</option>
          {uniqueOrgs.map(id => <option key={id} value={id}>{orgNames[id] || id}</option>)}
        </select>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)} style={selectStyle}>
          <option value="all">All Actions</option>
          {uniqueActions.map(a => <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#64748b', fontFamily: "'Outfit', sans-serif" }}>Loading audit logs...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#64748b', fontFamily: "'Outfit', sans-serif" }}>
            {logs.length === 0 ? 'No audit logs yet. Export actions will appear here automatically.' : 'No logs match your filters.'}
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr 1fr 1.5fr', padding: '12px 20px', borderBottom: '1px solid #1E3557', fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.05em', fontFamily: "'Outfit', sans-serif" }}>
              <div>TIME</div>
              <div>ORGANIZATION</div>
              <div>USER</div>
              <div>ACTION</div>
              <div>DETAILS</div>
            </div>

            {/* Rows */}
            {filtered.slice(0, 200).map(log => (
              <div key={log.id} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr 1fr 1.5fr', padding: '12px 20px', borderBottom: '1px solid #0B1520', fontSize: '13px', fontFamily: "'Outfit', sans-serif", transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ color: '#64748b' }} title={formatFullDate(log.timestamp)}>{formatTime(log.timestamp)}</div>
                <div style={{ color: '#94a3b8' }}>{orgNames[log.organizationId] || log.organizationId}</div>
                <div>
                  <div style={{ color: '#f8fafc', fontWeight: 500 }}>{log.userName || '—'}</div>
                  <div style={{ color: '#475569', fontSize: '11px' }}>{log.userEmail || ''}</div>
                </div>
                <div>
                  <span style={{ background: 'rgba(200,162,88,0.1)', border: '1px solid rgba(200,162,88,0.2)', color: '#C8A258', fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px' }}>
                    {ACTION_LABELS[log.action] || log.action}
                  </span>
                </div>
                <div style={{ color: '#94a3b8' }}>{log.details}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
