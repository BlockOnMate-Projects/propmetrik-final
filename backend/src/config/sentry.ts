/**
 * Sentry APM / Error Monitoring — Backend
 *
 * Initialises @sentry/node for Express.  Call `initSentry(app)` once
 * BEFORE any route registration and `installSentryErrorHandler(app)`
 * AFTER all routes (but before the generic error handler).
 *
 * Env vars:
 *   SENTRY_DSN           — project DSN (required in production)
 *   SENTRY_ENVIRONMENT   — e.g. production, staging  (defaults to NODE_ENV)
 *   SENTRY_TRACES_RATE   — 0.0 – 1.0  (default 0.2 = 20 % of txns)
 *   SENTRY_PROFILES_RATE — 0.0 – 1.0  (default 0.1 = 10 % of profiles)
 */

import * as Sentry from '@sentry/node';
import { Application } from 'express';
import { logger } from '../utils/logger';

const DSN = process.env.SENTRY_DSN || '';
const ENVIRONMENT = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';
const TRACES_SAMPLE_RATE = parseFloat(process.env.SENTRY_TRACES_RATE || '0.2');
const PROFILES_SAMPLE_RATE = parseFloat(process.env.SENTRY_PROFILES_RATE || '0.1');

let _initialised = false;

/**
 * Initialise Sentry SDK.
 * Should be called as early as possible — before route registration.
 */
export function initSentry(app: Application): void {
  if (!DSN) {
    logger.info('Sentry DSN not configured — error monitoring disabled');
    return;
  }

  if (_initialised) return;

  Sentry.init({
    dsn: DSN,
    environment: ENVIRONMENT,
    release: process.env.npm_package_version
      ? `propmetrik-api@${process.env.npm_package_version}`
      : undefined,
    tracesSampleRate: TRACES_SAMPLE_RATE,
    profilesSampleRate: PROFILES_SAMPLE_RATE,
    integrations: [
      // Automatically instrument Express
      Sentry.expressIntegration(),
      // Capture HTTP/HTTPS outgoing requests
      Sentry.httpIntegration(),
      // Capture unhandled promise rejections
      Sentry.onUnhandledRejectionIntegration(),
    ],
    // Filter out health-check noise
    ignoreTransactions: [
      /^GET \/health/,
      /^GET \/health\/live/,
    ],
    // Don't send PII (emails, user IPs) by default
    sendDefaultPii: false,
    // Attach request data
    includeLocalVariables: true,
    beforeSend(event) {
      // Strip auth tokens from headers captured in breadcrumbs
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
      return event;
    },
  });

  // Sentry error handler is installed separately via installSentryErrorHandler()
  // after all routes are registered (see index.ts).

  _initialised = true;
  logger.info('Sentry error monitoring initialised', {
    environment: ENVIRONMENT,
    tracesSampleRate: TRACES_SAMPLE_RATE,
  });
}

/**
 * Install Sentry error handler — call AFTER all route registration
 * but BEFORE the application's own error handler.
 */
export function installSentryErrorHandler(app: Application): void {
  if (!_initialised) return;
  Sentry.setupExpressErrorHandler(app);
}

/**
 * Manually capture an exception (e.g. from a catch block).
 */
export function captureException(err: Error, context?: Record<string, any>): void {
  if (!_initialised) {
    logger.error('Sentry not initialised — logging error locally', { err: err.message, ...context });
    return;
  }
  Sentry.withScope((scope) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(err);
  });
}

/**
 * Manually capture a message (e.g. for warnings or audit events).
 */
export function captureMessage(msg: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  if (!_initialised) return;
  Sentry.captureMessage(msg, level);
}

/**
 * Add user context to the current scope.
 * Call in authenticate middleware after verifying the JWT.
 */
export function setUser(user: { id: string; email?: string; role?: string }): void {
  if (!_initialised) return;
  Sentry.setUser({ id: user.id, email: user.email, segment: user.role });
}

/**
 * Flush pending events before process exits (for graceful shutdown).
 */
export async function flushSentry(timeout = 2000): Promise<void> {
  if (!_initialised) return;
  await Sentry.close(timeout);
}

export { Sentry };
