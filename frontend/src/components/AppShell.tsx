// src/components/AppShell.tsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../lib/store';
import { useThemeStore, type ThemeMode } from '../lib/theme';
import {
  LayoutDashboard, FlaskConical, Pill, Calendar,
  ClipboardEdit, User, LogOut,
  Sun, Moon, MonitorSmartphone, BookOpen, PenLine,
} from 'lucide-react';
import styles from './AppShell.module.css';

/* Logo « papillon » de la maquette : deux lobes bleu / orange */
function LogoMark() {
  return (
    <div className={styles.logoIcon} aria-hidden="true">
      <div className={styles.wings}>
        <span className={styles.wingLeft} />
        <span className={styles.wingRight} />
      </div>
    </div>
  );
}

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Tableau de bord' },
  { to: '/log', icon: ClipboardEdit, label: 'Journal' },
  { to: '/lab-results', icon: FlaskConical, label: 'Analyses' },
  { to: '/medications', icon: Pill, label: 'Médicaments' },
  { to: '/appointments', icon: Calendar, label: 'Rendez-vous' },
  { to: '/learn', icon: BookOpen, label: 'Comprendre' },
  { to: '/profile', icon: User, label: 'Mon profil' },
];

const THEME_META: Record<ThemeMode, { icon: typeof Sun; label: string }> = {
  auto: { icon: MonitorSmartphone, label: 'Thème : automatique' },
  light: { icon: Sun, label: 'Thème : clair' },
  dark: { icon: Moon, label: 'Thème : sombre' },
};

function ThemeToggle({ className }: { className?: string }) {
  const { mode, cycle } = useThemeStore();
  const { icon: Icon, label } = THEME_META[mode];
  return (
    <button className={className} onClick={cycle} title={label} aria-label={label}>
      <Icon size={18} strokeWidth={1.8} />
    </button>
  );
}

export function AppShell() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  return (
    <div className={styles.shell}>
      {/* ── Sidebar (desktop) */}
      <aside className={styles.sidebar}>
        <div className={styles.logo} onClick={() => navigate('/dashboard')}>
          <LogoMark />
          <span className={styles.logoText}>ThyroTrack</span>
        </div>

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

          {user?.role === 'ADMIN' && (
            <NavLink
              to="/admin/articles"
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
              }
            >
              <PenLine size={18} strokeWidth={1.8} />
              <span>Rédaction</span>
            </NavLink>
          )}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.userInfo}>
            <div className={styles.avatar}>
              <span className={styles.avatarInner}>
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className={styles.userMeta}>
              <span className={styles.userName}>{user?.name}</span>
              <span className={styles.userEmail}>{user?.email}</span>
            </div>
          </div>
          <ThemeToggle className={styles.footerBtn} />
          <button className={styles.footerBtn} onClick={logout} title="Se déconnecter" aria-label="Se déconnecter">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* ── Header (mobile) : logo, thème, accès profil */}
      <header className={styles.mobileHeader}>
        <div className={styles.logo} onClick={() => navigate('/dashboard')}>
          <LogoMark />
          <span className={styles.logoText}>ThyroTrack</span>
        </div>
        <div className={styles.mobileHeaderActions}>
          <ThemeToggle className={styles.footerBtn} />
          <button
            className={styles.avatarBtn}
            onClick={() => navigate('/profile')}
            aria-label="Mon profil"
          >
            <span className={styles.avatarInner}>
              {user?.name?.charAt(0).toUpperCase()}
            </span>
          </button>
        </div>
      </header>

      {/* ── Contenu */}
      <main className={styles.main}>
        <Outlet />
      </main>

      {/* ── Nav basse (mobile) */}
      {/* Nav à points de la maquette : point plein = actif, cerclé = inactif */}
      <nav className={styles.mobileNav}>
        {NAV.slice(0, 5).map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `${styles.mobileNavItem} ${isActive ? styles.mobileNavItemActive : ''}`
            }
          >
            <span className={styles.navDot} aria-hidden="true" />
            <span>{label.split(' ')[0]}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
