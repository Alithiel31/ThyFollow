// src/routes/appointments.ts
import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const appointmentsRouter = Router();
appointmentsRouter.use(authenticate);

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

appointmentsRouter.get('/', async (req: AuthRequest, res: Response) => {
  const appts = await prisma.appointment.findMany({
    where: { userId: req.userId },
    orderBy: { date: 'asc' },
  });
  res.json(appts);
});

appointmentsRouter.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = apptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }
  const { date, ...data } = parsed.data;
  const appt = await prisma.appointment.create({
    data: { userId: req.userId!, date: new Date(date), ...data },
  });
  res.status(201).json(appt);
});

appointmentsRouter.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.appointment.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) throw new AppError('Rendez-vous non trouvé', 404);

  const parsed = apptSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0].message });
    return;
  }

  const { date, ...data } = parsed.data;
  const appt = await prisma.appointment.update({
    where: { id: req.params.id },
    data: { ...(date && { date: new Date(date) }), ...data },
  });
  res.json(appt);
});

appointmentsRouter.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.appointment.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) throw new AppError('Rendez-vous non trouvé', 404);
  await prisma.appointment.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});
