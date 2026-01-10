import { logger } from '../../utils/logger';
import { DataHubQueueManager, dataHubQueueManager } from './jobQueue';
import { dataSourceService } from './dataSourceService';
import { etlJobService } from './etlJobService';
import { EtlJobType, EtlJobStatus } from './types';
import { v4 as uuidv4 } from 'uuid';

export class IngestionService {
  constructor(private queueManager: DataHubQueueManager) { }

  /**
   * Ingest raw property data from external sources (scrapers, partners)
   * This is the "Waiting Room" - validates format and queues for processing
   */
  async ingestRawProperty(payload: any, sourceTag: string): Promise<{ success: boolean; jobId: string }> {
    try {
      // 1. Basic Validation
      if (!payload.source_id || !payload.source_slug) {
        throw new Error('Missing required fields: source_id, source_slug');
      }

      // 2. Resolve Data Source
      const dataSource = await dataSourceService.findBySlug(payload.source_slug);

      // 3. Create ETL Job Record
      // We assume each ingestion is a "contribution" or "scrape" job for a single item
      const etlJob = await etlJobService.create({
        source_id: dataSource?.id || undefined,
        job_type: 'contribution', // Using Contribution type for single item ingestion
        job_name: `Ingest ${payload.source_slug} item`,
        config: {
          external_id: payload.source_id,
          source_url: payload.source_url
        }
      });

      const jobId = etlJob.id;

      // We'll queue this directly to the processing queue

      await this.queueManager.addJob(
        DataHubQueueManager.QUEUES.PROPERTY_PROCESS,
        {
          rawProperty: payload,
          jobId: jobId
        },
        {
          priority: 1
        }
      );

      logger.info(`Ingested raw property ${payload.source_slug}:${payload.source_id}, job: ${jobId}`);

      return { success: true, jobId };
    } catch (error) {
      logger.error(`Ingestion failed: ${error}`);
      throw error;
    }
  }
}

export const ingestionService = new IngestionService(dataHubQueueManager);

// Singleton instance will be exported in index.ts
