// src/pages/DashboardPage.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from './DashboardPage';
import { useAuthStore } from '../lib/store';

const overviewMock = vi.fn();
const tipsMock = vi.fn();

vi.mock('../lib/api', () => ({
  analyticsApi: { overview: (...args: unknown[]) => overviewMock(...args) },
  articlesApi: { list: (...args: unknown[]) => tipsMock(...args) },
}));

// ResponsiveContainer mesure son parent : sans dimensions réelles sous jsdom
// il ne rend rien et loggue des avertissements. Le graphique n'est pas
// l'objet de ces tests.
vi.mock('recharts', () => {
  const Stub = () => null;
  return {
    LineChart: Stub,
    Line: Stub,
    XAxis: Stub,
    YAxis: Stub,
    Tooltip: Stub,
    CartesianGrid: Stub,
    ResponsiveContainer: Stub,
  };
});

const OVERVIEW = {
  timeSeries: [],
  streak: 3,
  medicationAdherence: null,
  averages: { energy: null },
  labHistory: [],
  latestLabResult: null,
  nextAppointment: null,
  activeMedications: [],
};

const DAY_MS = 86_400_000;

const TIPS = [
  { id: 't0', slug: 'tip-0', title: 'Astuce zéro', content: 'contenu 0' },
  { id: 't1', slug: 'tip-1', title: 'Astuce un', content: 'contenu 1' },
  { id: 't2', slug: 'tip-2', title: 'Astuce deux', content: 'contenu 2' },
];

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  overviewMock.mockResolvedValue({ data: OVERVIEW });
  useAuthStore.setState({
    user: { id: 'u1', name: 'Alice Martin', email: 'alice@example.com' } as never,
    token: 'jwt',
    isLoading: false,
  });
  // Seule Date est simulée : les timers réels restent utilisables par
  // react-query et Testing Library.
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DashboardPage', () => {
  it('greets the user by first name', async () => {
    vi.setSystemTime(new Date(DAY_MS * 20_000));
    tipsMock.mockResolvedValue({ data: [] });

    renderDashboard();

    expect(await screen.findByText(/dashboard\.greeting/)).toHaveTextContent('"name":"Alice"');
  });

  it('shows the tip of the day, picked from the day number modulo the tip count', async () => {
    // 20 001 % 3 === 0 → première astuce.
    vi.setSystemTime(new Date(DAY_MS * 20_001 + 3_600_000));
    tipsMock.mockResolvedValue({ data: TIPS });

    renderDashboard();

    expect(await screen.findByText('Astuce zéro')).toBeInTheDocument();
    expect(screen.queryByText('Astuce un')).not.toBeInTheDocument();
    expect(screen.queryByText('Astuce deux')).not.toBeInTheDocument();
  });

  it('rotates to the next tip on the next day', async () => {
    // 20 002 % 3 === 1 → deuxième astuce.
    vi.setSystemTime(new Date(DAY_MS * 20_002 + 3_600_000));
    tipsMock.mockResolvedValue({ data: TIPS });

    renderDashboard();

    expect(await screen.findByText('Astuce un')).toBeInTheDocument();
    expect(screen.queryByText('Astuce zéro')).not.toBeInTheDocument();
  });

  it('shows no tip card when there is no published tip', async () => {
    vi.setSystemTime(new Date(DAY_MS * 20_000));
    tipsMock.mockResolvedValue({ data: [] });

    renderDashboard();

    await screen.findByText(/dashboard\.greeting/);
    expect(screen.queryByText('Astuce zéro')).not.toBeInTheDocument();
  });
});
