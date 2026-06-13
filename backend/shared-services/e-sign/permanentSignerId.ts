/**
 * Permanent Signer ID (PMT-XXXXXX-XXXXXX)
 *
 * A stable, deterministic identity for every signer, derived from the signer's
 * IMMUTABLE database key — never hardcoded, never random, never changing once
 * issued. Resolution order:
 *   1. An already-persisted id (looked up by user_id first, then email) → reused
 *      verbatim, so a signer keeps the same PMT forever (even if their email changes).
 *   2. Derived from the user's `users.id` UUID (or `tenants.id`).
 *   3. For an external signer with no account: a SHA-256 of their email.
 *
 * Uses 12 hex chars (6+6 = 48 bits) — vastly wider than the legacy 8 (32 bits) —
 * and widens further on the (now vanishingly rare) collision. Issued ids are
 * persisted to `esign_signer_identities` (which carries a UNIQUE(permanent_id)
 * constraint) so two signers can never share an id.
 */
import { pool } from '../../src/database';
import { createHash } from 'crypto';

const HEX_HALF = 6; // 6 + 6 = 12 hex chars

function format(hex: string, half: number): string {
  return `PMT-${hex.substring(0, half).toUpperCase()}-${hex.substring(half, half * 2).toUpperCase()}`;
}

/** Resolve the base hex (immutable UUID without dashes, or email hash) + the user id if known. */
async function deriveHex(emailLower: string): Promise<{ hex: string; userId: string | null }> {
  const u = await pool
    .query(`SELECT id FROM users WHERE email = $1 LIMIT 1`, [emailLower])
    .catch(() => ({ rows: [] as any[] }));
  if (u.rows.length) return { hex: String(u.rows[0].id).replace(/-/g, ''), userId: u.rows[0].id };

  const t = await pool
    .query(`SELECT id FROM tenants WHERE email = $1 LIMIT 1`, [emailLower])
    .catch(() => ({ rows: [] as any[] }));
  if (t.rows.length) return { hex: String(t.rows[0].id).replace(/-/g, ''), userId: null };

  return { hex: createHash('sha256').update(emailLower).digest('hex'), userId: null };
}

/**
 * Resolve (and persist on first use) the permanent signer id.
 *
 * @param email       signer email (the row key; required for external signers)
 * @param displayName optional display name to store
 * @param accountUserId  the signer's platform account id when known — PREFERRED:
 *   the PMT is keyed off this immutable id so the same account gets the same PMT
 *   across every service regardless of which email a module uses. Falls back to
 *   resolving the account from the email, then to an email hash for true externals.
 */
export async function resolvePermanentSignerId(
  email: string,
  displayName?: string,
  accountUserId?: string | null
): Promise<string> {
  const lower = (email || '').toLowerCase();
  if (!lower && !accountUserId) return '';

  // Prefer the explicit account id; otherwise resolve it (and the base hex) from email.
  let userId: string | null = accountUserId || null;
  let hex: string;
  if (userId) {
    hex = String(userId).replace(/-/g, '');
  } else {
    const derived = await deriveHex(lower);
    hex = derived.hex;
    userId = derived.userId;
  }

  // 1. Reuse an already-issued id — this is what makes it permanent.
  if (userId) {
    // Oldest row is the canonical id for the account (deterministic + permanent).
    const byUser = await pool
      .query(`SELECT permanent_id FROM esign_signer_identities WHERE user_id = $1 AND permanent_id IS NOT NULL ORDER BY created_at ASC LIMIT 1`, [userId])
      .catch(() => ({ rows: [] as any[] }));
    if (byUser.rows[0]?.permanent_id) return byUser.rows[0].permanent_id;
  }
  const byEmail = await pool
    .query(`SELECT permanent_id, user_id FROM esign_signer_identities WHERE email = $1 LIMIT 1`, [lower])
    .catch(() => ({ rows: [] as any[] }));
  if (byEmail.rows[0]?.permanent_id) {
    if (userId && !byEmail.rows[0].user_id) {
      await pool.query(`UPDATE esign_signer_identities SET user_id = $1 WHERE email = $2`, [userId, lower]).catch(() => {});
    }
    return byEmail.rows[0].permanent_id;
  }

  // 2. Derive + persist a fresh id, widening the hex window on any collision.
  for (let half = HEX_HALF; half * 2 <= hex.length; half += 3) {
    const candidate = format(hex, half);
    const clash = await pool
      .query(`SELECT 1 FROM esign_signer_identities WHERE permanent_id = $1 LIMIT 1`, [candidate])
      .catch(() => ({ rows: [] as any[] }));
    if (clash.rows.length) continue; // taken → widen
    try {
      await pool.query(
        `INSERT INTO esign_signer_identities (id, email, user_id, permanent_id, display_name, total_signatures, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, NOW())
         ON CONFLICT (email) DO UPDATE SET
           permanent_id = COALESCE(esign_signer_identities.permanent_id, EXCLUDED.permanent_id),
           user_id = COALESCE(esign_signer_identities.user_id, EXCLUDED.user_id)`,
        [lower, userId, candidate, displayName || null]
      );
      // Re-read in case a concurrent insert claimed the email row first.
      const fin = await pool.query(`SELECT permanent_id FROM esign_signer_identities WHERE email = $1 LIMIT 1`, [lower]);
      return fin.rows[0]?.permanent_id || candidate;
    } catch (e: any) {
      if (e.code === '23505') continue; // permanent_id UNIQUE collision → widen
      throw e;
    }
  }

  // Fallback (effectively unreachable): full-width id.
  return format(hex, Math.floor(hex.length / 2));
}
