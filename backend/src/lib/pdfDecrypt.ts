// src/lib/pdfDecrypt.ts
// Déchiffre un PDF protégé par mot de passe (cas fréquent des bilans de
// laboratoire) pour en obtenir une copie lisible, qui sera ensuite rechiffrée
// au repos par nos soins (voir lib/crypto.ts). Utilise le binaire `qpdf`
// (installé dans l'image Docker) : les bibliothèques JS sachant seulement
// LIRE un PDF protégé (pdfjs) ne produisent pas de copie déchiffrée.
//
// Le mot de passe est transmis à qpdf par fichier temporaire (--password-file,
// mode 0600, supprimé dans un `finally`) et jamais en argument de ligne de
// commande, où il serait visible dans la liste des processus.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export class InvalidPdfError extends Error {
  constructor(message = 'Fichier PDF invalide') {
    super(message);
    this.name = 'InvalidPdfError';
  }
}
export class PdfPasswordRequiredError extends Error {
  constructor() {
    super('Ce PDF est protégé par un mot de passe');
    this.name = 'PdfPasswordRequiredError';
  }
}
export class PdfWrongPasswordError extends Error {
  constructor() {
    super('Mot de passe de PDF incorrect');
    this.name = 'PdfWrongPasswordError';
  }
}

const QPDF_TIMEOUT_MS = 30_000;

interface QpdfResult {
  code: number | null;
  stderr: string;
}

function runQpdf(args: string[]): Promise<QpdfResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('qpdf', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), QPDF_TIMEOUT_MS);
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

// Un vrai PDF commence par `%PDF-` dans son premier kilo-octet (tolérance
// de la spécification) ; protège contre un fichier quelconque renommé `.pdf`.
export function hasPdfSignature(data: Buffer): boolean {
  return data.subarray(0, 1024).includes('%PDF-');
}

// Retourne les octets d'un PDF lisible. PDF non protégé : renvoyé tel quel.
// PDF protégé : nécessite `password`, sinon PdfPasswordRequiredError ; un
// mot de passe erroné lève PdfWrongPasswordError.
export async function decryptPdf(data: Buffer, password?: string): Promise<Buffer> {
  if (!hasPdfSignature(data)) throw new InvalidPdfError();

  const dir = await mkdtemp(path.join(tmpdir(), 'thyrotrack-pdf-'));
  try {
    const input = path.join(dir, 'in.pdf');
    await writeFile(input, data, { mode: 0o600 });

    // qpdf --is-encrypted : 0 = chiffré ; 2 = non chiffré OU illisible. On
    // distingue ces deux cas par la présence de messages d'erreur.
    const probe = await runQpdf(['--is-encrypted', input]);
    if (probe.code === 2 && probe.stderr.trim() !== '') throw new InvalidPdfError();
    if (probe.code !== 0) return data;

    const output = path.join(dir, 'out.pdf');
    const args: string[] = [];
    if (password) {
      const passwordFile = path.join(dir, 'pw.txt');
      await writeFile(passwordFile, password, { mode: 0o600 });
      args.push(`--password-file=${passwordFile}`);
    }
    args.push('--decrypt', input, output);

    const result = await runQpdf(args);
    // 0 = succès ; 3 = succès avec avertissements (le fichier est écrit).
    if (result.code === 0 || result.code === 3) return await readFile(output);
    if (/invalid password/i.test(result.stderr)) {
      throw password ? new PdfWrongPasswordError() : new PdfPasswordRequiredError();
    }
    throw new InvalidPdfError();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
