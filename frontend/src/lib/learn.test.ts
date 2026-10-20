// src/lib/learn.test.ts
import { describe, it, expect } from 'vitest';
import {
  library, ALL_CATEGORIES, filterArticles, isMedicallyReviewed, normalizeSearch, readingSequence,
} from './learn';
import type { EducationArticle } from '../types';

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

  it('keeps the Hashimoto guides next to the Basedow ones', () => {
    const ids = library.articles.map((a) => a.id);
    expect(ids).toContain('hashimoto-hypothyroidie');
    expect(ids).toContain('basedow-comprendre');
    for (const id of ['thyroide', 'basedow', 'analyses', 'traitements', 'quotidien', 'suivi', 'securite']) {
      expect(library.articles.some((a) => a.category === id), id).toBe(true);
    }
  });

  it('never presents a draft as medically reviewed', () => {
    for (const article of library.articles) {
      // Tant qu'aucune relecture n'est faite, chaque fiche garde son drapeau
      expect(article.medicalReviewRequired, article.id).toBe(true);
      expect(isMedicallyReviewed(article), article.id).toBe(false);
    }
  });
});

describe('isMedicallyReviewed', () => {
  const base = library.articles[0];
  it('needs a review date and the editorial flag lifted', () => {
    const variant = (patch: Partial<EducationArticle>) => ({ ...base, ...patch });
    expect(isMedicallyReviewed(variant({ reviewedAt: undefined, medicalReviewRequired: false }))).toBe(false);
    expect(isMedicallyReviewed(variant({ reviewedAt: '2026-11-02', medicalReviewRequired: true }))).toBe(false);
    expect(isMedicallyReviewed(variant({ reviewedAt: '2026-11-02', medicalReviewRequired: false }))).toBe(true);
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

  it('searches tags and section text', () => {
    expect(filterArticles(library.articles, ALL_CATEGORIES, 'trab').map((a) => a.id)).toContain('basedow-trab');
    expect(filterArticles(library.articles, ALL_CATEGORIES, 'orbitopathie').map((a) => a.id))
      .toEqual(['basedow-yeux']);
  });
});

describe('readingSequence', () => {
  it('follows the list the reader came from, or the whole library', () => {
    expect(readingSequence('').map((a) => a.id)).toEqual(library.articles.map((a) => a.id));
    const treatments = readingSequence('?cat=traitements');
    expect(treatments.length).toBeGreaterThan(0);
    expect(treatments.every((a) => a.category === 'traitements')).toBe(true);
    expect(readingSequence('?q=zzzz')).toHaveLength(library.articles.length);
  });
});
