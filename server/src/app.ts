import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Container } from './container.js';
import { createHealthController } from './controllers/healthController.js';
import { errorHandler, httpLogger, notFound, requestId } from './middleware/http.js';
import { createV1Router } from './routes/v1.js';

/** Builds the Express app without listening, so tests can drive it with Supertest. */
export function createApp(c: Container): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', c.config.trustProxy);
  app.set('query parser', 'simple');

  const health = createHealthController(c);
  // Probes come first: no logging, no CORS, no rate limits.
  app.get('/health', health.health);
  app.get('/ready', health.ready);

  app.use(requestId);
  app.use(httpLogger(c.logger));
  app.use(
    helmet({
      // The API serves JSON only; the strictest policy is safe.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || c.config.clientOrigins.includes(origin)),
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'Retry-After'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '100kb', strict: true }));
  app.use(cookieParser());

  app.use('/api/v1', createV1Router(c));

  app.use(notFound);
  app.use(errorHandler(c.logger));
  return app;
}
