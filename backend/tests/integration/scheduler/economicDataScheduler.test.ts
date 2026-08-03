/**
 * Integration Tests: Economic Data Scheduler
 * 
 * Tests the scheduler's ability to manage cron jobs and trigger syncs
 */

import { EconomicDataScheduler } from '../../../src/services/data-hub/schedulers/economicDataScheduler';

// Mock the sync service
jest.mock('../../../src/services/data-hub/scrapers/syncService', () => ({
  economicDataSyncService: {
    sync: jest.fn().mockResolvedValue({
      id: 'test-sync-id',
      source: 'BOG',
      type: 'latest',
      status: 'completed',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      recordsSaved: 5,
      errors: [],
    }),
    getStatus: jest.fn().mockResolvedValue([]),
  },
}));

// Mock the FX service
jest.mock('../../../src/services/data-hub/scrapers/fxFeedService', () => ({
  fxFeedService: {
    getAllRates: jest.fn().mockResolvedValue({
      USD: { rate: 15.5, source: 'ForexRate-API', timestamp: new Date() },
      GBP: { rate: 19.5, source: 'ForexRate-API', timestamp: new Date() },
    }),
  },
}));

jest.mock('../../../src/services/data-hub/constructionCostService', () => ({
  constructionCostService: {
    updateConstructionIndex: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock the logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('EconomicDataScheduler', () => {
  let scheduler: EconomicDataScheduler;

  beforeEach(() => {
    // Create fresh scheduler with disabled config for testing
    scheduler = new EconomicDataScheduler({
      enabled: true,
      bogSyncCron: '0 8 1 * *',
      wdiSyncCron: '0 0 1 */3 *',
      fxUpdateCron: '*/5 * * * *',
      fxDailyCron: '0 17 * * 1-5',
      timezone: 'Africa/Accra',
    });
  });

  afterEach(() => {
    // Cleanup - stop scheduler if running
    if (scheduler.isActive()) {
      scheduler.stop();
    }
  });

  describe('start()', () => {
    it('should start the scheduler successfully', () => {
      expect(scheduler.isActive()).toBe(false);
      
      scheduler.start();
      
      expect(scheduler.isActive()).toBe(true);
    });

    it('should not start twice', () => {
      scheduler.start();
      expect(scheduler.isActive()).toBe(true);
      
      // Second start should be ignored
      scheduler.start();
      expect(scheduler.isActive()).toBe(true);
    });

    it('should not start when disabled', () => {
      const disabledScheduler = new EconomicDataScheduler({ enabled: false });
      
      disabledScheduler.start();
      
      expect(disabledScheduler.isActive()).toBe(false);
    });
  });

  describe('stop()', () => {
    it('should stop a running scheduler', () => {
      scheduler.start();
      expect(scheduler.isActive()).toBe(true);
      
      scheduler.stop();
      
      expect(scheduler.isActive()).toBe(false);
    });

    it('should handle stopping when not running', () => {
      expect(scheduler.isActive()).toBe(false);
      
      // Should not throw
      scheduler.stop();
      
      expect(scheduler.isActive()).toBe(false);
    });
  });

  describe('getStatus()', () => {
    it('should return status for all jobs when running', () => {
      scheduler.start();
      
      const status = scheduler.getStatus();
      
      expect(status).toBeDefined();
      expect(status['bog-sync']).toBeDefined();
      expect(status['wdi-sync']).toBeDefined();
      expect(status['fx-cache-update']).toBeDefined();
      expect(status['fx-daily-save']).toBeDefined();
    });

    it('should return empty status when not running', () => {
      const status = scheduler.getStatus();
      
      expect(Object.keys(status).length).toBe(0);
    });

    it('should track job metadata', () => {
      scheduler.start();
      
      const status = scheduler.getStatus();
      const bogJob = status['bog-sync'];
      
      expect(bogJob.name).toBe('bog-sync');
      expect(bogJob.cronExpression).toBe('0 8 1 * *');
      expect(bogJob.runCount).toBe(0);
      expect(bogJob.errorCount).toBe(0);
      expect(bogJob.lastStatus).toBeNull();
    });
  });

  describe('triggerSync()', () => {
    it('should trigger BOG sync', async () => {
      const { economicDataSyncService } = require('../../../src/services/data-hub/scrapers/syncService');
      
      await scheduler.triggerSync('BOG');
      
      expect(economicDataSyncService.sync).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'bog',
          type: 'latest',
        })
      );
    });

    it('should trigger WDI sync', async () => {
      const { economicDataSyncService } = require('../../../src/services/data-hub/scrapers/syncService');
      
      await scheduler.triggerSync('WDI');
      
      expect(economicDataSyncService.sync).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'wdi',
          type: 'full',
        })
      );
    });

    it('should trigger FX sync', async () => {
      const { economicDataSyncService } = require('../../../src/services/data-hub/scrapers/syncService');
      
      await scheduler.triggerSync('FX');
      
      expect(economicDataSyncService.sync).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'fx',
        })
      );
    });

    it('should trigger all syncs when source is "all"', async () => {
      const { economicDataSyncService } = require('../../../src/services/data-hub/scrapers/syncService');
      
      await scheduler.triggerSync('all');
      
      // BOG, WDI, FX daily, fuel, materials, labor
      expect(economicDataSyncService.sync).toHaveBeenCalledTimes(6);
    });
  });

  describe('cron expression validation', () => {
    it('should accept valid cron expressions', () => {
      const validScheduler = new EconomicDataScheduler({
        enabled: true,
        bogSyncCron: '0 0 * * *',
        wdiSyncCron: '0 0 1 * *',
        fxUpdateCron: '*/10 * * * *',
        fxDailyCron: '0 18 * * *',
      });
      
      validScheduler.start();
      
      expect(validScheduler.isActive()).toBe(true);
      
      validScheduler.stop();
    });

    it('should handle timezone correctly', () => {
      const accraScheduler = new EconomicDataScheduler({
        enabled: true,
        timezone: 'Africa/Accra',
      });
      
      accraScheduler.start();
      
      const status = accraScheduler.getStatus();
      expect(Object.keys(status).length).toBeGreaterThan(0);
      
      accraScheduler.stop();
    });
  });
});
