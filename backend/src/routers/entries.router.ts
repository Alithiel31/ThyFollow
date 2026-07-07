// src/routers/entries.router.ts
import { Router } from 'express';
import { entriesController } from '../controllers/entries.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(entriesController.list));
router.get('/:date', asyncHandler(entriesController.getByDate));
router.post('/', asyncHandler(entriesController.upsert));
router.delete('/:date', asyncHandler(entriesController.remove));

export default router;
