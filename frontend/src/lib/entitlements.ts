// src/lib/entitlements.ts
// Aides côté client pour l'accès Pro (les droits eux-mêmes viennent du serveur).
import { authApi } from './api';
import { useAuthStore } from './store';
import type { Entitlements } from '../types';

// Recharge l'utilisateur (et donc ses droits) depuis le serveur.
export function useRefreshUser() {
  const { token, setAuth } = useAuthStore();
  return async () => {
    if (!token) return;
    const { data } = await authApi.me();
    setAuth(data, token);
  };
}

export function importsSummary(e: Entitlements, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (e.imports.period === 'month') {
    return t('pro.monthLeft', { remaining: e.imports.remaining, limit: e.imports.limit });
  }
  return e.imports.remaining > 0
    ? t('pro.trialLeft', { count: e.imports.remaining })
    : t('pro.trialOver', { limit: e.imports.limit });
}
