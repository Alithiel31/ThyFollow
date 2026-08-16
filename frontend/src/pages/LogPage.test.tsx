// src/pages/LogPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LogPage } from './LogPage';

const getByDateMock = vi.fn();
const upsertMock = vi.fn();

vi.mock('../lib/api', () => ({
  entriesApi: {
    getByDate: (...args: unknown[]) => getByDateMock(...args),
    upsert: (...args: unknown[]) => upsertMock(...args),
  },
}));

function renderLogPage(date: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/log/${date}`]}>
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
  it('marks the form dirty and saves the merged entry for the current date', async () => {
    getByDateMock.mockResolvedValue({ data: null });
    upsertMock.mockResolvedValue({ data: {} });
    renderLogPage('2026-08-10');
    const user = userEvent.setup();

    // Score 1/5 du tout premier champ noté (ScoreRow) de la section bien-être.
    const scoreButtons = await screen.findAllByTitle('1/5');
    await user.click(scoreButtons[0]);

    await user.click(screen.getByRole('button', { name: 'log.saveButton.dirty' }));

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-08-10', energyLevel: 1 })
    );
  });

  it('disables navigating to a future date from today', async () => {
    getByDateMock.mockResolvedValue({ data: null });
    const today = new Date().toISOString().slice(0, 10);
    renderLogPage(today);

    const nextButtons = await screen.findAllByRole('button');
    const nextDayButton = nextButtons.find((b) => b.querySelector('svg.lucide-chevron-right'));

    expect(nextDayButton).toBeDisabled();
  });
});
