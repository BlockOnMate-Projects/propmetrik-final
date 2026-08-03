import express, { Application } from 'express';
import { initSentry } from '../config/sentry';
import { registerMiddleware } from './middleware';
import { registerRoutes } from './routes';
import { registerErrorHandlers } from './errorHandlers';

export function createApp(): Application {
  const app = express();
  initSentry(app);
  app.set('trust proxy', 1);
  registerMiddleware(app);
  registerRoutes(app);
  registerErrorHandlers(app);
  return app;
}
