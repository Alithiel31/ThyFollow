// src/pages/ArticlesPage.tsx -- section "Comprendre" : bibliotheque de fiches
// pedagogiques (donnees locales, src/content/comprendre) + articles publies
// depuis l'admin (API, markdown). Une seule page pour toutes les vues :
// le parametre :slug decide, une fiche locale passe avant un article API.
import { useEffect, useRef, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import {
  ArrowLeft, ChevronRight, Clock, ExternalLink, Search, X, Sparkles, CircleCheck, ShieldAlert,
} from 'lucide-react';
import { articlesApi } from '../lib/api';
import { formatDate } from '../lib/utils';
import {
  library, ALL_CATEGORIES, categoryTone, filterArticles, findArticle, normalizeSearch,
  relatedArticles, type PastelTone,
} from '../lib/learn';
import type { EducationArticle } from '../types';
import styles from './ArticlesPage.module.css';

const TONE_CLASS: Record<PastelTone, string> = {
  peach: styles.tonePeach,
  blue: styles.toneBlue,
  lavender: styles.toneLavender,
  mint: styles.toneMint,
  butter: styles.toneButter,
};

// Recherche de la liste conservée au retour d'une fiche (?cat=…&q=…)
type LearnLocationState = { from?: string } | null;

export function ArticlesPage() {
  const { slug } = useParams();
  if (!slug) return <Library />;
  const local = findArticle(slug);
  return local ? <EducationArticleView article={local} /> : <ArticleView slug={slug} />;
}

/* ── Bibliothèque ─────────────────────────────── */

function Library() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const category = params.get('cat') ?? ALL_CATEGORIES;
  const search = params.get('q') ?? '';

  const { data: teamArticles = [] } = useQuery({
    queryKey: ['articles', 'list'],
    queryFn: () => articlesApi.list('ARTICLE').then((r) => r.data),
  });

  const updateParams = (next: { cat?: string; q?: string }) => {
    const merged = { cat: category, q: search, ...next };
    const out = new URLSearchParams();
    if (merged.cat !== ALL_CATEGORIES) out.set('cat', merged.cat);
    if (merged.q) out.set('q', merged.q);
    // replace : taper une recherche ne doit pas empiler l'historique
    setParams(out, { replace: true });
  };

  const filtering = category !== ALL_CATEGORIES || search.trim() !== '';
  const results = filterArticles(library.articles, category, search);
  const featured = filtering ? undefined : results.find((a) => a.featured);
  const grid = featured ? results.filter((a) => a !== featured) : results;

  const query = normalizeSearch(search);
  const visibleTeamArticles = category === ALL_CATEGORIES
    ? teamArticles.filter((a) => normalizeSearch(`${a.title} ${a.excerpt ?? ''}`).includes(query))
    : [];

  const from = location.search;

  return (
    <div className={`${styles.page} ${styles.libraryPage}`}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('articles.title')}</h1>
        <p className={styles.sub}>{t('articles.subtitle')}</p>
        {i18n.language?.startsWith('en') && (
          <p className={styles.langNote}>{t('articles.frenchOnly')}</p>
        )}
      </header>

      <form
        role="search"
        className={styles.searchBox}
        onSubmit={(e: FormEvent) => e.preventDefault()}
      >
        <label htmlFor="learn-search" className="sr-only">{t('articles.searchLabel')}</label>
        <Search size={18} className={styles.searchIcon} aria-hidden="true" />
        <input
          id="learn-search"
          type="search"
          className={styles.searchInput}
          placeholder={t('articles.searchPlaceholder')}
          value={search}
          onChange={(e) => updateParams({ q: e.target.value })}
          autoComplete="off"
          enterKeyHint="search"
        />
        {search && (
          <button
            type="button"
            className={styles.clearBtn}
            onClick={() => updateParams({ q: '' })}
            aria-label={t('articles.clearSearch')}
          >
            <X size={16} />
          </button>
        )}
      </form>

      <div className={styles.chips} role="group" aria-label={t('articles.categoriesLabel')}>
        {library.categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`${styles.chip} ${category === c.id ? styles.chipActive : ''}`}
            aria-pressed={category === c.id}
            onClick={() => updateParams({ cat: c.id })}
          >
            {c.label}
          </button>
        ))}
      </div>

      {featured && (
        <section className={styles.section} aria-labelledby="learn-featured">
          <h2 id="learn-featured" className={styles.sectionTitle}>
            <Sparkles size={15} aria-hidden="true" /> {t('articles.featured')}
          </h2>
          <ArticleCard article={featured} from={from} variant="featured" />
        </section>
      )}

      <section className={styles.section} aria-labelledby="learn-library">
        <div className={styles.sectionHead}>
          <h2 id="learn-library" className={styles.sectionTitle}>{t('articles.library')}</h2>
          <p className={styles.count} aria-live="polite">
            {t('articles.resultCount', { count: results.length })}
          </p>
        </div>

        {results.length === 0 ? (
          <div className={styles.empty}>
            <Search size={32} strokeWidth={1.4} aria-hidden="true" />
            <p>{t('articles.noResults')}</p>
            <button
              type="button"
              className={styles.resetBtn}
              onClick={() => updateParams({ cat: ALL_CATEGORIES, q: '' })}
            >
              {t('articles.resetFilters')}
            </button>
          </div>
        ) : (
          <ul className={styles.grid}>
            {grid.map((a) => (
              <li key={a.id}>
                <ArticleCard article={a} from={from} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {visibleTeamArticles.length > 0 && (
        <section className={styles.section} aria-labelledby="learn-team">
          <h2 id="learn-team" className={styles.sectionTitle}>{t('articles.teamArticles')}</h2>
          <ul className={styles.list}>
            {visibleTeamArticles.map((a) => (
              <li key={a.id}>
                <Link to={`/learn/${a.slug}`} className={styles.card}>
                  <div className={styles.cardBody}>
                    <h3 className={styles.cardTitle}>{a.title}</h3>
                    {a.excerpt && <p className={styles.cardExcerpt}>{a.excerpt}</p>}
                    {a.publishedAt && (
                      <p className={styles.cardDate}>{formatDate(a.publishedAt)}</p>
                    )}
                  </div>
                  <ChevronRight size={18} className={styles.cardChevron} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className={styles.disclaimer}>{t('articles.disclaimerList')}</p>
    </div>
  );
}

function ArticleCard({
  article, from, variant = 'default',
}: { article: EducationArticle; from: string; variant?: 'default' | 'featured' | 'compact' }) {
  const { t } = useTranslation();
  const variantClass = variant === 'featured' ? styles.edCardFeatured
    : variant === 'compact' ? styles.edCardCompact : '';
  return (
    <Link
      to={`/learn/${article.id}`}
      state={{ from }}
      className={`${styles.edCard} ${variantClass} ${TONE_CLASS[categoryTone(article.category)]}`}
    >
      <div className={styles.edMedia}>
        <img src={article.image} alt="" loading="lazy" decoding="async" width={758} height={500} />
      </div>
      <div className={styles.edBody}>
        <span className={styles.badge}>{article.categoryLabel}</span>
        <h3 className={styles.edTitle}>{article.title}</h3>
        {variant !== 'compact' && <p className={styles.edSummary}>{article.summary}</p>}
        <p className={styles.meta}>
          <Clock size={13} aria-hidden="true" />
          {t('articles.readMinutes', { count: article.readMinutes })}
        </p>
      </div>
    </Link>
  );
}

/* ── Fiche détaillée (contenu local) ──────────── */

function EducationArticleView({ article }: { article: EducationArticle }) {
  const { t } = useTranslation();
  const location = useLocation();
  const from = (location.state as LearnLocationState)?.from ?? '';
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Navigation SPA : repartir du haut et annoncer la nouvelle fiche.
  // Pas de focus forcé sur un chargement direct (location.key 'default').
  const navigatedInApp = location.key !== 'default';
  useEffect(() => {
    window.scrollTo(0, 0);
    if (navigatedInApp) titleRef.current?.focus({ preventScroll: true });
  }, [article.id, navigatedInApp]);

  return (
    <div className={`${styles.page} ${styles.readerPage} ${TONE_CLASS[categoryTone(article.category)]}`}>
      <Link to={{ pathname: '/learn', search: from }} className={styles.backBtn}>
        <ArrowLeft size={16} aria-hidden="true" /> {t('articles.backToLibrary')}
      </Link>

      <article className={styles.reader}>
        <header className={styles.readerHeader}>
          <div className={styles.readerMeta}>
            <span className={styles.badge}>{article.categoryLabel}</span>
            <span className={styles.meta}>
              <Clock size={13} aria-hidden="true" />
              {t('articles.readMinutes', { count: article.readMinutes })}
            </span>
          </div>
          <h1 ref={titleRef} tabIndex={-1} className={styles.readerTitle}>{article.title}</h1>
          <p className={styles.lead}>{article.summary}</p>
        </header>

        <div className={styles.readerMedia}>
          <img src={article.image} alt="" decoding="async" width={758} height={500} />
        </div>

        <div className={styles.prose}>
          <p className={styles.intro}>{article.intro}</p>
          {article.sections.map((s) => (
            <section key={s.heading}>
              <h2>{s.heading}</h2>
              <p>{s.body}</p>
            </section>
          ))}
        </div>

        <aside className={styles.takeaways} aria-labelledby="learn-takeaways">
          <h2 id="learn-takeaways" className={styles.takeawaysTitle}>{t('articles.takeaways')}</h2>
          <ul>
            {article.takeaways.map((item) => (
              <li key={item}>
                <CircleCheck size={17} aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </aside>

        {article.sources.length > 0 && (
          <section className={styles.sources} aria-labelledby="learn-sources">
            <h2 id="learn-sources" className={styles.sourcesTitle}>{t('articles.sources')}</h2>
            <ul>
              {article.sources.map((src) => (
                <li key={src.url}>
                  <a href={src.url} target="_blank" rel="noopener noreferrer">
                    {src.label}
                    <ExternalLink size={13} aria-hidden="true" />
                    <span className="sr-only"> {t('articles.opensInNewTab')}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className={styles.review}>
          <ShieldAlert size={15} aria-hidden="true" />
          {article.reviewedAt
            ? t('articles.reviewedOn', { date: formatDate(article.reviewedAt) })
            : t('articles.reviewPending')}
        </p>
      </article>

      <p className={styles.disclaimer}>{library.meta.disclaimer}</p>

      <section className={styles.section} aria-labelledby="learn-related">
        <h2 id="learn-related" className={styles.sectionTitle}>{t('articles.related')}</h2>
        <ul className={styles.relatedGrid}>
          {relatedArticles(article).map((a) => (
            <li key={a.id}>
              <ArticleCard article={a} from={from} variant="compact" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ── Article publié depuis l'admin (API, markdown) ── */

function ArticleView({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: article, isLoading, isError } = useQuery({
    queryKey: ['articles', slug],
    queryFn: () => articlesApi.get(slug).then((r) => r.data),
  });

  if (isLoading) return <div className={styles.loader}><div className="spinner" /></div>;
  if (isError || !article) {
    return (
      <div className={styles.empty}>
        <p>{t('articles.notFound')}</p>
        <button className={styles.backBtn} onClick={() => navigate('/learn')}>
          <ArrowLeft size={16} /> {t('articles.backToList')}
        </button>
      </div>
    );
  }

  return (
    <div className={`${styles.page} ${styles.readerPage}`}>
      <button className={styles.backBtn} onClick={() => navigate('/learn')}>
        <ArrowLeft size={16} /> {t('articles.allArticles')}
      </button>

      <article className={styles.article}>
        <h1 className={styles.articleTitle}>{article.title}</h1>
        {article.publishedAt && (
          <p className={styles.articleDate}>{formatDate(article.publishedAt)}</p>
        )}
        <div className={styles.markdown}>
          <ReactMarkdown>{article.content}</ReactMarkdown>
        </div>
      </article>

      <p className={styles.disclaimer}>
        {t('articles.disclaimerView')}
      </p>
    </div>
  );
}
