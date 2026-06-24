/**
 * Workspace REST API Routes
 *
 * Handles all HTTP-based workspace operations:
 * - Workspace lifecycle (get or create per entity)
 * - Membership management
 * - Message history (cursor paginated)
 * - File listing
 * - Unread counts
 *
 * Mounted at: /api/v1/workspace
 *
 * @module routes/workspace
 */

import { Router, Request, Response, NextFunction } from 'express';
import { workspaceService, EntityType, MemberRole } from '../../shared-services/workspace/WorkspaceService';
import { workspaceWebSocketServer } from '../../shared-services/workspace/WorkspaceWebSocketServer';
import { documentService } from '../../shared-services/workspace/documentService';
import { pool } from '../database';
import { logger } from '../utils/logger';

const router = Router();

// Auth is applied at mount level in index.ts — no need to duplicate here

// Helper to get user context from JWT middleware
const getUser = (req: Request) => {
    const user = (req as any).user;
    if (!user?.id) {
        throw Object.assign(new Error('Authentication required'), { status: 401 });
    }
    return {
        userId: user.id as string,
        organizationId: (user.organizationId || user.organization_id) as string,
    };
};

const asyncHandler = (fn: (req: Request, res: Response) => Promise<any>) =>
    (req: Request, res: Response, next: NextFunction) =>
        Promise.resolve(fn(req, res)).catch(next);

// ============================================================================
// WORKSPACE LIFECYCLE
// ============================================================================

// NOTE: The GET /:entityType/:entityId route is defined AFTER all specific
// routes (messages, members, search, etc.) to avoid catching them as
// entityType/entityId params. See bottom of file.

// ============================================================================
// MESSAGES
// ============================================================================

/**
 * GET /api/v1/workspace/:workspaceId/conversations
 * List conversations the current user can access.
 */
router.get(
    '/:workspaceId/conversations',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId } = req.params;

        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

        const isMember = await workspaceService.isMember(workspaceId, userId);
        if (!isMember) return res.status(403).json({ error: 'Access denied' });

        const conversations = await workspaceService.listConversations(workspaceId, userId);
        res.json({ conversations });
    })
);

/**
 * GET /api/v1/workspace/:workspaceId/conversations/unread
 * Per-conversation unread counts for current user.
 */
router.get(
    '/:workspaceId/conversations/unread',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId } = req.params;

        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

        const isMember = await workspaceService.isMember(workspaceId, userId);
        if (!isMember) return res.status(403).json({ error: 'Access denied' });

        const counts = await workspaceService.getConversationUnreadCounts(workspaceId, userId);
        res.json({ counts });
    })
);

/**
 * PATCH /api/v1/workspace/:workspaceId/conversations/:conversationId
 * Rename group/channel conversation.
 */
router.patch(
    '/:workspaceId/conversations/:conversationId',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId, conversationId } = req.params;
        const { name } = req.body as { name?: string };

        if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

        try {
            const conversation = await workspaceService.renameConversation(workspaceId, conversationId, userId, name.trim());
            if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
            return res.json({ conversation });
        } catch (err: any) {
            return res.status(403).json({ error: err.message || 'Access denied' });
        }
    })
);

/**
 * POST /api/v1/workspace/:workspaceId/conversations/:conversationId/leave
 * Leave DM/group conversation.
 */
router.post(
    '/:workspaceId/conversations/:conversationId/leave',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId, conversationId } = req.params;

        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

        try {
            const left = await workspaceService.leaveConversation(workspaceId, conversationId, userId);
            if (!left) return res.status(404).json({ error: 'Conversation not found or user not a member' });
            return res.json({ success: true });
        } catch (err: any) {
            return res.status(400).json({ error: err.message || 'Unable to leave conversation' });
        }
    })
);

/**
 * POST /api/v1/workspace/:workspaceId/conversations/:conversationId/archive
 * Archive a group conversation.
 */
router.post(
    '/:workspaceId/conversations/:conversationId/archive',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId, conversationId } = req.params;

        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

        try {
            const archived = await workspaceService.archiveConversation(workspaceId, conversationId, userId);
            if (!archived) return res.status(404).json({ error: 'Conversation not found' });
            return res.json({ success: true });
        } catch (err: any) {
            return res.status(403).json({ error: err.message || 'Access denied' });
        }
    })
);

/**
 * GET /api/v1/workspace/:workspaceId/conversations/:conversationId/members
 */
router.get(
    '/:workspaceId/conversations/:conversationId/members',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId, conversationId } = req.params;

        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

        const isConversationMember = await workspaceService.isConversationMember(conversationId, userId);
        if (!isConversationMember) return res.status(403).json({ error: 'Access denied to this conversation' });

        const members = await workspaceService.getConversationMembers(conversationId);
        res.json({ members });
    })
);

/**
 * POST /api/v1/workspace/:workspaceId/conversations/:conversationId/members
 * Add member to existing group.
 */
router.post(
    '/:workspaceId/conversations/:conversationId/members',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId, conversationId } = req.params;
        const { userId: targetUserId } = req.body as { userId?: string };

        if (!targetUserId) return res.status(400).json({ error: 'userId is required' });

        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

        try {
            const added = await workspaceService.addConversationMember(workspaceId, conversationId, userId, targetUserId);
            if (!added) return res.status(200).json({ success: true, message: 'User already in conversation' });
            return res.status(201).json({ success: true });
        } catch (err: any) {
            return res.status(403).json({ error: err.message || 'Access denied' });
        }
    })
);

/**
 * DELETE /api/v1/workspace/:workspaceId/conversations/:conversationId/members/:targetUserId
 * Remove member from existing group.
 */
router.delete(
    '/:workspaceId/conversations/:conversationId/members/:targetUserId',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId, conversationId, targetUserId } = req.params;

        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

        try {
            const removed = await workspaceService.removeConversationMember(workspaceId, conversationId, userId, targetUserId);
            if (!removed) return res.status(404).json({ error: 'User not in conversation' });
            return res.json({ success: true });
        } catch (err: any) {
            return res.status(403).json({ error: err.message || 'Access denied' });
        }
    })
);

/**
 * POST /api/v1/workspace/:workspaceId/conversations/:conversationId/read
 * Mark a conversation as read.
 */
router.post(
    '/:workspaceId/conversations/:conversationId/read',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId, conversationId } = req.params;

        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

        const isConversationMember = await workspaceService.isConversationMember(conversationId, userId);
        if (!isConversationMember) return res.status(403).json({ error: 'Access denied to this conversation' });

        await workspaceService.markConversationRead(workspaceId, conversationId, userId);
        res.json({ success: true });
    })
);

/**
 * POST /api/v1/workspace/:workspaceId/conversations/dm
 * Create or get a DM conversation with another member.
 */
router.post(
    '/:workspaceId/conversations/dm',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId } = req.params;
        const { memberId } = req.body;

        if (!memberId) {
            return res.status(400).json({ error: 'memberId is required' });
        }

        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

        const [isMember, targetIsMember] = await Promise.all([
            workspaceService.isMember(workspaceId, userId),
            workspaceService.isMember(workspaceId, memberId),
        ]);

        if (!isMember || !targetIsMember) {
            return res.status(403).json({ error: 'Both users must be workspace members' });
        }

        const conversation = await workspaceService.createOrGetDMConversation(workspaceId, userId, memberId);
        // Surface the new DM in BOTH users' conversation lists live.
        workspaceWebSocketServer.broadcastConversationCreated(conversation.id).catch(() => {});
        // Return it with the actor's viewer-relative name (the other person).
        const enriched = await workspaceService.getConversationForViewer(conversation.id, userId);
        res.status(201).json({ conversation: enriched || conversation });
    })
);

/**
 * POST /api/v1/workspace/:workspaceId/conversations/group
 * Create a new private group conversation.
 */
router.post(
    '/:workspaceId/conversations/group',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId } = req.params;
        const { name, memberIds } = req.body as { name?: string; memberIds?: string[] };

        if (!name?.trim()) {
            return res.status(400).json({ error: 'name is required' });
        }
        if (!Array.isArray(memberIds) || memberIds.length === 0) {
            return res.status(400).json({ error: 'memberIds must be a non-empty array' });
        }

        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

        const isMember = await workspaceService.isMember(workspaceId, userId);
        if (!isMember) return res.status(403).json({ error: 'Access denied' });

        const uniqueIds = Array.from(new Set(memberIds));
        for (const memberId of uniqueIds) {
            const ok = await workspaceService.isMember(workspaceId, memberId);
            if (!ok) {
                return res.status(400).json({ error: `User ${memberId} is not a workspace member` });
            }
        }

        const conversation = await workspaceService.createGroupConversation(workspaceId, userId, name.trim(), uniqueIds);
        // Surface the new group in every member's conversation list live.
        workspaceWebSocketServer.broadcastConversationCreated(conversation.id).catch(() => {});
        res.status(201).json({ conversation });
    })
);

/**
 * POST /api/v1/workspace/:workspaceId/conversations/channel
 * Create a named channel open to every current workspace member.
 */
router.post(
    '/:workspaceId/conversations/channel',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId } = req.params;
        const { name } = req.body as { name?: string };

        if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

        const isMember = await workspaceService.isMember(workspaceId, userId);
        if (!isMember) return res.status(403).json({ error: 'Access denied' });

        const conversation = await workspaceService.createChannel(workspaceId, userId, name.trim());
        // Surface the new channel in every member's conversation list live.
        workspaceWebSocketServer.broadcastConversationCreated(conversation.id).catch(() => {});
        res.status(201).json({ conversation });
    })
);

/**
 * GET /api/v1/workspace/:id/messages
 * Get paginated messages (cursor-based).
 */
router.get(
    '/:workspaceId/messages',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId } = req.params;
        const conversationId = req.query.conversationId as string | undefined;
        const cursor = req.query.cursor as string | undefined;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

        // Validate workspace access
        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) {
            return res.status(404).json({ error: 'Workspace not found' });
        }

        const isMember = await workspaceService.isMember(workspaceId, userId);
        if (!isMember) {
            return res.status(403).json({ error: 'Not a member of this workspace' });
        }

        if (conversationId) {
            const isConversationMember = await workspaceService.isConversationMember(conversationId, userId);
            if (!isConversationMember) {
                return res.status(403).json({ error: 'Access denied to this conversation' });
            }
        }

        const page = conversationId
            ? await workspaceService.getMessagesByConversation(workspaceId, conversationId, cursor, limit)
            : await workspaceService.getMessages(workspaceId, cursor, limit);

        // Mark as read
        if (conversationId) {
            await workspaceService.markConversationRead(workspaceId, conversationId, userId);
        } else {
            await workspaceService.markAllRead(workspaceId, userId);
        }

        res.json(page);
    })
);

/**
 * POST /api/v1/workspace/:id/messages
 * Send a message (REST fallback for non-WS clients).
 */
router.post(
    '/:workspaceId/messages',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId } = req.params;
        const { content, threadId, metadata, conversationId } = req.body;

        if (!content?.trim()) {
            return res.status(400).json({ error: 'Message content is required' });
        }

        if (content.length > 10000) {
            return res.status(400).json({ error: 'Message too long. Maximum 10,000 characters allowed.' });
        }

        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) {
            return res.status(404).json({ error: 'Workspace not found' });
        }

        const canWrite = await workspaceService.canWrite(workspaceId, userId);
        if (!canWrite) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        let resolvedConversationId = conversationId as string | undefined;
        if (!resolvedConversationId) {
            const conversations = await workspaceService.listConversations(workspaceId, userId);
            resolvedConversationId = conversations.find((c) => c.conversation_type === 'channel' && c.name === 'General')?.id;
        }

        if (!resolvedConversationId) {
            return res.status(400).json({ error: 'conversationId is required' });
        }

        const isConversationMember = await workspaceService.isConversationMember(resolvedConversationId, userId);
        if (!isConversationMember) {
            return res.status(403).json({ error: 'Access denied to this conversation' });
        }

        const message = await workspaceService.persistMessage({
            workspaceId,
            conversationId: resolvedConversationId,
            senderId: userId,
            senderType: 'user',
            messageType: 'text',
            content,
            threadId,
            metadata,
        });

        res.status(201).json({ message });
    })
);

/**
 * PATCH /api/v1/workspace/:workspaceId/messages/:messageId
 * Edit a message (only the original author can edit).
 */
router.patch(
    '/:workspaceId/messages/:messageId',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId, messageId } = req.params;
        const { content } = req.body;

        if (!content?.trim()) {
            return res.status(400).json({ error: 'Message content is required' });
        }
        if (content.length > 10000) {
            return res.status(400).json({ error: 'Message too long. Maximum 10,000 characters allowed.' });
        }

        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) {
            return res.status(404).json({ error: 'Workspace not found' });
        }

        const updated = await workspaceService.editMessage(messageId, userId, content.trim());
        if (!updated) {
            return res.status(404).json({ error: 'Message not found or you are not the author' });
        }

        res.json({ message: updated });
    })
);

/**
 * DELETE /api/v1/workspace/:workspaceId/messages/:messageId
 * Soft-delete a message (only the original author can delete).
 */
router.delete(
    '/:workspaceId/messages/:messageId',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId, messageId } = req.params;

        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) {
            return res.status(404).json({ error: 'Workspace not found' });
        }

        const deleted = await workspaceService.deleteMessage(messageId, userId);
        if (!deleted) {
            return res.status(404).json({ error: 'Message not found or you are not the author' });
        }

        res.json({ success: true });
    })
);

/**
 * GET /api/v1/workspace/:workspaceId/messages/:messageId
 * Get a single message by ID (for thread/reply parent lookups).
 */
router.get(
    '/:workspaceId/messages/:messageId',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId, messageId } = req.params;

        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) {
            return res.status(404).json({ error: 'Workspace not found' });
        }

        const isMember = await workspaceService.isMember(workspaceId, userId);
        if (!isMember) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const message = await workspaceService.getMessageById(messageId);
        if (!message || message.workspace_id !== workspaceId) {
            return res.status(404).json({ error: 'Message not found' });
        }

        res.json({ message });
    })
);

// ============================================================================
// MEMBERS
// ============================================================================

/**
 * GET /api/v1/workspace/:id/members
 * List all workspace members.
 */
router.get(
    '/:workspaceId/members',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId } = req.params;

        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

        const isMember = await workspaceService.isMember(workspaceId, userId);
        if (!isMember) return res.status(403).json({ error: 'Access denied' });

        const members = await workspaceService.getMembers(workspaceId);
        res.json({ members });
    })
);

/**
 * POST /api/v1/workspace/:id/members
 * Add a member to the workspace.
 */
router.post(
    '/:workspaceId/members',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId } = req.params;
        const { user_id: targetUserId, role = 'member' } = req.body;

        if (!targetUserId) {
            return res.status(400).json({ error: 'user_id is required' });
        }

        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

        // Only admins or original members can add others (simplified: any member can add)
        const isMember = await workspaceService.isMember(workspaceId, userId);
        if (!isMember) return res.status(403).json({ error: 'Access denied' });

        const validRoles: MemberRole[] = ['admin', 'member', 'viewer'];
        if (!validRoles.includes(role as MemberRole)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        const member = await workspaceService.addMember(workspaceId, targetUserId, role as MemberRole);
        res.status(201).json({ member });
    })
);

/**
 * DELETE /api/v1/workspace/:id/members/:userId
 * Remove a member from the workspace.
 */
router.delete(
    '/:workspaceId/members/:targetUserId',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId, targetUserId } = req.params;

        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

        // Can only remove yourself or if you are an admin
        if (targetUserId !== userId) {
            // TODO: Check if userId is admin for more strict RBAC
            const isMember = await workspaceService.isMember(workspaceId, userId);
            if (!isMember) return res.status(403).json({ error: 'Access denied' });
        }

        const removed = await workspaceService.removeMember(workspaceId, targetUserId);
        if (!removed) return res.status(404).json({ error: 'Member not found' });

        res.json({ success: true });
    })
);

// ============================================================================
// FILES
// ============================================================================

/**
 * POST /api/v1/workspace/:id/files/presigned-url
 * Generate an S3 presigned URL for direct upload from the browser.
 */
/**
 * Search workspace messages
 */
router.get(
    '/:workspaceId/search',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId } = req.params;
        const { q } = req.query;
        const conversationId = req.query.conversationId as string | undefined;

        if (!q || typeof q !== 'string') {
            return res.status(400).json({ error: 'Search query "q" is required' });
        }

        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

        const isMember = await workspaceService.isMember(workspaceId, userId);
        if (!isMember) return res.status(403).json({ error: 'Access denied' });

        if (conversationId) {
            const isConversationMember = await workspaceService.isConversationMember(conversationId, userId);
            if (!isConversationMember) return res.status(403).json({ error: 'Access denied to this conversation' });
        }

        const results = await workspaceService.searchMessages(workspaceId, q, 50, conversationId);

        res.json({ results });
    })
);

/**
 * Export workspace chat history to CSV
 */
router.get(
    '/:workspaceId/export',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId } = req.params;
        const conversationId = req.query.conversationId as string | undefined;

        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

        const isMember = await workspaceService.isMember(workspaceId, userId);
        if (!isMember) return res.status(403).json({ error: 'Access denied' });

        if (conversationId) {
            const isConversationMember = await workspaceService.isConversationMember(conversationId, userId);
            if (!isConversationMember) return res.status(403).json({ error: 'Access denied to this conversation' });
        }

        const messages = await workspaceService.exportMessages(workspaceId, conversationId);

        // Simple CSV generation
        let csv = 'Timestamp,Sender Type,Sender Name,Message Type,Content\n';
        for (const m of messages) {
            const row = [
                m.created_at.toISOString(),
                m.sender_type,
                m.sender_name || 'System',
                m.message_type,
                `"${m.content.replace(/"/g, '""')}"` // Escape quotes
            ];
            csv += row.join(',') + '\n';
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=workspace-export-${workspaceId}-${Date.now()}.csv`);
        res.status(200).send(csv);
    })
);

router.post(
    '/:workspaceId/files/presigned-url',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId } = req.params;
        const { fileName, fileType } = req.body;

        if (!fileName || !fileType) {
            return res.status(400).json({ error: 'fileName and fileType are required' });
        }

        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

        const isMember = await workspaceService.isMember(workspaceId, userId);
        if (!isMember) return res.status(403).json({ error: 'Access denied' });

        // Generate a safe object key: workspaces/{orgId}/{wsId}/{timestamp}-{filename}
        const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileKey = `workspaces/${organizationId}/${workspaceId}/${Date.now()}-${safeName}`;

        const presignedUrl = await documentService.generatePresignedUrl(fileKey, fileType);

        res.json({
            presignedUrl,
            fileKey,
            fileName: safeName,
            fileType,
        });
    })
);

/**
 * POST /api/v1/workspace/:id/files
 * Save uploaded file metadata to the database after successful S3 upload.
 */
router.post(
    '/:workspaceId/files',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId } = req.params;
        const { fileKey, fileName, fileType, fileSize } = req.body;

        if (!fileKey || !fileName) {
            return res.status(400).json({ error: 'fileKey and fileName are required' });
        }

        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

        const isMember = await workspaceService.isMember(workspaceId, userId);
        if (!isMember) return res.status(403).json({ error: 'Access denied' });

        const result = await pool.query(
            `INSERT INTO workspace_files 
             (workspace_id, uploader_id, file_name, file_key, file_type, file_size)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, file_name, file_key, file_type, file_size, created_at`,
            [workspaceId, userId, fileName, fileKey, fileType, fileSize || 0]
        );

        // Compute a read URL using documentService
        const fileRecord = result.rows[0];
        const downloadUrl = await documentService.getDownloadUrl(fileRecord.file_key);

        res.status(201).json({
            file: {
                ...fileRecord,
                url: downloadUrl,
            },
        });
    })
);

// ============================================================================
// UNREAD COUNTS
// ============================================================================

/**
 * GET /api/v1/workspace/unread
 * Get all unread counts for the current user (for notification badge).
 */
router.get(
    '/unread/all',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const counts = await workspaceService.getAllUnreadCounts(userId, organizationId);
        res.json({ counts });
    })
);

/**
 * POST /api/v1/workspace/:id/read
 * Mark all messages in a workspace as read.
 */
router.post(
    '/:workspaceId/read',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { workspaceId } = req.params;

        const workspace = await workspaceService.getById(workspaceId, organizationId);
        if (!workspace) return res.status(404).json({ error: 'Workspace not found' });

        await workspaceService.markAllRead(workspaceId, userId);
        res.json({ success: true });
    })
);

// ============================================================================
// WORKSPACE LIFECYCLE (catch-all — must be last GET with 2 params)
// ============================================================================

/**
 * GET /api/v1/workspace/:entityType/:entityId
 * Get or create a workspace for an entity.
 * Defined last to avoid catching /:workspaceId/messages, /members, etc.
 */
router.get(
    '/:entityType/:entityId',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { entityType } = req.params;
        let { entityId } = req.params;

        const validTypes: EntityType[] = ['project', 'valuation', 'deal', 'property', 'platform'];
        if (!validTypes.includes(entityType as EntityType)) {
            return res.status(400).json({ error: `Invalid entity type. Must be one of: ${validTypes.join(', ')}` });
        }
        if (!organizationId) {
            return res.status(403).json({ error: 'No organization on session' });
        }

        // The platform (company-wide) workspace is ALWAYS keyed to the caller's own org —
        // it's the Teams-tenant model: one workspace per organization, all members of that
        // org auto-join. We ignore any client-supplied entity_id here so a shared/global id
        // can never collapse multiple orgs into one workspace.
        if (entityType === 'platform') {
            entityId = organizationId;
        }

        const workspace = await workspaceService.ensureWorkspace(
            entityType as EntityType,
            entityId,
            organizationId
        );

        // Auto-add requesting user as member
        const isMember = await workspaceService.isMember(workspace.id, userId);
        if (!isMember) {
            await workspaceService.addMember(workspace.id, userId, 'member');
        }

        const [members, unreadCount] = await Promise.all([
            workspaceService.getMembers(workspace.id),
            workspaceService.getUnreadCount(workspace.id, userId),
        ]);

        res.json({ workspace, members, unreadCount });
    })
);

// ============================================================================
// ERROR HANDLER
// ============================================================================

router.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Workspace route error', { error: err.message });
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

export default router;
