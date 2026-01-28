/**
 * Portfolio Routes
 * API endpoints for portfolio/multi-project overview
 * Phase 3A Week 2
 */

import { Router, Request, Response } from 'express';
import portfolioService, { PortfolioFilters } from '../services/project-management/portfolioService';

const router = Router();

/**
 * @route GET /api/portfolio/summary
 * @desc Get portfolio summary across all projects
 */
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const summary = await portfolioService.getSummary(userId);
    res.json(summary);
  } catch (error: any) {
    console.error('Error fetching portfolio summary:', error);
    res.status(500).json({ error: 'Failed to fetch portfolio summary', details: error.message });
  }
});

/**
 * @route GET /api/portfolio/projects
 * @desc Get all projects with overview data
 */
router.get('/projects', async (req: Request, res: Response) => {
  try {
    const filters: PortfolioFilters = {
      region: req.query.region as string,
      status: req.query.status as string,
      phase: req.query.phase as string,
      health_status: req.query.health_status as string,
      search: req.query.search as string,
      sort_by: req.query.sort_by as string,
      sort_order: req.query.sort_order as 'asc' | 'desc'
    };
    
    const projects = await portfolioService.getProjects(filters);
    res.json(projects);
  } catch (error: any) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects', details: error.message });
  }
});

/**
 * @route GET /api/portfolio/metrics
 * @desc Get portfolio metrics for charts
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = await portfolioService.getMetrics();
    res.json(metrics);
  } catch (error: any) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics', details: error.message });
  }
});

/**
 * @route GET /api/portfolio/activity
 * @desc Get recent activity feed across all projects
 */
router.get('/activity', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const activity = await portfolioService.getActivityFeed(limit);
    res.json(activity);
  } catch (error: any) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity', details: error.message });
  }
});

/**
 * @route GET /api/portfolio/deadlines
 * @desc Get upcoming deadlines across all projects
 */
router.get('/deadlines', async (req: Request, res: Response) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string) : 14;
    const deadlines = await portfolioService.getUpcomingDeadlines(days);
    res.json(deadlines);
  } catch (error: any) {
    console.error('Error fetching deadlines:', error);
    res.status(500).json({ error: 'Failed to fetch deadlines', details: error.message });
  }
});

export default router;
