// src/middleware/static.ts
// In production, the Express backend serves the React frontend build.
// This file is imported conditionally in index.ts.

import express, { type Express } from 'express';
import path from 'path';

export function serveStatic(app: Express) {
  const frontendDist = path.join(__dirname, '..', '..', '..', 'frontend', 'dist');
  app.use(express.static(frontendDist));

  // SPA fallback: all non-API routes serve index.html
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return;
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}
