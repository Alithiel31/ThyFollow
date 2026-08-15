// src/lib/oidc.test.ts
// Tests unitaires du wrapper OIDC (src/lib/oidc.ts), avec `openid-client`
// mocké : on ne parle jamais réellement à Google, on vérifie seulement que
// ce module utilise correctement le protocole (scopes minimaux, PKCE/state/
// nonce transmis, propagation des erreurs de vérification sans les avaler).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const discoveryMock = vi.fn();
const buildAuthorizationUrlMock = vi.fn();
const authorizationCodeGrantMock = vi.fn();
const fetchUserInfoMock = vi.fn();

vi.mock('openid-client', () => ({
  discovery: (...args: unknown[]) => discoveryMock(...args),
  randomPKCECodeVerifier: () => 'test-code-verifier',
  calculatePKCECodeChallenge: async () => 'test-code-challenge',
  randomState: () => 'test-state',
  randomNonce: () => 'test-nonce',
  buildAuthorizationUrl: (...args: unknown[]) => buildAuthorizationUrlMock(...args),
  authorizationCodeGrant: (...args: unknown[]) => authorizationCodeGrantMock(...args),
  fetchUserInfo: (...args: unknown[]) => fetchUserInfoMock(...args),
}));

describe('lib/oidc', () => {
  let oidc: typeof import('./oidc.js');

  beforeEach(async () => {
    vi.resetModules();
    discoveryMock.mockReset();
    buildAuthorizationUrlMock.mockReset();
    authorizationCodeGrantMock.mockReset();
    fetchUserInfoMock.mockReset();

    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    discoveryMock.mockResolvedValue({ __fakeConfig: true });
    buildAuthorizationUrlMock.mockReturnValue(new URL('https://accounts.google.com/o/oauth2/auth?mock=1'));

    oidc = await import('./oidc.js');
  });

  describe('buildGoogleAuthorizationUrl', () => {
    it('requests only the minimal openid/email/profile scope, with PKCE + state + nonce', async () => {
      const { url, flow } = await oidc.buildGoogleAuthorizationUrl();

      expect(url).toContain('accounts.google.com');
      expect(flow).toEqual({ state: 'test-state', nonce: 'test-nonce', codeVerifier: 'test-code-verifier' });
      expect(buildAuthorizationUrlMock).toHaveBeenCalledWith(
        { __fakeConfig: true },
        expect.objectContaining({
          scope: 'openid email profile',
          code_challenge: 'test-code-challenge',
          code_challenge_method: 'S256',
          state: 'test-state',
          nonce: 'test-nonce',
        })
      );
    });

    it('throws instead of silently degrading when Google credentials are absent', async () => {
      vi.resetModules();
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      const unconfigured = await import('./oidc.js');

      await expect(unconfigured.buildGoogleAuthorizationUrl()).rejects.toThrow(/GOOGLE_CLIENT_ID/);
      expect(discoveryMock).not.toHaveBeenCalled();
    });
  });

  describe('handleGoogleCallback', () => {
    const flow = { state: 'test-state', nonce: 'test-nonce', codeVerifier: 'test-code-verifier' };

    it('returns the identity when the exchange and id_token validation succeed', async () => {
      authorizationCodeGrantMock.mockResolvedValue({
        access_token: 'access-token',
        claims: () => ({ sub: 'google-sub-1' }),
      });
      fetchUserInfoMock.mockResolvedValue({ email: 'user@example.com', email_verified: true, name: 'Test User' });

      const identity = await oidc.handleGoogleCallback(
        new URL('https://app.example.com/callback?code=abc&state=test-state'),
        flow
      );

      expect(identity).toEqual({
        providerAccountId: 'google-sub-1',
        email: 'user@example.com',
        emailVerified: true,
        name: 'Test User',
      });
      expect(authorizationCodeGrantMock).toHaveBeenCalledWith(
        { __fakeConfig: true },
        expect.any(URL),
        expect.objectContaining({ pkceCodeVerifier: 'test-code-verifier', expectedState: 'test-state', expectedNonce: 'test-nonce' })
      );
    });

    it('propagates a state/nonce mismatch instead of swallowing it', async () => {
      authorizationCodeGrantMock.mockRejectedValue(new Error('state mismatch'));

      await expect(
        oidc.handleGoogleCallback(new URL('https://app.example.com/callback?code=abc&state=wrong'), flow)
      ).rejects.toThrow('state mismatch');
    });

    it('rejects an id_token without a sub claim', async () => {
      authorizationCodeGrantMock.mockResolvedValue({ access_token: 'x', claims: () => ({}) });

      await expect(
        oidc.handleGoogleCallback(new URL('https://app.example.com/callback?code=abc&state=test-state'), flow)
      ).rejects.toThrow(/sub/);
      expect(fetchUserInfoMock).not.toHaveBeenCalled();
    });
  });
});
