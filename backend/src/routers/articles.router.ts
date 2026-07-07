// src/routers/articles.router.ts
import { Router } from 'express';
import { articlesController } from '../controllers/articles.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';

const router = Router();
router.use(authenticate);

// Admin d'abord : sinon "admin" serait avalé par la route /:slug
router.get('/admin/all', asyncHandler(requireAdmin), asyncHandler(articlesController.adminList));
router.post('/admin', asyncHandler(requireAdmin), asyncHandler(articlesController.create));
router.put('/admin/:id', asyncHandler(requireAdmin), asyncHandler(articlesController.update));
router.delete('/admin/:id', asyncHandler(requireAdmin), asyncHandler(articlesController.remove));

router.get('/', asyncHandler(articlesController.list));
router.get('/:slug', asyncHandler(articlesController.getBySlug));

export default router;
