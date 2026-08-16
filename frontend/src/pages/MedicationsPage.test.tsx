// src/pages/MedicationsPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MedicationsPage } from './MedicationsPage';

const listMock = vi.fn();
const listIntakesMock = vi.fn();
const createMock = vi.fn();

vi.mock('../lib/api', () => ({
  medApi: {
    list: (...args: unknown[]) => listMock(...args),
    listIntakes: (...args: unknown[]) => listIntakesMock(...args),
    create: (...args: unknown[]) => createMock(...args),
  },
}));

const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();

vi.mock('react-hot-toast', () => ({
  default: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
  Toaster: () => null,
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MedicationsPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listMock.mockResolvedValue({ data: [] });
  listIntakesMock.mockResolvedValue({ data: [] });
});

describe('MedicationsPage — add medication form', () => {
  it('creates a medication with the filled-in name and dosage', async () => {
    createMock.mockResolvedValue({ data: {} });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'medications.addFirst' }));
    await user.type(screen.getByPlaceholderText('medications.namePlaceholder'), 'Levothyrox');
    await user.type(screen.getByPlaceholderText('75'), '75');
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Levothyrox', dosage: 75, dosageUnit: 'MCG', frequency: 'DAILY' })
    );
  });

  it('blocks submission when the required dosage field is left empty', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'medications.addFirst' }));
    await user.type(screen.getByPlaceholderText('medications.namePlaceholder'), 'Levothyrox');
    // Le champ dosage est vide et `required` : la validation HTML5 native
    // empêche l'événement submit (et donc l'appel à l'API) avant même que
    // le handler React ne s'exécute.
    expect(screen.getByPlaceholderText('75')).toBeInvalid();
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(createMock).not.toHaveBeenCalled();
  });
});
