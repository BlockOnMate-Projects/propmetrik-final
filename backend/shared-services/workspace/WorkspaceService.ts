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

export interface MessagePage {
    messages: WorkspaceMessage[];
    next_cursor: string | null;
    has_more: boolean;
}


// ============================================================================
// WORKSPACE SERVICE
// ============================================================================

class WorkspaceServiceImpl {

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
        const client = await pool.connect();
        try {
            // Try to find existing workspace
            const existing = await client.query<Workspace>(
                `SELECT * FROM workspaces WHERE entity_type = $1 AND entity_id = $2`,
                [entityType, entityId]
            );

            let workspace: Workspace;
            if (existing.rows.length > 0) {
                workspace = existing.rows[0];
            } else {
                // Create new workspace
                const result = await client.query<Workspace>(
                    `INSERT INTO workspaces (entity_type, entity_id, organization_id, name)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (entity_type, entity_id) DO UPDATE
               SET name = COALESCE(EXCLUDED.name, workspaces.name),
                   organization_id = COALESCE(workspaces.organization_id, EXCLUDED.organization_id)
             RETURNING *`,
                    [entityType, entityId, organizationId || null, name || null]
                );
                workspace = result.rows[0];
                logger.info(`Workspace created: ${workspace.id} for ${entityType} ${entityId}`);
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
     * Get a workspace by its id, scoped to organization.
     * Handles nullable organization_id using IS NOT DISTINCT FROM.
     */
    async getById(workspaceId: string, organizationId: string): Promise<Workspace | null> {
        const result = await pool.query<Workspace>(
            `SELECT * FROM workspaces WHERE id = $1 AND (organization_id = $2 OR organization_id IS NULL)`,
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
        const result = await pool.query<WorkspaceMember>(
            `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role
       RETURNING *`,
            [workspaceId, userId, role]
        );

        // Post system message
        await this.persistMessage({
            workspaceId,
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

    // --------------------------------------------------------------------------
    // Messages
    // --------------------------------------------------------------------------

    /**
     * Persist a message to the database and publish to Redis.
     */
    async persistMessage(params: {
        workspaceId: string;
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
         (workspace_id, sender_id, sender_type, message_type, content, metadata, thread_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
            [workspaceId, senderId, senderType, messageType, content, metadata ? JSON.stringify(metadata) : null, threadId || null]
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
        const params: any[] = [workspaceId, limit + 1]; // fetch one extra to detect has_more
        let cursorClause = '';

        if (cursor) {
            cursorClause = `AND m.created_at < $3`;
            params.push(new Date(cursor));
        }

        const result = await pool.query<WorkspaceMessage>(
            `SELECT
         m.*,
         u.display_name AS sender_name
       FROM workspace_messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.workspace_id = $1
         AND m.deleted_at IS NULL
         ${cursorClause}
       ORDER BY m.created_at DESC
       LIMIT $2`,
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

    /**
     * Get unread message count for a user in a workspace.
     */
    async getUnreadCount(workspaceId: string, userId: string): Promise<number> {
        const result = await pool.query<{ count: string }>(
            `SELECT COUNT(*) as count
       FROM workspace_messages m
       WHERE m.workspace_id = $1
         AND m.deleted_at IS NULL
         AND m.sender_id != $2
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
    /**
     * Search messages in a workspace by content.
     */
    async searchMessages(workspaceId: string, query: string, limit = 50): Promise<WorkspaceMessage[]> {
        const result = await pool.query<WorkspaceMessage>(
            `SELECT 
         m.*,
         u.display_name AS sender_name
       FROM workspace_messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.workspace_id = $1
         AND m.deleted_at IS NULL
         AND m.content ILIKE $2
       ORDER BY m.created_at DESC
       LIMIT $3`,
            [workspaceId, `%${query}%`, limit]
        );
        return result.rows;
    }

    /**
     * Export all messages in a workspace for audit purposes.
     */
    async exportMessages(workspaceId: string): Promise<WorkspaceMessage[]> {
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
       ORDER BY m.created_at ASC`,
            [workspaceId]
        );
        return result.rows;
    }
}

export const workspaceService = new WorkspaceServiceImpl();
