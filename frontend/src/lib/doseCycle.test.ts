// src/lib/doseCycle.test.ts
// Les libellés sont vérifiés avec une vraie instance i18next chargée avec la locale FR
// (le `t` global des tests renvoie les clés, voir src/test/setup.ts).
import { describe, it, expect, beforeAll } from 'vitest';
import { createInstance, type TFunction } from 'i18next';
import fr from '../locales/fr/common.json';
import { dosesForDate, averageDailyDose, formatSchedule } from './doseCycle';
import { toISODate } from './utils';
import type { DosePeriod } from '../types';

let t: TFunction;

beforeAll(async () => {
  const i18n = createInstance();
  await i18n.init({ lng: 'fr', resources: { fr: { common: fr } }, defaultNS: 'common', interpolation: { escapeValue: false } });
  t = i18n.getFixedT('fr');
});

const med = (...dosePeriods: DosePeriod[]) => ({ dosePeriods });
const period = (startDate: string, slots: DosePeriod['slots']): DosePeriod => ({ id: startDate, startDate, slots });

describe('formatSchedule (FR)', () => {
  it('dose unique', () => {
    expect(formatSchedule([{ time: '07:00', doses: [75] }], 'µg', t)).toBe('75 µg');
  });

  it('alternance', () => {
    expect(formatSchedule([{ time: '07:00', doses: [75, 100] }], 'µg', t)).toBe('75 / 100 µg en alternance');
  });

  it('schéma hebdomadaire', () => {
    expect(formatSchedule([{ time: '07:00', doses: [100, 100, 100, 100, 100, 100, 50] }], 'µg', t))
      .toBe('100 µg (6 j) · 50 µg (1 j)');
  });

  it('un jour sur deux', () => {
    expect(formatSchedule([{ time: '07:00', doses: [75, 0] }], 'µg', t)).toBe('75 µg un jour sur deux');
  });

  it('plusieurs créneaux', () => {
    expect(formatSchedule([{ time: '07:00', doses: [50] }, { time: '20:00', doses: [25] }], 'µg', t))
      .toBe('50 µg à 07:00 + 25 µg à 20:00');
  });

  it('jours sans prise et décimales à la française', () => {
    expect(formatSchedule([{ time: '08:00', doses: [12.5, 0, 0, 0, 0, 0, 0] }], 'mg', t))
      .toBe('12,5 mg (1 j) · aucune prise (6 j)');
  });
});

describe('dosesForDate', () => {
  const alternating = med(period('2026-10-01T00:00:00.000Z', [{ time: '07:00', doses: [75, 100] }]));

  it('alternance commencée le 2026-10-01', () => {
    expect(dosesForDate(alternating, '2026-10-01')).toEqual([{ time: '07:00', dose: 75 }]);
    expect(dosesForDate(alternating, '2026-10-02')).toEqual([{ time: '07:00', dose: 100 }]);
    expect(dosesForDate(alternating, '2026-10-31')).toEqual([{ time: '07:00', dose: 75 }]);
  });

  it('matin un jour, soir le lendemain', () => {
    const m = med(period('2026-10-01', [{ time: '07:00', doses: [75, 0] }, { time: '20:00', doses: [0, 25] }]));
    expect(dosesForDate(m, '2026-10-02')).toEqual([{ time: '07:00', dose: 0 }, { time: '20:00', dose: 25 }]);
  });

  // Le 1er novembre 2026, l'heure d'hiver commence à Montréal (journée de 25 h) : le cycle ne
  // doit pas se décaler. Ce fichier est aussi exécuté avec TZ=America/Montreal.
  it('autour du changement d’heure (2026-11-01)', () => {
    expect(dosesForDate(alternating, '2026-10-31')).toEqual([{ time: '07:00', dose: 75 }]);
    expect(dosesForDate(alternating, '2026-11-01')).toEqual([{ time: '07:00', dose: 100 }]);
    expect(dosesForDate(alternating, '2026-11-02')).toEqual([{ time: '07:00', dose: 75 }]);
    // Le jour vient de la date locale, même tard le soir.
    expect(dosesForDate(alternating, toISODate(new Date(2026, 10, 1, 23, 30)))).toEqual([{ time: '07:00', dose: 100 }]);
  });

  it('choisit la période en vigueur, et rien avant la première', () => {
    const m = med(
      period('2026-03-01', [{ time: '07:00', doses: [100] }]),
      period('2025-01-01', [{ time: '07:00', doses: [50] }]),
    );
    expect(dosesForDate(m, '2026-02-28')).toEqual([{ time: '07:00', dose: 50 }]);
    expect(dosesForDate(m, '2026-03-01')).toEqual([{ time: '07:00', dose: 100 }]);
    expect(dosesForDate(m, '2024-12-31')).toEqual([]);
  });
});

describe('averageDailyDose', () => {
  it('additionne les créneaux et fait la moyenne sur le cycle', () => {
    expect(averageDailyDose([{ time: '07:00', doses: [75, 100] }])).toBe(87.5);
    expect(averageDailyDose([{ time: '07:00', doses: [50] }, { time: '20:00', doses: [25] }])).toBe(75);
    expect(averageDailyDose([{ time: '07:00', doses: [100, 100, 100, 100, 100, 100, 50] }])).toBe(92.86);
  });
});
