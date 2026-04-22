import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import HoverBreakdown from '../components/HoverBreakdown';

function BarMetric({ label, value, max, color, pct }) {
  const w = max > 0 ? Math.min(Math.round(value / max * 100), 100) : 0;
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
        <span style={{ fontSize: '13px', color: '#94a3b8', fontFamily: "'Manrope', sans-serif" }}>{label}</span>
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
  if (diff < 2592000000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDate(ts) {
  if (!ts) return '';
  const d = ts.toDate?.() || new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusBadge({ status }) {
  const colors = {
    ACTIVE: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981' },
    INACTIVE: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b' },
    NEW: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6' },
    CONTACTED: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b' },
    'DEMO SCHEDULED': { bg: 'rgba(139, 92, 246, 0.15)', text: '#8b5cf6' },
    ONBOARDING: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981' },
    REJECTED: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' },
  };
  const c = colors[status] || { bg: 'rgba(100, 116, 139, 0.15)', text: '#64748b' };
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: '100px',
      fontSize: '11px', fontWeight: '600', background: c.bg, color: c.text,
      letterSpacing: '0.03em', fontFamily: "'Manrope', sans-serif",
    }}>
      {status}
    </span>
  );
}

export default function Analytics() {
  const [orgs, setOrgs] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [demoRequests, setDemoRequests] = useState([]);
  const [orgActivities, setOrgActivities] = useState({});
  const [orgUserCounts, setOrgUserCounts] = useState({});
  const [orgUsersList, setOrgUsersList] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState(new Date());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const orgsSnap = await getDocs(collection(db, 'organizations'));
      const orgList = orgsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setOrgs(orgList);

      const usersSnap = await getDocs(collection(db, 'users'));
      setAllUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const demoSnap = await getDocs(collection(db, 'demoRequests'));
      setDemoRequests(demoSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const activitiesMap = {};
      const userCountsMap = {};
      const usersListMap = {};

      await Promise.all(orgList.map(async org => {
        try {
          const actSnap = await getDocs(query(
            collection(db, 'organizations', org.id, 'activities'),
            orderBy('createdAt', 'desc'),
            limit(1000)
          ));
          activitiesMap[org.id] = actSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch {
          activitiesMap[org.id] = [];
        }

        try {
          const usrSnap = await getDocs(collection(db, 'organizations', org.id, 'users'));
          userCountsMap[org.id] = usrSnap.size;
          usersListMap[org.id] = usrSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch {
          userCountsMap[org.id] = 0;
          usersListMap[org.id] = [];
        }
      }));

      setOrgActivities(activitiesMap);
      setOrgUserCounts(userCountsMap);
      setOrgUsersList(usersListMap);
      setRefreshedAt(new Date());
    } catch (err) {
      console.error('Analytics load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', color: '#64748b', fontSize: '14px', fontFamily: "'Manrope', sans-serif" }}>
        Loading analytics...
      </div>
    );
  }

  const now = Date.now();
  const thirtyDaysMs = 30 * 86400000;

  const orgData = orgs.map(org => {
    const activities = orgActivities[org.id] || [];
    const userCount = orgUserCounts[org.id] || 0;
    const totalActivities = activities.length;
    const recentActivities = activities.filter(a => {
      const ts = a.createdAt?.toMillis?.() || (a.createdAt?.toDate?.() ? a.createdAt.toDate().getTime() : 0);
      return (now - ts) < thirtyDaysMs;
    });
    const hasRecentActivity = recentActivities.length > 0;
    const hasAnyActivity = totalActivities > 0;
    let lastActivityTs = null;
    if (activities.length > 0 && activities[0].createdAt) lastActivityTs = activities[0].createdAt;
    let status = 'NEW';
    if (hasRecentActivity) status = 'ACTIVE';
    else if (hasAnyActivity) status = 'INACTIVE';
    return {
      ...org, userCount, totalActivities, hasRecentActivity, lastActivityTs, status,
      monthlyRevenue: org.monthlyRevenue || 0,
      activitiesPerUser: userCount > 0 ? totalActivities / userCount : 0,
    };
  }).sort((a, b) => b.totalActivities - a.totalActivities);

  const totalOrgs = orgs.length;
  const totalUsers = allUsers.length;
  const activeOrgs = orgData.filter(o => o.status === 'ACTIVE').length;
  const pipelineCount = demoRequests.filter(d => d.status !== 'ACTIVE' && d.status !== 'REJECTED').length;
  const activeDemo = demoRequests.filter(d => d.status === 'ACTIVE').length;
  const conversionRate = demoRequests.length > 0 ? Math.round(activeDemo / demoRequests.length * 100) : 0;
  const totalMRR = orgData.reduce((sum, o) => sum + o.monthlyRevenue, 0);

  const demoStatusLabels = ['NEW', 'CONTACTED', 'DEMO SCHEDULED', 'ONBOARDING', 'ACTIVE', 'REJECTED'];
  const demoStatusColors = {
    NEW: '#3b82f6', CONTACTED: '#f59e0b', 'DEMO SCHEDULED': '#8b5cf6',
    ONBOARDING: '#10b981', ACTIVE: '#059669', REJECTED: '#ef4444',
  };
  const demoStatusCounts = {};
  demoStatusLabels.forEach(s => demoStatusCounts[s] = 0);
  demoRequests.forEach(d => { const s = d.status || 'NEW'; demoStatusCounts[s] = (demoStatusCounts[s] || 0) + 1; });
  const maxDemoStatus = Math.max(...Object.values(demoStatusCounts), 1);

  const recentProspects = [...demoRequests]
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
    .slice(0, 8);

  const userDistribution = [...orgData].filter(o => o.userCount > 0).sort((a, b) => b.userCount - a.userCount).slice(0, 10);
  const maxUserCount = Math.max(...userDistribution.map(o => o.userCount), 1);
  const avgUsersPerOrg = totalOrgs > 0 ? (totalUsers / totalOrgs).toFixed(1) : '0';

  const engagementData = [...orgData].filter(o => o.userCount > 0 && o.totalActivities > 0).sort((a, b) => b.activitiesPerUser - a.activitiesPerUser).slice(0, 10);
  const maxEngagement = Math.max(...engagementData.map(o => o.activitiesPerUser), 1);

  const revenueData = [...orgData].filter(o => o.monthlyRevenue > 0).sort((a, b) => b.monthlyRevenue - a.monthlyRevenue).slice(0, 10);
  const maxRevenue = Math.max(...revenueData.map(o => o.monthlyRevenue), 1);

  const formatCurrency = (val) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
    return `$${val.toLocaleString()}`;
  };

  // --- Breakdown helpers ---
  const demoHeaders = ['Name', 'Email', 'Company', 'Status', 'Submitted'];
  const demoRow = (d) => [`${d.firstName || ''} ${d.lastName || ''}`.trim(), d.email || '', d.company || '', d.status || 'NEW', fmtDate(d.submittedAt || d.createdAt)];

  const orgHeaders = ['Organization', 'Status', 'Users', 'Activities', 'Revenue'];
  const orgRow = (o) => [o.name || o.id, o.status, o.userCount, o.totalActivities, o.monthlyRevenue > 0 ? `$${o.monthlyRevenue.toLocaleString()}` : '—'];

  const userHeaders = ['Name', 'Email', 'Organization', 'Role'];

  // Stat card breakdowns
  const statCards = [
    {
      label: 'Total Organizations', value: totalOrgs.toLocaleString(), sub: `${activeOrgs} active in last 30 days`,
      bTitle: 'All Organizations', bHeaders: orgHeaders, bRows: orgData.map(orgRow), bFile: 'organizations.csv',
    },
    {
      label: 'Total Users', value: totalUsers.toLocaleString(), sub: `across ${totalOrgs} organizations`, color: '#3b82f6',
      bTitle: 'All Users', bHeaders: userHeaders,
      bRows: allUsers.map(u => [u.name || '', u.email || '', u.organizationName || u.organizationId || '', u.isAdmin ? 'Admin' : 'User']),
      bFile: 'users.csv',
    },
    {
      label: 'Active Orgs', value: activeOrgs.toLocaleString(), sub: 'with activity in last 30 days', color: '#10b981',
      bTitle: 'Active Organizations', bHeaders: orgHeaders, bRows: orgData.filter(o => o.status === 'ACTIVE').map(orgRow), bFile: 'active_orgs.csv',
    },
    {
      label: 'Prospect Pipeline', value: pipelineCount.toLocaleString(), sub: `${demoRequests.length} total demo requests`, color: '#8b5cf6',
      bTitle: 'Pipeline Prospects', bHeaders: demoHeaders,
      bRows: demoRequests.filter(d => d.status !== 'ACTIVE' && d.status !== 'REJECTED').map(demoRow),
      bFile: 'pipeline.csv',
    },
    {
      label: 'Conversion Rate', value: `${conversionRate}%`, sub: `${activeDemo} converted of ${demoRequests.length}`, color: '#C8A258',
      bTitle: 'Converted Prospects', bHeaders: demoHeaders,
      bRows: demoRequests.filter(d => d.status === 'ACTIVE').map(demoRow),
      bFile: 'conversions.csv',
    },
    {
      label: 'Monthly Revenue', value: formatCurrency(totalMRR), sub: `from ${revenueData.length} paying organizations`, color: '#f59e0b',
      bTitle: 'Revenue by Org', bHeaders: ['Organization', 'Monthly Revenue', 'Users', 'Activities'],
      bRows: orgData.filter(o => o.monthlyRevenue > 0).map(o => [o.name || o.id, `$${o.monthlyRevenue.toLocaleString()}`, o.userCount, o.totalActivities]),
      bFile: 'revenue.csv',
    },
  ];

  const cardStyle = { background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', padding: '20px' };
  const sectionTitle = { fontSize: '14px', fontWeight: '600', color: '#f8fafc', marginBottom: '4px', fontFamily: "'Manrope', sans-serif" };
  const sectionSub = { fontSize: '12px', color: '#64748b', marginBottom: '16px', fontFamily: "'Manrope', sans-serif" };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#f8fafc', margin: 0, letterSpacing: '-0.3px', fontFamily: "'Manrope', sans-serif" }}>Analytics</h1>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0', fontFamily: "'Manrope', sans-serif" }}>
            Axle platform metrics and client insights
          </p>
        </div>
        <button
          onClick={loadData}
          style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #1E3557', borderRadius: '8px', color: '#94a3b8', fontSize: '13px', cursor: 'pointer', fontFamily: "'Manrope', sans-serif", fontWeight: '500' }}
          onMouseEnter={e => { e.target.style.borderColor = '#C8A258'; e.target.style.color = '#C8A258'; }}
          onMouseLeave={e => { e.target.style.borderColor = '#1E3557'; e.target.style.color = '#94a3b8'; }}
        >
          Refresh
        </button>
      </div>

      {/* Row 1 — 6 Stat Cards with hover breakdowns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {statCards.map(card => (
          <HoverBreakdown key={card.label} title={card.bTitle} headers={card.bHeaders} rows={card.bRows} csvFilename={card.bFile}>
            <div style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', padding: '18px 20px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', fontFamily: "'Manrope', sans-serif" }}>{card.label}</div>
              <div style={{ fontSize: '30px', fontWeight: '700', color: card.color || '#f8fafc', lineHeight: 1, fontFamily: "'Manrope', sans-serif" }}>{card.value}</div>
              {card.sub && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '5px', fontFamily: "'Manrope', sans-serif" }}>{card.sub}</div>}
            </div>
          </HoverBreakdown>
        ))}
      </div>

      {/* Row 2 — Axle Client Table */}
      <div style={{ ...cardStyle, overflow: 'hidden', padding: 0, marginBottom: '24px' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1E3557' }}>
          <div style={sectionTitle}>Axle Clients</div>
          <div style={{ fontSize: '12px', color: '#64748b', fontFamily: "'Manrope', sans-serif" }}>{orgData.length} organizations</div>
        </div>
        {orgData.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>No organizations found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Manrope', sans-serif" }}>
              <thead>
                <tr style={{ background: '#0F2137' }}>
                  {['Organization Name', 'Status', 'Users', 'Activities', 'Last Activity', 'Monthly Revenue'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orgData.map((org, idx) => (
                  <tr key={org.id} style={{ borderBottom: idx < orgData.length - 1 ? '1px solid #0B1520' : 'none', borderLeft: org.status === 'ACTIVE' ? '3px solid #C8A258' : '3px solid transparent', cursor: 'default' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#1a3352'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#f8fafc', fontWeight: '600' }}>{org.name || org.id}</td>
                    <td style={{ padding: '12px 16px' }}><StatusBadge status={org.status} /></td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#94a3b8' }}>{org.userCount}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#94a3b8', fontWeight: '600' }}>{org.totalActivities.toLocaleString()}</td>
                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#64748b' }}>{timeAgo(org.lastActivityTs)}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', color: org.monthlyRevenue > 0 ? '#C8A258' : '#64748b', fontWeight: org.monthlyRevenue > 0 ? '600' : '400' }}>
                      {org.monthlyRevenue > 0 ? `$${org.monthlyRevenue.toLocaleString()}` : '\u2014'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Row 3 — Prospect Pipeline + User Distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
        {/* Prospect Pipeline */}
        <div style={cardStyle}>
          <div style={sectionTitle}>Prospect Pipeline</div>
          <div style={sectionSub}>{demoRequests.length} total demo requests</div>
          {demoStatusLabels.map(s => {
            const items = demoRequests.filter(d => (d.status || 'NEW') === s);
            return (
              <HoverBreakdown key={s} title={`${s} Prospects`} headers={demoHeaders} rows={items.map(demoRow)} csvFilename={`prospects_${s.toLowerCase().replace(/\s/g, '_')}.csv`}>
                <BarMetric label={s} value={demoStatusCounts[s] || 0} max={maxDemoStatus} color={demoStatusColors[s]} pct={demoRequests.length > 0 ? Math.round((demoStatusCounts[s] || 0) / demoRequests.length * 100) : 0} />
              </HoverBreakdown>
            );
          })}
          <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #1E3557' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8', marginBottom: '12px', fontFamily: "'Manrope', sans-serif" }}>Recent Prospects</div>
            {recentProspects.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: '13px' }}>No prospects yet.</div>
            ) : recentProspects.map((p, idx) => (
              <div key={p.id} style={{ padding: '8px 0', borderBottom: idx < recentProspects.length - 1 ? '1px solid #0B1520' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '13px', color: '#f8fafc', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'Manrope', sans-serif" }}>
                    {p.companyName || p.company || '\u2014'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', fontFamily: "'Manrope', sans-serif" }}>
                    {p.contactName || p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim() || '\u2014'} {'\u00b7'} {timeAgo(p.createdAt || p.submittedAt)}
                  </div>
                </div>
                <StatusBadge status={p.status || 'NEW'} />
              </div>
            ))}
          </div>
        </div>

        {/* User Distribution */}
        <div style={cardStyle}>
          <div style={sectionTitle}>User Distribution by Organization</div>
          <div style={sectionSub}>Top {userDistribution.length} organizations by user count</div>
          {userDistribution.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '13px' }}>No user data.</div>
          ) : userDistribution.map(o => {
            const users = orgUsersList[o.id] || [];
            return (
              <HoverBreakdown key={o.id} title={`${o.name || o.id} Users`} headers={['Name', 'Email', 'Role']}
                rows={users.map(u => [u.name || u.displayName || '', u.email || '', u.isAdmin ? 'Admin' : 'User'])}
                csvFilename={`users_${(o.name || o.id).toLowerCase().replace(/\s/g, '_')}.csv`}>
                <BarMetric label={o.name || o.id} value={o.userCount} max={maxUserCount} color="#C8A258" />
              </HoverBreakdown>
            );
          })}
          <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #1E3557', fontSize: '13px', color: '#94a3b8', fontFamily: "'Manrope', sans-serif" }}>
            Average <span style={{ fontWeight: '700', color: '#f8fafc' }}>{avgUsersPerOrg}</span> users per organization
          </div>
        </div>
      </div>

      {/* Row 4 — Engagement Metrics + Revenue Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
        {/* Engagement Metrics */}
        <div style={cardStyle}>
          <div style={sectionTitle}>Organization Engagement</div>
          <div style={sectionSub}>Activities per user ratio (top 10)</div>
          {engagementData.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '13px' }}>No engagement data.</div>
          ) : engagementData.map(o => {
            const ratio = o.activitiesPerUser;
            const color = ratio >= 10 ? '#10b981' : ratio >= 5 ? '#f59e0b' : '#ef4444';
            const acts = orgActivities[o.id] || [];
            return (
              <HoverBreakdown key={o.id} title={`${o.name || o.id} Activities`}
                headers={['Client', 'Ticker/ISIN', 'Direction', 'Status', 'Date']}
                rows={acts.slice(0, 100).map(a => [a.clientName || '', a.ticker || a.isin || '', a.direction || '', a.status || '', fmtDate(a.createdAt)])}
                csvFilename={`engagement_${(o.name || o.id).toLowerCase().replace(/\s/g, '_')}.csv`}>
                <BarMetric label={o.name || o.id} value={parseFloat(ratio.toFixed(1))} max={parseFloat(maxEngagement.toFixed(1))} color={color} />
              </HoverBreakdown>
            );
          })}
        </div>

        {/* Revenue Breakdown */}
        <div style={cardStyle}>
          <div style={sectionTitle}>Revenue by Organization</div>
          <div style={sectionSub}>Top {revenueData.length} by monthly revenue</div>
          {revenueData.length === 0 ? (
            <div style={{ color: '#64748b', fontSize: '13px' }}>No revenue data.</div>
          ) : revenueData.map(o => (
            <HoverBreakdown key={o.id} title={`${o.name || o.id}`}
              headers={['Organization', 'Monthly Revenue', 'Users', 'Activities', 'Status']}
              rows={[[o.name || o.id, `$${o.monthlyRevenue.toLocaleString()}`, o.userCount, o.totalActivities, o.status]]}
              csvFilename={`revenue_${(o.name || o.id).toLowerCase().replace(/\s/g, '_')}.csv`}>
              <BarMetric label={o.name || o.id} value={`$${o.monthlyRevenue.toLocaleString()}`} max={100} color="#C8A258" pct={Math.round(o.monthlyRevenue / (totalMRR || 1) * 100)} />
            </HoverBreakdown>
          ))}
          <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #1E3557', fontSize: '13px', color: '#94a3b8', fontFamily: "'Manrope', sans-serif" }}>
            Total MRR: <span style={{ fontWeight: '700', color: '#C8A258' }}>${totalMRR.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
