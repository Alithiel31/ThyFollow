// src/pages/ArticlesPage.tsx — section "Comprendre" : liste des articles
// publiés et lecture (markdown). Une seule page pour les deux vues,
// le paramètre :slug décide.
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
  const navigate = useNavigate();
  const { data: articles = [], isLoading } = useQuery({
    queryKey: ['articles', 'list'],
    queryFn: () => articlesApi.list('ARTICLE').then((r) => r.data),
  });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Comprendre</h1>
        <p className={styles.sub}>La thyroïde, les bonnes pratiques, et ce que disent vos analyses</p>
      </div>

      {isLoading ? (
        <div className={styles.loader}><div className="spinner" /></div>
      ) : articles.length === 0 ? (
        <div className={styles.empty}>
          <BookOpen size={40} strokeWidth={1} />
          <p>Les premiers articles arrivent bientôt</p>
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
        Ces contenus sont informatifs et ne remplacent pas un avis médical.
        Parlez de votre situation avec votre médecin ou votre endocrinologue.
      </p>
    </div>
  );
}

function ArticleView({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const { data: article, isLoading, isError } = useQuery({
    queryKey: ['articles', slug],
    queryFn: () => articlesApi.get(slug).then((r) => r.data),
  });

  if (isLoading) return <div className={styles.loader}><div className="spinner" /></div>;
  if (isError || !article) {
    return (
      <div className={styles.empty}>
        <p>Article introuvable</p>
        <button className={styles.backBtn} onClick={() => navigate('/learn')}>
          <ArrowLeft size={16} /> Retour aux articles
        </button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => navigate('/learn')}>
        <ArrowLeft size={16} /> Tous les articles
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
        Contenu informatif — ne remplace pas un avis médical.
      </p>
    </div>
  );
}
