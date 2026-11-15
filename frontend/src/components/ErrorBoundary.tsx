// src/components/ErrorBoundary.tsx
// Dernier filet quand un composant lève pendant le rendu : sans lui, React
// démonte tout l'arbre et l'utilisateur voit une page blanche, sans
// explication ni moyen de repartir. Utilisé deux fois : autour de toute
// l'application (main.tsx) et autour du contenu de chaque page (AppShell),
// pour qu'une page cassée laisse la navigation utilisable.
//
// Composant de classe : React n'expose pas (encore) d'équivalent à
// componentDidCatch en hook. Pas de useTranslation non plus, donc l'instance
// i18next directement.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw, Home } from 'lucide-react';
import i18n from '../lib/i18n';
import styles from './ErrorBoundary.module.css';

interface Props {
  children: ReactNode;
  // 'page' : écran entier (application) ; 'section' : s'inscrit dans la zone
  // de contenu, la navigation autour reste visible.
  variant?: 'page' | 'section';
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Pas de suivi d'erreurs externe pour l'instant (voir CHANGELOG, « À
    // faire ») : la console du navigateur est le seul endroit où l'erreur
    // reste consultable.
    console.error('Erreur de rendu non rattrapée', error, info.componentStack);
  }

  private reload = () => {
    window.location.reload();
  };

  private goHome = () => {
    window.location.assign('/dashboard');
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const variant = this.props.variant ?? 'section';
    return (
      <div className={variant === 'page' ? styles.page : styles.section} role="alert">
        <div className={styles.card}>
          <h1 className={styles.title}>{i18n.t('errorBoundary.title')}</h1>
          <p className={styles.subtitle}>{i18n.t('errorBoundary.subtitle')}</p>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={this.reload}>
              <RotateCcw size={16} aria-hidden="true" /> {i18n.t('errorBoundary.reload')}
            </button>
            <button type="button" className={styles.secondary} onClick={this.goHome}>
              <Home size={16} aria-hidden="true" /> {i18n.t('errorBoundary.home')}
            </button>
          </div>
          <details className={styles.details}>
            <summary>{i18n.t('errorBoundary.details')}</summary>
            <code>{error.message}</code>
          </details>
        </div>
      </div>
    );
  }
}
