// src/lib/learn.test.ts
import { describe, it, expect } from 'vitest';
import {
  library, ALL_CATEGORIES, filterArticles, findArticle, normalizeSearch, relatedArticles,
} from './learn';

// Fichiers réellement présents dans public/ (résolu par Vite, sans types Node)
const shipped = Object.keys(import.meta.glob('../../public/assets/comprendre/*.webp'))
  .map((path) => path.replace('../../public', ''));

describe('Comprendre library content', () => {
  it('points every illustration to a file shipped in public/', () => {
    expect(shipped.length).toBeGreaterThan(0);
    for (const article of library.articles) {
      expect(shipped, article.id).toContain(article.image);
    }
  });

  it('uses unique ids and known categories with matching labels', () => {
    const ids = library.articles.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const article of library.articles) {
      const category = library.categories.find((c) => c.id === article.category);
      expect(category, article.id).toBeDefined();
      expect(article.categoryLabel).toBe(category?.label);
      expect(article.readMinutes).toBeGreaterThan(0);
      expect(article.takeaways.length).toBeGreaterThan(0);
      for (const source of article.sources) expect(source.url).toMatch(/^https:\/\//);
    }
    expect(library.categories[0].id).toBe(ALL_CATEGORIES);
  });
});

describe('filterArticles', () => {
  it('ignores accents and case', () => {
    expect(normalizeSearch('  Thyroïde ')).toBe('thyroide');
    const ids = filterArticles(library.articles, ALL_CATEGORIES, 'levothyroxine').map((a) => a.id);
    expect(ids).toContain('levothyroxine-prise');
  });

  it('combines category and search', () => {
    const treatments = filterArticles(library.articles, 'traitements', '');
    expect(treatments.length).toBeGreaterThan(0);
    expect(treatments.every((a) => a.category === 'traitements')).toBe(true);
    expect(filterArticles(library.articles, 'traitements', 'tsh')).toEqual([]);
  });
});

describe('relatedArticles', () => {
  it('excludes the current article and favours its category', () => {
    const article = findArticle('levothyroxine-prise')!;
    const related = relatedArticles(article);
    expect(related).toHaveLength(2);
    expect(related.map((a) => a.id)).not.toContain(article.id);
    expect(related[0].category).toBe('traitements');
  });
});
