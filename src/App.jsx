import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Sidebar, { SIDEBAR_EXPANDED, SIDEBAR_COLLAPSED } from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DemoLeads from './pages/DemoLeads';
import Organizations from './pages/Organizations';
import Users from './pages/Users';
import ActivityMonitor from './pages/ActivityMonitor';
import Analytics from './pages/Analytics';
import HostAdmins from './pages/HostAdmins';
import AuditTrail from './pages/AuditTrail';
import PasswordReset from './pages/PasswordReset';

function GuardedLayout({ children }) {
  const { hostUser, loading, isHost } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0F2137', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', fontFamily: "'Outfit', sans-serif" }}>
        <div style={{ fontSize: '13px', color: '#64748b', letterSpacing: '0.03em' }}>Verifying access...</div>
      </div>
    );
  }
  if (!hostUser || !isHost) return <Navigate to="/login" replace />;
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)} />
      <main style={{
        flex: 1,
        marginLeft: sidebarCollapsed ? `${SIDEBAR_COLLAPSED}px` : `${SIDEBAR_EXPANDED}px`,
        padding: '32px 36px',
        minHeight: '100vh',
        overflow: 'auto',
        background: '#0F2137',
        transition: 'margin-left 0.25s ease',
      }}>
        {children}
      </main>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<GuardedLayout><Dashboard /></GuardedLayout>} />
      <Route path="/demo-leads" element={<GuardedLayout><DemoLeads /></GuardedLayout>} />
      <Route path="/organizations" element={<GuardedLayout><Organizations /></GuardedLayout>} />
      <Route path="/users" element={<GuardedLayout><Users /></GuardedLayout>} />
      <Route path="/activity-monitor" element={<GuardedLayout><ActivityMonitor /></GuardedLayout>} />
      <Route path="/analytics" element={<GuardedLayout><Analytics /></GuardedLayout>} />
      <Route path="/host-admins" element={<GuardedLayout><HostAdmins /></GuardedLayout>} />
      <Route path="/audit-trail" element={<GuardedLayout><AuditTrail /></GuardedLayout>} />
      <Route path="/password-reset" element={<GuardedLayout><PasswordReset /></GuardedLayout>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
