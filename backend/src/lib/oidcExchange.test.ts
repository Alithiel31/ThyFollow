// src/lib/oidcExchange.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('lib/oidcExchange', () => {
  let oidcExchange: typeof import('./oidcExchange.js');

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    oidcExchange = await import('./oidcExchange.js');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('consumes a freshly created code exactly once', () => {
    const code = oidcExchange.createExchangeCode('user-1');

    expect(oidcExchange.consumeExchangeCode(code)).toBe('user-1');
    // Deuxième consommation du même code : refusée (usage unique).
    expect(oidcExchange.consumeExchangeCode(code)).toBeNull();
  });

  it('rejects an unknown code', () => {
    expect(oidcExchange.consumeExchangeCode('does-not-exist')).toBeNull();
  });

  it('rejects a code once its 60s TTL has elapsed', () => {
    const code = oidcExchange.createExchangeCode('user-2');

    vi.advanceTimersByTime(61 * 1000);

    expect(oidcExchange.consumeExchangeCode(code)).toBeNull();
  });

  it('generates unpredictable, non-colliding codes', () => {
    const a = oidcExchange.createExchangeCode('user-3');
    const b = oidcExchange.createExchangeCode('user-4');

    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
