/**
 * Service Team API Client
 *
 * Unified API for managing team members within a service context.
 * Uses the new /api/v1/service-team and /api/v1/invitations endpoints
 * to list members, invite new ones, manage roles, and view privileges.
 */

import { authedFetch } from '@/lib/authed-fetch'

const API = process.env.NEXT_PUBLIC_API_URL || '/api'

// ── Types ────────────────────────────────────────────────────────────────

export interface ServiceTeamMember {
  id: string
  firstName: string
  lastName: string
  email: string
  status: string
  serviceRole: string
  subscriptionStatus: string
  joinedAt: string
  createdAt: string
}

export interface ServiceInvitation {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  serviceKey: string
  serviceRole: string
  status: string
  createdAt: string
  expiresAt: string
  invitedByName?: string
}

export interface ServiceRoleConfig {
  serviceRole: string
  displayName: string
  description: string
}

/** role → { resource_type: action[] } */
export type ServiceRolePrivileges = Record<string, Record<string, string[]>>

// ── Members ──────────────────────────────────────────────────────────────

export async function listServiceMembers(
  serviceKey: string,
  filters?: { search?: string; role?: string; status?: string },
): Promise<ServiceTeamMember[]> {
  const params = new URLSearchParams()
  if (filters?.search) params.set('search', filters.search)
  if (filters?.role) params.set('role', filters.role)
  if (filters?.status) params.set('status', filters.status)
  const qs = params.toString()
  const res = await authedFetch(
    `${API}/service-team/${serviceKey}/members${qs ? `?${qs}` : ''}`,
  )
  const json = (await res.json()) as { success: boolean; data: ServiceTeamMember[] }
  return json.data || []
}

export async function updateMemberRole(
  serviceKey: string,
  userId: string,
  role: string,
): Promise<void> {
  await authedFetch(
    `${API}/service-team/${serviceKey}/members/${userId}/role`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    },
  )
}

export async function removeMember(
  serviceKey: string,
  userId: string,
): Promise<void> {
  await authedFetch(
    `${API}/service-team/${serviceKey}/members/${userId}`,
    { method: 'DELETE' },
  )
}

// ── Invitations ──────────────────────────────────────────────────────────

export async function listServiceInvitations(
  serviceKey: string,
  status?: string,
): Promise<ServiceInvitation[]> {
  const params = new URLSearchParams({ serviceKey })
  if (status) params.set('status', status)
  const res = await authedFetch(`${API}/invitations?${params}`)
  const json = (await res.json()) as { invitations: ServiceInvitation[] }
  return json.invitations || []
}

export async function createServiceInvitation(data: {
  email: string
  firstName: string
  lastName: string
  serviceKey: string
  serviceRole: string
  message?: string
}): Promise<ServiceInvitation> {
  const res = await authedFetch(`${API}/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.serviceRole,
      userType: 'customer',
      serviceKey: data.serviceKey,
      serviceRole: data.serviceRole,
      message: data.message,
    }),
  })
  const json = (await res.json()) as { invitation: ServiceInvitation }
  return json.invitation
}

export async function cancelInvitation(id: string): Promise<void> {
  await authedFetch(`${API}/invitations/${id}`, { method: 'DELETE' })
}

export async function resendInvitation(id: string): Promise<void> {
  await authedFetch(`${API}/invitations/${id}/resend`, { method: 'POST' })
}

// ── Role Config & Privileges ─────────────────────────────────────────────

export async function getServiceRoles(
  serviceKey: string,
): Promise<ServiceRoleConfig[]> {
  const res = await authedFetch(`${API}/service-team/${serviceKey}/roles`)
  const json = (await res.json()) as { success: boolean; data: ServiceRoleConfig[] }
  return json.data || []
}

export async function getServicePrivileges(
  serviceKey: string,
): Promise<ServiceRolePrivileges> {
  const res = await authedFetch(`${API}/service-team/${serviceKey}/privileges`)
  const json = (await res.json()) as { success: boolean; data: ServiceRolePrivileges }
  return json.data || {}
}
