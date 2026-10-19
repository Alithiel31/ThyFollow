// src/lib/learn.ts — bibliothèque éditoriale « Comprendre »
//
// Les fiches sont des données locales (src/content/comprendre) livrées avec
// le bundle : elles s'affichent sans réseau et sans dépendre de l'admin.
// Les articles rédigés depuis /admin/articles restent servis par l'API.
import content from '../content/comprendre/content.fr.json';
import type { EducationArticle, EducationLibrary } from '../types';

export const library = content as EducationLibrary;

export const ALL_CATEGORIES = 'tous';

/* Teinte pastel de chaque catégorie (tokens --pastel-* de index.css) */
export type PastelTone = 'peach' | 'blue' | 'lavender' | 'mint' | 'butter';

const CATEGORY_TONES: Record<string, PastelTone> = {
  thyroide: 'peach',
  analyses: 'blue',
  traitements: 'lavender',
  quotidien: 'mint',
  suivi: 'butter',
};

export function categoryTone(category: string): PastelTone {
  return CATEGORY_TONES[category] ?? 'lavender';
}

/* Minuscules sans accents : « thyroide » trouve « Thyroïde » */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('fr')
    .trim();
}

function haystack(article: EducationArticle): string {
  return normalizeSearch(
    [
      article.title,
      article.summary,
      article.categoryLabel,
      ...article.sections.map((s) => s.heading),
      ...article.takeaways,
    ].join(' ')
  );
}

export function filterArticles(
  articles: EducationArticle[],
  category: string,
  search: string
): EducationArticle[] {
  const query = normalizeSearch(search);
  return articles.filter((article) => {
    const categoryMatches = category === ALL_CATEGORIES || article.category === category;
    return categoryMatches && (!query || haystack(article).includes(query));
  });
}

export function findArticle(id: string): EducationArticle | undefined {
  return library.articles.find((a) => a.id === id);
}

/* « À lire aussi » : même catégorie d'abord, puis le reste dans l'ordre */
export function relatedArticles(article: EducationArticle, limit = 2): EducationArticle[] {
  const others = library.articles.filter((a) => a.id !== article.id);
  return [
    ...others.filter((a) => a.category === article.category),
    ...others.filter((a) => a.category !== article.category),
  ].slice(0, limit);
}
