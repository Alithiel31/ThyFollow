// src/routers/googleHealthWebhook.router.ts
import { Router } from 'express';
import { googleHealthWebhookController } from '../controllers/googleHealthWebhook.controller.js';

const router = Router();

// Non protégé par `authenticate` : c'est Google qui appelle cet endpoint,
// pas un utilisateur ThyroTrack. L'authenticité est vérifiée via l'en-tête
// Authorization à l'intérieur du contrôleur (voir googleHealthWebhook.controller.ts).
router.post('/', googleHealthWebhookController.notify);

export default router;
