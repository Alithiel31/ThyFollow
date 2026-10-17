// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { verifySessionToken } from '../lib/session.js';

export interface AuthRequest extends Request {
  userId?: string;
}

// Async : la version de session est relue en base à chaque requête (voir
// lib/session.ts), pour qu'un token révoqué soit refusé immédiatement.
export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: req.t('errors.tokenMissing') });
    return;
  }

  let userId: string | null;
  try {
    userId = await verifySessionToken(token);
  } catch (err) {
    next(err);
    return;
  }
  if (!userId) {
    res.status(401).json({ error: req.t('errors.tokenInvalid') });
    return;
  }
  req.userId = userId;
  next();
};
