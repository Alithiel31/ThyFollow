// src/pages/MedicationsPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MedicationsPage } from './MedicationsPage';
import { toISODate } from '../lib/utils';
import type { Medication } from '../types';

const listMock = vi.fn();
const listIntakesMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();
const addDosePeriodMock = vi.fn();
const updateDosePeriodMock = vi.fn();
const deleteDosePeriodMock = vi.fn();

vi.mock('../lib/api', () => ({
  medApi: {
    list: (...args: unknown[]) => listMock(...args),
    listIntakes: (...args: unknown[]) => listIntakesMock(...args),
    create: (...args: unknown[]) => createMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    addDosePeriod: (...args: unknown[]) => addDosePeriodMock(...args),
    updateDosePeriod: (...args: unknown[]) => updateDosePeriodMock(...args),
    deleteDosePeriod: (...args: unknown[]) => deleteDosePeriodMock(...args),
  },
}));

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

// Clés renvoyées par le `t` des tests (voir src/test/setup.ts).
const timeLabel = (index: number) => `medications.scheduleEditor.time:{"index":${index}}`;
const doseLabel = (index: number) => `medications.scheduleEditor.dose:{"index":${index}}`;
const cellLabel = (day: number, index: number) => `medications.scheduleEditor.dayCell:{"day":${day},"index":${index}}`;

const LEVO: Medication = {
  id: 'med-1', name: 'Levothyrox', dosage: 75, dosageUnit: 'MCG', frequency: 'DAILY', intakeTimes: ['07:00'],
  startDate: '2025-01-01T00:00:00.000Z', active: true, showOnChart: true,
  dosePeriods: [{ id: 'p-1', startDate: '2025-01-01T00:00:00.000Z', slots: [{ time: '07:00', doses: [75] }] }],
};

async function openNewForm() {
  const user = userEvent.setup();
  renderPage();
  await user.click(await screen.findByRole('button', { name: 'medications.addFirst' }));
  await user.type(screen.getByPlaceholderText('medications.namePlaceholder'), 'Levothyrox');
  return user;
}

async function openEditForm() {
  listMock.mockResolvedValue({ data: [LEVO] });
  const user = userEvent.setup();
  renderPage();
  await user.click(await screen.findByText('Levothyrox'));
  return user;
}

describe('MedicationsPage — add medication form', () => {
  it('creates a medication with the filled-in name and dosage', async () => {
    createMock.mockResolvedValue({ data: {} });
    const user = await openNewForm();
    await user.type(screen.getByPlaceholderText('75'), '75');
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Levothyrox', dosageUnit: 'MCG', frequency: 'DAILY', showOnChart: true,
      slots: [{ time: '07:00', doses: [75] }],
    }));
    expect(createMock.mock.calls[0][0]).not.toHaveProperty('dosage');
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

describe('MedicationsPage — éditeur de posologie', () => {
  it('mode simple : une seule ligne de prise, pas de grille', async () => {
    await openNewForm();
    expect(screen.getAllByLabelText(/medications\.scheduleEditor\.time/)).toHaveLength(1);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('alternance 75 / 100 à 07:00 → create reçoit un cycle de 2 jours', async () => {
    createMock.mockResolvedValue({ data: {} });
    const user = await openNewForm();
    await user.click(screen.getByLabelText('medications.scheduleEditor.perDay'));
    expect(screen.getByRole('table')).toBeInTheDocument();
    await user.type(screen.getByLabelText(cellLabel(1, 1)), '75');
    await user.type(screen.getByLabelText(cellLabel(2, 1)), '100');
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(createMock.mock.calls[0][0].slots).toEqual([{ time: '07:00', doses: [75, 100] }]);
  });

  it('50 à 07:00 + 25 à 20:00 → create reçoit deux créneaux', async () => {
    createMock.mockResolvedValue({ data: {} });
    const user = await openNewForm();
    await user.type(screen.getByLabelText(doseLabel(1)), '50');
    await user.click(screen.getByRole('button', { name: /medications\.scheduleEditor\.addSlot/ }));
    fireEvent.change(screen.getByLabelText(timeLabel(2)), { target: { value: '20:00' } });
    await user.type(screen.getByLabelText(doseLabel(2)), '25');
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(createMock.mock.calls[0][0].slots).toEqual([
      { time: '07:00', doses: [50] },
      { time: '20:00', doses: [25] },
    ]);
  });

  it('refuse un jour du cycle sans aucune dose', async () => {
    const user = await openNewForm();
    await user.click(screen.getByLabelText('medications.scheduleEditor.perDay'));
    await user.type(screen.getByLabelText(cellLabel(1, 1)), '75');
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(createMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith('medications.scheduleEditor.invalid');
  });

  it('unité « mg » → la case graphique est désactivée et décochée', async () => {
    const user = await openNewForm();
    const chart = screen.getByLabelText(/medications\.scheduleEditor\.showOnChart$/) as HTMLInputElement;
    expect(chart).toBeEnabled();
    expect(chart).toBeChecked();
    await user.selectOptions(screen.getByLabelText('medications.scheduleEditor.unit'), 'MG');
    expect(chart).toBeDisabled();
    expect(chart).not.toBeChecked();
  });
});

describe('MedicationsPage — modification et historique', () => {
  it('changer la dose demande une date d’effet et crée une période, sans toucher au dosage', async () => {
    updateMock.mockResolvedValue({ data: LEVO });
    addDosePeriodMock.mockResolvedValue({ data: LEVO });
    const user = await openEditForm();
    expect(screen.queryByLabelText('medications.scheduleEditor.effectiveDate')).not.toBeInTheDocument();

    const dose = screen.getByLabelText(doseLabel(1));
    await user.clear(dose);
    await user.type(dose, '100');
    expect(screen.getByLabelText('medications.scheduleEditor.effectiveDate')).toHaveValue(toISODate(new Date()));
    await user.click(screen.getByRole('button', { name: 'common.update' }));

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0]).toBe('med-1');
    expect(updateMock.mock.calls[0][1]).not.toHaveProperty('dosage');
    expect(updateMock.mock.calls[0][1]).not.toHaveProperty('intakeTimes');
    expect(addDosePeriodMock).toHaveBeenCalledWith('med-1', {
      startDate: toISODate(new Date()), slots: [{ time: '07:00', doses: [100] }],
    });
  });

  it('sans changement de posologie, aucune période n’est créée', async () => {
    updateMock.mockResolvedValue({ data: LEVO });
    const user = await openEditForm();
    await user.click(screen.getByRole('button', { name: 'common.update' }));
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(addDosePeriodMock).not.toHaveBeenCalled();
  });

  it('l’historique liste les périodes et permet d’en ajouter une passée', async () => {
    addDosePeriodMock.mockResolvedValue({
      data: { ...LEVO, dosePeriods: [{ id: 'p-0', startDate: '2024-06-01T00:00:00.000Z', slots: [{ time: '07:00', doses: [50] }] }, ...LEVO.dosePeriods] },
    });
    const user = await openEditForm();
    const history = screen.getByText('medications.history.title').closest('section')!;
    expect(within(history).getAllByRole('listitem')).toHaveLength(1);

    await user.click(within(history).getByRole('button', { name: /medications\.history\.addPast/ }));
    fireEvent.change(within(history).getByLabelText('medications.history.startDate'), { target: { value: '2024-06-01' } });
    await user.type(within(history).getByLabelText(doseLabel(1)), '50');
    await user.click(within(history).getByRole('button', { name: 'medications.history.add' }));

    expect(addDosePeriodMock).toHaveBeenCalledWith('med-1', {
      startDate: '2024-06-01', slots: [{ time: '07:00', doses: [50] }],
    });
    expect(await within(history).findAllByRole('listitem')).toHaveLength(2);
    expect(updateMock).not.toHaveBeenCalled(); // le formulaire principal n'est pas soumis
  });
});
