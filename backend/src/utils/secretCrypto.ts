/**
 * Reversible secret encryption for BYO integration credentials that must be READ BACK to use
 * (e.g. an org's Twilio Auth Token used to send SMS on their behalf). This is deliberately NOT the
 * one-way `api_key_hash` path — those secrets can never be recovered, which is correct for verifying
 * an inbound key but useless for an outbound credential.
 *
 * AES-256-GCM with a PBKDF2-derived key, mirroring `data-hub/credentialsService.ts` and sharing the
 * SAME platform secret (`CREDENTIALS_ENCRYPTION_SECRET`) so there is one key to manage. Output is a
 * base64 blob `[IV(16)][TAG(16)][CIPHERTEXT]`, suitable for storing inside `integrations.config`.
 */

import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32; // 256-bit
const IV_LEN = 16;
const TAG_LEN = 16;
// PBKDF2 label — namespaces this key so it can't be confused with the data-hub credential key.
const KEY_LABEL = 'byo-integration-secret';

function deriveKey(): Buffer {
  const secret = process.env.CREDENTIALS_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      'CREDENTIALS_ENCRYPTION_SECRET is required to store or read BYO integration credentials (e.g. Twilio). ' +
      'Set a 32+ character random secret in the backend environment.'
    );
  }
  return crypto.pbkdf2Sync(secret, KEY_LABEL, 100000, KEY_LEN, 'sha256');
}

/** True when the encryption secret is configured (use to fail connect early with a clear message). */
export function isSecretCryptoConfigured(): boolean {
  return !!process.env.CREDENTIALS_ENCRYPTION_SECRET;
}

/** Encrypt a UTF-8 secret → base64 blob. */
export function encryptSecret(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv) as crypto.CipherGCM;
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/** Decrypt a base64 blob produced by {@link encryptSecret}. Throws if the secret/blob is invalid. */
export function decryptSecret(blob: string): string {
  const key = deriveKey();
  const raw = Buffer.from(blob, 'base64');
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv) as crypto.DecipherGCM;
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
