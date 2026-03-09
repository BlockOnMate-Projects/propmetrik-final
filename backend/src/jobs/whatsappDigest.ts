import cron from 'node-cron';
import { pool } from '../database';
import { whatsappService } from '../../shared-services/messaging/whatsappService';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * WhatsApp Digest Job
 * 
 * Runs daily to send unread message summaries to workspace members.
 */

export function initWhatsAppDigest() {
    // Run at scheduled time
    const schedule = config.workspace.whatsappDigestCron;

    cron.schedule(schedule, async () => {
        logger.info('WhatsApp Digest: Starting daily unread summary sweep...');
        try {
            await runDigestSweep();
        } catch (err) {
            logger.error('WhatsApp Digest: Sweep failed', { error: (err as Error).message });
        }
    });
}

async function runDigestSweep() {
    // 1. Find all users with unread workspace messages
    // This query finds users, their phone numbers, and the count of unread messages per workspace
    const res = await pool.query(`
        SELECT 
            u.id as user_id,
            u.display_name,
            u.phone,
            w.id as workspace_id,
            w.name as workspace_name,
            COUNT(m.id) as unread_count
        FROM users u
        JOIN workspace_members wm ON wm.user_id = u.id
        JOIN workspaces w ON w.id = wm.workspace_id
        JOIN workspace_messages m ON m.workspace_id = w.id
        WHERE m.deleted_at IS NULL
          AND m.sender_id != u.id
          AND u.phone IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM workspace_message_reads r
            WHERE r.message_id = m.id AND r.user_id = u.id
          )
        GROUP BY u.id, u.display_name, u.phone, w.id, w.name
    `);

    const rows = res.rows;
    if (rows.length === 0) {
        logger.info('WhatsApp Digest: No unread messages found for any user.');
        return;
    }

    // 2. Group by user
    const userDigests: Record<string, any> = {};
    for (const row of rows) {
        if (!userDigests[row.user_id]) {
            userDigests[row.user_id] = {
                name: row.display_name,
                phone: row.phone,
                workspaces: []
            };
        }
        userDigests[row.user_id].workspaces.push({
            name: row.workspace_name || `Workspace ${row.workspace_id.substring(0, 8)}`,
            count: parseInt(row.unread_count, 10)
        });
    }

    // 3. Send WhatsApp messages
    let sentCount = 0;
    for (const userId in userDigests) {
        const digest = userDigests[userId];
        const totalUnread = digest.workspaces.reduce((sum: number, ws: any) => sum + ws.count, 0);

        const workspaceSummary = digest.workspaces
            .map((ws: any) => `• *${ws.name}*: ${ws.count} unread`)
            .join('\n');

        const message = `Hello ${digest.name}, 📝\n\n` +
            `You have *${totalUnread} unread messages* in your PROPMETRIK workspaces:\n\n` +
            `${workspaceSummary}\n\n` +
            `Log in to your dashboard to catch up: ${config.app.frontendUrl}`;

        try {
            await whatsappService.sendTextMessage(digest.phone, message);
            sentCount++;
        } catch (err) {
            logger.error(`WhatsApp Digest: Failed to send to user ${userId}`, { error: (err as Error).message });
        }
    }

    logger.info(`WhatsApp Digest: Sweep completed. Sent ${sentCount} digests.`);
}
