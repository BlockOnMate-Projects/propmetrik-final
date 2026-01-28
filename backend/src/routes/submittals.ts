/**
 * Submittal Routes
 * API endpoints for submittal management
 * Phase 3A Week 2
 */

import { Router, Request, Response } from 'express';
import submittalService, { 
  CreateSubmittalInput, 
  UpdateSubmittalInput, 
  SubmittalFilters,
  SubmittalReviewInput 
} from '../services/project-management/submittalService';

const router = Router();

/**
 * @route GET /api/submittals
 * @desc Get all submittals with filters
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const filters: SubmittalFilters = {
      project_id: req.query.project_id as string,
      status: req.query.status as any,
      submittal_type: req.query.submittal_type as any,
      contractor_id: req.query.contractor_id as string,
      assigned_reviewer: req.query.assigned_reviewer as string,
      spec_section: req.query.spec_section as string,
      priority: req.query.priority as string,
      overdue_only: req.query.overdue_only === 'true',
      due_this_week: req.query.due_this_week === 'true',
      search: req.query.search as string,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
      sort_by: req.query.sort_by as string,
      sort_order: req.query.sort_order as 'asc' | 'desc'
    };
    
    const result = await submittalService.getAll(filters);
    res.json(result);
  } catch (error: any) {
    console.error('Error fetching submittals:', error);
    res.status(500).json({ error: 'Failed to fetch submittals', details: error.message });
  }
});

/**
 * @route POST /api/submittals
 * @desc Create a new submittal
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const input: CreateSubmittalInput = {
      ...req.body,
      created_by: req.body.created_by || (req as any).user?.id
    };
    
    const submittal = await submittalService.create(input);
    res.status(201).json(submittal);
  } catch (error: any) {
    console.error('Error creating submittal:', error);
    res.status(500).json({ error: 'Failed to create submittal', details: error.message });
  }
});

/**
 * @route GET /api/submittals/stats/:projectId
 * @desc Get submittal statistics for a project
 */
router.get('/stats/:projectId', async (req: Request, res: Response) => {
  try {
    const stats = await submittalService.getStats(req.params.projectId);
    res.json(stats);
  } catch (error: any) {
    console.error('Error fetching submittal stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats', details: error.message });
  }
});

/**
 * @route GET /api/submittals/by-spec/:projectId
 * @desc Get submittals grouped by spec section
 */
router.get('/by-spec/:projectId', async (req: Request, res: Response) => {
  try {
    const data = await submittalService.getBySpecSection(req.params.projectId);
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching submittals by spec:', error);
    res.status(500).json({ error: 'Failed to fetch data', details: error.message });
  }
});

/**
 * @route GET /api/submittals/:id
 * @desc Get a submittal by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const submittal = await submittalService.getById(req.params.id);
    if (!submittal) {
      return res.status(404).json({ error: 'Submittal not found' });
    }
    res.json(submittal);
  } catch (error: any) {
    console.error('Error fetching submittal:', error);
    res.status(500).json({ error: 'Failed to fetch submittal', details: error.message });
  }
});

/**
 * @route PUT /api/submittals/:id
 * @desc Update a submittal
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const input: UpdateSubmittalInput = {
      ...req.body,
      updated_by: req.body.updated_by || (req as any).user?.id
    };
    
    const submittal = await submittalService.update(req.params.id, input);
    if (!submittal) {
      return res.status(404).json({ error: 'Submittal not found' });
    }
    res.json(submittal);
  } catch (error: any) {
    console.error('Error updating submittal:', error);
    res.status(500).json({ error: 'Failed to update submittal', details: error.message });
  }
});

/**
 * @route POST /api/submittals/:id/submit
 * @desc Submit for review
 */
router.post('/:id/submit', async (req: Request, res: Response) => {
  try {
    const userId = req.body.user_id || (req as any).user?.id;
    const submittal = await submittalService.submit(req.params.id, userId);
    if (!submittal) {
      return res.status(404).json({ error: 'Submittal not found' });
    }
    res.json(submittal);
  } catch (error: any) {
    console.error('Error submitting submittal:', error);
    res.status(400).json({ error: 'Failed to submit', details: error.message });
  }
});

/**
 * @route POST /api/submittals/:id/assign
 * @desc Assign a reviewer
 */
router.post('/:id/assign', async (req: Request, res: Response) => {
  try {
    const { reviewer_id } = req.body;
    const assignedBy = req.body.assigned_by || (req as any).user?.id;
    
    if (!reviewer_id) {
      return res.status(400).json({ error: 'reviewer_id is required' });
    }
    
    const submittal = await submittalService.assignReviewer(req.params.id, reviewer_id, assignedBy);
    if (!submittal) {
      return res.status(404).json({ error: 'Submittal not found' });
    }
    res.json(submittal);
  } catch (error: any) {
    console.error('Error assigning reviewer:', error);
    res.status(500).json({ error: 'Failed to assign reviewer', details: error.message });
  }
});

/**
 * @route POST /api/submittals/:id/review
 * @desc Review a submittal
 */
router.post('/:id/review', async (req: Request, res: Response) => {
  try {
    const input: SubmittalReviewInput = {
      reviewer_id: req.body.reviewer_id || (req as any).user?.id,
      status: req.body.status,
      comments: req.body.comments,
      stamp_applied: req.body.stamp_applied,
      stamp_type: req.body.stamp_type,
      attachments: req.body.attachments
    };
    
    if (!input.status) {
      return res.status(400).json({ error: 'status is required' });
    }
    
    const submittal = await submittalService.review(req.params.id, input);
    if (!submittal) {
      return res.status(404).json({ error: 'Submittal not found' });
    }
    res.json(submittal);
  } catch (error: any) {
    console.error('Error reviewing submittal:', error);
    res.status(400).json({ error: 'Failed to review', details: error.message });
  }
});

/**
 * @route POST /api/submittals/:id/void
 * @desc Void a submittal
 */
router.post('/:id/void', async (req: Request, res: Response) => {
  try {
    const userId = req.body.user_id || (req as any).user?.id;
    const submittal = await submittalService.void(req.params.id, userId, req.body.reason);
    if (!submittal) {
      return res.status(404).json({ error: 'Submittal not found' });
    }
    res.json(submittal);
  } catch (error: any) {
    console.error('Error voiding submittal:', error);
    res.status(500).json({ error: 'Failed to void submittal', details: error.message });
  }
});

/**
 * @route POST /api/submittals/:id/attachments
 * @desc Add attachments to a submittal
 */
router.post('/:id/attachments', async (req: Request, res: Response) => {
  try {
    const userId = req.body.user_id || (req as any).user?.id;
    const submittal = await submittalService.addAttachments(req.params.id, req.body.attachments, userId);
    if (!submittal) {
      return res.status(404).json({ error: 'Submittal not found' });
    }
    res.json(submittal);
  } catch (error: any) {
    console.error('Error adding attachments:', error);
    res.status(500).json({ error: 'Failed to add attachments', details: error.message });
  }
});

/**
 * @route GET /api/submittals/:id/reviews
 * @desc Get all reviews for a submittal
 */
router.get('/:id/reviews', async (req: Request, res: Response) => {
  try {
    const reviews = await submittalService.getReviews(req.params.id);
    res.json(reviews);
  } catch (error: any) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ error: 'Failed to fetch reviews', details: error.message });
  }
});

/**
 * @route GET /api/submittals/:id/history
 * @desc Get history for a submittal
 */
router.get('/:id/history', async (req: Request, res: Response) => {
  try {
    const history = await submittalService.getHistory(req.params.id);
    res.json(history);
  } catch (error: any) {
    console.error('Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch history', details: error.message });
  }
});

/**
 * @route DELETE /api/submittals/:id
 * @desc Delete a submittal (draft only)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const deleted = await submittalService.delete(req.params.id, userId);
    if (!deleted) {
      return res.status(404).json({ error: 'Submittal not found' });
    }
    res.json({ success: true, message: 'Submittal deleted' });
  } catch (error: any) {
    console.error('Error deleting submittal:', error);
    res.status(400).json({ error: 'Failed to delete submittal', details: error.message });
  }
});

// Package routes

/**
 * @route POST /api/submittals/packages
 * @desc Create a submittal package
 */
router.post('/packages', async (req: Request, res: Response) => {
  try {
    const pkg = await submittalService.createPackage(req.body.project_id, {
      package_number: req.body.package_number,
      title: req.body.title,
      description: req.body.description,
      due_date: req.body.due_date,
      created_by: req.body.created_by || (req as any).user?.id
    });
    res.status(201).json(pkg);
  } catch (error: any) {
    console.error('Error creating package:', error);
    res.status(500).json({ error: 'Failed to create package', details: error.message });
  }
});

/**
 * @route GET /api/submittals/packages/:id
 * @desc Get a package with its submittals
 */
router.get('/packages/:id', async (req: Request, res: Response) => {
  try {
    const pkg = await submittalService.getPackage(req.params.id);
    if (!pkg) {
      return res.status(404).json({ error: 'Package not found' });
    }
    res.json(pkg);
  } catch (error: any) {
    console.error('Error fetching package:', error);
    res.status(500).json({ error: 'Failed to fetch package', details: error.message });
  }
});

/**
 * @route POST /api/submittals/packages/:id/items
 * @desc Add a submittal to a package
 */
router.post('/packages/:id/items', async (req: Request, res: Response) => {
  try {
    await submittalService.addToPackage(req.params.id, req.body.submittal_id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error adding to package:', error);
    res.status(500).json({ error: 'Failed to add to package', details: error.message });
  }
});

export default router;
