/**
 * Procurement Routes
 * Purchase Orders and Delivery Management
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../database';
import { ProcurementService } from '../services/project-management/procurementService';
import { registerPMParamValidation, requirePMWrite } from '../middleware/pmAuth';
import { validate } from '../middleware/validation';
import { createPurchaseOrderSchema, updatePurchaseOrderSchema } from '../middleware/pmProjectValidation';

const router = Router();
const service = new ProcurementService(pool);

// Register UUID parameter validation
registerPMParamValidation(router);

// ============================================================================
// PURCHASE ORDERS
// ============================================================================

// Get all purchase orders
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      organizationId: req.query.organizationId as string,
      projectId: req.query.projectId as string,
      vendorId: req.query.vendorId as string,
      status: req.query.status as any,
      priority: req.query.priority as string,
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
      overdue: req.query.overdue === 'true',
      search: req.query.search as string,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : undefined
    };

    const result = await service.getPurchaseOrders(filters);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// Get single purchase order
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const po = await service.getPurchaseOrderById(req.params.id);
    if (!po) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }
    res.json({ success: true, data: po });
  } catch (error) {
    next(error);
  }
});

// Create purchase order
router.post('/', requirePMWrite, validate(createPurchaseOrderSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const createdBy = req.body.createdBy || req.headers['x-user-id'] as string;
    const organizationId = req.body.organizationId || req.headers['x-organization-id'] as string;
    const po = await service.createPurchaseOrder({
      ...req.body,
      createdBy,
      organizationId
    });
    res.status(201).json({ success: true, data: po });
  } catch (error) {
    next(error);
  }
});

// Update purchase order
router.put('/:id', requirePMWrite, validate(updatePurchaseOrderSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updatedBy = req.body.updatedBy || req.headers['x-user-id'] as string;
    const po = await service.updatePurchaseOrder(req.params.id, req.body, updatedBy);
    if (!po) {
      return res.status(404).json({ success: false, error: 'Purchase order not found' });
    }
    res.json({ success: true, data: po });
  } catch (error) {
    next(error);
  }
});

// Submit for approval
router.post('/:id/submit', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const submittedBy = req.body.submittedBy || req.headers['x-user-id'] as string;
    const po = await service.submitForApproval(req.params.id, submittedBy);
    res.json({ success: true, data: po });
  } catch (error) {
    next(error);
  }
});

// Approve purchase order
router.post('/:id/approve', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const approvedBy = req.body.approvedBy || req.headers['x-user-id'] as string;
    const po = await service.approvePurchaseOrder(req.params.id, approvedBy, req.body.notes);
    res.json({ success: true, data: po });
  } catch (error) {
    next(error);
  }
});

// Reject purchase order
router.post('/:id/reject', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ success: false, error: 'Rejection reason is required' });
    }
    const rejectedBy = req.body.rejectedBy || req.headers['x-user-id'] as string;
    const po = await service.rejectPurchaseOrder(req.params.id, rejectedBy, reason);
    res.json({ success: true, data: po });
  } catch (error) {
    next(error);
  }
});

// Mark as ordered
router.post('/:id/order', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderedBy = req.body.orderedBy || req.headers['x-user-id'] as string;
    const po = await service.markAsOrdered(req.params.id, orderedBy, req.body.orderDate);
    res.json({ success: true, data: po });
  } catch (error) {
    next(error);
  }
});

// Cancel purchase order
router.post('/:id/cancel', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ success: false, error: 'Cancellation reason is required' });
    }
    const cancelledBy = req.body.cancelledBy || req.headers['x-user-id'] as string;
    const po = await service.cancelPurchaseOrder(req.params.id, cancelledBy, reason);
    res.json({ success: true, data: po });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PO ITEMS
// ============================================================================

// Add item to PO
router.post('/:id/items', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await service.addPOItem(req.params.id, req.body);
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
});

// Update PO item
router.put('/items/:itemId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await service.updatePOItem(req.params.itemId, req.body);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
});

// Delete PO item
router.delete('/items/:itemId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const success = await service.deletePOItem(req.params.itemId);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// DELIVERIES
// ============================================================================

// Get deliveries for a PO
router.get('/:id/deliveries', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deliveries = await service.getDeliveries(req.params.id);
    res.json({ success: true, data: deliveries });
  } catch (error) {
    next(error);
  }
});

// Record delivery
router.post('/:id/deliveries', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const receivedBy = req.body.receivedBy || req.headers['x-user-id'] as string;
    const delivery = await service.recordDelivery({
      purchaseOrderId: req.params.id,
      receivedBy,
      ...req.body
    });
    res.status(201).json({ success: true, data: delivery });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// STATISTICS
// ============================================================================

// Get project procurement stats
router.get('/stats/project/:projectId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await service.getProjectStats(req.params.projectId);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

// Get organization procurement stats
router.get('/stats/organization/:organizationId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await service.getOrganizationStats(req.params.organizationId);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

export default router;
