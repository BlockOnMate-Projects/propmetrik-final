/**
 * Shared middleware and helpers for valuation route modules.
 */

import { Request, Response, NextFunction } from 'express';

/** Forward non-UUID :id params to the next matching route (static paths like /rental-benchmarks). */
export const validateUUID = (paramName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const uuid = req.params[paramName];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(uuid)) {
      return next('route');
    }

    next();
  };
};

/** Headers for direct Python valuation engine fetches (includes X-Engine-Secret when configured). */
export const engineHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(process.env.ENGINE_SHARED_SECRET?.trim()
    ? { 'X-Engine-Secret': process.env.ENGINE_SHARED_SECRET.trim() }
    : {}),
});
