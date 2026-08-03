import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import pinoHttp from 'pino-http';
import { config } from '../config';
import { logger } from '../utils/logger';
import { rateLimiter } from '../middleware/rateLimiter';
import { requestIdMiddleware } from '../middleware/requestId';
import { auditMutations } from '../middleware/auditMutations';

export function registerMiddleware(app: Application): void {
app.use(helmet({
  contentSecurityPolicy: config.env === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors({
  origin: config.cors.origins,
  credentials: config.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-User-Id', 'X-Organization-Id', 'X-PROPMETRIK-Token', 'Cache-Control'],
  exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
}));

// Compression — exclude SSE endpoints (compression breaks EventSource streaming)
const compressMiddleware = compression();
app.use((req, res, next) => {
  if (req.path.startsWith('/api/v1/realtime') || req.path.startsWith('/api/realtime')) {
    return next();
  }
  return compressMiddleware(req, res, next);
});

// Body parsing
// Capture the raw request body so webhooks that HMAC-sign the exact bytes
// (e.g. Didit KYC) can verify against them; re-serialising req.body would change
// whitespace/key-order and break the signature. Side-effect only; parsing is unchanged.
app.use(express.json({
  limit: '10mb',
  verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request ID
app.use(requestIdMiddleware);

// Request logging
app.use(pinoHttp({
  logger,
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url === '/health/live',
  },
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} ${res.statusCode} - ${err.message}`;
  },
}));

// Rate limiting
app.use(rateLimiter);

// Platform-wide mutation audit — records every write into the immutable audit_logs trail.
// Runs after body-parsing/request-id and before the routers (auth runs inside each router,
// so req.user is populated by the time the response 'finish' handler reads it).
app.use(auditMutations);
}
