import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp, deleteField, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const PILOT_DEFAULT_DAYS = 30;

// Short labels keep the Plan column narrow. Tooltip shows the price tier
// for anyone who needs the reminder.
const PLAN_OPTIONS = [
  { value: 'essential',    label: 'Essential',    color: '#64748b', tooltip: '$250 / user / month' },
  { value: 'growth',       label: 'Growth',       color: '#C8A258', tooltip: '$400 / user / month' },
  { value: 'professional', label: 'Professional', color: '#16a34a', tooltip: '$450 / user / month' },
];

const TIER_DEFAULTS = {
  essential: 5,
  growth: 8,
  professional: 15,
};

export default function Organizations() {
  const { hostUser } = useAuth();
  const [orgs, setOrgs] = useState([]);
  const [userCounts, setUserCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updatingPlan, setUpdatingPlan] = useState(null); // orgId being updated
  const [editingMaxUsers, setEditingMaxUsers] = useState(null); // { orgId, value }
  const [reminderRunning, setReminderRunning] = useState(false);
  const [reminderResult, setReminderResult] = useState(null);

  // Manual trigger of the pilot-reminders Netlify function in the main app.
  // Useful for smoke-testing without waiting for the daily 01:00 UTC cron.
  // The function lives at axle-finance.com (cross-origin from the admin
  // portal); CORS allowlist on that side includes admin.axle-finance.com.
  async function handleRunReminders() {
    if (!hostUser) return;
    setReminderRunning(true);
    setReminderResult(null);
    try {
      const idToken = await hostUser.getIdToken();
      const r = await fetch('https://axle-finance.com/.netlify/functions/pilot-reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      setReminderResult(body);
    } catch (err) {
      setReminderResult({ ok: false, error: err.message });
    } finally {
      setReminderRunning(false);
    }
  }

  async function handlePlanChange(orgId, newPlan) {
    setUpdatingPlan(orgId);
    try {
      const org = orgs.find(o => o.id === orgId);
      const currentMax = org?.maxUsers || TIER_DEFAULTS[org?.plan] || TIER_DEFAULTS.essential;
      const newDefault = TIER_DEFAULTS[newPlan] || TIER_DEFAULTS.essential;
      const newMax = Math.max(currentMax, newDefault);

      await updateDoc(doc(db, 'organizations', orgId), {
        plan: newPlan,
        maxUsers: newMax,
        planUpdatedAt: serverTimestamp(),
        planUpdatedBy: hostUser?.email || 'host-admin',
      });
    } catch (err) {
      console.error('Failed to update plan:', err);
      alert('Failed to update plan: ' + err.message);
    } finally {
      setUpdatingPlan(null);
    }
  }

  // Pilot programme controls. Host admins can:
  // - start a pilot from today for N days (default 30)
  // - extend an existing pilot by N days (works whether active or expired)
  // - end a pilot (clears the pilot fields entirely, returning the org
  //   to its plan-based access)
  async function handleStartPilot(orgId, days = PILOT_DEFAULT_DAYS) {
    if (!Number.isInteger(days) || days <= 0) return;
    const start = new Date();
    const end = new Date(start.getTime() + days * 86_400_000);
    try {
      await updateDoc(doc(db, 'organizations', orgId), {
        pilotStartedAt: Timestamp.fromDate(start),
        pilotEndAt: Timestamp.fromDate(end),
        pilotDurationDays: days,
        pilotStatus: 'active',
        // Reset the per-milestone reminder log so the new pilot window
        // earns its own 14d / 7d / 3d / day-of / expired emails.
        pilotRemindersSent: deleteField(),
        pilotUpdatedAt: serverTimestamp(),
        pilotUpdatedBy: hostUser?.email || 'host-admin',
      });
    } catch (err) {
      console.error('Failed to start pilot', err);
      alert('Failed to start pilot: ' + err.message);
    }
  }

  async function handleExtendPilot(orgId, days, currentEndAt) {
    if (!Number.isInteger(days) || days <= 0) return;
    // Extend from later of (current end, now) so extending an expired
    // pilot pushes the deadline into the future, not just one day forward.
    const base = currentEndAt && currentEndAt > new Date() ? currentEndAt : new Date();
    const newEnd = new Date(base.getTime() + days * 86_400_000);
    try {
      await updateDoc(doc(db, 'organizations', orgId), {
        pilotEndAt: Timestamp.fromDate(newEnd),
        pilotStatus: 'active',
        // Reset reminders so the new window gets fresh emails.
        pilotRemindersSent: deleteField(),
        pilotUpdatedAt: serverTimestamp(),
        pilotUpdatedBy: hostUser?.email || 'host-admin',
      });
    } catch (err) {
      console.error('Failed to extend pilot', err);
      alert('Failed to extend pilot: ' + err.message);
    }
  }

  async function handleEndPilot(orgId) {
    if (!window.confirm('End this pilot now? The org loses pilot status and the banner is removed.')) return;
    try {
      await updateDoc(doc(db, 'organizations', orgId), {
        pilotStartedAt: deleteField(),
        pilotEndAt: deleteField(),
        pilotDurationDays: deleteField(),
        pilotStatus: deleteField(),
        pilotRemindersSent: deleteField(),
        pilotUpdatedAt: serverTimestamp(),
        pilotUpdatedBy: hostUser?.email || 'host-admin',
      });
    } catch (err) {
      console.error('Failed to end pilot', err);
      alert('Failed to end pilot: ' + err.message);
    }
  }

  async function handleMaxUsersChange(orgId, newMax, currentPlan, currentUserCount) {
    const tierMin = TIER_DEFAULTS[currentPlan] || TIER_DEFAULTS.essential;
    const validMax = Math.max(newMax, tierMin, currentUserCount || 0);

    if (!Number.isInteger(validMax) || validMax < 1) return;

    try {
      await updateDoc(doc(db, 'organizations', orgId), {
        maxUsers: validMax,
        maxUsersUpdatedAt: serverTimestamp(),
        maxUsersUpdatedBy: hostUser?.email || 'host-admin',
      });
    } catch (err) {
      console.error('Failed to update maxUsers:', err);
      alert('Failed to update max users: ' + err.message);
    }
    setEditingMaxUsers(null);
  }

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
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#f8fafc', margin: 0, letterSpacing: '-0.3px', fontFamily: "'Manrope', sans-serif" }}>Organizations</h1>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0' }}>{orgs.length} organizations · {totalUsers} total users</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {reminderResult && (() => {
            if (reminderResult.ok === false) {
              return (
                <span style={{ fontSize: '12px', color: '#f87171', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', padding: '4px 10px', borderRadius: '6px', fontWeight: 600 }}>
                  Failed: {reminderResult.error}
                </span>
              );
            }
            const sent = (reminderResult.results || []).filter(r => r.sent);
            const skipped = (reminderResult.results || []).filter(r => r.skipped);
            const errors = (reminderResult.results || []).filter(r => r.error);
            return (
              <details style={{ fontSize: '12px' }}>
                <summary style={{
                  cursor: 'pointer', listStyle: 'none', userSelect: 'none',
                  color: sent.length > 0 ? '#34d399' : '#94a3b8',
                  background: sent.length > 0 ? 'rgba(16,185,129,0.1)' : 'rgba(148,163,184,0.08)',
                  border: `1px solid ${sent.length > 0 ? 'rgba(16,185,129,0.3)' : 'rgba(148,163,184,0.25)'}`,
                  padding: '4px 10px', borderRadius: '6px', fontWeight: 600,
                }}>
                  Sent {sent.length} · skipped {skipped.length}{errors.length ? ` · errors ${errors.length}` : ''} · click for details
                </summary>
                <div style={{
                  marginTop: '6px', background: '#0B1520', border: '1px solid #1E3557',
                  borderRadius: '8px', padding: '10px 12px', maxHeight: '220px', overflowY: 'auto',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', lineHeight: 1.7,
                  color: '#94a3b8', minWidth: '320px',
                }}>
                  {(reminderResult.results || []).map((r, i) => {
                    const colour = r.sent ? '#34d399' : r.error ? '#f87171' : '#94a3b8';
                    const label = r.sent
                      ? `sent ${r.sent.milestone} -> ${r.sent.recipients} recipient${r.sent.recipients === 1 ? '' : 's'}`
                      : r.error
                      ? `error: ${r.error}`
                      : `skipped: ${r.skipped}`;
                    return (
                      <div key={i} style={{ color: colour }}>
                        <span style={{ color: '#cbd5e1' }}>{r.orgId}</span> &nbsp; {label}
                      </div>
                    );
                  })}
                  {(reminderResult.results || []).length === 0 && (
                    <div>No orgs in pilot programme.</div>
                  )}
                </div>
              </details>
            );
          })()}
          <button
            onClick={handleRunReminders}
            disabled={reminderRunning}
            title="Manually run the pilot-reminder check now (otherwise runs daily at 09:00 SGT)"
            style={{
              padding: '8px 14px',
              background: 'transparent',
              border: '1px solid rgba(200,162,88,0.5)',
              borderRadius: '8px',
              color: '#C8A258',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: "'Manrope', sans-serif",
              cursor: reminderRunning ? 'wait' : 'pointer',
              opacity: reminderRunning ? 0.6 : 1,
            }}
          >
            {reminderRunning ? 'Running…' : 'Run pilot reminders now'}
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <input
          placeholder="Search by name or org ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '300px', padding: '8px 14px', background: '#162B44', border: '1px solid #1E3557', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', fontFamily: "'Manrope', sans-serif" }}
        />
      </div>

      <div style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1.7fr 70px 90px 130px 230px 110px', padding: '10px 20px', borderBottom: '1px solid #1E3557', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          <span>Organization</span><span>Org ID</span><span>Users</span><span>Max Users</span><span>Plan</span><span>Pilot</span><span>Created</span>
        </div>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>{orgs.length === 0 ? 'No organizations yet.' : 'No results match your search.'}</div>
        ) : filtered.map(org => {
          const currentPlan = org.plan || 'essential';
          const planInfo = PLAN_OPTIONS.find(p => p.value === currentPlan) || PLAN_OPTIONS[0];
          return (
          <div key={org.id} style={{ display: 'grid', gridTemplateColumns: '1.7fr 1.7fr 70px 90px 130px 230px 110px', padding: '14px 20px', borderBottom: '1px solid #0B1520', alignItems: 'center' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc' }}>{org.name || org.id}</div>
            <div style={{ fontSize: '12px', color: '#64748b', fontFamily: "'JetBrains Mono', monospace", background: '#0B1520', padding: '3px 8px', borderRadius: '4px', display: 'inline-block', letterSpacing: '0.02em' }}>{org.id}</div>
            <div>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#C8A258', background: 'rgba(200,162,88,0.1)', padding: '3px 10px', borderRadius: '100px', border: '1px solid rgba(200,162,88,0.25)' }}>
                {userCounts[org.id] || 0}
              </span>
            </div>
            <div>
              <input
                type="number"
                value={editingMaxUsers?.orgId === org.id ? editingMaxUsers.value : (org.maxUsers || TIER_DEFAULTS[currentPlan] || TIER_DEFAULTS.essential)}
                onChange={e => setEditingMaxUsers({ orgId: org.id, value: parseInt(e.target.value) || 0 })}
                onBlur={() => {
                  if (editingMaxUsers?.orgId === org.id) {
                    handleMaxUsersChange(org.id, editingMaxUsers.value, currentPlan, userCounts[org.id] || 0);
                  }
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.target.blur();
                  }
                }}
                min={TIER_DEFAULTS[currentPlan] || TIER_DEFAULTS.essential}
                style={{
                  width: '60px',
                  padding: '4px 8px',
                  background: '#0B1520',
                  border: '1px solid #1E3557',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '13px',
                  fontWeight: '600',
                  fontFamily: "'Manrope', sans-serif",
                  textAlign: 'center',
                }}
              />
            </div>
            <div>
              <select
                value={currentPlan}
                onChange={e => handlePlanChange(org.id, e.target.value)}
                disabled={updatingPlan === org.id}
                title={planInfo.tooltip}
                style={{
                  width: '100%',
                  padding: '5px 10px',
                  background: '#0B1520',
                  border: `1px solid ${planInfo.color}40`,
                  borderRadius: '6px',
                  color: planInfo.color,
                  fontSize: '12px',
                  fontWeight: '700',
                  fontFamily: "'Manrope', sans-serif",
                  cursor: 'pointer',
                  letterSpacing: '0.03em',
                  textTransform: 'uppercase',
                  opacity: updatingPlan === org.id ? 0.5 : 1,
                  boxSizing: 'border-box',
                }}
              >
                {PLAN_OPTIONS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            {(() => {
              const endAt = org.pilotEndAt?.toDate?.() || (org.pilotEndAt ? new Date(org.pilotEndAt) : null);
              const now = new Date();
              const inPilot = !!endAt;
              const expired = inPilot && endAt <= now;
              const daysLeft = inPilot && !expired ? Math.ceil((endAt - now) / 86_400_000) : 0;
              const pillBg = !inPilot ? 'transparent'
                : expired ? 'rgba(239,68,68,0.12)'
                : daysLeft <= 7 ? 'rgba(245,158,11,0.18)'
                : 'rgba(16,185,129,0.15)';
              const pillFg = !inPilot ? '#64748b'
                : expired ? '#f87171'
                : daysLeft <= 7 ? '#fbbf24'
                : '#34d399';
              const pillBorder = !inPilot ? '1px solid #1E3557'
                : `1px solid ${pillFg}55`;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{
                    display: 'inline-block', alignSelf: 'flex-start',
                    fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '100px',
                    background: pillBg, color: pillFg, border: pillBorder,
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                  }}>
                    {!inPilot ? 'Not in pilot' : expired ? `Ended ${formatDate(org.pilotEndAt)}` : `${daysLeft}d left`}
                  </span>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {!inPilot && (
                      <button
                        onClick={() => handleStartPilot(org.id, PILOT_DEFAULT_DAYS)}
                        style={{ background: 'transparent', border: '1px solid rgba(200,162,88,0.4)', color: '#C8A258', borderRadius: '5px', padding: '3px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope', sans-serif" }}
                      >Start +30d</button>
                    )}
                    {inPilot && (
                      <>
                        <button
                          onClick={() => handleExtendPilot(org.id, 30, endAt)}
                          title="Extend pilot by 30 days"
                          style={{ background: 'transparent', border: '1px solid rgba(16,185,129,0.5)', color: '#34d399', borderRadius: '5px', padding: '3px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope', sans-serif" }}
                        >+30d</button>
                        <button
                          onClick={() => {
                            const v = window.prompt('Extend by how many days?', '60');
                            const n = parseInt(v, 10);
                            if (n > 0) handleExtendPilot(org.id, n, endAt);
                          }}
                          title="Extend pilot by a custom number of days"
                          style={{ background: 'transparent', border: '1px solid #1E3557', color: '#94a3b8', borderRadius: '5px', padding: '3px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope', sans-serif" }}
                        >+ Other</button>
                        <button
                          onClick={() => handleEndPilot(org.id)}
                          title="End pilot immediately"
                          style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.5)', color: '#f87171', borderRadius: '5px', padding: '3px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope', sans-serif" }}
                        >End</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}
            <div style={{ fontSize: '12px', color: '#64748b' }}>{formatDate(org.createdAt)}</div>
          </div>
          );
        })}
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
