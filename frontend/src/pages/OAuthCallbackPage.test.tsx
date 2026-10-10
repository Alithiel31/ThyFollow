// src/pages/OAuthCallbackPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OAuthCallbackPage } from './OAuthCallbackPage';
import { useAuthStore } from '../lib/store';

const exchangeOidcCodeMock = vi.fn();
const meMock = vi.fn();

vi.mock('../lib/api', () => ({
  authApi: {
    exchangeOidcCode: (...args: unknown[]) => exchangeOidcCodeMock(...args),
    me: (...args: unknown[]) => meMock(...args),
  },
}));

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
        <Route path="/dashboard" element={<div>DASHBOARD</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: null, token: null, isLoading: true });
});

describe('OAuthCallbackPage', () => {
  it('shows the error state without calling the API when the URL has no code', () => {
    renderAt('/oauth/callback');

    expect(screen.getByText('auth.oauthCallback.error')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'auth.oauthCallback.backToLogin' })).toBeInTheDocument();
    expect(exchangeOidcCodeMock).not.toHaveBeenCalled();
  });

  it('exchanges the code, stores the token before calling me(), then redirects to the dashboard', async () => {
    const user = { id: 'u1', name: 'Alice', email: 'alice@example.com' };
    exchangeOidcCodeMock.mockResolvedValue({ data: { token: 'jwt-456' } });
    // authApi.me() lit le token dans localStorage via l'intercepteur axios :
    // il doit donc y être déjà au moment de l'appel.
    meMock.mockImplementation(() => {
      expect(localStorage.getItem('thyro_token')).toBe('jwt-456');
      return Promise.resolve({ data: user });
    });

    renderAt('/oauth/callback?code=one-time-code');

    expect(screen.getByText('auth.oauthCallback.loading')).toBeInTheDocument();
    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument();
    expect(exchangeOidcCodeMock).toHaveBeenCalledTimes(1);
    expect(exchangeOidcCodeMock).toHaveBeenCalledWith('one-time-code');
    expect(useAuthStore.getState().user).toEqual(user);
    expect(useAuthStore.getState().token).toBe('jwt-456');
  });

  it('shows the error state and clears the stored token when the exchange fails', async () => {
    localStorage.setItem('thyro_token', 'stale-token');
    exchangeOidcCodeMock.mockRejectedValue(new Error('invalid code'));

    renderAt('/oauth/callback?code=bad');

    expect(await screen.findByText('auth.oauthCallback.error')).toBeInTheDocument();
    expect(localStorage.getItem('thyro_token')).toBeNull();
    expect(meMock).not.toHaveBeenCalled();
  });
});
