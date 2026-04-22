import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';

const PIPELINE_COLORS = { NEW: '#3b82f6', CONTACTED: '#f59e0b', 'DEMO SCHEDULED': '#8b5cf6', ONBOARDING: '#10b981', ACTIVE: '#059669', REJECTED: '#ef4444' };
const PIPELINE_STAGES = ['NEW', 'CONTACTED', 'DEMO SCHEDULED', 'ONBOARDING', 'ACTIVE'];

function StatusBadge({ status }) {
  const s = status || 'NEW';
  const color = PIPELINE_COLORS[s] || '#64748b';
  return <span style={{ fontSize: '10px', fontWeight: '700', padding: '3px 9px', borderRadius: '100px', background: `${color}20`, color, border: `1px solid ${color}40`, whiteSpace: 'nowrap', letterSpacing: '0.04em' }}>{s}</span>;
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', padding: '20px 24px' }}>
      <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>{label}</div>
      <div style={{ fontSize: '34px', fontWeight: '700', color: '#f8fafc', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: color || '#C8A258', marginTop: '6px' }}>{sub}</div>}
    </div>
  );
}

function timeAgo(ts) {
  if (!ts) return '—';
  const d = ts.toDate?.() || new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function Dashboard() {
  const [leads, setLeads] = useState([]);
  const [orgCount, setOrgCount] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [leadsSnap, orgsSnap, usersSnap] = await Promise.all([
          getDocs(collection(db, 'demoRequests')),
          getDocs(collection(db, 'organizations')),
          getDocs(collection(db, 'users')),
        ]);
        const leadsData = leadsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        leadsData.sort((a, b) => (b.submittedAt?.toMillis?.() || 0) - (a.submittedAt?.toMillis?.() || 0));
        setLeads(leadsData);
        setOrgCount(orgsSnap.size);
        setUserCount(usersSnap.size);
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div style={{ color: '#64748b', fontSize: '14px', padding: '20px' }}>Loading...</div>;

  const statusCounts = {};
  leads.forEach(l => { const s = l.status || 'NEW'; statusCounts[s] = (statusCounts[s] || 0) + 1; });
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newThisWeek = leads.filter(l => (l.submittedAt?.toMillis?.() || 0) > weekAgo).length;
  const active = statusCounts.ACTIVE || 0;
  const convRate = leads.length > 0 ? Math.round(active / leads.length * 100) : 0;
  const recent = leads.slice(0, 7);
  const maxPipeline = Math.max(...PIPELINE_STAGES.map(s => statusCounts[s] || 0), 1);

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#f8fafc', margin: 0, letterSpacing: '-0.3px', fontFamily: "'Manrope', sans-serif" }}>Dashboard</h1>
        <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0' }}>Platform overview</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
        <StatCard label="Demo Leads" value={leads.length} sub={`+${newThisWeek} this week`} />
        <StatCard label="Organizations" value={orgCount} />
        <StatCard label="Total Users" value={userCount} />
        <StatCard label="Conversion Rate" value={`${convRate}%`} sub={`${active} active`} color="#3b82f6" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px' }}>
        <div style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #1E3557', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc' }}>Recent Demo Requests</div>
            <Link to="/demo-leads" style={{ fontSize: '12px', color: '#C8A258', textDecoration: 'none', fontWeight: '500' }}>View all →</Link>
          </div>
          {recent.length === 0 ? (
            <div style={{ padding: '40px', color: '#64748b', textAlign: 'center', fontSize: '14px' }}>No demo requests yet.</div>
          ) : recent.map(lead => (
            <div key={lead.id} style={{ padding: '12px 20px', borderBottom: '1px solid #0B1520', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #C8A258, #B8913A)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', color: '#0F2137' }}>
                {(lead.firstName?.[0] || lead.email?.[0] || '?').toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#f8fafc' }}>{lead.firstName} {lead.lastName}</div>
                <div style={{ fontSize: '12px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.company} — {lead.email}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <StatusBadge status={lead.status} />
                <div style={{ fontSize: '11px', color: '#475569' }}>{timeAgo(lead.submittedAt)}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', padding: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc', marginBottom: '18px' }}>Onboarding Pipeline</div>
          {PIPELINE_STAGES.map((stage, idx) => {
            const count = statusCounts[stage] || 0;
            const pct = leads.length > 0 ? Math.round(count / leads.length * 100) : 0;
            return (
              <div key={stage} style={{ marginBottom: idx < PIPELINE_STAGES.length - 1 ? '14px' : '0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>{stage}</span>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#f8fafc' }}>{count}</span>
                </div>
                <div style={{ height: '6px', background: '#0B1520', borderRadius: '100px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: '100px', background: PIPELINE_COLORS[stage], width: `${pct}%`, minWidth: count > 0 ? '6px' : '0', transition: 'width 0.5s ease' }} />
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: '20px', padding: '14px', background: '#0B1520', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>Rejected</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#ef4444' }}>{statusCounts.REJECTED || 0}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>Conversion</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: '#C8A258' }}>{convRate}%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
