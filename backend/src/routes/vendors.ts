/**
 * Vendor Routes
 * Phase 4 Sprint 8 - Team & Integration
 * 
 * API routes for:
 * - Vendor directory
 * - Vendor ratings
 * - Vendor assignments
 * - Compliance tracking
 */

import { Router, Request, Response } from 'express';
import { teamService, VendorCategory } from '../services/project-management/teamService';
import { logger } from '../utils/logger';
import { registerPMParamValidation, requirePMWrite } from '../middleware/pmAuth';
import { pool } from '../database';

const ts = teamService as any;
const router = Router();

// Register UUID parameter validation
registerPMParamValidation(router);

// ============================================================================
// VENDOR DIRECTORY
// ============================================================================

/**
 * POST /vendors
 * Add a vendor to the directory
 */
router.post('/', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || req.body.createdBy;
    
    const vendor = await teamService.addVendor({
      ...req.body,
      createdBy: userId,
    });
    
    res.status(201).json({
      success: true,
      data: vendor,
    });
  } catch (error) {
    logger.error('Error adding vendor', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to add vendor',
    });
  }
});

/**
 * GET /vendors
 * Get vendors with filters
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string | undefined;
    const category = req.query.category as string | undefined;
    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (search) {
      conditions.push(`(business_name ILIKE $${idx} OR contact_person ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (category) {
      conditions.push(`$${idx} = ANY(service_categories)`);
      params.push(category);
      idx++;
    }
    if (status) {
      conditions.push(`status = $${idx}`);
      params.push(status);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [dataRes, countRes] = await Promise.all([
      pool.query(
        `SELECT * FROM vendors ${where} ORDER BY business_name LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*) as total FROM vendors ${where}`, params),
    ]);

    res.json({
      success: true,
      data: dataRes.rows,
      pagination: {
        total: parseInt(countRes.rows[0]?.total) || 0,
        limit,
        offset,
      },
    });
  } catch (error) {
    logger.error('Error getting vendors', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get vendors',
    });
  }
});

/**
 * GET /vendors/:id
 * Get vendor by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const vendor = await teamService.getVendorById(req.params.id);
    
    if (!vendor) {
      return res.status(404).json({
        success: false,
        error: 'Vendor not found',
      });
    }
    
    res.json({
      success: true,
      data: vendor,
    });
  } catch (error) {
    logger.error('Error getting vendor', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get vendor',
    });
  }
});

/**
 * PUT /vendors/:id
 * Update a vendor
 */
router.put('/:id', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const vendor = await ts.updateVendor(req.params.id, req.body);
    
    res.json({
      success: true,
      data: vendor,
    });
  } catch (error) {
    logger.error('Error updating vendor', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to update vendor',
    });
  }
});

/**
 * POST /vendors/:id/approve
 * Approve a vendor
 */
router.post('/:id/approve', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || req.body.approvedBy;
    
    const vendor = await teamService.approveVendor(req.params.id, userId);
    
    res.json({
      success: true,
      data: vendor,
    });
  } catch (error) {
    logger.error('Error approving vendor', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to approve vendor',
    });
  }
});

/**
 * POST /vendors/:id/suspend
 * Suspend a vendor
 */
router.post('/:id/suspend', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    
    const vendor = await ts.suspendVendor(req.params.id, reason);
    
    res.json({
      success: true,
      data: vendor,
    });
  } catch (error) {
    logger.error('Error suspending vendor', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to suspend vendor',
    });
  }
});

/**
 * DELETE /vendors/:id
 * Delete a vendor
 */
router.delete('/:id', requirePMWrite, async (req: Request, res: Response) => {
  try {
    await ts.deleteVendor(req.params.id);
    
    res.json({
      success: true,
      message: 'Vendor deleted',
    });
  } catch (error) {
    logger.error('Error deleting vendor', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to delete vendor',
    });
  }
});

// ============================================================================
// VENDOR RATINGS
// ============================================================================

/**
 * POST /vendors/:id/ratings
 * Rate a vendor's performance
 */
router.post('/:id/ratings', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const { id: vendorId } = req.params;
    const userId = (req as any).user?.id || req.body.ratedBy;
    
    const rating = await teamService.rateVendorPerformance({
      vendorId,
      ...req.body,
      ratedBy: userId,
    });
    
    res.status(201).json({
      success: true,
      data: rating,
    });
  } catch (error) {
    logger.error('Error rating vendor', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to rate vendor',
    });
  }
});

/**
 * GET /vendors/:id/ratings
 * Get vendor ratings
 */
router.get('/:id/ratings', async (req: Request, res: Response) => {
  try {
    const { id: vendorId } = req.params;
    
    const ratings = await ts.getVendorRatings(vendorId);
    
    res.json({
      success: true,
      data: ratings,
    });
  } catch (error) {
    logger.error('Error getting vendor ratings', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get vendor ratings',
    });
  }
});

/**
 * GET /vendors/:id/ratings/summary
 * Get vendor rating summary
 */
router.get('/:id/ratings/summary', async (req: Request, res: Response) => {
  try {
    const { id: vendorId } = req.params;
    
    const summary = await ts.getVendorRatingSummary(vendorId);
    
    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.error('Error getting vendor rating summary', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get vendor rating summary',
    });
  }
});

// ============================================================================
// VENDOR ASSIGNMENTS
// ============================================================================

/**
 * POST /vendors/:id/assignments
 * Assign a vendor to a project
 */
router.post('/:id/assignments', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const { id: vendorId } = req.params;
    const userId = (req as any).user?.id || req.body.assignedBy;
    
    const assignment = await ts.assignVendorToProject({
      vendorId,
      ...req.body,
      assignedBy: userId,
    });
    
    res.status(201).json({
      success: true,
      data: assignment,
    });
  } catch (error) {
    logger.error('Error assigning vendor', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to assign vendor',
    });
  }
});

/**
 * GET /vendors/:id/assignments
 * Get vendor's project assignments
 */
router.get('/:id/assignments', async (req: Request, res: Response) => {
  try {
    const { id: vendorId } = req.params;
    
    const assignments = await ts.getVendorAssignments(vendorId);
    
    res.json({
      success: true,
      data: assignments,
    });
  } catch (error) {
    logger.error('Error getting vendor assignments', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get vendor assignments',
    });
  }
});

/**
 * GET /vendors/projects/:projectId/vendors
 * Get vendors assigned to a project
 */
router.get('/projects/:projectId/vendors', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    
    const vendors = await ts.getProjectVendors(projectId);
    
    res.json({
      success: true,
      data: vendors,
    });
  } catch (error) {
    logger.error('Error getting project vendors', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get project vendors',
    });
  }
});

/**
 * PUT /vendors/assignments/:assignmentId
 * Update a vendor assignment
 */
router.put('/assignments/:assignmentId', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const { assignmentId } = req.params;
    
    const assignment = await ts.updateVendorAssignment(assignmentId, req.body);
    
    res.json({
      success: true,
      data: assignment,
    });
  } catch (error) {
    logger.error('Error updating vendor assignment', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to update vendor assignment',
    });
  }
});

/**
 * POST /vendors/assignments/:assignmentId/complete
 * Mark a vendor assignment as complete
 */
router.post('/assignments/:assignmentId/complete', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const { assignmentId } = req.params;
    
    const assignment = await ts.completeVendorAssignment(assignmentId);
    
    res.json({
      success: true,
      data: assignment,
    });
  } catch (error) {
    logger.error('Error completing vendor assignment', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to complete vendor assignment',
    });
  }
});

/**
 * DELETE /vendors/assignments/:assignmentId
 * Remove a vendor from a project
 */
router.delete('/assignments/:assignmentId', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const { assignmentId } = req.params;
    
    await ts.removeVendorFromProject(assignmentId);
    
    res.json({
      success: true,
      message: 'Vendor removed from project',
    });
  } catch (error) {
    logger.error('Error removing vendor from project', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to remove vendor from project',
    });
  }
});

// ============================================================================
// VENDOR COMPLIANCE
// ============================================================================

/**
 * PUT /vendors/:id/compliance
 * Update vendor compliance documents
 */
router.put('/:id/compliance', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const { id: vendorId } = req.params;
    const { complianceDocuments } = req.body;
    
    const vendor = await ts.updateVendorCompliance(vendorId, complianceDocuments);
    
    res.json({
      success: true,
      data: vendor,
    });
  } catch (error) {
    logger.error('Error updating vendor compliance', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to update vendor compliance',
    });
  }
});

/**
 * GET /vendors/compliance/expiring
 * Get vendors with expiring compliance documents
 */
router.get('/compliance/expiring', async (req: Request, res: Response) => {
  try {
    const organizationId = req.query.organizationId as string;
    const daysAhead = parseInt(req.query.daysAhead as string) || 30;
    
    const vendors = await ts.getVendorsWithExpiringCompliance(organizationId, daysAhead);
    
    res.json({
      success: true,
      data: vendors,
    });
  } catch (error) {
    logger.error('Error getting expiring compliance', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get expiring compliance',
    });
  }
});

// ============================================================================
// VENDOR CATEGORIES
// ============================================================================

/**
 * GET /vendors/categories
 * Get all vendor categories
 */
router.get('/categories/all', async (_req: Request, res: Response) => {
  try {
    const categories = await ts.getVendorCategories();
    
    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    logger.error('Error getting vendor categories', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get vendor categories',
    });
  }
});

/**
 * GET /vendors/top-rated
 * Get top rated vendors
 */
router.get('/top-rated', async (req: Request, res: Response) => {
  try {
    const organizationId = req.query.organizationId as string;
    const category = req.query.category as VendorCategory | undefined;
    const limit = parseInt(req.query.limit as string) || 10;
    
    const vendors = await ts.getTopRatedVendors(organizationId, category, limit);
    
    res.json({
      success: true,
      data: vendors,
    });
  } catch (error) {
    logger.error('Error getting top rated vendors', { error });
    res.status(500).json({
      success: false,
      error: 'Failed to get top rated vendors',
    });
  }
});

export default router;
