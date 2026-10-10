// src/pages/LogPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LogPage } from './LogPage';

const getByDateMock = vi.fn();
const upsertMock = vi.fn();

vi.mock('../lib/api', () => ({
  entriesApi: {
    getByDate: (...args: unknown[]) => getByDateMock(...args),
    upsert: (...args: unknown[]) => upsertMock(...args),
  },
}));

function renderAt(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/log/:date" element={<LogPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LogPage', () => {
  it('fills the form from the entry saved for the date', async () => {
    getByDateMock.mockResolvedValue({
      data: { date: '2026-01-10', medicationTaken: true, tags: [] },
    });

    renderAt('/log/2026-01-10');

    expect(await screen.findByText('log.medicationTaken')).toBeInTheDocument();
    expect(getByDateMock).toHaveBeenCalledWith('2026-01-10');
  });

  it('starts from an empty form when no entry exists for the date', async () => {
    getByDateMock.mockResolvedValue({ data: null });

    renderAt('/log/2026-01-10');

    expect(await screen.findByText('log.medicationTakenQuestion')).toBeInTheDocument();
  });

  it('resets the form when navigating to another date without an entry', async () => {
    getByDateMock.mockResolvedValue({ data: null });
    renderAt('/log/2026-01-10');
    const user = userEvent.setup();

    // Édition locale du jour affiché...
    await user.click(await screen.findByText('log.medicationTakenQuestion'));
    expect(screen.getByText('log.medicationTaken')).toBeInTheDocument();

    // ...puis passage à la veille : le formulaire repart de zéro.
    const [previousDay] = screen.getAllByRole('button');
    await user.click(previousDay);

    expect(await screen.findByText('log.medicationTakenQuestion')).toBeInTheDocument();
    expect(getByDateMock).toHaveBeenLastCalledWith('2026-01-09');
  });

  it('resets the form when returning to an already cached date, even if both dates are empty', async () => {
    // Sans entrée, la donnée reste `null` d'une date à l'autre : le formulaire
    // ne doit pas dépendre d'un changement de données pour se réinitialiser,
    // seul le changement de date (donnée déjà en cache) le déclenche.
    getByDateMock.mockResolvedValue({ data: null });
    renderAt('/log/2026-01-10');
    const user = userEvent.setup();

    await screen.findByText('log.medicationTakenQuestion');
    await user.click(screen.getAllByRole('button')[0]); // → 2026-01-09, pas encore en cache
    await user.click(await screen.findByText('log.medicationTakenQuestion'));
    expect(screen.getByText('log.medicationTaken')).toBeInTheDocument();

    // Boutons re-sélectionnés : la page est remplacée par un spinner pendant
    // le chargement d'une date, les éléments précédents ne sont plus dans le DOM.
    await user.click(screen.getAllByRole('button')[1]); // → 2026-01-10, déjà en cache
    expect(await screen.findByText('log.medicationTakenQuestion')).toBeInTheDocument();
    expect(getByDateMock).toHaveBeenLastCalledWith('2026-01-10');
  });

  it('saves the edited form for the displayed date', async () => {
    getByDateMock.mockResolvedValue({ data: null });
    upsertMock.mockResolvedValue({ data: {} });
    renderAt('/log/2026-01-10');
    const user = userEvent.setup();

    await user.click(await screen.findByText('log.medicationTakenQuestion'));
    await user.click(screen.getByRole('button', { name: /log\.save/ }));

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0][0]).toMatchObject({
      date: '2026-01-10',
      medicationTaken: true,
    });
  });
});
