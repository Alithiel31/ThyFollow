// src/lib/errors.ts
// Erreurs typées : chaque classe porte son propre statusCode HTTP, au lieu
// d'appeler `new AppError('message', 404)` à la main à chaque endroit.
// Les messages sont désormais fournis déjà traduits par l'appelant (via
// `req.t(...)`), pour que la réponse API suive la langue de la requête.
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true,
    // Code machine-lisible optionnel, pour que le frontend puisse distinguer
    // des variantes d'une même famille d'erreur (ex: identifiants invalides
    // vs email non vérifié, toutes deux en 401) sans parser le message traduit.
    public code?: string
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string) {
    super(401, message);
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string) {
    super(403, message);
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, message);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class EmailNotVerifiedError extends AppError {
  constructor(message: string) {
    super(401, message, true, 'EMAIL_NOT_VERIFIED');
    Object.setPrototypeOf(this, EmailNotVerifiedError.prototype);
  }
}
