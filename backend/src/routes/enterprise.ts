/**
 * Enterprise B2B Routes
 * Org Settings, Approval Chains, API Keys, Firm Analytics
 *
 * Endpoints:
 *   GET    /settings                 - Org settings & branding
 *   PUT    /settings                 - Update org settings
 *   GET    /branding                 - Public branding config (for white-label)
 *
 *   GET    /approval-chains          - List approval chains
 *   POST   /approval-chains          - Create approval chain
 *   GET    /approval-chains/:id      - Get chain with steps
 *   PUT    /approval-chains/:id      - Update chain & steps
 *   DELETE /approval-chains/:id      - Delete chain
 *   POST   /approval-requests        - Submit entity for approval
 *   GET    /approval-requests        - List approval requests
 *   GET    /approval-requests/:id    - Get request with decisions
 *   POST   /approval-requests/:id/decide - Record approval decision
 *
 *   GET    /api-keys                 - List org API keys
 *   POST   /api-keys                 - Create new API key
 *   DELETE /api-keys/:id             - Revoke API key
 *   POST   /api-keys/:id/rotate     - Rotate (revoke old + create new)
 *
 *   GET    /analytics                - Firm analytics dashboard
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { logger } from '../utils/logger';
import {
  getOrgSettings, updateOrgSettings, getOrgBranding,
  listApprovalChains, getApprovalChain, createApprovalChain, updateApprovalChain, deleteApprovalChain,
  submitForApproval, recordDecision, getApprovalRequest, listApprovalRequests,
  createApiKey, listApiKeys, revokeApiKey, rotateApiKey,
  getFirmAnalytics,
} from '../services/valuation-engine/orgSettingsService';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ════════════════════════════════════════════════════════════════════
//  Org Settings & Branding
// ════════════════════════════════════════════════════════════════════

router.get('/settings', authorize('org_settings', 'read'), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    if (!orgId) return res.status(400).json({ error: 'No organization context' });

    const settings = await getOrgSettings(orgId);
    if (!settings) return res.status(404).json({ error: 'Organization not found' });

    res.json(settings);
  } catch (err: any) {
    logger.error('Failed to get org settings', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.put('/settings', authorize('org_settings', 'manage'), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    if (!orgId) return res.status(400).json({ error: 'No organization context' });

    const updated = await updateOrgSettings(orgId, req.body);
    if (!updated) return res.status(404).json({ error: 'Organization not found' });

    logger.info(`Org settings updated for ${orgId}`);
    res.json(updated);
  } catch (err: any) {
    logger.error('Failed to update org settings', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

router.get('/branding', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    if (!orgId) return res.status(400).json({ error: 'No organization context' });

    const branding = await getOrgBranding(orgId);
    if (!branding) return res.status(404).json({ error: 'Organization not found' });

    res.json(branding);
  } catch (err: any) {
    logger.error('Failed to get branding', err);
    res.status(500).json({ error: 'Failed to fetch branding' });
  }
});

// ════════════════════════════════════════════════════════════════════
//  Approval Chains
// ════════════════════════════════════════════════════════════════════

router.get('/approval-chains', authorize('approval_chain', 'read'), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    if (!orgId) return res.status(400).json({ error: 'No organization context' });

    const chains = await listApprovalChains(orgId);
    res.json(chains);
  } catch (err: any) {
    logger.error('Failed to list approval chains', err);
    res.status(500).json({ error: 'Failed to fetch approval chains' });
  }
});

router.post('/approval-chains', authorize('approval_chain', 'manage'), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;
    if (!orgId) return res.status(400).json({ error: 'No organization context' });

    const { name, description, entity_type, steps } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return res.status(400).json({ error: 'At least one step is required' });
    }

    const chain = await createApprovalChain(orgId, { name, description, entity_type, steps }, userId);
    logger.info(`Approval chain created: ${chain.id} for org ${orgId}`);
    res.status(201).json(chain);
  } catch (err: any) {
    if (err.code === '23505') return res.status(409).json({ error: 'Chain name already exists' });
    logger.error('Failed to create approval chain', err);
    res.status(500).json({ error: 'Failed to create approval chain' });
  }
});

router.get('/approval-chains/:id', authorize('approval_chain', 'read'), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    if (!orgId) return res.status(400).json({ error: 'No organization context' });

    const chain = await getApprovalChain(req.params.id, orgId);
    if (!chain) return res.status(404).json({ error: 'Approval chain not found' });

    res.json(chain);
  } catch (err: any) {
    logger.error('Failed to get approval chain', err);
    res.status(500).json({ error: 'Failed to fetch approval chain' });
  }
});

router.put('/approval-chains/:id', authorize('approval_chain', 'manage'), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    if (!orgId) return res.status(400).json({ error: 'No organization context' });

    const updated = await updateApprovalChain(req.params.id, orgId, req.body);
    if (!updated) return res.status(404).json({ error: 'Approval chain not found' });

    logger.info(`Approval chain updated: ${req.params.id}`);
    res.json(updated);
  } catch (err: any) {
    logger.error('Failed to update approval chain', err);
    res.status(500).json({ error: 'Failed to update approval chain' });
  }
});

router.delete('/approval-chains/:id', authorize('approval_chain', 'manage'), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    if (!orgId) return res.status(400).json({ error: 'No organization context' });

    const deleted = await deleteApprovalChain(req.params.id, orgId);
    if (!deleted) return res.status(404).json({ error: 'Approval chain not found' });

    logger.info(`Approval chain deleted: ${req.params.id}`);
    res.json({ success: true });
  } catch (err: any) {
    if (err.message?.includes('active approval requests')) {
      return res.status(409).json({ error: err.message });
    }
    logger.error('Failed to delete approval chain', err);
    res.status(500).json({ error: 'Failed to delete approval chain' });
  }
});

// ════════════════════════════════════════════════════════════════════
//  Approval Requests
// ════════════════════════════════════════════════════════════════════

router.post('/approval-requests', authorize('approval_chain', 'read'), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;
    if (!orgId) return res.status(400).json({ error: 'No organization context' });

    const { chain_id, entity_type, entity_id } = req.body;
    if (!chain_id || !entity_type || !entity_id) {
      return res.status(400).json({ error: 'chain_id, entity_type, and entity_id are required' });
    }

    const request = await submitForApproval(chain_id, entity_type, entity_id, orgId, userId);
    logger.info(`Approval request submitted: ${request.id}`);
    res.status(201).json(request);
  } catch (err: any) {
    logger.error('Failed to submit for approval', err);
    res.status(500).json({ error: 'Failed to submit for approval' });
  }
});

router.get('/approval-requests', authorize('approval_chain', 'read'), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    if (!orgId) return res.status(400).json({ error: 'No organization context' });

    const requests = await listApprovalRequests(orgId, {
      status: req.query.status as string,
      entity_type: req.query.entity_type as string,
    });
    res.json(requests);
  } catch (err: any) {
    logger.error('Failed to list approval requests', err);
    res.status(500).json({ error: 'Failed to fetch approval requests' });
  }
});

router.get('/approval-requests/:id', authorize('approval_chain', 'read'), async (req: Request, res: Response) => {
  try {
    const request = await getApprovalRequest(req.params.id);
    if (!request) return res.status(404).json({ error: 'Approval request not found' });

    res.json(request);
  } catch (err: any) {
    logger.error('Failed to get approval request', err);
    res.status(500).json({ error: 'Failed to fetch approval request' });
  }
});

router.post('/approval-requests/:id/decide', authorize('approval_chain', 'decide'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { step_id, decision, comments } = req.body;

    if (!step_id || !decision) {
      return res.status(400).json({ error: 'step_id and decision are required' });
    }
    if (!['approved', 'rejected', 'escalated', 'deferred'].includes(decision)) {
      return res.status(400).json({ error: 'Invalid decision. Must be: approved, rejected, escalated, or deferred' });
    }

    const result = await recordDecision(req.params.id, step_id, decision, userId, comments);
    logger.info(`Approval decision: ${decision} on request ${req.params.id} at step ${result.step_order}`);
    res.json(result);
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    logger.error('Failed to record decision', err);
    res.status(500).json({ error: 'Failed to record decision' });
  }
});

// ════════════════════════════════════════════════════════════════════
//  API Key Management
// ════════════════════════════════════════════════════════════════════

router.get('/api-keys', authorize('api_key', 'read'), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    if (!orgId) return res.status(400).json({ error: 'No organization context' });

    const keys = await listApiKeys(orgId);
    res.json(keys);
  } catch (err: any) {
    logger.error('Failed to list API keys', err);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

router.post('/api-keys', authorize('api_key', 'manage'), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;
    if (!orgId) return res.status(400).json({ error: 'No organization context' });

    const { name, scopes, rate_limit_per_minute, rate_limit_per_day, allowed_ips, expires_at } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const key = await createApiKey(orgId, name, userId, {
      scopes, rate_limit_per_minute, rate_limit_per_day, allowed_ips, expires_at
    });

    logger.info(`API key created: ${key.key_prefix}... for org ${orgId}`);
    // ⚠️ Full key is returned ONLY on creation
    res.status(201).json(key);
  } catch (err: any) {
    logger.error('Failed to create API key', err);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

router.delete('/api-keys/:id', authorize('api_key', 'manage'), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;
    if (!orgId) return res.status(400).json({ error: 'No organization context' });

    const revoked = await revokeApiKey(req.params.id, orgId, userId);
    if (!revoked) return res.status(404).json({ error: 'API key not found or already revoked' });

    logger.info(`API key revoked: ${req.params.id}`);
    res.json({ success: true });
  } catch (err: any) {
    logger.error('Failed to revoke API key', err);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

router.post('/api-keys/:id/rotate', authorize('api_key', 'manage'), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    const userId = (req as any).user?.id;
    if (!orgId) return res.status(400).json({ error: 'No organization context' });

    const newKey = await rotateApiKey(req.params.id, orgId, userId);
    logger.info(`API key rotated: ${req.params.id} → ${newKey.key_prefix}...`);
    // ⚠️ Full key is returned ONLY on rotation
    res.json(newKey);
  } catch (err: any) {
    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    logger.error('Failed to rotate API key', err);
    res.status(500).json({ error: 'Failed to rotate API key' });
  }
});

// ════════════════════════════════════════════════════════════════════
//  Firm Analytics Dashboard
// ════════════════════════════════════════════════════════════════════

router.get('/analytics', authorize('firm_analytics', 'read'), async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user?.organizationId;
    if (!orgId) return res.status(400).json({ error: 'No organization context' });

    const period = (req.query.period as string) || '30d';
    if (!['7d', '30d', '90d', '1y'].includes(period)) {
      return res.status(400).json({ error: 'Invalid period. Must be 7d, 30d, 90d, or 1y' });
    }

    const analytics = await getFirmAnalytics(orgId, period);
    res.json(analytics);
  } catch (err: any) {
    logger.error('Failed to get firm analytics', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;
