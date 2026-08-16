// src/pages/LoginPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from './LoginPage';

const loginMock = vi.fn();
const resendVerificationMock = vi.fn();

vi.mock('../lib/api', () => ({
  authApi: {
    login: (...args: unknown[]) => loginMock(...args),
    resendVerification: (...args: unknown[]) => resendVerificationMock(...args),
  },
}));

const setAuthMock = vi.fn();

vi.mock('../lib/store', () => ({
  useAuthStore: () => ({ setAuth: setAuthMock }),
}));

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<div>dashboard-screen</div>} />
      </Routes>
    </MemoryRouter>
  );
}

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  // Query par label (pas par placeholder) : garde-fou sur l'association
  // <label htmlFor>/<input id>, requise pour les lecteurs d'écran.
  await user.type(screen.getByLabelText('auth.login.email'), email);
  await user.type(screen.getByLabelText('auth.login.password'), password);
  await user.click(screen.getByRole('button', { name: 'auth.login.submit' }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LoginPage', () => {
  it('logs in and navigates to the dashboard on success', async () => {
    loginMock.mockResolvedValue({ data: { user: { id: 'user-1' }, token: 'jwt-token' } });
    renderLoginPage();

    await fillAndSubmit('user@example.com', 'correct-password');

    await waitFor(() => expect(screen.getByText('dashboard-screen')).toBeInTheDocument());
    expect(loginMock).toHaveBeenCalledWith('user@example.com', 'correct-password');
    expect(setAuthMock).toHaveBeenCalledWith({ id: 'user-1' }, 'jwt-token');
  });

  it('stays on the login page and does not authenticate on invalid credentials', async () => {
    loginMock.mockRejectedValue({ response: { data: { error: 'invalid credentials' } } });
    renderLoginPage();

    await fillAndSubmit('user@example.com', 'wrong-password');

    await waitFor(() => expect(loginMock).toHaveBeenCalled());
    expect(setAuthMock).not.toHaveBeenCalled();
    expect(screen.queryByText('dashboard-screen')).not.toBeInTheDocument();
  });

  it('offers to resend the verification email when the account is unverified', async () => {
    loginMock.mockRejectedValue({ response: { data: { error: 'not verified', code: 'EMAIL_NOT_VERIFIED' } } });
    resendVerificationMock.mockResolvedValue({});
    renderLoginPage();

    await fillAndSubmit('unverified@example.com', 'correct-password');

    const resendButton = await screen.findByRole('button', { name: 'auth.login.resendVerification' });
    await userEvent.setup().click(resendButton);

    expect(resendVerificationMock).toHaveBeenCalledWith('unverified@example.com');
  });
});
