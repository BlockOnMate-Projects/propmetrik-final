/**
 * GSS MIEG Sync — Tier 3c Microservice Wrapper
 *
 * Thin wrapper that delegates to gssMiegService.sync().
 */

import { gssMiegService } from '../../../../scrapers/gssMiegService';
import { logger } from '../../../../../../utils/logger';

export async function handler(triggeredBy = 'manual'): Promise<void> {
  logger.info('[tier3c/gss-mieg-sync] Starting GSS MIEG/GDP sync', { triggeredBy });
  const result = await gssMiegService.sync(triggeredBy);
  logger.info('[tier3c/gss-mieg-sync] Complete', {
    status: result.status,
    saved: result.records_saved,
    errors: result.errors.length,
  });
}
