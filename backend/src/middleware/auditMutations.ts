import { Request, Response, NextFunction } from 'express';
import { pool } from '../database';
import { logger } from '../utils/logger';

/**
 * Platform-wide mutation audit.
 *
 * A single middleware that records EVERY state-changing HTTP request (POST/PUT/PATCH/DELETE)
 * into the canonical, append-only `audit_logs` table — actor, organisation, entity, action,
 * request context (request-id, IP, user-agent), the (redacted) request body, and outcome.
 *
 * Design rules:
 *  - **Best-effort:** auditing NEVER throws into the request. A failed audit write is logged
 *    and swallowed; the business response is unaffected.
 *  - **Zero per-handler wiring:** mounted once, after auth/body-parsing, before the routers.
 *  - **Immutable:** the `audit_logs` table rejects UPDATE/DELETE at the DB level (migration 238).
 */

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ACTION_BY_METHOD: Record<string, string> = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };
const REDACT_KEYS = ['password', 'token', 'secret', 'apikey', 'authorization', 'accesstoken', 'refreshtoken', 'pin', 'otp', 'ssn', 'card'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const asUuid = (v: unknown): string | null => (typeof v === 'string' && UUID_RE.test(v) ? v : null);

function sanitizeBody(body: any): unknown {
  if (!body || typeof body !== 'object') return undefined;
  try {
    const clone = JSON.parse(JSON.stringify(body));
    const walk = (o: any) => {
      if (!o || typeof o !== 'object') return;
      for (const k of Object.keys(o)) {
        if (REDACT_KEYS.some((r) => k.toLowerCase().includes(r))) o[k] = '[redacted]';
        else walk(o[k]);
      }
    };
    walk(clone);
    const s = JSON.stringify(clone);
    return s.length > 8000 ? { note: 'body too large — omitted', bytes: s.length } : clone;
  } catch {
    return undefined;
  }
}

/** Derive an entity type from the URL path, e.g. /api/v1/pm/tenants/<uuid> -> "tenants". */
function entityFromPath(rawPath: string): string {
  const segments = rawPath.split('?')[0].split('/').filter(Boolean).filter((p) => !['api', 'v1', 'v2', 'public'].includes(p));
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (!UUID_RE.test(seg) && !/^\d+$/.test(seg)) return seg;
  }
  return segments[0] || 'unknown';
}

function entityIdFromReq(req: Request): string | null {
  const params = (req.params || {}) as Record<string, unknown>;
  return asUuid(params.id) || asUuid(params.uuid) || asUuid(Object.values(params).find((v) => asUuid(v)));
}

export function auditMutations(req: Request, res: Response, next: NextFunction): void {
  if (!WRITE_METHODS.has(req.method)) return next();

  const body = sanitizeBody(req.body);

  res.on('finish', () => {
    try {
      const user = ((req as any).user || {}) as Record<string, any>;
      const path = (req.originalUrl || req.url || '').split('?')[0];
      const userId = asUuid(user.id ?? user.sub);
      const orgId = asUuid((req as any).authorizedOrgId ?? user.organizationId ?? user.org_id);

      void pool.query(
        `INSERT INTO audit_logs
           (action, entity_type, entity_id, user_id, user_email, organization_id,
            request_id, ip_address, user_agent, new_values, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          ACTION_BY_METHOD[req.method] || req.method.toLowerCase(),
          entityFromPath(req.originalUrl || req.url || ''),
          entityIdFromReq(req),
          userId,
          user.email ?? null,
          orgId,
          (req as any).requestId || req.headers['x-request-id'] || null,
          req.ip || null,
          req.headers['user-agent'] || null,
          body ? JSON.stringify(body) : null,
          JSON.stringify({ method: req.method, path, status: res.statusCode }),
        ]
      ).catch((err: any) => logger.warn({ err: err?.message, path }, 'auditMutations: audit_logs write failed'));
    } catch (err: any) {
      logger.warn({ err: err?.message }, 'auditMutations: unexpected error building audit record');
    }
  });

  next();
}
