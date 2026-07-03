// src/middleware/asyncHandler.ts
// Wrapper pour les handlers Express async : catch les rejets de promesse
// (erreurs Prisma, JWT, etc.) et les transmet à next() -> errorHandler.
// Sans ça, une erreur dans un handler async ne répond jamais au client
// (la requête reste en attente jusqu'au timeout).
import { Request, Response, NextFunction } from 'express';

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
