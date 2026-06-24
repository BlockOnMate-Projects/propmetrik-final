/**
 * WorkspaceService
 *
 * Core service for the Workspace collaboration feature.
 * Handles: workspace CRUD, membership, message persistence,
 * cursor-based pagination, and unread tracking.
 *
 * @module services/workspace/WorkspaceService
 */

import { pool } from '../../src/database';
import { pubsub } from '../../src/database/redis';
import { logger } from '../../src/utils/logger';

// ============================================================================
// TYPES
// ============================================================================

export type EntityType = 'project' | 'valuation' | 'deal' | 'property' | 'platform';
export type MemberRole = 'admin' | 'member' | 'viewer';
export type SenderType = 'user' | 'system' | 'kobby_ai';
export type MessageType = 'text' | 'file' | 'system' | 'ai_response';
export type ConversationType = 'channel' | 'dm' | 'group';

export interface Workspace {
    id: string;
    entity_type: EntityType;
    entity_id: string;
    organization_id: string;
    name: string | null;
    created_at: Date;
}

export interface WorkspaceMember {
    workspace_id: string;
    user_id: string;
    role: MemberRole;
    joined_at: Date;
    display_name?: string;
    email?: string;
    avatar_url?: string;
}

export interface WorkspaceMessage {
    id: string;
    workspace_id: string;
    conversation_id: string;
    sender_id: string | null;
    sender_type: SenderType;
    message_type: MessageType;
    content: string;
    metadata: Record<string, any> | null;
    thread_id: string | null;
    created_at: Date;
    edited_at: Date | null;
    deleted_at: Date | null;
    // Joined fields
    sender_name?: string;
    sender_avatar?: string;
}

export interface WorkspaceConversation {
    id: string;
    workspace_id: string;
    conversation_type: ConversationType;
    name: string | null;
    dm_key: string | null;
    created_by: string | null;
    created_at: Date;
    updated_at: Date;
    archived_at: Date | null;
}

export interface ConversationUnreadCount {
    conversation_id: string;
    count: number;
}

export interface MessagePage {
    messages: WorkspaceMessage[];
    next_cursor: string | null;
    has_more: boolean;
}


// ============================================================================
// WORKSPACE SERVICE
// ============================================================================

class WorkspaceServiceImpl {
    private buildDmKey(a: string, b: string): string {
        return [a, b].sort().join(':');
    }

    private async ensureDefaultConversation(workspaceId: string): Promise<WorkspaceConversation> {
        const existing = await pool.query<WorkspaceConversation>(
            `SELECT * FROM workspace_conversations
             WHERE workspace_id = $1 AND conversation_type = 'channel' AND name = 'General'
             LIMIT 1`,
            [workspaceId]
        );
        if (existing.rows[0]) return existing.rows[0];

        const created = await pool.query<WorkspaceConversation>(
            `INSERT INTO workspace_conversations (workspace_id, conversation_type, name)
             VALUES ($1, 'channel', 'General')
             RETURNING *`,
            [workspaceId]
        );

        await pool.query(
            `INSERT INTO workspace_conversation_members (conversation_id, user_id, role)
             SELECT $1, wm.user_id, CASE WHEN wm.role = 'admin' THEN 'admin' ELSE 'member' END
             FROM workspace_members wm
             WHERE wm.workspace_id = $2
             ON CONFLICT (conversation_id, user_id) DO NOTHING`,
            [created.rows[0].id, workspaceId]
        );

        return created.rows[0];
    }

    async getDefaultConversation(workspaceId: string): Promise<WorkspaceConversation> {
        return this.ensureDefaultConversation(workspaceId);
    }

    // --------------------------------------------------------------------------
    // Workspace Lifecycle
    // --------------------------------------------------------------------------

    /**
     * Get an existing workspace for an entity, or create one if it doesn't exist.
     * This is the primary entry point for auto-creation.
     */
    async ensureWorkspace(
        entityType: EntityType,
        entityId: string,
        organizationId: string,
        name?: string
    ): Promise<Workspace> {
        if (!organizationId) {
            throw Object.assign(new Error('organizationId is required to resolve a workspace'), { status: 400 });
        }
        const client = await pool.connect();
        try {
            // Try to find existing workspace — scoped by organization so two different
            // orgs can never collapse onto the same workspace row (the cross-org leak).
            const existing = await client.query<Workspace>(
                `SELECT * FROM workspaces WHERE entity_type = $1 AND entity_id = $2 AND organization_id = $3`,
                [entityType, entityId, organizationId]
            );

            let workspace: Workspace;
            if (existing.rows.length > 0) {
                workspace = existing.rows[0];
            } else {
                // Create new workspace. Unique key is (entity_type, entity_id, organization_id)
                // — see migration 249. Conflict target must match that constraint.
                const result = await client.query<Workspace>(
                    `INSERT INTO workspaces (entity_type, entity_id, organization_id, name)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (entity_type, entity_id, organization_id) DO UPDATE
               SET name = COALESCE(EXCLUDED.name, workspaces.name)
             RETURNING *`,
                    [entityType, entityId, organizationId, name || null]
                );
                workspace = result.rows[0];
                logger.info(`Workspace created: ${workspace.id} for ${entityType} ${entityId} (org ${organizationId})`);
            }

            // Sync organization members for platform workspace
            if (entityType === 'platform' && organizationId) {
                await client.query(
                    `INSERT INTO workspace_members (workspace_id, user_id, role)
                     SELECT $1, id, 'member' FROM users 
                     WHERE organization_id = $2
                     ON CONFLICT DO NOTHING`,
                    [workspace.id, organizationId]
                );
            }

            await this.ensureDefaultConversation(workspace.id);

            return workspace;
        } catch (error: any) {
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get a workspace by entity type and id.
     */
    async getByEntity(entityType: EntityType, entityId: string): Promise<Workspace | null> {
        const result = await pool.query<Workspace>(
            `SELECT * FROM workspaces WHERE entity_type = $1 AND entity_id = $2`,
            [entityType, entityId]
        );
        return result.rows[0] || null;
    }

    /**
     * Get a workspace by its id, STRICTLY scoped to the caller's organization.
     * A workspace always belongs to exactly one org; we never match on NULL org
     * (that was a cross-org access hole — a null-org row was visible to everyone).
     */
    async getById(workspaceId: string, organizationId: string): Promise<Workspace | null> {
        if (!organizationId) return null;
        const result = await pool.query<Workspace>(
            `SELECT * FROM workspaces WHERE id = $1 AND organization_id = $2`,
            [workspaceId, organizationId]
        );
        return result.rows[0] || null;
    }

    // --------------------------------------------------------------------------
    // Membership
    // --------------------------------------------------------------------------

    /**
     * Add a user to the workspace.
     */
    async addMember(workspaceId: string, userId: string, role: MemberRole = 'member'): Promise<WorkspaceMember> {
        // HARD org guard: never add a user to a workspace that belongs to a different
        // organization. This is the last line of defense behind the per-org scoping —
        // it stops both the REST auto-add and the WS join from ever mixing orgs again.
        const guard = await pool.query<{ ok: boolean }>(
            `SELECT (w.organization_id = u.organization_id) AS ok
             FROM workspaces w, users u
             WHERE w.id = $1 AND u.id = $2`,
            [workspaceId, userId]
        );
        if (!guard.rows[0]) {
            throw Object.assign(new Error('Workspace or user not found'), { status: 404 });
        }
        if (guard.rows[0].ok !== true) {
            logger.warn(`Blocked cross-org workspace add: user ${userId} into workspace ${workspaceId}`);
            throw Object.assign(new Error('Cannot join a workspace from another organization'), { status: 403 });
        }

        const result = await pool.query<WorkspaceMember>(
            `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role
       RETURNING *`,
            [workspaceId, userId, role]
        );

        // Auto-add to the General channel so they can see messages
        const defaultConversation = await this.ensureDefaultConversation(workspaceId);
        await pool.query(
            `INSERT INTO workspace_conversation_members (conversation_id, user_id, role)
             VALUES ($1, $2, 'member')
             ON CONFLICT (conversation_id, user_id) DO NOTHING`,
            [defaultConversation.id, userId]
        );

        // Post system message
        await this.persistMessage({
            workspaceId,
            conversationId: defaultConversation.id,
            senderId: null,
            senderType: 'system',
            messageType: 'system',
            content: `👤 A new team member joined the workspace.`,
        });

        return result.rows[0];
    }

    /**
     * Remove a user from the workspace.
     */
    async removeMember(workspaceId: string, userId: string): Promise<boolean> {
        const result = await pool.query(
            `DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
            [workspaceId, userId]
        );
        return (result.rowCount ?? 0) > 0;
    }

    /**
     * Get all members of a workspace with user info.
     */
    async getMembers(workspaceId: string): Promise<WorkspaceMember[]> {
        const result = await pool.query<WorkspaceMember>(
            `SELECT 
         wm.workspace_id, wm.user_id, wm.role, wm.joined_at,
         u.display_name, u.email
       FROM workspace_members wm
       LEFT JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1
       ORDER BY wm.joined_at ASC`,
            [workspaceId]
        );
        return result.rows;
    }

    /**
     * Check if a user is a member of the workspace.
     */
    async isMember(workspaceId: string, userId: string): Promise<boolean> {
        const result = await pool.query(
            `SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
            [workspaceId, userId]
        );
        return result.rows.length > 0;
    }

    /**
     * Check if a user can write to the workspace (member or admin role).
     */
    async canWrite(workspaceId: string, userId: string): Promise<boolean> {
        const result = await pool.query(
            `SELECT role FROM workspace_members 
       WHERE workspace_id = $1 AND user_id = $2`,
            [workspaceId, userId]
        );
        if (result.rows.length === 0) return false;
        return ['admin', 'member'].includes(result.rows[0].role);
    }

    async listConversations(workspaceId: string, userId: string): Promise<WorkspaceConversation[]> {
        await this.ensureDefaultConversation(workspaceId);
        // For DMs, resolve the OTHER participant's name so the list can label it
        // reliably ("Farouk") instead of the frontend having to parse dm_key.
        const result = await pool.query<WorkspaceConversation>(
            `SELECT c.*, dm.display_name, dm.other_user_id
             FROM workspace_conversations c
             JOIN workspace_conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $2
             LEFT JOIN LATERAL (
               SELECT COALESCE(u.display_name, NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.email) AS display_name, u.id AS other_user_id
               FROM workspace_conversation_members m2 JOIN users u ON u.id = m2.user_id
               WHERE m2.conversation_id = c.id AND m2.user_id <> $2
               LIMIT 1
             ) dm ON c.conversation_type = 'dm'
             WHERE c.workspace_id = $1 AND c.archived_at IS NULL
             ORDER BY
               CASE WHEN c.conversation_type = 'channel' THEN 0 WHEN c.conversation_type = 'dm' THEN 1 ELSE 2 END,
               c.updated_at DESC`,
            [workspaceId, userId]
        );
        return result.rows;
    }

    /** Return a single conversation with a viewer-relative display_name (DM = the other member). */
    async getConversationForViewer(conversationId: string, viewerUserId: string): Promise<WorkspaceConversation | null> {
        const result = await pool.query<WorkspaceConversation>(
            `SELECT c.*, dm.display_name, dm.other_user_id
             FROM workspace_conversations c
             LEFT JOIN LATERAL (
               SELECT COALESCE(u.display_name, NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.email) AS display_name, u.id AS other_user_id
               FROM workspace_conversation_members m2 JOIN users u ON u.id = m2.user_id
               WHERE m2.conversation_id = c.id AND m2.user_id <> $2
               LIMIT 1
             ) dm ON c.conversation_type = 'dm'
             WHERE c.id = $1`,
            [conversationId, viewerUserId]
        );
        return result.rows[0] || null;
    }

    async getConversationById(workspaceId: string, conversationId: string): Promise<WorkspaceConversation | null> {
        const result = await pool.query<WorkspaceConversation>(
            `SELECT * FROM workspace_conversations
             WHERE id = $1 AND workspace_id = $2 AND archived_at IS NULL`,
            [conversationId, workspaceId]
        );
        return result.rows[0] || null;
    }

    async isConversationMember(conversationId: string, userId: string): Promise<boolean> {
        const result = await pool.query(
            `SELECT 1 FROM workspace_conversation_members WHERE conversation_id = $1 AND user_id = $2`,
            [conversationId, userId]
        );
        return result.rows.length > 0;
    }

    async getConversationMemberUserIds(conversationId: string): Promise<string[]> {
        const result = await pool.query<{ user_id: string }>(
            `SELECT user_id FROM workspace_conversation_members WHERE conversation_id = $1`,
            [conversationId]
        );
        return result.rows.map((r) => r.user_id);
    }

    async getConversationMembers(conversationId: string): Promise<WorkspaceMember[]> {
        const result = await pool.query<WorkspaceMember>(
            `SELECT 
                cm.conversation_id AS workspace_id,
                cm.user_id,
                cm.role,
                cm.joined_at,
                u.display_name,
                u.email
             FROM workspace_conversation_members cm
             LEFT JOIN users u ON u.id = cm.user_id
             WHERE cm.conversation_id = $1
             ORDER BY cm.joined_at ASC`,
            [conversationId]
        );
        return result.rows;
    }

    private async getConversationMemberRole(conversationId: string, userId: string): Promise<'admin' | 'member' | null> {
        const result = await pool.query<{ role: 'admin' | 'member' }>(
            `SELECT role FROM workspace_conversation_members WHERE conversation_id = $1 AND user_id = $2`,
            [conversationId, userId]
        );
        return result.rows[0]?.role || null;
    }

    async renameConversation(workspaceId: string, conversationId: string, actorUserId: string, name: string): Promise<WorkspaceConversation | null> {
        const conv = await this.getConversationById(workspaceId, conversationId);
        if (!conv) return null;
        if (conv.conversation_type !== 'group' && conv.conversation_type !== 'channel') return null;

        const role = await this.getConversationMemberRole(conversationId, actorUserId);
        if (role !== 'admin') {
            throw new Error('Only conversation admins can rename this conversation');
        }

        const result = await pool.query<WorkspaceConversation>(
            `UPDATE workspace_conversations
             SET name = $3, updated_at = NOW()
             WHERE id = $1 AND workspace_id = $2 AND archived_at IS NULL
             RETURNING *`,
            [conversationId, workspaceId, name]
        );
        return result.rows[0] || null;
    }

    async leaveConversation(workspaceId: string, conversationId: string, userId: string): Promise<boolean> {
        const conv = await this.getConversationById(workspaceId, conversationId);
        if (!conv) return false;

        if (conv.conversation_type === 'channel') {
            throw new Error('Cannot leave the default channel conversation');
        }

        const result = await pool.query(
            `DELETE FROM workspace_conversation_members WHERE conversation_id = $1 AND user_id = $2`,
            [conversationId, userId]
        );

        if ((result.rowCount || 0) === 0) return false;

        const remaining = await pool.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM workspace_conversation_members WHERE conversation_id = $1`,
            [conversationId]
        );

        if (parseInt(remaining.rows[0].count, 10) === 0) {
            await pool.query(
                `UPDATE workspace_conversations SET archived_at = NOW(), updated_at = NOW() WHERE id = $1`,
                [conversationId]
            );
        }

        return true;
    }

    async archiveConversation(workspaceId: string, conversationId: string, actorUserId: string): Promise<boolean> {
        const conv = await this.getConversationById(workspaceId, conversationId);
        if (!conv) return false;

        if (conv.conversation_type !== 'group') {
            throw new Error('Only group conversations can be archived');
        }

        const role = await this.getConversationMemberRole(conversationId, actorUserId);
        if (role !== 'admin') {
            throw new Error('Only group admins can archive this conversation');
        }

        const result = await pool.query(
            `UPDATE workspace_conversations
             SET archived_at = NOW(), updated_at = NOW()
             WHERE id = $1 AND workspace_id = $2 AND archived_at IS NULL`,
            [conversationId, workspaceId]
        );
        return (result.rowCount || 0) > 0;
    }

    async addConversationMember(workspaceId: string, conversationId: string, actorUserId: string, targetUserId: string): Promise<boolean> {
        const conv = await this.getConversationById(workspaceId, conversationId);
        if (!conv) return false;
        if (conv.conversation_type !== 'group') {
            throw new Error('Can only add members to group conversations');
        }

        const role = await this.getConversationMemberRole(conversationId, actorUserId);
        if (role !== 'admin') {
            throw new Error('Only group admins can add members');
        }

        const workspaceMember = await this.isMember(workspaceId, targetUserId);
        if (!workspaceMember) {
            throw new Error('Target user must be a workspace member');
        }

        const result = await pool.query(
            `INSERT INTO workspace_conversation_members (conversation_id, user_id, role, added_by)
             VALUES ($1, $2, 'member', $3)
             ON CONFLICT (conversation_id, user_id) DO NOTHING`,
            [conversationId, targetUserId, actorUserId]
        );

        await pool.query(`UPDATE workspace_conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);
        return (result.rowCount || 0) > 0;
    }

    async removeConversationMember(workspaceId: string, conversationId: string, actorUserId: string, targetUserId: string): Promise<boolean> {
        const conv = await this.getConversationById(workspaceId, conversationId);
        if (!conv) return false;
        if (conv.conversation_type !== 'group') {
            throw new Error('Can only remove members from group conversations');
        }

        const role = await this.getConversationMemberRole(conversationId, actorUserId);
        if (role !== 'admin' && actorUserId !== targetUserId) {
            throw new Error('Only group admins can remove other members');
        }

        const result = await pool.query(
            `DELETE FROM workspace_conversation_members WHERE conversation_id = $1 AND user_id = $2`,
            [conversationId, targetUserId]
        );

        if ((result.rowCount || 0) === 0) return false;

        const remaining = await pool.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count FROM workspace_conversation_members WHERE conversation_id = $1`,
            [conversationId]
        );
        if (parseInt(remaining.rows[0].count, 10) === 0) {
            await pool.query(`UPDATE workspace_conversations SET archived_at = NOW(), updated_at = NOW() WHERE id = $1`, [conversationId]);
        }

        await pool.query(`UPDATE workspace_conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);
        return true;
    }

    async createOrGetDMConversation(workspaceId: string, actorUserId: string, otherUserId: string): Promise<WorkspaceConversation> {
        const dmKey = this.buildDmKey(actorUserId, otherUserId);
        const existing = await pool.query<WorkspaceConversation>(
            `SELECT * FROM workspace_conversations
             WHERE workspace_id = $1 AND conversation_type = 'dm' AND dm_key = $2
             LIMIT 1`,
            [workspaceId, dmKey]
        );
        if (existing.rows[0]) return existing.rows[0];

        const created = await pool.query<WorkspaceConversation>(
            `INSERT INTO workspace_conversations (workspace_id, conversation_type, name, dm_key, created_by)
             VALUES ($1, 'dm', NULL, $2, $3)
             RETURNING *`,
            [workspaceId, dmKey, actorUserId]
        );

        await pool.query(
            `INSERT INTO workspace_conversation_members (conversation_id, user_id, role)
             VALUES ($1, $2, 'member'), ($1, $3, 'member')
             ON CONFLICT (conversation_id, user_id) DO NOTHING`,
            [created.rows[0].id, actorUserId, otherUserId]
        );

        return created.rows[0];
    }

    /** Create a named channel open to EVERY current workspace member (org-wide chat). */
    async createChannel(workspaceId: string, creatorUserId: string, name: string): Promise<WorkspaceConversation> {
        const created = await pool.query<WorkspaceConversation>(
            `INSERT INTO workspace_conversations (workspace_id, conversation_type, name, created_by)
             VALUES ($1, 'channel', $2, $3)
             RETURNING *`,
            [workspaceId, name, creatorUserId]
        );
        await pool.query(
            `INSERT INTO workspace_conversation_members (conversation_id, user_id, role)
             SELECT $1, wm.user_id, CASE WHEN wm.role = 'admin' THEN 'admin' ELSE 'member' END
             FROM workspace_members wm
             WHERE wm.workspace_id = $2
             ON CONFLICT (conversation_id, user_id) DO NOTHING`,
            [created.rows[0].id, workspaceId]
        );
        return created.rows[0];
    }

    async createGroupConversation(
        workspaceId: string,
        creatorUserId: string,
        name: string,
        memberIds: string[]
    ): Promise<WorkspaceConversation> {
        const uniqueMemberIds = Array.from(new Set([creatorUserId, ...memberIds]));
        const created = await pool.query<WorkspaceConversation>(
            `INSERT INTO workspace_conversations (workspace_id, conversation_type, name, created_by)
             VALUES ($1, 'group', $2, $3)
             RETURNING *`,
            [workspaceId, name, creatorUserId]
        );

        await pool.query(
            `INSERT INTO workspace_conversation_members (conversation_id, user_id, role)
             SELECT $1, uid, CASE WHEN uid = $2 THEN 'admin' ELSE 'member' END
             FROM unnest($3::uuid[]) AS uid
             ON CONFLICT (conversation_id, user_id) DO NOTHING`,
            [created.rows[0].id, creatorUserId, uniqueMemberIds]
        );

        return created.rows[0];
    }

    // --------------------------------------------------------------------------
    // Messages
    // --------------------------------------------------------------------------

    /**
     * Persist a message to the database and publish to Redis.
     */
    async persistMessage(params: {
        workspaceId: string;
        conversationId: string;
        senderId: string | null;
        senderType?: SenderType;
        messageType?: MessageType;
        content: string;
        metadata?: Record<string, any>;
        threadId?: string;
        organizationId?: string;
    }): Promise<WorkspaceMessage> {
        const {
            workspaceId,
            conversationId,
            senderId,
            senderType = 'user',
            messageType = 'text',
            content,
            metadata,
            threadId,
            organizationId,
        } = params;

        const result = await pool.query<WorkspaceMessage>(
            `INSERT INTO workspace_messages 
                 (workspace_id, conversation_id, sender_id, sender_type, message_type, content, metadata, thread_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
                        [workspaceId, conversationId, senderId, senderType, messageType, content, metadata ? JSON.stringify(metadata) : null, threadId || null]
        );

        const message = result.rows[0];

        // Enrich with sender name if available
        if (senderId) {
            const userResult = await pool.query(
                `SELECT display_name FROM users WHERE id = $1`,
                [senderId]
            );
            if (userResult.rows.length > 0) {
                message.sender_name = userResult.rows[0].display_name;
            }
        }

        // Publish to Redis pub/sub channel
        const channel = `workspace:${workspaceId}`;
        try {
            await pubsub.publish(channel, {
                type: 'message',
                payload: message,
            });
        } catch (err) {
            logger.warn('Redis publish failed (non-critical)', { workspaceId, error: (err as Error).message });
        }

        return message;
    }

    /**
     * Get paginated messages using cursor-based pagination.
     * Cursor is the created_at timestamp of the last seen message.
     */
    async getMessages(workspaceId: string, cursor?: string, limit = 50): Promise<MessagePage> {
        const defaultConversation = await this.ensureDefaultConversation(workspaceId);
        return this.getMessagesByConversation(workspaceId, defaultConversation.id, cursor, limit);
    }

    async getMessagesByConversation(
        workspaceId: string,
        conversationId: string,
        cursor?: string,
        limit = 50
    ): Promise<MessagePage> {
        // Build params in order: $1=workspaceId, $2=conversationId, $3=limit+1, $4=cursor (optional)
        const params: any[] = [workspaceId, conversationId, limit + 1];
        let cursorClause = '';

        if (cursor) {
            cursorClause = 'AND m.created_at < $4';
            params.push(new Date(cursor));
        }

        const result = await pool.query<WorkspaceMessage>(
            `SELECT
                m.*,
                u.display_name AS sender_name
             FROM workspace_messages m
             LEFT JOIN users u ON u.id = m.sender_id
             WHERE m.workspace_id = $1
               AND m.conversation_id = $2
               AND m.deleted_at IS NULL
               ${cursorClause}
             ORDER BY m.created_at DESC
             LIMIT $3`,
            params
        );

        const rows = result.rows;
        const has_more = rows.length > limit;
        const messages = has_more ? rows.slice(0, limit) : rows;
        const next_cursor = has_more ? messages[messages.length - 1].created_at.toISOString() : null;

        return {
            messages: messages.reverse(), // return chronological order
            next_cursor,
            has_more,
        };
    }

    /**
     * Get a single message by ID (for thread parent lookups).
     */
    async getMessageById(messageId: string): Promise<WorkspaceMessage | null> {
        const result = await pool.query<WorkspaceMessage>(
            `SELECT m.*, u.display_name AS sender_name
             FROM workspace_messages m
             LEFT JOIN users u ON u.id = m.sender_id
             WHERE m.id = $1 AND m.deleted_at IS NULL`,
            [messageId]
        );
        return result.rows[0] || null;
    }

    /**
     * Soft-delete a message (GDPR compliant).
     */
    async deleteMessage(messageId: string, requestingUserId: string): Promise<boolean> {
        const result = await pool.query(
            `UPDATE workspace_messages
       SET deleted_at = NOW(), content = '[Message deleted]'
       WHERE id = $1 AND sender_id = $2 AND deleted_at IS NULL
       RETURNING id`,
            [messageId, requestingUserId]
        );
        return (result.rowCount ?? 0) > 0;
    }

    /**
     * Edit an existing message. Only the original author can edit.
     */
    async editMessage(
        messageId: string,
        requestingUserId: string,
        newContent: string
    ): Promise<WorkspaceMessage | null> {
        const result = await pool.query<WorkspaceMessage>(
            `UPDATE workspace_messages
       SET content = $3, edited_at = NOW()
       WHERE id = $1 AND sender_id = $2 AND deleted_at IS NULL
       RETURNING *`,
            [messageId, requestingUserId, newContent]
        );
        return result.rows[0] || null;
    }

    // --------------------------------------------------------------------------
    // Read Tracking
    // --------------------------------------------------------------------------

    /**
     * Mark a specific message as read by a user.
     */
    async markRead(messageId: string, userId: string): Promise<void> {
        await pool.query(
            `INSERT INTO workspace_message_reads (message_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (message_id, user_id) DO NOTHING`,
            [messageId, userId]
        );
    }

    /**
     * Mark all messages in a workspace as read up to a given timestamp.
     */
    async markAllRead(workspaceId: string, userId: string): Promise<void> {
        await pool.query(
            `INSERT INTO workspace_message_reads (message_id, user_id)
       SELECT m.id, $2
       FROM workspace_messages m
       WHERE m.workspace_id = $1
         AND m.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM workspace_message_reads r
           WHERE r.message_id = m.id AND r.user_id = $2
         )`,
            [workspaceId, userId]
        );
    }

    async markConversationRead(workspaceId: string, conversationId: string, userId: string): Promise<void> {
        await pool.query(
            `INSERT INTO workspace_message_reads (message_id, user_id)
             SELECT m.id, $3
             FROM workspace_messages m
             WHERE m.workspace_id = $1
               AND m.conversation_id = $2
               AND m.deleted_at IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM workspace_message_reads r
                   WHERE r.message_id = m.id AND r.user_id = $3
               )`,
            [workspaceId, conversationId, userId]
        );
    }

    /**
     * Get unread message count for a user in a workspace.
     */
    async getUnreadCount(workspaceId: string, userId: string): Promise<number> {
        // Only count messages sent AFTER the user joined the workspace. Without this,
        // a freshly-added member (the widget auto-adds the viewer on load) inherits every
        // historical message from others as "unread" forever — producing phantom counts.
        const result = await pool.query<{ count: string }>(
            `SELECT COUNT(*) as count
       FROM workspace_messages m
       JOIN workspace_members wm
         ON wm.workspace_id = m.workspace_id AND wm.user_id = $2
       WHERE m.workspace_id = $1
         AND m.deleted_at IS NULL
         AND m.sender_id != $2
         AND m.created_at >= wm.joined_at
         AND NOT EXISTS (
           SELECT 1 FROM workspace_message_reads r
           WHERE r.message_id = m.id AND r.user_id = $2
         )`,
            [workspaceId, userId]
        );
        return parseInt(result.rows[0].count, 10);
    }

    /**
     * Get unread counts for all workspaces a user is a member of.
     * Useful for the notification badge.
     */
    async getAllUnreadCounts(userId: string, organizationId: string): Promise<Record<string, number>> {
        const result = await pool.query<{ workspace_id: string; count: string }>(
            `SELECT 
         wm.workspace_id,
         COUNT(m.id) as count
       FROM workspace_members wm
       JOIN workspaces w ON w.id = wm.workspace_id
       JOIN workspace_messages m ON m.workspace_id = wm.workspace_id
       WHERE wm.user_id = $1
         AND w.organization_id = $2
         AND m.deleted_at IS NULL
         AND m.sender_id != $1
         AND m.created_at >= wm.joined_at
         AND NOT EXISTS (
           SELECT 1 FROM workspace_message_reads r
           WHERE r.message_id = m.id AND r.user_id = $1
         )
       GROUP BY wm.workspace_id`,
            [userId, organizationId]
        );

        const counts: Record<string, number> = {};
        for (const row of result.rows) {
            counts[row.workspace_id] = parseInt(row.count, 10);
        }
        return counts;
    }

    async getConversationUnreadCounts(workspaceId: string, userId: string): Promise<Record<string, number>> {
        const result = await pool.query<{ conversation_id: string; count: string }>(
            `SELECT
                m.conversation_id,
                COUNT(*)::text AS count
             FROM workspace_messages m
             JOIN workspace_conversation_members cm
               ON cm.conversation_id = m.conversation_id
              AND cm.user_id = $2
             WHERE m.workspace_id = $1
               AND m.deleted_at IS NULL
               AND m.sender_id != $2
               AND m.created_at >= cm.joined_at
               AND NOT EXISTS (
                   SELECT 1 FROM workspace_message_reads r
                   WHERE r.message_id = m.id AND r.user_id = $2
               )
             GROUP BY m.conversation_id`,
            [workspaceId, userId]
        );

        const counts: Record<string, number> = {};
        for (const row of result.rows) {
            counts[row.conversation_id] = parseInt(row.count, 10);
        }
        return counts;
    }
    /**
     * Search messages in a workspace by content.
     */
    async searchMessages(
        workspaceId: string,
        query: string,
        limit = 50,
        conversationId?: string
    ): Promise<WorkspaceMessage[]> {
        const params: any[] = [workspaceId, `%${query}%`, limit];
        const conversationClause = conversationId ? 'AND m.conversation_id = $4' : '';
        if (conversationId) params.push(conversationId);
        const result = await pool.query<WorkspaceMessage>(
            `SELECT 
         m.*,
         u.display_name AS sender_name
       FROM workspace_messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.workspace_id = $1
         AND m.deleted_at IS NULL
         AND m.content ILIKE $2
         ${conversationClause}
       ORDER BY m.created_at DESC
       LIMIT $3`,
            params
        );
        return result.rows;
    }

    /**
     * Export all messages in a workspace for audit purposes.
     */
        async exportMessages(workspaceId: string, conversationId?: string): Promise<WorkspaceMessage[]> {
                const params: any[] = [workspaceId];
                const conversationClause = conversationId ? 'AND m.conversation_id = $2' : '';
                if (conversationId) params.push(conversationId);
        const result = await pool.query<WorkspaceMessage>(
            `SELECT 
         m.created_at,
         m.sender_type,
         u.display_name AS sender_name,
         m.message_type,
         m.content,
         m.metadata
       FROM workspace_messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.workspace_id = $1
         AND m.deleted_at IS NULL
                 ${conversationClause}
       ORDER BY m.created_at ASC`,
                        params
        );
        return result.rows;
    }
}

export const workspaceService = new WorkspaceServiceImpl();
