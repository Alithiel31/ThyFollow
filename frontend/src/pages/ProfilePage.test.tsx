// src/pages/ProfilePage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ProfilePage } from './ProfilePage';
import { useAuthStore } from '../lib/store';

const profileGetMock = vi.fn();
const profileUpdateMock = vi.fn();
const eventsMock = vi.fn();
const pdfListMock = vi.fn();
const pdfRemoveMock = vi.fn();
const pdfRemoveAllMock = vi.fn();
const consentSetMock = vi.fn();

vi.mock('../lib/api', () => ({
  authApi: {},
  profileApi: {
    get: (...args: unknown[]) => profileGetMock(...args),
    update: (...args: unknown[]) => profileUpdateMock(...args),
  },
  securityApi: {
    events: (...args: unknown[]) => eventsMock(...args),
  },
  pdfPasswordsApi: {
    list: (...args: unknown[]) => pdfListMock(...args),
    create: vi.fn(),
    remove: (...args: unknown[]) => pdfRemoveMock(...args),
    removeAll: (...args: unknown[]) => pdfRemoveAllMock(...args),
  },
  aiConsentApi: {
    set: (...args: unknown[]) => consentSetMock(...args),
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
  profileGetMock.mockResolvedValue({ data: {} });
  pdfListMock.mockResolvedValue({ data: [] });
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

describe('ProfilePage — Documents et IA', () => {
  const PASSWORDS = [
    { id: 'pw-1', label: 'Biogroup', createdAt: '2026-03-01T00:00:00Z', lastUsedAt: null },
    { id: 'pw-2', label: 'Cerba', createdAt: '2026-03-02T00:00:00Z', lastUsedAt: '2026-03-10T00:00:00Z' },
  ];

  it('l’interrupteur appelle l’API de consentement avec true puis false', async () => {
    // Faux serveur : l'état de consentement renvoyé par GET /profile suit les PUT
    let consentAt: string | null = null;
    profileGetMock.mockImplementation(() => Promise.resolve({ data: { aiExtractionConsentAt: consentAt } }));
    consentSetMock.mockImplementation((consent: boolean) => {
      consentAt = consent ? '2026-03-12T10:00:00Z' : null;
      return Promise.resolve({ data: { aiExtractionConsentAt: consentAt } });
    });
    renderProfilePage();
    const user = userEvent.setup();

    const toggle = await screen.findByRole('switch', { name: 'profile.documents.aiConsentLabel' });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    await waitFor(() => expect(consentSetMock).toHaveBeenLastCalledWith(true));
    await waitFor(() => expect(toggle).toBeChecked());
    // le store d'authentification est mis à jour (lu par l'import de bilans)
    expect(useAuthStore.getState().user?.profile?.aiExtractionConsentAt).toBe('2026-03-12T10:00:00Z');

    await user.click(toggle);
    await waitFor(() => expect(consentSetMock).toHaveBeenLastCalledWith(false));
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(consentSetMock).toHaveBeenCalledTimes(2);
  });

  it('le texte du consentement nomme le sous-traitant (Anthropic)', async () => {
    renderProfilePage();
    expect(await screen.findByText(/profile\.documents\.aiConsentText.*Anthropic/)).toBeInTheDocument();
  });

  it('supprimer un mot de passe appelle DELETE sur le bon id', async () => {
    pdfListMock.mockResolvedValue({ data: PASSWORDS });
    pdfRemoveMock.mockResolvedValue({ data: { success: true } });
    renderProfilePage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'profile.documents.delete Cerba' }));
    await waitFor(() => expect(pdfRemoveMock).toHaveBeenCalledWith('pw-2'));
  });

  it('« Tout révoquer » n’appelle l’API qu’après confirmation', async () => {
    pdfListMock.mockResolvedValue({ data: PASSWORDS });
    pdfRemoveAllMock.mockResolvedValue({ data: { success: true, deleted: 2 } });
    const confirmSpy = vi.spyOn(window, 'confirm');
    renderProfilePage();
    const user = userEvent.setup();
    const button = await screen.findByRole('button', { name: 'profile.documents.revokeAll' });

    confirmSpy.mockReturnValueOnce(false);
    await user.click(button);
    expect(pdfRemoveAllMock).not.toHaveBeenCalled();

    confirmSpy.mockReturnValueOnce(true);
    await user.click(button);
    await waitFor(() => expect(pdfRemoveAllMock).toHaveBeenCalledTimes(1));
    confirmSpy.mockRestore();
  });

  it('prévient que le serveur peut déchiffrer les mots de passe mémorisés', async () => {
    renderProfilePage();
    expect(await screen.findByText('profile.documents.passwordsNote')).toBeInTheDocument();
  });
});
