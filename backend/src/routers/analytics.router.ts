// src/routers/analytics.router.ts
import { Router } from 'express';
import { analyticsController } from '../controllers/analytics.controller';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/overview', asyncHandler(analyticsController.overview));
router.get('/symptoms', asyncHandler(analyticsController.symptoms));

export default router;
