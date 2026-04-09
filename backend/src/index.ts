// src/index.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { authRouter } from './routes/auth';
import { entriesRouter } from './routes/entries';
import { labResultsRouter } from './routes/labResults';
import { medicationsRouter } from './routes/medications';
import { appointmentsRouter } from './routes/appointments';
import { profileRouter } from './routes/profile';
import { analyticsRouter } from './routes/analytics';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

// ── Middleware
app.use(cors({
  origin: isProd ? false : (process.env.FRONTEND_URL || 'http://localhost:5173'),
  credentials: true,
}));
app.use(express.json());

// ── Health check
app.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Routes
app.use('/api/auth', authRouter);
app.use('/api/entries', entriesRouter);
app.use('/api/lab-results', labResultsRouter);
app.use('/api/medications', medicationsRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/profile', profileRouter);
app.use('/api/analytics', analyticsRouter);

// ── Serve React frontend in production
if (process.env.NODE_ENV === 'production') {
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  const frontendDist = path.default.join(__dirname, '..', '..', 'frontend', 'dist');
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.default.join(frontendDist, 'index.html'));
    }
  });
}

// ── Error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🦋 ThyroTrack API running on port ${PORT}`);
});

export default app;
