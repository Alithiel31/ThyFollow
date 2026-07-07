// src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

// Note: on garde volontairement le format de réponse `{ error: string }`
// pour rester compatible avec le frontend actuel (lib/api.ts / interceptor
// axios lisent `err.response.data.error`).
export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Erreurs de validation Zod (schema.parse() qui a échoué)
  if (err instanceof z.ZodError) {
    const message = err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
    res.status(400).json({ error: message });
    return;
  }

  // Erreurs Prisma connues
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Cette ressource existe déjà' });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Ressource introuvable' });
      return;
    }
    logger.error(`Erreur Prisma ${err.code}`, err.message);
    res.status(400).json({ error: 'Opération sur la base de données invalide' });
    return;
  }

  // Erreurs applicatives typées (NotFoundError, ConflictError, etc.)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // Tout le reste : erreur inattendue, on ne fuite pas le détail au client
  logger.error('Erreur non gérée', err);
  res.status(500).json({ error: 'Erreur interne du serveur' });
};
