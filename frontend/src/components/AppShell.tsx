// src/components/AppShell.tsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../lib/store';
import {
  LayoutDashboard, FlaskConical, Pill, Calendar,
  ClipboardEdit, User, LogOut, Activity
} from 'lucide-react';
import styles from './AppShell.module.css';

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Tableau de bord' },
  { to: '/log', icon: ClipboardEdit, label: 'Journal' },
  { to: '/lab-results', icon: FlaskConical, label: 'Analyses' },
  { to: '/medications', icon: Pill, label: 'Médicaments' },
  { to: '/appointments', icon: Calendar, label: 'Rendez-vous' },
  { to: '/profile', icon: User, label: 'Mon profil' },
];

export function AppShell() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  return (
    <div className={styles.shell}>
      {/* ── Sidebar */}
      <aside className={styles.sidebar}>
        {/* Logo */}
        <div className={styles.logo} onClick={() => navigate('/dashboard')}>
          <div className={styles.logoIcon}>
            <Activity size={18} strokeWidth={2.5} />
          </div>
          <span className={styles.logoText}>ThyroTrack</span>
        </div>

        {/* Nav links */}
        <nav className={styles.nav}>
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
              }
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User + logout */}
        <div className={styles.sidebarFooter}>
          <div className={styles.userInfo}>
            <div className={styles.avatar}>
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className={styles.userMeta}>
              <span className={styles.userName}>{user?.name}</span>
              <span className={styles.userEmail}>{user?.email}</span>
            </div>
          </div>
          <button className={styles.logoutBtn} onClick={logout} title="Se déconnecter">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* ── Main content */}
      <main className={styles.main}>
        <Outlet />
      </main>

      {/* ── Mobile bottom nav */}
      <nav className={styles.mobileNav}>
        {NAV.slice(0, 5).map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `${styles.mobileNavItem} ${isActive ? styles.mobileNavItemActive : ''}`
            }
          >
            <Icon size={20} strokeWidth={1.8} />
            <span>{label.split(' ')[0]}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
