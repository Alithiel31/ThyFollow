// src/lib/signedCookie.ts
// Signature HMAC des cookies de flux OAuth (state/nonce/PKCE + id de
// l'utilisateur à lier). `httpOnly` empêche seulement le JavaScript de lire le
// cookie : l'utilisateur, lui, peut toujours le modifier dans son navigateur.
// Sans signature, il suffirait de remplacer l'id utilisateur du cookie de
// liaison pour rattacher son propre compte Google au compte de quelqu'un
// d'autre. Toute valeur dont la signature ne correspond pas est rejetée.
import crypto from 'crypto';
import { config } from '../config.js';

// Clé dérivée de JWT_SECRET (déjà obligatoire et vérifiée au démarrage) avec
// une étiquette dédiée : une signature de cookie ne peut pas servir de JWT,
// ni l'inverse.
function signingKey(): Buffer {
  return crypto.createHmac('sha256', config.jwtSecret).update('thyrotrack:signed-cookie:v1').digest();
}

function mac(value: string): string {
  return crypto.createHmac('sha256', signingKey()).update(value).digest('base64url');
}

export function signCookieValue(value: string): string {
  return `${value}.${mac(value)}`;
}

// Retourne la valeur d'origine, ou null si le cookie est absent, mal formé
// ou falsifié.
export function unsignCookieValue(signed: string | undefined): string | null {
  if (!signed) return null;
  const dot = signed.lastIndexOf('.');
  if (dot <= 0) return null;
  const value = signed.slice(0, dot);
  const given = Buffer.from(signed.slice(dot + 1));
  const expected = Buffer.from(mac(value));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  return value;
}
