// src/controllers/labImport.controller.ts
// Import de bilans sanguins au format PDF : envoi (par lot) → déchiffrement
// éventuel → stockage chiffré → extraction → BROUILLON renvoyé au client, qui
// le fait relire à l'utilisateur avant confirmation (voir la suite du
// contrôleur pour la confirmation, le rejet et le téléchargement).
import { Request, Response } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { AuthRequest } from '../middleware/auth.js';
import { AppError, ValidationError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import {
  encryptBuffer,
  encryptPdfSecret,
  decryptPdfSecret,
  isPdfEncryptionConfigured,
} from '../lib/crypto.js';
import {
  decryptPdf,
  hasPdfSignature,
  InvalidPdfError,
  PdfPasswordRequiredError,
  PdfWrongPasswordError,
} from '../lib/pdfDecrypt.js';
import { extractPdfText } from '../lib/labExtract/pdfText.js';
import { parseLabText, type ParsedLabResult } from '../lib/labExtract/rules.js';
import { extractWithLlm } from '../lib/labExtract/llm.js';

// Texte minimal pour considérer qu'un PDF a une couche texte exploitable (en
// dessous : PDF scanné, l'OCR est hors périmètre).
const MIN_TEXT_CHARS = 20;
// Brouillons non confirmés : supprimés à l'import suivant au-delà de ce délai.
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export type ImportStatus =
  | 'ready'
  | 'password_required'
  | 'wrong_password'
  | 'invalid'
  | 'too_large'
  | 'duplicate'
  | 'failed';

export interface ImportFileResult {
  filename: string;
  status: ImportStatus;
  documentId?: string;
  // Présent pour `duplicate` : le résultat du carnet qui porte déjà ce PDF
  duplicateOf?: { labResultId: string };
  draft?: Omit<ParsedLabResult, 'insufficient'> & { insufficient: boolean; method: 'rules' | 'llm' };
  // Un résultat du carnet existe déjà à cette date (et ce labo) : l'utilisateur choisit
  possibleDuplicateOf?: { labResultId: string };
  reason?: string;
}

// Le plafond multer est volontairement plus haut que la limite métier : un
// fichier entre les deux est refusé individuellement (`too_large`) sans faire
// échouer tout le lot ; au-delà du plafond, c'est la requête entière (413).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.pdfImportMaxBytes * 2, files: config.pdfImportMaxFiles },
}).array('files');

function runUpload(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    upload(req, res, (err?: unknown) => {
      if (!err) return resolve();
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return reject(
            new AppError(413, req.t('errors.labImport.fileTooLarge', { defaultValue: 'Fichier trop volumineux' }))
          );
        }
        return reject(
          new ValidationError(
            req.t('errors.labImport.badUpload', {
              defaultValue: `Envoi invalide (maximum ${config.pdfImportMaxFiles} fichiers PDF)`,
            })
          )
        );
      }
      reject(err);
    });
  });
}

function sanitizeFilename(original: string): string {
  // Caractères de contrôle et interdits dans un nom de fichier → « _ »
  const base = Array.from(path.basename(original), (ch) =>
    ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 || '<>:"/\\|?*'.includes(ch) ? '_' : ch
  )
    .join('')
    .trim()
    .slice(0, 120);
  return base || 'bilan.pdf';
}

function birthDatePasswords(birthDate: Date | null | undefined): string[] {
  if (!birthDate) return [];
  const dd = String(birthDate.getUTCDate()).padStart(2, '0');
  const mm = String(birthDate.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(birthDate.getUTCFullYear());
  return [`${dd}${mm}${yyyy}`, `${dd}/${mm}/${yyyy}`, `${dd}${mm}${yyyy.slice(-2)}`];
}

interface PasswordCandidate {
  value: string;
  // Id du PdfPassword stocké (pour mettre à jour lastUsedAt), ou null
  storedId: string | null;
  source: 'provided' | 'stored' | 'birthdate';
}

// Déchiffre `buffer` en essayant, dans l'ordre : sans mot de passe, le mot
// de passe fourni, les mots de passe mémorisés, la date de naissance du profil.
async function unlock(
  buffer: Buffer,
  candidates: PasswordCandidate[]
): Promise<{ data: Buffer; used: PasswordCandidate | null } | 'password_required' | 'wrong_password'> {
  try {
    return { data: await decryptPdf(buffer), used: null };
  } catch (err) {
    if (!(err instanceof PdfPasswordRequiredError)) throw err;
  }
  for (const candidate of candidates) {
    try {
      return { data: await decryptPdf(buffer, candidate.value), used: candidate };
    } catch (err) {
      if (!(err instanceof PdfWrongPasswordError)) throw err;
    }
  }
  return candidates.some((c) => c.source === 'provided') ? 'wrong_password' : 'password_required';
}

async function extract(
  data: Buffer,
  user: { name: string; email: string; birthDate: Date | null; consent: boolean },
  forceAi: boolean
): Promise<{ draft: NonNullable<ImportFileResult['draft']> } | { noText: true }> {
  const text = await extractPdfText(data);
  if (text.replace(/\s/g, '').length < MIN_TEXT_CHARS) return { noText: true };

  const rules = parseLabText(text);
  let result: ParsedLabResult = rules;
  let method: 'rules' | 'llm' = 'rules';

  if ((rules.insufficient || forceAi) && user.consent) {
    const llm = await extractWithLlm(text, { ...user, consent: true });
    if (llm.ok) {
      // Les règles (locales, déterministes) priment ; le LLM complète ce qui manque.
      result = {
        date: rules.date ?? llm.result.date,
        dateConfidence: rules.date ? rules.dateConfidence : llm.result.dateConfidence,
        lab: rules.lab ?? llm.result.lab,
        orderedBy: rules.orderedBy,
        values: { ...llm.result.values, ...rules.values },
        flags: [...rules.flags, ...llm.result.flags.filter((f) => !(f.marker in rules.values))],
        insufficient: false,
      };
      result.insufficient = !result.date || Object.keys(result.values).length === 0;
      method = 'llm';
    }
  }
  return { draft: { ...result, method } };
}

export const labImportController = {
  // POST /api/lab-results/import  (multipart : files[], password?, passwordLabel?, remember?, forceAi?)
  importFiles: async (req: AuthRequest, res: Response): Promise<void> => {
    if (!isPdfEncryptionConfigured()) {
      throw new AppError(
        501,
        req.t('errors.labImport.notConfigured', { defaultValue: "L'import de bilans PDF n'est pas configuré sur ce serveur" })
      );
    }
    await runUpload(req, res);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      throw new ValidationError(req.t('errors.labImport.noFile', { defaultValue: 'Aucun fichier PDF reçu' }));
    }

    const userId = req.userId!;
    const body = req.body as Record<string, string | undefined>;
    const providedPassword = body.password || undefined;
    const remember = body.remember === 'true';
    const forceAi = body.forceAi === 'true';
    const passwordLabel = (body.passwordLabel || '').trim().slice(0, 60);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, birthDate: true, profile: { select: { aiExtractionConsentAt: true } } },
    });
    if (!user) throw new AppError(401, req.t('errors.tokenInvalid'));
    const aiUser = {
      name: user.name,
      email: user.email,
      birthDate: user.birthDate,
      consent: Boolean(user.profile?.aiExtractionConsentAt),
    };

    // Brouillons abandonnés
    await prisma.labDocument.deleteMany({
      where: { userId, labResultId: null, createdAt: { lt: new Date(Date.now() - DRAFT_TTL_MS) } },
    });

    // Mots de passe candidats (mémorisés déchiffrés une seule fois pour tout le lot)
    const stored = await prisma.pdfPassword.findMany({ where: { userId }, orderBy: { lastUsedAt: 'desc' } });
    const candidates: PasswordCandidate[] = [];
    if (providedPassword) candidates.push({ value: providedPassword, storedId: null, source: 'provided' });
    for (const row of stored) {
      try {
        const value = decryptPdfSecret(row.passwordEnc);
        if (value !== providedPassword) candidates.push({ value, storedId: row.id, source: 'stored' });
      } catch {
        logger.warn('Mot de passe de PDF mémorisé illisible (clé modifiée ?)', row.id);
      }
    }
    for (const value of birthDatePasswords(user.birthDate)) {
      candidates.push({ value, storedId: null, source: 'birthdate' });
    }

    let rememberDone = false;
    const results: ImportFileResult[] = [];

    for (const file of files) {
      const filename = sanitizeFilename(file.originalname);
      try {
        if (file.size > config.pdfImportMaxBytes) {
          results.push({ filename, status: 'too_large' });
          continue;
        }
        if (!hasPdfSignature(file.buffer)) {
          results.push({ filename, status: 'invalid' });
          continue;
        }

        const unlocked = await unlock(file.buffer, candidates);
        if (unlocked === 'password_required' || unlocked === 'wrong_password') {
          results.push({ filename, status: unlocked });
          continue;
        }
        const { data, used } = unlocked;

        if (used?.storedId) {
          await prisma.pdfPassword.update({ where: { id: used.storedId }, data: { lastUsedAt: new Date() } });
        }
        // Mémorisation : seulement si le mot de passe fourni a réellement ouvert un PDF
        if (remember && !rememberDone && used?.source === 'provided') {
          await prisma.pdfPassword.create({
            data: {
              userId,
              label: passwordLabel || 'Mot de passe de PDF',
              passwordEnc: encryptPdfSecret(used.value),
              keyVersion: config.pdfEncryptionKeyVersion,
              lastUsedAt: new Date(),
            },
          });
          rememberDone = true;
        }

        const sha256 = crypto.createHash('sha256').update(data).digest('hex');
        const existing = await prisma.labDocument.findUnique({ where: { userId_sha256: { userId, sha256 } } });
        if (existing?.labResultId) {
          results.push({ filename, status: 'duplicate', duplicateOf: { labResultId: existing.labResultId } });
          continue;
        }

        const extraction = await extract(data, aiUser, forceAi);
        if ('noText' in extraction) {
          results.push({ filename, status: 'failed', reason: 'no_text' });
          continue;
        }
        const { draft } = extraction;

        const document =
          existing ??
          (await prisma.labDocument.create({
            data: {
              userId,
              filename,
              sizeBytes: data.length,
              sha256,
              dataEnc: encryptBuffer(data),
              keyVersion: config.pdfEncryptionKeyVersion,
            },
          }));

        let possibleDuplicateOf: ImportFileResult['possibleDuplicateOf'];
        if (draft.date) {
          const same = await prisma.labResult.findFirst({
            where: { userId, date: new Date(draft.date), ...(draft.lab ? { lab: draft.lab } : {}) },
            select: { id: true },
          });
          if (same) possibleDuplicateOf = { labResultId: same.id };
        }

        results.push({ filename, status: 'ready', documentId: document.id, draft, possibleDuplicateOf });
      } catch (err) {
        if (err instanceof InvalidPdfError) {
          results.push({ filename, status: 'invalid' });
        } else {
          logger.error('Import de bilan PDF échoué', err instanceof Error ? err.message : 'unknown');
          results.push({ filename, status: 'failed' });
        }
      }
    }

    res.json({ results });
  },
};
