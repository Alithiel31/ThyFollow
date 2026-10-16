// src/controllers/adminPromo.controller.ts
// Gestion des codes promo (réservé aux ADMIN, voir le routeur).
import crypto from 'node:crypto';
import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { NotFoundError } from '../lib/errors.js';

const createSchema = z.object({
  // Laissé vide, un code lisible est généré (sans caractères ambigus 0/O, 1/I)
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{4,32}$/)
    .optional(),
  durationDays: z.number().int().min(1).max(3650),
  maxRedemptions: z.number().int().min(1).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  note: z.string().max(200).optional().nullable(),
});
const updateSchema = z.object({ active: z.boolean() });

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateCode(): string {
  const pick = () => Array.from(crypto.randomBytes(4), (b) => ALPHABET[b % ALPHABET.length]).join('');
  return `THYRO-${pick()}-${pick()}`;
}

export const adminPromoController = {
  // GET /api/admin/promo-codes
  list: async (_req: AuthRequest, res: Response): Promise<void> => {
    const codes = await prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(codes);
  },

  // POST /api/admin/promo-codes
  create: async (req: AuthRequest, res: Response): Promise<void> => {
    const { code, expiresAt, ...data } = createSchema.parse(req.body);
    const created = await prisma.promoCode.create({
      data: {
        ...data,
        code: (code ?? generateCode()).toUpperCase(),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
    res.status(201).json(created);
  },

  // PATCH /api/admin/promo-codes/:id — (dés)active un code sans le supprimer
  // (l'historique des utilisations est conservé).
  update: async (req: AuthRequest, res: Response): Promise<void> => {
    const { active } = updateSchema.parse(req.body);
    const existing = await prisma.promoCode.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError(req.t('errors.resourceNotFound'));
    const updated = await prisma.promoCode.update({ where: { id: existing.id }, data: { active } });
    res.json(updated);
  },
};
