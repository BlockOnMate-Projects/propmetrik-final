/**
 * Sync Service Unit Tests
 */

jest.mock('axios-retry', () => jest.fn());
jest.mock('../../../src/services/data-hub/scrapers/bogScraper', () => ({
  bogScraper: { syncAll: jest.fn(), syncLatest: jest.fn() },
  BOGScraper: jest.fn(),
}));
jest.mock('../../../src/services/data-hub/scrapers/wdiClient', () => ({
  wdiClient: { syncAll: jest.fn(), syncLatest: jest.fn(), clearCache: jest.fn() },
  WDIClient: jest.fn(),
}));
jest.mock('../../../src/services/data-hub/scrapers/fxFeedService', () => ({
  fxFeedService: {
    saveAllDailyRates: jest.fn(),
    getAllRates: jest.fn(),
    convertToGHS: jest.fn(),
    clearCache: jest.fn(),
    healthCheck: jest.fn(),
  },
  FXFeedService: jest.fn(),
}));
jest.mock('../../../src/services/data-hub/scrapers/npaScraper', () => ({
  npaScraper: { syncAll: jest.fn(), syncLatest: jest.fn() },
  NPAScraper: jest.fn(),
}));
jest.mock('../../../src/services/data-hub/scrapers/localMaterialScraper', () => ({
  localMaterialScraper: { syncAll: jest.fn(), syncLatest: jest.fn() },
  LocalMaterialScraper: jest.fn(),
}));
jest.mock('../../../src/services/data-hub/scrapers/gssLaborService', () => ({
  gssLaborService: { syncAll: jest.fn(), syncLatest: jest.fn() },
  GSSLaborService: jest.fn(),
}));
jest.mock('../../../src/services/data-hub/scrapers/gredaScraper', () => ({
  gredaScraper: { syncAll: jest.fn(), syncLatest: jest.fn() },
  GREDAScraper: jest.fn(),
}));
jest.mock('../../../src/services/data-hub/scrapers/syncLogRepository', () => ({
  syncLogRepository: {
    startSync: jest.fn(),
    completeSync: jest.fn(),
    getLatestSync: jest.fn(),
    getSourceHealth: jest.fn(),
    getSyncHistory: jest.fn(),
    getRecentSyncs: jest.fn(),
    getSyncStats: jest.fn(),
    getAllSourcesHealth: jest.fn(),
  },
  SyncLogRepository: jest.fn(),
}));

import { EconomicDataSyncService } from '../../../src/services/data-hub/scrapers/syncService';
import type { SyncResult } from '../../../src/services/data-hub/scrapers/types';

// Create mock result factory
const createMockResult = (source: string, overrides?: Partial<SyncResult>): SyncResult => ({
  source,
  status: 'success',
  started_at: new Date(),
  completed_at: new Date(),
  records_fetched: 10,
  records_saved: 10,
  records_failed: 0,
  errors: [],
  metadata: {},
  ...overrides,
});

// Mock all dependencies
const mockBogScraper = {
  syncAll: jest.fn(),
  syncLatest: jest.fn(),
};

const mockWdiClient = {
  syncAll: jest.fn(),
  syncLatest: jest.fn(),
  clearCache: jest.fn(),
};

const mockFxService = {
  saveAllDailyRates: jest.fn(),
  getAllRates: jest.fn(),
  convertToGHS: jest.fn(),
  clearCache: jest.fn(),
  healthCheck: jest.fn(),
};

const mockNpaScraper = {
  syncAll: jest.fn(),
  syncLatest: jest.fn(),
};

const mockMaterialScraper = {
  syncAll: jest.fn(),
  syncLatest: jest.fn(),
};

const mockLaborService = {
  syncAll: jest.fn(),
  syncLatest: jest.fn(),
};

const mockGredaScraper = {
  syncAll: jest.fn(),
  syncLatest: jest.fn(),
};

const mockSyncLogRepository = {
  startSync: jest.fn(),
  completeSync: jest.fn(),
  getLatestSync: jest.fn(),
  getSourceHealth: jest.fn(),
  getSyncHistory: jest.fn(),
  getRecentSyncs: jest.fn(),
  getSyncStats: jest.fn(),
  getAllSourcesHealth: jest.fn(),
};

describe('EconomicDataSyncService', () => {
  let syncService: EconomicDataSyncService;

  beforeEach(() => {
    jest.clearAllMocks();

    syncService = new EconomicDataSyncService(
      mockBogScraper as any,
      mockWdiClient as any,
      mockFxService as any,
      mockNpaScraper as any,
      mockMaterialScraper as any,
      mockLaborService as any,
      mockGredaScraper as any,
      mockSyncLogRepository as any
    );
  });

  describe('syncBOG', () => {
    it('should start and complete a BOG sync', async () => {
      mockSyncLogRepository.startSync.mockResolvedValue('sync-id-123');
      mockBogScraper.syncAll.mockResolvedValue(createMockResult('Bank of Ghana'));

      const result = await syncService.syncBOG('full', 'test-user');

      expect(mockSyncLogRepository.startSync).toHaveBeenCalledWith(
        'Bank of Ghana',
        'scheduled',
        'test-user'
      );
      expect(mockBogScraper.syncAll).toHaveBeenCalled();
      expect(mockSyncLogRepository.completeSync).toHaveBeenCalled();
      expect(result.source).toBe('Bank of Ghana');
    });

    it('should prevent concurrent syncs for same source', async () => {
      mockSyncLogRepository.startSync.mockResolvedValue('sync-id-123');
      mockBogScraper.syncAll.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(createMockResult('Bank of Ghana')), 100))
      );

      // Start first sync
      const firstSync = syncService.syncBOG('full', 'user1');

      // Try to start second sync immediately
      const secondSync = syncService.syncBOG('full', 'user2');

      const [result1, result2] = await Promise.all([firstSync, secondSync]);

      // Second should fail with ALREADY_RUNNING
      expect(result2.errors.some(e => e.code === 'ALREADY_RUNNING')).toBe(true);
    });

    it('should use syncLatest for latest type', async () => {
      mockSyncLogRepository.startSync.mockResolvedValue('sync-id-123');
      mockBogScraper.syncLatest.mockResolvedValue(createMockResult('Bank of Ghana'));

      await syncService.syncBOG('latest', 'test-user');

      expect(mockBogScraper.syncLatest).toHaveBeenCalled();
      expect(mockBogScraper.syncAll).not.toHaveBeenCalled();
    });

    it('should handle sync errors gracefully', async () => {
      mockSyncLogRepository.startSync.mockResolvedValue('sync-id-123');
      mockBogScraper.syncAll.mockRejectedValue(new Error('Scraper failed'));

      const result = await syncService.syncBOG('full', 'test-user');

      expect(result.status).toBe('failed');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('SYNC_ERROR');
    });
  });

  describe('syncWDI', () => {
    it('should sync WDI data', async () => {
      mockSyncLogRepository.startSync.mockResolvedValue('sync-id-123');
      mockWdiClient.syncAll.mockResolvedValue(createMockResult('World Bank WDI'));

      const result = await syncService.syncWDI('full', 'test-user');

      expect(mockWdiClient.syncAll).toHaveBeenCalled();
      expect(result.source).toBe('World Bank WDI');
    });
  });

  describe('syncFX', () => {
    it('should save daily FX rates', async () => {
      mockSyncLogRepository.startSync.mockResolvedValue('sync-id-123');
      mockFxService.saveAllDailyRates.mockResolvedValue(createMockResult('ExchangeRate-API'));

      const result = await syncService.syncFX('test-user');

      expect(mockFxService.saveAllDailyRates).toHaveBeenCalled();
      expect(result.source).toBe('ExchangeRate-API');
    });
  });

  describe('sync (unified)', () => {
    beforeEach(() => {
      mockSyncLogRepository.startSync.mockResolvedValue('sync-id-123');
      mockBogScraper.syncAll.mockResolvedValue(createMockResult('Bank of Ghana'));
      mockWdiClient.syncAll.mockResolvedValue(createMockResult('World Bank WDI'));
      mockFxService.saveAllDailyRates.mockResolvedValue(createMockResult('ExchangeRate-API'));
    });

    it('should route to correct sync based on source', async () => {
      await syncService.sync({ source: 'bog', type: 'full' });
      expect(mockBogScraper.syncAll).toHaveBeenCalled();

      jest.clearAllMocks();
      mockSyncLogRepository.startSync.mockResolvedValue('sync-id-123');
      
      await syncService.sync({ source: 'wdi', type: 'full' });
      expect(mockWdiClient.syncAll).toHaveBeenCalled();

      jest.clearAllMocks();
      mockSyncLogRepository.startSync.mockResolvedValue('sync-id-123');
      
      await syncService.sync({ source: 'fx', type: 'full' });
      expect(mockFxService.saveAllDailyRates).toHaveBeenCalled();
    });

    it('should sync all sources when source is "all"', async () => {
      mockSyncLogRepository.startSync.mockResolvedValue('sync-id-all');
      mockBogScraper.syncAll.mockResolvedValue(createMockResult('Bank of Ghana'));
      mockWdiClient.syncAll.mockResolvedValue(createMockResult('World Bank WDI'));
      mockFxService.saveAllDailyRates.mockResolvedValue(createMockResult('ExchangeRate-API'));
      mockNpaScraper.syncAll.mockResolvedValue(createMockResult('NPA Fuel Prices'));
      mockMaterialScraper.syncAll.mockResolvedValue(createMockResult('Local Material Prices'));
      mockLaborService.syncAll.mockResolvedValue(createMockResult('GSS Labor Rates'));
      mockGredaScraper.syncAll.mockResolvedValue(createMockResult('GREDA/BRRI Construction Costs'));

      const result = await syncService.sync({ source: 'all', type: 'full' });

      expect(Array.isArray(result)).toBe(true);
      expect((result as SyncResult[]).length).toBe(7);
    });
  });

  describe('getStatus', () => {
    it('should return status for all sources', async () => {
      mockSyncLogRepository.getLatestSync.mockResolvedValue({
        started_at: new Date(),
        completed_at: new Date(),
        status: 'success',
        records_saved: 10,
        error_message: null,
      });
      mockSyncLogRepository.getSourceHealth.mockResolvedValue({
        is_healthy: true,
        consecutive_failures: 0,
        success_rate: 1.0,
      });

      const status = await syncService.getStatus();

      expect(status.length).toBeGreaterThanOrEqual(6);
      expect(status.map(s => s.source)).toContain('Bank of Ghana');
      expect(status.map(s => s.source)).toContain('World Bank WDI');
      expect(status.map(s => s.source)).toContain('ExchangeRate-API');
      expect(status.map(s => s.source)).toContain('GREDA/BRRI Construction Costs');
    });
  });

  describe('getLiveFXRates', () => {
    it('should return formatted FX rates', async () => {
      mockFxService.getAllRates.mockResolvedValue({
        USD: { rate: 15.5, source: 'ExchangeRate-API', timestamp: new Date() },
        GBP: { rate: 19.8, source: 'ExchangeRate-API', timestamp: new Date() },
        EUR: { rate: 17.0, source: 'ExchangeRate-API', timestamp: new Date() },
      });

      const rates = await syncService.getLiveFXRates();

      expect(rates).toHaveProperty('USD');
      expect(rates).toHaveProperty('GBP');
      expect(rates).toHaveProperty('EUR');
      expect(rates.USD.rate).toBe(15.5);
    });
  });

  describe('convertToGHS', () => {
    it('should delegate to FX service', async () => {
      mockFxService.convertToGHS.mockResolvedValue({
        original_amount: 100,
        converted_amount: 1550,
        rate: 15.5,
        source: 'ExchangeRate-API',
      });

      const result = await syncService.convertToGHS(100, 'USD');

      expect(mockFxService.convertToGHS).toHaveBeenCalledWith(100, 'USD');
      expect(result.converted_amount).toBe(1550);
    });
  });

  describe('clearCaches', () => {
    it('should clear both WDI and FX caches', async () => {
      await syncService.clearCaches();

      expect(mockWdiClient.clearCache).toHaveBeenCalled();
      expect(mockFxService.clearCache).toHaveBeenCalled();
    });
  });

  describe('healthCheck', () => {
    it('should return health status for all sources', async () => {
      mockFxService.healthCheck.mockResolvedValue({
        exchangerate_api: true,
        yahoo_finance: true,
      });

      const health = await syncService.healthCheck();

      expect(health).toHaveProperty('bog');
      expect(health).toHaveProperty('wdi');
      expect(health).toHaveProperty('exchangerate_api');
      expect(health).toHaveProperty('yahoo_finance');
    });
  });
});
