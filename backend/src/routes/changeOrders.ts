/**
 * Change Order Routes
 * Phase 3A Week 1 - API endpoints for Change Order management
 * 
 * Endpoints:
 * - GET /api/change-orders - List Change Orders with filters
 * - GET /api/change-orders/:id - Get Change Order by ID
 * - POST /api/change-orders - Create new Change Order
 * - PUT /api/change-orders/:id - Update Change Order
 * - POST /api/change-orders/:id/submit - Submit for review
 * - POST /api/change-orders/:id/request-approval - Request approval
 * - POST /api/change-orders/:id/sign - Sign/approve a signature line
 * - POST /api/change-orders/:id/approve - Approve Change Order
 * - POST /api/change-orders/:id/reject - Reject Change Order
 * - POST /api/change-orders/:id/execute - Execute Change Order
 * - POST /api/change-orders/:id/void - Void Change Order
 * - POST /api/change-orders/:id/items - Add line items
 * - PUT /api/change-orders/items/:itemId - Update line item
 * - DELETE /api/change-orders/items/:itemId - Delete line item
 * - GET /api/change-orders/:id/history - Get Change Order history
 * - GET /api/change-orders/stats/:projectId - Get statistics for project
 */

import { Router, Request, Response, NextFunction } from 'express';
import { 
  changeOrderService, 
  ChangeOrderFilters, 
  CreateChangeOrderInput, 
  UpdateChangeOrderInput,
  ChangeOrderItem
} from '../services/project-management/changeOrderService';
import { logger } from '../utils/logger';
import { pool, query as dbQuery } from '../database';
import { registerPMParamValidation, registerProjectAccessParams, enforceChildProjectAccess, requireProjectQueryAccess, requireProjectPermission, getAuthUserId, getAuthOrgId, requirePMWrite } from '../middleware/pmAuth';
import { validate } from '../middleware/validation';
import { createChangeOrderSchema, updateChangeOrderSchema, changeOrderLineItemSchema } from '../middleware/pmProjectValidation';

const router = Router();

// Register UUID parameter validation
registerPMParamValidation(router);
// ':id' is a change-order id — resolve its project and enforce membership.
router.param('id', enforceChildProjectAccess('change_orders'));
registerProjectAccessParams(router, ['projectId']);

// Helper to get organization ID from project
async function getOrgIdFromProject(projectId: string): Promise<string | null> {
  try {
    const result = await dbQuery(
      'SELECT organization_id FROM pm_projects WHERE id = $1',
      [projectId]
    );
    return result.rows[0]?.organization_id || null;
  } catch (error) {
    logger.error('Error getting org ID from project:', error);
    return null;
  }
}

// Helper to get default org ID (fallback)
async function getDefaultOrgId(): Promise<string> {
  const result = await dbQuery('SELECT id FROM organizations LIMIT 1');
  if (!result.rows[0]?.id) throw new Error('No organizations found in database');
  return result.rows[0].id;
}

// Helper to extract user ID from authenticated user (no header fallback)
const getUserId = (req: Request): string | undefined => {
  return (req as any).user?.id || (req as any).user?.sub;
};

// Helper to extract organization ID from authenticated user (no header fallback)
const getOrganizationId = (req: Request): string | undefined => {
  return (req as any).user?.organizationId || (req as any).user?.organization_id;
};

/**
 * GET /api/change-orders
 * List Change Orders with filters and pagination
 */
router.get('/', requireProjectQueryAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters: ChangeOrderFilters = {
      organization_id: getOrganizationId(req),
      project_id: req.query.projectId as string,
      status: req.query.status as any,
      reason: req.query.reason as any,
      co_type: req.query.coType as any,
      submitted_by: req.query.submittedBy as string,
      approved_by: req.query.approvedBy as string,
      // ?ballInCourt=me → COs awaiting the current user (their drafts, or COs
      // pending their approval as the project PM).
      ball_in_court: req.query.ballInCourt === 'me'
        ? getAuthUserId(req)
        : (req.query.ballInCourt as string) || undefined,
      phase_id: req.query.phaseId as string,
      created_from: req.query.createdFrom ? new Date(req.query.createdFrom as string) : undefined,
      created_to: req.query.createdTo ? new Date(req.query.createdTo as string) : undefined,
      min_amount: req.query.minAmount ? parseFloat(req.query.minAmount as string) : undefined,
      max_amount: req.query.maxAmount ? parseFloat(req.query.maxAmount as string) : undefined,
      search: req.query.search as string,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      sort_by: req.query.sortBy as string,
      sort_order: req.query.sortOrder as 'asc' | 'desc'
    };

    const result = await changeOrderService.getAll(filters);

    res.json({
      success: true,
      data: result.data,
      pagination: {
        total: result.total,
        limit: filters.limit,
        offset: filters.offset
      }
    });
  } catch (error) {
    logger.error('Error fetching Change Orders:', error);
    next(error);
  }
});

/**
 * GET /api/change-orders/stats/:projectId
 * Get Change Order statistics for a project
 */
router.get('/stats/:projectId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    const stats = await changeOrderService.getStats(projectId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error fetching Change Order stats:', error);
    next(error);
  }
});

/**
 * GET /api/change-orders/:id
 * Get Change Order by ID with all details
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const changeOrder = await changeOrderService.getById(id);

    if (!changeOrder) {
      return res.status(404).json({
        success: false,
        message: 'Change Order not found'
      });
    }

    res.json({
      success: true,
      data: changeOrder
    });
  } catch (error) {
    logger.error('Error fetching Change Order:', error);
    next(error);
  }
});

/**
 * GET /api/change-orders/:id/document
 * Stream the change order PDF (signed copy if e-signed, otherwise generated).
 * ?download=1 forces an attachment disposition.
 */
router.get('/:id/document', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const orgId = getAuthOrgId(req);
    const doc = await changeOrderService.getDocument(id, orgId);

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Change Order document not found' });
    }

    const disposition = req.query.download ? 'attachment' : 'inline';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="${doc.filename}"`);
    res.setHeader('Content-Length', doc.buffer.length);
    return res.end(doc.buffer);
  } catch (error) {
    logger.error('Error fetching Change Order document:', error);
    next(error);
  }
});

/**
 * DELETE /api/change-orders/:id
 * Permanently delete a change order (executed orders must be voided instead).
 */
router.delete('/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const orgId = getAuthOrgId(req);
    const result = await changeOrderService.delete(id, orgId);

    if (!result.deleted) {
      const status = result.reason === 'not_found' ? 404 : 409;
      const message = result.reason === 'executed_orders_cannot_be_deleted'
        ? 'Executed change orders cannot be deleted — void it instead.'
        : 'Change Order not found';
      return res.status(status).json({ success: false, message });
    }

    res.json({ success: true, message: 'Change Order deleted' });
  } catch (error) {
    logger.error('Error deleting Change Order:', error);
    next(error);
  }
});

/**
 * POST /api/change-orders
 * Create a new Change Order
 */
router.post('/', requirePMWrite, validate(createChangeOrderSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    
    // Check project_id first since we may need it to get org_id
    if (!req.body.project_id) {
      return res.status(400).json({
        success: false,
        message: 'Project ID is required'
      });
    }
    
    // Get organization ID from: 1) request header, 2) request body, 3) project, 4) default
    let organizationId = getOrganizationId(req) || req.body.organization_id;
    
    if (!organizationId) {
      organizationId = await getOrgIdFromProject(req.body.project_id);
    }
    
    if (!organizationId) {
      organizationId = await getDefaultOrgId();
    }

    const input: CreateChangeOrderInput = {
      organization_id: organizationId,
      project_id: req.body.project_id,
      title: req.body.title,
      description: req.body.description,
      reason: req.body.reason,
      reason_details: req.body.reason_details,
      co_type: req.body.co_type,
      original_contract_amount: req.body.original_contract_amount || 0,
      previous_changes_amount: req.body.previous_changes_amount,
      original_completion_date: req.body.original_completion_date ? new Date(req.body.original_completion_date) : undefined,
      schedule_impact_days: req.body.schedule_impact_days,
      phase_id: req.body.phase_id,
      related_rfi_id: req.body.related_rfi_id,
      attachments: req.body.attachments,
      items: req.body.items,
      signatures: req.body.signatures,
      created_by: userId
    };

    // Validation
    if (!input.title || !input.description || !input.reason) {
      return res.status(400).json({
        success: false,
        message: 'Title, description, and reason are required'
      });
    }

    const changeOrder = await changeOrderService.create(input);

    res.status(201).json({
      success: true,
      data: changeOrder,
      message: 'Change Order created successfully'
    });
  } catch (error) {
    logger.error('Error creating Change Order:', error);
    next(error);
  }
});

/**
 * PUT /api/change-orders/:id
 * Update a Change Order
 */
router.put('/:id', requirePMWrite, requireProjectPermission('can_edit'), validate(updateChangeOrderSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    const input: UpdateChangeOrderInput = {
      title: req.body.title,
      description: req.body.description,
      reason: req.body.reason,
      reason_details: req.body.reason_details,
      co_type: req.body.co_type,
      schedule_impact_days: req.body.schedule_impact_days,
      phase_id: req.body.phase_id,
      related_rfi_id: req.body.related_rfi_id,
      attachments: req.body.attachments,
      updated_by: userId
    };

    const changeOrder = await changeOrderService.update(id, input);

    res.json({
      success: true,
      data: changeOrder,
      message: 'Change Order updated successfully'
    });
  } catch (error) {
    logger.error('Error updating Change Order:', error);
    next(error);
  }
});

/**
 * POST /api/change-orders/:id/items
 * Add line items to a Change Order
 */
router.post('/:id/items', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Items array is required'
      });
    }

    const addedItems = await changeOrderService.addItems(id, items, userId || '');

    res.status(201).json({
      success: true,
      data: addedItems,
      message: 'Items added successfully'
    });
  } catch (error) {
    logger.error('Error adding Change Order items:', error);
    next(error);
  }
});

/**
 * PUT /api/change-orders/items/:itemId
 * Update a line item
 */
router.put('/items/:itemId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itemId } = req.params;
    const userId = getUserId(req);

    const item: Partial<ChangeOrderItem> = {
      description: req.body.description,
      item_type: req.body.item_type,
      quantity: req.body.quantity,
      unit: req.body.unit,
      unit_cost: req.body.unit_cost,
      markup_percentage: req.body.markup_percentage,
      cost_code: req.body.cost_code,
      notes: req.body.notes
    };

    const updatedItem = await changeOrderService.updateItem(itemId, item, userId || '');

    res.json({
      success: true,
      data: updatedItem,
      message: 'Item updated successfully'
    });
  } catch (error) {
    logger.error('Error updating Change Order item:', error);
    next(error);
  }
});

/**
 * DELETE /api/change-orders/items/:itemId
 * Delete a line item
 */
router.delete('/items/:itemId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itemId } = req.params;
    await changeOrderService.deleteItem(itemId);

    res.json({
      success: true,
      message: 'Item deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting Change Order item:', error);
    next(error);
  }
});

/**
 * POST /api/change-orders/:id/submit
 * Submit Change Order for review
 */
router.post('/:id/submit', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const changeOrder = await changeOrderService.submit(id, userId);

    res.json({
      success: true,
      data: changeOrder,
      message: 'Change Order submitted for review'
    });
  } catch (error) {
    logger.error('Error submitting Change Order:', error);
    next(error);
  }
});

/**
 * POST /api/change-orders/:id/request-approval
 * Request approval for Change Order
 */
router.post('/:id/request-approval', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const changeOrder = await changeOrderService.requestApproval(id, userId);

    res.json({
      success: true,
      data: changeOrder,
      message: 'Approval requested successfully'
    });
  } catch (error) {
    logger.error('Error requesting approval:', error);
    next(error);
  }
});

/**
 * POST /api/change-orders/:id/sign
 * Sign a specific signature line
 */
router.post('/:id/sign', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const { signature_id, signature_data, comments } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID is required'
      });
    }

    if (!signature_id) {
      return res.status(400).json({
        success: false,
        message: 'Signature ID is required'
      });
    }

    const changeOrder = await changeOrderService.sign(id, signature_id, userId, signature_data, comments);

    res.json({
      success: true,
      data: changeOrder,
      message: 'Signature recorded successfully'
    });
  } catch (error) {
    logger.error('Error signing Change Order:', error);
    next(error);
  }
});

/**
 * POST /api/change-orders/:id/approve
 * Approve Change Order (bypass signatures)
 */
router.post('/:id/approve', requirePMWrite, requireProjectPermission('can_approve_costs'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const { comment } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const changeOrder = await changeOrderService.approve(id, userId, comment);

    res.json({
      success: true,
      data: changeOrder,
      message: 'Change Order approved successfully'
    });
  } catch (error) {
    logger.error('Error approving Change Order:', error);
    next(error);
  }
});

/**
 * POST /api/change-orders/:id/request-esign
 * Manually generate the branded change-order document and send it for signature
 * via the hardened backend flow (config-driven signers + fields).
 */
router.post('/:id/request-esign', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User ID is required' });
    }

    const changeOrder = await changeOrderService.requestEsign(id, userId);
    res.json({
      success: true,
      data: changeOrder,
      message: changeOrder.esign_envelope_id
        ? 'Change order sent for e-signature'
        : 'No signers could be resolved — add project team members (PM, owner, contractor) with emails first',
    });
  } catch (error) {
    logger.error('Error requesting e-sign for Change Order:', error);
    next(error);
  }
});

/**
 * POST /api/change-orders/:id/reject
 * Reject Change Order
 */
router.post('/:id/reject', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const { reason } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID is required'
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const changeOrder = await changeOrderService.reject(id, userId, reason);

    res.json({
      success: true,
      data: changeOrder,
      message: 'Change Order rejected'
    });
  } catch (error) {
    logger.error('Error rejecting Change Order:', error);
    next(error);
  }
});

/**
 * POST /api/change-orders/:id/execute
 * Execute Change Order (apply to contract)
 */
router.post('/:id/execute', requirePMWrite, requireProjectPermission('can_approve_costs'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const changeOrder = await changeOrderService.execute(id, userId);

    res.json({
      success: true,
      data: changeOrder,
      message: 'Change Order executed successfully'
    });
  } catch (error) {
    logger.error('Error executing Change Order:', error);
    next(error);
  }
});

/**
 * POST /api/change-orders/:id/void
 * Void Change Order
 */
router.post('/:id/void', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const { reason } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID is required'
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Reason is required'
      });
    }

    const changeOrder = await changeOrderService.void(id, userId, reason);

    res.json({
      success: true,
      data: changeOrder,
      message: 'Change Order voided successfully'
    });
  } catch (error) {
    logger.error('Error voiding Change Order:', error);
    next(error);
  }
});

/**
 * GET /api/change-orders/:id/history
 * Get Change Order history
 */
router.get('/:id/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const history = await changeOrderService.getHistory(id);

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    logger.error('Error fetching Change Order history:', error);
    next(error);
  }
});

export default router;
