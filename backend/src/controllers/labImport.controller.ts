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
import { z } from 'zod';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import {
  encryptBuffer,
  decryptBuffer,
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
import { MARKER_KEYS, type MarkerKey } from '../lib/labExtract/units.js';
import { getImportAllowance, reserveImport, releaseImport } from '../lib/entitlements.js';

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
  | 'quota_exceeded'
  | 'failed';

export interface ImportConflict {
  field: 'date' | MarkerKey;
  // Lecture par règles ; null si elles n'ont rien trouvé
  rules: string | number | null;
  // Lecture par IA ; null si elle n'a rien trouvé
  ai: string | number | null;
}

export interface ImportFileResult {
  filename: string;
  status: ImportStatus;
  documentId?: string;
  // Présent pour `duplicate` : le résultat du carnet qui porte déjà ce PDF
  duplicateOf?: { labResultId: string };
  draft?: Omit<ParsedLabResult, 'insufficient'> & {
    insufficient: boolean;
    // rules : lecture locale seule ; llm : complétée par l'IA ; both : les deux lectures
    // ont été comparées (mode « IA à chaque import » ou « Réessayer avec l'IA »)
    method: 'rules' | 'llm' | 'both';
    // Champs sur lesquels les deux lectures ne s'accordent pas (à vérifier par l'utilisateur)
    conflicts: ImportConflict[];
  };
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
            new AppError(413, req.t('errors.labImport.fileTooLarge'))
          );
        }
        return reject(
          new ValidationError(
            req.t('errors.labImport.badUpload', { max: config.pdfImportMaxFiles })
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

// Compare les deux lectures : l'IA l'emporte sur ce qu'elle a lu, les règles complètent le
// reste, et tout désaccord est signalé (la valeur proposée n'est jamais présentée comme sûre).
function mergeReadings(rules: ParsedLabResult, ai: ParsedLabResult): { result: ParsedLabResult; conflicts: ImportConflict[] } {
  const conflicts: ImportConflict[] = [];

  let date = rules.date;
  let dateConfidence = rules.dateConfidence;
  if (ai.date) {
    if (rules.date && rules.date !== ai.date) conflicts.push({ field: 'date', rules: rules.date, ai: ai.date });
    if (rules.date !== ai.date) dateConfidence = 'low';
    date = ai.date;
  }

  const values: ParsedLabResult['values'] = { ...rules.values };
  for (const marker of MARKER_KEYS) {
    const fromRules = rules.values[marker];
    const fromAi = ai.values[marker];
    if (fromAi !== undefined) {
      values[marker] = fromAi;
      if (fromRules !== undefined && Math.abs(fromRules - fromAi) > 1e-9) {
        conflicts.push({ field: marker, rules: fromRules, ai: fromAi });
      }
    } else if (fromRules !== undefined) {
      // Lue par les règles seulement : suspect (ex. valeur tirée d'une note de bas de page)
      conflicts.push({ field: marker, rules: fromRules, ai: null });
    }
  }

  const flags = [...ai.flags, ...rules.flags.filter((f) => !ai.flags.some((a) => a.marker === f.marker && a.reason === f.reason))];
  const result: ParsedLabResult = {
    date,
    dateConfidence,
    lab: ai.lab ?? rules.lab,
    orderedBy: rules.orderedBy,
    values,
    flags,
    insufficient: !date || Object.keys(values).length === 0,
  };
  return { result, conflicts };
}

async function extract(
  data: Buffer,
  user: { name: string; email: string; birthDate: Date | null; consent: boolean; always: boolean },
  forceAi: boolean
): Promise<{ draft: NonNullable<ImportFileResult['draft']> } | { noText: true }> {
  const text = await extractPdfText(data);
  if (text.replace(/\s/g, '').length < MIN_TEXT_CHARS) return { noText: true };

  const rules = parseLabText(text);
  let result: ParsedLabResult = rules;
  let method: 'rules' | 'llm' | 'both' = 'rules';
  let conflicts: ImportConflict[] = [];

  // Mode « comparer » : IA à chaque import (réglage du profil) ou « Réessayer avec l'IA ».
  // Sinon l'IA ne sert que de repli quand les règles ne suffisent pas.
  const compare = user.consent && (user.always || forceAi);
  if (user.consent && (rules.insufficient || compare)) {
    const llm = await extractWithLlm(text, { name: user.name, email: user.email, birthDate: user.birthDate, consent: true });
    if (llm.ok) {
      if (compare) {
        ({ result, conflicts } = mergeReadings(rules, llm.result));
        method = 'both';
      } else {
        // Repli : les règles (locales, déterministes) priment ; le LLM complète ce qui manque.
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
  }
  return { draft: { ...result, method, conflicts } };
}

// Mêmes champs que le formulaire manuel du carnet (labResults.controller.ts),
// avec les marqueurs dérivés de la liste commune de l'extraction.
const confirmSchema = z.object({
  date: z.string().min(1),
  lab: z.string().optional().nullable(),
  orderedBy: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  ...Object.fromEntries(MARKER_KEYS.map((key) => [key, z.number().optional().nullable()])),
});

export const labImportController = {
  // POST /api/lab-results/import  (multipart : files[], password?, passwordLabel?, remember?, forceAi?)
  importFiles: async (req: AuthRequest, res: Response): Promise<void> => {
    if (!isPdfEncryptionConfigured()) {
      throw new AppError(
        501,
        req.t('errors.labImport.notConfigured')
      );
    }
    const userId = req.userId!;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        proUntil: true,
        freeImportsUsed: true,
        name: true,
        email: true,
        birthDate: true,
        profile: { select: { aiExtractionConsentAt: true, aiExtractionAlways: true } },
      },
    });
    if (!user) throw new AppError(401, req.t('errors.tokenInvalid'));

    // Accès Pro : refusé AVANT de lire le corps de la requête (les PDF), pour
    // ne pas traiter un envoi qu'on sait refuser.
    const allowance = await getImportAllowance(user);
    if (allowance.remaining <= 0) {
      throw allowance.pro
        ? new AppError(
            429,
            req.t('errors.billing.monthlyQuotaReached', { limit: allowance.limit }),
            true,
            'MONTHLY_QUOTA_REACHED'
          )
        : new AppError(402, req.t('errors.billing.proRequired'), true, 'PRO_REQUIRED');
    }
    // Date unique de la requête : la réservation et son éventuelle restitution
    // portent sur le même mois.
    const quotaNow = new Date();

    await runUpload(req, res);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      throw new ValidationError(req.t('errors.labImport.noFile'));
    }

    const body = req.body as Record<string, string | undefined>;
    const providedPassword = body.password || undefined;
    const remember = body.remember === 'true';
    const forceAi = body.forceAi === 'true';
    const passwordLabel = (body.passwordLabel || '').trim().slice(0, 60);

    const aiUser = {
      name: user.name,
      email: user.email,
      birthDate: user.birthDate,
      consent: Boolean(user.profile?.aiExtractionConsentAt),
      always: Boolean(user.profile?.aiExtractionConsentAt) && Boolean(user.profile?.aiExtractionAlways),
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
      // Import réservé pour ce fichier et pas encore acquis (à rendre en cas d'échec)
      let reserved = false;
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

        // Chaque extraction compte (elle peut déclencher un appel LLM payant) :
        // l'import est réservé avant, de façon atomique ; au-delà du solde, le
        // fichier est refusé individuellement.
        if (!(await reserveImport(userId, allowance.pro, quotaNow))) {
          results.push({ filename, status: 'quota_exceeded' });
          continue;
        }
        reserved = true;

        const extraction = await extract(data, aiUser, forceAi);
        if ('noText' in extraction) {
          await releaseImport(userId, allowance.pro, quotaNow);
          reserved = false;
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

        // Brouillon enregistré : l'import est acquis.
        reserved = false;

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
        if (reserved) {
          await releaseImport(userId, allowance.pro, quotaNow).catch((releaseErr) => {
            logger.error('Restitution d’un import réservé échouée', releaseErr instanceof Error ? releaseErr.message : 'unknown');
          });
        }
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
  // POST /api/lab-results/import/:docId/confirm
  // Valeurs relues (et éventuellement corrigées) par l'utilisateur → création
  // du résultat du carnet et rattachement du PDF, en une transaction.
  confirm: async (req: AuthRequest, res: Response): Promise<void> => {
    const { date, ...data } = confirmSchema.parse(req.body);
    const userId = req.userId!;
    const result = await prisma.$transaction(async (tx) => {
      const document = await tx.labDocument.findFirst({ where: { id: req.params.docId, userId } });
      if (!document) throw new NotFoundError(req.t('errors.notFound', { resource: req.t('resources.labResult') }));
      if (document.labResultId) {
        throw new ConflictError(
          req.t('errors.labImport.alreadyConfirmed')
        );
      }
      const created = await tx.labResult.create({
        data: { userId, date: new Date(date), source: 'PDF_IMPORT', ...data },
      });
      await tx.labDocument.update({ where: { id: document.id }, data: { labResultId: created.id } });
      return created;
    });
    res.status(201).json(result);
  },

  // DELETE /api/lab-results/import/:docId — rejette un brouillon non confirmé
  discard: async (req: AuthRequest, res: Response): Promise<void> => {
    const document = await prisma.labDocument.findFirst({ where: { id: req.params.docId, userId: req.userId } });
    if (!document) throw new NotFoundError(req.t('errors.notFound', { resource: req.t('resources.labResult') }));
    if (document.labResultId) {
      throw new ConflictError(
        req.t('errors.labImport.alreadyConfirmed')
      );
    }
    await prisma.labDocument.delete({ where: { id: document.id } });
    res.json({ success: true });
  },

  // GET /api/lab-results/documents/:docId — PDF déchiffré, propriétaire uniquement
  download: async (req: AuthRequest, res: Response): Promise<void> => {
    if (!isPdfEncryptionConfigured()) {
      throw new AppError(
        501,
        req.t('errors.labImport.notConfigured')
      );
    }
    const document = await prisma.labDocument.findFirst({ where: { id: req.params.docId, userId: req.userId } });
    if (!document) throw new NotFoundError(req.t('errors.notFound', { resource: req.t('resources.labResult') }));

    const data = decryptBuffer(Buffer.from(document.dataEnc));
    res.attachment(document.filename);
    res.type('application/pdf');
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
    res.send(data);
  },
};
