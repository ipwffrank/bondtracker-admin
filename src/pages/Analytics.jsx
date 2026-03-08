import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';

const STATUS_COLORS = { EXECUTED: '#10b981', ENQUIRY: '#3b82f6', QUOTED: '#f59e0b', PASSED: '#64748b', 'TRADED AWAY': '#ef4444' };
const DIR_COLORS = { BUY: '#10b981', SELL: '#ef4444', 'TWO-WAY': '#8b5cf6' };
const STATUSES = ['ENQUIRY', 'QUOTED', 'EXECUTED', 'PASSED', 'TRADED AWAY'];
const DIRECTIONS = ['BUY', 'SELL', 'TWO-WAY'];
const TYPE_COLORS = { FUND: '#3b82f6', BANK: '#C8A258', INSURANCE: '#10b981', PENSION: '#f59e0b', SOVEREIGN: '#8b5cf6', 'HEDGE FUND': '#ec4899', CORPORATE: '#06b6d4', OTHER: '#64748b' };
const REGION_COLORS = { APAC: '#3b82f6', EMEA: '#C8A258', AMERICAS: '#10b981', UNSPECIFIED: '#64748b' };
const CURR_COLORS = { USD: '#10b981', EUR: '#3b82f6', GBP: '#C8A258', JPY: '#f59e0b', CNY: '#ef4444', AUD: '#8b5cf6', SGD: '#06b6d4', HKD: '#ec4899', 'N/A': '#64748b' };

function BarMetric({ label, value, max, color, pct }) {
  const w = max > 0 ? Math.min(Math.round(value / max * 100), 100) : 0;
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
        <span style={{ fontSize: '13px', color: '#94a3b8' }}>{label}</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {pct !== undefined && <span style={{ fontSize: '11px', color: '#64748b' }}>{pct}%</span>}
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc' }}>{value}</span>
        </div>
      </div>
      <div style={{ height: '7px', background: '#0B1520', borderRadius: '100px', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: '100px', background: color, width: `${w}%`, minWidth: value > 0 ? '5px' : '0', transition: 'width 0.5s ease' }} />
      </div>
    </div>
  );
}

function timeAgo(ts) {
  if (!ts) return '\u2014';
  const d = ts.toDate?.() || new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatVolume(val) {
  if (val >= 1000) return `${(val / 1000).toFixed(1)}B`;
  return `${val.toFixed(1)}MM`;
}

export default function Analytics() {
  const [activities, setActivities] = useState([]);
  const [clients, setClients] = useState([]);
  const [newIssues, setNewIssues] = useState([]);
  const [orgNames, setOrgNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [orgFilter, setOrgFilter] = useState('ALL');
  const [orgs, setOrgs] = useState([]);
  const [refreshedAt, setRefreshedAt] = useState(new Date());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const orgsSnap = await getDocs(collection(db, 'organizations'));
      const orgList = orgsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setOrgs(orgList);
      const names = {};
      orgList.forEach(o => { names[o.id] = o.name || o.id; });
      setOrgNames(names);

      const all = [];
      await Promise.all(orgList.map(async org => {
        try {
          const snap = await getDocs(query(collection(db, 'organizations', org.id, 'activities'), orderBy('createdAt', 'desc'), limit(500)));
          snap.docs.forEach(d => all.push({ id: d.id, orgId: org.id, orgName: names[org.id], ...d.data() }));
        } catch {}
      }));
      all.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setActivities(all);

      const allClients = [];
      await Promise.all(orgList.map(async org => {
        try {
          const snap = await getDocs(query(collection(db, 'organizations', org.id, 'clients'), orderBy('name', 'asc')));
          snap.docs.forEach(d => allClients.push({ id: d.id, orgId: org.id, orgName: names[org.id], ...d.data() }));
        } catch {}
      }));
      setClients(allClients);

      const allIssues = [];
      await Promise.all(orgList.map(async org => {
        try {
          const snap = await getDocs(query(collection(db, 'organizations', org.id, 'newIssues'), orderBy('createdAt', 'desc'), limit(100)));
          snap.docs.forEach(d => allIssues.push({ id: d.id, orgId: org.id, orgName: names[org.id], ...d.data() }));
        } catch {}
      }));
      allIssues.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setNewIssues(allIssues);

      setRefreshedAt(new Date());
    } catch (err) {
      console.error('Analytics load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <div style={{ color: '#64748b', fontSize: '14px', padding: '20px' }}>Loading analytics...</div>;

  const filtered = orgFilter === 'ALL' ? activities : activities.filter(a => a.orgId === orgFilter);
  const filteredClients = orgFilter === 'ALL' ? clients : clients.filter(c => c.orgId === orgFilter);
  const filteredIssues = orgFilter === 'ALL' ? newIssues : newIssues.filter(i => i.orgId === orgFilter);
  const total = filtered.length;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayCount = filtered.filter(a => (a.createdAt?.toMillis?.() || 0) >= today.getTime()).length;

  // Total volume
  const totalVolume = filtered.reduce((sum, a) => {
    const size = parseFloat(a.size);
    return sum + (isNaN(size) ? 0 : size);
  }, 0);

  // Executed
  const statusCounts = {};
  STATUSES.forEach(s => statusCounts[s] = 0);
  filtered.forEach(a => { if (a.status) statusCounts[a.status] = (statusCounts[a.status] || 0) + 1; });
  const maxStatus = Math.max(...Object.values(statusCounts), 1);
  const executed = statusCounts.EXECUTED || 0;
  const execRate = total > 0 ? Math.round(executed / total * 100) : 0;

  // Avg ticket size
  const avgTicket = total > 0 ? totalVolume / total : 0;

  // Direction counts
  const dirCounts = {};
  DIRECTIONS.forEach(d => dirCounts[d] = 0);
  filtered.forEach(a => { if (a.direction) dirCounts[a.direction] = (dirCounts[a.direction] || 0) + 1; });
  const maxDir = Math.max(...Object.values(dirCounts), 1);

  // Volume by org
  const orgVolume = {};
  filtered.forEach(a => {
    const size = parseFloat(a.size);
    if (!isNaN(size)) orgVolume[a.orgId] = (orgVolume[a.orgId] || 0) + size;
  });
  const topOrgsByVolume = Object.entries(orgVolume)
    .map(([id, vol]) => ({ name: orgNames[id] || id, volume: vol }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 10);
  const maxOrgVol = Math.max(...topOrgsByVolume.map(o => o.volume), 1);

  // Top 10 clients by volume
  const clientVolume = {};
  const clientActivityCount = {};
  const clientOrgMap = {};
  filtered.forEach(a => {
    const key = a.clientName?.trim();
    if (!key) return;
    const size = parseFloat(a.size);
    if (!isNaN(size)) clientVolume[key] = (clientVolume[key] || 0) + size;
    clientActivityCount[key] = (clientActivityCount[key] || 0) + 1;
    if (!clientOrgMap[key]) clientOrgMap[key] = a.orgName;
  });
  const topClientsByVolume = Object.entries(clientVolume)
    .map(([name, vol]) => ({ name, volume: vol, count: clientActivityCount[name] || 0, orgName: clientOrgMap[name] || '' }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 10);

  // Currency breakdown
  const currVolume = {};
  filtered.forEach(a => {
    const size = parseFloat(a.size);
    const curr = a.currency || 'N/A';
    if (!isNaN(size)) currVolume[curr] = (currVolume[curr] || 0) + size;
  });
  const currEntries = Object.entries(currVolume).sort((a, b) => b[1] - a[1]);
  const maxCurrVol = Math.max(...currEntries.map(e => e[1]), 1);

  // Client type distribution
  const typeCounts = {};
  filteredClients.forEach(c => { const t = c.type || c.clientType || 'OTHER'; typeCounts[t] = (typeCounts[t] || 0) + 1; });
  const typeEntries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
  const maxTypeCount = Math.max(...typeEntries.map(e => e[1]), 1);

  // Region breakdown
  const regionCounts = {};
  filteredClients.forEach(c => { const r = c.region || 'UNSPECIFIED'; regionCounts[r] = (regionCounts[r] || 0) + 1; });
  const regionEntries = Object.entries(regionCounts).sort((a, b) => b[1] - a[1]);
  const maxRegionCount = Math.max(...regionEntries.map(e => e[1]), 1);

  // New issues for table
  const recentIssues = filteredIssues.slice(0, 15);

  const cardStyle = { background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', padding: '20px' };
  const sectionTitle = { fontSize: '14px', fontWeight: '600', color: '#f8fafc', marginBottom: '16px', fontFamily: "'Sora', sans-serif" };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#f8fafc', margin: 0, letterSpacing: '-0.3px', fontFamily: "'Sora', sans-serif" }}>Analytics</h1>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0', fontFamily: "'Outfit', sans-serif" }}>
            {activities.length} activities \u00b7 {clients.length} clients \u00b7 {newIssues.length} issues across {orgs.length} organizations \u00b7 Refreshed {timeAgo({ toDate: () => refreshedAt })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select value={orgFilter} onChange={e => setOrgFilter(e.target.value)} style={{ padding: '8px 14px', background: '#162B44', border: '1px solid #1E3557', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', fontFamily: "'Outfit', sans-serif", cursor: 'pointer' }}>
            <option value="ALL">All Organizations</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name || o.id}</option>)}
          </select>
          <button onClick={loadData} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #1E3557', borderRadius: '8px', color: '#94a3b8', fontSize: '13px', cursor: 'pointer', fontFamily: "'Outfit', sans-serif", fontWeight: '500' }}
            onMouseEnter={e => { e.target.style.borderColor = '#C8A258'; e.target.style.color = '#C8A258'; }}
            onMouseLeave={e => { e.target.style.borderColor = '#1E3557'; e.target.style.color = '#94a3b8'; }}
          >Refresh</button>
        </div>
      </div>

      {/* Row 1 - 6 Stat Cards (3x2) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Activities', value: total.toLocaleString(), sub: `${todayCount} today` },
          { label: 'Total Volume', value: formatVolume(totalVolume), sub: 'sum of all activity sizes', color: '#C8A258' },
          { label: 'Total Clients', value: filteredClients.length.toLocaleString(), sub: `across ${new Set(filteredClients.map(c => c.orgId)).size} organizations`, color: '#3b82f6' },
          { label: 'New Issues', value: filteredIssues.length.toLocaleString(), sub: `${filteredIssues.filter(i => (i.createdAt?.toMillis?.() || 0) >= today.getTime()).length} today`, color: '#8b5cf6' },
          { label: 'Executed Trades', value: executed.toLocaleString(), sub: `${execRate}% execution rate`, color: '#10b981' },
          { label: 'Avg Ticket Size', value: `${avgTicket.toFixed(1)}MM`, sub: 'total volume / total activities', color: '#f59e0b' },
        ].map(card => (
          <div key={card.label} style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', padding: '18px 20px' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', fontFamily: "'Outfit', sans-serif" }}>{card.label}</div>
            <div style={{ fontSize: '30px', fontWeight: '700', color: card.color || '#f8fafc', lineHeight: 1, fontFamily: "'Sora', sans-serif" }}>{card.value}</div>
            {card.sub && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '5px', fontFamily: "'Outfit', sans-serif" }}>{card.sub}</div>}
          </div>
        ))}
      </div>

      {/* Row 2 - 3 Column Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {/* Volume by Organization */}
        <div style={cardStyle}>
          <div style={sectionTitle}>Volume by Organization</div>
          {topOrgsByVolume.length === 0
            ? <div style={{ color: '#64748b', fontSize: '13px' }}>No volume data.</div>
            : topOrgsByVolume.map((org, i) => (
              <BarMetric key={org.name} label={org.name} value={formatVolume(org.volume)} max={100} color={['#C8A258', '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#06b6d4', '#ef4444', '#64748b', '#a78bfa'][i] || '#64748b'}
                pct={Math.round(org.volume / (totalVolume || 1) * 100)} />
            ))}
        </div>

        {/* Activity by Status */}
        <div style={cardStyle}>
          <div style={sectionTitle}>Activity by Status</div>
          {STATUSES.map(s => (
            <BarMetric key={s} label={s} value={statusCounts[s] || 0} max={maxStatus} color={STATUS_COLORS[s]} pct={total > 0 ? Math.round((statusCounts[s] || 0) / total * 100) : 0} />
          ))}
        </div>

        {/* Activity by Direction */}
        <div style={cardStyle}>
          <div style={sectionTitle}>Activity by Direction</div>
          {DIRECTIONS.map(d => (
            <BarMetric key={d} label={d} value={dirCounts[d] || 0} max={maxDir} color={DIR_COLORS[d]} pct={total > 0 ? Math.round((dirCounts[d] || 0) / total * 100) : 0} />
          ))}
        </div>
      </div>

      {/* Row 3 - 2 Column Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {/* Top 10 Clients by Volume */}
        <div style={cardStyle}>
          <div style={sectionTitle}>Top 10 Clients by Volume</div>
          {topClientsByVolume.length === 0
            ? <div style={{ color: '#64748b', fontSize: '13px' }}>No client volume data.</div>
            : topClientsByVolume.map((client, idx) => (
              <div key={client.name} style={{ padding: '8px 0', borderBottom: idx < topClientsByVolume.length - 1 ? '1px solid #0B1520' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', fontWeight: '700', color: '#0F2137', background: ['#C8A258', '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981'][idx] || '#64748b', width: '18px', height: '18px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{idx + 1}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '13px', color: '#f8fafc', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{client.count} activities \u00b7 {client.orgName}</div>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#C8A258', whiteSpace: 'nowrap', flexShrink: 0 }}>{formatVolume(client.volume)}</div>
              </div>
            ))}
        </div>

        {/* Currency Breakdown */}
        <div style={cardStyle}>
          <div style={sectionTitle}>Currency Breakdown</div>
          {currEntries.length === 0
            ? <div style={{ color: '#64748b', fontSize: '13px' }}>No currency data.</div>
            : currEntries.map(([curr, vol]) => (
              <BarMetric key={curr} label={curr} value={formatVolume(vol)} max={100} color={CURR_COLORS[curr] || '#64748b'}
                pct={Math.round(vol / (totalVolume || 1) * 100)} />
            ))}
        </div>
      </div>

      {/* Row 4 - 2 Column Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {/* Client Type Distribution */}
        <div style={cardStyle}>
          <div style={sectionTitle}>Client Type Distribution</div>
          {typeEntries.length === 0
            ? <div style={{ color: '#64748b', fontSize: '13px' }}>No client type data.</div>
            : typeEntries.map(([type, count]) => (
              <BarMetric key={type} label={type} value={count} max={maxTypeCount} color={TYPE_COLORS[type] || '#64748b'}
                pct={filteredClients.length > 0 ? Math.round(count / filteredClients.length * 100) : 0} />
            ))}
        </div>

        {/* Region Breakdown */}
        <div style={cardStyle}>
          <div style={sectionTitle}>Region Breakdown</div>
          {regionEntries.length === 0
            ? <div style={{ color: '#64748b', fontSize: '13px' }}>No region data.</div>
            : regionEntries.map(([region, count]) => (
              <BarMetric key={region} label={region} value={count} max={maxRegionCount} color={REGION_COLORS[region] || '#64748b'}
                pct={filteredClients.length > 0 ? Math.round(count / filteredClients.length * 100) : 0} />
            ))}
        </div>
      </div>

      {/* Row 5 - New Issues Pipeline (Full Width) */}
      <div style={{ ...cardStyle, overflow: 'hidden', padding: 0 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1E3557' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', fontFamily: "'Sora', sans-serif" }}>New Issues Pipeline</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', fontFamily: "'Outfit', sans-serif" }}>Recent {recentIssues.length} new issues</div>
        </div>
        {recentIssues.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>No new issues data.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Outfit', sans-serif" }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1E3557' }}>
                  {['Date', 'Issuer', 'Size', 'Currency', 'Bookrunners', 'Organization'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentIssues.map((issue, idx) => (
                  <tr key={`${issue.orgId}-${issue.id}`} style={{ borderBottom: idx < recentIssues.length - 1 ? '1px solid #0B1520' : 'none' }}>
                    <td style={{ padding: '10px 16px', fontSize: '12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{timeAgo(issue.createdAt)}</td>
                    <td style={{ padding: '10px 16px', fontSize: '12px', color: '#f8fafc', fontWeight: '600', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.issuerName || issue.issuer || '\u2014'}</td>
                    <td style={{ padding: '10px 16px', fontSize: '12px', color: '#C8A258', fontWeight: '600', whiteSpace: 'nowrap' }}>{issue.targetIssueSize || issue.size || '\u2014'}</td>
                    <td style={{ padding: '10px 16px', fontSize: '12px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{issue.currency || '\u2014'}</td>
                    <td style={{ padding: '10px 16px', fontSize: '12px', color: '#94a3b8', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{issue.bookrunners || issue.leadManagers || '\u2014'}</td>
                    <td style={{ padding: '10px 16px', fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>{issue.orgName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
