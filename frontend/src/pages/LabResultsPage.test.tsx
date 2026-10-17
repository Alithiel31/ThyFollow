// src/pages/LabResultsPage.test.tsx
// Les cartes du carnet doivent montrer TOUS les marqueurs renseignés (un bilan importé peut ne
// contenir que de la ferritine), et la modale d'édition doit permettre de les voir et corriger.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { LabResultsPage } from './LabResultsPage';
import type { LabResult } from '../types';

const listMock = vi.fn();
const medListMock = vi.fn();

vi.mock('../lib/api', () => ({
  labApi: {
    list: (...args: unknown[]) => listMock(...args),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    importFiles: vi.fn(),
    confirmImport: vi.fn(),
    discardImport: vi.fn(),
    downloadDocument: vi.fn(),
  },
  medApi: { list: (...args: unknown[]) => medListMock(...args) },
}));

const result = (extra: Partial<LabResult>): LabResult => ({ id: 'lab-1', date: '2025-04-29', lab: 'Biogroup', ...extra });

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      {/* La page lit les paramètres d'URL (retour de paiement Stripe) */}
      <MemoryRouter>
        <LabResultsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  medListMock.mockResolvedValue({ data: [] });
});

describe('LabResultsPage — cartes du carnet', () => {
  it('affiche la ferritine d’un bilan qui ne contient que ça', async () => {
    listMock.mockResolvedValue({ data: [result({ ferritin: 630 })] });
    renderPage();

    expect(await screen.findByText('labResults.marker.ferritin')).toBeInTheDocument();
    expect(screen.getByText('630')).toBeInTheDocument();
    expect(screen.getByText('µg/L')).toBeInTheDocument();
    expect(screen.queryByText('labResults.noValues')).not.toBeInTheDocument();
  });

  it('affiche tous les marqueurs renseignés (thyroïde, carences, métabolisme), pas les autres', async () => {
    listMock.mockResolvedValue({
      data: [result({ tsh: 2.1, ferritin: 64, vitaminD: 75, hemoglobin: 13.6, glucose: 5 })],
    });
    renderPage();

    for (const key of ['tsh', 'ferritin', 'vitaminD', 'hemoglobin', 'glucose']) {
      expect(await screen.findByText(`labResults.marker.${key}`)).toBeInTheDocument();
    }
    expect(screen.queryByText('labResults.marker.ft4')).not.toBeInTheDocument();
    expect(screen.queryByText('labResults.marker.selenium')).not.toBeInTheDocument();
  });

  it('un résultat sans aucune valeur l’indique', async () => {
    listMock.mockResolvedValue({ data: [result({})] });
    renderPage();
    expect(await screen.findByText('labResults.noValues')).toBeInTheDocument();
  });

  it('la modale d’édition montre la ferritine remplie et les autres marqueurs', async () => {
    listMock.mockResolvedValue({ data: [result({ ferritin: 630, hemoglobin: 13.6 })] });
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByText('labResults.marker.ferritin'));

    expect(screen.getByLabelText('labResults.ferritin')).toHaveValue(630);
    const dialog = screen.getByText('labResults.otherMarkers').closest('form') as HTMLElement;
    expect(within(dialog).getByLabelText('labResults.marker.hemoglobin (g/dL)')).toHaveValue(13.6);
    for (const key of ['t4', 't3', 'thyroglobulin', 'magnesium', 'selenium', 'cholesterol', 'glucose']) {
      expect(within(dialog).getByLabelText(new RegExp(`^labResults\\.marker\\.${key} \\(`))).toBeInTheDocument();
    }
  });
});

describe('LabResultsPage — doses superposées au graphique TSH', () => {
  const twoTsh = [result({ id: 'a', date: '2026-03-01', tsh: 3.1 }), result({ id: 'b', date: '2026-09-01', tsh: 1.2 })];
  const levo = (showOnChart: boolean) => ({
    id: 'med-1', name: 'Levothyrox', dosage: 87.5, dosageUnit: 'MCG', frequency: 'DAILY', intakeTimes: ['07:00'],
    startDate: '2026-01-01T00:00:00.000Z', active: true, showOnChart,
    dosePeriods: [{ id: 'p-1', startDate: '2026-01-01T00:00:00.000Z', slots: [{ time: '07:00', doses: [75, 100] }] }],
  });

  it('affiche une légende avec le médicament coché « afficher sur le graphique »', async () => {
    listMock.mockResolvedValue({ data: twoTsh });
    medListMock.mockResolvedValue({ data: [levo(true)] });
    renderPage();

    const legend = await screen.findByRole('list', { name: 'labResults.legend' });
    expect(within(legend).getByText(/labResults\.doseLegend.*Levothyrox/)).toBeInTheDocument();
  });

  it('sans médicament coché, pas de légende (graphique inchangé)', async () => {
    listMock.mockResolvedValue({ data: twoTsh });
    medListMock.mockResolvedValue({ data: [levo(false)] });
    renderPage();

    expect(await screen.findByText('labResults.tshEvolution')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50)); // laisse la requête médicaments aboutir
    expect(screen.queryByRole('list', { name: 'labResults.legend' })).not.toBeInTheDocument();
  });
});
