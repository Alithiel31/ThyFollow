// src/controllers/pdfPasswords.controller.test.ts
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const JWT_SECRET = 'test-secret-at-least-32-characters-long-ok';
const ME = 'user-1';
const SECRET = 'my-lab-pw-9876';

interface Row { id: string; userId: string; label: string; passwordEnc: string; keyVersion: number; createdAt: Date; lastUsedAt: Date | null }
let rows: Row[];
let profile: { userId: string; aiExtractionConsentAt: Date | null; aiExtractionAlways: boolean } | null;
let seq = 0;

const pick = (r: Row, select?: Record<string, boolean>) =>
  select ? Object.fromEntries(Object.keys(select).map((k) => [k, r[k as keyof Row]])) : r;

const prismaMock = {
  pdfPassword: {
    findMany: vi.fn(async ({ where, select }: { where: { userId: string }; select?: Record<string, boolean> }) =>
      rows.filter((r) => r.userId === where.userId).map((r) => pick(r, select))
    ),
    findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) =>
      rows.find((r) => r.id === where.id && r.userId === where.userId) ?? null
    ),
    create: vi.fn(async ({ data, select }: { data: Omit<Row, 'id' | 'createdAt' | 'lastUsedAt'>; select?: Record<string, boolean> }) => {
      const row: Row = { id: `pw-${++seq}`, createdAt: new Date(), lastUsedAt: null, ...data };
      rows.push(row);
      return pick(row, select);
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      rows = rows.filter((r) => r.id !== where.id);
    }),
    deleteMany: vi.fn(async ({ where }: { where: { userId: string } }) => {
      const before = rows.length;
      rows = rows.filter((r) => r.userId !== where.userId);
      return { count: before - rows.length };
    }),
  },
  userProfile: {
    findUnique: vi.fn(async () => profile),
    upsert: vi.fn(async ({ create, update }: { create: NonNullable<typeof profile>; update: Partial<NonNullable<typeof profile>> }) => {
      profile = profile ? { ...profile, ...update } : create;
      return profile;
    }),
  },
};
vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }));

// La vérification de la version de session en base (lib/session.ts) est
// couverte par auth.controller.test.ts : ici, seule la signature du JWT compte.
vi.mock('../lib/session.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/session.js')>()),
  verifySessionToken: async (token: string) => {
    try {
      return (jwt.verify(token, JWT_SECRET) as { userId: string }).userId;
    } catch {
      return null;
    }
  },
}));

async function buildApp() {
  vi.resetModules();
  const { default: i18next, middleware } = await import('../lib/i18n.js');
  const { default: passwordsRouter } = await import('../routers/pdfPasswords.router.js');
  const { default: profileRouter } = await import('../routers/profile.router.js');
  const { errorHandler } = await import('../middleware/errorHandler.js');
  const app = express();
  app.use(express.json());
  app.use(middleware.handle(i18next));
  app.use('/api/pdf-passwords', passwordsRouter);
  app.use('/api/profile', profileRouter);
  app.use(errorHandler);
  return app;
}

const token = (userId: string) => `Bearer ${jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' })}`;

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.PDF_ENCRYPTION_KEY = 'e'.repeat(64);
});

beforeEach(() => {
  vi.clearAllMocks();
  rows = [];
  profile = null;
  seq = 0;
});

describe('/api/pdf-passwords', () => {
  it('la liste ne contient ni passwordEnc ni le mot de passe en clair', async () => {
    const app = await buildApp();
    await request(app).post('/api/pdf-passwords').set('Authorization', token(ME)).send({ label: 'Biogroup', password: SECRET });
    const res = await request(app).get('/api/pdf-passwords').set('Authorization', token(ME));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(Object.keys(res.body[0]).sort()).toEqual(['createdAt', 'id', 'label', 'lastUsedAt']);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
    expect(rows[0].passwordEnc).not.toContain(SECRET);
  });

  it('la création ne renvoie pas non plus le secret, et valide l’entrée', async () => {
    const app = await buildApp();
    const created = await request(app).post('/api/pdf-passwords').set('Authorization', token(ME)).send({ label: 'Cerba', password: SECRET });
    expect(created.status).toBe(201);
    expect(JSON.stringify(created.body)).not.toContain(SECRET);
    const bad = await request(app).post('/api/pdf-passwords').set('Authorization', token(ME)).send({ label: '', password: '' });
    expect(bad.status).toBe(400);
  });

  it('501 à la création sans PDF_ENCRYPTION_KEY', async () => {
    process.env.PDF_ENCRYPTION_KEY = '';
    const app = await buildApp();
    const res = await request(app).post('/api/pdf-passwords').set('Authorization', token(ME)).send({ label: 'X', password: 'y' });
    process.env.PDF_ENCRYPTION_KEY = 'e'.repeat(64);
    expect(res.status).toBe(501);
  });

  it('suppression unitaire et « tout révoquer » vident la liste de l’utilisateur sans toucher celle d’un autre', async () => {
    const app = await buildApp();
    for (const [user, label] of [[ME, 'A'], [ME, 'B'], ['user-2', 'C']] as const) {
      await request(app).post('/api/pdf-passwords').set('Authorization', token(user)).send({ label, password: 'pw' });
    }
    const [first] = rows.filter((r) => r.userId === ME);
    expect((await request(app).delete(`/api/pdf-passwords/${first.id}`).set('Authorization', token(ME))).status).toBe(200);
    expect(rows.filter((r) => r.userId === ME)).toHaveLength(1);

    const all = await request(app).delete('/api/pdf-passwords').set('Authorization', token(ME));
    expect(all.body).toEqual({ success: true, deleted: 1 });
    expect(rows.filter((r) => r.userId === ME)).toHaveLength(0);
    expect(rows.filter((r) => r.userId === 'user-2')).toHaveLength(1);
  });

  it('l’id d’un autre utilisateur → 404 et rien n’est supprimé', async () => {
    const app = await buildApp();
    await request(app).post('/api/pdf-passwords').set('Authorization', token('user-2')).send({ label: 'C', password: 'pw' });
    const res = await request(app).delete(`/api/pdf-passwords/${rows[0].id}`).set('Authorization', token(ME));
    expect(res.status).toBe(404);
    expect(rows).toHaveLength(1);
  });

  it('401 sans jeton', async () => {
    const app = await buildApp();
    expect((await request(app).get('/api/pdf-passwords')).status).toBe(401);
  });
});

describe('PUT /api/profile/ai-extraction-consent', () => {
  it('consent:true pose une date, consent:false la remet à null', async () => {
    const app = await buildApp();
    const on = await request(app).put('/api/profile/ai-extraction-consent').set('Authorization', token(ME)).send({ consent: true });
    expect(on.status).toBe(200);
    expect(new Date(on.body.aiExtractionConsentAt).getTime()).toBeGreaterThan(Date.now() - 5000);
    expect(profile?.aiExtractionConsentAt).toBeInstanceOf(Date);

    const off = await request(app).put('/api/profile/ai-extraction-consent').set('Authorization', token(ME)).send({ consent: false });
    expect(off.body.aiExtractionConsentAt).toBeNull();
    expect(profile?.aiExtractionConsentAt).toBeNull();
  });

  it('« always » : activé avec le consentement, conservé si on ne le renvoie pas, désactivé avec le consentement', async () => {
    const app = await buildApp();
    const put = (body: object) => request(app).put('/api/profile/ai-extraction-consent').set('Authorization', token(ME)).send(body);

    expect((await put({ consent: true, always: true })).body.aiExtractionAlways).toBe(true);
    const since = profile?.aiExtractionConsentAt;
    // même consentement, « always » non renvoyé : conservé, et la date de consentement ne bouge pas
    const again = await put({ consent: true });
    expect(again.body.aiExtractionAlways).toBe(true);
    expect(profile?.aiExtractionConsentAt).toEqual(since);
    // retrait du consentement : « always » retombe à false
    const off = await put({ consent: false });
    expect(off.body).toEqual({ aiExtractionConsentAt: null, aiExtractionAlways: false });
    expect(profile?.aiExtractionAlways).toBe(false);
  });

  it('« always » sans consentement reste false', async () => {
    const app = await buildApp();
    const res = await request(app).put('/api/profile/ai-extraction-consent').set('Authorization', token(ME)).send({ consent: false, always: true });
    expect(res.body.aiExtractionAlways).toBe(false);
  });

  it('refuse un corps invalide', async () => {
    const app = await buildApp();
    const res = await request(app).put('/api/profile/ai-extraction-consent').set('Authorization', token(ME)).send({ consent: 'oui' });
    expect(res.status).toBe(400);
  });
});

describe('messages d’erreur traduits', () => {
  it('404 sur un mot de passe inconnu : libellé de ressource traduit', async () => {
    const app = await buildApp();
    const fr = await request(app).delete('/api/pdf-passwords/inconnu').set('Authorization', token(ME));
    const en = await request(app).delete('/api/pdf-passwords/inconnu?lng=en').set('Authorization', token(ME));
    expect(fr.body.error).toBe('Mot de passe introuvable');
    expect(en.body.error).toMatch(/Password .*not found|not found/i);
    expect(en.body.error).not.toContain('resources.');
  });
});
