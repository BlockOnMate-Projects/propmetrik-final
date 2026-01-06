import { Request, Response, NextFunction } from 'express';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { redisCache } from '../database/redis';
import { config } from '../config';
import { logger } from '../utils/logger';
import { RateLimitError } from './errorHandler';

// Different rate limit configurations for various endpoints
interface RateLimitConfig {
  points: number;      // Number of requests
  duration: number;    // Per seconds
  blockDuration?: number; // Block duration in seconds when limit exceeded
}

const rateLimitConfigs: Record<string, RateLimitConfig> = {
  // Default rate limit
  default: {
    points: 100,
    duration: 60, // 100 requests per minute
    blockDuration: 60,
  },
  // Strict limit for auth endpoints
  auth: {
    points: 10,
    duration: 60, // 10 requests per minute
    blockDuration: 300, // 5 minute block
  },
  // Relaxed limit for search
  search: {
    points: 30,
    duration: 60, // 30 searches per minute
    blockDuration: 60,
  },
  // Very strict for password reset
  passwordReset: {
    points: 3,
    duration: 3600, // 3 requests per hour
    blockDuration: 3600,
  },
  // File upload limit
  upload: {
    points: 10,
    duration: 60, // 10 uploads per minute
    blockDuration: 120,
  },
};

// Create rate limiters
const rateLimiters: Record<string, RateLimiterRedis> = {};

function createRateLimiter(name: string, config: RateLimitConfig): RateLimiterRedis {
  return new RateLimiterRedis({
    storeClient: redisCache,
    keyPrefix: `propmetrik:ratelimit:${name}`,
    points: config.points,
    duration: config.duration,
    blockDuration: config.blockDuration,
  });
}

// Initialize rate limiters
for (const [name, limitConfig] of Object.entries(rateLimitConfigs)) {
  rateLimiters[name] = createRateLimiter(name, limitConfig);
}

/**
 * Get rate limiter key from request
 */
function getRateLimiterKey(req: Request): string {
  // Use authenticated user ID if available, otherwise use IP
  const userId = (req as any).user?.sub;
  if (userId) {
    return `user:${userId}`;
  }
  
  // Get IP address (considering proxy)
  const ip = req.ip || 
    req.headers['x-forwarded-for']?.toString().split(',')[0] || 
    req.socket.remoteAddress || 
    'unknown';
  
  return `ip:${ip}`;
}

/**
 * Determine which rate limiter to use based on the request
 */
function selectRateLimiter(req: Request): RateLimiterRedis {
  const path = req.path.toLowerCase();
  
  if (path.includes('/auth/login') || path.includes('/auth/register')) {
    return rateLimiters.auth;
  }
  
  if (path.includes('/auth/password') || path.includes('/auth/reset')) {
    return rateLimiters.passwordReset;
  }
  
  if (path.includes('/search')) {
    return rateLimiters.search;
  }
  
  if (path.includes('/upload') || req.method === 'POST' && path.includes('/files')) {
    return rateLimiters.upload;
  }
  
  return rateLimiters.default;
}

/**
 * Set rate limit headers on response
 */
function setRateLimitHeaders(res: Response, rateLimiterRes: RateLimiterRes): void {
  res.setHeader('X-RateLimit-Limit', rateLimiterRes.remainingPoints + rateLimiterRes.consumedPoints);
  res.setHeader('X-RateLimit-Remaining', rateLimiterRes.remainingPoints);
  res.setHeader('X-RateLimit-Reset', new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString());
}

/**
 * Rate limiter middleware
 */
export async function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Skip rate limiting for health checks
  if (req.path === '/health' || req.path === '/health/live') {
    return next();
  }
  
  // Skip rate limiting in test environment
  if (config.env === 'test') {
    return next();
  }

  const limiter = selectRateLimiter(req);
  const key = getRateLimiterKey(req);

  try {
    const rateLimiterRes = await limiter.consume(key);
    setRateLimitHeaders(res, rateLimiterRes);
    next();
  } catch (error) {
    if (error instanceof RateLimiterRes) {
      setRateLimitHeaders(res, error);
      res.setHeader('Retry-After', Math.ceil(error.msBeforeNext / 1000));
      
      logger.warn('Rate limit exceeded', {
        key,
        path: req.path,
        method: req.method,
        msBeforeNext: error.msBeforeNext,
      });
      
      const retryAfter = Math.ceil(error.msBeforeNext / 1000);
      next(new RateLimitError(retryAfter));
    } else {
      // Redis error - log but allow request
      logger.error('Rate limiter error', { error });
      next();
    }
  }
}

/**
 * Create a custom rate limiter for specific use cases
 */
export function createCustomRateLimiter(
  name: string,
  config: RateLimitConfig
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  const limiter = createRateLimiter(name, config);
  
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = getRateLimiterKey(req);
    
    try {
      const rateLimiterRes = await limiter.consume(key);
      setRateLimitHeaders(res, rateLimiterRes);
      next();
    } catch (error) {
      if (error instanceof RateLimiterRes) {
        setRateLimitHeaders(res, error);
        res.setHeader('Retry-After', Math.ceil(error.msBeforeNext / 1000));
        const retryAfter = Math.ceil(error.msBeforeNext / 1000);
        next(new RateLimitError(retryAfter));
      } else {
        next();
      }
    }
  };
}
