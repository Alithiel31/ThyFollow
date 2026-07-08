// src/pages/AdminArticlesPage.tsx — rédaction : CRUD des articles et encarts.
// Accessible uniquement au rôle ADMIN (le backend re-vérifie de toute façon).
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Plus, PenLine, Trash2, Eye, EyeOff } from 'lucide-react';
import { articlesApi } from '../lib/api';
import { useAuthStore } from '../lib/store';
import { formatDate } from '../lib/utils';
import type { Article, ArticleKind } from '../types';
import styles from './AdminArticlesPage.module.css';

const EMPTY: Partial<Article> = {
  title: '', excerpt: '', content: '', kind: 'ARTICLE', published: false,
};

export function AdminArticlesPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Article | null>(null);
  const [form, setForm] = useState<Partial<Article>>(EMPTY);

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ['articles', 'admin'],
    queryFn: () => articlesApi.adminList().then((r) => r.data),
    enabled: user?.role === 'ADMIN',
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['articles'] });

  const createMut = useMutation({
    mutationFn: (d: Partial<Article> & { title: string; content: string }) => articlesApi.create(d),
    onSuccess: () => { toast.success(t('adminArticles.created')); invalidate(); resetForm(); },
    onError: () => toast.error(t('adminArticles.error')),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Article> }) => articlesApi.update(id, data),
    onSuccess: () => { toast.success(t('adminArticles.updated')); invalidate(); resetForm(); },
    onError: () => toast.error(t('adminArticles.error')),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => articlesApi.delete(id),
    onSuccess: () => { toast.success(t('adminArticles.deleted')); invalidate(); },
    onError: () => toast.error(t('adminArticles.error')),
  });

  // La garde : un non-admin est renvoyé au dashboard
  if (user && user.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;

  const resetForm = () => { setShowForm(false); setEditItem(null); setForm(EMPTY); };

  const openEdit = (a: Article) => { setEditItem(a); setForm(a); setShowForm(true); };

  const togglePublish = (a: Article) =>
    updateMut.mutate({ id: a.id, data: { published: !a.published } });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.content) return toast.error(t('adminArticles.missingFields'));
    const payload = {
      title: form.title, excerpt: form.excerpt || null, content: form.content,
      kind: form.kind ?? 'ARTICLE', published: form.published ?? false,
    };
    if (editItem) updateMut.mutate({ id: editItem.id, data: payload });
    else createMut.mutate(payload as Partial<Article> & { title: string; content: string });
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('adminArticles.title')}</h1>
          <p className={styles.sub}>{t('adminArticles.subtitle')}</p>
        </div>
        <button className={styles.addBtn} onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus size={16} /> {t('adminArticles.new')}
        </button>
      </div>

      {showForm && (
        <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && resetForm()}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>
              <PenLine size={18} /> {editItem ? t('adminArticles.editTitle') : t('adminArticles.newTitle')}
            </h2>
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.grid2}>
                <div className={styles.field}>
                  <label className={styles.label}>{t('adminArticles.type')}</label>
                  <select className={styles.input} value={form.kind ?? 'ARTICLE'}
                    onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as ArticleKind }))}>
                    <option value="ARTICLE">{t('adminArticles.typeArticle')}</option>
                    <option value="TIP">{t('adminArticles.typeTip')}</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>{t('adminArticles.status')}</label>
                  <label className={styles.checkRow}>
                    <input type="checkbox" checked={form.published ?? false}
                      onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))} />
                    <span>{t('adminArticles.published')}</span>
                  </label>
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>{t('adminArticles.titleField')}</label>
                <input className={styles.input} value={form.title ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder={t('adminArticles.titlePlaceholder')} required />
              </div>

              {form.kind !== 'TIP' && (
                <div className={styles.field}>
                  <label className={styles.label}>{t('adminArticles.excerpt')}</label>
                  <input className={styles.input} value={form.excerpt ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
                    placeholder={t('adminArticles.excerptPlaceholder')} />
                </div>
              )}

              <div className={styles.field}>
                <label className={styles.label}>
                  {form.kind === 'TIP' ? t('adminArticles.tipContent') : t('adminArticles.articleContent')}
                </label>
                <textarea className={styles.textarea}
                  rows={form.kind === 'TIP' ? 4 : 14}
                  value={form.content ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  placeholder={form.kind === 'TIP'
                    ? t('adminArticles.tipPlaceholder')
                    : t('adminArticles.articlePlaceholder')}
                  required />
              </div>

              <div className={styles.formActions}>
                <button type="button" className={styles.cancelBtn} onClick={resetForm}>{t('common.cancel')}</button>
                <button type="submit" className={styles.submitBtn}
                  disabled={createMut.isPending || updateMut.isPending}>
                  {createMut.isPending || updateMut.isPending ? t('adminArticles.submitting') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className={styles.loader}><div className="spinner" /></div>
      ) : (
        <div className={styles.list}>
          {articles.map((a) => (
            <div key={a.id} className={styles.row} onClick={() => openEdit(a)}>
              <div className={styles.rowBody}>
                <span className={`${styles.kindBadge} ${a.kind === 'TIP' ? styles.kindTip : ''}`}>
                  {a.kind === 'TIP' ? t('adminArticles.kindTip') : t('adminArticles.kindArticle')}
                </span>
                <div>
                  <p className={styles.rowTitle}>{a.title}</p>
                  <p className={styles.rowMeta}>
                    {a.published && a.publishedAt
                      ? t('adminArticles.publishedOn', { date: formatDate(a.publishedAt) })
                      : t('adminArticles.draft')}
                  </p>
                </div>
              </div>
              <div className={styles.rowActions} onClick={(e) => e.stopPropagation()}>
                <button className={styles.iconBtn} onClick={() => togglePublish(a)}
                  title={a.published ? t('adminArticles.unpublish') : t('adminArticles.publish')}>
                  {a.published
                    ? <Eye size={17} style={{ color: 'var(--success)' }} />
                    : <EyeOff size={17} />}
                </button>
                <button className={styles.iconBtn}
                  onClick={() => { if (confirm(t('adminArticles.deleteConfirm'))) deleteMut.mutate(a.id); }}
                  title={t('adminArticles.delete')}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
          {articles.length === 0 && (
            <p className={styles.empty}>{t('adminArticles.empty')}</p>
          )}
        </div>
      )}
    </div>
  );
}
