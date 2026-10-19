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

/* Écran de fin du parcours (maquette) : /learn/fin */
export const LEARN_END_SLUG = 'fin';

/* Parcours de lecture : les fiches de la liste d'où l'on vient (?cat=&q=),
   dans l'ordre affiché. Une liste vide retombe sur toute la bibliothèque. */
export function readingSequence(fromSearch: string): EducationArticle[] {
  const params = new URLSearchParams(fromSearch);
  const list = filterArticles(
    library.articles,
    params.get('cat') ?? ALL_CATEGORIES,
    params.get('q') ?? ''
  );
  return list.length > 0 ? list : library.articles;
}

export function findArticle(id: string): EducationArticle | undefined {
  return library.articles.find((a) => a.id === id);
}
