// src/controllers/oidc.controller.test.ts
// Tests d'intégration légers du flow "Se connecter avec Google" : montent le
// vrai routeur/middlewares Express (auth.router.ts, errorHandler, i18n) sur
// une app de test, mais mockent `openid-client` (via lib/oidc.js) et Prisma
// — aucun appel réseau réel vers Google, aucune base de données requise.
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  oAuthAccount: { findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  authEvent: { create: vi.fn() },
};
// Transaction interactive : le callback reçoit le même client simulé
Object.assign(prismaMock, { $transaction: vi.fn(async (fn: (tx: typeof prismaMock) => Promise<unknown>) => fn(prismaMock)) });

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }));

const buildGoogleAuthorizationUrlMock = vi.fn();
const handleGoogleCallbackMock = vi.fn();

vi.mock('../lib/oidc.js', () => ({
  buildGoogleAuthorizationUrl: (...args: unknown[]) => buildGoogleAuthorizationUrlMock(...args),
  handleGoogleCallback: (...args: unknown[]) => handleGoogleCallbackMock(...args),
}));

const JWT_SECRET = 'test-secret-at-least-32-characters-long-ok';
const APP_URL = 'https://app.example.com';

// Reconstruit l'app (et réimporte tout le graphe de modules dépendant de
// config.js) après chaque changement de variables d'environnement : config.js
// lit `process.env` à l'import, donc un import statique classique verrait
// toujours la valeur figée au premier chargement du fichier de test.
async function buildApp() {
  vi.resetModules();
  const { default: i18next, middleware } = await import('../lib/i18n.js');
  const { default: authRouter } = await import('../routers/auth.router.js');
  const { errorHandler } = await import('../middleware/errorHandler.js');

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(middleware.handle(i18next));
  app.use('/api/auth', authRouter);
  app.use(errorHandler);
  return app;
}

function signToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });
}

// Cookie de flux tel que le poserait le serveur : JSON signé (lib/signedCookie.ts).
// À appeler après buildApp(), pour que config.js voie le JWT_SECRET du test.
async function flowCookie(name: string, flow: object): Promise<string> {
  const { signCookieValue } = await import('../lib/signedCookie.js');
  return `${name}=${encodeURIComponent(signCookieValue(JSON.stringify(flow)))}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.APP_URL = APP_URL;
  process.env.GOOGLE_REDIRECT_URI = 'https://api.example.com/api/auth/oidc/google/callback';
});

describe('googleAuthorize', () => {
  it('responds 501 when Google credentials are not configured', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    const app = await buildApp();

    const res = await request(app).get('/api/auth/oidc/google');

    expect(res.status).toBe(501);
  });

  it('redirects to Google and sets the httpOnly flow cookie when configured', async () => {
    buildGoogleAuthorizationUrlMock.mockResolvedValue({
      url: 'https://accounts.google.com/o/oauth2/auth?mock=1',
      flow: { state: 's', nonce: 'n', codeVerifier: 'c' },
    });
    const app = await buildApp();

    const res = await request(app).get('/api/auth/oidc/google');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://accounts.google.com/o/oauth2/auth?mock=1');
    const cookieHeader = res.headers['set-cookie']?.[0] ?? '';
    expect(cookieHeader).toContain('thyro_oidc_google=');
    expect(cookieHeader).toContain('HttpOnly');
  });
});

describe('googleCallback — login flow', () => {
  it('redirects to /login?googleError=1 instead of leaking raw JSON when the flow cookie is missing/expired', async () => {
    const app = await buildApp();

    const res = await request(app).get('/api/auth/oidc/google/callback?state=test-state');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${APP_URL}/login?googleError=1`);
    expect(prismaMock.authEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'LOGIN_FAILED', userId: null }) })
    );
  });

  it('redirects to /login?googleError=1 when the state/nonce validation rejects', async () => {
    handleGoogleCallbackMock.mockRejectedValue(new Error('state mismatch'));
    const app = await buildApp();
    const flow = { state: 'test-state', nonce: 'test-nonce', codeVerifier: 'verifier' };

    const res = await request(app)
      .get('/api/auth/oidc/google/callback?code=abc&state=wrong')
      .set('Cookie', [await flowCookie('thyro_oidc_google', flow)]);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${APP_URL}/login?googleError=1`);
  });

  it('creates a new account, then the one-time exchange code can be used exactly once', async () => {
    handleGoogleCallbackMock.mockResolvedValue({
      providerAccountId: 'google-sub-1',
      email: 'new@example.com',
      emailVerified: true,
      name: 'New User',
    });
    prismaMock.oAuthAccount.findUnique.mockResolvedValue(null);
    // 1er appel : recherche par email (aucun compte) ; ensuite : relecture de
    // la version de session au moment de l'échange du code.
    prismaMock.user.findUnique.mockResolvedValueOnce(null).mockResolvedValue({ id: 'user-123', tokenVersion: 0 });
    prismaMock.user.create.mockResolvedValue({ id: 'user-123' });

    const app = await buildApp();
    const flow = { state: 'test-state', nonce: 'test-nonce', codeVerifier: 'verifier' };

    const res = await request(app)
      .get('/api/auth/oidc/google/callback?code=abc&state=test-state')
      .set('Cookie', [await flowCookie('thyro_oidc_google', flow)]);

    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.origin + location.pathname).toBe(`${APP_URL}/oauth/callback`);
    // Le JWT lui-même ne doit jamais apparaître dans l'URL de redirection.
    expect(location.searchParams.has('token')).toBe(false);
    const code = location.searchParams.get('code');
    expect(code).toBeTruthy();
    expect(prismaMock.authEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'LOGIN_SUCCESS', userId: 'user-123' }) })
    );

    const first = await request(app).post('/api/auth/oidc/exchange').send({ code });
    expect(first.status).toBe(200);
    const decoded = jwt.verify(first.body.token, JWT_SECRET) as { userId: string; tv: number };
    expect(decoded).toMatchObject({ userId: 'user-123', tv: 0 });

    // Usage unique : la seconde tentative avec le même code échoue.
    const second = await request(app).post('/api/auth/oidc/exchange').send({ code });
    expect(second.status).toBe(400);
  });

  it('linking an unverified pre-existing account wipes its password and marks the email verified (pre-account hijacking)', async () => {
    handleGoogleCallbackMock.mockResolvedValue({
      providerAccountId: 'google-sub-victim',
      email: 'victim@example.com',
      emailVerified: true,
      name: 'Victim',
    });
    prismaMock.oAuthAccount.findUnique.mockResolvedValue(null);
    // Compte créé par un tiers avec l'email de la victime, jamais vérifié
    prismaMock.user.findUnique.mockResolvedValue({ id: 'pre-created', emailVerified: false, password: 'attacker-hash' });

    const app = await buildApp();
    const flow = { state: 'test-state', nonce: 'test-nonce', codeVerifier: 'verifier' };
    const res = await request(app)
      .get('/api/auth/oidc/google/callback?code=abc&state=test-state')
      .set('Cookie', [await flowCookie('thyro_oidc_google', flow)]);

    expect(res.status).toBe(302);
    expect(prismaMock.oAuthAccount.create).toHaveBeenCalledWith({
      data: { provider: 'google', providerAccountId: 'google-sub-victim', userId: 'pre-created' },
    });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'pre-created' },
      data: expect.objectContaining({ emailVerified: true, password: null, resetToken: null, verificationToken: null, tokenVersion: { increment: 1 } }),
    });
  });

  it('linking a verified pre-existing account keeps its password', async () => {
    handleGoogleCallbackMock.mockResolvedValue({
      providerAccountId: 'google-sub-owner',
      email: 'owner@example.com',
      emailVerified: true,
      name: 'Owner',
    });
    prismaMock.oAuthAccount.findUnique.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'owner-id', emailVerified: true, password: 'owner-hash' });

    const app = await buildApp();
    const flow = { state: 'test-state', nonce: 'test-nonce', codeVerifier: 'verifier' };
    await request(app)
      .get('/api/auth/oidc/google/callback?code=abc&state=test-state')
      .set('Cookie', [await flowCookie('thyro_oidc_google', flow)]);

    expect(prismaMock.oAuthAccount.create).toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('does not auto-link to an existing account when Google has not verified the email', async () => {
    handleGoogleCallbackMock.mockResolvedValue({
      providerAccountId: 'google-sub-2',
      email: 'victim@example.com',
      emailVerified: false,
      name: 'Unverified Name',
    });
    prismaMock.oAuthAccount.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 'new-user-id' });

    const app = await buildApp();
    const flow = { state: 'test-state', nonce: 'test-nonce', codeVerifier: 'verifier' };

    const res = await request(app)
      .get('/api/auth/oidc/google/callback?code=abc&state=test-state')
      .set('Cookie', [await flowCookie('thyro_oidc_google', flow)]);

    expect(res.status).toBe(302);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.user.create).toHaveBeenCalled();
  });
});

describe('googleCallback — link flow', () => {
  it('redirects with googleLinkError=conflict when the Google account is already linked to another user', async () => {
    handleGoogleCallbackMock.mockResolvedValue({
      providerAccountId: 'google-sub-3',
      email: 'someone@example.com',
      emailVerified: true,
      name: 'Someone',
    });
    prismaMock.oAuthAccount.findUnique.mockResolvedValue({ userId: 'other-user-id' });

    const app = await buildApp();
    const linkFlow = { state: 'test-state', nonce: 'test-nonce', codeVerifier: 'verifier', userId: 'current-user-id' };

    const res = await request(app)
      .get('/api/auth/oidc/google/callback?code=abc&state=test-state')
      .set('Cookie', [await flowCookie('thyro_oidc_google_link', linkFlow)]);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${APP_URL}/profile?googleLinkError=conflict`);
  });

  it('redirects with googleLinked=1 on a fresh link', async () => {
    handleGoogleCallbackMock.mockResolvedValue({
      providerAccountId: 'google-sub-4',
      email: 'someone@example.com',
      emailVerified: true,
      name: 'Someone',
    });
    prismaMock.oAuthAccount.findUnique.mockResolvedValue(null);
    prismaMock.oAuthAccount.create.mockResolvedValue({});

    const app = await buildApp();
    const linkFlow = { state: 'test-state', nonce: 'test-nonce', codeVerifier: 'verifier', userId: 'current-user-id' };

    const res = await request(app)
      .get('/api/auth/oidc/google/callback?code=abc&state=test-state')
      .set('Cookie', [await flowCookie('thyro_oidc_google_link', linkFlow)]);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${APP_URL}/profile?googleLinked=1`);
  });

  it('rejects a link cookie whose userId was edited (account takeover attempt)', async () => {
    handleGoogleCallbackMock.mockResolvedValue({
      providerAccountId: 'google-sub-attacker',
      email: 'attacker@example.com',
      emailVerified: true,
      name: 'Attacker',
    });
    prismaMock.oAuthAccount.findUnique.mockResolvedValue(null);

    const app = await buildApp();
    const { signCookieValue } = await import('../lib/signedCookie.js');
    const genuine = signCookieValue(
      JSON.stringify({ state: 'test-state', nonce: 'test-nonce', codeVerifier: 'verifier', userId: 'attacker-id' })
    );
    // On garde la signature d'origine mais on remplace l'id par celui de la victime.
    const tampered = genuine.replace('attacker-id', 'victim-id');

    const res = await request(app)
      .get('/api/auth/oidc/google/callback?code=abc&state=test-state')
      .set('Cookie', [`thyro_oidc_google_link=${encodeURIComponent(tampered)}`]);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${APP_URL}/profile?googleLinkError=1`);
    expect(handleGoogleCallbackMock).not.toHaveBeenCalled();
    expect(prismaMock.oAuthAccount.create).not.toHaveBeenCalled();
  });

  it('rejects an unsigned link cookie', async () => {
    const app = await buildApp();
    const linkFlow = { state: 'test-state', nonce: 'test-nonce', codeVerifier: 'verifier', userId: 'victim-id' };

    const res = await request(app)
      .get('/api/auth/oidc/google/callback?code=abc&state=test-state')
      .set('Cookie', [`thyro_oidc_google_link=${encodeURIComponent(JSON.stringify(linkFlow))}`]);

    expect(res.headers.location).toBe(`${APP_URL}/profile?googleLinkError=1`);
    expect(prismaMock.oAuthAccount.create).not.toHaveBeenCalled();
  });
});

describe('googleUnlink', () => {
  it('refuses to unlink when the account has no local password (anti-lockout guard)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ password: null, tokenVersion: 0 });
    const app = await buildApp();

    const res = await request(app)
      .delete('/api/auth/oidc/google/link')
      .set('Authorization', `Bearer ${signToken('user-1')}`);

    expect(res.status).toBe(409);
    expect(prismaMock.oAuthAccount.deleteMany).not.toHaveBeenCalled();
  });

  it('unlinks and records an UNLINKED event when the account has a local password', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ password: 'hashed', tokenVersion: 0 });
    prismaMock.oAuthAccount.deleteMany.mockResolvedValue({ count: 1 });
    const app = await buildApp();

    const res = await request(app)
      .delete('/api/auth/oidc/google/link')
      .set('Authorization', `Bearer ${signToken('user-1')}`);

    expect(res.status).toBe(200);
    expect(prismaMock.authEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'UNLINKED', userId: 'user-1' }) })
    );
  });
});
