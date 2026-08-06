/**
 * Shared middleware for valuation route modules.
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
