/**
 * Quality Checklists Routes
 * Phase 3A Week 4 - QC Inspection Templates & Digital Signatures
 */

import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../database';
import { QualityChecklistsService } from '../services/project-management/qualityChecklistsService';

const router = Router();
const service = new QualityChecklistsService(pool);

// ============================================================================
// CATEGORIES
// ============================================================================

// Get all categories
router.get('/categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.query.organizationId as string;
    const categories = await service.getCategories(organizationId);
    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
});

// Create category
router.post('/categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, organizationId, description, icon, color } = req.body;
    const category = await service.createCategory(name, organizationId, description, icon, color);
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// TEMPLATES
// ============================================================================

// Get all templates
router.get('/templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      organizationId: req.query.organizationId as string,
      categoryId: req.query.categoryId as string,
      templateType: req.query.templateType as any,
      isPublished: req.query.isPublished === 'true' ? true : req.query.isPublished === 'false' ? false : undefined,
      search: req.query.search as string,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : undefined
    };

    const result = await service.getTemplates(filters);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// Get template by ID
router.get('/templates/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const template = await service.getTemplateById(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    res.json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
});

// Get full template with sections and items
router.get('/templates/:id/full', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const template = await service.getTemplateFull(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    res.json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
});

// Create template
router.post('/templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const template = await service.createTemplate(req.body);
    res.status(201).json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
});

// Update template
router.put('/templates/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updatedBy = req.body.updatedBy || req.headers['x-user-id'] as string;
    const template = await service.updateTemplate(req.params.id, req.body, updatedBy);
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    res.json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
});

// Publish template
router.post('/templates/:id/publish', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const publishedBy = req.body.publishedBy || req.headers['x-user-id'] as string;
    const template = await service.publishTemplate(req.params.id, publishedBy);
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    res.json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
});

// Duplicate template
router.post('/templates/:id/duplicate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { newName, createdBy } = req.body;
    const template = await service.duplicateTemplate(req.params.id, newName, createdBy);
    res.status(201).json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
});

// Delete template
router.delete('/templates/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const success = await service.deleteTemplate(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// TEMPLATE SECTIONS
// ============================================================================

// Get template sections
router.get('/templates/:templateId/sections', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sections = await service.getSections(req.params.templateId);
    res.json({ success: true, data: sections });
  } catch (error) {
    next(error);
  }
});

// Add section to template
router.post('/templates/:templateId/sections', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const section = await service.addSection({
      templateId: req.params.templateId,
      ...req.body
    });
    res.status(201).json({ success: true, data: section });
  } catch (error) {
    next(error);
  }
});

// Update section
router.put('/sections/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const section = await service.updateSection(req.params.id, req.body);
    if (!section) {
      return res.status(404).json({ success: false, error: 'Section not found' });
    }
    res.json({ success: true, data: section });
  } catch (error) {
    next(error);
  }
});

// Delete section
router.delete('/sections/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const success = await service.deleteSection(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Section not found' });
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// TEMPLATE ITEMS
// ============================================================================

// Get template items
router.get('/templates/:templateId/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sectionId = req.query.sectionId as string;
    const items = await service.getItems(req.params.templateId, sectionId);
    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
});

// Add item to template
router.post('/templates/:templateId/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await service.addItem({
      templateId: req.params.templateId,
      ...req.body
    });
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
});

// Add multiple items
router.post('/templates/:templateId/items/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items } = req.body;
    const created = await service.addItemsBulk(req.params.templateId, items);
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    next(error);
  }
});

// Update item
router.put('/items/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await service.updateItem(req.params.id, req.body);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    res.json({ success: true, data: item });
  } catch (error) {
    next(error);
  }
});

// Delete item
router.delete('/items/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const success = await service.deleteItem(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Reorder items
router.post('/templates/:templateId/items/reorder', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itemOrders } = req.body; // [{id, order}, ...]
    await service.reorderItems(req.params.templateId, itemOrders);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// CHECKLIST INSTANCES
// ============================================================================

// Get all instances
router.get('/instances', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      organizationId: req.query.organizationId as string,
      projectId: req.query.projectId as string,
      unitId: req.query.unitId as string,
      templateId: req.query.templateId as string,
      status: req.query.status as any,
      overallResult: req.query.overallResult as any,
      assignedTo: req.query.assignedTo as string,
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
      overdue: req.query.overdue === 'true',
      search: req.query.search as string,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : undefined
    };

    const result = await service.getInstances(filters);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// Get instance by ID
router.get('/instances/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await service.getInstanceById(req.params.id);
    if (!instance) {
      return res.status(404).json({ success: false, error: 'Instance not found' });
    }
    res.json({ success: true, data: instance });
  } catch (error) {
    next(error);
  }
});

// Get full instance with all data
router.get('/instances/:id/full', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await service.getInstanceFull(req.params.id);
    if (!instance) {
      return res.status(404).json({ success: false, error: 'Instance not found' });
    }
    res.json({ success: true, data: instance });
  } catch (error) {
    next(error);
  }
});

// Create instance
router.post('/instances', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instance = await service.createInstance(req.body);
    res.status(201).json({ success: true, data: instance });
  } catch (error) {
    next(error);
  }
});

// Start instance
router.post('/instances/:id/start', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const startedBy = req.body.startedBy || req.headers['x-user-id'] as string;
    const instance = await service.startInstance(req.params.id, startedBy);
    if (!instance) {
      return res.status(404).json({ success: false, error: 'Instance not found or already started' });
    }
    res.json({ success: true, data: instance });
  } catch (error) {
    next(error);
  }
});

// Submit for review
router.post('/instances/:id/submit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const submittedBy = req.body.submittedBy || req.headers['x-user-id'] as string;
    const instance = await service.submitForReview(req.params.id, submittedBy);
    if (!instance) {
      return res.status(404).json({ success: false, error: 'Instance not found' });
    }
    res.json({ success: true, data: instance });
  } catch (error) {
    next(error);
  }
});

// Approve instance
router.post('/instances/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { approvedBy, notes } = req.body;
    const instance = await service.approveInstance(req.params.id, approvedBy, notes);
    if (!instance) {
      return res.status(404).json({ success: false, error: 'Instance not found' });
    }
    res.json({ success: true, data: instance });
  } catch (error) {
    next(error);
  }
});

// Reject instance
router.post('/instances/:id/reject', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rejectedBy, notes } = req.body;
    if (!notes) {
      return res.status(400).json({ success: false, error: 'Rejection notes are required' });
    }
    const instance = await service.rejectInstance(req.params.id, rejectedBy, notes);
    if (!instance) {
      return res.status(404).json({ success: false, error: 'Instance not found' });
    }
    res.json({ success: true, data: instance });
  } catch (error) {
    next(error);
  }
});

// Require reinspection
router.post('/instances/:id/reinspection', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { requiredBy, notes } = req.body;
    if (!notes) {
      return res.status(400).json({ success: false, error: 'Reinspection notes are required' });
    }
    const newInstance = await service.requireReinspection(req.params.id, requiredBy, notes);
    if (!newInstance) {
      return res.status(404).json({ success: false, error: 'Instance not found' });
    }
    res.status(201).json({ success: true, data: newInstance });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// RESPONSES
// ============================================================================

// Get responses for instance
router.get('/instances/:id/responses', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const responses = await service.getResponses(req.params.id);
    res.json({ success: true, data: responses });
  } catch (error) {
    next(error);
  }
});

// Save single response
router.post('/instances/:id/responses', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const response = await service.saveResponse({
      instanceId: req.params.id,
      ...req.body
    });
    res.status(201).json({ success: true, data: response });
  } catch (error) {
    next(error);
  }
});

// Save multiple responses
router.post('/instances/:id/responses/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { responses } = req.body;
    const responsesWithInstance = responses.map((r: any) => ({
      ...r,
      instanceId: req.params.id
    }));
    const saved = await service.saveResponsesBulk(responsesWithInstance);
    res.status(201).json({ success: true, data: saved });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// SIGNATURES
// ============================================================================

// Get signatures for instance
router.get('/instances/:id/signatures', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signatures = await service.getSignatures(req.params.id);
    res.json({ success: true, data: signatures });
  } catch (error) {
    next(error);
  }
});

// Add signature
router.post('/instances/:id/signatures', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signature = await service.addSignature({
      instanceId: req.params.id,
      ipAddress: req.ip,
      ...req.body
    });
    res.status(201).json({ success: true, data: signature });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// STATISTICS & DASHBOARD
// ============================================================================

// Get project stats
router.get('/stats/project/:projectId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await service.getProjectStats(req.params.projectId);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

// Get dashboard data
router.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.query.organizationId as string;
    const projectId = req.query.projectId as string;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization ID is required' });
    }

    const data = await service.getDashboardData(organizationId, projectId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// Get activity log for instance
router.get('/instances/:id/activities', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const activities = await service.getActivities(req.params.id, limit);
    res.json({ success: true, data: activities });
  } catch (error) {
    next(error);
  }
});

export default router;
