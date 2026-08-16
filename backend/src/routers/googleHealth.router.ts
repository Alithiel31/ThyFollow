// src/routers/googleHealth.router.ts
import { Router } from 'express';
import { googleHealthController } from '../controllers/googleHealth.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Liaison/déliaison de la Google Health API à un compte connecté (voir
// controllers/googleHealth.controller.ts). Le callback n'est pas protégé
// par `authenticate` : c'est une navigation plein-page initiée par Google,
// l'utilisateur est identifié via le cookie httpOnly posé par `link`.
router.post('/link', authenticate, asyncHandler(googleHealthController.linkStart));
router.get('/callback', asyncHandler(googleHealthController.callback));
router.delete('/link', authenticate, asyncHandler(googleHealthController.unlink));

export default router;
