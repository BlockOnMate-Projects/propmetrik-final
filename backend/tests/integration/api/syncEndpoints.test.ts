/**
 * Integration Tests: Sync API Endpoints
 * 
 * Tests the API endpoints for economic data synchronization
 */

import request from 'supertest';
import express, { Express } from 'express';
import dataHubRouter from '../../../src/routes/dataHub';

// Mock services
jest.mock('../../../src/services/data-hub/scrapers/syncService', () => ({
  economicDataSyncService: {
    getStatus: jest.fn().mockResolvedValue([
      {
        source: 'Bank of Ghana',
        is_running: false,
        last_sync: { started_at: null, completed_at: null, status: null },
        health: { is_healthy: true, consecutive_failures: 0 },
      },
      {
        source: 'World Bank WDI',
        is_running: false,
        last_sync: { started_at: null, completed_at: null, status: null },
        health: { is_healthy: true, consecutive_failures: 0 },
      },
    ]),
    getHistory: jest.fn().mockResolvedValue([
      {
        id: 'sync-1',
        source: 'BOG',
        started_at: new Date().toISOString(),
        status: 'completed',
        records_saved: 10,
      },
    ]),
    getStats: jest.fn().mockResolvedValue({
      total_syncs: 5,
      successful_syncs: 4,
      failed_syncs: 1,
      total_records: 100,
    }),
    sync: jest.fn().mockResolvedValue({
      id: 'sync-new',
      source: 'BOG',
      status: 'completed',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      recordsSaved: 5,
    }),
    getLiveFXRates: jest.fn().mockResolvedValue({
      USD: { rate: 15.5, source: 'ForexRate-API', timestamp: new Date() },
      GBP: { rate: 19.5, source: 'ForexRate-API', timestamp: new Date() },
      EUR: { rate: 16.8, source: 'ForexRate-API', timestamp: new Date() },
    }),
    convertToGHS: jest.fn().mockResolvedValue({
      amount: 100,
      currency: 'USD',
      ghs_amount: 1550,
      rate: 15.5,
    }),
    healthCheck: jest.fn().mockResolvedValue({
      forexrate_api: true,
      yahoo_finance: true,
      fallback: true,
    }),
    clearCaches: jest.fn().mockResolvedValue(undefined),
  },
  SyncSource: {},
  SyncType: {},
}));

jest.mock('../../../src/services/data-hub/schedulers', () => ({
  economicDataScheduler: {
    isActive: jest.fn().mockReturnValue(false),
    getStatus: jest.fn().mockReturnValue({}),
    start: jest.fn(),
    stop: jest.fn(),
    triggerSync: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock other required services
jest.mock('../../../src/services/data-hub', () => ({
  dataSourceService: { findAll: jest.fn().mockResolvedValue({ data: [], meta: {} }) },
  etlJobService: { getStats: jest.fn().mockResolvedValue({}) },
  contributionService: {},
  contributorProfileService: {},
  geocodingService: {},
  dataHubQueueManager: { addJob: jest.fn() },
  DataHubQueueManager: { QUEUES: {} },
  DataSourceTier: {},
  EtlJobType: {},
  EtlJobStatus: {},
  ContributionType: {},
  ValidationStatus: {},
  RegionCode: {},
}));

jest.mock('../../../src/services/data-hub/economicDataService', () => ({
  economicDataService: {},
  EconomicIndicatorType: {},
}));

jest.mock('../../../src/services/data-hub/constructionCostService', () => ({
  constructionCostService: {},
  MaterialCategory: {},
  LaborCategory: {},
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/middleware/errorHandler', () => ({
  asyncHandler: (fn: Function) => fn,
}));

describe('Sync API Endpoints', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/data-hub', dataHubRouter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /data-hub/economic/sync/status', () => {
    it('should return sync status for all sources', async () => {
      const response = await request(app)
        .get('/data-hub/economic/sync/status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('GET /data-hub/economic/sync/history', () => {
    it('should return sync history', async () => {
      const response = await request(app)
        .get('/data-hub/economic/sync/history')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.count).toBeDefined();
    });

    it('should accept source and limit parameters', async () => {
      const { economicDataSyncService } = require('../../../src/services/data-hub/scrapers/syncService');

      await request(app)
        .get('/data-hub/economic/sync/history?source=BOG&limit=10')
        .expect(200);

      expect(economicDataSyncService.getHistory).toHaveBeenCalledWith('BOG', 10);
    });
  });

  describe('GET /data-hub/economic/sync/stats', () => {
    it('should return sync statistics', async () => {
      const response = await request(app)
        .get('/data-hub/economic/sync/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    it('should accept days parameter', async () => {
      const { economicDataSyncService } = require('../../../src/services/data-hub/scrapers/syncService');

      await request(app)
        .get('/data-hub/economic/sync/stats?days=7')
        .expect(200);

      expect(economicDataSyncService.getStats).toHaveBeenCalledWith(7);
    });
  });

  describe('POST /data-hub/economic/sync/:source', () => {
    it('should trigger BOG sync', async () => {
      const response = await request(app)
        .post('/data-hub/economic/sync/bog')
        .send({ triggered_by: 'test' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    it('should trigger WDI sync', async () => {
      const response = await request(app)
        .post('/data-hub/economic/sync/wdi')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should trigger FX sync', async () => {
      const response = await request(app)
        .post('/data-hub/economic/sync/fx')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject invalid source', async () => {
      const response = await request(app)
        .post('/data-hub/economic/sync/invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid source');
    });
  });

  describe('GET /data-hub/economic/fx/live', () => {
    it('should return live FX rates', async () => {
      const response = await request(app)
        .get('/data-hub/economic/fx/live')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.USD).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('POST /data-hub/economic/fx/convert', () => {
    it('should convert currency to GHS', async () => {
      const response = await request(app)
        .post('/data-hub/economic/fx/convert')
        .send({ amount: 100, currency: 'USD' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    it('should reject missing parameters', async () => {
      const response = await request(app)
        .post('/data-hub/economic/fx/convert')
        .send({ amount: 100 })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /data-hub/economic/sync/health', () => {
    it('should return health status for all sources', async () => {
      const response = await request(app)
        .get('/data-hub/economic/sync/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.all_healthy).toBeDefined();
    });
  });

  describe('POST /data-hub/economic/sync/clear-cache', () => {
    it('should clear all caches', async () => {
      const response = await request(app)
        .post('/data-hub/economic/sync/clear-cache')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('All caches cleared');
    });
  });
});

describe('Scheduler API Endpoints', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/data-hub', dataHubRouter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /data-hub/scheduler/status', () => {
    it('should return scheduler status', async () => {
      const response = await request(app)
        .get('/data-hub/scheduler/status')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.isActive).toBeDefined();
      expect(response.body.data.jobs).toBeDefined();
      expect(response.body.data.timestamp).toBeDefined();
    });
  });

  describe('POST /data-hub/scheduler/start', () => {
    it('should start the scheduler', async () => {
      const { economicDataScheduler } = require('../../../src/services/data-hub/schedulers');
      economicDataScheduler.isActive.mockReturnValueOnce(false);
      economicDataScheduler.isActive.mockReturnValueOnce(true);

      const response = await request(app)
        .post('/data-hub/scheduler/start')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(economicDataScheduler.start).toHaveBeenCalled();
    });

    it('should reject if already running', async () => {
      const { economicDataScheduler } = require('../../../src/services/data-hub/schedulers');
      economicDataScheduler.isActive.mockReturnValue(true);

      const response = await request(app)
        .post('/data-hub/scheduler/start')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already running');
    });
  });

  describe('POST /data-hub/scheduler/stop', () => {
    it('should stop the scheduler', async () => {
      const { economicDataScheduler } = require('../../../src/services/data-hub/schedulers');
      economicDataScheduler.isActive.mockReturnValue(true);

      const response = await request(app)
        .post('/data-hub/scheduler/stop')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(economicDataScheduler.stop).toHaveBeenCalled();
    });

    it('should reject if not running', async () => {
      const { economicDataScheduler } = require('../../../src/services/data-hub/schedulers');
      economicDataScheduler.isActive.mockReturnValue(false);

      const response = await request(app)
        .post('/data-hub/scheduler/stop')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not running');
    });
  });

  describe('POST /data-hub/scheduler/trigger/:source', () => {
    it('should trigger BOG sync', async () => {
      const response = await request(app)
        .post('/data-hub/scheduler/trigger/BOG')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('BOG');
    });

    it('should trigger all syncs', async () => {
      const response = await request(app)
        .post('/data-hub/scheduler/trigger/all')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('all');
    });

    it('should reject invalid source', async () => {
      const response = await request(app)
        .post('/data-hub/scheduler/trigger/invalid')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});
