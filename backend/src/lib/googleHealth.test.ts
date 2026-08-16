// src/lib/googleHealth.test.ts
// Tests unitaires du wrapper OAuth2 Google Health (src/lib/googleHealth.ts),
// avec `openid-client` mocké — même approche que lib/oidc.test.ts : on
// vérifie le protocole (scopes santé, PKCE/state, access_type=offline +
// prompt=consent), pas un vrai appel réseau à Google.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const discoveryMock = vi.fn();
const buildAuthorizationUrlMock = vi.fn();
const authorizationCodeGrantMock = vi.fn();
const refreshTokenGrantMock = vi.fn();

vi.mock('openid-client', () => ({
  discovery: (...args: unknown[]) => discoveryMock(...args),
  randomPKCECodeVerifier: () => 'test-code-verifier',
  calculatePKCECodeChallenge: async () => 'test-code-challenge',
  randomState: () => 'test-state',
  buildAuthorizationUrl: (...args: unknown[]) => buildAuthorizationUrlMock(...args),
  authorizationCodeGrant: (...args: unknown[]) => authorizationCodeGrantMock(...args),
  refreshTokenGrant: (...args: unknown[]) => refreshTokenGrantMock(...args),
}));

describe('lib/googleHealth', () => {
  let googleHealth: typeof import('./googleHealth.js');

  beforeEach(async () => {
    vi.resetModules();
    discoveryMock.mockReset();
    buildAuthorizationUrlMock.mockReset();
    authorizationCodeGrantMock.mockReset();
    refreshTokenGrantMock.mockReset();

    process.env.GOOGLE_HEALTH_CLIENT_ID = 'test-health-client-id';
    process.env.GOOGLE_HEALTH_CLIENT_SECRET = 'test-health-client-secret';
    discoveryMock.mockResolvedValue({ __fakeConfig: true });
    buildAuthorizationUrlMock.mockReturnValue(new URL('https://accounts.google.com/o/oauth2/auth?mock=1'));

    googleHealth = await import('./googleHealth.js');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('buildGoogleHealthAuthorizationUrl', () => {
    it('requests health scopes with offline access and forced consent (needed for a refresh_token)', async () => {
      const { url, flow } = await googleHealth.buildGoogleHealthAuthorizationUrl();

      expect(url).toContain('accounts.google.com');
      expect(flow).toEqual({ state: 'test-state', codeVerifier: 'test-code-verifier' });
      expect(buildAuthorizationUrlMock).toHaveBeenCalledWith(
        { __fakeConfig: true },
        expect.objectContaining({
          scope: googleHealth.GOOGLE_HEALTH_SCOPES.join(' '),
          code_challenge: 'test-code-challenge',
          code_challenge_method: 'S256',
          state: 'test-state',
          access_type: 'offline',
          prompt: 'consent',
        })
      );
    });

    it('throws instead of silently degrading when Google Health credentials are absent', async () => {
      vi.resetModules();
      delete process.env.GOOGLE_HEALTH_CLIENT_ID;
      delete process.env.GOOGLE_HEALTH_CLIENT_SECRET;
      const unconfigured = await import('./googleHealth.js');

      await expect(unconfigured.buildGoogleHealthAuthorizationUrl()).rejects.toThrow(/GOOGLE_HEALTH_CLIENT_ID/);
      expect(discoveryMock).not.toHaveBeenCalled();
    });
  });

  describe('handleGoogleHealthCallback', () => {
    const flow = { state: 'test-state', codeVerifier: 'test-code-verifier' };

    it('returns tokens when the exchange succeeds and Google grants a refresh_token', async () => {
      authorizationCodeGrantMock.mockResolvedValue({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        scope: 'health.sleep.read health.body.read',
        expiresIn: () => 3600,
      });

      const tokens = await googleHealth.handleGoogleHealthCallback(
        new URL('https://app.example.com/callback?code=abc&state=test-state'),
        flow
      );

      expect(tokens.accessToken).toBe('access-token');
      expect(tokens.refreshToken).toBe('refresh-token');
      expect(tokens.scope).toBe('health.sleep.read health.body.read');
      expect(tokens.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(authorizationCodeGrantMock).toHaveBeenCalledWith(
        { __fakeConfig: true },
        expect.any(URL),
        expect.objectContaining({ pkceCodeVerifier: 'test-code-verifier', expectedState: 'test-state' })
      );
    });

    it('fails loudly when Google does not return a refresh_token (would leave an unusable connection)', async () => {
      authorizationCodeGrantMock.mockResolvedValue({
        access_token: 'access-token',
        scope: 'health.sleep.read',
        expiresIn: () => 3600,
      });

      await expect(
        googleHealth.handleGoogleHealthCallback(
          new URL('https://app.example.com/callback?code=abc&state=test-state'),
          flow
        )
      ).rejects.toThrow(/refresh_token/);
    });

    it('propagates a state mismatch instead of swallowing it', async () => {
      authorizationCodeGrantMock.mockRejectedValue(new Error('state mismatch'));

      await expect(
        googleHealth.handleGoogleHealthCallback(new URL('https://app.example.com/callback?code=abc&state=wrong'), flow)
      ).rejects.toThrow('state mismatch');
    });
  });

  describe('refreshAccessToken', () => {
    it('exchanges a refresh_token for a fresh access_token', async () => {
      refreshTokenGrantMock.mockResolvedValue({ access_token: 'new-access-token', expiresIn: () => 3600 });

      const result = await googleHealth.refreshAccessToken('refresh-token');

      expect(result.accessToken).toBe('new-access-token');
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(refreshTokenGrantMock).toHaveBeenCalledWith({ __fakeConfig: true }, 'refresh-token');
    });
  });

  describe('getHealthUserId', () => {
    it('returns healthUserId when present in the response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ healthUserId: 'hu-1' }) }));

      const id = await googleHealth.getHealthUserId('access-token');

      expect(id).toBe('hu-1');
    });

    it('falls back to other plausible field names when healthUserId is absent', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ userId: 'hu-2' }) }));

      const id = await googleHealth.getHealthUserId('access-token');

      expect(id).toBe('hu-2');
    });

    it('throws with the raw body when no recognized id field is found', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ somethingElse: 'x' }) }));

      await expect(googleHealth.getHealthUserId('access-token')).rejects.toThrow(/healthUserId/);
    });

    it('throws (rather than silently swallowing) on an HTTP error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' }));

      await expect(googleHealth.getHealthUserId('access-token')).rejects.toThrow(/401/);
    });
  });
});
