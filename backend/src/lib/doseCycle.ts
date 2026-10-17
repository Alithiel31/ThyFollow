// src/lib/doseCycle.ts
// Cycles de doses : une période de posologie porte des créneaux { time, doses } ; chaque
// cycle `doses` se répète en boucle à partir de la date de début de la période.
import { z } from 'zod';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const MAX_SLOTS = 8;
export const MAX_CYCLE_DAYS = 14;

const slotSchema = z.object({
  time: z.string().regex(TIME_RE).nullable(), // null : sans heure fixe (« au besoin »)
  doses: z.array(z.number().finite().min(0)).min(1).max(MAX_CYCLE_DAYS),
});

export const slotsSchema = z
  .array(slotSchema)
  .min(1)
  .max(MAX_SLOTS)
  .superRefine((slots, ctx) => {
    if (slots.length === 0) return; // déjà signalé par .min(1) ; zod v4 exécute quand même ce refine
    const times = slots.map((s) => s.time);
    if (new Set(times).size !== times.length) {
      ctx.addIssue({ code: 'custom', message: 'Deux créneaux ont la même heure' });
    }

    const length = slots[0].doses.length;
    if (slots.some((s) => s.doses.length !== length)) {
      ctx.addIssue({ code: 'custom', message: 'Tous les créneaux doivent avoir la même longueur de cycle' });
      return;
    }

    for (let day = 0; day < length; day++) {
      if (!slots.some((s) => s.doses[day] > 0)) {
        ctx.addIssue({ code: 'custom', message: `Aucune dose le jour ${day + 1} du cycle` });
      }
    }
  });

export type DoseSlot = z.infer<typeof slotSchema>;

// Dose moyenne quotidienne, tous créneaux additionnés, arrondie à 2 décimales.
export function averageDailyDose(slots: DoseSlot[]): number {
  const total = slots.reduce((sum, s) => sum + s.doses.reduce((a, b) => a + b, 0), 0);
  return Math.round((total / slots[0].doses.length) * 100) / 100;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

// Période en vigueur à une date : la plus récente ayant commencé ce jour-là ou avant.
// Les jours sont comparés en UTC, comme les colonnes @db.Date.
export function currentPeriod<T extends { startDate: Date }>(periods: T[], date: Date): T | null {
  const day = dayKey(date);
  let found: T | null = null;
  for (const p of periods) {
    if (dayKey(p.startDate) <= day && (!found || p.startDate > found.startDate)) found = p;
  }
  return found;
}
