/**
 * GSS PPI Sync — Tier 3c Microservice Wrapper
 *
 * Thin wrapper that delegates to gssPpiService.sync().
 * Lives in tier3c-economic-construction-data/macroeconomic/ alongside the
 * other GSS macro sync wrappers.
 *
 * Can be invoked directly or via the EconomicDataScheduler triggerSync('gss_ppi').
 */

import { gssPpiService } from '../../../../scrapers/gssPpiService';
import { logger } from '../../../../../../utils/logger';

export async function handler(triggeredBy = 'manual'): Promise<void> {
  logger.info('[tier3c/gss-ppi-sync] Starting GSS PPI/IIP sync', { triggeredBy });
  const result = await gssPpiService.sync(triggeredBy);
  logger.info('[tier3c/gss-ppi-sync] Complete', {
    status: result.status,
    saved: result.records_saved,
    errors: result.errors.length,
  });
}
