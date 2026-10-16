// src/controllers/labImport.controller.test.ts
// Pipeline réel (qpdf, pdfjs, règles d'extraction, chiffrement) avec Prisma
// remplacé par un faux en mémoire et le LLM mocké. Les PDF sont fabriqués à
// la volée (pdf-lib + qpdf --encrypt) : aucune donnée réelle.
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const JWT_SECRET = 'test-secret-at-least-32-characters-long-ok';
const USER_ID = 'user-1';
const STORED_PASSWORD = 'stored-pw-123';
const PROVIDED_PASSWORD = 'fresh-pw-456';

interface DocRow { id: string; userId: string; labResultId: string | null; sha256: string; dataEnc: Buffer; filename: string; createdAt: Date; sizeBytes: number; keyVersion: number }
interface PwRow { id: string; userId: string; label: string; passwordEnc: string; keyVersion: number; lastUsedAt: Date | null }

let docs: DocRow[];
let pws: PwRow[];
let user: { name: string; email: string; birthDate: Date | null; profile: { aiExtractionConsentAt: Date | null } | null };
let seq = 0;

const prismaMock = {
  user: { findUnique: vi.fn(async () => user) },
  labDocument: {
    deleteMany: vi.fn(async ({ where }: { where: { userId: string; labResultId: null; createdAt: { lt: Date } } }) => {
      docs = docs.filter((d) => !(d.userId === where.userId && d.labResultId === null && d.createdAt < where.createdAt.lt));
      return { count: 0 };
    }),
    findUnique: vi.fn(async ({ where }: { where: { userId_sha256: { userId: string; sha256: string } } }) =>
      docs.find((d) => d.userId === where.userId_sha256.userId && d.sha256 === where.userId_sha256.sha256) ?? null
    ),
    create: vi.fn(async ({ data }: { data: Omit<DocRow, 'id' | 'createdAt' | 'labResultId'> }) => {
      const row = { id: `doc-${++seq}`, createdAt: new Date(), labResultId: null, ...data } as DocRow;
      docs.push(row);
      return row;
    }),
  },
  pdfPassword: {
    findMany: vi.fn(async () => pws),
    create: vi.fn(async ({ data }: { data: Omit<PwRow, 'id'> }) => {
      const row = { id: `pw-${++seq}`, ...data } as PwRow;
      pws.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<PwRow> }) => {
      Object.assign(pws.find((p) => p.id === where.id)!, data);
    }),
  },
  labResult: { findFirst: vi.fn(async () => null as { id: string } | null) },
};
vi.mock('../lib/prisma.js', () => ({ prisma: prismaMock }));

const llmMock = vi.fn();
vi.mock('../lib/labExtract/llm.js', () => ({ extractWithLlm: (...args: unknown[]) => llmMock(...args) }));

async function buildApp() {
  vi.resetModules();
  const { default: i18next, middleware } = await import('../lib/i18n.js');
  const { default: router } = await import('../routers/labResults.router.js');
  const { errorHandler } = await import('../middleware/errorHandler.js');
  const app = express();
  app.use(middleware.handle(i18next));
  app.use('/api/lab-results', router);
  app.use(errorHandler);
  return app;
}

const auth = () => `Bearer ${jwt.sign({ userId: USER_ID }, JWT_SECRET, { expiresIn: '1h' })}`;

async function makePdf(lines: string[], password?: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage();
  lines.forEach((t, i) => page.drawText(t, { x: 50, y: 750 - i * 20, size: 11, font }));
  const plain = Buffer.from(await doc.save());
  if (!password) return plain;
  const dir = mkdtempSync(path.join(tmpdir(), 'fx-'));
  try {
    writeFileSync(path.join(dir, 'a.pdf'), plain);
    execFileSync('qpdf', ['--encrypt', password, 'owner-pw', '256', '--', path.join(dir, 'a.pdf'), path.join(dir, 'b.pdf')]);
    return readFileSync(path.join(dir, 'b.pdf'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const bilan = (tag: string) => [`Biogroup ${tag}`, 'Prélevé le 12/03/2026', 'TSH ultrasensible 2,35 mUI/L', 'Ferritine 64 µg/L'];

beforeAll(() => {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.PDF_ENCRYPTION_KEY = 'd'.repeat(64);
});

beforeEach(() => {
  vi.clearAllMocks();
  docs = [];
  pws = [];
  seq = 0;
  user = { name: 'Élodie Dupont', email: 'e@example.com', birthDate: new Date(Date.UTC(1985, 2, 15)), profile: { aiExtractionConsentAt: null } };
  prismaMock.labResult.findFirst.mockResolvedValue(null);
});

async function storePassword(value: string) {
  vi.resetModules();
  const { encryptPdfSecret } = await import('../lib/crypto.js');
  pws.push({ id: 'pw-stored', userId: USER_ID, label: 'Biogroup', passwordEnc: encryptPdfSecret(value), keyVersion: 1, lastUsedAt: null });
}

describe('POST /api/lab-results/import', () => {
  it('traite un lot de 3 : non protégé, protégé (mot de passe mémorisé), protégé sans mot de passe', async () => {
    await storePassword(STORED_PASSWORD);
    const app = await buildApp();
    const res = await request(app)
      .post('/api/lab-results/import')
      .set('Authorization', auth())
      .attach('files', await makePdf(bilan('A')), 'a.pdf')
      .attach('files', await makePdf(bilan('B'), STORED_PASSWORD), 'b.pdf')
      .attach('files', await makePdf(bilan('C'), 'unknown-pw'), 'c.pdf');

    expect(res.status).toBe(200);
    expect(res.body.results.map((r: { status: string }) => r.status)).toEqual(['ready', 'ready', 'password_required']);
    expect(res.body.results[0].draft.values).toEqual({ tsh: 2.35, ferritin: 64 });
    expect(res.body.results[0].draft.date).toBe('2026-03-12');
    expect(res.body.results[0].draft.method).toBe('rules');
    // le PDF stocké est chiffré
    expect(docs).toHaveLength(2);
    expect(docs[0].dataEnc.includes(Buffer.from('%PDF'))).toBe(false);
  });

  it('essaie la date de naissance du profil comme mot de passe', async () => {
    const app = await buildApp();
    const res = await request(app)
      .post('/api/lab-results/import')
      .set('Authorization', auth())
      .attach('files', await makePdf(bilan('D'), '15031985'), 'd.pdf');
    expect(res.body.results[0].status).toBe('ready');
  });

  it('renvoie wrong_password pour un mot de passe fourni incorrect', async () => {
    const app = await buildApp();
    const res = await request(app)
      .post('/api/lab-results/import')
      .set('Authorization', auth())
      .field('password', 'nope')
      .attach('files', await makePdf(bilan('E'), 'real-pw'), 'e.pdf');
    expect(res.body.results[0].status).toBe('wrong_password');
  });

  it('rejette plus de 10 fichiers (400)', async () => {
    const app = await buildApp();
    const pdf = await makePdf(bilan('F'));
    let req = request(app).post('/api/lab-results/import').set('Authorization', auth());
    for (let i = 0; i < 11; i++) req = req.attach('files', pdf, `f${i}.pdf`);
    expect((await req).status).toBe(400);
  });

  it('marque too_large un fichier au-delà de la limite sans faire échouer le lot', async () => {
    process.env.PDF_IMPORT_MAX_BYTES = '20000';
    const app = await buildApp();
    const big = Buffer.concat([await makePdf(bilan('G')), Buffer.alloc(25_000, 0x20)]);
    const res = await request(app)
      .post('/api/lab-results/import')
      .set('Authorization', auth())
      .attach('files', big, 'big.pdf')
      .attach('files', await makePdf(bilan('H')), 'ok.pdf');
    delete process.env.PDF_IMPORT_MAX_BYTES;
    expect(res.status).toBe(200);
    expect(res.body.results.map((r: { status: string }) => r.status)).toEqual(['too_large', 'ready']);
  });

  it('marque invalid un faux PDF', async () => {
    const app = await buildApp();
    const res = await request(app)
      .post('/api/lab-results/import')
      .set('Authorization', auth())
      .attach('files', Buffer.from('juste du texte'), 'faux.pdf');
    expect(res.body.results[0].status).toBe('invalid');
  });

  it('marque duplicate un PDF déjà rattaché au carnet, et réutilise un brouillon non confirmé', async () => {
    const app = await buildApp();
    const pdf = await makePdf(bilan('I'));
    const first = await request(app).post('/api/lab-results/import').set('Authorization', auth()).attach('files', pdf, 'i.pdf');
    const docId = first.body.results[0].documentId;

    // brouillon encore non confirmé : réutilisé
    const again = await request(app).post('/api/lab-results/import').set('Authorization', auth()).attach('files', pdf, 'i.pdf');
    expect(again.body.results[0]).toMatchObject({ status: 'ready', documentId: docId });
    expect(docs).toHaveLength(1);

    // rattaché au carnet : duplicate
    docs[0].labResultId = 'lab-1';
    const third = await request(app).post('/api/lab-results/import').set('Authorization', auth()).attach('files', pdf, 'i.pdf');
    expect(third.body.results[0]).toMatchObject({ status: 'duplicate', duplicateOf: { labResultId: 'lab-1' } });
  });

  it('signale un résultat existant à la même date', async () => {
    prismaMock.labResult.findFirst.mockResolvedValue({ id: 'lab-9' });
    const app = await buildApp();
    const res = await request(app).post('/api/lab-results/import').set('Authorization', auth()).attach('files', await makePdf(bilan('J')), 'j.pdf');
    expect(res.body.results[0].possibleDuplicateOf).toEqual({ labResultId: 'lab-9' });
  });

  it('remember=true + bon mot de passe : une ligne chiffrée, sans le clair', async () => {
    const app = await buildApp();
    const res = await request(app)
      .post('/api/lab-results/import')
      .set('Authorization', auth())
      .field('password', PROVIDED_PASSWORD)
      .field('remember', 'true')
      .field('passwordLabel', 'Biogroup')
      .attach('files', await makePdf(bilan('K'), PROVIDED_PASSWORD), 'k.pdf');
    expect(res.body.results[0].status).toBe('ready');
    expect(pws).toHaveLength(1);
    expect(pws[0].label).toBe('Biogroup');
    expect(pws[0].passwordEnc).not.toContain(PROVIDED_PASSWORD);
    expect(JSON.stringify(res.body)).not.toContain(PROVIDED_PASSWORD);
  });

  it('remember=false ou mauvais mot de passe : rien n’est stocké', async () => {
    const app = await buildApp();
    await request(app).post('/api/lab-results/import').set('Authorization', auth())
      .field('password', PROVIDED_PASSWORD)
      .attach('files', await makePdf(bilan('L'), PROVIDED_PASSWORD), 'l.pdf');
    await request(app).post('/api/lab-results/import').set('Authorization', auth())
      .field('password', 'faux')
      .field('remember', 'true')
      .attach('files', await makePdf(bilan('M'), PROVIDED_PASSWORD), 'm.pdf');
    expect(pws).toHaveLength(0);
  });

  it('supprime les brouillons de plus de 24 h', async () => {
    docs.push({ id: 'old', userId: USER_ID, labResultId: null, sha256: 'x', dataEnc: Buffer.alloc(1), filename: 'o.pdf', createdAt: new Date(Date.now() - 25 * 3600 * 1000), sizeBytes: 1, keyVersion: 1 });
    docs.push({ id: 'linked', userId: USER_ID, labResultId: 'lab-1', sha256: 'y', dataEnc: Buffer.alloc(1), filename: 'l.pdf', createdAt: new Date(Date.now() - 25 * 3600 * 1000), sizeBytes: 1, keyVersion: 1 });
    const app = await buildApp();
    await request(app).post('/api/lab-results/import').set('Authorization', auth()).attach('files', await makePdf(bilan('N')), 'n.pdf');
    expect(docs.map((d) => d.id)).not.toContain('old');
    expect(docs.map((d) => d.id)).toContain('linked');
  });

  it('PDF sans couche texte (scanné) : failed / no_text, rien de stocké', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const app = await buildApp();
    const res = await request(app).post('/api/lab-results/import').set('Authorization', auth())
      .attach('files', Buffer.from(await doc.save()), 'scan.pdf');
    expect(res.body.results[0]).toMatchObject({ status: 'failed', reason: 'no_text' });
    expect(docs).toHaveLength(0);
  });

  it('repli LLM : appelé seulement avec consentement et extraction insuffisante', async () => {
    llmMock.mockResolvedValue({
      ok: true,
      result: { date: '2026-03-12', dateConfidence: 'low', lab: 'Labo X', orderedBy: null, values: { tsh: 3.1 }, flags: [], insufficient: false },
    });
    const weak = ['Compte rendu sans marqueur reconnaissable pour les règles, texte assez long'];
    const app = await buildApp();

    await request(app).post('/api/lab-results/import').set('Authorization', auth()).attach('files', await makePdf([...weak, 'a']), 'w.pdf');
    expect(llmMock).toHaveBeenCalledTimes(0); // pas de consentement

    user.profile = { aiExtractionConsentAt: new Date() };
    const res = await request(app).post('/api/lab-results/import').set('Authorization', auth()).attach('files', await makePdf([...weak, 'b']), 'w2.pdf');
    expect(llmMock).toHaveBeenCalledTimes(1);
    expect(res.body.results[0].draft).toMatchObject({ method: 'llm', date: '2026-03-12', values: { tsh: 3.1 } });

    // extraction par règles suffisante : pas d'appel
    llmMock.mockClear();
    await request(app).post('/api/lab-results/import').set('Authorization', auth()).attach('files', await makePdf(bilan('P')), 'p.pdf');
    expect(llmMock).toHaveBeenCalledTimes(0);
  });

  it('501 sans PDF_ENCRYPTION_KEY', async () => {
    process.env.PDF_ENCRYPTION_KEY = '';
    const app = await buildApp();
    const res = await request(app).post('/api/lab-results/import').set('Authorization', auth()).attach('files', await makePdf(bilan('Q')), 'q.pdf');
    process.env.PDF_ENCRYPTION_KEY = 'd'.repeat(64);
    expect(res.status).toBe(501);
  });

  it('401 sans jeton', async () => {
    const app = await buildApp();
    expect((await request(app).post('/api/lab-results/import')).status).toBe(401);
  });

  it('aucune réponse ne contient le mot de passe mémorisé', async () => {
    await storePassword(STORED_PASSWORD);
    const app = await buildApp();
    const res = await request(app).post('/api/lab-results/import').set('Authorization', auth())
      .attach('files', await makePdf(bilan('R'), STORED_PASSWORD), 'r.pdf');
    expect(JSON.stringify(res.body)).not.toContain(STORED_PASSWORD);
    expect(res.body.results[0].status).toBe('ready');
    expect(pws[0].lastUsedAt).not.toBeNull();
  });
});
