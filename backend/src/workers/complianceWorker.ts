/**
 * Compliance Alerts Worker
 * Phase 3: Compliance & Document Management
 * 
 * Handles:
 * - Permit expiration monitoring and alerts
 * - Document expiration notifications
 * - Compliance score recalculation
 * - Inspection reminders
 * - Renewal deadline tracking
 */

// @ts-ignore
import { Queue, Worker, Job } from 'bullmq';
import { pool } from '../database';
import { logger } from '../utils/logger';
import { complianceService } from '../services/project-management/complianceService';
import { projectDocumentService } from '../services/project-management/projectDocumentService';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');

const connection = {
  host: REDIS_HOST,
  port: REDIS_PORT
};

// =====================================================
// COMPLIANCE QUEUE
// =====================================================

export const complianceQueue = new Queue('compliance', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: 100,
    removeOnFail: 500
  }
});

// =====================================================
// JOB TYPES
// =====================================================

interface ExpirationCheckJob {
  type: 'expiration_check';
  organization_id: string;
}

interface ComplianceScoreRecalcJob {
  type: 'recalc_scores';
  organization_id?: string;
  project_id?: string;
}

interface InspectionReminderJob {
  type: 'inspection_reminder';
  permit_id: string;
  inspection_id: string;
  scheduled_date: string;
}

interface RenewalAlertJob {
  type: 'renewal_alert';
  permit_id: string;
  days_until_expiry: number;
}

interface DocumentExpirationJob {
  type: 'document_expiration';
  organization_id: string;
}

interface DailyComplianceDigestJob {
  type: 'daily_digest';
  organization_id: string;
}

type ComplianceJob = 
  | ExpirationCheckJob 
  | ComplianceScoreRecalcJob 
  | InspectionReminderJob
  | RenewalAlertJob
  | DocumentExpirationJob
  | DailyComplianceDigestJob;

// =====================================================
// WORKER
// =====================================================

export const complianceWorker = new Worker<ComplianceJob>(
  'compliance',
  async (job: Job<ComplianceJob>) => {
    const data = job.data;
    
    logger.info({ jobId: job.id, jobType: data.type }, 'Processing compliance job');
    
    try {
      switch (data.type) {
        case 'expiration_check':
          await processExpirationCheck(data.organization_id);
          break;
          
        case 'recalc_scores':
          await processScoreRecalculation(data.organization_id, data.project_id);
          break;
          
        case 'inspection_reminder':
          await processInspectionReminder(data.permit_id, data.inspection_id, data.scheduled_date);
          break;
          
        case 'renewal_alert':
          await processRenewalAlert(data.permit_id, data.days_until_expiry);
          break;
          
        case 'document_expiration':
          await processDocumentExpiration(data.organization_id);
          break;
          
        case 'daily_digest':
          await processDailyDigest(data.organization_id);
          break;
          
        default:
          logger.warn({ jobData: data }, 'Unknown compliance job type');
      }
      
      logger.info({ jobId: job.id }, 'Compliance job completed');
    } catch (error) {
      logger.error({ 
        jobId: job.id, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'Compliance job failed');
      throw error;
    }
  },
  { connection, concurrency: 5 }
);

// =====================================================
// JOB PROCESSORS
// =====================================================

/**
 * Check for expiring permits and queue renewal alerts
 */
async function processExpirationCheck(organizationId: string): Promise<void> {
  logger.info({ organizationId }, 'Running permit expiration check');
  
  // Get permits expiring in next 7, 14, 30, 60 days
  const checkDays = [7, 14, 30, 60];
  
  for (const days of checkDays) {
    const expiringPermits = await complianceService.getExpiringPermits(organizationId, days);
    
    for (const permit of expiringPermits) {
      // Calculate actual days until expiry
      const expirationDate = new Date(permit.expiration_date!);
      const today = new Date();
      const daysUntilExpiry = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      // Only send if within the check window and reminder not already sent
      if (daysUntilExpiry === days && !permit.renewal_reminder_sent) {
        await complianceQueue.add(
          `renewal-${permit.id}-${days}`,
          {
            type: 'renewal_alert',
            permit_id: permit.id,
            days_until_expiry: daysUntilExpiry,
          },
          {
            jobId: `renewal-${permit.id}-${days}-${new Date().toISOString().split('T')[0]}`,
          }
        );
      }
    }
  }
  
  // Also update expired permits status
  const expiredPermits = await complianceService.getExpiredPermits(organizationId);
  for (const permit of expiredPermits) {
    if (permit.status !== 'expired') {
      await complianceService.updatePermit(permit.id, { status: 'expired' });
    }
  }
}

/**
 * Recalculate compliance scores for organization or specific project
 */
async function processScoreRecalculation(
  organizationId?: string,
  projectId?: string
): Promise<void> {
  if (projectId) {
    logger.info({ projectId }, 'Recalculating compliance score for project');
    
    const projectResult = await pool.query(
      'SELECT organization_id FROM development_projects WHERE id = $1',
      [projectId]
    );
    
    if (projectResult.rows[0]) {
      await complianceService.calculateComplianceScore(
        projectId, 
        projectResult.rows[0].organization_id
      );
    }
  } else if (organizationId) {
    logger.info({ organizationId }, 'Recalculating compliance scores for organization');
    
    const projectsResult = await pool.query(
      `SELECT id FROM development_projects 
       WHERE organization_id = $1 AND status NOT IN ('completed', 'cancelled')`,
      [organizationId]
    );
    
    for (const project of projectsResult.rows) {
      await complianceService.calculateComplianceScore(project.id, organizationId);
    }
  }
}

/**
 * Send inspection reminder notification
 */
async function processInspectionReminder(
  permitId: string,
  inspectionId: string,
  scheduledDate: string
): Promise<void> {
  logger.info({ permitId, inspectionId, scheduledDate }, 'Processing inspection reminder');
  
  const permit = await complianceService.getPermitById(permitId);
  if (!permit) {
    logger.warn({ permitId }, 'Permit not found for inspection reminder');
    return;
  }
  
  const projectResult = await pool.query(
    'SELECT name, project_manager_id FROM development_projects WHERE id = $1',
    [permit.project_id]
  );
  
  const project = projectResult.rows[0];
  if (!project) return;
  
  // Create notification
  await createNotification({
    organization_id: permit.organization_id,
    user_id: project.project_manager_id,
    title: 'Upcoming Inspection',
    message: `Inspection scheduled for ${permit.permit_name} on ${new Date(scheduledDate).toLocaleDateString('en-GB')}`,
    type: 'inspection_reminder',
    reference_type: 'permit',
    reference_id: permitId,
    project_id: permit.project_id,
  });
}

/**
 * Send renewal alert notification
 */
async function processRenewalAlert(
  permitId: string,
  daysUntilExpiry: number
): Promise<void> {
  logger.info({ permitId, daysUntilExpiry }, 'Processing renewal alert');
  
  const permit = await complianceService.getPermitById(permitId);
  if (!permit) {
    logger.warn({ permitId }, 'Permit not found for renewal alert');
    return;
  }
  
  const projectResult = await pool.query(
    'SELECT name, project_manager_id FROM development_projects WHERE id = $1',
    [permit.project_id]
  );
  
  const project = projectResult.rows[0];
  if (!project) return;
  
  let urgency = 'info';
  if (daysUntilExpiry <= 7) {
    urgency = 'critical';
  } else if (daysUntilExpiry <= 14) {
    urgency = 'warning';
  }
  
  // Create notification
  await createNotification({
    organization_id: permit.organization_id,
    user_id: project.project_manager_id,
    title: `Permit Expires in ${daysUntilExpiry} Days`,
    message: `${permit.permit_name} for project "${project.name}" expires on ${new Date(permit.expiration_date!).toLocaleDateString('en-GB')}. Please initiate renewal process.`,
    type: 'permit_expiration',
    urgency,
    reference_type: 'permit',
    reference_id: permitId,
    project_id: permit.project_id,
  });
  
  // Mark reminder as sent
  await complianceService.markRenewalReminderSent(permitId);
}

/**
 * Check for expiring documents
 */
async function processDocumentExpiration(organizationId: string): Promise<void> {
  logger.info({ organizationId }, 'Processing document expiration check');
  
  const expiringDocuments = await projectDocumentService.getExpiringDocuments(organizationId, 30);
  
  for (const doc of expiringDocuments) {
    const expirationDate = new Date(doc.expiration_date!);
    const today = new Date();
    const daysUntilExpiry = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    // Only notify at key intervals: 30, 14, 7, 1 days
    if ([30, 14, 7, 1].includes(daysUntilExpiry)) {
      await createNotification({
        organization_id: organizationId,
        user_id: doc.uploaded_by,
        title: `Document Expires in ${daysUntilExpiry} Days`,
        message: `"${doc.name}" expires on ${expirationDate.toLocaleDateString('en-GB')}`,
        type: 'document_expiration',
        urgency: daysUntilExpiry <= 7 ? 'warning' : 'info',
        reference_type: 'document',
        reference_id: doc.id,
        project_id: doc.project_id,
      });
    }
  }
}

/**
 * Generate daily compliance digest for organization
 */
async function processDailyDigest(organizationId: string): Promise<void> {
  logger.info({ organizationId }, 'Generating daily compliance digest');
  
  const summary = await complianceService.getComplianceSummaryByOrganization(organizationId);
  
  // Get admin users for organization
  const adminsResult = await pool.query(
    `SELECT id FROM users 
     WHERE organization_id = $1 AND role IN ('admin', 'owner')`,
    [organizationId]
  );
  
  // Only send if there are issues
  if (summary.expired_permits > 0 || summary.expiring_permits > 0 || 
      summary.by_risk_level.critical > 0 || summary.by_risk_level.high > 0) {
    
    const message = [
      summary.expired_permits > 0 && `${summary.expired_permits} expired permits`,
      summary.expiring_permits > 0 && `${summary.expiring_permits} permits expiring soon`,
      summary.by_risk_level.critical > 0 && `${summary.by_risk_level.critical} projects at critical risk`,
      summary.by_risk_level.high > 0 && `${summary.by_risk_level.high} projects at high risk`,
    ].filter(Boolean).join(', ');
    
    for (const admin of adminsResult.rows) {
      await createNotification({
        organization_id: organizationId,
        user_id: admin.id,
        title: 'Daily Compliance Summary',
        message: `Attention needed: ${message}`,
        type: 'compliance_digest',
        urgency: summary.expired_permits > 0 || summary.by_risk_level.critical > 0 ? 'critical' : 'warning',
      });
    }
  }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

interface NotificationInput {
  organization_id: string;
  user_id?: string;
  title: string;
  message: string;
  type: string;
  urgency?: string;
  reference_type?: string;
  reference_id?: string;
  project_id?: string;
}

async function createNotification(input: NotificationInput): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO notifications (
        id, organization_id, user_id, title, message, 
        type, urgency, reference_type, reference_id, project_id,
        is_read, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, false, NOW()
      )`,
      [
        input.organization_id,
        input.user_id,
        input.title,
        input.message,
        input.type,
        input.urgency || 'info',
        input.reference_type,
        input.reference_id,
        input.project_id,
      ]
    );
    
    logger.info({ userId: input.user_id, type: input.type }, 'Notification created');
  } catch (error) {
    // Notifications table may not exist - log but don't fail
    logger.warn({ error }, 'Failed to create notification - table may not exist');
  }
}

// =====================================================
// SCHEDULED JOBS
// =====================================================

/**
 * Schedule daily compliance checks
 * Call this on server startup
 */
export async function scheduleComplianceJobs(): Promise<void> {
  // Remove existing repeatable jobs to avoid duplicates
  const repeatableJobs = await complianceQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await complianceQueue.removeRepeatableByKey(job.key);
  }
  
  logger.info('Scheduling compliance jobs');
  
  // Get all active organizations
  const orgResult = await pool.query(
    'SELECT DISTINCT id FROM organizations WHERE is_active = true'
  );
  
  for (const org of orgResult.rows) {
    // Daily expiration check at 8 AM
    await complianceQueue.add(
      `daily-expiration-${org.id}`,
      {
        type: 'expiration_check',
        organization_id: org.id,
      },
      {
        repeat: {
          pattern: '0 8 * * *', // 8 AM daily
        },
        jobId: `daily-expiration-${org.id}`,
      }
    );
    
    // Daily document expiration check at 8:30 AM
    await complianceQueue.add(
      `daily-doc-expiration-${org.id}`,
      {
        type: 'document_expiration',
        organization_id: org.id,
      },
      {
        repeat: {
          pattern: '30 8 * * *', // 8:30 AM daily
        },
        jobId: `daily-doc-expiration-${org.id}`,
      }
    );
    
    // Weekly compliance digest on Mondays at 9 AM
    await complianceQueue.add(
      `weekly-digest-${org.id}`,
      {
        type: 'daily_digest',
        organization_id: org.id,
      },
      {
        repeat: {
          pattern: '0 9 * * 1', // Monday 9 AM
        },
        jobId: `weekly-digest-${org.id}`,
      }
    );
    
    // Weekly score recalculation on Sundays at midnight
    await complianceQueue.add(
      `weekly-scores-${org.id}`,
      {
        type: 'recalc_scores',
        organization_id: org.id,
      },
      {
        repeat: {
          pattern: '0 0 * * 0', // Sunday midnight
        },
        jobId: `weekly-scores-${org.id}`,
      }
    );
  }
  
  logger.info({ orgCount: orgResult.rows.length }, 'Compliance jobs scheduled');
}

/**
 * Queue an inspection reminder
 */
export async function queueInspectionReminder(
  permitId: string,
  inspectionId: string,
  scheduledDate: Date
): Promise<void> {
  // Remind 3 days before, 1 day before, and on the day
  const remindDays = [3, 1, 0];
  
  for (const daysBefore of remindDays) {
    const reminderDate = new Date(scheduledDate);
    reminderDate.setDate(reminderDate.getDate() - daysBefore);
    reminderDate.setHours(8, 0, 0, 0); // 8 AM
    
    const delay = reminderDate.getTime() - Date.now();
    
    if (delay > 0) {
      await complianceQueue.add(
        `inspection-reminder-${inspectionId}-${daysBefore}`,
        {
          type: 'inspection_reminder',
          permit_id: permitId,
          inspection_id: inspectionId,
          scheduled_date: scheduledDate.toISOString(),
        },
        {
          delay,
          jobId: `inspection-reminder-${inspectionId}-${daysBefore}`,
        }
      );
    }
  }
}

/**
 * Queue immediate score recalculation
 */
export async function queueScoreRecalculation(projectId: string): Promise<void> {
  await complianceQueue.add(
    `recalc-${projectId}`,
    {
      type: 'recalc_scores',
      project_id: projectId,
    },
    {
      jobId: `recalc-${projectId}-${Date.now()}`,
    }
  );
}

// =====================================================
// WORKER EVENT HANDLERS
// =====================================================

complianceWorker.on('completed', (job: any) => {
  logger.debug({ jobId: job.id }, 'Compliance job completed');
});

complianceWorker.on('failed', (job: any, err: any) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Compliance job failed');
});

complianceWorker.on('error', (err: any) => {
  logger.error({ error: err.message }, 'Compliance worker error');
});

export default {
  complianceQueue,
  complianceWorker,
  scheduleComplianceJobs,
  queueInspectionReminder,
  queueScoreRecalculation,
};
