// src/controllers/pdfPasswords.controller.ts
// Mots de passe de PDF mémorisés pour l'import de bilans (voir
// labImport.controller.ts) : chiffrés au repos, jamais renvoyés par l'API
// (seuls libellé et dates sortent), révocables un par un ou tous d'un coup.
import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { AuthRequest } from '../middleware/auth.js';
import { AppError, NotFoundError } from '../lib/errors.js';
import { encryptPdfSecret, isPdfEncryptionConfigured } from '../lib/crypto.js';

const createSchema = z.object({
  label: z.string().trim().min(1).max(60),
  password: z.string().min(1).max(200),
});

const publicFields = { id: true, label: true, createdAt: true, lastUsedAt: true } as const;

export const pdfPasswordsController = {
  // GET /api/pdf-passwords
  list: async (req: AuthRequest, res: Response): Promise<void> => {
    const rows = await prisma.pdfPassword.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      select: publicFields,
    });
    res.json(rows);
  },

  // POST /api/pdf-passwords
  create: async (req: AuthRequest, res: Response): Promise<void> => {
    if (!isPdfEncryptionConfigured()) {
      throw new AppError(
        501,
        req.t('errors.labImport.notConfigured', { defaultValue: "L'import de bilans PDF n'est pas configuré sur ce serveur" })
      );
    }
    const { label, password } = createSchema.parse(req.body);
    const row = await prisma.pdfPassword.create({
      data: {
        userId: req.userId!,
        label,
        passwordEnc: encryptPdfSecret(password),
        keyVersion: config.pdfEncryptionKeyVersion,
      },
      select: publicFields,
    });
    res.status(201).json(row);
  },

  // DELETE /api/pdf-passwords/:id
  remove: async (req: AuthRequest, res: Response): Promise<void> => {
    const existing = await prisma.pdfPassword.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) throw new NotFoundError(req.t('errors.notFound', { resource: req.t('resources.pdfPassword', { defaultValue: 'mot de passe' }) }));
    await prisma.pdfPassword.delete({ where: { id: existing.id } });
    res.json({ success: true });
  },

  // DELETE /api/pdf-passwords — « tout révoquer »
  removeAll: async (req: AuthRequest, res: Response): Promise<void> => {
    const { count } = await prisma.pdfPassword.deleteMany({ where: { userId: req.userId } });
    res.json({ success: true, deleted: count });
  },
};
