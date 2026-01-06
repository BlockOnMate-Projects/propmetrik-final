import pino, { Logger, LoggerOptions } from 'pino';
import { config } from '../config';

// Log level hierarchy: trace < debug < info < warn < error < fatal
const logLevel = config.env === 'production' ? 'info' : 'debug';

// Base logger configuration
const baseOptions: LoggerOptions = {
  level: logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'propmetrik-api',
    env: config.env,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
};

// Pretty print for development
const devTransport = {
  target: 'pino-pretty',
  options: {
    colorize: true,
    translateTime: 'SYS:standard',
    ignore: 'pid,hostname',
    singleLine: false,
  },
};

// Production-ready JSON output
const prodOptions: LoggerOptions = {
  ...baseOptions,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password',
      'token',
      'accessToken',
      'refreshToken',
      'secret',
      'apiKey',
    ],
    censor: '[REDACTED]',
  },
};

// Create logger instance based on environment
export const logger: Logger =
  config.env === 'production'
    ? pino(prodOptions)
    : pino({ ...baseOptions, transport: devTransport });

// Child logger factory for specific modules
export function createLogger(module: string): Logger {
  return logger.child({ module });
}

// Request logger middleware factory
export function createRequestLogger() {
  return pino({
    ...baseOptions,
    transport: config.env !== 'production' ? devTransport : undefined,
  });
}

// Specialized loggers for different domains
export const dbLogger = createLogger('database');
export const authLogger = createLogger('auth');
export const apiLogger = createLogger('api');
export const searchLogger = createLogger('search');
export const jobLogger = createLogger('jobs');
export const storageLogger = createLogger('storage');

// Log context helper
export interface LogContext {
  requestId?: string;
  userId?: string;
  organizationId?: string;
  propertyId?: string;
  action?: string;
  duration?: number;
  [key: string]: unknown;
}

// Structured logging helpers
export const log = {
  info: (message: string, context?: LogContext) => logger.info(context, message),
  error: (message: string, error: Error | unknown, context?: LogContext) =>
    logger.error(
      {
        ...context,
        err: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      },
      message
    ),
  warn: (message: string, context?: LogContext) => logger.warn(context, message),
  debug: (message: string, context?: LogContext) => logger.debug(context, message),
  trace: (message: string, context?: LogContext) => logger.trace(context, message),
  fatal: (message: string, error: Error | unknown, context?: LogContext) =>
    logger.fatal(
      {
        ...context,
        err: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      },
      message
    ),
};

// Audit logging for sensitive operations
export interface AuditLogEntry {
  action: string;
  userId: string;
  resourceType: string;
  resourceId: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  metadata?: Record<string, unknown>;
}

export function auditLog(entry: AuditLogEntry): void {
  logger.info(
    {
      audit: true,
      ...entry,
      timestamp: new Date().toISOString(),
    },
    `AUDIT: ${entry.action} on ${entry.resourceType}/${entry.resourceId}`
  );
}

// Performance logging helper
export function logPerformance(
  operation: string,
  startTime: number,
  context?: LogContext
): void {
  const duration = Date.now() - startTime;
  logger.info(
    {
      ...context,
      operation,
      duration,
      performance: true,
    },
    `${operation} completed in ${duration}ms`
  );
}

// Error boundary logger
export function logUnhandledException(error: Error, origin: string): void {
  logger.fatal(
    {
      err: { message: error.message, stack: error.stack, name: error.name },
      origin,
    },
    'Unhandled exception'
  );
}

export default logger;
