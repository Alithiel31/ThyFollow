// src/middleware/admin.ts
// Gating admin : on relit le rôle en base à chaque requête plutôt que de le
// mettre dans le JWT — un rôle révoqué prend effet immédiatement, et le token
// existant ne donne aucun privilège figé.
import { Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { AuthRequest } from './auth.js';

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { role: true },
  });

  if (user?.role !== 'ADMIN') {
    res.status(403).json({ error: req.t('errors.adminOnly') });
    return;
  }
  next();
};
