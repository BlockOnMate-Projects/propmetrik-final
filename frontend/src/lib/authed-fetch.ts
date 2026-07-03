/**
 * Centralized authenticated fetch wrapper.
 *
 * Drop-in replacement for the global `fetch()`:
 *   import { authedFetch } from '@/lib/authed-fetch';
 *   const res = await authedFetch('/api/projects/123');
 *
 * IMPORTANT: use the RELATIVE `/api/...` path (NOT `/api/v1/...`). The Next proxy
 * rewrites `/api/:path*` → backend `/api/v1/:path*`, so a client `/api/v1/...`
 * would double-version to `/api/v1/v1/...`. Never hardcode an absolute host.
 *
 * Automatically attaches the NextAuth JWT as `Authorization: Bearer <token>`.
 * Token is cached for 60 seconds to avoid hammering the session endpoint.
 *
 * For SSR/server-components (typeof window === 'undefined') the token step
 * is skipped and the call behaves like a normal fetch.
 */
import { getSession } from 'next-auth/react';

// ── Token cache (shared across all callers in the browser tab) ──
let _cachedToken: string | null = null;
let _tokenFetchedAt = 0;
const TOKEN_CACHE_TTL = 60_000; // 1 minute

async function getAuthToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const now = Date.now();
  if (_cachedToken && now - _tokenFetchedAt < TOKEN_CACHE_TTL) {
    return _cachedToken;
  }
  try {
    const session = await getSession();
    _cachedToken = (session as any)?.accessToken ?? null;
    _tokenFetchedAt = now;
    return _cachedToken;
  } catch {
    return null;
  }
}

/** Call on logout to clear the cached token. */
export function clearAuthTokenCache() {
  _cachedToken = null;
  _tokenFetchedAt = 0;
}

/**
 * Authenticated fetch — same signature as `window.fetch` but injects
 * the NextAuth Bearer token automatically.
 *
 * If the caller already set an `Authorization` header it will NOT be
 * overwritten, so existing auth patterns still work.
 */
export async function authedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const token = await getAuthToken();

  // Build merged headers — never clobber caller-provided Authorization
  const headers = new Headers(init?.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}
