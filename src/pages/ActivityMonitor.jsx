import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';

const STATUS_COLORS = { EXECUTED: '#10b981', ENQUIRY: '#3b82f6', QUOTED: '#f59e0b', PASSED: '#64748b', 'TRADED AWAY': '#ef4444' };
const DIR_COLORS = { BUY: '#10b981', SELL: '#ef4444', 'TWO-WAY': '#8b5cf6' };
const STATUSES = ['ENQUIRY', 'QUOTED', 'EXECUTED', 'PASSED', 'TRADED AWAY'];
const DIRECTIONS = ['BUY', 'SELL', 'TWO-WAY'];

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

function QualityBar({ label, rate }) {
  const color = rate >= 75 ? '#10b981' : rate >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
        <span style={{ fontSize: '13px', color: '#94a3b8' }}>{label}</span>
        <span style={{ fontSize: '13px', fontWeight: '700', color }}>{rate}%</span>
      </div>
      <div style={{ height: '7px', background: '#0B1520', borderRadius: '100px', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: '100px', background: color, width: `${rate}%`, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  );
}

function timeAgo(ts) {
  if (!ts) return '—';
  const d = ts.toDate?.() || new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ActivityMonitor() {
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

      // Load activities — only aggregate fields needed (status, direction, size, currency, activityType, createdAt)
      const all = [];
      await Promise.all(orgList.map(async org => {
        try {
          const snap = await getDocs(query(collection(db, 'organizations', org.id, 'activities'), orderBy('createdAt', 'desc'), limit(200)));
          snap.docs.forEach(d => {
            const data = d.data();
            all.push({
              orgId: org.id,
              orgName: names[org.id],
              status: data.status,
              direction: data.direction,
              size: data.size,
              currency: data.currency,
              activityType: data.activityType,
              price: data.price,
              notes: data.notes,
              isin: data.isin,
              createdAt: data.createdAt,
              hasPrice: data.price != null && data.price !== '',
              hasNotes: data.notes?.trim?.()?.length > 0,
              hasIsin: data.isin?.trim?.()?.length > 0,
              hasSize: String(data.size || '').trim().length > 0,
              hasClient: data.clientName?.trim?.()?.length > 0,
            });
          });
        } catch {}
      }));
      all.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setActivities(all);

      // Load clients — only aggregate fields (type, region)
      const allClients = [];
      await Promise.all(orgList.map(async org => {
        try {
          const snap = await getDocs(query(collection(db, 'organizations', org.id, 'clients'), orderBy('name', 'asc')));
          snap.docs.forEach(d => {
            const data = d.data();
            allClients.push({
              orgId: org.id,
              orgName: names[org.id],
              type: data.type || data.clientType || 'OTHER',
              region: data.region || 'UNSPECIFIED',
            });
          });
        } catch {}
      }));
      setClients(allClients);

      // Load new issues — only aggregate fields (currency, createdAt)
      const allIssues = [];
      await Promise.all(orgList.map(async org => {
        try {
          const snap = await getDocs(query(collection(db, 'organizations', org.id, 'newIssues'), orderBy('createdAt', 'desc'), limit(100)));
          snap.docs.forEach(d => {
            const data = d.data();
            allIssues.push({
              orgId: org.id,
              orgName: names[org.id],
              currency: data.currency || 'N/A',
              createdAt: data.createdAt,
            });
          });
        } catch {}
      }));
      allIssues.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setNewIssues(allIssues);

      setRefreshedAt(new Date());
    } catch (err) {
      console.error('ActivityMonitor load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <div style={{ color: '#64748b', fontSize: '14px', padding: '20px' }}>Loading activity data...</div>;

  const filtered = orgFilter === 'ALL' ? activities : activities.filter(a => a.orgId === orgFilter);
  const filteredClients = orgFilter === 'ALL' ? clients : clients.filter(c => c.orgId === orgFilter);
  const filteredIssues = orgFilter === 'ALL' ? newIssues : newIssues.filter(i => i.orgId === orgFilter);
  const total = filtered.length;

  const statusCounts = {};
  STATUSES.forEach(s => statusCounts[s] = 0);
  filtered.forEach(a => { if (a.status) statusCounts[a.status] = (statusCounts[a.status] || 0) + 1; });
  const maxStatus = Math.max(...Object.values(statusCounts), 1);

  const dirCounts = {};
  DIRECTIONS.forEach(d => dirCounts[d] = 0);
  filtered.forEach(a => { if (a.direction) dirCounts[a.direction] = (dirCounts[a.direction] || 0) + 1; });
  const maxDir = Math.max(...Object.values(dirCounts), 1);

  const orgActivity = {};
  activities.forEach(a => { orgActivity[a.orgId] = (orgActivity[a.orgId] || 0) + 1; });
  const topOrgs = Object.entries(orgActivity).map(([id, count]) => ({ id, name: orgNames[id] || id, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  const maxOrgCount = Math.max(...topOrgs.map(o => o.count), 1);

  const pct = (fn) => total > 0 ? Math.round(filtered.filter(fn).length / total * 100) : 0;
  const priceRate = pct(a => a.hasPrice);
  const notesRate = pct(a => a.hasNotes);
  const isinRate = pct(a => a.hasIsin);
  const sizeRate = pct(a => a.hasSize);
  const clientRate = pct(a => a.hasClient);

  const executed = statusCounts.EXECUTED || 0;
  const execRate = total > 0 ? Math.round(executed / total * 100) : 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayCount = filtered.filter(a => (a.createdAt?.toMillis?.() || 0) >= today.getTime()).length;

  const typeCounts = {};
  filtered.forEach(a => { if (a.activityType) typeCounts[a.activityType] = (typeCounts[a.activityType] || 0) + 1; });
  const topTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const maxType = Math.max(...topTypes.map(t => t[1]), 1);

  // Org breakdown for stat cards
  const orgBreakdownRows = () => {
    const map = {};
    filtered.forEach(a => { map[a.orgName] = (map[a.orgName] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  };

  const statCards = [
    { label: 'Total Activities', value: total, sub: `${todayCount} today` },
    { label: 'Executed', value: executed, sub: `${execRate}% of total`, color: '#10b981' },
    {
      label: 'Price Fill Rate', value: `${priceRate}%`, sub: 'activities with price',
      color: priceRate >= 75 ? '#10b981' : priceRate >= 50 ? '#f59e0b' : '#ef4444',
    },
    {
      label: 'Notes Fill Rate', value: `${notesRate}%`, sub: 'activities with notes',
      color: notesRate >= 75 ? '#10b981' : notesRate >= 50 ? '#f59e0b' : '#ef4444',
    },
    {
      label: 'Total Clients', value: filteredClients.length,
      sub: `${new Set(filteredClients.map(c => c.type).filter(Boolean)).size} types across ${new Set(filteredClients.map(c => c.orgId)).size} orgs`, color: '#3b82f6',
    },
    {
      label: 'New Issues', value: filteredIssues.length,
      sub: `${filteredIssues.filter(i => (i.createdAt?.toMillis?.() || 0) >= today.getTime()).length} today`, color: '#8b5cf6',
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#f8fafc', margin: 0, letterSpacing: '-0.3px', fontFamily: "'Manrope', sans-serif" }}>Activity Monitor</h1>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0' }}>
            {activities.length} activities · {clients.length} clients · {newIssues.length} issues · Refreshed {timeAgo({ toDate: () => refreshedAt })}
          </p>
          <p style={{ color: '#475569', fontSize: '11px', margin: '4px 0 0', fontStyle: 'italic' }}>
            Aggregate view only — individual client names, bonds, and prices are not displayed
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select value={orgFilter} onChange={e => setOrgFilter(e.target.value)} style={{ padding: '8px 14px', background: '#162B44', border: '1px solid #1E3557', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', fontFamily: "'Manrope', sans-serif", cursor: 'pointer' }}>
            <option value="ALL">All Organizations</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name || o.id}</option>)}
          </select>
          <button onClick={loadData} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #1E3557', borderRadius: '8px', color: '#94a3b8', fontSize: '13px', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", fontWeight: '500' }}
            onMouseEnter={e => { e.target.style.borderColor = '#C8A258'; e.target.style.color = '#C8A258'; }}
            onMouseLeave={e => { e.target.style.borderColor = '#1E3557'; e.target.style.color = '#94a3b8'; }}
          >Refresh</button>
        </div>
      </div>

      {/* Stat cards — aggregate only */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {statCards.map(card => (
          <div key={card.label} style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', padding: '18px 20px' }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>{card.label}</div>
            <div style={{ fontSize: '30px', fontWeight: '700', color: card.color || '#f8fafc', lineHeight: 1 }}>{card.value}</div>
            {card.sub && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '5px' }}>{card.sub}</div>}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {/* Activity by Status */}
        <div style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', padding: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', marginBottom: '16px' }}>Activity by Status</div>
          {STATUSES.map(s => (
            <BarMetric key={s} label={s} value={statusCounts[s] || 0} max={maxStatus} color={STATUS_COLORS[s]} pct={total > 0 ? Math.round((statusCounts[s] || 0) / total * 100) : 0} />
          ))}
        </div>
        {/* Activity by Direction + Types */}
        <div style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', padding: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', marginBottom: '16px' }}>Activity by Direction</div>
          {DIRECTIONS.map(d => (
            <BarMetric key={d} label={d} value={dirCounts[d] || 0} max={maxDir} color={DIR_COLORS[d]} pct={total > 0 ? Math.round((dirCounts[d] || 0) / total * 100) : 0} />
          ))}
          <div style={{ borderTop: '1px solid #1E3557', marginTop: '16px', paddingTop: '16px' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Activity Types</div>
            {topTypes.map(([type, count]) => (
              <BarMetric key={type} label={type} value={count} max={maxType} color="#8b5cf6" pct={total > 0 ? Math.round(count / total * 100) : 0} />
            ))}
          </div>
        </div>
        {/* Most Active Organizations */}
        <div style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', padding: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', marginBottom: '16px' }}>Most Active Organizations</div>
          {topOrgs.length === 0 ? <div style={{ color: '#64748b', fontSize: '13px' }}>No activity data.</div> : topOrgs.map((org, i) => (
            <div key={org.name} style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: '#0F2137', background: ['#C8A258', '#3b82f6', '#8b5cf6', '#f59e0b'][i] || '#64748b', width: '16px', height: '16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ fontSize: '13px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>{org.name}</span>
                </div>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc' }}>{org.count}</span>
              </div>
              <div style={{ height: '5px', background: '#0B1520', borderRadius: '100px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: ['#C8A258', '#3b82f6', '#8b5cf6', '#f59e0b'][i] || '#64748b', borderRadius: '100px', width: `${Math.round(org.count / maxOrgCount * 100)}%`, transition: 'width 0.5s ease' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {/* Client Distribution */}
        <div style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', padding: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', marginBottom: '4px' }}>Client Distribution</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>{filteredClients.length} clients across all organizations</div>
          {(() => {
            const tCounts = {};
            filteredClients.forEach(c => { tCounts[c.type] = (tCounts[c.type] || 0) + 1; });
            const entries = Object.entries(tCounts).sort((a, b) => b[1] - a[1]);
            const maxVal = Math.max(...entries.map(e => e[1]), 1);
            const TYPE_COLORS = { FUND: '#3b82f6', BANK: '#C8A258', INSURANCE: '#10b981', PENSION: '#f59e0b', SOVEREIGN: '#8b5cf6', 'HEDGE FUND': '#ec4899', CORPORATE: '#06b6d4', OTHER: '#64748b' };
            return entries.length === 0
              ? <div style={{ color: '#64748b', fontSize: '13px' }}>No client data.</div>
              : entries.map(([type, count]) => (
                <BarMetric key={type} label={type} value={count} max={maxVal} color={TYPE_COLORS[type] || '#64748b'} pct={filteredClients.length > 0 ? Math.round(count / filteredClients.length * 100) : 0} />
              ));
          })()}
          <div style={{ borderTop: '1px solid #1E3557', marginTop: '16px', paddingTop: '16px' }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>By Region</div>
            {(() => {
              const regionCounts = {};
              filteredClients.forEach(c => { regionCounts[c.region] = (regionCounts[c.region] || 0) + 1; });
              const entries = Object.entries(regionCounts).sort((a, b) => b[1] - a[1]);
              const maxVal = Math.max(...entries.map(e => e[1]), 1);
              const REGION_COLORS = { APAC: '#3b82f6', EMEA: '#C8A258', AMERICAS: '#10b981', UNSPECIFIED: '#64748b' };
              return entries.length === 0
                ? <div style={{ color: '#64748b', fontSize: '13px' }}>No region data.</div>
                : entries.map(([region, count]) => (
                  <BarMetric key={region} label={region} value={count} max={maxVal} color={REGION_COLORS[region] || '#64748b'} />
                ));
            })()}
          </div>
        </div>
        {/* New Issues by Currency */}
        <div style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', marginBottom: '4px' }}>New Issues Pipeline</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>{filteredIssues.length} issues tracked</div>
          {(() => {
            const currCounts = {};
            filteredIssues.forEach(i => { currCounts[i.currency] = (currCounts[i.currency] || 0) + 1; });
            const entries = Object.entries(currCounts).sort((a, b) => b[1] - a[1]);
            const maxVal = Math.max(...entries.map(e => e[1]), 1);
            const CURR_COLORS = { USD: '#10b981', EUR: '#3b82f6', GBP: '#C8A258', JPY: '#f59e0b', CNY: '#ef4444', AUD: '#8b5cf6', SGD: '#06b6d4', HKD: '#ec4899', 'N/A': '#64748b' };
            return entries.length === 0
              ? <div style={{ color: '#64748b', fontSize: '13px' }}>No issue data.</div>
              : entries.map(([curr, count]) => (
                <BarMetric key={curr} label={curr} value={count} max={maxVal} color={CURR_COLORS[curr] || '#64748b'} pct={filteredIssues.length > 0 ? Math.round(count / filteredIssues.length * 100) : 0} />
              ));
          })()}
          <div style={{ borderTop: '1px solid #1E3557', marginTop: '16px', paddingTop: '16px', flex: 1 }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Issues by Organization</div>
            {(() => {
              const orgCounts = {};
              filteredIssues.forEach(i => { orgCounts[i.orgName] = (orgCounts[i.orgName] || 0) + 1; });
              const entries = Object.entries(orgCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
              const maxVal = Math.max(...entries.map(e => e[1]), 1);
              return entries.length === 0
                ? <div style={{ color: '#64748b', fontSize: '13px' }}>No issue data.</div>
                : entries.map(([name, count]) => (
                  <BarMetric key={name} label={name} value={count} max={maxVal} color="#8b5cf6" />
                ));
            })()}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px' }}>
        {/* Input Quality */}
        <div style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', padding: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', marginBottom: '4px' }}>Input Quality</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>Field completion rates</div>
          {[
            { label: 'Client Name', rate: clientRate },
            { label: 'Price', rate: priceRate },
            { label: 'Size', rate: sizeRate },
            { label: 'ISIN', rate: isinRate },
            { label: 'Notes / Commentary', rate: notesRate },
          ].map(q => (
            <QualityBar key={q.label} label={q.label} rate={q.rate} />
          ))}
          <div style={{ marginTop: '16px', padding: '12px', background: '#0B1520', borderRadius: '8px' }}>
            <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Overall Completeness</div>
            <div style={{ fontSize: '26px', fontWeight: '700', color: '#f8fafc' }}>{Math.round((clientRate + priceRate + sizeRate + isinRate + notesRate) / 5)}%</div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>avg across all fields</div>
          </div>
        </div>
        {/* Activity Summary by Org */}
        <div style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #1E3557' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc' }}>Organization Activity Summary</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Aggregated metrics per organization</div>
          </div>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {['Organization', 'Activities', 'Clients', 'Issues', 'Exec Rate', 'Price Fill', 'Last Active'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#64748b', fontWeight: '600', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #1E3557', background: '#0F2137' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orgBreakdownRows().map(([name, count]) => {
                  const orgId = Object.entries(orgNames).find(([, n]) => n === name)?.[0];
                  const orgActs = activities.filter(a => a.orgName === name);
                  const orgClients = clients.filter(c => c.orgName === name);
                  const orgIssues = newIssues.filter(i => i.orgName === name);
                  const orgExec = orgActs.filter(a => a.status === 'EXECUTED').length;
                  const orgExecRate = orgActs.length > 0 ? Math.round(orgExec / orgActs.length * 100) : 0;
                  const orgPriceRate = orgActs.length > 0 ? Math.round(orgActs.filter(a => a.hasPrice).length / orgActs.length * 100) : 0;
                  const lastActive = orgActs[0]?.createdAt;
                  return (
                    <tr key={name} style={{ borderBottom: '1px solid #0B1520' }}>
                      <td style={{ padding: '10px 14px', color: '#f8fafc', fontWeight: '600' }}>{name}</td>
                      <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{count}</td>
                      <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{orgClients.length}</td>
                      <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{orgIssues.length}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ color: orgExecRate >= 30 ? '#10b981' : orgExecRate >= 15 ? '#f59e0b' : '#ef4444', fontWeight: '600' }}>{orgExecRate}%</span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ color: orgPriceRate >= 75 ? '#10b981' : orgPriceRate >= 50 ? '#f59e0b' : '#ef4444', fontWeight: '600' }}>{orgPriceRate}%</span>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#475569' }}>{timeAgo(lastActive)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
