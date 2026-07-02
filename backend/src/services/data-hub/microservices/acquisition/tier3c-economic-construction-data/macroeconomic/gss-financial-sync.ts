/**
 * GSS Financial Sync — Tier 3c Microservice Wrapper
 *
 * Thin wrapper that delegates to gssFinancialService.sync().
 */

import { gssFinancialService } from '../../../../scrapers/gssFinancialService';
import { logger } from '../../../../../../utils/logger';

export async function handler(triggeredBy = 'manual'): Promise<void> {
  logger.info('[tier3c/gss-financial-sync] Starting GSS Interest Rates + FSI sync', { triggeredBy });
  const result = await gssFinancialService.sync(triggeredBy);
  logger.info('[tier3c/gss-financial-sync] Complete', {
    status: result.status,
    saved: result.records_saved,
    errors: result.errors.length,
  });
}
