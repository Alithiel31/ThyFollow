// src/routers/labResults.router.ts
import { Router } from 'express';
import { labResultsController } from '../controllers/labResults.controller';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(labResultsController.list));
router.get('/:id', asyncHandler(labResultsController.getById));
router.post('/', asyncHandler(labResultsController.create));
router.put('/:id', asyncHandler(labResultsController.update));
router.delete('/:id', asyncHandler(labResultsController.remove));

export default router;
