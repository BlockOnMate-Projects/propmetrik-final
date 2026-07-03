/**
 * Short-TTL, in-process cache for the per-user authorization record.
 *
 * The auth/authorize/serviceAccess middleware each re-fetch the same user row
 * (role, user_type, organization_id, subscription_tier) on EVERY request. Against
 * a remote DB that is 3–4 round-trips of pure latency per request. This cache
 * collapses them to one lookup per user per TTL window.
 *
 * TTL is intentionally short (seconds) so role/tier/org changes propagate quickly;
 * mutations that must take effect immediately call `invalidateUserAuth(userId)`.
 */
import { pool } from '../database';

export interface UserAuthRecord {
  id: string;
  role: string | null;
  user_type: string | null;
  organization_id: string | null;
  subscription_tier: string | null;
}

const TTL_MS = Number(process.env.USER_AUTH_CACHE_TTL_MS || 15_000);
const MAX_ENTRIES = 5_000; // hard cap so the map can't grow unbounded

interface Entry { value: UserAuthRecord | null; expires: number }
const cache = new Map<string, Entry>();

/**
 * Fetch the user's auth record, served from cache when fresh. Returns null when
 * the user does not exist. On a DB error, returns null (callers fail closed).
 */
export async function getUserAuthRecord(userId: string): Promise<UserAuthRecord | null> {
  if (!userId) return null;
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && hit.expires > now) return hit.value;

  try {
    const result = await pool.query(
      `SELECT u.id, u.role, u.user_type, u.organization_id, o.subscription_tier
       FROM users u
       LEFT JOIN organizations o ON o.id = u.organization_id
       WHERE u.id = $1`,
      [userId],
    );
    const value: UserAuthRecord | null = result.rows[0]
      ? {
          id: result.rows[0].id,
          role: result.rows[0].role ?? null,
          user_type: result.rows[0].user_type ?? null,
          organization_id: result.rows[0].organization_id ?? null,
          subscription_tier: result.rows[0].subscription_tier ?? null,
        }
      : null;
    // Evict oldest when over the cap (simple FIFO — good enough for an auth cache).
    if (cache.size >= MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(userId, { value, expires: now + TTL_MS });
    return value;
  } catch {
    // Fail closed: caller treats null as "unknown" (least privilege).
    return null;
  }
}

/** Invalidate a user's cached auth record (call after role/tier/org changes). */
export function invalidateUserAuth(userId: string): void {
  cache.delete(userId);
}

/** Clear the entire cache (tests / admin cache-bust). */
export function clearUserAuthCache(): void {
  cache.clear();
}
