/**
 * Workspace API client
 * Connects frontend to the /api/v1/workspace endpoints
 */

import { getSession } from 'next-auth/react';

const WORKSPACE_BASE = '/api/workspace';

async function getAuthHeaders(): Promise<Record<string, string>> {
    if (typeof window === 'undefined') return {};
    const session = await getSession();
    const token = (session as any)?.accessToken as string | undefined;
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchWorkspaceApi<T>(path: string, options?: RequestInit): Promise<T> {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`${WORKSPACE_BASE}${path}`, {
        headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
        },
        ...options,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Workspace API error');
    }
    return res.json();
}

export type EntityType = 'project' | 'valuation' | 'deal' | 'property' | 'platform';
export type MemberRole = 'admin' | 'member' | 'viewer';
export type SenderType = 'user' | 'system' | 'kobby_ai';
export type ConversationType = 'channel' | 'dm' | 'group';

export interface WorkspaceMessage {
    id: string;
    workspace_id: string;
    conversation_id: string;
    sender_id: string | null;
    sender_type: SenderType;
    message_type: 'text' | 'file' | 'system' | 'ai_response';
    content: string;
    metadata: Record<string, any> | null;
    thread_id: string | null;
    created_at: string;
    edited_at: string | null;
    deleted_at: string | null;
    sender_name?: string;
}

export interface WorkspaceConversation {
    id: string;
    workspace_id: string;
    conversation_type: ConversationType;
    name: string | null;
    dm_key: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    archived_at: string | null;
}

export interface ConversationMember {
    workspace_id: string;
    user_id: string;
    role: 'admin' | 'member';
    joined_at: string;
    display_name?: string;
    email?: string;
}

export interface Workspace {
    id: string;
    entity_type: EntityType;
    entity_id: string;
    organization_id: string;
    name: string | null;
    created_at: string;
}

export interface WorkspaceMember {
    workspace_id: string;
    user_id: string;
    role: MemberRole;
    joined_at: string;
    display_name?: string;
    email?: string;
}

export interface MessagePage {
    messages: WorkspaceMessage[];
    next_cursor: string | null;
    has_more: boolean;
}

export const workspaceApi = {
    /** Get or create workspace for an entity */
    getOrCreate: (entityType: EntityType, entityId: string) =>
        fetchWorkspaceApi<{ workspace: Workspace; members: WorkspaceMember[]; unreadCount: number }>(
            `/${entityType}/${entityId}`
        ),

    /** List conversations current user can access */
    getConversations: (workspaceId: string) =>
        fetchWorkspaceApi<{ conversations: WorkspaceConversation[] }>(`/${workspaceId}/conversations`),

    /** Create or get DM conversation */
    createDMConversation: (workspaceId: string, memberId: string) =>
        fetchWorkspaceApi<{ conversation: WorkspaceConversation }>(`/${workspaceId}/conversations/dm`, {
            method: 'POST',
            body: JSON.stringify({ memberId }),
        }),

    /** Create private group conversation */
    createGroupConversation: (workspaceId: string, name: string, memberIds: string[]) =>
        fetchWorkspaceApi<{ conversation: WorkspaceConversation }>(`/${workspaceId}/conversations/group`, {
            method: 'POST',
            body: JSON.stringify({ name, memberIds }),
        }),

    renameConversation: (workspaceId: string, conversationId: string, name: string) =>
        fetchWorkspaceApi<{ conversation: WorkspaceConversation }>(`/${workspaceId}/conversations/${conversationId}`, {
            method: 'PATCH',
            body: JSON.stringify({ name }),
        }),

    leaveConversation: (workspaceId: string, conversationId: string) =>
        fetchWorkspaceApi<{ success: boolean }>(`/${workspaceId}/conversations/${conversationId}/leave`, {
            method: 'POST',
        }),

    archiveConversation: (workspaceId: string, conversationId: string) =>
        fetchWorkspaceApi<{ success: boolean }>(`/${workspaceId}/conversations/${conversationId}/archive`, {
            method: 'POST',
        }),

    getConversationMembers: (workspaceId: string, conversationId: string) =>
        fetchWorkspaceApi<{ members: ConversationMember[] }>(`/${workspaceId}/conversations/${conversationId}/members`),

    addConversationMember: (workspaceId: string, conversationId: string, userId: string) =>
        fetchWorkspaceApi<{ success: boolean }>(`/${workspaceId}/conversations/${conversationId}/members`, {
            method: 'POST',
            body: JSON.stringify({ userId }),
        }),

    removeConversationMember: (workspaceId: string, conversationId: string, userId: string) =>
        fetchWorkspaceApi<{ success: boolean }>(`/${workspaceId}/conversations/${conversationId}/members/${userId}`, {
            method: 'DELETE',
        }),

    getConversationUnreadCounts: (workspaceId: string) =>
        fetchWorkspaceApi<{ counts: Record<string, number> }>(`/${workspaceId}/conversations/unread`),

    markConversationRead: (workspaceId: string, conversationId: string) =>
        fetchWorkspaceApi<{ success: boolean }>(`/${workspaceId}/conversations/${conversationId}/read`, {
            method: 'POST',
        }),

    /** Get paginated messages (scoped to conversation when provided) */
    getMessages: (workspaceId: string, cursor?: string, limit = 50, conversationId?: string) =>
        fetchWorkspaceApi<MessagePage>(
            `/${workspaceId}/messages?${cursor ? `cursor=${cursor}&` : ''}limit=${limit}${conversationId ? `&conversationId=${encodeURIComponent(conversationId)}` : ''}`
        ),

    /** Send a message via REST (fallback) */
    sendMessage: (workspaceId: string, content: string, threadId?: string, conversationId?: string, metadata?: Record<string, any>) =>
        fetchWorkspaceApi<{ message: WorkspaceMessage }>(`/${workspaceId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ content, threadId, conversationId, metadata }),
        }),

    /** Delete a message (soft-delete, author only) */
    deleteMessage: (workspaceId: string, messageId: string) =>
        fetchWorkspaceApi<{ success: boolean }>(`/${workspaceId}/messages/${messageId}`, {
            method: 'DELETE',
        }),

    /** Get a single message by ID (for thread parent lookups) */
    getMessageById: (workspaceId: string, messageId: string) =>
        fetchWorkspaceApi<{ message: WorkspaceMessage }>(`/${workspaceId}/messages/${messageId}`),

    /** List members */
    getMembers: (workspaceId: string) =>
        fetchWorkspaceApi<{ members: WorkspaceMember[] }>(`/${workspaceId}/members`),

    /** Add member */
    addMember: (workspaceId: string, userId: string, role: MemberRole = 'member') =>
        fetchWorkspaceApi<{ member: WorkspaceMember }>(`/${workspaceId}/members`, {
            method: 'POST',
            body: JSON.stringify({ user_id: userId, role }),
        }),

    /** Remove member */
    removeMember: (workspaceId: string, userId: string) =>
        fetchWorkspaceApi(`/${workspaceId}/members/${userId}`, { method: 'DELETE' }),

    /** Mark all messages as read */
    markAllRead: (workspaceId: string) =>
        fetchWorkspaceApi(`/${workspaceId}/read`, { method: 'POST' }),

    /** Get all unread counts (for notification badge) */
    getAllUnreadCounts: () =>
        fetchWorkspaceApi<{ counts: Record<string, number> }>('/unread/all'),
};
