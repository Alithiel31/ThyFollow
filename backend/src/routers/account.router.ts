// src/routers/account.router.ts
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { accountController } from '../controllers/account.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// L'export déchiffre tous les PDF du compte, la suppression vérifie un mot de passe
const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: (req: Request) => ({ error: req.t('errors.tooManyRequests') }),
});

router.get('/export', accountLimiter, asyncHandler(accountController.export));
router.delete('/', accountLimiter, asyncHandler(accountController.remove));

export default router;
