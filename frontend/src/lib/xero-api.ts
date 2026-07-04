/**
 * Xero Integration API Client
 * Communicates with /api/v1/xero/* endpoints.
 */

import { authedFetch } from './authed-fetch';

const BASE = '/api/v1/xero';

export interface XeroStatus {
  connected: boolean;
  tenantName?: string | null;
  tenantId?: string | null;
  lastSyncAt?: string | null;
  status?: string;
}

export interface XeroSyncResult {
  synced: number;
  errors: string[];
}

/** Fetch connection status for the current org */
export async function getXeroStatus(): Promise<XeroStatus> {
  const res = await authedFetch(`${BASE}/status`);
  const json = await res.json();
  return json.data as XeroStatus;
}

/** Disconnect Xero — revokes stored tokens */
export async function disconnectXero(): Promise<void> {
  await authedFetch(`${BASE}/disconnect`, { method: 'DELETE' });
}

/** Trigger manual cost sync to Xero */
export async function syncXeroCosts(): Promise<XeroSyncResult> {
  const res = await authedFetch(`${BASE}/sync/costs`, { method: 'POST' });
  const json = await res.json();
  return json.data as XeroSyncResult;
}

/** Start Xero OAuth2 flow (redirects the browser).
 *  Use the bare `/api/...` path — the Next proxy rewrites it to backend `/api/v1/...`.
 *  (`/api/v1/xero/auth` would double-prefix to `/api/v1/v1/...` and 404.) */
export function startXeroOAuth(): void {
  window.location.href = '/api/xero/auth';
}
