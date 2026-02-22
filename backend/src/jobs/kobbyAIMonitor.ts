import cron from 'node-cron';
import { logger } from '../utils/logger';
import { pool } from '../database';
import { kobbyAIService } from '../../shared-services/workspace/KobbyAIService';
import { workspaceService } from '../../shared-services/workspace/WorkspaceService';
import { config } from '../config';

/**
 * Kobby AI Proactive Monitor
 * 
 * Runs on a schedule to check all active workspaces for anomalies
 * (e.g., budget overruns, delayed phases, urgent maintenance).
 * If anomalies are found, Kobby AI injects a proactive alert message
 * into the workspace chat.
 */

async function runProactiveSweep() {
    logger.info('KobbyAI Monitor: Starting proactive sweep...');
    const startTime = Date.now();
    let alertCount = 0;

    try {
        // Find all workspaces that might need monitoring (projects and properties for now)
        const res = await pool.query(`
            SELECT id, entity_type, entity_id, organization_id
            FROM workspaces
            WHERE entity_type IN ('project', 'property')
        `);

        const workspaces = res.rows;
        logger.debug(`KobbyAI Monitor: Found ${workspaces.length} eligible workspaces`);

        for (const ws of workspaces) {
            try {
                // 1. Build context for this entity
                const context = await kobbyAIService.buildContext(
                    ws.entity_type,
                    ws.entity_id,
                    ws.id
                );

                // 2. Run the specialized anomaly detection
                const anomalyAlert = await kobbyAIService.detectAnomalies(context);

                // 3. If an anomaly is found, inject a message
                if (anomalyAlert) {
                    const defaultConversation = await workspaceService.getDefaultConversation(ws.id);
                    await workspaceService.persistMessage({
                        workspaceId: ws.id,
                        conversationId: defaultConversation.id,
                        senderId: null, // System/AI message
                        senderType: 'kobby_ai',
                        messageType: 'ai_response',
                        content: anomalyAlert,
                        metadata: {
                            query: 'Proactive System Sweep',
                            confidence: 1.0,
                            sources: [`PropMetrik ${ws.entity_type} data`],
                            followUpSuggestions: [
                                `Show me the full ${ws.entity_type} dashboard`,
                                'How can we resolve this delay?'
                            ],
                            isProactive: true
                        }
                    });
                    alertCount++;
                    logger.info(`KobbyAI Monitor: Alert posted to workspace ${ws.id}`);
                }
            } catch (err) {
                logger.error(`KobbyAI Monitor: Failed to process workspace ${ws.id}`, {
                    error: (err as Error).message
                });
            }
        }

        const duration = Date.now() - startTime;
        logger.info(`KobbyAI Monitor: Sweep completed in ${duration}ms. Posted ${alertCount} alerts.`);
    } catch (err) {
        logger.error('KobbyAI Monitor: Sweep failed entirely', { error: (err as Error).message });
    }
}

// Export a function to initialize the cron job
export function initKobbyMonitor() {
    // Run daily at scheduled time
    const schedule = config.workspace.kobbyMonitorCron;

    cron.schedule(schedule, () => {
        runProactiveSweep().catch(console.error);
    });

    logger.info(`KobbyAI Monitor initialized with schedule: ${schedule}`);
}
