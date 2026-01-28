import { Router } from 'express';
import { body, param } from 'express-validator';
import { constructionOpsService } from '../services/project-management/constructionOpsService';
import { logger } from '../utils/logger';

const router = Router();

// ============================================================================
// SITE DIARY (Informal Labor Tracking)
// ============================================================================
router.post(
  '/projects/:projectId/site-diary',
  [
    param('projectId').isUUID(),
    body('reportDate').isISO8601(),
    body('weatherCondition').isString(),
    body('informalLaborCount').isInt({ min: 0 })
  ],
  async (req: any, res: any) => {
    try {
      const { projectId } = req.params;
      const result = await constructionOpsService.logSiteDiary({
        projectId,
        ...req.body,
        submittedBy: req.user?.id 
      });
      res.status(201).json(result);
    } catch (error: any) {
      logger.error(`Failed to log site diary: ${error.message}`);
      res.status(500).json({ error: 'Failed to log site diary' });
    }
  }
);

// ============================================================================
// PETTY CASH (Chop Money)
// ============================================================================
router.post(
  '/projects/:projectId/petty-cash',
  [
    param('projectId').isUUID(),
    body('amount').isFloat({ min: 0 }),
    body('recipientName').isString(),
    body('category').isIn(['transport', 'food', 'tips', 'airtime', 'misc'])
  ],
  async (req: any, res: any) => {
    try {
      const { projectId } = req.params;
      const result = await constructionOpsService.recordPettyCash({
        projectId,
        ...req.body,
        requestedBy: req.user?.id
      });
      res.status(201).json(result);
    } catch (error: any) {
      logger.error(`Failed to record petty cash: ${error.message}`);
      res.status(500).json({ error: 'Failed to record petty cash' });
    }
  }
);

// ============================================================================
// MATERIAL PRICE INTELLIGENCE
// ============================================================================
router.get(
  '/market-intelligence/prices',
  [
    // optional query params
  ],
  async (req: any, res: any) => {
    try {
      const { region, category } = req.query;
      const result = await constructionOpsService.getMarketPrices({ 
        region: region as string, 
        category: category as string 
      });
      res.json(result);
    } catch (error: any) {
      logger.error(`Failed to fetch price intel: ${error.message}`);
      res.status(500).json({ error: 'Failed to fetch price intel' });
    }
  }
);

export default router;
