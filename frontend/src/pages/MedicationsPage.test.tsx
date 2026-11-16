// src/pages/MedicationsPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MedicationsPage } from './MedicationsPage';
import { toISODate } from '../lib/utils';
import type { Medication, MedicationDoseChange } from '../types';

const listMock = vi.fn();
const listIntakesMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();
const deleteDoseChangeMock = vi.fn();

vi.mock('../lib/api', () => ({
  medApi: {
    list: (...args: unknown[]) => listMock(...args),
    listIntakes: (...args: unknown[]) => listIntakesMock(...args),
    create: (...args: unknown[]) => createMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    deleteDoseChange: (...args: unknown[]) => deleteDoseChangeMock(...args),
  },
}));

// Dates sans heure : parseISO les lit en heure locale, le rendu ne dépend pas du fuseau
const OLDEST: MedicationDoseChange = { id: 'chg-1', dosage: 75, dosageUnit: 'MCG', effectiveFrom: '2025-01-10', reason: null, createdAt: '2025-01-10' };
const LATEST: MedicationDoseChange = { id: 'chg-2', dosage: 88, dosageUnit: 'MCG', effectiveFrom: '2026-03-03', reason: 'TSH 6,2', createdAt: '2026-03-03' };

function medication(doseChanges: MedicationDoseChange[]): Medication {
  return {
    id: 'm1', name: 'Levothyrox', brand: null, dosage: doseChanges[0].dosage, dosageUnit: doseChanges[0].dosageUnit,
    frequency: 'DAILY', intakeTimes: [], startDate: '2025-01-10', endDate: null, active: true,
    instructions: null, notes: null, doseChanges,
  };
}

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

describe('MedicationsPage — historique de posologie', () => {
  beforeEach(() => {
    updateMock.mockResolvedValue({ data: {} });
  });

  it('éditer sans toucher la dose : pas de case « changement de dose »', async () => {
    listMock.mockResolvedValue({ data: [medication([LATEST])] });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText(/Levothyrox/));
    await user.type(screen.getByPlaceholderText('medications.notesPlaceholder'), 'le matin');

    expect(screen.queryByLabelText('medications.doseChange.declare')).toBeNull();
  });

  it('modifier la dose et cocher la case : doseChange daté d’aujourd’hui est envoyé', async () => {
    listMock.mockResolvedValue({ data: [medication([LATEST])] });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText(/Levothyrox/));
    const dosage = screen.getByPlaceholderText('75');
    await user.clear(dosage);
    await user.type(dosage, '100');
    await user.click(screen.getByLabelText('medications.doseChange.declare'));
    await user.click(screen.getByRole('button', { name: 'common.update' }));

    expect(updateMock).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ dosage: 100, doseChange: { effectiveFrom: toISODate(new Date()) } })
    );
  });

  it('modifier la dose sans cocher : update est appelé sans doseChange', async () => {
    listMock.mockResolvedValue({ data: [medication([LATEST])] });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText(/Levothyrox/));
    const dosage = screen.getByPlaceholderText('75');
    await user.clear(dosage);
    await user.type(dosage, '100');
    expect(screen.getByLabelText('medications.doseChange.declare')).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'common.update' }));

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0]).toBe('m1');
    expect(updateMock.mock.calls[0][1]).toEqual(expect.objectContaining({ dosage: 100 }));
    expect(updateMock.mock.calls[0][1]).not.toHaveProperty('doseChange');
  });

  it('deux lignes : « depuis le » date de la plus récente, une seule ligne supprimable', async () => {
    listMock.mockResolvedValue({ data: [medication([LATEST, OLDEST])] });
    renderPage();

    await screen.findByText(/Levothyrox/);
    // La ligne de date reprend la dose et la date d'effet de la ligne la plus récente
    expect(screen.getByText(/medications\.doseSince:/).textContent).toMatch(/"dose":"88 medications\.dosageUnits\.MCG"/);
    expect(screen.getByText(/medications\.doseSince:/).textContent).toMatch(/"date":"3 (mars|March) 2026"/);
    expect(screen.queryByText(/^medications\.since:/)).toBeNull();
    // Historique : la plus ancienne (chg-1) n'a pas de corbeille
    expect(screen.getByText(/medications\.doseChange\.history:/).textContent).toContain('"count":2');
    expect(screen.getAllByRole('button', { name: 'medications.doseChange.delete' })).toHaveLength(1);
  });
});
