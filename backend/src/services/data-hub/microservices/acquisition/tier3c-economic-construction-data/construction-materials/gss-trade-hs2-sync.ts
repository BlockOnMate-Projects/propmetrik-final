/**
 * GSS Trade HS2 Sync — Tier 3c Construction Materials Microservice Wrapper
 *
 * Thin wrapper that delegates to gssTradeService.sync().
 * Lives in tier3c-economic-construction-data/construction-materials/
 */

import { gssTradeService } from '../../../../scrapers/gssTradeService';
import { logger } from '../../../../../../utils/logger';

export async function handler(triggeredBy = 'manual'): Promise<void> {
  logger.info('[tier3c/gss-trade-hs2-sync] Starting GSS Trade HS2 import sync', { triggeredBy });
  const result = await gssTradeService.sync(triggeredBy);
  logger.info('[tier3c/gss-trade-hs2-sync] Complete', {
    status: result.status,
    saved: result.records_saved,
    errors: result.errors.length,
  });
}
