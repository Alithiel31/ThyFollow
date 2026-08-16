// src/pages/RegisterPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RegisterPage } from './RegisterPage';

const registerMock = vi.fn();

vi.mock('../lib/api', () => ({
  authApi: {
    register: (...args: unknown[]) => registerMock(...args),
  },
}));

function renderRegisterPage() {
  return render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RegisterPage', () => {
  it('submits the form and shows the check-your-email confirmation on success', async () => {
    registerMock.mockResolvedValue({ data: { message: 'ok' } });
    renderRegisterPage();
    const user = userEvent.setup();

    // Query par label (pas par placeholder) : garde-fou sur l'association
    // <label htmlFor>/<input id>, requise pour les lecteurs d'écran.
    await user.type(screen.getByLabelText('auth.register.fullName'), 'New User');
    await user.type(screen.getByLabelText('auth.register.email'), 'new@example.com');
    await user.type(screen.getByLabelText('auth.register.password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'auth.register.submit' }));

    expect(registerMock).toHaveBeenCalledWith({
      name: 'New User',
      email: 'new@example.com',
      password: 'password123',
      birthDate: '',
    });
    expect(await screen.findByText(/checkEmailSubtitle/)).toBeInTheDocument();
  });

  it('declares the 8-character minimum on the password field (native HTML5 validation)', () => {
    renderRegisterPage();

    const passwordInput = screen.getByLabelText('auth.register.password');
    expect(passwordInput).toHaveAttribute('minlength', '8');
    expect(passwordInput).toBeRequired();
  });
});
