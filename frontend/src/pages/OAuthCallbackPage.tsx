// src/pages/OAuthCallbackPage.tsx
// Point d'atterrissage après un login OIDC réussi côté backend
// (voir controllers/oidc.controller.ts, qui redirige ici avec ?code=...).
// Le backend a déjà validé l'id_token Google : plutôt que de nous envoyer
// directement le JWT de session dans l'URL (exposé via historique
// navigateur, logs serveur/proxy, Referer), il nous donne un code opaque à
// usage unique, qu'on échange ici contre le vrai JWT via POST /oidc/exchange.
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../lib/api';
import { useAuthStore } from '../lib/store';
import styles from './AuthPage.module.css';

export function OAuthCallbackPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) { setError(true); return; }

    authApi.exchangeOidcCode(code)
      .then(({ data: { token } }) => {
        // authApi.me() lit le token depuis localStorage via l'intercepteur
        // axios (lib/api.ts) : on doit donc l'y déposer avant l'appel.
        localStorage.setItem('thyro_token', token);
        return authApi.me().then(({ data }) => {
          setAuth(data, token);
          navigate('/dashboard', { replace: true });
        });
      })
      .catch(() => {
        localStorage.removeItem('thyro_token');
        setError(true);
      });
  }, []); // eslint-disable-line

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>{t('auth.oauthCallback.error')}</h1>
          <p className={styles.switchText}>
            <Link to="/login" className={styles.switchLink}>{t('auth.oauthCallback.backToLogin')}</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <p className={styles.subtitle}>{t('auth.oauthCallback.loading')}</p>
      </div>
    </div>
  );
}
