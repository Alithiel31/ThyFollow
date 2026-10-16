// src/lib/crypto.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('lib/crypto', () => {
  let cryptoLib: typeof import('./crypto.js');

  beforeEach(async () => {
    vi.resetModules();
    process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
    cryptoLib = await import('./crypto.js');
  });

  it('round-trips a plaintext through encrypt/decrypt', () => {
    const plaintext = 'ya29.super-secret-google-access-token';
    const encrypted = cryptoLib.encrypt(plaintext);

    expect(encrypted).not.toContain(plaintext);
    expect(cryptoLib.decrypt(encrypted)).toBe(plaintext);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const a = cryptoLib.encrypt('same-value');
    const b = cryptoLib.encrypt('same-value');

    expect(a).not.toBe(b);
  });

  it('rejects a tampered ciphertext (auth tag mismatch)', () => {
    const encrypted = cryptoLib.encrypt('sensitive-refresh-token');
    const [iv, authTag, ciphertext] = encrypted.split(':');
    const tampered = `${iv}:${authTag}:${ciphertext.slice(0, -2)}00`;

    expect(() => cryptoLib.decrypt(tampered)).toThrow();
  });

  it('rejects a malformed payload', () => {
    expect(() => cryptoLib.decrypt('not-a-valid-payload')).toThrow();
  });

  it('throws when TOKEN_ENCRYPTION_KEY is missing or the wrong length', async () => {
    vi.resetModules();
    process.env.TOKEN_ENCRYPTION_KEY = 'too-short';
    const badKeyLib = await import('./crypto.js');

    expect(() => badKeyLib.encrypt('x')).toThrow(/32 octets/);
  });
});

describe('lib/crypto — fichiers et secrets de PDF (PDF_ENCRYPTION_KEY)', () => {
  let cryptoLib: typeof import('./crypto.js');

  beforeEach(async () => {
    vi.resetModules();
    process.env.PDF_ENCRYPTION_KEY = 'b'.repeat(64);
    process.env.PDF_ENCRYPTION_KEY_VERSION = '1';
    cryptoLib = await import('./crypto.js');
  });

  it('round-trips a 1 MB buffer byte for byte', () => {
    const plain = Buffer.alloc(1024 * 1024);
    for (let i = 0; i < plain.length; i++) plain[i] = (i * 31 + 7) & 0xff;
    const decrypted = cryptoLib.decryptBuffer(cryptoLib.encryptBuffer(plain));
    expect(Buffer.compare(decrypted, plain)).toBe(0);
  });

  it('does not leak the %PDF signature in the ciphertext', () => {
    const plain = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(256, 0x41)]);
    const encrypted = cryptoLib.encryptBuffer(plain);
    expect(encrypted.includes(Buffer.from('%PDF'))).toBe(false);
  });

  it('uses a different IV on each call', () => {
    const plain = Buffer.from('same-content');
    const a = cryptoLib.encryptBuffer(plain);
    const b = cryptoLib.encryptBuffer(plain);
    expect(a.equals(b)).toBe(false);
  });

  it('rejects a tampered ciphertext', () => {
    const encrypted = cryptoLib.encryptBuffer(Buffer.from('sensitive-pdf-bytes'));
    encrypted[encrypted.length - 1] ^= 0xff;
    expect(() => cryptoLib.decryptBuffer(encrypted)).toThrow();
  });

  it('rejects a payload encrypted with another key', async () => {
    const encrypted = cryptoLib.encryptBuffer(Buffer.from('secret'));
    vi.resetModules();
    process.env.PDF_ENCRYPTION_KEY = 'c'.repeat(64);
    const other = await import('./crypto.js');
    expect(() => other.decryptBuffer(encrypted)).toThrow();
  });

  it('rejects a truncated payload', () => {
    expect(() => cryptoLib.decryptBuffer(Buffer.from([1, 2, 3]))).toThrow();
  });

  it('round-trips a string secret and does not store it in clear', () => {
    const enc = cryptoLib.encryptPdfSecret('15031985');
    expect(enc).not.toContain('15031985');
    expect(cryptoLib.decryptPdfSecret(enc)).toBe('15031985');
  });

  it('throws when PDF_ENCRYPTION_KEY is missing or the wrong length', async () => {
    vi.resetModules();
    process.env.PDF_ENCRYPTION_KEY = '';
    const missing = await import('./crypto.js');
    expect(missing.isPdfEncryptionConfigured()).toBe(false);
    expect(() => missing.encryptBuffer(Buffer.from('x'))).toThrow(/PDF_ENCRYPTION_KEY/);

    vi.resetModules();
    process.env.PDF_ENCRYPTION_KEY = 'abcd';
    const short = await import('./crypto.js');
    expect(() => short.encryptBuffer(Buffer.from('x'))).toThrow(/PDF_ENCRYPTION_KEY/);
  });
});
