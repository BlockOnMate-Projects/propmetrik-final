/**
 * Autopilot API Routes
 *
 * REST endpoints for the autonomous publication pipeline.
 * All routes are admin-only and require authentication.
 *
 * Mounted at:
 *   /api/v1/autopilot
 *   /api/autopilot
 */
import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { pool } from '../database';
import { autopilotPipeline } from '../services/publications/autopilot/autopilotPipeline';
import { autopilotScheduler } from '../services/publications/autopilot/autopilotScheduler';
import { PUBLICATION_TEMPLATES } from '../services/publications/autopilot/templates';
import type { AutopilotSchedule } from '../services/publications/autopilot/types';

const router = Router();

// Helper to extract user context from headers
const getUserContext = (req: Request) => {
  const userId = req.headers['x-user-id'] as string || 'anonymous';
  const organizationId = req.headers['x-organization-id'] as string || '00000000-0000-0000-0000-000000000001';
  return { userId, organizationId };
};

// ============================================================
// 1. MANUAL TRIGGER
// ============================================================

/**
 * POST /run/:product
 * Manually trigger an autonomous pipeline run for a given product.
 * Optionally pass edition and region in query params.
 */
router.post('/run/:product', async (req: Request, res: Response) => {
  try {
    const { product } = req.params;
    const edition = (req.query.edition as string) || null;
    const region = (req.query.region as string) || null;
    const { userId } = getUserContext(req);

    logger.info({ product, edition, region, triggeredBy: userId }, 'Manual autopilot run triggered');

    // Find matching schedule
    const scheduleResult = await pool.query(
      `SELECT * FROM autopilot_schedules
       WHERE product = $1
         AND ($2::text IS NULL OR edition = $2)
         AND ($3::text IS NULL OR region = $3)
       LIMIT 1`,
      [product, edition, region],
    );

    if (scheduleResult.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'SCHEDULE_NOT_FOUND', message: `No autopilot schedule for product "${product}" edition "${edition}"` },
      });
    }

    const schedule = scheduleResult.rows[0] as AutopilotSchedule;

    // Fire and forget the pipeline execution (pipeline creates its own run record)
    autopilotPipeline.execute(schedule).then(result => {
      logger.info({ product, edition, region, status: result.status }, 'Manual autopilot run completed');
    }).catch(err => {
      logger.error({ product, edition, region, error: (err as Error).message }, 'Manual autopilot run failed');
    });

    res.status(202).json({
      message: 'Autopilot run started',
      product: schedule.product,
      edition: schedule.edition,
      region: schedule.region,
    });
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to trigger autopilot run');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to trigger autopilot run' } });
  }
});

// ============================================================
// 2. SCHEDULES — CRUD
// ============================================================

/**
 * GET /schedules
 * List all autopilot schedules.
 */
router.get('/schedules', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT s.*,
              (SELECT COUNT(*) FROM autopilot_runs r
               WHERE r.schedule_id = s.id AND r.status = 'published'
               AND r.started_at > NOW() - INTERVAL '30 days') AS recent_published,
              (SELECT COUNT(*) FROM autopilot_runs r
               WHERE r.schedule_id = s.id AND r.status = 'failed'
               AND r.started_at > NOW() - INTERVAL '30 days') AS recent_failed
       FROM autopilot_schedules s
       ORDER BY s.publication_type, s.region`,
    );

    res.json({ schedules: result.rows });
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to fetch autopilot schedules');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch schedules' } });
  }
});

/**
 * GET /schedules/:id
 * Get a single schedule with recent run history.
 */
router.get('/schedules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const scheduleResult = await pool.query(
      `SELECT * FROM autopilot_schedules WHERE id = $1`,
      [id],
    );

    if (scheduleResult.rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Schedule not found' } });
    }

    const runsResult = await pool.query(
      `SELECT id, status, started_at, completed_at, confidence_score, publication_id, trigger_type
       FROM autopilot_runs
       WHERE schedule_id = $1
       ORDER BY started_at DESC
       LIMIT 20`,
      [id],
    );

    res.json({
      schedule: scheduleResult.rows[0],
      recentRuns: runsResult.rows,
    });
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to fetch schedule');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch schedule' } });
  }
});

/**
 * PUT /schedules/:id
 * Update a schedule (cron expression, thresholds, enabled flag, etc.)
 */
router.put('/schedules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      cron_expression,
      enabled,
      quality_thresholds,
      chart_rules,
      template_id,
      data_endpoints,
    } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (cron_expression !== undefined) {
      updates.push(`cron_expression = $${paramIdx++}`);
      values.push(cron_expression);
    }
    if (enabled !== undefined) {
      updates.push(`enabled = $${paramIdx++}`);
      values.push(enabled);
    }
    if (quality_thresholds !== undefined) {
      updates.push(`quality_thresholds = $${paramIdx++}`);
      values.push(JSON.stringify(quality_thresholds));
    }
    if (chart_rules !== undefined) {
      updates.push(`chart_rules = $${paramIdx++}`);
      values.push(JSON.stringify(chart_rules));
    }
    if (template_id !== undefined) {
      updates.push(`template_id = $${paramIdx++}`);
      values.push(template_id);
    }
    if (data_endpoints !== undefined) {
      updates.push(`data_endpoints = $${paramIdx++}`);
      values.push(data_endpoints);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: { code: 'NO_UPDATES', message: 'No fields to update' } });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE autopilot_schedules SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Schedule not found' } });
    }

    // Reload scheduler to pick up changes
    await autopilotScheduler.reload();

    res.json({ schedule: result.rows[0], message: 'Schedule updated and scheduler reloaded' });
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to update schedule');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update schedule' } });
  }
});

// ============================================================
// 3. RUNS
// ============================================================

/**
 * GET /runs
 * List recent pipeline runs with optional filters.
 */
router.get('/runs', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string;
    const type = req.query.type as string;

    let where = 'WHERE 1=1';
    const values: any[] = [];
    let paramIdx = 1;

    if (status) {
      where += ` AND r.status = $${paramIdx++}`;
      values.push(status);
    }
    if (type) {
      where += ` AND r.publication_type = $${paramIdx++}`;
      values.push(type);
    }

    const [runsResult, countResult] = await Promise.all([
      pool.query(
        `SELECT r.*, p.title as publication_title, p.slug as publication_slug, p.status as publication_status
         FROM autopilot_runs r
         LEFT JOIN publications p ON p.id = r.publication_id
         ${where}
         ORDER BY r.started_at DESC
         LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
        [...values, limit, offset],
      ),
      pool.query(
        `SELECT COUNT(*) FROM autopilot_runs r ${where}`,
        values,
      ),
    ]);

    res.json({
      runs: runsResult.rows,
      total: parseInt(countResult.rows[0].count, 10),
      limit,
      offset,
    });
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to fetch runs');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch runs' } });
  }
});

/**
 * GET /runs/:id
 * Get full details of a single run, including data_snapshot and gate_results.
 */
router.get('/runs/:id', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT r.*, p.title as publication_title, p.slug as publication_slug, p.status as publication_status
       FROM autopilot_runs r
       LEFT JOIN publications p ON p.id = r.publication_id
       WHERE r.id = $1`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Run not found' } });
    }

    res.json({ run: result.rows[0] });
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to fetch run');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch run' } });
  }
});

// ============================================================
// 4. PAUSE / RESUME
// ============================================================

/**
 * POST /pause
 * Globally pause the autopilot scheduler.
 */
router.post('/pause', async (_req: Request, res: Response) => {
  try {
    await pool.query(
      `UPDATE autopilot_settings SET global_enabled = false, updated_at = NOW() WHERE id = 1`,
    );
    autopilotScheduler.stop();

    logger.info('Autopilot globally paused');
    res.json({ message: 'Autopilot paused', global_enabled: false });
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to pause autopilot');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to pause' } });
  }
});

/**
 * POST /resume
 * Resume the globally paused autopilot scheduler.
 */
router.post('/resume', async (_req: Request, res: Response) => {
  try {
    await pool.query(
      `UPDATE autopilot_settings SET global_enabled = true, updated_at = NOW() WHERE id = 1`,
    );
    await autopilotScheduler.start();

    logger.info('Autopilot globally resumed');
    res.json({ message: 'Autopilot resumed', global_enabled: true });
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to resume autopilot');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to resume' } });
  }
});

// ============================================================
// 5. HEALTH
// ============================================================

/**
 * GET /health
 * Overview of the autopilot system health, including scheduler status,
 * recent success/failure counts, and settings.
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const [settingsResult, statsResult, schedulerStatus] = await Promise.all([
      pool.query(`SELECT * FROM autopilot_settings WHERE id = 1`),
      pool.query(`
        SELECT
          status,
          COUNT(*) as count
        FROM autopilot_runs
        WHERE started_at > NOW() - INTERVAL '24 hours'
        GROUP BY status
      `),
      Promise.resolve(autopilotScheduler.getStatus()),
    ]);

    const settings = settingsResult.rows[0] || { global_enabled: false };
    const stats: Record<string, number> = {};
    for (const row of statsResult.rows) {
      stats[row.status] = parseInt(row.count, 10);
    }

    res.json({
      health: {
        globalEnabled: settings.global_enabled,
        scheduler: schedulerStatus,
        last24h: {
          published: stats['published'] || 0,
          deferred: stats['deferred'] || 0,
          failed: stats['failed'] || 0,
          running: stats['running'] || 0,
        },
        settings: {
          confidenceFloor: parseFloat(settings.default_confidence_floor) || 0.70,
          maxDailyPublications: settings.max_publishes_per_day || 5,
          maxDailyFlashes: settings.max_flashes_per_day || 2,
        },
      },
    });
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to fetch autopilot health');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch health' } });
  }
});

// ============================================================
// 6. SETTINGS
// ============================================================

/**
 * GET /settings
 * Get global autopilot settings.
 */
router.get('/settings', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT * FROM autopilot_settings WHERE id = 1`);
    res.json({ settings: result.rows[0] || {} });
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to fetch settings');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch settings' } });
  }
});

/**
 * PUT /settings
 * Update global autopilot settings.
 */
router.put('/settings', async (req: Request, res: Response) => {
  try {
    const {
      global_enabled,
      confidence_floor,
      max_daily_publications,
      max_daily_flashes,
    } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (global_enabled !== undefined) {
      updates.push(`global_enabled = $${paramIdx++}`);
      values.push(global_enabled);
    }
    if (confidence_floor !== undefined) {
      updates.push(`confidence_floor = $${paramIdx++}`);
      values.push(confidence_floor);
    }
    if (max_daily_publications !== undefined) {
      updates.push(`max_daily_publications = $${paramIdx++}`);
      values.push(max_daily_publications);
    }
    if (max_daily_flashes !== undefined) {
      updates.push(`max_daily_flashes = $${paramIdx++}`);
      values.push(max_daily_flashes);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: { code: 'NO_UPDATES', message: 'No fields to update' } });
    }

    updates.push(`updated_at = NOW()`);

    const result = await pool.query(
      `UPDATE autopilot_settings SET ${updates.join(', ')} WHERE id = 1 RETURNING *`,
      values,
    );

    // If scheduler enablement changed, reload
    if (global_enabled !== undefined) {
      if (global_enabled) {
        await autopilotScheduler.start();
      } else {
        autopilotScheduler.stop();
      }
    }

    res.json({ settings: result.rows[0], message: 'Settings updated' });
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to update settings');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update settings' } });
  }
});

// ============================================================
// 7. DEFERRED QUEUE
// ============================================================

/**
 * GET /deferred
 * List publications that passed quality gates but were deferred for human review
 * (confidence between floor and 0.85, or manual review flagged).
 */
router.get('/deferred', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await pool.query(
      `SELECT p.id, p.title, p.slug, p.type as publication_type, p.regions, p.excerpt,
              p.quality_gate_results, p.created_at,
              r.confidence_score, r.id as run_id, r.deferred_reason
       FROM publications p
       JOIN autopilot_runs r ON r.publication_id = p.id
       WHERE p.automation_mode = 'autopilot'
         AND p.status = 'under_review'
       ORDER BY p.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    res.json({ deferred: result.rows, limit, offset });
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to fetch deferred publications');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch deferred' } });
  }
});

/**
 * POST /deferred/:publicationId/approve
 * Approve and publish a deferred publication.
 */
router.post('/deferred/:publicationId/approve', async (req: Request, res: Response) => {
  try {
    const { publicationId } = req.params;
    const { userId } = getUserContext(req);

    // Update publication status to published
    const result = await pool.query(
      `UPDATE publications
       SET status = 'published',
           published_at = NOW(),
           updated_at = NOW(),
           auto_approved_at = NOW()
       WHERE id = $1
         AND automation_mode = 'autopilot'
         AND status = 'under_review'
       RETURNING id, title`,
      [publicationId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Deferred publication not found or already published' },
      });
    }

    // Update the corresponding run
    await pool.query(
      `UPDATE autopilot_runs
       SET status = 'published', completed_at = NOW()
       WHERE publication_id = $1 AND status = 'deferred'`,
      [publicationId],
    );

    logger.info({ publicationId, approvedBy: userId }, 'Deferred publication approved');

    res.json({ message: 'Publication approved and published', publication: result.rows[0] });
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to approve deferred publication');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to approve' } });
  }
});

/**
 * DELETE /deferred/:publicationId
 * Reject and discard a deferred publication.
 */
router.delete('/deferred/:publicationId', async (req: Request, res: Response) => {
  try {
    const { publicationId } = req.params;
    const { userId } = getUserContext(req);

    // Mark publication as archived/rejected
    const result = await pool.query(
      `UPDATE publications
       SET status = 'archived',
           updated_at = NOW()
       WHERE id = $1
         AND automation_mode = 'autopilot'
         AND status = 'under_review'
       RETURNING id, title`,
      [publicationId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Deferred publication not found' },
      });
    }

    // Update the corresponding run
    await pool.query(
      `UPDATE autopilot_runs
       SET status = 'failed', completed_at = NOW(),
           error_message = 'Rejected by human reviewer'
       WHERE publication_id = $1 AND status = 'deferred'`,
      [publicationId],
    );

    logger.info({ publicationId, rejectedBy: userId }, 'Deferred publication rejected');

    res.json({ message: 'Publication rejected', publication: result.rows[0] });
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Failed to reject deferred publication');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to reject' } });
  }
});

// ============================================================
// 8. TEMPLATES
// ============================================================

/**
 * GET /templates
 * List all available publication templates for autopilot.
 */
router.get('/templates', (_req: Request, res: Response) => {
  const templates = Object.entries(PUBLICATION_TEMPLATES).map(([id, tmpl]) => ({
    id,
    product: tmpl.product,
    edition: tmpl.edition,
    name: tmpl.name,
    targetWordCount: tmpl.wordCountTarget,
    chartCountRange: tmpl.chartCountRange,
    sectionCount: tmpl.sections.length,
  }));

  res.json({ templates });
});

export default router;
