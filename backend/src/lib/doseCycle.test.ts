// src/lib/doseCycle.test.ts
import { describe, it, expect } from 'vitest';
import { slotsSchema, averageDailyDose, currentPeriod } from './doseCycle.js';

describe('lib/doseCycle', () => {
  describe('averageDailyDose', () => {
    it('alternance 75 / 100 → 87,5', () => {
      expect(averageDailyDose([{ time: '07:00', doses: [75, 100] }])).toBe(87.5);
    });

    it('schéma hebdomadaire 100 × 6 + 50 → 92,86', () => {
      expect(averageDailyDose([{ time: '07:00', doses: [100, 100, 100, 100, 100, 100, 50] }])).toBe(92.86);
    });

    it('additionne les créneaux : 50 le matin + 25 le soir → 75', () => {
      expect(averageDailyDose([
        { time: '07:00', doses: [50] },
        { time: '20:00', doses: [25] },
      ])).toBe(75);
    });
  });

  describe('slotsSchema', () => {
    const valid = (slots: unknown) => slotsSchema.safeParse(slots).success;

    it('refuse un cycle vide', () => {
      expect(valid([{ time: '07:00', doses: [] }])).toBe(false);
    });

    it('refuse un cycle de 15 valeurs', () => {
      expect(valid([{ time: '07:00', doses: Array(15).fill(75) }])).toBe(false);
    });

    it('accepte un cycle de 14 valeurs', () => {
      expect(valid([{ time: '07:00', doses: Array(14).fill(75) }])).toBe(true);
    });

    it('refuse deux créneaux à la même heure', () => {
      expect(valid([{ time: '07:00', doses: [50] }, { time: '07:00', doses: [25] }])).toBe(false);
    });

    it('refuse deux créneaux de longueurs différentes', () => {
      expect(valid([{ time: '07:00', doses: [75, 100] }, { time: '20:00', doses: [25] }])).toBe(false);
    });

    it('refuse un jour où tous les créneaux sont à 0', () => {
      expect(valid([{ time: '07:00', doses: [75, 0] }, { time: '20:00', doses: [25, 0] }])).toBe(false);
    });

    it('accepte une prise le matin un jour, le soir le lendemain', () => {
      expect(valid([{ time: '07:00', doses: [75, 0] }, { time: '20:00', doses: [0, 25] }])).toBe(true);
    });

    it('refuse aucun créneau, et plus de 8 créneaux', () => {
      expect(valid([])).toBe(false);
      const nine = Array.from({ length: 9 }, (_, i) => ({ time: `0${i}:00`, doses: [1] }));
      expect(valid(nine)).toBe(false);
    });

    it('refuse une dose négative et une heure mal formée', () => {
      expect(valid([{ time: '07:00', doses: [-1, 75] }])).toBe(false);
      expect(valid([{ time: '7h', doses: [75] }])).toBe(false);
    });

    it('accepte un créneau sans heure, mais un seul', () => {
      expect(valid([{ time: null, doses: [1] }])).toBe(true);
      expect(valid([{ time: null, doses: [1] }, { time: null, doses: [1] }])).toBe(false);
    });
  });

  describe('currentPeriod', () => {
    const periods = [
      { id: 'a', startDate: new Date('2025-01-01') },
      { id: 'c', startDate: new Date('2026-06-01') },
      { id: 'b', startDate: new Date('2026-03-01') },
    ];

    it('choisit la période en vigueur pour une date située entre deux périodes', () => {
      expect(currentPeriod(periods, new Date('2026-02-28'))?.id).toBe('a');
      expect(currentPeriod(periods, new Date('2026-04-15'))?.id).toBe('b');
    });

    it('une période commence dès son premier jour, quelle que soit l’heure', () => {
      expect(currentPeriod(periods, new Date('2026-03-01T00:00:00Z'))?.id).toBe('b');
      expect(currentPeriod(periods, new Date('2026-03-01T23:59:00Z'))?.id).toBe('b');
    });

    it('prend la plus récente après la dernière date de début', () => {
      expect(currentPeriod(periods, new Date('2027-01-01'))?.id).toBe('c');
    });

    it('renvoie null avant la première période', () => {
      expect(currentPeriod(periods, new Date('2024-12-31'))).toBeNull();
    });
  });
});
