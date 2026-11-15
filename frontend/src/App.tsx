// src/App.tsx
import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './lib/store';
import { authApi } from './lib/api';

// Pages chargées avec l'application : l'écran de connexion et les écrans du
// quotidien, visibles dès la première navigation.
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { LogPage } from './pages/LogPage';
import { LabResultsPage } from './pages/LabResultsPage';
import { MedicationsPage } from './pages/MedicationsPage';
import { AppointmentsPage } from './pages/AppointmentsPage';
import { ProfilePage } from './pages/ProfilePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AppShell } from './components/AppShell';

// Pages chargées à la demande (morceaux séparés du bundle) : les écrans
// d'inscription et de récupération de compte, le callback Google, les fiches
// « Comprendre » (qui embarquent ~150 Ko de contenu), l'administration et le
// rapport imprimable. Le service worker les précache quand même : elles
// restent disponibles hors ligne après la première visite.
const RegisterPage = lazy(() => import('./pages/RegisterPage').then((m) => ({ default: m.RegisterPage })));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage })));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));
const OAuthCallbackPage = lazy(() => import('./pages/OAuthCallbackPage').then((m) => ({ default: m.OAuthCallbackPage })));
const ArticlesPage = lazy(() => import('./pages/ArticlesPage').then((m) => ({ default: m.ArticlesPage })));
const AdminArticlesPage = lazy(() => import('./pages/AdminArticlesPage').then((m) => ({ default: m.AdminArticlesPage })));
const ReportPage = lazy(() => import('./pages/ReportPage').then((m) => ({ default: m.ReportPage })));

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

// Attente d'un morceau chargé à la demande, à l'intérieur de l'AppShell : le
// spinner occupe la zone de contenu, pas tout l'écran.
function PageLoader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 16px' }}>
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
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/oauth/callback" element={<OAuthCallbackPage />} />

        {/* Protected */}
        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/log" element={<LogPage />} />
          <Route path="/log/:date" element={<LogPage />} />
          <Route path="/lab-results" element={<LabResultsPage />} />
          <Route path="/medications" element={<MedicationsPage />} />
          <Route path="/appointments" element={<AppointmentsPage />} />
          <Route path="/learn" element={<Suspense fallback={<PageLoader />}><ArticlesPage /></Suspense>} />
          <Route path="/admin/articles" element={<Suspense fallback={<PageLoader />}><AdminArticlesPage /></Suspense>} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        {/* Fiches « Comprendre » : lecteur plein écran (maquette), hors AppShell */}
        <Route path="/learn/:slug" element={<RequireAuth><ArticlesPage /></RequireAuth>} />

        {/* Rapport imprimable : authentifié mais hors AppShell (pas de sidebar sur le papier) */}
        <Route path="/report" element={<RequireAuth><ReportPage /></RequireAuth>} />

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
