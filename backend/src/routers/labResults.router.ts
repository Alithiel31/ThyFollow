// src/routers/labResults.router.ts
import { Router } from 'express';
import { labResultsController } from '../controllers/labResults.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { labImportController } from '../controllers/labImport.controller.js';

const router = Router();
router.use(authenticate);

// Import de bilans PDF : déclaré AVANT les routes `/:id`.
router.post('/import', asyncHandler(labImportController.importFiles));

router.get('/', asyncHandler(labResultsController.list));
router.get('/:id', asyncHandler(labResultsController.getById));
router.post('/', asyncHandler(labResultsController.create));
router.put('/:id', asyncHandler(labResultsController.update));
router.delete('/:id', asyncHandler(labResultsController.remove));

export default router;
