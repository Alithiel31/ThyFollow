// src/lib/learn.test.ts
import { describe, it, expect } from 'vitest';
import {
  library, translations, ALL_CATEGORIES, CATEGORIES, contentLanguage, filterArticles, getLibrary,
  isMedicallyReviewed, localize, normalizeSearch, readingSequence,
} from './learn';
import fr from '../locales/fr/common.json';
import en from '../locales/en/common.json';
import type { EducationArticle, EducationText } from '../types';

// Fichiers réellement présents dans public/ (résolu par Vite, sans types Node)
const shipped = Object.keys(import.meta.glob('../../public/assets/comprendre/*.webp'))
  .map((path) => path.replace('../../public', ''));

const french = getLibrary('fr');
const english = getLibrary('en');

describe('Comprendre library content', () => {
  it('points every illustration to a file shipped in public/', () => {
    expect(shipped.length).toBeGreaterThan(0);
    for (const article of library.articles) {
      expect(shipped, article.id).toContain(article.image);
    }
  });

  it('uses unique ids and known categories', () => {
    const ids = library.articles.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const article of library.articles) {
      expect(CATEGORIES, article.id).toContain(article.category);
      expect(article.readMinutes).toBeGreaterThan(0);
      expect(article.takeaways.length).toBeGreaterThan(0);
      for (const source of article.sources) expect(source.url).toMatch(/^https:\/\//);
    }
    expect(CATEGORIES[0]).toBe(ALL_CATEGORIES);
  });

  it('labels and describes every category in both languages', () => {
    for (const locale of [fr, en]) {
      const labels: Record<string, { label: string; description?: string }> = locale.articles.categories;
      expect(Object.keys(labels).sort()).toEqual([...CATEGORIES].sort());
      for (const id of CATEGORIES) {
        expect(labels[id].label, id).toBeTruthy();
        if (id !== ALL_CATEGORIES) expect(labels[id].description, id).toBeTruthy();
      }
    }
  });

  it('keeps the Hashimoto guides next to the Basedow ones', () => {
    const ids = library.articles.map((a) => a.id);
    expect(ids).toContain('hashimoto-hypothyroidie');
    expect(ids).toContain('basedow-comprendre');
    for (const id of CATEGORIES.filter((c) => c !== ALL_CATEGORIES)) {
      expect(library.articles.some((a) => a.category === id), id).toBe(true);
    }
  });

  it('never presents a draft as medically reviewed, in any language', () => {
    for (const article of [...french, ...english]) {
      // Tant qu'aucune relecture n'est faite, chaque texte garde son drapeau
      expect(article.medicalReviewRequired, `${article.lang}:${article.id}`).toBe(true);
      expect(isMedicallyReviewed(article), `${article.lang}:${article.id}`).toBe(false);
    }
  });
});

describe('English translations', () => {
  const translated = translations.en.translations;

  it('translates every guide, once, with the same structure', () => {
    const ids = translated.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(library.articles.map((a) => a.id));
    for (const text of translated) {
      const original = library.articles.find((a) => a.id === text.id) as EducationArticle;
      // Même nombre de sections : les icônes des cartes suivent leur rang
      expect(text.sections.length, text.id).toBe(original.sections.length);
      expect(text.takeaways.length, text.id).toBe(original.takeaways.length);
      expect(text.sources.map((s) => s.url), text.id).toEqual(original.sources.map((s) => s.url));
    }
  });

  it('serves English text with the French structure, in the same order', () => {
    expect(english.map((a) => a.id)).toEqual(french.map((a) => a.id));
    const graves = english.find((a) => a.id === 'basedow-comprendre');
    expect(graves?.lang).toBe('en');
    expect(graves?.title).toBe('What is Graves’ disease?');
    expect(graves?.category).toBe('basedow');
    expect(graves?.image).toBe('/assets/comprendre/thyroide.webp');
    expect(french.every((a) => a.lang === 'fr')).toBe(true);
  });
});

describe('localize', () => {
  const base = library.articles[0];
  const reviewedBase: EducationArticle = { ...base, reviewedAt: '2026-11-02', medicalReviewRequired: false };
  const text: EducationText & { id: string } = {
    id: base.id, title: 'T', summary: 'S', intro: 'I', sections: [], takeaways: [], sources: [],
  };

  it('falls back to French when a guide is not translated', () => {
    const [article] = localize([base], [], 'en');
    expect(article.lang).toBe('fr');
    expect(article.title).toBe(base.title);
  });

  it('never carries the French review status over to a translation', () => {
    const [article] = localize([reviewedBase], [text], 'en');
    expect(article.lang).toBe('en');
    expect(article.title).toBe('T');
    expect(isMedicallyReviewed(reviewedBase)).toBe(true);
    expect(isMedicallyReviewed(article)).toBe(false);
  });
});

describe('contentLanguage', () => {
  it('maps the interface language to a content language', () => {
    expect(contentLanguage('en-GB')).toBe('en');
    expect(contentLanguage('fr')).toBe('fr');
    expect(contentLanguage(undefined)).toBe('fr');
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
    const ids = filterArticles(french, ALL_CATEGORIES, 'levothyroxine').map((a) => a.id);
    expect(ids).toContain('levothyroxine-prise');
  });

  it('combines category and search', () => {
    const treatments = filterArticles(french, 'traitements', '');
    expect(treatments.length).toBeGreaterThan(0);
    expect(treatments.every((a) => a.category === 'traitements')).toBe(true);
    expect(filterArticles(french, 'traitements', 'tsh')).toEqual([]);
  });

  it('searches tags and section text', () => {
    expect(filterArticles(french, ALL_CATEGORIES, 'trab').map((a) => a.id)).toContain('basedow-trab');
    expect(filterArticles(french, ALL_CATEGORIES, 'orbitopathie').map((a) => a.id))
      .toEqual(['basedow-yeux']);
  });

  it('searches the text of the current language and the translated category label', () => {
    expect(filterArticles(english, ALL_CATEGORIES, 'orbitopathy').map((a) => a.id)).toEqual(['basedow-yeux']);
    expect(filterArticles(english, ALL_CATEGORIES, 'orbitopathie')).toEqual([]);
    const labelOf = (id: string) => (id === 'securite' ? 'Safety' : id);
    expect(filterArticles(english, ALL_CATEGORIES, 'safety', labelOf).map((a) => a.id))
      .toContain('urgence-difficulte-respiratoire');
  });
});

describe('readingSequence', () => {
  it('follows the list the reader came from, or the whole library', () => {
    expect(readingSequence(french, '').map((a) => a.id)).toEqual(french.map((a) => a.id));
    const treatments = readingSequence(french, '?cat=traitements');
    expect(treatments.length).toBeGreaterThan(0);
    expect(treatments.every((a) => a.category === 'traitements')).toBe(true);
    expect(readingSequence(french, '?q=zzzz')).toHaveLength(french.length);
  });
});
