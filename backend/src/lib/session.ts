// src/lib/session.ts
// JWT de session applicatif : émission et vérification centralisées (REST,
// GraphQL, OIDC). Le token porte la version de session de l'utilisateur
// (`User.tokenVersion`) : l'incrémenter en base (ex. réinitialisation du mot
// de passe) invalide immédiatement tous les tokens émis avant, au lieu de les
// laisser valides jusqu'à leur expiration (30 jours par défaut).
import crypto from 'crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from './prisma.js';

interface SessionPayload {
  userId: string;
  // Absent des tokens émis avant l'introduction de tokenVersion : vaut 0,
  // ce qui les garde valides jusqu'au premier incrément.
  tv?: number;
}

export function signSessionToken(user: { id: string; tokenVersion: number }): string {
  return jwt.sign({ userId: user.id, tv: user.tokenVersion } satisfies SessionPayload, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'],
  });
}

// Retourne l'id de l'utilisateur si le token est valide (signature, expiration)
// ET que sa version de session correspond toujours à celle en base ; null sinon
// (y compris pour un compte supprimé depuis l'émission du token).
export async function verifySessionToken(token: string): Promise<string | null> {
  let payload: SessionPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as SessionPayload;
  } catch {
    return null;
  }
  if (typeof payload.userId !== 'string') return null;

  const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { tokenVersion: true } });
  if (!user || user.tokenVersion !== (payload.tv ?? 0)) return null;
  return payload.userId;
}

// Les jetons de vérification d'email et de réinitialisation de mot de passe
// ne sont stockés en base que sous forme d'empreinte SHA-256 : une fuite de la
// base (dump, sauvegarde) ne permet pas de les rejouer. Un hash rapide suffit
// ici, contrairement aux mots de passe : le jeton fait 256 bits aléatoires.
export function hashOneTimeToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
