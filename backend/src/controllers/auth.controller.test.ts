// src/controllers/auth.controller.test.ts
// Tests d'intégration légers du flow email/mot de passe (register, login,
// vérification d'email, mot de passe oublié/réinitialisé, /me) : montent le
// vrai routeur/middlewares Express (auth.router.ts, errorHandler, i18n) sur
// une app de test, mais mockent Prisma et l'envoi d'email (lib/resend.js) —
// aucun appel réseau ni base de données réels.
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = {
  user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
};

vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }));

const sendVerificationEmailMock = vi.fn();
const sendResetPasswordEmailMock = vi.fn();

vi.mock('../lib/resend.js', () => ({
  sendVerificationEmail: (...args: unknown[]) => sendVerificationEmailMock(...args),
  sendResetPasswordEmail: (...args: unknown[]) => sendResetPasswordEmailMock(...args),
}));

const JWT_SECRET = 'test-secret-at-least-32-characters-long-ok';

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

function signToken(userId: string, tv?: number): string {
  return jwt.sign({ userId, ...(tv !== undefined && { tv }) }, JWT_SECRET, { expiresIn: '1h' });
}

// Empreinte SHA-256 de 'good-token' (valeur de référence fixe : les tests ne
// hachent rien eux-mêmes, ils vérifient l'aller-retour avec le contrôleur).
const GOOD_TOKEN_SHA256 = '461caa80a52104436e34006189430d13aba103b2c4344d446ea3d9324b0de1c0';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.APP_URL = 'https://app.example.com';
});

describe('register', () => {
  it('creates an unverified account, hashes the password, and sends a verification email', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 'user-1', email: 'new@example.com', name: 'New User' });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@example.com', password: 'password123', name: 'New User' });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeUndefined();
    const createArgs = prismaMock.user.create.mock.calls[0][0];
    expect(createArgs.data.password).not.toBe('password123');
    expect(await bcrypt.compare('password123', createArgs.data.password)).toBe(true);
    expect(sendVerificationEmailMock).toHaveBeenCalledOnce();
  });

  it('stores only the SHA-256 of the verification token, and emails the raw token', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({ id: 'user-1', email: 'new@example.com', name: 'New User' });
    const app = await buildApp();

    await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@example.com', password: 'password123', name: 'New User' });

    const emailedToken = sendVerificationEmailMock.mock.calls[0][2] as string;
    const stored = prismaMock.user.create.mock.calls[0][0].data.verificationToken;
    expect(stored).not.toBe(emailedToken);
    expect(stored).toMatch(/^[0-9a-f]{64}$/);

    // Aller-retour : le jeton reçu par email retrouve exactement l'empreinte stockée.
    prismaMock.user.findUnique.mockResolvedValue(null);
    await request(app).post('/api/auth/verify-email').send({ token: emailedToken });
    expect(prismaMock.user.findUnique).toHaveBeenLastCalledWith({ where: { verificationToken: stored } });
  });

  it('rejects registration with a 409 when the email is already used', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'existing' });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'taken@example.com', password: 'password123', name: 'Someone' });

    expect(res.status).toBe(409);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than 8 characters before touching the database', async () => {
    const app = await buildApp();

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'short@example.com', password: 'short', name: 'Someone' });

    expect(res.status).toBe(400);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('login', () => {
  it('rejects unknown emails with a generic 401 (no account enumeration)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const app = await buildApp();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever1' });

    expect(res.status).toBe(401);
  });

  it('rejects login for a Google-only account (no local password) with the same generic 401', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', password: null, emailVerified: true });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'google@example.com', password: 'whatever1' });

    expect(res.status).toBe(401);
  });

  it('rejects an incorrect password', async () => {
    const hashed = await bcrypt.hash('correct-password', 12);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', password: hashed, emailVerified: true });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'wrong-password' });

    expect(res.status).toBe(401);
  });

  it('rejects login before the email is verified', async () => {
    const hashed = await bcrypt.hash('correct-password', 12);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', password: hashed, emailVerified: false });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'correct-password' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('logs in and returns a valid JWT on correct credentials', async () => {
    const hashed = await bcrypt.hash('correct-password', 12);
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      role: 'USER',
      password: hashed,
      emailVerified: true,
      tokenVersion: 3,
    });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'correct-password' });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe('user-1');
    const decoded = jwt.verify(res.body.token, JWT_SECRET) as { userId: string; tv: number };
    expect(decoded).toMatchObject({ userId: 'user-1', tv: 3 });
  });
});

describe('verifyEmail', () => {
  it('rejects an unknown token', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const app = await buildApp();

    const res = await request(app).post('/api/auth/verify-email').send({ token: 'bad-token' });

    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('rejects a token past its expiry date', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      verificationTokenExpiresAt: new Date(Date.now() - 1000),
    });
    const app = await buildApp();

    const res = await request(app).post('/api/auth/verify-email').send({ token: 'expired-token' });

    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('activates the account and returns a session token', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      verificationTokenExpiresAt: new Date(Date.now() + 60_000),
    });
    prismaMock.user.update.mockResolvedValue({ id: 'user-1', email: 'user@example.com', name: 'User', role: 'USER', tokenVersion: 0 });
    const app = await buildApp();

    const res = await request(app).post('/api/auth/verify-email').send({ token: 'good-token' });

    expect(res.status).toBe(200);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { verificationToken: GOOD_TOKEN_SHA256 } });
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.tokenVersion).toBeUndefined();
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ emailVerified: true, verificationToken: null }) })
    );
  });
});

describe('resendVerification', () => {
  it('returns the same generic message whether the account exists or not (no enumeration)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const app = await buildApp();

    const res = await request(app).post('/api/auth/resend-verification').send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(sendVerificationEmailMock).not.toHaveBeenCalled();
  });

  it('resends only when the account exists and is not yet verified', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      emailVerified: false,
    });
    prismaMock.user.update.mockResolvedValue({});
    const app = await buildApp();

    const res = await request(app).post('/api/auth/resend-verification').send({ email: 'user@example.com' });

    expect(res.status).toBe(200);
    expect(sendVerificationEmailMock).toHaveBeenCalledOnce();
  });

  it('does not resend when the account is already verified', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'user@example.com', emailVerified: true });
    const app = await buildApp();

    const res = await request(app).post('/api/auth/resend-verification').send({ email: 'user@example.com' });

    expect(res.status).toBe(200);
    expect(sendVerificationEmailMock).not.toHaveBeenCalled();
  });
});

describe('forgotPassword', () => {
  it('returns the same generic message whether the account exists or not (no enumeration)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const app = await buildApp();

    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(sendResetPasswordEmailMock).not.toHaveBeenCalled();
  });

  it('sends a reset email when the account exists', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'user@example.com', name: 'User' });
    prismaMock.user.update.mockResolvedValue({});
    const app = await buildApp();

    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'user@example.com' });

    expect(res.status).toBe(200);
    expect(sendResetPasswordEmailMock).toHaveBeenCalledOnce();
    const emailedToken = sendResetPasswordEmailMock.mock.calls[0][2] as string;
    const stored = prismaMock.user.update.mock.calls[0][0].data.resetToken;
    expect(stored).not.toBe(emailedToken);
    expect(stored).toMatch(/^[0-9a-f]{64}$/);

    // Aller-retour : le jeton reçu par email retrouve exactement l'empreinte stockée.
    prismaMock.user.findUnique.mockResolvedValue(null);
    await request(app).post('/api/auth/reset-password').send({ token: emailedToken, password: 'newpassword1' });
    expect(prismaMock.user.findUnique).toHaveBeenLastCalledWith({ where: { resetToken: stored } });
  });
});

describe('resetPassword', () => {
  it('rejects an unknown or expired reset token', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const app = await buildApp();

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'bad-token', password: 'newpassword1' });

    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('updates the password and clears the reset token on success', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      resetTokenExpiresAt: new Date(Date.now() + 60_000),
    });
    prismaMock.user.update.mockResolvedValue({});
    const app = await buildApp();

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'good-token', password: 'newpassword1' });

    expect(res.status).toBe(200);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { resetToken: GOOD_TOKEN_SHA256 } });
    const updateArgs = prismaMock.user.update.mock.calls[0][0];
    expect(updateArgs.data.resetToken).toBeNull();
    expect(await bcrypt.compare('newpassword1', updateArgs.data.password)).toBe(true);
    // Toutes les sessions ouvertes avant la réinitialisation sont révoquées.
    expect(updateArgs.data.tokenVersion).toEqual({ increment: 1 });
  });
});

describe('me', () => {
  it('rejects requests without a token', async () => {
    const app = await buildApp();

    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
  });

  it('rejects an invalid token', async () => {
    const app = await buildApp();

    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-real-token');

    expect(res.status).toBe(401);
  });

  it('returns the current user for a valid token', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'user@example.com', name: 'User', role: 'USER', tokenVersion: 2 });
    const app = await buildApp();

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${signToken('user-1', 2)}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('user-1');
  });

  it('accepts a token issued before tokenVersion existed while the version is still 0', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', tokenVersion: 0 });
    const app = await buildApp();

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${signToken('user-1')}`);

    expect(res.status).toBe(200);
  });

  it('rejects a token revoked by a later session version bump (e.g. password reset)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', tokenVersion: 1 });
    const app = await buildApp();

    const stale = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${signToken('user-1', 0)}`);
    const legacy = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${signToken('user-1')}`);

    expect(stale.status).toBe(401);
    expect(legacy.status).toBe(401);
  });

  it('rejects the token of a deleted account', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const app = await buildApp();

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${signToken('deleted-user')}`);

    expect(res.status).toBe(401);
  });
});
