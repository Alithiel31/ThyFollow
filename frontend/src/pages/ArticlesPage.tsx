// src/pages/ArticlesPage.tsx -- section "Comprendre" (maquette) : bibliotheque
// de fiches pedagogiques (donnees locales, src/content/comprendre) + articles
// publies depuis l'admin (API, markdown).
// - /learn         : liste (dans l'AppShell)
// - /learn/:slug   : lecteur plein ecran ; fiche locale, sinon article API
// - /learn/fin     : ecran de fin du parcours
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import {
  ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, Clock, ExternalLink, Search, X,
  Lightbulb, ShieldAlert, TestTube, Pill, Moon, Stethoscope, FlaskConical, Droplet, Activity,
  NotebookPen, MessageCircle, Sparkles, Leaf, HeartPulse,
  type LucideIcon,
} from 'lucide-react';
import { articlesApi } from '../lib/api';
import { formatDate } from '../lib/utils';
import {
  ALL_CATEGORIES, CATEGORIES, LEARN_END_SLUG, categoryTone, contentLanguage, filterArticles,
  findArticle, getLibrary, isMedicallyReviewed, normalizeSearch, readingSequence, type PastelTone,
} from '../lib/learn';
import { LogoMark } from '../components/LogoMark';
import type { LocalizedArticle } from '../types';
import styles from './ArticlesPage.module.css';

const TONE_CLASS: Record<PastelTone, string> = {
  peach: styles.tonePeach,
  blue: styles.toneBlue,
  lavender: styles.toneLavender,
  mint: styles.toneMint,
  butter: styles.toneButter,
  rose: styles.toneRose,
};

const toneOf = (category: string) => TONE_CLASS[categoryTone(category)];

/* Pictogramme de catégorie (liste « Les dernières fiches ») ; la thyroïde
   a la forme d'un papillon, comme le logo */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  basedow: HeartPulse,
  analyses: TestTube,
  traitements: Pill,
  quotidien: Moon,
  suivi: Stethoscope,
  securite: ShieldAlert,
};

function CategoryIcon({ category, size = 20 }: { category: string; size?: number }) {
  const Icon = CATEGORY_ICONS[category];
  return Icon ? <Icon size={size} strokeWidth={1.7} aria-hidden="true" /> : <LogoMark size={size + 6} />;
}

/* Icônes des sections affichées en cartes (maquette « TSH, T4, T3 ») */
const SECTION_ICONS: Record<string, LucideIcon[]> = {
  analyses: [FlaskConical, Droplet, Activity],
  quotidien: [Activity, NotebookPen, MessageCircle],
};
const SECTION_TONES = [styles.toneLavender, styles.toneBlue, styles.toneMint];

// Au-delà, les points ne tiennent plus sur une ligne mobile : le compteur suffit
const MAX_PAGER_DOTS = 20;

// Recherche de la liste conservée pendant la lecture (?cat=…&q=…)
type LearnLocationState = { from?: string } | null;

/* Fiches dans la langue de l'interface + libellés de catégorie traduits */
function useLearnLibrary() {
  const { t, i18n } = useTranslation();
  const language = contentLanguage(i18n.language);
  const articles = getLibrary(language);
  const labelOf = (category: string) => t(`articles.categories.${category}.label`);
  return { articles, labelOf, language };
}

export function ArticlesPage() {
  const { slug } = useParams();
  const { articles } = useLearnLibrary();
  if (!slug) return <Library />;
  if (slug === LEARN_END_SLUG) return <LearnEnd />;
  const local = findArticle(articles, slug);
  return local ? <EducationReader article={local} /> : <ArticleView slug={slug} />;
}

/* ── Bibliothèque ─────────────────────────────── */

function Library() {
  const { t } = useTranslation();
  const { articles, labelOf } = useLearnLibrary();
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
  const results = filterArticles(articles, category, search, labelOf);
  // Une carte « À la une » par maladie (Hashimoto, Basedow) hors filtrage
  const featured = filtering ? [] : results.filter((a) => a.featured);
  const rest = results.filter((a) => !featured.includes(a));
  const knownCategory = (CATEGORIES as readonly string[]).includes(category);

  const query = normalizeSearch(search);
  const visibleTeamArticles = category === ALL_CATEGORIES
    ? teamArticles.filter((a) => normalizeSearch(`${a.title} ${a.excerpt ?? ''}`).includes(query))
    : [];

  const from = location.search;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t('articles.title')}</h1>
        <p className={styles.sub}>{t('articles.subtitle')}</p>
      </header>

      <form
        role="search"
        className={styles.searchBox}
        onSubmit={(e: FormEvent) => e.preventDefault()}
      >
        <label htmlFor="learn-search" className="sr-only">{t('articles.searchLabel')}</label>
        <Search size={17} className={styles.searchIcon} aria-hidden="true" />
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
        {CATEGORIES.map((id) => (
          <button
            key={id}
            type="button"
            className={`${styles.chip} ${category === id ? styles.chipActive : ''}`}
            aria-pressed={category === id}
            onClick={() => updateParams({ cat: id })}
          >
            {labelOf(id)}
          </button>
        ))}
      </div>

      {featured.length > 0 && (
        <section className={styles.section} aria-label={t('articles.featured')}>
          <ul className={styles.featuredList}>
            {featured.map((a) => (
              <li key={a.id}>
                <FeaturedCard article={a} from={from} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section} aria-labelledby="learn-latest">
        <div className={styles.sectionHead}>
          <h2 id="learn-latest" className={styles.sectionTitle}>
            {filtering ? t('articles.results') : t('articles.latest')}
          </h2>
          <p className={styles.count} aria-live="polite">
            {t('articles.resultCount', { count: results.length })}
          </p>
        </div>
        {category !== ALL_CATEGORIES && knownCategory && (
          <p className={styles.categoryNote}>{t(`articles.categories.${category}.description`)}</p>
        )}

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
          <ul className={styles.rows}>
            {rest.map((a) => (
              <li key={a.id}>
                <ArticleRow article={a} from={from} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {visibleTeamArticles.length > 0 && (
        <section className={styles.section} aria-labelledby="learn-team">
          <h2 id="learn-team" className={styles.sectionTitle}>{t('articles.teamArticles')}</h2>
          <ul className={styles.rows}>
            {visibleTeamArticles.map((a) => (
              <li key={a.id}>
                <Link to={`/learn/${a.slug}`} className={styles.row}>
                  <div className={styles.rowBody}>
                    <h3 className={styles.rowTitle}>{a.title}</h3>
                    {a.excerpt && <p className={styles.rowExcerpt}>{a.excerpt}</p>}
                    {a.publishedAt && (
                      <p className={styles.meta}>{formatDate(a.publishedAt)}</p>
                    )}
                  </div>
                  <ChevronRight size={18} className={styles.rowArrow} aria-hidden="true" />
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

function ReadTime({ minutes, short = false }: { minutes: number; short?: boolean }) {
  const { t } = useTranslation();
  return (
    <span className={styles.meta}>
      <Clock size={13} aria-hidden="true" />
      {short ? `${minutes} min` : t('articles.readMinutes', { count: minutes })}
    </span>
  );
}

/* « À la une » compacte : texte à gauche, illustration à droite */
function FeaturedCard({ article, from }: { article: LocalizedArticle; from: string }) {
  const { t } = useTranslation();
  return (
    <Link to={`/learn/${article.id}`} state={{ from }} className={`${styles.featured} ${toneOf(article.category)}`}>
      <div className={styles.featuredBody}>
        <span className={styles.featuredBadge}>{t('articles.featured')}</span>
        <h2 className={styles.featuredTitle} lang={article.lang}>{article.title}</h2>
        <p className={styles.featuredSummary} lang={article.lang}>{article.summary}</p>
        <div className={styles.featuredFoot}>
          <ReadTime minutes={article.readMinutes} short />
          <ArrowRight size={17} aria-hidden="true" />
        </div>
      </div>
      <Illustration key={article.image} src={article.image} className={styles.featuredMedia} />
    </Link>
  );
}

/* Illustration décorative (alt vide) : si le fichier manque, on retire le
   cadre plutôt que d'afficher une image cassée */
function Illustration({ src, className }: { src: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <div className={className}>
      <img src={src} alt="" decoding="async" width={758} height={500} onError={() => setFailed(true)} />
    </div>
  );
}

/* Ligne compacte : pictogramme, titre, durée, flèche */
function ArticleRow({ article, from }: { article: LocalizedArticle; from: string }) {
  return (
    <Link to={`/learn/${article.id}`} state={{ from }} className={`${styles.row} ${toneOf(article.category)}`}>
      <span className={styles.rowIcon}><CategoryIcon category={article.category} /></span>
      <div className={styles.rowBody}>
        <h3 className={styles.rowTitle} lang={article.lang}>{article.title}</h3>
        <ReadTime minutes={article.readMinutes} short />
      </div>
      <ChevronRight size={18} className={styles.rowArrow} aria-hidden="true" />
    </Link>
  );
}

/* ── Lecteur plein écran ──────────────────────── */

function ReaderScreen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`${styles.readerScreen} ${className}`}>
      <div className={styles.readerColumn}>{children}</div>
    </div>
  );
}

function EducationReader({ article }: { article: LocalizedArticle }) {
  const { t } = useTranslation();
  const { articles, labelOf, language } = useLearnLibrary();
  const location = useLocation();
  const from = (location.state as LearnLocationState)?.from ?? '';
  const titleRef = useRef<HTMLHeadingElement>(null);

  const sequence = readingSequence(articles, from, labelOf);
  const found = sequence.findIndex((a) => a.id === article.id);
  // Fiche ouverte hors de la liste filtrée (lien direct) : parcours complet
  const list = found >= 0 ? sequence : articles;
  const index = found >= 0 ? found : list.findIndex((a) => a.id === article.id);
  const prev = list[index - 1];
  const next = list[index + 1];

  // Navigation SPA : repartir du haut et annoncer la nouvelle fiche.
  // Pas de focus forcé sur un chargement direct (location.key 'default').
  const navigatedInApp = location.key !== 'default';
  useEffect(() => {
    window.scrollTo(0, 0);
    if (navigatedInApp) titleRef.current?.focus({ preventScroll: true });
  }, [article.id, navigatedInApp]);

  const progress = t('articles.progress', { current: index + 1, total: list.length });
  const style = article.sectionStyle ?? 'prose';
  const sectionIcons = SECTION_ICONS[article.category] ?? [Sparkles, Leaf, MessageCircle];

  return (
    <ReaderScreen className={toneOf(article.category)}>
      <div className={styles.readerTop}>
        <Link
          to={{ pathname: '/learn', search: from }}
          className={styles.iconBtn}
          aria-label={t('articles.backToLibrary')}
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <span className={styles.counter}>
          <span aria-hidden="true">{index + 1} / {list.length}</span>
          <span className="sr-only">{progress}</span>
        </span>
      </div>

      <article className={styles.reader} lang={article.lang}>
        <header className={styles.readerHeader}>
          <div className={styles.readerMeta} lang={language}>
            <span className={styles.badge}>{labelOf(article.category)}</span>
            <ReadTime minutes={article.readMinutes} />
          </div>
          {article.lang !== language && (
            <p className={styles.langNote} lang={language}>{t('articles.frenchOnlyGuide')}</p>
          )}
          <h1 ref={titleRef} tabIndex={-1} className={styles.readerTitle}>{article.title}</h1>
          <p className={styles.lead}>{article.summary}</p>
        </header>

        <Illustration key={article.image} src={article.image} className={styles.readerMedia} />

        <p className={styles.intro}>{article.intro}</p>

        {style === 'cards' ? (
          <ul className={styles.infoCards}>
            {article.sections.map((s, i) => {
              const Icon = sectionIcons[i % sectionIcons.length];
              return (
                <li key={s.heading} className={`${styles.infoCard} ${SECTION_TONES[i % SECTION_TONES.length]}`}>
                  <span className={styles.infoIcon}><Icon size={22} strokeWidth={1.7} aria-hidden="true" /></span>
                  <div>
                    <h2 className={styles.infoTitle}>{s.heading}</h2>
                    <p className={styles.infoBody}>{s.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : style === 'checklist' ? (
          <ul className={styles.checklist}>
            {article.sections.map((s) => (
              <li key={s.heading}>
                <span className={styles.checkMark}><Check size={14} strokeWidth={2.6} aria-hidden="true" /></span>
                <div>
                  <h2 className={styles.checkTitle}>{s.heading}</h2>
                  <p className={styles.checkBody}>{s.body}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.prose}>
            {article.sections.map((s) => (
              <section key={s.heading}>
                <h2>{s.heading}</h2>
                <p>{s.body}</p>
              </section>
            ))}
          </div>
        )}

        <aside className={styles.takeaways} aria-labelledby="learn-takeaways">
          <h2 id="learn-takeaways" className={styles.takeawaysTitle} lang={language}>
            <Lightbulb size={20} strokeWidth={1.7} aria-hidden="true" />
            {t('articles.takeaways')}
          </h2>
          <ol>
            {article.takeaways.map((item, i) => (
              <li key={item}>
                <span className={styles.stepNum} aria-hidden="true">{i + 1}</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </aside>

        {article.sources.length > 0 && (
          <section className={styles.sources} aria-labelledby="learn-sources">
            <h2 id="learn-sources" className={styles.sourcesTitle} lang={language}>{t('articles.sources')}</h2>
            <ul>
              {article.sources.map((src) => (
                <li key={src.url}>
                  <a href={src.url} target="_blank" rel="noopener noreferrer">
                    {src.label}
                    <ExternalLink size={13} aria-hidden="true" />
                    <span className="sr-only" lang={language}> {t('articles.opensInNewTab')}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className={styles.review} lang={language}>
          <ShieldAlert size={15} aria-hidden="true" />
          {isMedicallyReviewed(article) && article.reviewedAt
            ? t('articles.reviewedOn', { date: formatDate(article.reviewedAt) })
            : t('articles.reviewPending')}
        </p>
        <p className={styles.readerDisclaimer} lang={language}>{t('articles.disclaimerReader')}</p>
      </article>

      <nav className={styles.pager} aria-label={t('articles.pagination')}>
        {prev ? (
          <Link to={`/learn/${prev.id}`} state={{ from }} className={styles.pagerBtn} aria-label={t('articles.previous')}>
            <ChevronLeft size={20} aria-hidden="true" />
          </Link>
        ) : (
          <span className={`${styles.pagerBtn} ${styles.pagerBtnOff}`} aria-hidden="true">
            <ChevronLeft size={20} />
          </span>
        )}
        <span className={styles.dots} aria-hidden="true">
          {list.length <= MAX_PAGER_DOTS && list.map((a, i) => (
            <span key={a.id} className={`${styles.dot} ${i === index ? styles.dotActive : ''}`} />
          ))}
        </span>
        <Link
          to={next ? `/learn/${next.id}` : `/learn/${LEARN_END_SLUG}`}
          state={{ from }}
          className={`${styles.pagerBtn} ${styles.pagerBtnPrimary}`}
          aria-label={next ? t('articles.next') : t('articles.finish')}
        >
          <ChevronRight size={20} aria-hidden="true" />
        </Link>
      </nav>
    </ReaderScreen>
  );
}

/* ── Écran de fin du parcours ─────────────────── */

function LearnEnd() {
  const { t } = useTranslation();
  const location = useLocation();
  const from = (location.state as LearnLocationState)?.from ?? '';
  return (
    <div className={styles.endScreen}>
      <div className={styles.endContent}>
        <p className={styles.endBrand}>
          <LogoMark size={22} />
          <span>{t('app.name')}</span>
        </p>
        <h1 className={styles.endTitle}>{t('articles.endTitle')}</h1>
        <p className={styles.endSub}>{t('articles.endSubtitle')}</p>
      </div>
      <Landscape />
      <div className={styles.endActions}>
        <Link to="/dashboard" className={styles.endBtn}>{t('articles.backHome')}</Link>
        <Link to={{ pathname: '/learn', search: from }} className={styles.endLink}>
          {t('articles.backToLibrary')}
        </Link>
        <p className={styles.endDisclaimer}>{t('articles.disclaimerView')}</p>
      </div>
    </div>
  );
}

/* Paysage décoratif (montagnes, forêt, lac et reflets) dessiné en SVG */
const PINES: [number, number, number][] = [
  [6, 214, 46], [24, 216, 58], [44, 214, 40], [62, 217, 50], [80, 215, 34],
  [318, 216, 36], [336, 214, 52], [356, 217, 44], [374, 214, 60], [394, 216, 42],
];

function pine(x: number, base: number, h: number) {
  const w = h / 3.4;
  return `M${x} ${base - h} L${x - w * 0.55} ${base - h * 0.55} H${x - w * 0.3} `
    + `L${x - w} ${base} H${x + w} L${x + w * 0.3} ${base - h * 0.55} H${x + w * 0.55} Z`;
}

function Landscape() {
  return (
    <svg className={styles.landscape} viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="learn-lake" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9b4ea" stopOpacity="0.7" />
          <stop offset="1" stopColor="#14243f" stopOpacity="0.95" />
        </linearGradient>
        <radialGradient id="learn-sun">
          <stop offset="0" stopColor="#fde3d6" />
          <stop offset="0.45" stopColor="#f5c9c4" stopOpacity="0.8" />
          <stop offset="1" stopColor="#f5c9c4" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="292" cy="112" r="44" fill="url(#learn-sun)" />
      <circle cx="292" cy="112" r="13" fill="#fde7dc" />
      <path d="M0 176 L48 128 L86 152 L142 96 L196 150 L238 118 L292 160 L340 120 L400 158 V214 H0 Z" fill="#9fa3dc" opacity="0.55" />
      <path d="M0 196 L40 166 L92 188 L150 146 L214 194 L268 162 L326 196 L400 170 V214 H0 Z" fill="#6670ad" opacity="0.85" />
      <rect x="0" y="212" width="400" height="88" fill="url(#learn-lake)" />
      {/* Reflets : montagnes inversées et éclat du soleil sur l'eau */}
      <path d="M0 212 L40 236 L92 220 L150 250 L214 216 L268 240 L326 214 L400 232 V212 Z" fill="#6670ad" opacity="0.28" />
      <path d="M262 222 H322 M272 232 H312 M282 242 H302" stroke="#fde3d6" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
      {PINES.map(([x, base, h]) => (
        <g key={x}>
          <path d={pine(x, base, h)} fill="#26355d" />
          <path d={pine(x, base, h)} fill="#26355d" opacity="0.22" transform={`translate(0 ${2 * base}) scale(1 -1)`} />
        </g>
      ))}
    </svg>
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

  if (isLoading) {
    return <ReaderScreen><div className={styles.loader}><div className="spinner" /></div></ReaderScreen>;
  }
  if (isError || !article) {
    return (
      <ReaderScreen>
        <div className={styles.empty}>
          <p>{t('articles.notFound')}</p>
          <button className={styles.resetBtn} onClick={() => navigate('/learn')}>
            {t('articles.backToList')}
          </button>
        </div>
      </ReaderScreen>
    );
  }

  return (
    <ReaderScreen>
      <div className={styles.readerTop}>
        <Link to="/learn" className={styles.iconBtn} aria-label={t('articles.allArticles')}>
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
      </div>

      <article className={styles.reader}>
        <h1 className={styles.readerTitle}>{article.title}</h1>
        {article.publishedAt && (
          <p className={styles.articleDate}>{formatDate(article.publishedAt)}</p>
        )}
        <div className={styles.markdown}>
          <ReactMarkdown>{article.content}</ReactMarkdown>
        </div>
        <p className={styles.readerDisclaimer}>{t('articles.disclaimerView')}</p>
      </article>
    </ReaderScreen>
  );
}
