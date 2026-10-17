// src/pages/DashboardPage.medications.test.tsx
// Carte « Traitement en cours » : la posologie en vigueur, rendue avec les vraies traductions
// FR (voir src/test/i18nFr.ts).
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from './DashboardPage';
import { useAuthStore } from '../lib/store';
import { loadFr } from '../test/i18nFr';

vi.mock('react-i18next', async () => (await import('../test/i18nFr')).i18nFrMock());

const overviewMock = vi.fn();
vi.mock('../lib/api', () => ({
  analyticsApi: { overview: (...args: unknown[]) => overviewMock(...args) },
  articlesApi: { list: () => Promise.resolve({ data: [] }) },
}));

vi.mock('recharts', () => {
  const Stub = () => null;
  return { LineChart: Stub, Line: Stub, XAxis: Stub, YAxis: Stub, Tooltip: Stub, CartesianGrid: Stub, ResponsiveContainer: Stub };
});

const OVERVIEW = {
  timeSeries: [], streak: 0, medicationAdherence: null, averages: { energy: null },
  labHistory: [], latestLabResult: null, nextAppointment: null,
  activeMedications: [{
    name: 'Levothyrox', dosage: 87.5, dosageUnit: 'MCG', intakeTimes: ['07:00'],
    dosePeriods: [{ startDate: '2026-03-01T00:00:00.000Z', slots: [{ time: '07:00', doses: [75, 100] }] }],
  }],
};

beforeAll(loadFr);

beforeEach(() => {
  overviewMock.mockResolvedValue({ data: OVERVIEW });
  useAuthStore.setState({ user: { id: 'u1', name: 'Alice Martin', email: 'alice@example.com' } as never, token: 'jwt', isLoading: false });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-17T12:00:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DashboardPage — traitement en cours', () => {
  it('affiche la posologie en vigueur avec son cycle', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><DashboardPage /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText('75 / 100 µg en alternance · 07:00')).toBeInTheDocument();
  });
});
