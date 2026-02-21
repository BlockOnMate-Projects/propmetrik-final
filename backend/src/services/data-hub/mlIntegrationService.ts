/**
 * ML Data Hub Integration Service
 *
 * Bridge between the Data Hub (raw data collection) and the ML Serving
 * microservice (intelligence). Provides enrichment pipelines that:
 *
 * 1. Pull data from Data Hub tables (properties, economic indicators,
 *    construction costs, scraped listings)
 * 2. Send it through ML services (sentiment, NER, trends, document intel)
 * 3. Store enriched results back in the database for analytics consumption
 *
 * This is the "wiring" that makes the Data Hub → Analytics → ML Serving
 * architecture work end-to-end.
 *
 * @module services/data-hub/mlIntegrationService
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { mlServingClient } from '../analytics/mlServingClient';

// ============================================================================
// ENRICHMENT PIPELINES
// ============================================================================

class MLDataHubIntegrationService {
  // ==========================================================================
  // 1. Property Listing Enrichment
  //    Scraper → Data Hub → ML NER + Sentiment → Enriched Property Records
  // ==========================================================================

  /**
   * Enrich a batch of recently-ingested property listings with NER extraction.
   * Pulls unprocessed listings, runs NER on their descriptions, and stores
   * extracted entities (location, price, developer, bedrooms, etc.).
   */
  async enrichPropertyListings(batchSize: number = 50): Promise<number> {
    let processed = 0;
    try {
      // Find listings not yet enriched by ML
      const listings = await pool.query(
        `SELECT id, title, description, raw_data
         FROM ingested_properties
         WHERE ml_enriched = false OR ml_enriched IS NULL
         ORDER BY created_at DESC
         LIMIT $1`,
        [batchSize],
      );

      if (listings.rows.length === 0) return 0;

      for (const listing of listings.rows) {
        try {
          const text = `${listing.title || ''} ${listing.description || ''}`.trim();
          if (!text) continue;

          // Run NER
          const nerResult = await mlServingClient.extractEntities({
            text,
            document_type: 'listing',
            extract_relationships: true,
          });

          // Store extracted entities
          await pool.query(
            `INSERT INTO ml_extracted_entities (source_type, source_id, entities, relationships, created_at)
             VALUES ('property_listing', $1, $2, $3, NOW())
             ON CONFLICT (source_type, source_id) DO UPDATE
             SET entities = $2, relationships = $3, created_at = NOW()`,
            [listing.id, JSON.stringify(nerResult.entities), JSON.stringify(nerResult.relationships || [])],
          );

          // Mark as enriched
          await pool.query(
            `UPDATE ingested_properties SET ml_enriched = true, ml_enriched_at = NOW() WHERE id = $1`,
            [listing.id],
          );

          processed++;
        } catch (err: any) {
          logger.warn('ML enrichment failed for listing', { listingId: listing.id, error: err.message });
        }
      }

      logger.info(`ML enrichment completed for ${processed}/${listings.rows.length} listings`);
    } catch (err: any) {
      if (err.code === '42P01') {
        logger.warn('Listing enrichment skipped — table not found');
      } else {
        logger.error('Property listing enrichment pipeline failed', { error: err.message });
        throw err;
      }
    }
    return processed;
  }

  // ==========================================================================
  // 2. News & Social Media Sentiment Pipeline
  //    Data Hub scraper → Sentiment Analysis → Market Confidence Index
  // ==========================================================================

  /**
   * Run sentiment analysis on newly-scraped news articles.
   * Results flow into the Market Confidence Index calculation.
   */
  async analyzeNewsSentiment(batchSize: number = 20): Promise<number> {
    let processed = 0;
    try {
      const articles = await pool.query(
        `SELECT id, title, content, source_url, published_at
         FROM scraped_news_articles
         WHERE sentiment_analyzed = false OR sentiment_analyzed IS NULL
         ORDER BY published_at DESC
         LIMIT $1`,
        [batchSize],
      );

      if (articles.rows.length === 0) return 0;

      for (const article of articles.rows) {
        try {
          const text = `${article.title || ''}\n\n${article.content || ''}`.trim();
          if (!text) continue;

          const sentiment = await mlServingClient.analyzeSentiment({
            source: 'news',
            text,
          });

          // Store sentiment analysis
          await pool.query(
            `INSERT INTO ml_sentiment_analysis
             (source_type, source_id, source_url, text_snippet, overall_sentiment,
              sentiment_score, confidence, aspects, entities, market_indicators, analyzed_at)
             VALUES ('news', $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
            [
              article.id,
              article.source_url,
              text.substring(0, 500),
              sentiment.sentiment.overall,
              sentiment.sentiment.score,
              sentiment.sentiment.confidence,
              JSON.stringify(sentiment.aspects),
              JSON.stringify(sentiment.entities),
              JSON.stringify(sentiment.market_indicators),
            ],
          );

          // Mark as analyzed
          await pool.query(
            `UPDATE scraped_news_articles SET sentiment_analyzed = true WHERE id = $1`,
            [article.id],
          );

          processed++;
        } catch (err: any) {
          logger.warn('Sentiment analysis failed for article', { articleId: article.id, error: err.message });
        }
      }

      logger.info(`Sentiment analysis completed for ${processed}/${articles.rows.length} articles`);
    } catch (err: any) {
      if (err.code === '42P01') {
        logger.warn('News sentiment pipeline skipped — table not found');
      } else {
        logger.error('News sentiment pipeline failed', { error: err.message });
        throw err;
      }
    }
    return processed;
  }

  // ==========================================================================
  // 3. Document Processing Pipeline
  //    Uploaded documents → Document Intelligence → Structured Data
  // ==========================================================================

  /**
   * Process uploaded documents (PDFs, legal docs, bids) through ML.
   */
  async processUploadedDocuments(batchSize: number = 10): Promise<number> {
    let processed = 0;
    try {
      const docs = await pool.query(
        `SELECT id, file_url, file_type, document_type, original_name
         FROM uploaded_documents
         WHERE ml_processed = false OR ml_processed IS NULL
         ORDER BY uploaded_at DESC
         LIMIT $1`,
        [batchSize],
      );

      if (docs.rows.length === 0) return 0;

      for (const doc of docs.rows) {
        try {
          const docType = doc.document_type || 'report';

          const result = await mlServingClient.processDocument({
            document_url: doc.file_url,
            document_type: docType,
            extract_tables: true,
          });

          // Store processed document
          await pool.query(
            `INSERT INTO ml_processed_documents
             (source_document_id, document_type, classification, extracted_data,
              tables_data, entities, summary, key_findings, validation, processed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
            [
              doc.id,
              docType,
              JSON.stringify(result.classification),
              JSON.stringify(result.extracted_data),
              JSON.stringify(result.tables),
              JSON.stringify(result.entities),
              result.summary,
              JSON.stringify(result.key_findings),
              JSON.stringify(result.validation),
            ],
          );

          // Mark as processed
          await pool.query(
            `UPDATE uploaded_documents SET ml_processed = true, ml_processed_at = NOW() WHERE id = $1`,
            [doc.id],
          );

          processed++;
        } catch (err: any) {
          logger.warn('Document processing failed', { docId: doc.id, error: err.message });
        }
      }

      logger.info(`Document processing completed for ${processed}/${docs.rows.length} documents`);
    } catch (err: any) {
      if (err.code === '42P01') {
        logger.warn('Document processing pipeline skipped — table not found');
      } else {
        logger.error('Document processing pipeline failed', { error: err.message });
        throw err;
      }
    }
    return processed;
  }

  // ==========================================================================
  // 4. Trend Extraction from Data Hub Content
  //    All text sources → Trend Analysis → Trending Topics + Forecasts
  // ==========================================================================

  /**
   * Run trend analysis on aggregated text content from the data hub.
   */
  async extractTrends(): Promise<any> {
    try {
      // Aggregate recent content for trend analysis
      const sources: string[] = [];

      // Collect news titles
      try {
        const news = await pool.query(
          `SELECT title FROM scraped_news_articles
           WHERE published_at >= NOW() - INTERVAL '30 days'
           ORDER BY published_at DESC LIMIT 200`,
        );
        for (const row of news.rows) {
          if (row.title) sources.push(row.title);
        }
      } catch { /* table might not exist */ }

      // Collect listing titles
      try {
        const listings = await pool.query(
          `SELECT title FROM ingested_properties
           WHERE created_at >= NOW() - INTERVAL '30 days'
           ORDER BY created_at DESC LIMIT 200`,
        );
        for (const row of listings.rows) {
          if (row.title) sources.push(row.title);
        }
      } catch { /* table might not exist */ }

      if (sources.length === 0) {
        logger.info('No content available for trend extraction');
        return null;
      }

      const combinedText = sources.join('\n');
      const trends = await mlServingClient.analyzeTrends({
        text: combinedText,
        source_type: 'aggregated',
      });

      // Store trend analysis
      try {
        await pool.query(
          `INSERT INTO ml_trend_analysis
           (analysis_type, source_count, trending_topics, emerging_trends,
            declining_trends, keyword_trends, anomalies, analyzed_at)
           VALUES ('periodic', $1, $2, $3, $4, $5, $6, NOW())`,
          [
            sources.length,
            JSON.stringify(trends.trending_topics || []),
            JSON.stringify(trends.emerging_trends || []),
            JSON.stringify(trends.declining_trends || []),
            JSON.stringify(trends.keyword_trends || []),
            JSON.stringify(trends.anomalies || []),
          ],
        );
      } catch (err: any) {
        if (err.code !== '42P01') throw err;
      }

      logger.info(`Trend extraction completed from ${sources.length} sources`);
      return trends;
    } catch (err: any) {
      logger.error('Trend extraction pipeline failed', { error: err.message });
      throw err;
    }
  }

  // ==========================================================================
  // 5. Economic Data → ML Forecasting
  //    Economic indicators from Data Hub → Price Forecast
  // ==========================================================================

  /**
   * Generate price forecasts for all active regions using latest economic data.
   */
  async generateRegionalForecasts(): Promise<any[]> {
    const regions = [
      'greater_accra', 'ashanti', 'western', 'eastern', 'central',
      'volta', 'northern', 'upper_east', 'upper_west', 'brong_ahafo',
    ];

    const forecasts: any[] = [];

    for (const region of regions) {
      try {
        const forecast = await mlServingClient.forecastPrices({
          region,
          forecast_months: 6,
        });

        // Store forecast
        try {
          await pool.query(
            `INSERT INTO ml_price_forecasts
             (region, property_type, forecast_date, short_term, long_term, drivers, generated_at)
             VALUES ($1, 'residential', NOW(), $2, $3, $4, NOW())
             ON CONFLICT (region, property_type, forecast_date)
             DO UPDATE SET short_term = $2, long_term = $3, drivers = $4, generated_at = NOW()`,
            [
              region,
              JSON.stringify(forecast.short_term),
              JSON.stringify(forecast.long_term),
              JSON.stringify(forecast.drivers),
            ],
          );
        } catch (err: any) {
          if (err.code !== '42P01') throw err;
        }

        forecasts.push(forecast);
      } catch (err: any) {
        logger.warn(`Price forecast failed for ${region}`, { error: err.message });
      }
    }

    logger.info(`Generated forecasts for ${forecasts.length}/${regions.length} regions`);
    return forecasts;
  }

  // ==========================================================================
  // 6. Market Confidence Index Refresh
  //    Aggregates sentiment data into a single market health score
  // ==========================================================================

  /**
   * Recalculate the market confidence index from recent sentiment data.
   */
  async refreshMarketConfidenceIndex(): Promise<number | null> {
    try {
      const mci = await mlServingClient.getMarketConfidenceIndex(30);

      // Store in local table
      try {
        await pool.query(
          `INSERT INTO ml_market_confidence_index
           (index_date, index_value, sentiment_distribution, sample_size, region)
           VALUES (CURRENT_DATE, $1, $2, $3, NULL)
           ON CONFLICT (index_date, COALESCE(region, '__national__'))
           DO UPDATE SET index_value = $1, sentiment_distribution = $2, sample_size = $3`,
          [mci.index_value, JSON.stringify(mci.sentiment_distribution), mci.sample_size],
        );
      } catch (err: any) {
        if (err.code !== '42P01') throw err;
      }

      logger.info(`Market Confidence Index refreshed: ${mci.index_value}`);
      return mci.index_value;
    } catch (err: any) {
      logger.error('Market Confidence Index refresh failed', { error: err.message });
      return null;
    }
  }

  // ==========================================================================
  // ORCHESTRATOR: Run All Pipelines
  // ==========================================================================

  /**
   * Run all ML enrichment pipelines in sequence.
   * Designed to be called by a scheduled job (e.g., daily cron).
   */
  async runAllPipelines(): Promise<{
    listings_enriched: number;
    articles_analyzed: number;
    documents_processed: number;
    trends_extracted: boolean;
    forecasts_generated: number;
    confidence_index: number | null;
  }> {
    logger.info('Starting ML Data Hub enrichment pipelines');

    const mlAvailable = await mlServingClient.isAvailable();
    if (!mlAvailable) {
      logger.warn('ML Serving not available — skipping enrichment pipelines');
      return {
        listings_enriched: 0,
        articles_analyzed: 0,
        documents_processed: 0,
        trends_extracted: false,
        forecasts_generated: 0,
        confidence_index: null,
      };
    }

    const listingsEnriched = await this.enrichPropertyListings();
    const articlesAnalyzed = await this.analyzeNewsSentiment();
    const documentsProcessed = await this.processUploadedDocuments();

    let trendsExtracted = false;
    try {
      await this.extractTrends();
      trendsExtracted = true;
    } catch { /* logged internally */ }

    const forecasts = await this.generateRegionalForecasts();
    const confidenceIndex = await this.refreshMarketConfidenceIndex();

    const summary = {
      listings_enriched: listingsEnriched,
      articles_analyzed: articlesAnalyzed,
      documents_processed: documentsProcessed,
      trends_extracted: trendsExtracted,
      forecasts_generated: forecasts.length,
      confidence_index: confidenceIndex,
    };

    logger.info('ML Data Hub enrichment pipelines completed', summary);
    return summary;
  }
}

export const mlDataHubIntegrationService = new MLDataHubIntegrationService();
