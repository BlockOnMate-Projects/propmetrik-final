/**
 * Kobby AI REST Routes
 *
 * HTTP endpoints for Kobby AI assistant interactions.
 * These are the REST-based fallback + context pre-fetch routes.
 * Real-time queries flow through the WebSocket server instead.
 *
 * Mounted at: /api/v1/ai/kobby
 *
 * @module routes/kobbyAI
 */

import { Router, Request, Response, NextFunction } from 'express';
import { kobbyAIService, EntityType } from '../../shared-services/workspace/KobbyAIService';
import { workspaceService } from '../../shared-services/workspace/WorkspaceService';
import { logger } from '../utils/logger';
import { authenticate } from '../middleware/auth';

const router = Router();

// Apply auth middleware to all Kobby AI routes
router.use(authenticate);

const getUser = (req: Request) => {
    const user = (req as any).user;
    if (!user?.id) {
        throw Object.assign(new Error('Authentication required'), { status: 401 });
    }
    return { userId: user.id as string, organizationId: (user.organizationId || user.organization_id) as string };
};

const asyncHandler = (fn: (req: Request, res: Response) => Promise<any>) =>
    (req: Request, res: Response, next: NextFunction) =>
        Promise.resolve(fn(req, res)).catch(next);

// ============================================================================
// CONTEXT PRE-FETCH
// ============================================================================

/**
 * GET /api/v1/ai/kobby/context/:entityType/:entityId
 * Pre-fetch entity context (used by frontend to warm up Kobby state).
 */
router.get(
    '/context/:entityType/:entityId',
    asyncHandler(async (req, res) => {
        const { userId, organizationId } = getUser(req);
        const { entityType, entityId } = req.params;

        const validTypes: EntityType[] = ['project', 'valuation', 'deal', 'property', 'platform'];
        if (!validTypes.includes(entityType as EntityType)) {
            return res.status(400).json({ error: 'Invalid entity type' });
        }

        // Ensure workspace exists so we have a workspaceId
        const workspace = await workspaceService.ensureWorkspace(
            entityType as EntityType,
            entityId,
            organizationId
        );

        const context = await kobbyAIService.buildContext(
            entityType as EntityType,
            entityId,
            workspace.id
        );

        // Don't expose recent messages in the REST response (sensitive)
        const { recentMessages: _, ...publicContext } = context;

        res.json({
            success: true,
            context: publicContext,
        });
    })
);

// ============================================================================
// QUERY ENDPOINT (REST fallback)
// ============================================================================

/**
 * POST /api/v1/ai/kobby/query
 * Send a query to Kobby AI and get a response via REST.
 * Primary path is WebSocket; this is the fallback for mobile/API clients.
 *
 * Body: { workspaceId, query, entityType, entityId, sessionId? }
 */
router.post(
    '/query',
    asyncHandler(async (req, res) => {
        const { userId } = getUser(req);
        const { workspaceId, query, entityType, entityId, sessionId } = req.body;

        if (!query?.trim()) {
            return res.status(400).json({ error: 'query is required' });
        }
        if (!entityType || !entityId || !workspaceId) {
            return res.status(400).json({ error: 'workspaceId, entityType, entityId are required' });
        }

        const validTypes: EntityType[] = ['project', 'valuation', 'deal', 'property', 'platform'];
        if (!validTypes.includes(entityType as EntityType)) {
            return res.status(400).json({ error: 'Invalid entity type' });
        }

        // Validate workspace membership
        const isMember = await workspaceService.isMember(workspaceId, userId);
        if (!isMember) {
            return res.status(403).json({ error: 'Not a member of this workspace' });
        }

        // Build context and query
        const context = await kobbyAIService.buildContext(
            entityType as EntityType,
            entityId,
            workspaceId
        );

        const response = await kobbyAIService.query(query, context, sessionId);
        const defaultConversation = await workspaceService.getDefaultConversation(workspaceId);

        // Persist the AI response as a workspace message so it shows in chat
        const savedMessage = await workspaceService.persistMessage({
            workspaceId,
            conversationId: defaultConversation.id,
            senderId: null,
            senderType: 'kobby_ai',
            messageType: 'ai_response',
            content: response.answer,
            metadata: {
                query,
                confidence: response.confidence,
                sources: response.sources,
                followUpSuggestions: response.followUpSuggestions,
                dataPoints: response.dataPoints,
            },
        });

        res.json({
            success: true,
            response,
            message: savedMessage,
        });
    })
);

// ============================================================================
// SUGGESTIONS (quick-access prompts per entity type)
// ============================================================================

/**
 * GET /api/v1/ai/kobby/suggestions/:entityType
 * Get pre-built question suggestions for an entity type.
 */
router.get(
    '/suggestions/:entityType',
    asyncHandler(async (req, res) => {
        const { entityType } = req.params;

        const suggestions: Record<string, string[]> = {
            project: [
                'Which phases are behind schedule?',
                'How much of our budget has been spent?',
                'Summarize this week\'s site activity',
                'Which contractor has the lowest progress?',
                'What are the current risk flags for this project?',
                'Generate a project status summary for the team',
            ],
            valuation: [
                'What is the final market value?',
                'Summarize the key risk flags in this valuation',
                'Show me the top comparable properties used',
                'Are property prices trending up in this area?',
                'What was the methodology used for this valuation?',
            ],
            deal: [
                'Where is this deal in the pipeline?',
                'What is the deal value and probability?',
                'How long has this deal been open?',
                'What are the next steps to close this deal?',
                'Has there been any recent activity on this deal?',
            ],
            property: [
                'What is the current occupancy rate?',
                'How many open maintenance requests are there?',
                'Is our rent competitive with the market?',
                'When do the current leases expire?',
                'Summarize tenant issues for this property',
            ],
            platform: [
                'What are the latest market trends?',
                'How many active projects does our organization have?',
                'Summarize recent activity across all workspaces',
                'What are the top performing properties?',
                'Show me a summary of our portfolio performance',
            ],
        };

        const entitySuggestions = suggestions[entityType] || [];
        res.json({ suggestions: entitySuggestions });
    })
);

// ============================================================================
// ERROR HANDLER
// ============================================================================

router.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Kobby AI route error', { error: err.message });
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

export default router;
