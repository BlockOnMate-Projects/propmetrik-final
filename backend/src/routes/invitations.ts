/**
 * Unified Invitations Router
 *
 * Public (token-based) routes are defined BEFORE router.use(authenticate)
 * so they can be accessed by unauthenticated users clicking invite links.
 *
 * Authenticated management routes are defined AFTER.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { requireCanInvite } from '../middleware/serviceAccess';
import { inviteService, CreateInvitationInput } from '../services/shared/inviteService';
import { logger } from '../utils/logger';

const router = Router();

// ---------------------------------------------------------------------------
// PUBLIC routes — no authentication required (token-based access)
// ---------------------------------------------------------------------------

/**
 * GET /token/:token — Get invitation details for the accept-invite page.
 */
router.get('/token/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const details = await inviteService.getInvitationByToken(req.params.token);
    if (!details) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // Do NOT expose token value in the response — caller already has it
    return res.json({ invitation: details });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /token/:token/accept — Accept invitation and set password.
 */
router.post('/token/:token/accept', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { password, firstName, lastName } = req.body;

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Password is required' });
    }

    const result = await inviteService.acceptInvitation({
      token: req.params.token,
      password,
      firstName,
      lastName,
    });

    return res.json({
      message: 'Invitation accepted successfully',
      userId: result.userId,
      redirectUrl: result.redirectUrl,
    });
  } catch (err: any) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
// AUTHENTICATED routes — require login + authorization
// ---------------------------------------------------------------------------
router.use(authenticate);

/**
 * POST / — Create a new invitation.
 * Requires: invitations.create
 */
router.post('/', requireCanInvite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      email, role, userType, firstName, lastName,
      message, propertyId, tenancyId, department, teamId, expiryDays,
      serviceKey, serviceRole,
    } = req.body;

    if (!email || !role) {
      return res.status(400).json({ error: 'Email and role are required' });
    }

    const organizationId = (req as any).user?.organizationId;
    const invitedById = (req as any).user?.id;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context is required' });
    }

    const invitation = await inviteService.createInvitation({
      email,
      role,
      userType: userType || 'staff',
      organizationId,
      invitedById,
      firstName,
      lastName,
      message,
      propertyId,
      tenancyId,
      department,
      teamId,
      expiryDays,
      serviceKey,
      serviceRole,
    });

    // Omit token from response — only sent via email
    const { token: _token, ...safeInvitation } = invitation;
    return res.status(201).json({ invitation: safeInvitation });
  } catch (err: any) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
});

/**
 * GET / — List invitations for the current organization.
 * Requires: invitations.read
 */
router.get('/', authorize('invitations', 'read'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as any).user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context is required' });
    }

    const { status, userType, serviceKey } = req.query;

    const invitations = await inviteService.listInvitations(organizationId, {
      status: status as any,
      userType: userType as any,
      serviceKey: serviceKey as string | undefined,
    });

    // Strip tokens from list response
    const safeInvitations = invitations.map(({ token: _t, ...rest }) => rest);
    return res.json({ invitations: safeInvitations });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /:id — Cancel a pending invitation.
 * Requires: invitations.manage
 */
router.delete('/:id', requireCanInvite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cancelledById = (req as any).user?.id;
    await inviteService.cancelInvitation(req.params.id, cancelledById);
    return res.json({ message: 'Invitation cancelled' });
  } catch (err: any) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
});

/**
 * POST /:id/resend — Resend invitation email (extends expiry).
 * Requires: invitations.manage
 */
router.post('/:id/resend', requireCanInvite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const resentById = (req as any).user?.id;
    const invitation = await inviteService.resendInvitation(req.params.id, resentById);
    const { token: _t, ...safe } = invitation;
    return res.json({ invitation: safe, message: 'Invitation resent' });
  } catch (err: any) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
});

/**
 * POST /bulk — Bulk invite multiple users.
 * Requires: invitations.manage
 */
router.post('/bulk', requireCanInvite, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { invitations: inviteList, userType, message } = req.body;

    if (!Array.isArray(inviteList) || inviteList.length === 0) {
      return res.status(400).json({ error: 'invitations array is required' });
    }

    if (inviteList.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 invitations per batch' });
    }

    const organizationId = (req as any).user?.organizationId;
    const invitedById = (req as any).user?.id;

    if (!organizationId) {
      return res.status(400).json({ error: 'Organization context is required' });
    }

    const result = await inviteService.bulkInvite({
      invitations: inviteList,
      userType: userType || 'staff',
      organizationId,
      invitedById,
      message,
    });

    return res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
