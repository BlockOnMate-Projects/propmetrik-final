import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger';

/**
 * Cross-server bridge to the Python valuation engine.
 *
 * The frontend (propmetrik.com) and this API (api.propmetrik.com) run on
 * DIFFERENT servers, so the Next.js /ml-api proxy cannot reach the engine's
 * Docker network directly. The frontend sets
 * PYTHON_API_URL=https://api.propmetrik.com/engine and its proxy targets
 * `${PYTHON_API_URL}/api/v1/<path>`; this router forwards that to the engine
 * over the local compose network (the engine publishes no host ports).
 *
 * Fail-closed: every request must present the shared X-Engine-Secret. With
 * ENGINE_SHARED_SECRET unset the bridge refuses all traffic — this is a
 * public route on a compute-heavy service, so it must never be open.
 */
const ENGINE_BASE = (process.env.PYTHON_VALUATION_URL || 'http://valuation-engine:8001').replace(/\/$/, '');
const ENGINE_TIMEOUT_MS = 120_000; // DCF/sensitivity runs can be slow

const router = Router();

router.all(/^\/api\/v1\/.*/, async (req: Request, res: Response) => {
  const expected = (process.env.ENGINE_SHARED_SECRET || '').trim();
  if (!expected) {
    return res.status(503).json({ error: 'Engine bridge not configured (ENGINE_SHARED_SECRET missing)' });
  }
  const provided = String(req.headers['x-engine-secret'] || '');
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const target = `${ENGINE_BASE}${req.url}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ENGINE_TIMEOUT_MS);
  try {
    const init: RequestInit = {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        'X-Engine-Secret': expected,
      },
      signal: controller.signal,
    };
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body !== undefined) {
      init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }
    const resp = await fetch(target, init);
    const body = await resp.text();
    res
      .status(resp.status)
      .set('Content-Type', resp.headers.get('content-type') || 'application/json')
      .send(body);
  } catch (err: any) {
    logger.error('Engine bridge forward failed', { path: req.url, error: err?.message });
    res.status(502).json({ error: 'Valuation engine unreachable' });
  } finally {
    clearTimeout(timer);
  }
});

export default router;
