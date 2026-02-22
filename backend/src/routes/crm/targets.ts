/**
 * CRM Targets, Achievements & Gamification Routes
 * 
 * Handles target CRUD, bulk creation, stats, leaderboard,
 * checkpoints, badges, agent achievements, and streaks.
 */

import { Router, Request, Response } from 'express';
import { getOrganizationId, asyncHandler } from './helpers';
import { targetService } from '../../services/crm-deal-management/targetService';
import { createCustomRateLimiter } from '../../middleware/rateLimiter';

const bulkRateLimiter = createCustomRateLimiter('crm_bulk_targets', { points: 5, duration: 60, blockDuration: 120 });

const router = Router();

// ──────────────────────────────────────────────
// Targets CRUD & Listing
// ──────────────────────────────────────────────

/**
 * GET /targets - Get all targets for the organization
 */
router.get('/targets', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const filters = {
        agent_id: req.query.agent_id as string,
        team_id: req.query.team_id as string,
        target_type: req.query.target_type as any,
        target_period: req.query.target_period as any,
        status: req.query.status as any,
        pacing_status: req.query.pacing_status as any,
    };

    const targets = await targetService.getAll(organizationId, filters);
    res.json({ targets });
}));

router.post('/targets', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const userId = (req as any).user?.id;

    const target = await targetService.create({
        ...req.body,
        organization_id: organizationId,
        created_by: userId,
    });

    res.status(201).json({ target });
}));

router.post('/targets/bulk', bulkRateLimiter, asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const userId = (req as any).user?.id;
    const { target_type, target_period, target_value, period_start, period_end } = req.body;

    const targets = await targetService.createBulkTargets(
        organizationId,
        target_type,
        target_period,
        target_value,
        new Date(period_start),
        new Date(period_end),
        userId
    );

    res.status(201).json({ 
        message: `Created ${targets.length} targets`,
        targets 
    });
}));

router.get('/targets/stats', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const agentId = req.query.agent_id as string;
    const stats = await targetService.getStats(organizationId, agentId);
    res.json({ stats });
}));

router.get('/targets/leaderboard', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const period = (req.query.period as 'mtd' | 'qtd' | 'ytd') || 'mtd';
    const limit = parseInt(req.query.limit as string) || 10;

    const leaderboard = await targetService.getLeaderboard(organizationId, period, limit);
    res.json({ leaderboard, period });
}));

router.get('/targets/:id', asyncHandler(async (req: Request, res: Response) => {
    const target = await targetService.getById(req.params.id);
    if (!target) {
        return res.status(404).json({ error: 'Target not found' });
    }
    res.json({ target });
}));

router.patch('/targets/:id', asyncHandler(async (req: Request, res: Response) => {
    const target = await targetService.update(req.params.id, req.body);
    if (!target) {
        return res.status(404).json({ error: 'Target not found' });
    }
    res.json({ target });
}));

router.delete('/targets/:id', asyncHandler(async (req: Request, res: Response) => {
    const deleted = await targetService.delete(req.params.id);
    if (!deleted) {
        return res.status(404).json({ error: 'Target not found' });
    }
    res.json({ message: 'Target deleted' });
}));

router.post('/targets/:id/refresh', asyncHandler(async (req: Request, res: Response) => {
    await targetService.updateProgress(req.params.id);
    const target = await targetService.getById(req.params.id);
    res.json({ target });
}));

router.get('/targets/:id/checkpoints', asyncHandler(async (req: Request, res: Response) => {
    const checkpoints = await targetService.getCheckpoints(req.params.id);
    res.json({ checkpoints });
}));

router.post('/targets/:id/checkpoints', asyncHandler(async (req: Request, res: Response) => {
    const { checkpoint_number, expected_value, actual_value, notes } = req.body;
    const checkpoint = await targetService.createCheckpoint(
        req.params.id,
        checkpoint_number,
        expected_value,
        actual_value,
        notes
    );
    res.status(201).json({ checkpoint });
}));

// ──────────────────────────────────────────────
// Achievements & Gamification
// ──────────────────────────────────────────────

router.get('/achievements/badges', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const badges = await targetService.getBadges(organizationId);
    res.json({ badges });
}));

router.get('/agents/:agentId/achievements', asyncHandler(async (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const achievements = await targetService.getAgentAchievements(req.params.agentId, limit);
    res.json({ achievements });
}));

router.get('/agents/:agentId/targets', asyncHandler(async (req: Request, res: Response) => {
    const targets = await targetService.getActiveForAgent(req.params.agentId);
    res.json({ targets });
}));

router.get('/agents/:agentId/streak', asyncHandler(async (req: Request, res: Response) => {
    const streakType = (req.query.type as string) || 'deal_close';
    const streak = await targetService.getStreak(req.params.agentId, streakType);
    res.json({ streak: streak || { current_streak: 0, longest_streak: 0 } });
}));

router.post('/targets/refresh-all', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    const count = await targetService.updateAllActiveTargets(organizationId);
    res.json({ message: `Refreshed ${count} targets` });
}));

export default router;
