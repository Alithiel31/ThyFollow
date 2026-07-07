// src/controllers/labResults.controller.ts
import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { NotFoundError } from '../lib/errors.js';

const labSchema = z.object({
  date: z.string(),
  lab: z.string().optional().nullable(),
  orderedBy: z.string().optional().nullable(),
  tsh: z.number().optional().nullable(),
  ft4: z.number().optional().nullable(),
  ft3: z.number().optional().nullable(),
  t4: z.number().optional().nullable(),
  t3: z.number().optional().nullable(),
  antiTPO: z.number().optional().nullable(),
  antiTG: z.number().optional().nullable(),
  antiTSHR: z.number().optional().nullable(),
  thyroglobulin: z.number().optional().nullable(),
  ferritin: z.number().optional().nullable(),
  vitaminD: z.number().optional().nullable(),
  vitaminB12: z.number().optional().nullable(),
  magnesium: z.number().optional().nullable(),
  selenium: z.number().optional().nullable(),
  cholesterol: z.number().optional().nullable(),
  glucose: z.number().optional().nullable(),
  hemoglobin: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  documentUrl: z.string().url().optional().nullable(),
});

export const labResultsController = {
  // GET /api/lab-results
  list: async (req: AuthRequest, res: Response): Promise<void> => {
    const results = await prisma.labResult.findMany({
      where: { userId: req.userId },
      orderBy: { date: 'desc' },
    });
    res.json(results);
  },

  // GET /api/lab-results/:id
  getById: async (req: AuthRequest, res: Response): Promise<void> => {
    const result = await prisma.labResult.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!result) throw new NotFoundError('Résultat');
    res.json(result);
  },

  // POST /api/lab-results
  create: async (req: AuthRequest, res: Response): Promise<void> => {
    const { date, ...data } = labSchema.parse(req.body);
    const result = await prisma.labResult.create({
      data: { userId: req.userId!, date: new Date(date), ...data },
    });
    res.status(201).json(result);
  },

  // PUT /api/lab-results/:id
  update: async (req: AuthRequest, res: Response): Promise<void> => {
    const existing = await prisma.labResult.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) throw new NotFoundError('Résultat');

    const { date, ...data } = labSchema.partial().parse(req.body);
    const result = await prisma.labResult.update({
      where: { id: req.params.id },
      data: { ...(date && { date: new Date(date) }), ...data },
    });
    res.json(result);
  },

  // DELETE /api/lab-results/:id
  remove: async (req: AuthRequest, res: Response): Promise<void> => {
    const existing = await prisma.labResult.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) throw new NotFoundError('Résultat');

    await prisma.labResult.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  },
};
