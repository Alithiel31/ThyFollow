// src/index.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { xss } from 'express-xss-sanitizer';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import authRouter from './routers/auth.router.js';
import entriesRouter from './routers/entries.router.js';
import labResultsRouter from './routers/labResults.router.js';
import medicationsRouter from './routers/medications.router.js';
import appointmentsRouter from './routers/appointments.router.js';
import profileRouter from './routers/profile.router.js';
import analyticsRouter from './routers/analytics.router.js';
import articlesRouter from './routers/articles.router.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// ── Sécurité : en-têtes HTTP standards
app.use(helmet());

// ── CORS
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));

// ── Rate limiting global (anti abus / DoS basique)
app.use(
  rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    message: { error: 'Trop de requêtes, réessayez plus tard' },
  })
);

// ── Rate limiting strict sur l'authentification (anti brute-force)
const authLimiter = rateLimit({
  windowMs: config.authRateLimitWindowMs,
  max: config.authRateLimitMax,
  message: { error: 'Trop de tentatives de connexion, réessayez plus tard' },
  skipSuccessfulRequests: true,
});

app.use(express.json());

// ── Nettoyage des payloads contre les injections XSS
app.use(xss());

// ── Health check
app.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Routes
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/entries', entriesRouter);
app.use('/api/lab-results', labResultsRouter);
app.use('/api/medications', medicationsRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/profile', profileRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/articles', articlesRouter);

// ── Error handler
app.use(errorHandler);

app.listen(config.port, () => {
  logger.success(`🦋 ThyroTrack API running on port ${config.port}`);
  logger.info(`Environnement: ${config.nodeEnv}`);
});

export default app;
