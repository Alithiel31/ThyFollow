// src/controllers/appointments.controller.ts
import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { NotFoundError } from '../lib/errors.js';

const apptSchema = z.object({
  date: z.string(),
  type: z.enum(['ENDOCRINOLOGIST', 'GENERAL_PRACTITIONER', 'ULTRASOUND', 'BLOOD_TEST', 'SCINTIGRAPHY', 'BIOPSY', 'OTHER']),
  doctorName: z.string().optional().nullable(),
  specialty: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  reminder: z.boolean().default(true),
  reminderDays: z.number().int().default(2),
  status: z.enum(['UPCOMING', 'COMPLETED', 'CANCELLED']).default('UPCOMING'),
});

export const appointmentsController = {
  list: async (req: AuthRequest, res: Response): Promise<void> => {
    const appts = await prisma.appointment.findMany({
      where: { userId: req.userId },
      orderBy: { date: 'asc' },
    });
    res.json(appts);
  },

  create: async (req: AuthRequest, res: Response): Promise<void> => {
    const { date, ...data } = apptSchema.parse(req.body);
    const appt = await prisma.appointment.create({
      data: { userId: req.userId!, date: new Date(date), ...data },
    });
    res.status(201).json(appt);
  },

  update: async (req: AuthRequest, res: Response): Promise<void> => {
    const existing = await prisma.appointment.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) throw new NotFoundError(req.t('errors.notFound', { resource: req.t('resources.appointment') }));

    const { date, ...data } = apptSchema.partial().parse(req.body);
    const appt = await prisma.appointment.update({
      where: { id: req.params.id },
      data: { ...(date && { date: new Date(date) }), ...data },
    });
    res.json(appt);
  },

  remove: async (req: AuthRequest, res: Response): Promise<void> => {
    const existing = await prisma.appointment.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) throw new NotFoundError(req.t('errors.notFound', { resource: req.t('resources.appointment') }));
    await prisma.appointment.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  },
};
