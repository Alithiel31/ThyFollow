// src/pages/LabResultsPage.doses.test.tsx
// Fiches du carnet croisées avec les posologies (onglet Médicaments), rendues avec les vraies
// traductions FR (voir src/test/i18nFr.ts).
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { LabResultsPage } from './LabResultsPage';
import { loadFr } from '../test/i18nFr';
import type { DosePeriod, LabResult, Medication } from '../types';

vi.mock('react-i18next', async () => (await import('../test/i18nFr')).i18nFrMock());

const labListMock = vi.fn();
const medListMock = vi.fn();
vi.mock('../lib/api', () => ({
  labApi: { list: (...args: unknown[]) => labListMock(...args) },
  medApi: { list: (...args: unknown[]) => medListMock(...args) },
}));

// Le graphique n'est pas l'objet de ces tests (ResponsiveContainer ne rend rien sous jsdom).
vi.mock('recharts', () => {
  const Stub = () => null;
  return {
    LineChart: Stub, Line: Stub, XAxis: Stub, YAxis: Stub, Tooltip: Stub, ResponsiveContainer: Stub,
    ReferenceLine: Stub, ReferenceArea: Stub, CartesianGrid: Stub,
  };
});

const lab = (id: string, date: string, tsh: number): LabResult => ({ id, date, tsh, lab: `Labo ${id}` });
const period = (id: string, startDate: string, doses: number[]): DosePeriod =>
  ({ id, startDate: `${startDate}T00:00:00.000Z`, slots: [{ time: '07:00', doses }] });
const levo = (...dosePeriods: DosePeriod[]): Medication => ({
  id: 'med-1', name: 'Levothyrox', dosage: 0, dosageUnit: 'MCG', frequency: 'DAILY', intakeTimes: ['07:00'],
  startDate: dosePeriods[0].startDate, active: true, showOnChart: true, dosePeriods,
});

async function renderWith(labs: LabResult[], meds: Medication[]) {
  labListMock.mockResolvedValue({ data: labs });
  medListMock.mockResolvedValue({ data: meds });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><LabResultsPage /></MemoryRouter></QueryClientProvider>);
  await screen.findByText(`Labo ${labs[0].id}`);
}

const card = (labName: string) => screen.getByText(labName).parentElement!;

beforeAll(loadFr);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LabResultsPage — dose en vigueur sur chaque analyse', () => {
  it('une analyse du 2026-03-15 affiche la posologie commencée le 2026-03-01', async () => {
    await renderWith([lab('a', '2026-03-15', 1.4)], [levo(period('p-1', '2026-03-01', [75, 100]))]);
    expect(await screen.findByText('Sous traitement : 75 / 100 µg en alternance')).toBeInTheDocument();
  });

  it('une analyse antérieure à toute période n’affiche pas de traitement', async () => {
    await renderWith(
      [lab('a', '2026-03-15', 1.4), lab('b', '2025-12-01', 3.2)],
      [levo(period('p-1', '2026-03-01', [75, 100]))],
    );
    await screen.findByText('Sous traitement : 75 / 100 µg en alternance');
    expect(card('Labo b')).not.toHaveTextContent('Sous traitement');
    expect(card('Labo a')).toHaveTextContent('Sous traitement : 75 / 100 µg en alternance');
  });
});
