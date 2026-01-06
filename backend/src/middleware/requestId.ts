import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/**
 * Middleware to add a unique request ID to each request
 * Uses the X-Request-ID header if provided, otherwise generates a new UUID
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  
  next();
}
