// src/pages/ArticlesPage.tsx -- section "Comprendre" : liste des articles
// publies et lecture (markdown). Une seule page pour les deux vues,
// le parametre :slug decide.
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { BookOpen, ArrowLeft, ChevronRight } from 'lucide-react';
import { articlesApi } from '../lib/api';
import { formatDate } from '../lib/utils';
import styles from './ArticlesPage.module.css';

export function ArticlesPage() {
  const { slug } = useParams();
  return slug ? <ArticleView slug={slug} /> : <ArticleList />;
}

function ArticleList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: articles = [], isLoading } = useQuery({
    queryKey: ['articles', 'list'],
    queryFn: () => articlesApi.list('ARTICLE').then((r) => r.data),
  });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('articles.title')}</h1>
        <p className={styles.sub}>{t('articles.subtitle')}</p>
      </div>

      {isLoading ? (
        <div className={styles.loader}><div className="spinner" /></div>
      ) : articles.length === 0 ? (
        <div className={styles.empty}>
          <BookOpen size={40} strokeWidth={1} />
          <p>{t('articles.comingSoon')}</p>
        </div>
      ) : (
        <div className={styles.list}>
          {articles.map((a) => (
            <article key={a.id} className={styles.card} onClick={() => navigate(`/learn/${a.slug}`)}>
              <div className={styles.cardBody}>
                <h2 className={styles.cardTitle}>{a.title}</h2>
                {a.excerpt && <p className={styles.cardExcerpt}>{a.excerpt}</p>}
                {a.publishedAt && (
                  <p className={styles.cardDate}>{formatDate(a.publishedAt)}</p>
                )}
              </div>
              <ChevronRight size={18} className={styles.cardChevron} />
            </article>
          ))}
        </div>
      )}

      <p className={styles.disclaimer}>
        {t('articles.disclaimerList')}
      </p>
    </div>
  );
}

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
    <div className={styles.page}>
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
