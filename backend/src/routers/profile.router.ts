// src/routers/profile.router.ts
import { Router } from 'express';
import { profileController } from '../controllers/profile.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(profileController.get));
router.put('/', asyncHandler(profileController.update));
router.put('/ai-extraction-consent', asyncHandler(profileController.setAiExtractionConsent));
router.get('/security/events', asyncHandler(profileController.securityEvents));
router.get('/notifications', asyncHandler(profileController.getNotifications));
router.put('/notifications', asyncHandler(profileController.updateNotifications));

export default router;
