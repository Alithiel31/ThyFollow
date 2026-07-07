// src/routers/profile.router.ts
import { Router } from 'express';
import { profileController } from '../controllers/profile.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(profileController.get));
router.put('/', asyncHandler(profileController.update));

export default router;
