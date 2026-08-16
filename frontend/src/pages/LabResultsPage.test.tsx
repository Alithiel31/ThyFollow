// src/pages/LabResultsPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { LabResultsPage } from './LabResultsPage';

const listMock = vi.fn();
const createMock = vi.fn();

vi.mock('../lib/api', () => ({
  labApi: {
    list: (...args: unknown[]) => listMock(...args),
    create: (...args: unknown[]) => createMock(...args),
  },
}));

vi.mock('../lib/store', () => ({
  useAuthStore: () => ({ user: { profile: {} } }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LabResultsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listMock.mockResolvedValue({ data: [] });
});

describe('LabResultsPage — add lab result form', () => {
  it('creates a lab result with the filled-in date and TSH value', async () => {
    createMock.mockResolvedValue({ data: {} });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'labResults.addFirst' }));
    // Query par label : garde-fou sur l'association <label htmlFor>/<input id>
    // du wrapper Field (voir LabResultsPage.tsx).
    await user.type(screen.getByLabelText('labResults.date'), '2026-08-10');
    await user.type(screen.getByLabelText('TSH (mUI/L)'), '1.5');
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-08-10', tsh: 1.5 })
    );
  });

  it('does not call the API when the required date is left empty', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'labResults.addFirst' }));
    await user.type(screen.getByLabelText('TSH (mUI/L)'), '1.5');
    // Le champ date est vide et `required` : la validation HTML5 native
    // empêche l'événement submit avant même que le handler React ne s'exécute.
    expect(screen.getByLabelText('labResults.date')).toBeInvalid();
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(createMock).not.toHaveBeenCalled();
  });
});
