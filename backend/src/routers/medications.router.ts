// src/routers/medications.router.ts
import { Router } from 'express';
import { medicationsController } from '../controllers/medications.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/intakes', asyncHandler(medicationsController.listIntakes));
router.get('/', asyncHandler(medicationsController.list));
router.post('/', asyncHandler(medicationsController.create));
router.post('/:id/intake', asyncHandler(medicationsController.markTaken));
router.delete('/:id/intake', asyncHandler(medicationsController.markUntaken));
router.post('/:id/dose-periods', asyncHandler(medicationsController.addDosePeriod));
router.put('/:id/dose-periods/:periodId', asyncHandler(medicationsController.updateDosePeriod));
router.delete('/:id/dose-periods/:periodId', asyncHandler(medicationsController.removeDosePeriod));
router.put('/:id', asyncHandler(medicationsController.update));
router.delete('/:id', asyncHandler(medicationsController.remove));

export default router;
