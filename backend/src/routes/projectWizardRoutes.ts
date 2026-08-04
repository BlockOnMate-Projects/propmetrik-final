/**
 * Project Wizard Routes
 * Multi-step project creation wizard and draft management.
 */

import { Router, Request, Response, NextFunction } from 'express';
import projectWizardService from '../services/project-management/projectWizardService';
import {
  registerPMParamValidation,
  registerProjectAccessParams,
  getAuthUserId,
  getAuthOrgId,
  requirePMWrite,
} from '../middleware/pmAuth';

const router = Router();

registerPMParamValidation(router);
registerProjectAccessParams(router, ['draftId']);

const getOrgId = (req: Request): string => getAuthOrgId(req);
const getUserId = (req: Request): string => getAuthUserId(req);

router.get('/wizard/templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const { projectType } = req.query;
    const templates = await projectWizardService.getTemplates(orgId, projectType as any);
    res.json(templates);
  } catch (error) {
    next(error);
  }
});

router.get('/wizard/drafts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const drafts = await projectWizardService.getUserDrafts(orgId, userId);
    res.json(drafts);
  } catch (error) {
    next(error);
  }
});

router.post('/wizard/drafts', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const orgId = getOrgId(req);
    const { templateId, draftName, draftType, sourceProjectId } = req.body;

    const draft = await projectWizardService.createDraft({
      organization_id: orgId,
      created_by: userId,
      draft_name: draftName,
      draft_type: draftType || 'new_project',
      source_template_id: templateId,
      source_project_id: sourceProjectId,
    });
    res.status(201).json(draft);
  } catch (error) {
    next(error);
  }
});

router.get('/wizard/drafts/:draftId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const draft = await projectWizardService.getDraftById(req.params.draftId, orgId);

    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    res.json(draft);
  } catch (error) {
    next(error);
  }
});

router.patch('/wizard/drafts/:draftId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const { step, data, isAutoSave } = req.body;

    const draft = await projectWizardService.updateDraft(req.params.draftId, orgId, {
      step,
      data,
      is_auto_save: isAutoSave,
      last_edited_by: userId,
    });

    res.json(draft);
  } catch (error) {
    next(error);
  }
});

router.post(
  '/wizard/drafts/:draftId/validate-step',
  requirePMWrite,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = getOrgId(req);
      const { step } = req.body;

      const validation = await projectWizardService.validateStep(req.params.draftId, orgId, step);

      res.json(validation);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/wizard/drafts/:draftId/complete-step',
  requirePMWrite,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = getOrgId(req);
      const { stepNumber } = req.body;

      const draft = await projectWizardService.completeStep(req.params.draftId, orgId, stepNumber);

      res.json(draft);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/wizard/drafts/:draftId/cost-estimate',
  requirePMWrite,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = getOrgId(req);

      const estimate = await projectWizardService.generateCostEstimate(req.params.draftId, orgId);

      res.json(estimate);
    } catch (error) {
      next(error);
    }
  },
);

router.post('/wizard/drafts/:draftId/submit', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);

    const project = await projectWizardService.submitWizard(req.params.draftId, orgId, userId);

    res.status(201).json(project);
  } catch (error) {
    next(error);
  }
});

router.delete('/wizard/drafts/:draftId', requirePMWrite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = getOrgId(req);

    await projectWizardService.deleteDraft(req.params.draftId, orgId);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
