import React, { useState, useEffect } from 'react';
import { collection, doc, getDoc, onSnapshot, updateDoc, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const TIER_DEFAULTS = { essential: 5, essentials: 5, growth: 8, professional: 15 };
const STATUSES = ['NEW', 'CONTACTED', 'DEMO SCHEDULED', 'ONBOARDING', 'ACTIVE', 'REJECTED'];
const STATUS_COLORS = { NEW: '#3b82f6', CONTACTED: '#f59e0b', 'DEMO SCHEDULED': '#8b5cf6', ONBOARDING: '#10b981', ACTIVE: '#059669', REJECTED: '#ef4444' };
const PROD_URL = 'https://axle-finance.com';

function StatusBadge({ status }) {
  const s = status || 'NEW';
  const color = STATUS_COLORS[s] || '#64748b';
  return <span style={{ fontSize: '10px', fontWeight: '700', padding: '3px 9px', borderRadius: '100px', background: `${color}20`, color, border: `1px solid ${color}40`, whiteSpace: 'nowrap', letterSpacing: '0.04em' }}>{s}</span>;
}

function FieldRow({ label, children }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = { width: '100%', padding: '8px 12px', background: '#0B1520', border: '1px solid #1E3557', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', fontFamily: "'Outfit', sans-serif", boxSizing: 'border-box' };

export default function DemoLeads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [editForm, setEditForm] = useState({ status: 'NEW', notes: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgRole, setOrgRole] = useState('admin');
  const [inviteLink, setInviteLink] = useState('');
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    return onSnapshot(collection(db, 'demoRequests'), snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.submittedAt?.toMillis?.() || 0) - (a.submittedAt?.toMillis?.() || 0));
      setLeads(data);
      setLoading(false);
    }, err => { console.error(err); setLoading(false); });
  }, []);

  const filtered = leads.filter(l => {
    if (statusFilter !== 'ALL' && (l.status || 'NEW') !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return `${l.firstName} ${l.lastName} ${l.email} ${l.company}`.toLowerCase().includes(q);
    }
    return true;
  });

  const selectLead = (lead) => {
    setSelected(lead);
    setEditForm({ status: lead.status || 'NEW', notes: lead.notes || '' });
    setOrgName(lead.assignedOrgName || lead.company || '');
    setOrgRole('admin');
    setInviteLink('');
    setSaved(false);
    setEmailSent(false);
    setEmailError('');
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setSaved(false);
    try {
      await updateDoc(doc(db, 'demoRequests', selected.id), { status: editForm.status, notes: editForm.notes, updatedAt: serverTimestamp() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateOrg = async () => {
    if (!orgName.trim() || !selected) return;
    setCreatingOrg(true);
    setInviteLink('');
    setEmailError('');
    try {
      const domain = selected.email?.split('@')[1] || orgName.toLowerCase().replace(/\s+/g, '');
      const orgId = 'org_' + domain.replace(/\./g, '_');
      const orgRef = doc(db, 'organizations', orgId);
      const orgSnap = await getDoc(orgRef);
      const orgData = { name: orgName.trim(), createdAt: serverTimestamp() };
      if (!orgSnap.exists()) {
        orgData.maxUsers = TIER_DEFAULTS.essential;
      }
      await setDoc(orgRef, orgData, { merge: true });
      const invRef = await addDoc(collection(db, 'organizations', orgId, 'invitations'), {
        email: selected.email, role: orgRole, organizationId: orgId, organizationName: orgName.trim(),
        invitedBy: 'Host Admin', status: 'pending', emailSent: false,
        createdAt: serverTimestamp(), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      const link = `${PROD_URL}/accept-invite?org=${orgId}&token=${invRef.id}`;
      setInviteLink(link);
      setEmailSent(false);
      setEmailError('');
      try {
        const res = await fetch(`${PROD_URL}/.netlify/functions/send-invite`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: selected.email, organizationName: orgName.trim(), invitedBy: 'Host Admin', role: orgRole, signupUrl: link }),
        });
        const data = await res.json();
        if (data.success) {
          setEmailSent(true);
          await updateDoc(doc(db, 'organizations', orgId, 'invitations', invRef.id), { emailSent: true });
        } else {
          setEmailError('Email delivery failed — share the link manually.');
        }
      } catch {
        setEmailError('Could not reach email service — share the link manually.');
      }
      await updateDoc(doc(db, 'demoRequests', selected.id), { status: 'ONBOARDING', assignedOrgId: orgId, assignedOrgName: orgName.trim(), updatedAt: serverTimestamp() });
      setEditForm(f => ({ ...f, status: 'ONBOARDING' }));
    } catch (err) {
      alert('Error creating org: ' + err.message);
    } finally {
      setCreatingOrg(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  function formatDate(ts) {
    if (!ts) return '—';
    return (ts.toDate?.() || new Date(ts)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', gap: '20px', minWidth: 0 }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#f8fafc', margin: 0, letterSpacing: '-0.3px', fontFamily: "'Sora', sans-serif" }}>Demo Leads</h1>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '4px 0 0' }}>{leads.length} total requests · Click a row to manage</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {['NEW', 'CONTACTED', 'DEMO SCHEDULED', 'ONBOARDING', 'ACTIVE'].map((s, i, arr) => (
            <React.Fragment key={s}>
              <span style={{ fontSize: '10px', fontWeight: '600', padding: '3px 9px', borderRadius: '100px', background: `${STATUS_COLORS[s]}15`, color: STATUS_COLORS[s], border: `1px solid ${STATUS_COLORS[s]}30`, letterSpacing: '0.04em' }}>{s}</span>
              {i < arr.length - 1 && <span style={{ color: '#1E3557', fontSize: '12px' }}>→</span>}
            </React.Fragment>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
          <input placeholder="Search name, email, company..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, padding: '8px 14px', background: '#162B44', border: '1px solid #1E3557', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', fontFamily: "'Outfit', sans-serif" }} />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '8px 14px', background: '#162B44', border: '1px solid #1E3557', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', fontFamily: "'Outfit', sans-serif", cursor: 'pointer' }}>
            <option value="ALL">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div style={{ background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', overflow: 'hidden', flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 100px', padding: '10px 16px', borderBottom: '1px solid #1E3557', position: 'sticky', top: 0, background: '#162B44', fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <span>Contact</span><span>Company</span><span>Team Size</span><span>Submitted</span><span>Status</span>
          </div>
          {loading ? (
            <div style={{ padding: '48px', color: '#64748b', textAlign: 'center' }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '48px', color: '#64748b', textAlign: 'center' }}>{leads.length === 0 ? 'No demo requests yet.' : 'No results match your filters.'}</div>
          ) : filtered.map(lead => (
            <div key={lead.id} onClick={() => selectLead(lead)}
              style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 100px', padding: '12px 16px', borderBottom: '1px solid #0B1520', cursor: 'pointer', background: selected?.id === lead.id ? 'rgba(200,162,88,0.08)' : 'transparent', borderLeft: selected?.id === lead.id ? '2px solid #C8A258' : '2px solid transparent' }}
              onMouseEnter={e => { if (selected?.id !== lead.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
              onMouseLeave={e => { if (selected?.id !== lead.id) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#f8fafc' }}>{lead.firstName} {lead.lastName}</div>
                <div style={{ fontSize: '12px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.email}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.company}</div>
                <div style={{ fontSize: '12px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.jobTitle}</div>
              </div>
              <div style={{ fontSize: '13px', color: '#94a3b8', alignSelf: 'center' }}>{lead.employees}</div>
              <div style={{ fontSize: '12px', color: '#64748b', alignSelf: 'center' }}>{formatDate(lead.submittedAt)}</div>
              <div style={{ alignSelf: 'center' }}><StatusBadge status={lead.status} /></div>
            </div>
          ))}
        </div>
      </div>

      {selected && (
        <div style={{ width: '340px', flexShrink: 0, background: '#162B44', border: '1px solid #1E3557', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden', height: 'fit-content', maxHeight: 'calc(100vh - 64px)', overflowY: 'auto' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #1E3557', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#162B44', zIndex: 1 }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#f8fafc' }}>Lead Detail</div>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '20px', lineHeight: 1, padding: '0 4px' }}>×</button>
          </div>
          <div style={{ padding: '18px' }}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'linear-gradient(135deg, #C8A258, #B8913A)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', fontWeight: '700', color: '#0F2137', marginBottom: '10px' }}>
                {(selected.firstName?.[0] || '?').toUpperCase()}
              </div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#f8fafc' }}>{selected.firstName} {selected.lastName}</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>{selected.jobTitle}</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{selected.email}</div>
              {selected.phone && <div style={{ fontSize: '12px', color: '#64748b' }}>{selected.phone}</div>}
            </div>
            <div style={{ background: '#0B1520', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#f8fafc' }}>{selected.company}</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{selected.employees} employees</div>
            </div>
            <div style={{ fontSize: '11px', color: '#475569', marginBottom: '14px' }}>
              Submitted {formatDate(selected.submittedAt)}
              {selected.assignedOrgName && <span style={{ marginLeft: '8px', color: '#C8A258' }}>· Org: {selected.assignedOrgName}</span>}
            </div>
            <FieldRow label="Status">
              <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FieldRow>
            <FieldRow label="Internal Notes">
              <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={4} placeholder="Add notes for the sales team..." style={{ ...inputStyle, resize: 'vertical' }} />
            </FieldRow>
            <button onClick={handleSave} disabled={saving} style={{ width: '100%', padding: '9px', background: saved ? '#B8913A' : '#C8A258', border: 'none', borderRadius: '8px', color: '#0F2137', fontSize: '13px', fontWeight: '700', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: "'Outfit', sans-serif" }}>
              {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
            </button>

            <div style={{ borderTop: '1px solid #1E3557', margin: '18px 0' }} />
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#f8fafc', marginBottom: '12px' }}>Onboard to Platform</div>
            <FieldRow label="Organization Name">
              <input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder={selected.company} style={inputStyle} />
            </FieldRow>
            <FieldRow label="Assign as">
              <select value={orgRole} onChange={e => setOrgRole(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="admin">Admin (org owner)</option>
                <option value="user">User</option>
              </select>
            </FieldRow>
            <button onClick={handleCreateOrg} disabled={creatingOrg || !orgName.trim()} style={{ width: '100%', padding: '9px', background: creatingOrg || !orgName.trim() ? 'transparent' : 'rgba(200,162,88,0.1)', border: `1px solid ${creatingOrg || !orgName.trim() ? '#1E3557' : 'rgba(200,162,88,0.4)'}`, borderRadius: '8px', color: creatingOrg || !orgName.trim() ? '#475569' : '#C8A258', fontSize: '13px', fontWeight: '600', cursor: creatingOrg || !orgName.trim() ? 'not-allowed' : 'pointer', fontFamily: "'Outfit', sans-serif" }}>
              {creatingOrg ? 'Creating...' : 'Create Org & Generate Invite Link'}
            </button>

            {inviteLink && (
              <div style={{ marginTop: '12px', background: '#0B1520', borderRadius: '8px', padding: '12px', border: `1px solid ${emailSent ? 'rgba(200,162,88,0.3)' : 'rgba(200,162,88,0.15)'}` }}>
                {emailSent && <div style={{ fontSize: '11px', color: '#C8A258', fontWeight: '600', marginBottom: '8px' }}>Invite email sent to {selected.email}</div>}
                {emailError && <div style={{ fontSize: '11px', color: '#f59e0b', marginBottom: '8px', background: 'rgba(245,158,11,0.1)', padding: '5px 8px', borderRadius: '5px' }}>{emailError}</div>}
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', marginBottom: '5px' }}>Invite link</div>
                <div style={{ fontSize: '11px', color: '#64748b', wordBreak: 'break-all', marginBottom: '8px', lineHeight: '1.5' }}>{inviteLink}</div>
                <button onClick={copyLink} style={{ padding: '5px 12px', background: copied ? 'rgba(200,162,88,0.2)' : 'rgba(200,162,88,0.1)', border: '1px solid rgba(200,162,88,0.35)', borderRadius: '6px', color: '#C8A258', fontSize: '12px', cursor: 'pointer', fontFamily: "'Outfit', sans-serif", fontWeight: '600' }}>
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
