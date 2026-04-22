import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled', color: '#C8A258' },
  { value: 'in-progress', label: 'In Progress', color: '#f59e0b' },
  { value: 'completed', label: 'Completed', color: '#10b981' },
  { value: 'cancelled', label: 'Cancelled', color: '#64748b' },
];

// SGT/HKT = UTC+8
function toSGT(date) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000);
}

function isInAllowedWindow(startDate) {
  const sgt = toSGT(startDate);
  const day = sgt.getUTCDay(); // 0=Sun, 6=Sat
  const hour = sgt.getUTCHours();
  // Weekends
  if (day === 0 || day === 6) return true;
  // Weekday 22:00-06:00 SGT
  if (hour >= 22 || hour < 6) return true;
  return false;
}

function formatDatetime(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
}

function formatDatetimeSGT(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('en-SG', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore' }) + ' SGT';
}

export default function Maintenance() {
  const { hostUser } = useAuth();
  const [windows, setWindows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ title: '', description: '', startTime: '', endTime: '', affectedServices: 'All Services' });
  const [emailStatus, setEmailStatus] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'maintenance'), orderBy('startTime', 'desc')),
      snap => { setWindows(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
      err => { console.error(err); setLoading(false); }
    );
    return () => unsub();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');

    if (!form.title || !form.startTime || !form.endTime) {
      setFormError('Title, start time, and end time are required.');
      return;
    }

    const start = new Date(form.startTime);
    const end = new Date(form.endTime);
    const now = new Date();
    const minNotice = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    if (start >= end) {
      setFormError('End time must be after start time.');
      return;
    }

    if (start < minNotice) {
      setFormError('Maintenance must be scheduled at least 48 hours in advance (per SLA).');
      return;
    }

    if (!isInAllowedWindow(start)) {
      setFormError('Maintenance must be during allowed windows: weekends or 22:00-06:00 SGT/HKT (per SLA).');
      return;
    }

    setSending(true);
    try {
      const docData = {
        title: form.title,
        description: form.description,
        startTime: start,
        endTime: end,
        affectedServices: form.affectedServices,
        status: 'scheduled',
        createdAt: serverTimestamp(),
        createdBy: hostUser?.email || 'host-admin',
        emailSent: false,
      };

      const docRef = await addDoc(collection(db, 'maintenance'), docData);

      // Send notification emails via Netlify function
      setEmailStatus('Sending notification emails...');
      try {
        const resp = await fetch('/.netlify/functions/send-maintenance-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            maintenanceId: docRef.id,
            title: form.title,
            description: form.description,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            affectedServices: form.affectedServices,
          }),
        });
        const result = await resp.json();
        if (result.success) {
          await updateDoc(doc(db, 'maintenance', docRef.id), { emailSent: true, emailSentAt: serverTimestamp(), emailCount: result.emailCount || 0 });
          setEmailStatus(`Notifications sent to ${result.emailCount || 0} users.`);
        } else {
          setEmailStatus(`Warning: Email delivery failed — ${result.error || 'unknown error'}. You can retry later.`);
        }
      } catch (emailErr) {
        console.error('Email send error:', emailErr);
        setEmailStatus('Warning: Could not send notification emails. You can retry later.');
      }

      setForm({ title: '', description: '', startTime: '', endTime: '', affectedServices: 'All Services' });
      setShowForm(false);
    } catch (err) {
      console.error(err);
      setFormError('Failed to schedule maintenance: ' + err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleStatusChange(id, newStatus) {
    try {
      await updateDoc(doc(db, 'maintenance', id), { status: newStatus, updatedAt: serverTimestamp() });
    } catch (err) {
      alert('Failed to update status: ' + err.message);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this maintenance window?')) return;
    try {
      await deleteDoc(doc(db, 'maintenance', id));
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  }

  async function handleResendEmail(mw) {
    if (!window.confirm(`Resend maintenance notification for "${mw.title}"?`)) return;
    try {
      const resp = await fetch('/.netlify/functions/send-maintenance-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maintenanceId: mw.id,
          title: mw.title,
          description: mw.description,
          startTime: (mw.startTime?.toDate ? mw.startTime.toDate() : new Date(mw.startTime)).toISOString(),
          endTime: (mw.endTime?.toDate ? mw.endTime.toDate() : new Date(mw.endTime)).toISOString(),
          affectedServices: mw.affectedServices,
        }),
      });
      const result = await resp.json();
      if (result.success) {
        await updateDoc(doc(db, 'maintenance', mw.id), { emailSent: true, emailSentAt: serverTimestamp(), emailCount: result.emailCount || 0 });
        alert(`Notifications re-sent to ${result.emailCount || 0} users.`);
      } else {
        alert('Failed to send: ' + (result.error || 'unknown error'));
      }
    } catch (err) {
      alert('Failed to send emails: ' + err.message);
    }
  }

  const upcoming = windows.filter(w => w.status === 'scheduled' || w.status === 'in-progress');
  const past = windows.filter(w => w.status === 'completed' || w.status === 'cancelled');

  return (
    <div>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#f8fafc', margin: 0, letterSpacing: '-0.3px', fontFamily: "'Manrope', sans-serif" }}>Maintenance</h1>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0' }}>Schedule maintenance windows and notify all users automatically</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setFormError(''); setEmailStatus(null); }}
          style={{
            padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer',
            background: showForm ? '#1E3557' : 'linear-gradient(135deg, #C8A258, #b8924a)',
            color: showForm ? '#94a3b8' : '#0F2137', fontSize: '13px', fontWeight: '700',
            fontFamily: "'Manrope', sans-serif", letterSpacing: '0.02em',
          }}
        >
          {showForm ? 'Cancel' : '+ Schedule Maintenance'}
        </button>
      </div>

      {/* SLA reminder */}
      <div style={{ marginBottom: '20px', padding: '12px 16px', background: 'rgba(200,162,88,0.08)', border: '1px solid rgba(200,162,88,0.2)', borderRadius: '8px', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <span style={{ fontSize: '14px' }}>SLA</span>
        <div style={{ fontSize: '12px', color: '#94a3b8', fontFamily: "'Manrope', sans-serif" }}>
          <span style={{ color: '#C8A258', fontWeight: 600 }}>48-hour minimum notice</span> · Allowed windows: <span style={{ color: '#f8fafc' }}>weekends</span> or <span style={{ color: '#f8fafc' }}>22:00-06:00 SGT/HKT</span>
        </div>
      </div>

      {/* Schedule Form */}
      {showForm && (
        <div style={{ marginBottom: '24px', padding: '24px', background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', margin: '0 0 16px', fontFamily: "'Manrope', sans-serif" }}>Schedule New Maintenance</h3>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Title *</label>
                <input
                  type="text" placeholder="e.g., Database migration"
                  value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', background: '#0B1520', border: '1px solid #1E3557', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', fontFamily: "'Manrope', sans-serif" }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Affected Services</label>
                <select
                  value={form.affectedServices} onChange={e => setForm({ ...form, affectedServices: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', background: '#0B1520', border: '1px solid #1E3557', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', fontFamily: "'Manrope', sans-serif", cursor: 'pointer' }}
                >
                  <option value="All Services">All Services</option>
                  <option value="Pipeline & Analytics">Pipeline & Analytics</option>
                  <option value="AI Assistant">AI Assistant</option>
                  <option value="Data Export">Data Export</option>
                  <option value="Authentication">Authentication</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Description</label>
              <textarea
                placeholder="Describe the maintenance work and expected impact..."
                value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                rows={3}
                style={{ width: '100%', padding: '10px 14px', background: '#0B1520', border: '1px solid #1E3557', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', fontFamily: "'Manrope', sans-serif", resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Start Time (SGT/HKT) *</label>
                <input
                  type="datetime-local" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', background: '#0B1520', border: '1px solid #1E3557', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', fontFamily: "'Manrope', sans-serif" }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '6px' }}>End Time (SGT/HKT) *</label>
                <input
                  type="datetime-local" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', background: '#0B1520', border: '1px solid #1E3557', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', fontFamily: "'Manrope', sans-serif" }}
                />
              </div>
            </div>
            {formError && (
              <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#ef4444', fontSize: '13px', marginBottom: '12px' }}>
                {formError}
              </div>
            )}
            {emailStatus && (
              <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px', color: '#10b981', fontSize: '13px', marginBottom: '12px' }}>
                {emailStatus}
              </div>
            )}
            <button
              type="submit" disabled={sending}
              style={{
                padding: '10px 24px', borderRadius: '8px', border: 'none', cursor: sending ? 'not-allowed' : 'pointer',
                background: 'linear-gradient(135deg, #C8A258, #b8924a)', color: '#0F2137',
                fontSize: '13px', fontWeight: '700', fontFamily: "'Manrope', sans-serif",
                opacity: sending ? 0.6 : 1,
              }}
            >
              {sending ? 'Scheduling & Notifying...' : 'Schedule & Notify All Users'}
            </button>
          </form>
        </div>
      )}

      {/* Upcoming Maintenance */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', marginBottom: '12px', fontFamily: "'Manrope', sans-serif" }}>
          Upcoming ({upcoming.length})
        </h2>
        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#64748b' }}>Loading...</div>
        ) : upcoming.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#64748b', background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px' }}>
            No upcoming maintenance scheduled.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {upcoming.map(mw => {
              const statusInfo = STATUS_OPTIONS.find(s => s.value === mw.status) || STATUS_OPTIONS[0];
              return (
                <div key={mw.id} style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc', margin: '0 0 4px', fontFamily: "'Manrope', sans-serif" }}>{mw.title}</h3>
                      {mw.description && <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>{mw.description}</p>}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <select
                        value={mw.status}
                        onChange={e => handleStatusChange(mw.id, e.target.value)}
                        style={{
                          padding: '5px 10px', background: '#0B1520', border: `1px solid ${statusInfo.color}40`,
                          borderRadius: '6px', color: statusInfo.color, fontSize: '11px', fontWeight: 700,
                          fontFamily: "'Manrope', sans-serif", cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.03em',
                        }}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                      <button onClick={() => handleResendEmail(mw)} title="Resend notification emails" style={{ background: 'none', border: '1px solid #1E3557', borderRadius: '6px', padding: '5px 8px', cursor: 'pointer', color: '#94a3b8', fontSize: '11px' }}>
                        Resend
                      </button>
                      <button onClick={() => handleDelete(mw.id)} title="Delete" style={{ background: 'none', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', padding: '5px 8px', cursor: 'pointer', color: '#ef4444', fontSize: '11px' }}>
                        Delete
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '24px', fontSize: '12px', color: '#64748b' }}>
                    <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Start:</span> {formatDatetimeSGT(mw.startTime)}</div>
                    <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>End:</span> {formatDatetimeSGT(mw.endTime)}</div>
                    <div><span style={{ color: '#94a3b8', fontWeight: 600 }}>Services:</span> {mw.affectedServices || 'All Services'}</div>
                    {mw.emailSent && <div style={{ color: '#10b981' }}>Emails sent ({mw.emailCount || 0} users)</div>}
                    {!mw.emailSent && <div style={{ color: '#f59e0b' }}>Emails not sent</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Past Maintenance */}
      {past.length > 0 && (
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', marginBottom: '12px', fontFamily: "'Manrope', sans-serif" }}>
            Past ({past.length})
          </h2>
          <div style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 100px', padding: '10px 20px', borderBottom: '1px solid #1E3557', fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <span>Title</span><span>Start</span><span>End</span><span>Status</span><span>Notified</span>
            </div>
            {past.map(mw => {
              const statusInfo = STATUS_OPTIONS.find(s => s.value === mw.status) || STATUS_OPTIONS[3];
              return (
                <div key={mw.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 100px', padding: '14px 20px', borderBottom: '1px solid #0B1520', alignItems: 'center' }}>
                  <div style={{ fontSize: '13px', color: '#94a3b8' }}>{mw.title}</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>{formatDatetimeSGT(mw.startTime)}</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>{formatDatetimeSGT(mw.endTime)}</div>
                  <div><span style={{ fontSize: '11px', fontWeight: 700, color: statusInfo.color, textTransform: 'uppercase' }}>{statusInfo.label}</span></div>
                  <div style={{ fontSize: '12px', color: mw.emailSent ? '#10b981' : '#64748b' }}>{mw.emailSent ? `${mw.emailCount || 0} users` : '—'}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
