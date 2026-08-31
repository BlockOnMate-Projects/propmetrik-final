/**
 * Deduplicated session access for client-side API calls.
 *
 * next-auth's getSession() hits /api/auth/session on every call. Dashboard pages
 * fire dozens of parallel requests on load; without dedup Chrome exhausts sockets
 * (net::ERR_INSUFFICIENT_RESOURCES) and Auth.js logs Failed to fetch storms.
 */
import { getSession } from 'next-auth/react';

type CachedSession = Awaited<ReturnType<typeof getSession>>;

let inflight: Promise<CachedSession> | null = null;
let cached: { session: CachedSession; at: number } | null = null;

const CACHE_TTL_MS = 30_000;

export async function getCachedSession(force = false): Promise<CachedSession> {
  if (typeof window === 'undefined') return null;

  const now = Date.now();
  if (!force && cached && now - cached.at < CACHE_TTL_MS) {
    return cached.session;
  }

  if (inflight) return inflight;

  inflight = getSession()
    .then((session) => {
      cached = { session, at: Date.now() };
      return session;
    })
    .catch(() => cached?.session ?? null)
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function clearSessionCache(): void {
  cached = null;
  inflight = null;
}

export function getCachedAccessToken(): string | null {
  return (cached?.session as any)?.accessToken ?? null;
}
