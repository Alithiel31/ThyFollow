// src/App.tsx
import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './lib/store';
import { authApi } from './lib/api';

// Pages
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { LogPage } from './pages/LogPage';
import { LabResultsPage } from './pages/LabResultsPage';
import { MedicationsPage } from './pages/MedicationsPage';
import { AppointmentsPage } from './pages/AppointmentsPage';
import { ProfilePage } from './pages/ProfilePage';
import { AppShell } from './components/AppShell';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useAuthStore();
  if (isLoading) return <FullScreenLoader />;
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function FullScreenLoader() {
  return (
    <div style={{
      height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div className="spinner" />
    </div>
  );
}

export default function App() {
  const { token, setAuth, setLoading } = useAuthStore();

  // Rehydrate user on mount
  useEffect(() => {
    if (!token) { setLoading(false); return; }
    authApi.me()
      .then(({ data }) => setAuth(data, token))
      .catch(() => { setLoading(false); });
  }, []); // eslint-disable-line

  return (
    <>
      <style>{`
        .spinner {
          width: 36px; height: 36px;
          border: 3px solid var(--border);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Protected */}
        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/log" element={<LogPage />} />
          <Route path="/log/:date" element={<LogPage />} />
          <Route path="/lab-results" element={<LabResultsPage />} />
          <Route path="/medications" element={<MedicationsPage />} />
          <Route path="/appointments" element={<AppointmentsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}
