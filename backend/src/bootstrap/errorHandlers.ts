import { Application } from 'express';
import { installSentryErrorHandler } from '../config/sentry';
import { errorHandler } from '../middleware/errorHandler';

export function registerErrorHandlers(app: Application): void {
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
});

// Sentry error handler (must be after routes, before our error handler)
installSentryErrorHandler(app);

// Error handler (must be last)
app.use(errorHandler);
}
