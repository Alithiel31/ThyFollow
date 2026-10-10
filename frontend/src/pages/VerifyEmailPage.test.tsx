// src/pages/VerifyEmailPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { VerifyEmailPage } from './VerifyEmailPage';
import { useAuthStore } from '../lib/store';

const verifyEmailMock = vi.fn();

vi.mock('../lib/api', () => ({
  authApi: {
    verifyEmail: (...args: unknown[]) => verifyEmailMock(...args),
  },
}));

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/dashboard" element={<div>DASHBOARD</div>} />
        <Route path="/login" element={<div>LOGIN</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: null, token: null, isLoading: true });
});

describe('VerifyEmailPage', () => {
  it('shows the error state without calling the API when the URL has no token', () => {
    renderAt('/verify-email');

    expect(screen.getByText('auth.verify.errorTitle')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'auth.register.signIn' })).toBeInTheDocument();
    expect(verifyEmailMock).not.toHaveBeenCalled();
  });

  it('starts in the verifying state, then logs the user in and redirects to the dashboard', async () => {
    const user = { id: 'u1', name: 'Alice', email: 'alice@example.com' };
    verifyEmailMock.mockResolvedValue({ data: { user, token: 'jwt-123' } });

    renderAt('/verify-email?token=abc');

    expect(screen.getByText('auth.verify.pendingTitle')).toBeInTheDocument();
    expect(verifyEmailMock).toHaveBeenCalledTimes(1);
    expect(verifyEmailMock).toHaveBeenCalledWith('abc');

    expect(await screen.findByText('auth.verify.successTitle')).toBeInTheDocument();
    expect(useAuthStore.getState().user).toEqual(user);
    expect(useAuthStore.getState().token).toBe('jwt-123');

    // La redirection est différée de 1,5 s (le temps de lire le message).
    expect(await screen.findByText('DASHBOARD', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('shows the error state when the token is rejected', async () => {
    verifyEmailMock.mockRejectedValue(new Error('invalid token'));

    renderAt('/verify-email?token=bad');

    expect(await screen.findByText('auth.verify.errorTitle')).toBeInTheDocument();
    expect(useAuthStore.getState().user).toBeNull();
  });
});
