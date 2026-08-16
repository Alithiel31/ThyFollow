// src/routers/docs.router.ts
// Documentation interactive de l'API (OpenAPI + Swagger UI), servie
// uniquement hors production — évite d'exposer une UI supplémentaire sur le
// déploiement public par défaut. La spec vit dans openapi.yaml à la racine
// du backend (pas dans dist/ : lue directement depuis le disque, jamais
// importée comme module).
import { readFileSync } from 'fs';
import { join } from 'path';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { parse } from 'yaml';
import { config } from '../config.js';

const router = Router();

if (!config.isProd) {
  const spec = parse(readFileSync(join(process.cwd(), 'openapi.yaml'), 'utf-8'));
  router.use('/', swaggerUi.serve, swaggerUi.setup(spec));
}

export default router;
