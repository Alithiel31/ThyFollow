// src/lib/doseCycle.ts
// Cycles de doses : une période de posologie porte des créneaux { time, doses } ; chaque
// cycle `doses` se répète en boucle à partir du début de la période (jour 1 = startDate).
// Les jours sont des dates calendaires YYYY-MM-DD : le calcul ne dépend pas du fuseau.
import type { TFunction } from 'i18next';
import type { DosePeriod, DoseSlot, Medication } from '../types';

const DAY_MS = 86_400_000;

// Nombre de jours entre deux dates YYYY-MM-DD (ou ISO), compté en UTC.
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / DAY_MS);
}

// Période en vigueur un jour donné : la plus récente ayant commencé ce jour-là ou avant.
export function periodAtDay<T extends Pick<DosePeriod, 'startDate'>>(periods: T[], day: string): T | null {
  let found: T | null = null;
  for (const p of periods) {
    const start = p.startDate.slice(0, 10);
    if (start <= day && (!found || start > found.startDate.slice(0, 10))) found = p;
  }
  return found;
}

// Dose de chaque créneau un jour donné (`day` : jour local YYYY-MM-DD), 0 compris.
// Tableau vide si aucune période n'est en vigueur ce jour-là.
export function dosesForDate(med: Pick<Medication, 'dosePeriods'>, day: string): { time: string | null; dose: number }[] {
  const period = periodAtDay(med.dosePeriods, day);
  if (!period) return [];
  const offset = daysBetween(period.startDate, day);
  return period.slots.map((s) => ({ time: s.time, dose: s.doses[offset % s.doses.length] }));
}

// Dose moyenne quotidienne, tous créneaux additionnés, arrondie à 2 décimales.
export function averageDailyDose(slots: DoseSlot[]): number {
  const total = slots.reduce((sum, s) => sum + s.doses.reduce((a, b) => a + b, 0), 0);
  return Math.round((total / slots[0].doses.length) * 100) / 100;
}

// Les variables passées à t() vont aussi à Intl.NumberFormat (formateur `number`) : ne pas
// les nommer comme une option Intl (« unit », « style »…), sous peine de casser le format.
// Libellé d'un cycle : « 75 µg », « 75 / 100 µg en alternance », « 75 µg un jour sur deux »,
// sinon le nombre de jours par dose : « 100 µg (6 j) · 50 µg (1 j) ».
function formatCycle(doses: number[], unit: string, t: TFunction): string {
  const distinct = [...new Set(doses)];
  if (distinct.length === 1) return t('medications.schedule.dose', { dose: doses[0], unitLabel: unit });
  if (doses.length === 2 && doses[1] === 0) return t('medications.schedule.everyOtherDay', { dose: doses[0], unitLabel: unit });
  if (doses.length === 2 && doses[0] > 0 && doses[1] > 0) {
    return t('medications.schedule.alternating', { a: doses[0], b: doses[1], unitLabel: unit });
  }
  return distinct
    .map((dose) => t('medications.schedule.days', {
      label: dose === 0 ? t('medications.schedule.noIntake') : t('medications.schedule.dose', { dose, unitLabel: unit }),
      count: doses.filter((d) => d === dose).length,
    }))
    .join(' · ');
}

// Libellé d'une posologie. Plusieurs créneaux : un libellé par créneau avec son heure,
// joints par « + » (« 50 µg à 07:00 + 25 µg à 20:00 »).
export function formatSchedule(slots: DoseSlot[], unit: string, t: TFunction): string {
  if (slots.length === 1) return formatCycle(slots[0].doses, unit, t);
  return slots
    .map((s) => {
      const label = formatCycle(s.doses, unit, t);
      return s.time ? t('medications.schedule.atTime', { label, time: s.time }) : label;
    })
    .join(' + ');
}

// Posologie en vigueur un jour donné (à défaut, la plus récente), avec l'heure quand il n'y a
// qu'une prise : « 75 / 100 µg en alternance · 07:00 ». Sans période : la dose enregistrée.
export function scheduleLabel(
  med: Pick<Medication, 'dosage' | 'intakeTimes'> & { dosePeriods: Pick<DosePeriod, 'startDate' | 'slots'>[] },
  day: string,
  unit: string,
  t: TFunction,
): string {
  const period = periodAtDay(med.dosePeriods, day) ?? med.dosePeriods[med.dosePeriods.length - 1];
  if (!period) return [t('medications.schedule.dose', { dose: med.dosage, unitLabel: unit }), ...med.intakeTimes].join(' · ');
  const label = formatSchedule(period.slots, unit, t);
  const time = period.slots.length === 1 ? period.slots[0].time : null;
  return time ? `${label} · ${time}` : label;
}

// Paliers de dose moyenne quotidienne sur [from, to] (timestamps) : un point à chaque
// changement de posologie, un au début de la fenêtre (posologie alors en vigueur) et un à la
// fin, pour un tracé en escalier (`stepAfter`). Vide si aucune période ne couvre la fenêtre.
export function buildDoseSteps(
  periods: Pick<DosePeriod, 'startDate' | 'slots'>[],
  from: number,
  to: number,
): { ts: number; dose: number }[] {
  const sorted = [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const steps: { ts: number; dose: number }[] = [];
  sorted.forEach((p, i) => {
    const start = Date.parse(p.startDate);
    const next = sorted[i + 1] ? Date.parse(sorted[i + 1].startDate) : Infinity;
    if (next <= from || start > to) return; // hors fenêtre
    steps.push({ ts: Math.max(start, from), dose: averageDailyDose(p.slots) });
  });
  if (steps.length > 0 && steps[steps.length - 1].ts < to) steps.push({ ts: to, dose: steps[steps.length - 1].dose });
  return steps;
}
