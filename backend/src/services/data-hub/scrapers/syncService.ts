/**
 * Economic Data Sync Service
 * 
 * Orchestrates all economic data scraping and synchronization.
 * Provides a unified interface for triggering syncs, checking status,
 * and managing data sources.
 */

import { logger } from '../../../utils/logger';
import { bogScraper, BOGScraper } from './bogScraper';
import { wdiClient, WDIClient } from './wdiClient';
import { fxFeedService, FXFeedService } from './fxFeedService';
import { npaScraper, NPAScraper } from './npaScraper';
import { localMaterialScraper, LocalMaterialScraper } from './localMaterialScraper';
import { gssLaborService, GSSLaborService } from './gssLaborService';
import { gredaScraper, GREDAScraper } from './gredaScraper';
import { syncLogRepository, SyncLogRepository } from './syncLogRepository';
import { SyncResult, SyncError } from './types';
// GSS StatsBank PxWeb scrapers (Slice 1)
import { gssPpiService, GSS_PPIService } from './gssPpiService';
import { gssMiegService, GSS_MIEGService } from './gssMiegService';
import { gssFinancialService, GSS_FinancialService } from './gssFinancialService';
import { gssIncomeService } from '../gssIncomeService';
// GSS StatsBank PxWeb scrapers (Slice 2)
import { gssPhcHousingService, GSS_PHCHousingService } from './gssPhcHousingService';
import { gssTradeService, GSS_TradeService } from './gssTradeService';
import { gssPhcPopulationService, GSS_PHCPopulationService } from './gssPhcPopulationService';
import { gssPhcEmploymentService, GSS_PHCEmploymentService } from './gssPhcEmploymentService';
import { gssPhcPovertyService, GSS_PHCPovertyService } from './gssPhcPovertyService';
// GSS StatsBank PxWeb scrapers (Slice 4)
import { gssGlss7Service, GSS_GLSS7Service } from './gssGlss7Service';

// =====================================================
// TYPES
// =====================================================

export type SyncSource =
  | 'bog' | 'wdi' | 'fx' | 'npa' | 'local_materials' | 'gss_labor' | 'greda'
  | 'construction_all' | 'all'
  // GSS StatsBank PxWeb sources (Slice 1)
  | 'gss_ppi'
  | 'gss_mieg'
  | 'gss_financial'
  | 'gss_income'
  // GSS StatsBank PxWeb sources (Slice 2)
  | 'gss_phc_housing'
  | 'gss_trade_hs2'
  // GSS StatsBank PxWeb sources (Slice 3)
  | 'gss_phc_population'
  | 'gss_phc_employment'
  | 'gss_phc_poverty'
  // GSS StatsBank PxWeb sources (Slice 4)
  | 'gss_glss7'
  | 'gss_all';
export type SyncType = 'full' | 'latest' | 'manual';

export interface SyncOptions {
  source: SyncSource;
  type: SyncType;
  triggeredBy?: string;
}

export interface SyncStatus {
  source: string;
  is_running: boolean;
  last_sync: {
    started_at: Date | null;
    completed_at: Date | null;
    status: string | null;
    records_saved: number;
    error_message: string | null;
  };
  health: {
    is_healthy: boolean;
    consecutive_failures: number;
    success_rate: number;
  };
}

// =====================================================
// SYNC SERVICE
// =====================================================

export class EconomicDataSyncService {
  private readonly bogScraper: BOGScraper;
  private readonly wdiClient: WDIClient;
  private readonly fxService: FXFeedService;
  private readonly npaScraper: NPAScraper;
  private readonly materialScraper: LocalMaterialScraper;
  private readonly laborService: GSSLaborService;
  private readonly gredaScraper: GREDAScraper;
  private readonly syncLog: SyncLogRepository;
  // GSS StatsBank clients (Slice 1)
  private readonly gssPpi: GSS_PPIService;
  private readonly gssMieg: GSS_MIEGService;
  private readonly gssFinancial: GSS_FinancialService;
  // GSS StatsBank clients (Slice 2)
  private readonly gssPhcHousing: GSS_PHCHousingService;
  private readonly gssTrade: GSS_TradeService;
  // GSS StatsBank clients (Slice 3)
  private readonly gssPhcPopulation: GSS_PHCPopulationService;
  private readonly gssPhcEmployment: GSS_PHCEmploymentService;
  private readonly gssPhcPoverty: GSS_PHCPovertyService;
  private readonly gssGlss7: GSS_GLSS7Service;
  private runningJobs: Map<string, boolean>;

  constructor(
    bogScraperInstance?: BOGScraper,
    wdiClientInstance?: WDIClient,
    fxServiceInstance?: FXFeedService,
    npaScraperInstance?: NPAScraper,
    materialScraperInstance?: LocalMaterialScraper,
    laborServiceInstance?: GSSLaborService,
    gredaScraperInstance?: GREDAScraper,
    syncLogInstance?: SyncLogRepository
  ) {
    this.bogScraper = bogScraperInstance || bogScraper;
    this.wdiClient = wdiClientInstance || wdiClient;
    this.fxService = fxServiceInstance || fxFeedService;
    this.npaScraper = npaScraperInstance || npaScraper;
    this.materialScraper = materialScraperInstance || localMaterialScraper;
    this.laborService = laborServiceInstance || gssLaborService;
    this.gredaScraper = gredaScraperInstance || gredaScraper;
    this.syncLog = syncLogInstance || syncLogRepository;
    // GSS StatsBank (Slice 1)
    this.gssPpi = gssPpiService;
    this.gssMieg = gssMiegService;
    this.gssFinancial = gssFinancialService;
    // GSS StatsBank (Slice 2)
    this.gssPhcHousing = gssPhcHousingService;
    this.gssTrade = gssTradeService;
    // GSS StatsBank (Slice 3)
    this.gssPhcPopulation = gssPhcPopulationService;
    this.gssPhcEmployment = gssPhcEmploymentService;
    this.gssPhcPoverty = gssPhcPovertyService;
    this.gssGlss7 = gssGlss7Service;
    this.runningJobs = new Map();
  }

  /**
   * Check if a source is currently syncing
   */
  isSourceSyncing(source: string): boolean {
    return this.runningJobs.get(source) || false;
  }

  /**
   * Run Bank of Ghana sync
   */
  async syncBOG(type: SyncType = 'full', triggeredBy: string = 'manual'): Promise<SyncResult> {
    const source = 'Bank of Ghana';
    
    if (this.isSourceSyncing(source)) {
      return {
        source,
        status: 'failed',
        started_at: new Date(),
        completed_at: new Date(),
        records_fetched: 0,
        records_saved: 0,
        records_failed: 0,
        errors: [{ code: 'ALREADY_RUNNING', message: 'Sync already in progress', timestamp: new Date() }],
        metadata: {},
      };
    }

    this.runningJobs.set(source, true);
    let syncId: string | undefined;

    try {
      syncId = await this.syncLog.startSync(source, type === 'manual' ? 'manual' : 'scheduled', triggeredBy);
      
      logger.info('Starting BOG sync', { type, triggeredBy, syncId });
      
      const result = type === 'latest' 
        ? await this.bogScraper.syncLatest()
        : await this.bogScraper.syncAll();
      
      await this.syncLog.completeSync(syncId, result);
      
      return result;
    } catch (error) {
      const errorResult: SyncResult = {
        source,
        status: 'failed',
        started_at: new Date(),
        completed_at: new Date(),
        records_fetched: 0,
        records_saved: 0,
        records_failed: 0,
        errors: [{
          code: 'SYNC_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
        }],
        metadata: {},
      };

      if (syncId) {
        await this.syncLog.completeSync(syncId, errorResult);
      }

      logger.error('BOG sync failed', { error });
      return errorResult;
    } finally {
      this.runningJobs.set(source, false);
    }
  }

  /**
   * Run World Bank WDI sync
   */
  async syncWDI(type: SyncType = 'full', triggeredBy: string = 'manual'): Promise<SyncResult> {
    const source = 'World Bank WDI';
    
    if (this.isSourceSyncing(source)) {
      return {
        source,
        status: 'failed',
        started_at: new Date(),
        completed_at: new Date(),
        records_fetched: 0,
        records_saved: 0,
        records_failed: 0,
        errors: [{ code: 'ALREADY_RUNNING', message: 'Sync already in progress', timestamp: new Date() }],
        metadata: {},
      };
    }

    this.runningJobs.set(source, true);
    let syncId: string | undefined;

    try {
      syncId = await this.syncLog.startSync(source, type === 'manual' ? 'manual' : 'scheduled', triggeredBy);
      
      logger.info('Starting WDI sync', { type, triggeredBy, syncId });
      
      const result = type === 'latest' 
        ? await this.wdiClient.syncLatest()
        : await this.wdiClient.syncAll();
      
      await this.syncLog.completeSync(syncId, result);
      
      return result;
    } catch (error) {
      const errorResult: SyncResult = {
        source,
        status: 'failed',
        started_at: new Date(),
        completed_at: new Date(),
        records_fetched: 0,
        records_saved: 0,
        records_failed: 0,
        errors: [{
          code: 'SYNC_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
        }],
        metadata: {},
      };

      if (syncId) {
        await this.syncLog.completeSync(syncId, errorResult);
      }

      logger.error('WDI sync failed', { error });
      return errorResult;
    } finally {
      this.runningJobs.set(source, false);
    }
  }

  /**
   * Run FX rates sync (save daily closing rates)
   */
  async syncFX(triggeredBy: string = 'manual'): Promise<SyncResult> {
    const source = 'ExchangeRate-API';
    
    if (this.isSourceSyncing(source)) {
      return {
        source,
        status: 'failed',
        started_at: new Date(),
        completed_at: new Date(),
        records_fetched: 0,
        records_saved: 0,
        records_failed: 0,
        errors: [{ code: 'ALREADY_RUNNING', message: 'Sync already in progress', timestamp: new Date() }],
        metadata: {},
      };
    }

    this.runningJobs.set(source, true);
    let syncId: string | undefined;

    try {
      syncId = await this.syncLog.startSync(source, 'scheduled', triggeredBy);
      
      logger.info('Starting FX sync', { triggeredBy, syncId });
      
      const result = await this.fxService.saveAllDailyRates();
      
      await this.syncLog.completeSync(syncId, result);
      
      return result;
    } catch (error) {
      const errorResult: SyncResult = {
        source,
        status: 'failed',
        started_at: new Date(),
        completed_at: new Date(),
        records_fetched: 0,
        records_saved: 0,
        records_failed: 0,
        errors: [{
          code: 'SYNC_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
        }],
        metadata: {},
      };

      if (syncId) {
        await this.syncLog.completeSync(syncId, errorResult);
      }

      logger.error('FX sync failed', { error });
      return errorResult;
    } finally {
      this.runningJobs.set(source, false);
    }
  }

  /**
   * Run NPA fuel price sync
   */
  async syncNPA(triggeredBy: string = 'manual'): Promise<SyncResult> {
    const source = 'NPA Fuel Prices';
    
    if (this.isSourceSyncing(source)) {
      return {
        source,
        status: 'failed',
        started_at: new Date(),
        completed_at: new Date(),
        records_fetched: 0,
        records_saved: 0,
        records_failed: 0,
        errors: [{ code: 'ALREADY_RUNNING', message: 'Sync already in progress', timestamp: new Date() }],
        metadata: {},
      };
    }

    this.runningJobs.set(source, true);
    let syncId: string | undefined;

    try {
      syncId = await this.syncLog.startSync(source, 'scheduled', triggeredBy);
      
      logger.info('Starting NPA fuel price sync', { triggeredBy, syncId });
      
      const result = await this.npaScraper.syncLatest();
      
      await this.syncLog.completeSync(syncId, result);
      
      return result;
    } catch (error) {
      const errorResult: SyncResult = {
        source,
        status: 'failed',
        started_at: new Date(),
        completed_at: new Date(),
        records_fetched: 0,
        records_saved: 0,
        records_failed: 0,
        errors: [{
          code: 'SYNC_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
        }],
        metadata: {},
      };

      if (syncId) {
        await this.syncLog.completeSync(syncId, errorResult);
      }

      logger.error('NPA sync failed', { error });
      return errorResult;
    } finally {
      this.runningJobs.set(source, false);
    }
  }

  /**
   * Run Local Material Prices sync
   */
  async syncLocalMaterials(triggeredBy: string = 'manual'): Promise<SyncResult> {
    const source = 'Local Material Prices';
    
    if (this.isSourceSyncing(source)) {
      return {
        source,
        status: 'failed',
        started_at: new Date(),
        completed_at: new Date(),
        records_fetched: 0,
        records_saved: 0,
        records_failed: 0,
        errors: [{ code: 'ALREADY_RUNNING', message: 'Sync already in progress', timestamp: new Date() }],
        metadata: {},
      };
    }

    this.runningJobs.set(source, true);
    let syncId: string | undefined;

    try {
      syncId = await this.syncLog.startSync(source, 'scheduled', triggeredBy);
      
      logger.info('Starting local material price sync', { triggeredBy, syncId });
      
      const result = await this.materialScraper.syncLatest();
      
      await this.syncLog.completeSync(syncId, result);
      
      return result;
    } catch (error) {
      const errorResult: SyncResult = {
        source,
        status: 'failed',
        started_at: new Date(),
        completed_at: new Date(),
        records_fetched: 0,
        records_saved: 0,
        records_failed: 0,
        errors: [{
          code: 'SYNC_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
        }],
        metadata: {},
      };

      if (syncId) {
        await this.syncLog.completeSync(syncId, errorResult);
      }

      logger.error('Local material sync failed', { error });
      return errorResult;
    } finally {
      this.runningJobs.set(source, false);
    }
  }

  // =========================================================================
  // GSS StatsBank PxWeb syncs (Slice 1)
  // =========================================================================

  /** Sync GSS PPI (Producer Price Index) and IIP (Industrial Production). */
  async syncGSSPpi(triggeredBy: string = 'manual'): Promise<SyncResult> {
    return this.gssPpi.sync(triggeredBy);
  }

  /** Sync GSS MIEG (Monthly Economic Growth Indicator) and Quarterly GDP. */
  async syncGSSMieg(triggeredBy: string = 'manual'): Promise<SyncResult> {
    return this.gssMieg.sync(triggeredBy);
  }

  /** Sync GSS Interest Rates and Financial Soundness Indicators. */
  async syncGSSFinancial(triggeredBy: string = 'manual'): Promise<SyncResult> {
    return this.gssFinancial.sync(triggeredBy);
  }

  /** Sync GSS Regional Household Income (AHIES + PHC, CPI-escalated, + formal employment %). */
  async syncGSSIncome(triggeredBy: string = 'manual'): Promise<SyncResult> {
    return gssIncomeService.syncRegionalHouseholdIncome(triggeredBy);
  }

  // =========================================================================
  // GSS StatsBank PxWeb syncs (Slice 2)
  // =========================================================================

  /** Sync GSS PHC 2021 Housing Census (tenure, materials, completion, infrastructure, ICT). */
  async syncGSSPhcHousing(triggeredBy: string = 'manual'): Promise<SyncResult> {
    return this.gssPhcHousing.sync(triggeredBy);
  }

  /** Sync GSS Trade HS2 construction material imports. */
  async syncGSSTradeHs2(triggeredBy: string = 'manual'): Promise<SyncResult> {
    return this.gssTrade.sync(triggeredBy);
  }

  // =========================================================================
  // GSS StatsBank PxWeb syncs (Slice 3)
  // =========================================================================

  /** Sync GSS PHC 2021 Population projections + household size. */
  async syncGSSPhcPopulation(triggeredBy: string = 'manual'): Promise<SyncResult> {
    return this.gssPhcPopulation.sync(triggeredBy);
  }

  /** Sync GSS PHC 2021 Employment (sector/econact/unemployment) + formal-employment backfill. */
  async syncGSSPhcEmployment(triggeredBy: string = 'manual'): Promise<SyncResult> {
    return this.gssPhcEmployment.sync(triggeredBy);
  }

  /** Sync GSS PHC 2021 Multidimensional Poverty (MPI). */
  async syncGSSPhcPoverty(triggeredBy: string = 'manual'): Promise<SyncResult> {
    return this.gssPhcPoverty.sync(triggeredBy);
  }

  // =========================================================================
  // GSS StatsBank PxWeb syncs (Slice 4)
  // =========================================================================

  /** Sync GSS GLSS7 migration flows + domestic tourism + housing occupancy snapshot. */
  async syncGSSGlss7(triggeredBy: string = 'manual'): Promise<SyncResult> {
    return this.gssGlss7.sync(triggeredBy);
  }

  /**
   * Run GSS Labor Rates sync
   */
  async syncGSSLabor(triggeredBy: string = 'manual'): Promise<SyncResult> {
    const source = 'GSS Labor Rates';

    if (this.isSourceSyncing(source)) {
      return {
        source,
        status: 'failed',
        started_at: new Date(),
        completed_at: new Date(),
        records_fetched: 0,
        records_saved: 0,
        records_failed: 0,
        errors: [{ code: 'ALREADY_RUNNING', message: 'Sync already in progress', timestamp: new Date() }],
        metadata: {},
      };
    }

    this.runningJobs.set(source, true);
    let syncId: string | undefined;

    try {
      syncId = await this.syncLog.startSync(source, 'scheduled', triggeredBy);
      
      logger.info('Starting GSS labor rates sync', { triggeredBy, syncId });
      
      const result = await this.laborService.syncLatest();
      
      await this.syncLog.completeSync(syncId, result);
      
      return result;
    } catch (error) {
      const errorResult: SyncResult = {
        source,
        status: 'failed',
        started_at: new Date(),
        completed_at: new Date(),
        records_fetched: 0,
        records_saved: 0,
        records_failed: 0,
        errors: [{
          code: 'SYNC_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
        }],
        metadata: {},
      };

      if (syncId) {
        await this.syncLog.completeSync(syncId, errorResult);
      }

      logger.error('GSS labor sync failed', { error });
      return errorResult;
    } finally {
      this.runningJobs.set(source, false);
    }
  }

  /**
   * Run GREDA/BRRI specialized construction cost sync
   */
  async syncGREDA(triggeredBy: string = 'manual'): Promise<SyncResult> {
    const source = 'GREDA/BRRI Construction Costs';
    
    if (this.isSourceSyncing(source)) {
      return {
        source,
        status: 'failed',
        started_at: new Date(),
        completed_at: new Date(),
        records_fetched: 0,
        records_saved: 0,
        records_failed: 0,
        errors: [{ code: 'ALREADY_RUNNING', message: 'Sync already in progress', timestamp: new Date() }],
        metadata: {},
      };
    }

    this.runningJobs.set(source, true);
    let syncId: string | undefined;

    try {
      syncId = await this.syncLog.startSync(source, 'scheduled', triggeredBy);
      
      logger.info('Starting GREDA/BRRI specialized cost sync', { triggeredBy, syncId });
      
      const result = await this.gredaScraper.syncLatest();
      
      await this.syncLog.completeSync(syncId, result);
      
      return result;
    } catch (error) {
      const errorResult: SyncResult = {
        source,
        status: 'failed',
        started_at: new Date(),
        completed_at: new Date(),
        records_fetched: 0,
        records_saved: 0,
        records_failed: 0,
        errors: [{
          code: 'SYNC_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date(),
        }],
        metadata: {},
      };

      if (syncId) {
        await this.syncLog.completeSync(syncId, errorResult);
      }

      logger.error('GREDA/BRRI sync failed', { error });
      return errorResult;
    } finally {
      this.runningJobs.set(source, false);
    }
  }

  /**
   * Run sync for specified source(s)
   */
  async sync(options: SyncOptions): Promise<SyncResult | SyncResult[]> {
    const { source, type, triggeredBy = 'manual' } = options;

    switch (source) {
      case 'bog':
        return this.syncBOG(type, triggeredBy);
      
      case 'wdi':
        return this.syncWDI(type, triggeredBy);
      
      case 'fx':
        return this.syncFX(triggeredBy);
      
      case 'npa':
        return this.syncNPA(triggeredBy);
      
      case 'local_materials':
        return this.syncLocalMaterials(triggeredBy);
      
      case 'gss_labor':
        return this.syncGSSLabor(triggeredBy);
      
      case 'gss_ppi':
        return this.syncGSSPpi(triggeredBy);

      case 'gss_mieg':
        return this.syncGSSMieg(triggeredBy);

      case 'gss_financial':
        return this.syncGSSFinancial(triggeredBy);

      case 'gss_income':
        return this.syncGSSIncome(triggeredBy);

      case 'gss_phc_housing':
        return this.syncGSSPhcHousing(triggeredBy);

      case 'gss_trade_hs2':
        return this.syncGSSTradeHs2(triggeredBy);

      case 'gss_phc_population':
        return this.syncGSSPhcPopulation(triggeredBy);

      case 'gss_phc_employment':
        return this.syncGSSPhcEmployment(triggeredBy);

      case 'gss_phc_poverty':
        return this.syncGSSPhcPoverty(triggeredBy);

      case 'gss_glss7':
        return this.syncGSSGlss7(triggeredBy);

      case 'gss_all': {
        // Run all GSS sources sequentially (they share the same host — be polite)
        const ppiResult = await this.syncGSSPpi(triggeredBy);
        const miegResult = await this.syncGSSMieg(triggeredBy);
        const financialResult = await this.syncGSSFinancial(triggeredBy);
        const incomeResult = await this.syncGSSIncome(triggeredBy);
        // Slice 2 (annual — run if explicitly requested as part of gss_all)
        const phcResult = await this.syncGSSPhcHousing(triggeredBy);
        const tradeResult = await this.syncGSSTradeHs2(triggeredBy);
        // Slice 3 (annual census — population/employment/poverty)
        const popResult = await this.syncGSSPhcPopulation(triggeredBy);
        const empResult = await this.syncGSSPhcEmployment(triggeredBy);
        const povResult = await this.syncGSSPhcPoverty(triggeredBy);
        // Slice 4 (GLSS7 — migration/tourism/housing)
        const glss7Result = await this.syncGSSGlss7(triggeredBy);
        return [ppiResult, miegResult, financialResult, incomeResult, phcResult, tradeResult,
                popResult, empResult, povResult, glss7Result];
      }

      case 'greda':
        return this.syncGREDA(triggeredBy);

      case 'construction_all': {
        // Run all construction-related syncs in parallel
        const [npaResult, materialsResult, laborResult, gredaResult] = await Promise.all([
          this.syncNPA(triggeredBy),
          this.syncLocalMaterials(triggeredBy),
          this.syncGSSLabor(triggeredBy),
          this.syncGREDA(triggeredBy),
        ]);
        return [npaResult, materialsResult, laborResult, gredaResult];
      }

      case 'all': {
        // Run all syncs in parallel
        const [bogResult, wdiResult, fxResult, npaResultAll, materialsResultAll, laborResultAll, gredaResultAll] = await Promise.all([
          this.syncBOG(type, triggeredBy),
          this.syncWDI(type, triggeredBy),
          this.syncFX(triggeredBy),
          this.syncNPA(triggeredBy),
          this.syncLocalMaterials(triggeredBy),
          this.syncGSSLabor(triggeredBy),
          this.syncGREDA(triggeredBy),
        ]);
        return [bogResult, wdiResult, fxResult, npaResultAll, materialsResultAll, laborResultAll, gredaResultAll];
      }

      default:
        throw new Error(`Unknown source: ${source}`);
    }
  }

  /**
   * Get sync status for all sources
   */
  async getStatus(): Promise<SyncStatus[]> {
    const sources = [
      'Bank of Ghana', 
      'World Bank WDI', 
      'ExchangeRate-API',
      'NPA Fuel Prices',
      'Local Material Prices',
      'GSS Labor Rates',
      'GREDA/BRRI Construction Costs',
      // GSS StatsBank (Slice 1)
      'GSS StatsBank PPI/IIP',
      'GSS StatsBank MIEG/GDP',
      'GSS StatsBank Financial',
      'GSS Regional Household Income',
      // GSS StatsBank (Slice 2)
      'GSS StatsBank PHC Housing',
      'GSS StatsBank Trade HS2',
    ];
    const statuses: SyncStatus[] = [];

    for (const source of sources) {
      const lastSync = await this.syncLog.getLatestSync(source);
      const health = await this.syncLog.getSourceHealth(source);

      statuses.push({
        source,
        is_running: this.isSourceSyncing(source),
        last_sync: {
          started_at: lastSync?.started_at || null,
          completed_at: lastSync?.completed_at || null,
          status: lastSync?.status || null,
          records_saved: lastSync?.records_saved || 0,
          error_message: lastSync?.error_message || null,
        },
        health: {
          is_healthy: health?.is_healthy ?? true,
          consecutive_failures: health?.consecutive_failures ?? 0,
          success_rate: health?.success_rate ?? 0,
        },
      });
    }

    return statuses;
  }

  /**
   * Get sync history
   */
  async getHistory(source?: string, limit: number = 20): Promise<any[]> {
    if (source) {
      return this.syncLog.getSyncHistory(source, limit);
    }
    return this.syncLog.getRecentSyncs(limit);
  }

  /**
   * Get sync statistics
   */
  async getStats(days: number = 30): Promise<{
    total_syncs: number;
    successful_syncs: number;
    failed_syncs: number;
    total_records_saved: number;
    average_duration_ms: number;
    sources_health: Array<{
      source_name: string;
      is_healthy: boolean;
      success_rate: number;
    }>;
  }> {
    const stats = await this.syncLog.getSyncStats(days);
    const sourcesHealth = await this.syncLog.getAllSourcesHealth();

    return {
      ...stats,
      sources_health: sourcesHealth.map((s) => ({
        source_name: s.source_name,
        is_healthy: s.is_healthy,
        success_rate: s.success_rate,
      })),
    };
  }

  /**
   * Get live FX rates (from cache or fresh)
   */
  async getLiveFXRates(): Promise<Record<string, {
    rate: number;
    source: string;
    timestamp: Date;
  }>> {
    const rates = await this.fxService.getAllRates();
    const result: Record<string, { rate: number; source: string; timestamp: Date }> = {};

    for (const [currency, data] of Object.entries(rates)) {
      result[currency] = {
        rate: data.rate,
        source: data.source,
        timestamp: data.timestamp,
      };
    }

    return result;
  }

  /**
   * Convert currency to GHS
   */
  async convertToGHS(amount: number, fromCurrency: string): Promise<{
    original_amount: number;
    converted_amount: number;
    rate: number;
    source: string;
  }> {
    return this.fxService.convertToGHS(amount, fromCurrency);
  }

  /**
   * Clear all caches
   */
  async clearCaches(): Promise<void> {
    await Promise.all([
      this.wdiClient.clearCache(),
      this.fxService.clearCache(),
    ]);
    logger.info('All economic data caches cleared');
  }

  /**
   * Health check for all sources
   */
  async healthCheck(): Promise<Record<string, boolean>> {
    const fxHealth = await this.fxService.healthCheck();
    
    return {
      bog: true, // BOG is web scraping, always "available"
      wdi: true, // WDI API is generally reliable
      npa: true, // NPA is web scraping
      local_materials: true, // Web scraping / fallback
      gss_labor: true, // Calculated from minimum wage
      ...fxHealth,
    };
  }
}

// Export singleton instance
export const economicDataSyncService = new EconomicDataSyncService();
