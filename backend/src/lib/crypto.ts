// src/lib/crypto.ts
// Chiffrement au repos des secrets sensibles (tokens d'accès Google Health,
// voir controllers/googleHealth.controller.ts) — contrairement au reste de
// l'app, ces valeurs doivent pouvoir être déchiffrées plus tard (on doit
// rappeler l'API Google avec le vrai token), donc un hash (bcrypt, comme
// pour les mots de passe) ne convient pas ici : il faut un chiffrement
// réversible. AES-256-GCM via le module natif Node (pas de nouvelle
// dépendance) : authentifié (un tag falsifié ou tronqué fait échouer le
// déchiffrement plutôt que de renvoyer un texte corrompu silencieusement).
import crypto from 'crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommandé pour GCM (96 bits)

function getKey(): Buffer {
  const key = Buffer.from(config.tokenEncryptionKey, 'hex');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY doit être une valeur hexadécimale de 32 octets (64 caractères)');
  }
  return key;
}

// Format de sortie : "iv:authTag:ciphertext", tout en hexadécimal, pour
// rester un simple champ texte stockable tel quel en base (voir
// GoogleHealthConnection.accessTokenEnc/refreshTokenEnc).
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decrypt(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Format de payload chiffré invalide');
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
  return plaintext.toString('utf8');
}
