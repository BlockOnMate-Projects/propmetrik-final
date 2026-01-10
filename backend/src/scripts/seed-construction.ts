#!/usr/bin/env ts-node

/**
 * Seed construction cost data
 */
import { constructionCostService } from '../services/data-hub/constructionCostService';
import { logger } from '../utils/logger';

async function seedConstructionData() {
  try {
    logger.info('Starting construction cost data seeding...');
    
    await constructionCostService.seedInitialData();
    
    logger.info('Construction cost data seeding completed successfully');
    process.exit(0);
  } catch (error: any) {
    logger.error('Error seeding construction cost data:', {
      message: error.message,
      detail: error.detail,
      code: error.code,
      constraint: error.constraint,
      table: error.table,
      column: error.column,
      stack: error.stack
    });
    process.exit(1);
  }
}

if (require.main === module) {
  seedConstructionData();
}

export default seedConstructionData;