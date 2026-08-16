// src/routers/googleHealthWebhook.router.ts
import { Router } from 'express';
import { googleHealthWebhookController } from '../controllers/googleHealthWebhook.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

// Non protégé par `authenticate` : c'est Google qui appelle cet endpoint,
// pas un utilisateur ThyroTrack. L'authenticité est vérifiée par
// channelToken à l'intérieur du contrôleur (voir googleHealthWebhook.controller.ts).
router.get('/', googleHealthWebhookController.verify);
router.post('/', asyncHandler(googleHealthWebhookController.notify));

export default router;
