// src/controllers/analytics.controller.ts
import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';

// Parse ?days=N en retombant sur `fallback` si absent/invalide.
// Note: `parseInt(x) || fallback` a un bug quand x==="0" (0 est falsy en JS
// et retombe donc sur fallback) — Number.isFinite évite ce piège.
function parseDays(value: unknown, fallback: number): number {
  const n = Number.parseInt(value as string, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const analyticsController = {
  // GET /api/analytics/overview?days=90
  overview: async (req: AuthRequest, res: Response): Promise<void> => {
    const days = parseDays(req.query.days, 90);
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

    // Streak (jours consécutifs avec medicationTaken = true, en partant du plus récent)
    let streak = 0;
    const sortedEntries = [...entries].reverse();
    for (const entry of sortedEntries) {
      if (entry.medicationTaken) streak++;
      else break;
    }

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
      timeSeries: entries,
    });
  },

  // GET /api/analytics/symptoms?days=30
  symptoms: async (req: AuthRequest, res: Response): Promise<void> => {
    const days = parseDays(req.query.days, 30);
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
  },
};
