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
