// src/pages/MedicationsPage.checklist.test.tsx
// Checklist du jour : chaque créneau affiche la dose du jour selon le cycle, les créneaux à 0
// sont masqués. Rendu avec les vraies traductions FR (voir src/test/i18nFr.ts).
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MedicationsPage } from './MedicationsPage';
import { loadFr } from '../test/i18nFr';
import type { DoseSlot, Medication } from '../types';

vi.mock('react-i18next', async () => (await import('../test/i18nFr')).i18nFrMock());

const listMock = vi.fn();
vi.mock('../lib/api', () => ({
  medApi: {
    list: (...args: unknown[]) => listMock(...args),
    listIntakes: () => Promise.resolve({ data: [] }),
  },
}));

const med = (slots: DoseSlot[]): Medication => ({
  id: 'med-1', name: 'Levothyrox', dosage: 0, dosageUnit: 'MCG', frequency: 'DAILY', intakeTimes: [],
  startDate: '2026-10-01T00:00:00.000Z', active: true, showOnChart: true,
  dosePeriods: [{ id: 'p-1', startDate: '2026-10-01T00:00:00.000Z', slots }],
});

// Boutons de la checklist : « HH:MM — dose · statut ».
const doseButtons = () => screen.queryAllByRole('button', { name: /^\d\d:\d\d — / });

async function renderOnDay2(slots: DoseSlot[]) {
  listMock.mockResolvedValue({ data: [med(slots)] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MedicationsPage /></QueryClientProvider>);
  await screen.findByText('Levothyrox');
}

beforeAll(loadFr);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 2, 9, 0)); // 2 octobre 2026, jour 2 du cycle
});

afterEach(() => {
  vi.useRealTimers();
});

describe('MedicationsPage — checklist du jour', () => {
  it('jour 2 d’une alternance 75 / 100 : la prise du jour est de 100 µg', async () => {
    await renderOnDay2([{ time: '07:00', doses: [75, 100] }]);
    expect(doseButtons().map((b) => b.textContent)).toEqual(['07:00 — 100 µg · À prendre']);
    expect(screen.getByText('75 / 100 µg en alternance')).toBeInTheDocument();
  });

  it('jour 2 de « matin un jour, soir le lendemain » : un seul bouton, à 20:00', async () => {
    await renderOnDay2([{ time: '07:00', doses: [75, 0] }, { time: '20:00', doses: [0, 25] }]);
    expect(doseButtons()).toHaveLength(1);
    expect(doseButtons()[0]).toHaveTextContent(/^20:00 — 25 µg/);
  });

  it('jour 2 d’un cycle « un jour sur deux » : pas de prise aujourd’hui', async () => {
    await renderOnDay2([{ time: '07:00', doses: [75, 0] }]);
    expect(screen.getByText('Pas de prise aujourd\'hui')).toBeInTheDocument();
    expect(doseButtons()).toHaveLength(0);
  });
});
