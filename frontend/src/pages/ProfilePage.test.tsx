// src/pages/ProfilePage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ProfilePage } from './ProfilePage';
import { useAuthStore } from '../lib/store';

const profileGetMock = vi.fn();
const profileUpdateMock = vi.fn();
const eventsMock = vi.fn();

vi.mock('../lib/api', () => ({
  authApi: {},
  profileApi: {
    get: (...args: unknown[]) => profileGetMock(...args),
    update: (...args: unknown[]) => profileUpdateMock(...args),
  },
  securityApi: {
    events: (...args: unknown[]) => eventsMock(...args),
  },
}));

function renderProfilePage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  eventsMock.mockResolvedValue({ data: [] });
  useAuthStore.setState({
    user: { id: 'u1', name: 'Alice Martin', email: 'alice@example.com' } as never,
    token: 'jwt',
    isLoading: false,
  });
});

describe('ProfilePage', () => {
  it('fills the form from the loaded profile, with the save button inactive', async () => {
    profileGetMock.mockResolvedValue({
      data: { endocrinologistName: 'Dr Durand', targetTSH_min: 0.5, targetTSH_max: 3.5 },
    });

    renderProfilePage();

    expect(await screen.findByLabelText('profile.endocrinologistName')).toHaveValue('Dr Durand');
    expect(screen.getByLabelText('profile.tshMin')).toHaveValue(0.5);
    expect(screen.getByLabelText('profile.tshMax')).toHaveValue(3.5);
    expect(screen.getByRole('button', { name: 'profile.saveButton.saved' })).toBeDisabled();
  });

  it('enables saving after an edit and sends the whole form to the API', async () => {
    profileGetMock.mockResolvedValue({
      data: { endocrinologistName: 'Dr Durand', targetTSH_min: 0.5 },
    });
    profileUpdateMock.mockResolvedValue({ data: {} });
    renderProfilePage();
    const user = userEvent.setup();

    const input = await screen.findByLabelText('profile.endocrinologistName');
    await user.clear(input);
    await user.type(input, 'Dr Petit');
    await user.click(screen.getByRole('button', { name: 'profile.saveButton.dirty' }));

    expect(profileUpdateMock).toHaveBeenCalledTimes(1);
    expect(profileUpdateMock.mock.calls[0][0]).toMatchObject({
      endocrinologistName: 'Dr Petit',
      targetTSH_min: 0.5,
    });
  });
});
