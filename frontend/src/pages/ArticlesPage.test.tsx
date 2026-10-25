// src/pages/ArticlesPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArticlesPage } from './ArticlesPage';

const listMock = vi.fn();
const getMock = vi.fn();

// Même mock que src/test/setup.ts, avec une langue modifiable par test
const i18nState = vi.hoisted(() => ({ language: 'fr' }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key),
    i18n: { language: i18nState.language, changeLanguage: () => Promise.resolve() },
  }),
  initReactI18next: { type: '3rdParty', init: () => undefined },
}));

vi.mock('../lib/api', () => ({
  articlesApi: {
    list: (...args: unknown[]) => listMock(...args),
    get: (...args: unknown[]) => getMock(...args),
  },
}));

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/learn" element={<ArticlesPage />} />
          <Route path="/learn/:slug" element={<ArticlesPage />} />
          <Route path="/dashboard" element={<div>DASHBOARD</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  i18nState.language = 'fr';
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  listMock.mockResolvedValue({ data: [] });
});

describe('ArticlesPage — library', () => {
  it('shows the featured guides and the latest guides instead of an empty state', () => {
    renderAt('/learn');

    const featured = screen.getByRole('region', { name: 'articles.featured' });
    expect(within(featured).getByRole('link', { name: /Hashimoto et hypothyroïdie/ }))
      .toHaveAttribute('href', '/learn/hashimoto-hypothyroidie');
    expect(within(featured).getByRole('link', { name: /La maladie de Basedow, c’est quoi/ }))
      .toHaveAttribute('href', '/learn/basedow-comprendre');
    const latest = screen.getByRole('region', { name: 'articles.latest' });
    expect(within(latest).getAllByRole('link')).toHaveLength(23);
    expect(screen.getByText('articles.resultCount:{"count":25}')).toBeInTheDocument();
  });

  it('offers the Basedow and safety categories with their description', async () => {
    renderAt('/learn');
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'articles.categories.basedow.label' }));
    expect(screen.getByText('articles.categories.basedow.description')).toBeInTheDocument();
    const results = screen.getByRole('region', { name: 'articles.results' });
    expect(within(results).getAllByRole('link')).toHaveLength(5);
    expect(within(results).getByRole('link', { name: /Basedow et yeux/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'articles.categories.securite.label' }));
    expect(within(screen.getByRole('region', { name: 'articles.results' })).getByRole('link', {
      name: /Quand une gêne respiratoire est-elle urgente/,
    })).toBeInTheDocument();
  });

  it('filters by category', async () => {
    renderAt('/learn');
    const user = userEvent.setup();

    const chip = screen.getByRole('button', { name: 'articles.categories.traitements.label' });
    await user.click(chip);

    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('region', { name: 'articles.featured' })).not.toBeInTheDocument();
    const results = screen.getByRole('region', { name: 'articles.results' });
    expect(within(results).getAllByRole('link')).toHaveLength(4);
    expect(within(results).getByRole('link', { name: /Bien prendre sa lévothyroxine/ })).toBeInTheDocument();
    expect(within(results).getByRole('link', { name: /antithyroïdiens de synthèse/ })).toBeInTheDocument();
    expect(within(results).getByRole('link', { name: /Iode radioactif/ })).toBeInTheDocument();
  });

  it('searches without accents and offers a reset when nothing matches', async () => {
    renderAt('/learn');
    const user = userEvent.setup();
    const input = screen.getByRole('searchbox', { name: 'articles.searchLabel' });

    await user.type(input, 'levothyroxine');
    expect(screen.getByRole('link', { name: /Bien prendre sa lévothyroxine/ })).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, 'zzzz');
    expect(screen.getByText('articles.noResults')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'articles.resetFilters' }));
    expect(input).toHaveValue('');
    expect(screen.getByText('articles.resultCount:{"count":25}')).toBeInTheDocument();
  });

  it('searches tags and section text', async () => {
    renderAt('/learn');
    const user = userEvent.setup();
    const input = screen.getByRole('searchbox', { name: 'articles.searchLabel' });

    // « orbitopathie » n'apparaît que dans le texte de la fiche « yeux »
    await user.type(input, 'orbitopathie');
    expect(screen.getByRole('link', { name: /Basedow et yeux/ })).toBeInTheDocument();
    expect(screen.getByText('articles.resultCount:{"count":1}')).toBeInTheDocument();
  });

  it('keeps articles published from the admin', async () => {
    listMock.mockResolvedValue({
      data: [{ id: 'a1', slug: 'mot-equipe', title: 'Le mot de l’équipe', excerpt: 'Nouveautés', kind: 'ARTICLE', published: true, updatedAt: '2026-10-01' }],
    });
    renderAt('/learn');

    const team = await screen.findByRole('region', { name: 'articles.teamArticles' });
    expect(within(team).getByRole('link', { name: /Le mot de l’équipe/ })).toHaveAttribute('href', '/learn/mot-equipe');
    expect(listMock).toHaveBeenCalledWith('ARTICLE');
  });
});

describe('ArticlesPage — reader', () => {
  it('opens a guide with takeaways, sources and review status, and returns to the filtered list', async () => {
    renderAt('/learn?cat=traitements');
    const user = userEvent.setup();

    await user.click(screen.getByRole('link', { name: /Bien prendre sa lévothyroxine/ }));

    expect(screen.getByRole('heading', { level: 1, name: 'Bien prendre sa lévothyroxine' })).toHaveFocus();
    const takeaways = screen.getByRole('complementary', { name: 'articles.takeaways' });
    expect(within(takeaways).getAllByRole('listitem')).toHaveLength(3);
    const source = screen.getByRole('link', { name: /Base de données publique des médicaments/ });
    expect(source).toHaveAttribute('target', '_blank');
    expect(source).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('articles.reviewPending')).toBeInTheDocument();
    expect(getMock).not.toHaveBeenCalled();

    expect(screen.getByRole('link', { name: 'articles.backToLibrary' }))
      .toHaveAttribute('href', '/learn?cat=traitements');
  });

  it('pages through the list the reader came from, then shows the end screen', async () => {
    renderAt('/learn?cat=traitements');
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: /Bien prendre sa lévothyroxine/ }));

    expect(screen.getByText('articles.progress:{"current":1,"total":4}')).toBeInTheDocument();
    expect(screen.getByText('1 / 4')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'articles.pagination' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'articles.previous' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'articles.next' }));
    expect(screen.getByRole('heading', { level: 1, name: /Fer, calcium, magnésium/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'articles.previous' })).toHaveAttribute('href', '/learn/levothyroxine-prise');

    await user.click(screen.getByRole('link', { name: 'articles.next' }));
    expect(screen.getByRole('heading', { level: 1, name: /antithyroïdiens de synthèse/ })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'articles.next' }));
    expect(screen.getByRole('heading', { level: 1, name: /Iode radioactif/ })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'articles.finish' }));
    expect(screen.getByRole('heading', { level: 1, name: 'articles.endTitle' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'articles.backHome' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'articles.backToLibrary' })).toHaveAttribute('href', '/learn?cat=traitements');
  });

  it('renders sections as icon cards when the guide asks for it', () => {
    renderAt('/learn/tsh-t4-t3');
    expect(screen.getByRole('heading', { level: 2, name: 'La TSH' }).closest('li')).not.toBeNull();
    expect(screen.getByText('articles.progress:{"current":3,"total":25}')).toBeInTheDocument();
  });

  it('opens a Basedow guide as a draft pending medical review, with safe source links', () => {
    renderAt('/learn/basedow-antithyroidiens');

    expect(screen.getByRole('heading', { level: 1, name: /antithyroïdiens de synthèse/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Fièvre ou mal de gorge sous traitement' })).toBeInTheDocument();
    const source = screen.getByRole('link', { name: /NHS — Carbimazole/ });
    expect(source).toHaveAttribute('target', '_blank');
    expect(source).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('articles.reviewPending')).toBeInTheDocument();
    expect(screen.queryByText(/articles\.reviewedOn/)).not.toBeInTheDocument();
  });

  it('shows the category label and the reader disclaimer from the translation files', () => {
    renderAt('/learn/basedow-yeux');
    expect(screen.getByText('articles.categories.basedow.label')).toBeInTheDocument();
    expect(screen.getByText('articles.disclaimerReader')).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveAttribute('lang', 'fr');
    expect(screen.queryByText('articles.frenchOnlyGuide')).not.toBeInTheDocument();
  });

  it('drops a missing illustration instead of showing a broken image', () => {
    const { container } = renderAt('/learn/basedow-yeux');
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', '/assets/comprendre/consultation.webp');
    fireEvent.error(img as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: /Basedow et yeux/ })).toBeInTheDocument();
  });

  it('falls back to the API for slugs that are not local guides', async () => {
    getMock.mockResolvedValue({
      data: { id: 'a1', slug: 'mot-equipe', title: 'Le mot de l’équipe', content: 'Bonjour **à tous**', kind: 'ARTICLE', published: true, updatedAt: '2026-10-01' },
    });
    renderAt('/learn/mot-equipe');

    expect(await screen.findByRole('heading', { level: 1, name: 'Le mot de l’équipe' })).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith('mot-equipe');
  });
});

describe('ArticlesPage — English', () => {
  beforeEach(() => {
    i18nState.language = 'en';
  });

  it('lists and searches the English guides', async () => {
    renderAt('/learn');
    const user = userEvent.setup();

    const featured = screen.getByRole('region', { name: 'articles.featured' });
    expect(within(featured).getByRole('heading', { name: 'What is Graves’ disease?' }))
      .toHaveAttribute('lang', 'en');
    await user.type(screen.getByRole('searchbox', { name: 'articles.searchLabel' }), 'orbitopathy');
    expect(screen.getByRole('link', { name: /Graves’ disease and the eyes/ })).toBeInTheDocument();
    expect(screen.getByText('articles.resultCount:{"count":1}')).toBeInTheDocument();
  });

  it('opens an English guide, still marked as pending medical review', () => {
    renderAt('/learn/basedow-antithyroidiens');

    expect(screen.getByRole('heading', { level: 1, name: 'Understanding antithyroid medicines' })).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveAttribute('lang', 'en');
    expect(screen.getByRole('heading', { level: 2, name: 'Fever or sore throat during treatment' })).toBeInTheDocument();
    expect(screen.getByText('articles.reviewPending')).toBeInTheDocument();
    expect(screen.queryByText('articles.frenchOnlyGuide')).not.toBeInTheDocument();
  });
});
