/**
 * Sentry Client-side Initialisation — Next.js Frontend
 *
 * This file is imported by the root layout or a top-level provider.
 * It captures unhandled React errors, navigation performance, and
 * user-facing exceptions.
 *
 * Env vars (set in .env.local or Vercel dashboard):
 *   NEXT_PUBLIC_SENTRY_DSN         — project DSN
 *   NEXT_PUBLIC_SENTRY_ENVIRONMENT — e.g. production, staging
 */

import * as Sentry from '@sentry/nextjs';

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || '';
const ENVIRONMENT =
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
  process.env.NODE_ENV ||
  'development';

let _initialised = false;

export function initSentryClient(): void {
  if (!DSN || _initialised) return;

  Sentry.init({
    dsn: DSN,
    environment: ENVIRONMENT,
    release: process.env.NEXT_PUBLIC_APP_VERSION
      ? `propmetrik-web@${process.env.NEXT_PUBLIC_APP_VERSION}`
      : undefined,

    // Performance monitoring — sample 20 % of page loads
    tracesSampleRate: 0.2,

    // Session replay — capture 10 % of sessions, 100 % on error
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.replayIntegration({
        // Mask all text & inputs by default (GDPR friendly)
        maskAllText: true,
        blockAllMedia: false,
      }),
      Sentry.browserTracingIntegration(),
    ],

    // Ignore benign errors
    ignoreErrors: [
      'ResizeObserver loop',
      'ResizeObserver loop completed with undelivered notifications',
      /^Loading chunk \d+ failed/,
      'Non-Error promise rejection captured',
      'AbortError',
    ],

    // Don't send PII by default
    sendDefaultPii: false,

    beforeSend(event) {
      // Don't send errors in local dev unless DSN is explicitly set
      if (process.env.NODE_ENV === 'development' && !DSN) {
        return null;
      }
      return event;
    },
  });

  _initialised = true;
}

/** Set the current user on the Sentry scope. */
export function setSentryUser(user: {
  id: string;
  email?: string;
  role?: string;
}): void {
  if (!_initialised) return;
  Sentry.setUser({ id: user.id, email: user.email, segment: user.role });
}

/** Clear user context (on logout). */
export function clearSentryUser(): void {
  if (!_initialised) return;
  Sentry.setUser(null);
}

/** Manually capture an error with optional context. */
export function captureFrontendException(
  err: Error,
  context?: Record<string, any>,
): void {
  if (!_initialised) {
    console.error('[Sentry not init]', err, context);
    return;
  }
  Sentry.withScope((scope) => {
    if (context) scope.setExtras(context);
    Sentry.captureException(err);
  });
}

export { Sentry };
