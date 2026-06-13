/**
 * RFI Routes
 * Phase 3A Week 1 - API endpoints for RFI management
 * 
 * Endpoints:
 * - GET /api/rfis - List RFIs with filters
 * - GET /api/rfis/:id - Get RFI by ID
 * - POST /api/rfis - Create new RFI
 * - PUT /api/rfis/:id - Update RFI
 * - POST /api/rfis/:id/submit - Submit draft RFI
 * - POST /api/rfis/:id/assign - Assign RFI to user
 * - POST /api/rfis/:id/respond - Respond to RFI
 * - POST /api/rfis/:id/close - Close RFI
 * - POST /api/rfis/:id/void - Void RFI
 * - GET /api/rfis/:id/comments - Get RFI comments
 * - POST /api/rfis/:id/comments - Add comment to RFI
 * - GET /api/rfis/:id/history - Get RFI history
 * - GET /api/rfis/stats/:projectId - Get RFI statistics for project
 */

import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { scanUploadedFile } from '../middleware/virusScan';
import { rfiService, RfiFilters, CreateRfiInput, UpdateRfiInput, RespondToRfiInput } from '../services/project-management/rfiService';
import { logger } from '../utils/logger';
import { registerPMParamValidation, registerProjectAccessParams, enforceChildProjectAccess, requireProjectQueryAccess, requirePMWrite } from '../middleware/pmAuth';
import { validate } from '../middleware/validation';
import { createRfiSchema, updateRfiSchema, respondRfiSchema, rfiQuerySchema } from '../middleware/pmProjectValidation';

// Configure uploads directory
const uploadsDir = path.join(__dirname, '../../uploads/rfis');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for RFI attachments
const rfiStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueId}${ext}`);
  },
});

const rfiUpload = multer({
  storage: rfiStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    // Allow common document types
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/gif',
      'text/plain',
      'application/zip',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
});

const router = Router();

// Register UUID parameter validation
registerPMParamValidation(router);
// ':id' here is an RFI id — resolve its project and enforce membership so a
// non-admin can only open RFIs on projects they belong to. '/stats/:projectId'
// is gated by project membership directly.
router.param('id', enforceChildProjectAccess('rfis'));
registerProjectAccessParams(router, ['projectId']);

// Helper to extract user ID from authenticated request (no header fallback)
const getUserId = (req: Request): string | undefined => {
  return (req as any).user?.id || (req as any).user?.sub;
};

// Helper to extract organization ID from authenticated user (no header fallback)
const getOrganizationId = (req: Request): string | undefined => {
  return (req as any).user?.organizationId || (req as any).user?.organization_id;
};

/**
 * GET /api/rfis
 * List RFIs with filters and pagination
 */
router.get('/', requireProjectQueryAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters: RfiFilters = {
      organization_id: getOrganizationId(req),
      project_id: req.query.projectId as string,
      status: req.query.status as any,
      priority: req.query.priority as any,
      category: req.query.category as any,
      assigned_to: req.query.assignedTo as string,
      submitted_by: req.query.submittedBy as string,
      // ?ballInCourt=me → only RFIs awaiting the current user's action.
      ball_in_court: req.query.ballInCourt === 'me'
        ? getUserId(req)
        : (req.query.ballInCourt as string) || undefined,
      phase_id: req.query.phaseId as string,
      is_overdue: req.query.isOverdue === 'true',
      due_date_from: req.query.dueDateFrom ? new Date(req.query.dueDateFrom as string) : undefined,
      due_date_to: req.query.dueDateTo ? new Date(req.query.dueDateTo as string) : undefined,
      created_from: req.query.createdFrom ? new Date(req.query.createdFrom as string) : undefined,
      created_to: req.query.createdTo ? new Date(req.query.createdTo as string) : undefined,
      search: req.query.search as string,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
      sort_by: req.query.sortBy as string,
      sort_order: req.query.sortOrder as 'asc' | 'desc'
    };

    const result = await rfiService.getAll(filters);

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
    logger.error('Error fetching RFIs:', error);
    next(error);
  }
});

/**
 * GET /api/rfis/stats/:projectId
 * Get RFI statistics for a project
 */
router.get('/stats/:projectId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    const stats = await rfiService.getStats(projectId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error fetching RFI stats:', error);
    next(error);
  }
});

/**
 * GET /api/rfis/:id
 * Get RFI by ID with all details
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const rfi = await rfiService.getById(id);

    if (!rfi) {
      return res.status(404).json({
        success: false,
        message: 'RFI not found'
      });
    }

    res.json({
      success: true,
      data: rfi
    });
  } catch (error) {
    logger.error('Error fetching RFI:', error);
    next(error);
  }
});

/**
 * POST /api/rfis
 * Create a new RFI
 */
router.post('/', requirePMWrite, validate(createRfiSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const organizationId = getOrganizationId(req) || req.body.organization_id;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: 'Organization ID is required'
      });
    }

    if (!req.body.project_id) {
      return res.status(400).json({
        success: false,
        message: 'Project ID is required'
      });
    }

    const input: CreateRfiInput = {
      organization_id: organizationId,
      project_id: req.body.project_id,
      subject: req.body.subject,
      question: req.body.question,
      category: req.body.category,
      priority: req.body.priority,
      due_date: req.body.due_date ? new Date(req.body.due_date) : undefined,
      assigned_to: req.body.assigned_to,
      phase_id: req.body.phase_id,
      drawing_references: req.body.drawing_references,
      spec_references: req.body.spec_references,
      location_reference: req.body.location_reference,
      cost_impact: req.body.cost_impact,
      cost_impact_currency: req.body.cost_impact_currency,
      schedule_impact_days: req.body.schedule_impact_days,
      attachments: req.body.attachments,
      related_rfis: req.body.related_rfis,
      submit_immediately: req.body.submit_immediately,
      created_by: userId
    };

    // Validation
    if (!input.subject || !input.question) {
      return res.status(400).json({
        success: false,
        message: 'Subject and question are required'
      });
    }

    const rfi = await rfiService.create(input);

    res.status(201).json({
      success: true,
      data: rfi,
      message: 'RFI created successfully'
    });
  } catch (error) {
    logger.error('Error creating RFI:', error);
    next(error);
  }
});

/**
 * PUT /api/rfis/:id
 * Update an RFI
 */
router.put('/:id', requirePMWrite, validate(updateRfiSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    const input: UpdateRfiInput = {
      subject: req.body.subject,
      question: req.body.question,
      category: req.body.category,
      priority: req.body.priority,
      due_date: req.body.due_date ? new Date(req.body.due_date) : undefined,
      assigned_to: req.body.assigned_to,
      phase_id: req.body.phase_id,
      drawing_references: req.body.drawing_references,
      spec_references: req.body.spec_references,
      location_reference: req.body.location_reference,
      cost_impact: req.body.cost_impact,
      cost_impact_currency: req.body.cost_impact_currency,
      schedule_impact_days: req.body.schedule_impact_days,
      attachments: req.body.attachments,
      related_rfis: req.body.related_rfis,
      updated_by: userId
    };

    const rfi = await rfiService.update(id, input);

    res.json({
      success: true,
      data: rfi,
      message: 'RFI updated successfully'
    });
  } catch (error) {
    logger.error('Error updating RFI:', error);
    next(error);
  }
});

/**
 * POST /api/rfis/:id/submit
 * Submit a draft RFI
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

    const rfi = await rfiService.submit(id, userId);

    res.json({
      success: true,
      data: rfi,
      message: 'RFI submitted successfully'
    });
  } catch (error) {
    logger.error('Error submitting RFI:', error);
    next(error);
  }
});

/**
 * POST /api/rfis/:id/assign
 * Assign RFI to a user
 */
router.post('/:id/assign', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { assignee_id } = req.body;
    const userId = getUserId(req);

    if (!assignee_id) {
      return res.status(400).json({
        success: false,
        message: 'Assignee ID is required'
      });
    }

    const rfi = await rfiService.assign(id, assignee_id, userId || '');

    res.json({
      success: true,
      data: rfi,
      message: 'RFI assigned successfully'
    });
  } catch (error) {
    logger.error('Error assigning RFI:', error);
    next(error);
  }
});

/**
 * POST /api/rfis/:id/respond
 * Respond to an RFI
 */
router.post('/:id/respond', requirePMWrite, validate(respondRfiSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const input: RespondToRfiInput = {
      response: req.body.response,
      response_attachments: req.body.response_attachments,
      cost_impact: req.body.cost_impact,
      schedule_impact_days: req.body.schedule_impact_days,
      answered_by: userId
    };

    if (!input.response) {
      return res.status(400).json({
        success: false,
        message: 'Response is required'
      });
    }

    const rfi = await rfiService.respond(id, input);

    res.json({
      success: true,
      data: rfi,
      message: 'RFI response submitted successfully'
    });
  } catch (error) {
    logger.error('Error responding to RFI:', error);
    next(error);
  }
});

/**
 * POST /api/rfis/:id/close
 * Close an RFI
 */
router.post('/:id/close', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
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

    const rfi = await rfiService.close(id, userId, comment);

    res.json({
      success: true,
      data: rfi,
      message: 'RFI closed successfully'
    });
  } catch (error) {
    logger.error('Error closing RFI:', error);
    next(error);
  }
});

/**
 * POST /api/rfis/:id/void
 * Void an RFI
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

    const rfi = await rfiService.void(id, userId, reason);

    res.json({
      success: true,
      data: rfi,
      message: 'RFI voided successfully'
    });
  } catch (error) {
    logger.error('Error voiding RFI:', error);
    next(error);
  }
});

/**
 * GET /api/rfis/:id/comments
 * Get comments for an RFI
 */
router.get('/:id/comments', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const includeInternal = req.query.includeInternal === 'true';

    const comments = await rfiService.getComments(id, includeInternal);

    res.json({
      success: true,
      data: comments
    });
  } catch (error) {
    logger.error('Error fetching RFI comments:', error);
    next(error);
  }
});

/**
 * POST /api/rfis/:id/comments
 * Add a comment to an RFI
 */
router.post('/:id/comments', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const { comment, is_internal, attachments } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID is required'
      });
    }

    if (!comment) {
      return res.status(400).json({
        success: false,
        message: 'Comment is required'
      });
    }

    const newComment = await rfiService.addComment(id, comment, is_internal || false, userId, attachments);

    res.status(201).json({
      success: true,
      data: newComment,
      message: 'Comment added successfully'
    });
  } catch (error) {
    logger.error('Error adding RFI comment:', error);
    next(error);
  }
});

/**
 * GET /api/rfis/:id/history
 * Get RFI history
 */
router.get('/:id/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const history = await rfiService.getHistory(id);

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    logger.error('Error fetching RFI history:', error);
    next(error);
  }
});

/**
 * DELETE /api/rfis/:id
 * Delete (void) an RFI
 */
router.delete('/:id', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID is required'
      });
    }

    await rfiService.delete(id, userId);

    res.json({
      success: true,
      message: 'RFI deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting RFI:', error);
    next(error);
  }
});

/**
 * POST /api/rfis/:id/attachments
 * Upload attachment for RFI response (Client action)
 */
router.post('/:id/attachments', requirePMWrite, rfiUpload.single('file'), scanUploadedFile, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Generate file URL (adjust based on your hosting setup)
    const fileUrl = `/api/v1/rfis/attachments/${file.filename}`;
    
    // Create attachment record
    const attachment = await rfiService.addAttachment(id, {
      id: uuidv4(),
      rfi_id: id,
      file_name: file.originalname,
      file_url: fileUrl,
      file_type: file.mimetype,
      file_size: file.size,
      uploaded_by: userId || 'system',
      uploaded_at: new Date().toISOString(),
      type: req.body.type || 'response', // 'request', 'response', or 'comment'
    });

    res.json({
      success: true,
      data: attachment,
      message: 'File uploaded successfully'
    });
  } catch (error) {
    logger.error('Error uploading RFI attachment:', error);
    next(error);
  }
});

/**
 * GET /api/rfis/attachments/:filename
 * Serve uploaded RFI attachment
 */
router.get('/attachments/:filename', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(uploadsDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    res.sendFile(filePath);
  } catch (error) {
    logger.error('Error serving RFI attachment:', error);
    next(error);
  }
});

export default router;
