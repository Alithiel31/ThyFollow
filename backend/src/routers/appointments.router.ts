// src/routers/appointments.router.ts
import { Router } from 'express';
import { appointmentsController } from '../controllers/appointments.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(appointmentsController.list));
router.post('/', asyncHandler(appointmentsController.create));
router.put('/:id', asyncHandler(appointmentsController.update));
router.delete('/:id', asyncHandler(appointmentsController.remove));

export default router;
