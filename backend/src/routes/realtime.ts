/**
 * Real-time SSE Routes
 * Handles Server-Sent Events connections and presence tracking
 * Phase 5.11: Real-time & Calendar Features
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { realtimeEmitter } from '../../shared-services/realtime';
import { requirePMWrite } from '../middleware/pmAuth';
import { logger } from '../utils/logger';

const router = Router();

// Middleware to get user context
const getUserContext = (req: Request) => {
  const userId = req.headers['x-user-id'] as string || 'anonymous';
  const organizationId = req.headers['x-organization-id'] as string || 'default';
  return { userId, organizationId };
};

/**
 * @route GET /api/v1/realtime/events
 * @desc Establish SSE connection for real-time events
 * @access Private
 */
router.get('/events', (req: Request, res: Response) => {
  const { userId, organizationId } = getUserContext(req);
  const clientId = uuidv4();
  
  // Add client to the emitter
  realtimeEmitter.addClient(clientId, userId, organizationId, res);
  
  // Handle client disconnect via request close
  req.on('close', () => {
    logger.debug('SSE connection closed by client', { clientId });
  });
});

/**
 * @route POST /api/v1/realtime/subscribe
 * @desc Subscribe to specific channels
 * @access Private
 */
router.post('/subscribe', requirePMWrite, (req: Request, res: Response) => {
  const { clientId, channels } = req.body;
  
  if (!clientId || !Array.isArray(channels)) {
    return res.status(400).json({
      success: false,
      error: 'clientId and channels array required',
    });
  }
  
  for (const channel of channels) {
    realtimeEmitter.subscribe(clientId, channel);
  }
  
  res.json({ success: true, subscribedChannels: channels });
});

/**
 * @route POST /api/v1/realtime/unsubscribe
 * @desc Unsubscribe from specific channels
 * @access Private
 */
router.post('/unsubscribe', requirePMWrite, (req: Request, res: Response) => {
  const { clientId, channels } = req.body;
  
  if (!clientId || !Array.isArray(channels)) {
    return res.status(400).json({
      success: false,
      error: 'clientId and channels array required',
    });
  }
  
  for (const channel of channels) {
    realtimeEmitter.unsubscribe(clientId, channel);
  }
  
  res.json({ success: true, unsubscribedChannels: channels });
});

/**
 * @route GET /api/v1/realtime/replay
 * @desc Get recent events for replay (after reconnection)
 * @access Private
 */
router.get('/replay', async (req: Request, res: Response) => {
  try {
    const { organizationId } = getUserContext(req);
    const since = req.query.since ? new Date(req.query.since as string) : new Date(Date.now() - 5 * 60 * 1000);
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    
    const events = await realtimeEmitter.getRecentEvents(organizationId, since, limit);
    
    res.json({
      success: true,
      data: events,
      meta: { count: events.length, since },
    });
  } catch (error) {
    logger.error('Failed to get replay events', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to get replay events' });
  }
});

/**
 * @route GET /api/v1/realtime/presence/:resourceType/:resourceId
 * @desc Get current presence for a resource
 * @access Private
 */
router.get('/presence/:resourceType/:resourceId', async (req: Request, res: Response) => {
  try {
    const { resourceType, resourceId } = req.params;
    const presence = await realtimeEmitter.getPresence(resourceType, resourceId);
    
    res.json({
      success: true,
      data: presence,
    });
  } catch (error) {
    logger.error('Failed to get presence', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to get presence' });
  }
});

/**
 * @route POST /api/v1/realtime/presence
 * @desc Update user presence
 * @access Private
 */
router.post('/presence', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const { userId, organizationId } = getUserContext(req);
    const { sessionId, resourceType, resourceId, action, userInfo } = req.body;
    
    if (!sessionId || !resourceType || !resourceId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId, resourceType, and resourceId required',
      });
    }
    
    await realtimeEmitter.updatePresence(
      userId,
      organizationId,
      sessionId,
      resourceType,
      resourceId,
      action || 'viewing',
      userInfo || {}
    );
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to update presence', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to update presence' });
  }
});

/**
 * @route DELETE /api/v1/realtime/presence
 * @desc Remove user presence
 * @access Private
 */
router.delete('/presence', requirePMWrite, async (req: Request, res: Response) => {
  try {
    const { userId } = getUserContext(req);
    const { sessionId, resourceType, resourceId } = req.body;
    
    if (!sessionId || !resourceType || !resourceId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId, resourceType, and resourceId required',
      });
    }
    
    await realtimeEmitter.removePresence(userId, sessionId, resourceType, resourceId);
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Failed to remove presence', { error: (error as Error).message });
    res.status(500).json({ success: false, error: 'Failed to remove presence' });
  }
});

/**
 * @route GET /api/v1/realtime/stats
 * @desc Get real-time connection stats (admin only)
 * @access Private (Admin)
 */
router.get('/stats', (_req: Request, res: Response) => {
  const stats = realtimeEmitter.getStats();
  res.json({
    success: true,
    data: stats,
  });
});

export default router;
