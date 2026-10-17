// src/routers/billing.router.ts
import { Router } from 'express';
import { billingController } from '../controllers/billing.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.post('/checkout', asyncHandler(billingController.checkout));
router.post('/portal', asyncHandler(billingController.portal));
router.post('/redeem', asyncHandler(billingController.redeem));

export default router;
