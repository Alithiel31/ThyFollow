// src/routers/auth.router.ts
import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { oidcController } from '../controllers/oidc.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.post('/register', asyncHandler(authController.register));
router.post('/login', asyncHandler(authController.login));
router.post('/verify-email', asyncHandler(authController.verifyEmail));
router.post('/resend-verification', asyncHandler(authController.resendVerification));
router.post('/forgot-password', asyncHandler(authController.forgotPassword));
router.post('/reset-password', asyncHandler(authController.resetPassword));
router.get('/me', authenticate, asyncHandler(authController.me));

// OpenID Connect / OAuth2 — "Se connecter avec Google"
router.get('/oidc/google', asyncHandler(oidcController.googleAuthorize));
router.get('/oidc/google/callback', asyncHandler(oidcController.googleCallback));

export default router;
