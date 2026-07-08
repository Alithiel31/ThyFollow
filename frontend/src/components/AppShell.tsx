// src/components/AppShell.tsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../lib/store';
import { useThemeStore, type ThemeMode } from '../lib/theme';
import {
  LayoutDashboard, FlaskConical, Pill, Calendar,
  ClipboardEdit, User, LogOut,
  Sun, Moon, MonitorSmartphone, BookOpen, PenLine, Languages,
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

function useNavItems() {
  const { t } = useTranslation();
  return [
    { to: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/log', icon: ClipboardEdit, label: t('nav.log') },
    { to: '/lab-results', icon: FlaskConical, label: t('nav.labResults') },
    { to: '/medications', icon: Pill, label: t('nav.medications') },
    { to: '/appointments', icon: Calendar, label: t('nav.appointments') },
    { to: '/learn', icon: BookOpen, label: t('nav.learn') },
    { to: '/profile', icon: User, label: t('nav.profile') },
  ];
}

function ThemeToggle({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { mode, cycle } = useThemeStore();
  const THEME_META: Record<ThemeMode, { icon: typeof Sun; label: string }> = {
    auto: { icon: MonitorSmartphone, label: t('theme.auto') },
    light: { icon: Sun, label: t('theme.light') },
    dark: { icon: Moon, label: t('theme.dark') },
  };
  const { icon: Icon, label } = THEME_META[mode];
  return (
    <button className={className} onClick={cycle} title={label} aria-label={label}>
      <Icon size={18} strokeWidth={1.8} />
    </button>
  );
}

function LanguageToggle({ className }: { className?: string }) {
  const { i18n } = useTranslation();
  const next = i18n.language?.startsWith('en') ? 'fr' : 'en';
  const label = i18n.language?.startsWith('en') ? 'Passer en français' : 'Switch to English';
  return (
    <button
      className={className}
      onClick={() => i18n.changeLanguage(next)}
      title={label}
      aria-label={label}
    >
      <Languages size={18} strokeWidth={1.8} />
    </button>
  );
}

export function AppShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const NAV = useNavItems();

  return (
    <div className={styles.shell}>
      {/* ── Sidebar (desktop) */}
      <aside className={styles.sidebar}>
        <div className={styles.logo} onClick={() => navigate('/dashboard')}>
          <LogoMark />
          <span className={styles.logoText}>{t('app.name')}</span>
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
              <span>{t('nav.writing')}</span>
            </NavLink>
          )}
        </nav>

        <div className={styles.sidebarFooter}>
          <div className={styles.userInfo} title={user ? `${user.name}\n${user.email}` : undefined}>
            <div className={styles.avatar}>
              <span className={styles.avatarInner}>
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
          <LanguageToggle className={styles.footerBtn} />
          <ThemeToggle className={styles.footerBtn} />
          <button className={styles.footerBtn} onClick={logout} title={t('common.logout')} aria-label={t('common.logout')}>
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* ── Header (mobile) : logo, thème, accès profil */}
      <header className={styles.mobileHeader}>
        <div className={styles.logo} onClick={() => navigate('/dashboard')}>
          <LogoMark />
          <span className={styles.logoText}>{t('app.name')}</span>
        </div>
        <div className={styles.mobileHeaderActions}>
          <LanguageToggle className={styles.footerBtn} />
          <ThemeToggle className={styles.footerBtn} />
          <button
            className={styles.avatarBtn}
            onClick={() => navigate('/profile')}
            aria-label={t('common.myProfile')}
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
            <span className={styles.navLabel}>{label.split(' ')[0]}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
