// src/pages/RegisterPage.tsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Activity } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi } from '../lib/api';
import { useAuthStore } from '../lib/store';
import styles from './AuthPage.module.css';

export function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', birthDate: '' });
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await authApi.register(form);
      setAuth(data.user, data.token);
      toast.success('Bienvenue sur ThyroTrack !');
      navigate('/profile');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Erreur lors de la création';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoRow}>
          <div className={styles.logoIcon}><Activity size={20} /></div>
          <span className={styles.logoText}>ThyroTrack</span>
        </div>

        <h1 className={styles.title}>Créer un compte</h1>
        <p className={styles.subtitle}>Commencez à suivre votre santé thyroïdienne</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Prénom et nom</label>
            <input className={styles.input} value={form.name} onChange={set('name')}
              placeholder="Marie Dupont" required minLength={2} />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input className={styles.input} type="email" value={form.email} onChange={set('email')}
              placeholder="vous@exemple.com" required />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Mot de passe</label>
            <input className={styles.input} type="password" value={form.password} onChange={set('password')}
              placeholder="8 caractères minimum" required minLength={8} />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Date de naissance <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optionnel)</span></label>
            <input className={styles.input} type="date" value={form.birthDate} onChange={set('birthDate')} />
          </div>

          <button className={styles.btn} type="submit" disabled={loading}>
            {loading ? 'Création…' : 'Créer mon compte'}
          </button>
        </form>

        <p className={styles.switchText}>
          Déjà un compte ?{' '}
          <Link to="/login" className={styles.switchLink}>Se connecter</Link>
        </p>
      </div>
    </div>
  );
}
