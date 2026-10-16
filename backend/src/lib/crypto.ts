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

// ── Fichiers (PDF de bilans) et mots de passe de PDF mémorisés ─────────────
// Clé DISTINCTE de TOKEN_ENCRYPTION_KEY (PDF_ENCRYPTION_KEY) : compromettre
// l'une ne compromet pas l'autre, et chaque fonctionnalité peut être activée
// ou désactivée indépendamment. Même algorithme (AES-256-GCM), mais le
// format est binaire : [version de clé (1 octet)][iv (12)][authTag (16)][chiffré].
// La version de clé prépare une future rotation ; seul l'octet de version
// courant (PDF_ENCRYPTION_KEY_VERSION) est accepté au déchiffrement pour l'instant.
const AUTH_TAG_LENGTH = 16;

export function isPdfEncryptionConfigured(): boolean {
  return /^[0-9a-f]{64}$/i.test(config.pdfEncryptionKey);
}

function getPdfKey(): Buffer {
  const key = Buffer.from(config.pdfEncryptionKey, 'hex');
  if (key.length !== 32) {
    throw new Error('PDF_ENCRYPTION_KEY doit être une valeur hexadécimale de 32 octets (64 caractères)');
  }
  return key;
}

export function encryptBuffer(plaintext: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getPdfKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const header = Buffer.from([config.pdfEncryptionKeyVersion & 0xff]);
  return Buffer.concat([header, iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptBuffer(payload: Buffer): Buffer {
  if (payload.length < 1 + IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Format de payload chiffré invalide');
  }
  const version = payload[0];
  if (version !== (config.pdfEncryptionKeyVersion & 0xff)) {
    throw new Error(`Version de clé de chiffrement inconnue : ${version}`);
  }
  const iv = payload.subarray(1, 1 + IV_LENGTH);
  const authTag = payload.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(1 + IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, getPdfKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// Variante chaîne (mots de passe de PDF) : même clé, sortie en base64 pour
// rester un simple champ texte (PdfPassword.passwordEnc).
export function encryptPdfSecret(plaintext: string): string {
  return encryptBuffer(Buffer.from(plaintext, 'utf8')).toString('base64');
}

export function decryptPdfSecret(payload: string): string {
  return decryptBuffer(Buffer.from(payload, 'base64')).toString('utf8');
}
