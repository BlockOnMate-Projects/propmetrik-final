/**
 * Developer Portal API client.
 *
 * Typed wrappers over the backend `/api/developers/*` console endpoints
 * (session-authenticated, org-scoped). The Next proxy rewrites `/api/*` →
 * backend `/api/v1/*`, so callers use `/api/developers/...` (never prefix
 * NEXT_PUBLIC_API_URL — see the api-proxy contract).
 */

import { authedFetch } from '@/lib/authed-fetch'

export interface ApiKey {
  id: string
  name: string
  key_prefix: string
  scopes: string[]
  rate_limit_per_minute: number
  rate_limit_per_day: number
  allowed_ips: string[] | null
  is_active: boolean
  last_used_at: string | null
  last_used_ip?: string | null
  usage_count?: number | string
  expires_at: string | null
  created_at: string
  revoked_at?: string | null
}

/** Returned ONLY on create/rotate — includes the full secret shown once. */
export interface CreatedApiKey extends ApiKey {
  key: string
}

export interface ApiProductEntitlement {
  service_key: string
  name: string
  tier: string
  status: string
  expires_at: string | null
}

export interface Entitlements {
  tier: string
  products: ApiProductEntitlement[]
  has_api_access: boolean
  limits: { rate_limit_per_minute: number; rate_limit_per_day: number }
  monthly_quota: number | null
  usage: {
    today: number
    month_to_date: number
    total: number
    quota_used_pct: number | null
  }
}

export interface UsageSummary {
  total_requests: number
  total_errors: number
  error_rate: number
  requests_30d: number
  requests_today: number
  active_keys: number
  total_keys: number
  last_used_at: string | null
}

export interface UsageDailyPoint {
  date: string
  request_count: number
  error_count: number
}

export interface EndpointUsage {
  endpoint: string
  count: number
}

export interface KeyUsage {
  key_id: string
  name: string
  key_prefix: string
  is_active: boolean
  last_used_at: string | null
  request_count: number
  error_count: number
}

export interface StreamChannel {
  channel: string
  product: string
  description: string
  scoped?: string
  entitled: boolean
}

export interface StreamStatus {
  active_connections: number
  max_connections: number
  tier: string
  usage: {
    total_connections: number
    total_messages: number
    connection_minutes: number
    connections_30d: number
    messages_30d: number
  }
  channels: StreamChannel[]
}

const BASE = '/api/developers'

async function get<T>(path: string): Promise<T> {
  const res = await authedFetch(`${BASE}${path}`)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.message || body?.error || `Request failed (${res.status})`)
  return (body?.data ?? body) as T
}

async function send<T>(method: string, path: string, payload?: unknown): Promise<T> {
  const res = await authedFetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.message || body?.error || `Request failed (${res.status})`)
  return (body?.data ?? body) as T
}

// ── Entitlements / plan ──────────────────────────────────────────────────────
export const getEntitlements = () => get<Entitlements>('/entitlements')

// ── Usage ────────────────────────────────────────────────────────────────────
export const getUsageSummary = () => get<UsageSummary>('/usage/summary')
export const getUsageDaily = (days = 30) => get<UsageDailyPoint[]>(`/usage/daily?days=${days}`)
export const getUsageByEndpoint = (days = 30) => get<EndpointUsage[]>(`/usage/by-endpoint?days=${days}`)
export const getUsageByKey = (days = 30) => get<KeyUsage[]>(`/usage/by-key?days=${days}`)

// ── Keys ─────────────────────────────────────────────────────────────────────
export const listKeys = () => get<ApiKey[]>('/keys')
export const createKey = (name: string, scopes?: string[]) =>
  send<CreatedApiKey>('POST', '/keys', scopes ? { name, scopes } : { name })
export const rotateKey = (id: string) => send<CreatedApiKey>('POST', `/keys/${id}/rotate`)
export const revokeKey = (id: string) => send<{ success: boolean }>('DELETE', `/keys/${id}`)

// ── Streaming ────────────────────────────────────────────────────────────────
export const getStreamStatus = () => get<StreamStatus>('/stream/status')
