// src/pages/ArticlesPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArticlesPage } from './ArticlesPage';

const listMock = vi.fn();
const getMock = vi.fn();

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
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  listMock.mockResolvedValue({ data: [] });
});

describe('ArticlesPage — library', () => {
  it('shows the featured guide and the full library instead of an empty state', () => {
    renderAt('/learn');

    const featured = screen.getByRole('region', { name: /articles.featured/ });
    expect(within(featured).getByRole('link', { name: /Hashimoto et hypothyroïdie/ }))
      .toHaveAttribute('href', '/learn/hashimoto-hypothyroidie');
    expect(screen.getByText('articles.resultCount:{"count":8}')).toBeInTheDocument();
    expect(screen.getAllByText('articles.readMinutes:{"count":3}').length).toBeGreaterThan(0);
  });

  it('filters by category', async () => {
    renderAt('/learn');
    const user = userEvent.setup();

    const chip = screen.getByRole('button', { name: 'Traitements' });
    await user.click(chip);

    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('region', { name: /articles.featured/ })).not.toBeInTheDocument();
    const library = screen.getByRole('region', { name: 'articles.library' });
    expect(within(library).getAllByRole('link')).toHaveLength(2);
    expect(within(library).getByRole('link', { name: /Bien prendre sa lévothyroxine/ })).toBeInTheDocument();
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
    expect(screen.getByText('articles.resultCount:{"count":8}')).toBeInTheDocument();
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

describe('ArticlesPage — guide view', () => {
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

  it('falls back to the API for slugs that are not local guides', async () => {
    getMock.mockResolvedValue({
      data: { id: 'a1', slug: 'mot-equipe', title: 'Le mot de l’équipe', content: 'Bonjour **à tous**', kind: 'ARTICLE', published: true, updatedAt: '2026-10-01' },
    });
    renderAt('/learn/mot-equipe');

    expect(await screen.findByRole('heading', { level: 1, name: 'Le mot de l’équipe' })).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith('mot-equipe');
  });
});
