// src/controllers/articles.controller.ts
import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { NotFoundError } from '../lib/errors.js';

const articleSchema = z.object({
  title: z.string().min(3, 'Titre trop court'),
  excerpt: z.string().optional().nullable(),
  content: z.string().min(1, 'Contenu requis'),
  kind: z.enum(['ARTICLE', 'TIP']).default('ARTICLE'),
  published: z.boolean().default(false),
});

// "Bien dormir avec Hashimoto" → "bien-dormir-avec-hashimoto"
function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')                  // décompose les accents…
    .replace(/[\u0300-\u036f]/g, '') // …puis les retire
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

async function uniqueSlug(title: string, excludeId?: string): Promise<string> {
  const base = slugify(title) || 'article';
  let slug = base;
  for (let i = 2; ; i++) {
    const existing = await prisma.article.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    slug = `${base}-${i}`;
  }
}

const summarySelect = {
  id: true, slug: true, title: true, excerpt: true,
  kind: true, published: true, publishedAt: true, updatedAt: true,
} as const;

export const articlesController = {
  // GET /api/articles?kind=ARTICLE|TIP — contenu publié uniquement
  list: async (req: AuthRequest, res: Response): Promise<void> => {
    const kind = req.query.kind === 'TIP' ? 'TIP' : req.query.kind === 'ARTICLE' ? 'ARTICLE' : undefined;
    const articles = await prisma.article.findMany({
      where: { published: true, ...(kind ? { kind } : {}) },
      orderBy: { publishedAt: 'desc' },
      select: kind === 'TIP'
        ? { ...summarySelect, content: true } // les encarts sont courts : contenu inclus
        : summarySelect,
    });
    res.json(articles);
  },

  // GET /api/articles/:slug — lecture d'un article publié
  getBySlug: async (req: AuthRequest, res: Response): Promise<void> => {
    const article = await prisma.article.findFirst({
      where: { slug: req.params.slug, published: true },
    });
    if (!article) throw new NotFoundError('Article');
    res.json(article);
  },

  // ── Admin ──────────────────────────────────

  // GET /api/articles/admin/all — tout, y compris brouillons
  adminList: async (_req: AuthRequest, res: Response): Promise<void> => {
    const articles = await prisma.article.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    res.json(articles);
  },

  // POST /api/articles/admin
  create: async (req: AuthRequest, res: Response): Promise<void> => {
    const data = articleSchema.parse(req.body);
    const article = await prisma.article.create({
      data: {
        ...data,
        slug: await uniqueSlug(data.title),
        publishedAt: data.published ? new Date() : null,
      },
    });
    res.status(201).json(article);
  },

  // PUT /api/articles/admin/:id
  update: async (req: AuthRequest, res: Response): Promise<void> => {
    const data = articleSchema.partial().parse(req.body);
    const existing = await prisma.article.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Article');

    const article = await prisma.article.update({
      where: { id: existing.id },
      data: {
        ...data,
        ...(data.title ? { slug: await uniqueSlug(data.title, existing.id) } : {}),
        // horodater la première publication
        ...(data.published && !existing.publishedAt ? { publishedAt: new Date() } : {}),
      },
    });
    res.json(article);
  },

  // DELETE /api/articles/admin/:id
  remove: async (req: AuthRequest, res: Response): Promise<void> => {
    const existing = await prisma.article.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new NotFoundError('Article');
    await prisma.article.delete({ where: { id: existing.id } });
    res.status(204).end();
  },
};
