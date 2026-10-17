// src/components/LabImport.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LabImport } from './LabImport';
import { useAuthStore } from '../lib/store';
import type { ImportFileResult } from '../types';

const importFilesMock = vi.fn();
const confirmImportMock = vi.fn();
const discardImportMock = vi.fn();

vi.mock('../lib/api', () => ({
  labApi: {
    importFiles: (...args: unknown[]) => importFilesMock(...args),
    confirmImport: (...args: unknown[]) => confirmImportMock(...args),
    discardImport: (...args: unknown[]) => discardImportMock(...args),
    downloadDocument: vi.fn(),
  },
}));

const pdf = (name: string) => new File(['%PDF-1.7'], name, { type: 'application/pdf' });

const readyResult = (filename: string, extra: Partial<ImportFileResult> = {}): ImportFileResult => ({
  filename,
  status: 'ready',
  documentId: `doc-${filename}`,
  draft: {
    date: '2026-03-12', dateConfidence: 'high', lab: 'Biogroup', orderedBy: null,
    values: { tsh: 2.35, ferritin: 64 }, flags: [], insufficient: false, method: 'rules', conflicts: [],
  },
  ...extra,
});

function renderImport() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LabImport onClose={() => undefined} />
    </QueryClientProvider>
  );
}

const dropInput = () => screen.getByLabelText('labImport.dropLabel') as HTMLInputElement;

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: null });
});

describe('LabImport', () => {
  it('affiche la zone de dépôt', () => {
    renderImport();
    expect(dropInput()).toBeInTheDocument();
    expect(screen.getByText('labImport.dropLabel')).toBeInTheDocument();
  });

  it('dépose 2 fichiers : 2 lignes avec leurs statuts', async () => {
    importFilesMock.mockResolvedValue({
      data: { results: [readyResult('a.pdf'), { filename: 'b.pdf', status: 'invalid' }] },
    });
    renderImport();
    await userEvent.setup().upload(dropInput(), [pdf('a.pdf'), pdf('b.pdf')]);

    expect(await screen.findByText('labImport.status.ready')).toBeInTheDocument();
    expect(screen.getByText('labImport.status.invalid')).toBeInTheDocument();
    expect(screen.getByText('a.pdf')).toBeInTheDocument();
    expect(screen.getByText('b.pdf')).toBeInTheDocument();
    expect(importFilesMock).toHaveBeenCalledTimes(1);
    expect(importFilesMock.mock.calls[0][0]).toHaveLength(2);
  });

  it('ignore les fichiers qui ne sont pas des PDF', async () => {
    renderImport();
    // `applyAccept: false` : on simule un fichier déposé par glisser-déposer
    await userEvent.setup({ applyAccept: false }).upload(dropInput(), new File(['x'], 'note.txt', { type: 'text/plain' }));
    expect(importFilesMock).not.toHaveBeenCalled();
  });

  it('une ligne password_required affiche un champ mot de passe et renvoie le fichier avec password et remember', async () => {
    importFilesMock
      .mockResolvedValueOnce({ data: { results: [{ filename: 'p.pdf', status: 'password_required' }] } })
      .mockResolvedValueOnce({ data: { results: [readyResult('p.pdf')] } });
    renderImport();
    const user = userEvent.setup();
    await user.upload(dropInput(), pdf('p.pdf'));

    const passwordInput = await screen.findByLabelText('labImport.password');
    await user.type(passwordInput, 's3cret');
    await user.click(screen.getByLabelText('labImport.rememberPassword'));
    await user.type(screen.getByLabelText('labImport.passwordLabel'), 'Biogroup');
    await user.click(screen.getByRole('button', { name: 'labImport.retry' }));

    await waitFor(() => expect(importFilesMock).toHaveBeenCalledTimes(2));
    const [files, opts] = importFilesMock.mock.calls[1];
    expect(files).toHaveLength(1);
    expect(opts).toEqual({ password: 's3cret', remember: true, passwordLabel: 'Biogroup' });
    expect(await screen.findByText('labImport.status.ready')).toBeInTheDocument();
  });

  it('confirmer envoie les valeurs MODIFIÉES par l’utilisateur', async () => {
    importFilesMock.mockResolvedValue({ data: { results: [readyResult('c.pdf')] } });
    confirmImportMock.mockResolvedValue({ data: {} });
    renderImport();
    const user = userEvent.setup();
    await user.upload(dropInput(), pdf('c.pdf'));

    const tshField = await screen.findByLabelText('labImport.markers.tsh');
    expect(tshField).toHaveValue('2.35');
    await user.clear(tshField);
    await user.type(tshField, '3,10');
    await user.click(screen.getByRole('button', { name: 'labImport.addToLog' }));

    await waitFor(() => expect(confirmImportMock).toHaveBeenCalledTimes(1));
    const [documentId, payload] = confirmImportMock.mock.calls[0];
    expect(documentId).toBe('doc-c.pdf');
    expect(payload).toMatchObject({ date: '2026-03-12', lab: 'Biogroup', tsh: 3.1, ferritin: 64 });
    expect(payload.orderedBy).toBeNull();
    // la ligne disparaît une fois ajoutée
    await waitFor(() => expect(screen.queryByText('c.pdf')).not.toBeInTheDocument());
  });

  it('un doublon possible affiche l’avertissement', async () => {
    importFilesMock.mockResolvedValue({
      data: { results: [readyResult('d.pdf', { possibleDuplicateOf: { labResultId: 'lab-1' } })] },
    });
    renderImport();
    await userEvent.setup().upload(dropInput(), pdf('d.pdf'));
    expect(await screen.findByText('labImport.possibleDuplicate')).toBeInTheDocument();
  });

  it('affiche les deux lectures quand elles divergent (valeur, valeur absente, date)', async () => {
    importFilesMock.mockResolvedValue({
      data: {
        results: [
          readyResult('x.pdf', {
            draft: {
              date: '2025-01-01', dateConfidence: 'low', lab: 'Biogroup', orderedBy: null,
              values: { tsh: 3.1, ferritin: 64 }, flags: [], insufficient: false, method: 'both',
              conflicts: [
                { field: 'tsh', rules: 8, ai: 3.1 },
                { field: 'ferritin', rules: 64, ai: null },
                { field: 'date', rules: '2026-03-12', ai: '2025-01-01' },
              ],
            },
          }),
        ],
      },
    });
    renderImport();
    await userEvent.setup().upload(dropInput(), pdf('x.pdf'));

    expect(await screen.findByText('labImport.method.both')).toBeInTheDocument();
    const notes = screen.getAllByRole('note').map((n) => n.textContent);
    expect(notes).toHaveLength(3);
    expect(notes.join('|')).toContain('"rules":"8","ai":"3.1"');
    expect(notes.join('|')).toContain('"rules":"64","ai":"labImport.conflictNone"');
    expect(notes.join('|')).toContain('"rules":"2026-03-12","ai":"2025-01-01"');
  });

  it('sans divergence, aucune note « à vérifier »', async () => {
    importFilesMock.mockResolvedValue({ data: { results: [readyResult('y.pdf')] } });
    renderImport();
    await userEvent.setup().upload(dropInput(), pdf('y.pdf'));
    await screen.findByText('labImport.status.ready');
    expect(screen.queryAllByRole('note')).toHaveLength(0);
  });

  it('un PDF déjà au carnet (duplicate) n’a pas d’écran de vérification', async () => {
    importFilesMock.mockResolvedValue({
      data: { results: [{ filename: 'e.pdf', status: 'duplicate', duplicateOf: { labResultId: 'lab-1' } }] },
    });
    renderImport();
    await userEvent.setup().upload(dropInput(), pdf('e.pdf'));
    expect(await screen.findByText('labImport.duplicate')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'labImport.addToLog' })).not.toBeInTheDocument();
  });

  it('« Ignorer » rejette le brouillon côté serveur', async () => {
    importFilesMock.mockResolvedValue({ data: { results: [readyResult('f.pdf')] } });
    discardImportMock.mockResolvedValue({ data: {} });
    renderImport();
    const user = userEvent.setup();
    await user.upload(dropInput(), pdf('f.pdf'));
    await user.click(await screen.findByRole('button', { name: 'labImport.discard' }));
    await waitFor(() => expect(discardImportMock).toHaveBeenCalledWith('doc-f.pdf'));
  });

  it('« Réessayer avec l’IA » n’apparaît qu’avec le consentement, et renvoie le fichier avec forceAi', async () => {
    importFilesMock.mockResolvedValue({ data: { results: [readyResult('g.pdf')] } });
    const user = userEvent.setup();

    const { unmount } = renderImport();
    await user.upload(dropInput(), pdf('g.pdf'));
    await screen.findByText('labImport.status.ready');
    expect(screen.queryByRole('button', { name: /labImport.retryAi/ })).not.toBeInTheDocument();
    unmount();

    useAuthStore.setState({
      user: { id: 'u', email: 'e', name: 'n', role: 'USER', createdAt: '', profile: { timezone: 'Europe/Paris', weightUnit: 'KG', temperatureUnit: 'CELSIUS', aiExtractionConsentAt: '2026-03-01T00:00:00Z' } },
    } as never);
    renderImport();
    await user.upload(dropInput(), pdf('g.pdf'));
    await user.click(await screen.findByRole('button', { name: /labImport.retryAi/ }));
    await waitFor(() => expect(importFilesMock).toHaveBeenLastCalledWith(expect.any(Array), { forceAi: true }));
  });
});
