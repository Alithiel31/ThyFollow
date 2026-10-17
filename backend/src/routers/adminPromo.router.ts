// src/routers/adminPromo.router.ts
import { Router } from 'express';
import { adminPromoController } from '../controllers/adminPromo.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';

const router = Router();
router.use(authenticate, asyncHandler(requireAdmin));

router.get('/', asyncHandler(adminPromoController.list));
router.post('/', asyncHandler(adminPromoController.create));
router.patch('/:id', asyncHandler(adminPromoController.update));

export default router;
