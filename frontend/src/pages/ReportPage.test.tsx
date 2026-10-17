// src/pages/ReportPage.test.tsx
// Le rapport est rendu avec les vraies traductions FR (et non les clés renvoyées par le
// `t` de src/test/setup.ts), pour vérifier le libellé de posologie tel qu'il est imprimé.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ReportPage } from './ReportPage';
import { loadFr } from '../test/i18nFr';

vi.mock('react-i18next', async () => (await import('../test/i18nFr')).i18nFrMock());

const reportMock = vi.fn();
vi.mock('../lib/api', () => ({ analyticsApi: { report: (...args: unknown[]) => reportMock(...args) } }));

const REPORT = {
  period: { from: '2026-07-01', to: '2026-10-01' },
  totalEntries: 0,
  scores: {},
  physical: { weight: null, bodyTemperature: null, heartRate: null, sleepHours: null },
  medicationAdherence: null,
  labResults: [],
  activeMedications: [
    {
      name: 'Levothyrox', brand: null, dosage: 87.5, dosageUnit: 'MCG', frequency: 'DAILY', intakeTimes: ['07:00'],
      dosePeriods: [
        { startDate: '2025-01-01T00:00:00.000Z', slots: [{ time: '07:00', doses: [50] }] },
        { startDate: '2026-03-01T00:00:00.000Z', slots: [{ time: '07:00', doses: [75, 100] }] },
      ],
    },
  ],
};

beforeAll(loadFr);

beforeEach(() => {
  reportMock.mockResolvedValue({ data: REPORT });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-17T12:00:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ReportPage — traitements en cours', () => {
  it('affiche la posologie en vigueur avec son cycle', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/report?from=2026-07-01&to=2026-10-01']}>
          <ReportPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByText('Levothyrox — 75 / 100 µg en alternance · 07:00')).toBeInTheDocument();
  });
});
