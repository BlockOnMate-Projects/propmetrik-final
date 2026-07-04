/**
 * Twilio SMS adapter — pure BYO (bring-your-own). Each organization connects THEIR OWN Twilio
 * account (Account SID + Auth Token + From number) via the Integrations hub; sends go out on that
 * org's credentials and are billed to that org. There is intentionally NO platform-env fallback:
 * if an org hasn't connected Twilio, SMS is simply unavailable for them (callers skip SMS and rely
 * on email / in-app), never silently sent from a platform number.
 *
 * Storage (see integrationConnectorService.getOrgIntegration): one `integrations` row,
 *   api_key_hash = sha256(accountSid)              — satisfies the NOT NULL column; SID isn't secret
 *   config = { accountSid, fromNumber, authTokenEnc } — Auth Token AES-256-GCM encrypted at rest
 * The Auth Token is the only truly sensitive value, so only it is encrypted (via secretCrypto).
 */

import twilio from 'twilio';
import crypto from 'crypto';
import { logger } from '../../utils/logger';
import { encryptSecret, decryptSecret, isSecretCryptoConfigured } from '../../utils/secretCrypto';
import { integrationConnectorService } from './integrationConnectorService';

export class TwilioNotConnectedError extends Error {
  constructor(message = 'Twilio is not connected for this organization') {
    super(message);
    this.name = 'TwilioNotConnectedError';
  }
}

export interface TwilioCreds {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

const SID_RE = /^AC[0-9a-fA-F]{32}$/;
const E164_RE = /^\+[1-9]\d{6,14}$/;

/** Validate the shape of BYO credentials before we ever hit Twilio. */
function validate(creds: TwilioCreds): TwilioCreds {
  const accountSid = (creds.accountSid || '').trim();
  const authToken = (creds.authToken || '').trim();
  const fromNumber = (creds.fromNumber || '').replace(/[\s()-]/g, '');
  if (!SID_RE.test(accountSid)) throw new Error('Invalid Twilio Account SID — it should start with "AC" followed by 32 hex characters.');
  if (authToken.length < 20) throw new Error('Invalid Twilio Auth Token.');
  if (!E164_RE.test(fromNumber)) throw new Error('Invalid "From" number — use E.164 format, e.g. +14155552671.');
  return { accountSid, authToken, fromNumber };
}

/**
 * Connect (or update) an org's Twilio account. Validates the credentials LIVE against Twilio before
 * persisting, so a bad key fails at connect time rather than at first send. Returns the account name.
 */
export async function connect(orgId: string, input: TwilioCreds, createdBy?: string): Promise<{ accountName: string; fromNumber: string }> {
  if (!isSecretCryptoConfigured()) {
    throw new Error('Server is missing CREDENTIALS_ENCRYPTION_SECRET; cannot securely store Twilio credentials.');
  }
  const creds = validate(input);

  // Verify the credentials work before storing them.
  const client = twilio(creds.accountSid, creds.authToken);
  let accountName = creds.accountSid;
  try {
    const acct = await client.api.accounts(creds.accountSid).fetch();
    accountName = acct.friendlyName || creds.accountSid;
    if (acct.status && acct.status !== 'active') {
      throw new Error(`Twilio account is "${acct.status}", not active.`);
    }
  } catch (e: any) {
    throw new Error(`Twilio rejected these credentials: ${e?.message || 'authentication failed'}`);
  }

  await integrationConnectorService.upsertOrgIntegration(orgId, 'twilio', {
    auth_type: 'api_key',
    status: 'connected',
    api_key_hash: crypto.createHash('sha256').update(creds.accountSid).digest('hex'),
    name: `Twilio (${accountName})`,
    config: { accountSid: creds.accountSid, fromNumber: creds.fromNumber, authTokenEnc: encryptSecret(creds.authToken) },
    createdBy,
  });
  logger.info('[twilio] org connected', { orgId, accountName });
  return { accountName, fromNumber: creds.fromNumber };
}

/** Resolve an org's decrypted Twilio credentials, or throw TwilioNotConnectedError. */
export async function getOrgCreds(orgId: string): Promise<TwilioCreds> {
  const row = await integrationConnectorService.getOrgIntegration(orgId, 'twilio');
  if (!row || row.status !== 'connected' || !row.config?.authTokenEnc || !row.config?.accountSid) {
    throw new TwilioNotConnectedError();
  }
  return {
    accountSid: row.config.accountSid,
    authToken: decryptSecret(row.config.authTokenEnc),
    fromNumber: row.config.fromNumber,
  };
}

/** True when the org has a usable Twilio connection (no throw). */
export async function isConnected(orgId: string): Promise<boolean> {
  const row = await integrationConnectorService.getOrgIntegration(orgId, 'twilio');
  return !!(row && row.status === 'connected' && row.config?.authTokenEnc && row.config?.accountSid);
}

/** Live connection test — fetches the account so the hub's "Test" button proves the creds work. */
export async function testConnection(orgId: string): Promise<{ ok: boolean; detail: string }> {
  const creds = await getOrgCreds(orgId);
  const client = twilio(creds.accountSid, creds.authToken);
  const acct = await client.api.accounts(creds.accountSid).fetch();
  return { ok: true, detail: `Connected to ${acct.friendlyName || creds.accountSid} · sending from ${creds.fromNumber}` };
}

/**
 * Send an SMS on the org's own Twilio account. Returns the Twilio message SID.
 * Throws TwilioNotConnectedError if the org hasn't connected — callers should catch and skip SMS.
 */
export async function sendSms(orgId: string, to: string, body: string): Promise<string> {
  const creds = await getOrgCreds(orgId);
  const client = twilio(creds.accountSid, creds.authToken);
  const msg = await client.messages.create({ from: creds.fromNumber, to, body });
  logger.info('[twilio] sms sent', { orgId, to, sid: msg.sid, status: msg.status });
  return msg.sid;
}
