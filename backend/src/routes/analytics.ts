// src/routes/analytics.ts
import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

export const analyticsRouter = Router();
analyticsRouter.use(authenticate);

// GET /api/analytics/overview?days=90
// Returns aggregated stats for the dashboard
analyticsRouter.get('/overview', async (req: AuthRequest, res: Response) => {
  const days = parseInt(req.query.days as string) || 90;
  const from = new Date();
  from.setDate(from.getDate() - days);

  const [entries, labResults, medications, nextAppointment] = await Promise.all([
    prisma.dailyEntry.findMany({
      where: { userId: req.userId, date: { gte: from } },
      orderBy: { date: 'asc' },
      select: {
        date: true,
        energyLevel: true,
        moodScore: true,
        weight: true,
        sleepHours: true,
        medicationTaken: true,
        heartRate: true,
      },
    }),
    prisma.labResult.findMany({
      where: { userId: req.userId },
      orderBy: { date: 'desc' },
      take: 10,
      select: { date: true, tsh: true, ft4: true, ft3: true },
    }),
    prisma.medication.findMany({
      where: { userId: req.userId, active: true },
      select: { name: true, dosageMcg: true, intakeTime: true },
    }),
    prisma.appointment.findFirst({
      where: {
        userId: req.userId,
        status: 'UPCOMING',
        date: { gte: new Date() },
      },
      orderBy: { date: 'asc' },
    }),
  ]);

  // Compute streak (consecutive days with medicationTaken = true)
  let streak = 0;
  const sortedEntries = [...entries].reverse();
  for (const entry of sortedEntries) {
    if (entry.medicationTaken) streak++;
    else break;
  }

  // Averages
  const withEnergy = entries.filter((e) => e.energyLevel !== null);
  const withMood = entries.filter((e) => e.moodScore !== null);
  const avgEnergy = withEnergy.length
    ? withEnergy.reduce((s, e) => s + (e.energyLevel ?? 0), 0) / withEnergy.length
    : null;
  const avgMood = withMood.length
    ? withMood.reduce((s, e) => s + (e.moodScore ?? 0), 0) / withMood.length
    : null;

  const medicationAdherence =
    entries.length > 0
      ? (entries.filter((e) => e.medicationTaken).length / entries.length) * 100
      : null;

  res.json({
    period: { from, days },
    totalEntries: entries.length,
    streak,
    averages: { energy: avgEnergy, mood: avgMood },
    medicationAdherence,
    activeMedications: medications,
    latestLabResult: labResults[0] ?? null,
    labHistory: labResults,
    nextAppointment,
    // Time series for charts
    timeSeries: entries,
  });
});

// GET /api/analytics/symptoms?days=30
// Top symptoms frequency
analyticsRouter.get('/symptoms', async (req: AuthRequest, res: Response) => {
  const days = parseInt(req.query.days as string) || 30;
  const from = new Date();
  from.setDate(from.getDate() - days);

  const entries = await prisma.dailyEntry.findMany({
    where: { userId: req.userId, date: { gte: from } },
    select: {
      coldSensitivity: true,
      heatSensitivity: true,
      hairLoss: true,
      drySkin: true,
      constipation: true,
      bloating: true,
      muscleWeakness: true,
      jointPain: true,
      neckPain: true,
      swelling: true,
      tremors: true,
      brainFogLevel: true,
      anxietyLevel: true,
    },
  });

  const symptomFields = Object.keys(entries[0] ?? {}) as (keyof typeof entries[0])[];
  const frequency: Record<string, { count: number; avgSeverity: number }> = {};

  for (const field of symptomFields) {
    const values = entries.map((e) => e[field]).filter((v) => v !== null) as number[];
    if (values.length > 0) {
      frequency[field] = {
        count: values.length,
        avgSeverity: values.reduce((s, v) => s + v, 0) / values.length,
      };
    }
  }

  res.json({ period: { from, days }, frequency });
});
