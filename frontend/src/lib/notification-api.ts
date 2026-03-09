/**
 * Notification API Client
 * Interfaces with /api/v1/notifications (In-Mail Notification System)
 */
import { authedFetch } from './authed-fetch'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'

export interface Notification {
  id: string
  user_id: string
  organization_id?: string
  title: string
  body: string
  summary?: string
  category: 'esign' | 'property' | 'valuation' | 'crm' | 'project' | 'finance' | 'system' | 'alert'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  source_type: string
  source_id?: string
  source_url?: string
  actions?: Array<{ label: string; url: string; type: 'primary' | 'secondary' }>
  is_read: boolean
  read_at?: string
  is_archived: boolean
  archived_at?: string
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
  expires_at?: string
}

export const notificationApi = {
  async getNotifications(params?: {
    category?: string
    isRead?: boolean
    limit?: number
    offset?: number
  }) {
    const qs = new URLSearchParams()
    if (params?.category) qs.set('category', params.category)
    if (params?.isRead !== undefined) qs.set('isRead', String(params.isRead))
    if (params?.limit) qs.set('limit', String(params.limit))
    if (params?.offset) qs.set('offset', String(params.offset))

    const res = await authedFetch(`${API_BASE}/notifications?${qs}`)
    if (!res.ok) throw new Error(`Failed to fetch notifications: ${res.status}`)
    return res.json() as Promise<{ notifications: Notification[]; total: number }>
  },

  async getUnreadCount(category?: string) {
    const qs = category ? `?category=${category}` : ''
    const res = await authedFetch(`${API_BASE}/notifications/unread-count${qs}`)
    if (!res.ok) return { unread: 0 }
    return res.json() as Promise<{ unread: number }>
  },

  async getUnreadCountsByCategory() {
    const res = await authedFetch(`${API_BASE}/notifications/unread-counts-by-category`)
    if (!res.ok) return { counts: {} }
    return res.json() as Promise<{ counts: Record<string, number> }>
  },

  async markAsRead(id: string) {
    const res = await authedFetch(`${API_BASE}/notifications/${id}/read`, { method: 'POST' })
    return res.ok
  },

  async markAllAsRead(category?: string) {
    const res = await authedFetch(`${API_BASE}/notifications/mark-all-read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category }),
    })
    return res.ok
  },

  async archiveNotification(id: string) {
    const res = await authedFetch(`${API_BASE}/notifications/${id}/archive`, { method: 'POST' })
    return res.ok
  },

  async deleteNotification(id: string) {
    const res = await authedFetch(`${API_BASE}/notifications/${id}`, { method: 'DELETE' })
    return res.ok
  },
}
