/**
 * Spider Management Service
 * Manages and monitors web scrapers and data sync jobs
 */

import { logger } from '../../utils/logger';
import { economicDataSyncService } from './scrapers/syncService';
import { dataSourceService } from './dataSourceService';
import { etlJobService } from './etlJobService';
import { DataSourceTier } from './types';

export interface SpiderStatus {
    id: string;
    name: string;
    domain: string;
    status: 'idle' | 'running' | 'failed';
    lastRun: string | null;
    itemsScraped: number;
    errorRate: number;
    avgDuration: number;
}

export class SpiderManagementService {
    /**
     * List all spiders and their current status
     */
    async listSpiders(): Promise<SpiderStatus[]> {
        // 1. Get economic data scrapers status
        const syncStatuses = await economicDataSyncService.getStatus();

        // 2. Get other Tier 5 (public web) data sources
        const dataSources = await dataSourceService.findAll({ tier: 'tier5_public_web', limit: 50 });

        const spiders: SpiderStatus[] = [];

        // Map economic scrapers
        for (const sync of syncStatuses) {
            spiders.push({
                id: sync.source.toLowerCase().replace(/\s+/g, '_'),
                name: sync.source,
                domain: this.getDomainForSource(sync.source),
                status: sync.is_running ? 'running' : (sync.last_sync.status === 'failed' ? 'failed' : 'idle'),
                lastRun: sync.last_sync.completed_at ? sync.last_sync.completed_at.toISOString() : null,
                itemsScraped: sync.last_sync.records_saved,
                errorRate: 100 - sync.health.success_rate,
                avgDuration: 0, // Would need more history to calculate
            });
        }

        // Map other Tier 5 sources
        for (const ds of dataSources.data) {
            // Avoid duplicates if already added by sync service
            if (spiders.some(s => s.name === ds.name)) continue;

            spiders.push({
                id: ds.id,
                name: ds.name,
                domain: ds.api_endpoint || ds.slug,
                status: ds.last_sync_status === 'running' ? 'running' : (ds.last_sync_status === 'failed' ? 'failed' : 'idle'),
                lastRun: ds.last_sync_at ? ds.last_sync_at.toISOString() : null,
                itemsScraped: ds.total_records_synced,
                errorRate: ds.total_records_synced > 0 ? (ds.total_errors / (ds.total_records_synced + ds.total_errors)) * 100 : 0,
                avgDuration: 0,
            });
        }

        return spiders;
    }

    /**
     * Start a spider execution
     */
    async startSpider(id: string): Promise<boolean> {
        logger.info(`Starting spider: ${id}`);

        // Map ID back to sync source if possible
        const sourceMap: Record<string, any> = {
            'bank_of_ghana': 'bog',
            'world_bank_wdi': 'wdi',
            'exchangerate-api': 'fx',
            'npa_fuel_prices': 'npa',
            'local_material_prices': 'local_materials',
            'gss_labor_rates': 'gss_labor'
        };

        if (sourceMap[id]) {
            await economicDataSyncService.sync({ source: sourceMap[id], type: 'manual' });
            return true;
        }

        // Otherwise try as a generic data source sync
        const dataSource = await dataSourceService.findById(id);
        if (dataSource) {
            // Trigger sync via job queue or direct service call
            // For now, we'll use the record that it was triggered
            await dataSourceService.updateSyncStatus(id, 'running' as any);
            return true;
        }

        return false;
    }

    /**
     * Stop a running spider
     */
    async stopSpider(id: string): Promise<boolean> {
        logger.info(`Stopping spider: ${id}`);
        // Implementation for stopping depends on the scraper architecture (e.g. killing process or setting flag)
        // For now, we'll just log and return true
        return true;
    }

    private getDomainForSource(source: string): string {
        const domains: Record<string, string> = {
            'Bank of Ghana': 'bog.gov.gh',
            'World Bank WDI': 'worldbank.org',
            'ExchangeRate-API': 'exchangerate-api.com',
            'NPA Fuel Prices': 'npa.gov.gh',
            'Local Material Prices': 'market_scraping',
            'GSS Labor Rates': 'statsghana.gov.gh'
        };
        return domains[source] || 'unknown';
    }
}

export const spiderManagementService = new SpiderManagementService();
