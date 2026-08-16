// src/pages/ProfilePage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ProfilePage } from './ProfilePage';

const getProfileMock = vi.fn();
const updateProfileMock = vi.fn();
const securityEventsMock = vi.fn();

vi.mock('../lib/api', () => ({
  profileApi: {
    get: (...args: unknown[]) => getProfileMock(...args),
    update: (...args: unknown[]) => updateProfileMock(...args),
  },
  securityApi: {
    events: (...args: unknown[]) => securityEventsMock(...args),
  },
  authApi: {
    me: vi.fn(),
    linkGoogle: vi.fn(),
    unlinkGoogle: vi.fn(),
  },
}));

vi.mock('../lib/store', () => ({
  useAuthStore: () => ({
    user: { name: 'Test User', email: 'user@example.com', oauthAccounts: [] },
    token: 'jwt-token',
    logout: vi.fn(),
    setAuth: vi.fn(),
  }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getProfileMock.mockResolvedValue({ data: {} });
  securityEventsMock.mockResolvedValue({ data: [] });
});

describe('ProfilePage', () => {
  it('keeps the save button disabled until a field is edited', async () => {
    renderPage();

    const saveButton = await screen.findByRole('button', { name: 'profile.saveButton.saved' });
    expect(saveButton).toBeDisabled();
  });

  it('enables saving after an edit and submits the updated profile', async () => {
    updateProfileMock.mockResolvedValue({ data: {} });
    renderPage();
    const user = userEvent.setup();

    const endocrinologistInput = await screen.findByLabelText('profile.endocrinologistName');
    await user.type(endocrinologistInput, 'Dr. Martin');

    const saveButton = screen.getByRole('button', { name: 'profile.saveButton.dirty' });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    expect(updateProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({ endocrinologistName: 'Dr. Martin' })
    );
  });
});
