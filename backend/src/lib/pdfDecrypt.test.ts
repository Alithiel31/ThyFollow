// src/lib/pdfDecrypt.test.ts
// Les fixtures sont fabriquées à la volée : `pdf-lib` crée un PDF, `qpdf
// --encrypt` le protège (le binaire qpdf est donc requis pour ces tests).
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';

const spawnCalls: string[][] = [];

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    spawn: ((cmd: string, args: string[], opts: never) => {
      spawnCalls.push(args);
      return actual.spawn(cmd, args, opts);
    }) as typeof actual.spawn,
  };
});

const { decryptPdf, InvalidPdfError, PdfPasswordRequiredError, PdfWrongPasswordError } = await import(
  './pdfDecrypt.js'
);

const PASSWORD = 's3cret-Pa$$ w0rd';
let plainPdf: Buffer;
let protectedPdf: Buffer;

beforeAll(async () => {
  const doc = await PDFDocument.create();
  doc.addPage().drawText('TSH 2.35 mUI/L');
  plainPdf = Buffer.from(await doc.save());

  const dir = mkdtempSync(path.join(tmpdir(), 'fixture-'));
  try {
    writeFileSync(path.join(dir, 'a.pdf'), plainPdf);
    execFileSync('qpdf', ['--encrypt', PASSWORD, 'owner-pw', '256', '--', path.join(dir, 'a.pdf'), path.join(dir, 'b.pdf')]);
    protectedPdf = readFileSync(path.join(dir, 'b.pdf'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('lib/pdfDecrypt', () => {
  it('returns an unprotected PDF unchanged', async () => {
    const out = await decryptPdf(plainPdf);
    expect(out.equals(plainPdf)).toBe(true);
  });

  it('decrypts a protected PDF with the right password', async () => {
    const out = await decryptPdf(protectedPdf, PASSWORD);
    expect(out.subarray(0, 4).toString()).toBe('%PDF');

    const dir = mkdtempSync(path.join(tmpdir(), 'check-'));
    try {
      const file = path.join(dir, 'out.pdf');
      writeFileSync(file, out);
      // qpdf --is-encrypted : code 2 = « non chiffré »
      expect(spawnSync('qpdf', ['--is-encrypted', file]).status).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws PdfPasswordRequiredError when no password is given', async () => {
    await expect(decryptPdf(protectedPdf)).rejects.toBeInstanceOf(PdfPasswordRequiredError);
  });

  it('throws PdfWrongPasswordError with a wrong password', async () => {
    await expect(decryptPdf(protectedPdf, 'nope')).rejects.toBeInstanceOf(PdfWrongPasswordError);
  });

  it('throws InvalidPdfError for a text file renamed .pdf', async () => {
    await expect(decryptPdf(Buffer.from('just some text'))).rejects.toBeInstanceOf(InvalidPdfError);
  });

  it('throws InvalidPdfError for a damaged file that has a PDF header', async () => {
    await expect(decryptPdf(Buffer.from('%PDF-1.7\ngarbage'))).rejects.toBeInstanceOf(InvalidPdfError);
  });

  it('never passes the password on the command line', async () => {
    spawnCalls.length = 0;
    await decryptPdf(protectedPdf, PASSWORD);
    expect(spawnCalls.length).toBeGreaterThan(0);
    for (const args of spawnCalls) {
      expect(args.join(' ')).not.toContain(PASSWORD);
    }
    expect(spawnCalls.some((args) => args.some((a) => a.startsWith('--password-file=')))).toBe(true);
  });

  it('leaves no temporary file behind (success and failure)', async () => {
    // TMPDIR privé : un répertoire partagé verrait aussi les fichiers créés en
    // parallèle par d'autres fichiers de tests (import de bilans).
    const previous = process.env.TMPDIR;
    const sandbox = mkdtempSync(path.join(tmpdir(), 'tmpdir-sandbox-'));
    process.env.TMPDIR = sandbox;
    try {
      await decryptPdf(protectedPdf, PASSWORD);
      await expect(decryptPdf(protectedPdf, 'nope')).rejects.toThrow();
      await expect(decryptPdf(Buffer.from('%PDF-1.7\ngarbage'))).rejects.toThrow();
      expect(readdirSync(sandbox)).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = previous;
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
