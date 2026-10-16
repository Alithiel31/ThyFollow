// src/routers/pdfPasswords.router.ts
import { Router } from 'express';
import { pdfPasswordsController } from '../controllers/pdfPasswords.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(pdfPasswordsController.list));
router.post('/', asyncHandler(pdfPasswordsController.create));
router.delete('/', asyncHandler(pdfPasswordsController.removeAll));
router.delete('/:id', asyncHandler(pdfPasswordsController.remove));

export default router;
