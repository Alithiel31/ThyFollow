// src/routers/analytics.router.ts
import { Router } from 'express';
import { analyticsController } from '../controllers/analytics.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/overview', asyncHandler(analyticsController.overview));
router.get('/symptoms', asyncHandler(analyticsController.symptoms));
router.get('/report', asyncHandler(analyticsController.report));

export default router;
