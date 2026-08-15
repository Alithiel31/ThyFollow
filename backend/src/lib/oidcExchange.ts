// src/lib/oidcExchange.ts
// Code d'échange OIDC à usage unique : évite qu'un JWT de session (30j) ne
// transite en clair dans l'URL de redirection `?token=...` après le retour
// de Google (historique navigateur, logs d'accès nginx/proxy, en-tête
// `Referer`). À la place, on redirige avec un `code` opaque, consommé une
// seule fois via POST /api/auth/oidc/exchange pour obtenir le vrai JWT.
import crypto from 'crypto';

const CODE_TTL_MS = 60 * 1000;

interface PendingExchange {
  userId: string;
  expiresAt: number;
}

// En mémoire : suffisant pour un déploiement mono-instance (comme le cache
// de discovery OIDC dans lib/oidc.ts). À migrer vers un store partagé
// (Redis) si le backend est un jour scalé horizontalement.
const pendingExchanges = new Map<string, PendingExchange>();

function purgeExpired(): void {
  const now = Date.now();
  for (const [code, entry] of pendingExchanges) {
    if (entry.expiresAt <= now) pendingExchanges.delete(code);
  }
}

export function createExchangeCode(userId: string): string {
  purgeExpired();
  const code = crypto.randomBytes(32).toString('hex');
  pendingExchanges.set(code, { userId, expiresAt: Date.now() + CODE_TTL_MS });
  return code;
}

// Lecture + suppression immédiate : un code n'est valide qu'une seule fois,
// même s'il est intercepté et rejoué avant expiration.
export function consumeExchangeCode(code: string): string | null {
  const entry = pendingExchanges.get(code);
  pendingExchanges.delete(code);
  if (!entry || entry.expiresAt <= Date.now()) return null;
  return entry.userId;
}
