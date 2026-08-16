// src/pages/AppointmentsPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AppointmentsPage } from './AppointmentsPage';

const listMock = vi.fn();
const createMock = vi.fn();

vi.mock('../lib/api', () => ({
  apptApi: {
    list: (...args: unknown[]) => listMock(...args),
    create: (...args: unknown[]) => createMock(...args),
  },
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AppointmentsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listMock.mockResolvedValue({ data: [] });
});

describe('AppointmentsPage — add appointment form', () => {
  it('creates an appointment with the filled-in date/time and default type', async () => {
    createMock.mockResolvedValue({ data: {} });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'appointments.addFirst' }));
    await user.type(screen.getByLabelText('appointments.dateTime'), '2026-08-20T14:30');
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-08-20T14:30', type: 'ENDOCRINOLOGIST' })
    );
  });

  it('does not call the API when the required date/time is left empty', async () => {
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'appointments.addFirst' }));
    expect(screen.getByLabelText('appointments.dateTime')).toBeInvalid();
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(createMock).not.toHaveBeenCalled();
  });
});
