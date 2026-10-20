// src/lib/learn.ts — bibliothèque éditoriale « Comprendre »
//
// Les fiches sont des données locales (src/content/comprendre) livrées avec
// le bundle : elles s'affichent sans réseau et sans dépendre de l'admin.
// Les articles rédigés depuis /admin/articles restent servis par l'API.
//
// content.fr.json est la base (structure + texte français) ; content.en.json
// ne porte que les textes traduits, par id. Une fiche sans traduction est
// affichée en français, marquée `lang: 'fr'`.
import base from '../content/comprendre/content.fr.json';
import english from '../content/comprendre/content.en.json';
import type {
  ContentLanguage, EducationArticle, EducationLibrary, EducationText, EducationTranslations,
  LocalizedArticle,
} from '../types';

export const library = base as EducationLibrary;
export const translations: Record<Exclude<ContentLanguage, 'fr'>, EducationTranslations> = {
  en: english as EducationTranslations,
};

export const ALL_CATEGORIES = 'tous';

/* Ordre des filtres ; libellés : articles.categories.<id>.label (i18n) */
export const CATEGORIES = [
  ALL_CATEGORIES, 'thyroide', 'basedow', 'analyses', 'traitements', 'quotidien', 'suivi', 'securite',
] as const;

/* Teinte pastel de chaque catégorie (tokens --pastel-* de index.css) */
export type PastelTone = 'peach' | 'blue' | 'lavender' | 'mint' | 'butter' | 'rose';

const CATEGORY_TONES: Record<string, PastelTone> = {
  thyroide: 'peach',
  basedow: 'rose',
  analyses: 'blue',
  traitements: 'lavender',
  quotidien: 'mint',
  suivi: 'butter',
  securite: 'butter',
};

export function categoryTone(category: string): PastelTone {
  return CATEGORY_TONES[category] ?? 'lavender';
}

/* Langue de l'interface -> langue des fiches (le français par défaut) */
export function contentLanguage(uiLanguage: string | undefined): ContentLanguage {
  return uiLanguage?.startsWith('en') ? 'en' : 'fr';
}

/* Applique une traduction à la base, dans l'ordre de content.fr.json. Le
   texte et son statut de relecture viennent entièrement de la traduction ;
   une fiche non traduite reste en français. */
export function localize(
  articles: EducationArticle[],
  translated: (EducationText & { id: string })[],
  language: ContentLanguage
): LocalizedArticle[] {
  const byId = new Map(translated.map(({ id, ...text }) => [id, text]));
  return articles.map((article): LocalizedArticle => {
    const text = byId.get(article.id);
    if (!text) return { ...article, lang: 'fr' };
    // Les champs optionnels du français (relecture, mots-clés) ne doivent
    // jamais s'appliquer à la traduction
    const reset = { tags: undefined, reviewedAt: undefined, medicalReviewRequired: undefined };
    return { ...article, ...reset, ...text, lang: language };
  });
}

const libraries = new Map<ContentLanguage, LocalizedArticle[]>();

export function getLibrary(language: ContentLanguage): LocalizedArticle[] {
  let articles = libraries.get(language);
  if (!articles) {
    articles = language === 'fr'
      ? localize(library.articles, [], 'fr')
      : localize(library.articles, translations[language].translations, language);
    libraries.set(language, articles);
  }
  return articles;
}

/* Minuscules sans accents : « thyroide » trouve « Thyroïde » */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('fr')
    .trim();
}

type LabelOf = (category: string) => string;

function haystack(article: LocalizedArticle, labelOf?: LabelOf): string {
  return normalizeSearch(
    [
      article.title,
      article.summary,
      labelOf?.(article.category) ?? '',
      ...(article.tags ?? []),
      article.intro,
      ...article.sections.flatMap((s) => [s.heading, s.body]),
      ...article.takeaways,
    ].join(' ')
  );
}

export function filterArticles(
  articles: LocalizedArticle[],
  category: string,
  search: string,
  labelOf?: LabelOf
): LocalizedArticle[] {
  const query = normalizeSearch(search);
  return articles.filter((article) => {
    const categoryMatches = category === ALL_CATEGORIES || article.category === category;
    return categoryMatches && (!query || haystack(article, labelOf).includes(query));
  });
}

/* Écran de fin du parcours (maquette) : /learn/fin */
export const LEARN_END_SLUG = 'fin';

/* Parcours de lecture : les fiches de la liste d'où l'on vient (?cat=&q=),
   dans l'ordre affiché. Une liste vide retombe sur toute la bibliothèque. */
export function readingSequence(
  articles: LocalizedArticle[],
  fromSearch: string,
  labelOf?: LabelOf
): LocalizedArticle[] {
  const params = new URLSearchParams(fromSearch);
  const list = filterArticles(
    articles,
    params.get('cat') ?? ALL_CATEGORIES,
    params.get('q') ?? '',
    labelOf
  );
  return list.length > 0 ? list : articles;
}

/* Une fiche n'est présentée comme relue que si elle a une date de relecture
   et que le drapeau éditorial a été levé */
export function isMedicallyReviewed(article: EducationText): boolean {
  return Boolean(article.reviewedAt) && article.medicalReviewRequired !== true;
}

export function findArticle(articles: LocalizedArticle[], id: string): LocalizedArticle | undefined {
  return articles.find((a) => a.id === id);
}
