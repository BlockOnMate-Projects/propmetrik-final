/**
 * CRM Property Sync Service
 * Phase 5.6: CRM → Data Hub Property Synchronization
 * 
 * Transforms every CRM client into a data contributor by syncing
 * CRM properties to the Data Hub for analytics, valuations, and comps.
 * 
 * Key Features:
 * - Automatic sync on property creation/update
 * - Duplicate detection and linking
 * - Ghana Post GPS geocoding integration
 * - Transaction record creation on deal closure
 * - Anonymization of sensitive client data
 * - Quality scoring and validation
 */

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import db from '../../database';
import { logger } from '../../utils/logger';
import { ghanaPostService } from '../data-hub/ghanaPostGeocodingService';

// ============================================================================
// Types
// ============================================================================

export interface CrmPropertyForSync {
  id: string;
  organization_id: string;
  reference_number: string;
  title: string;
  description?: string;
  property_type: string;
  transaction_type: string;
  address_street?: string;
  address_city: string;
  region: string;
  digital_address?: string;
  landmark?: string;
  latitude?: number;
  longitude?: number;
  price?: number;
  price_currency: string;
  bedrooms?: number;
  bathrooms?: number;
  total_area_sqm?: number;
  land_area_sqm?: number;
  floors?: number;
  year_built?: number;
  features?: any;
  amenities?: any;
  images?: any[];
  listing_agent_id?: string;
  owner_type?: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  datahub_property_id?: string;
  sync_status: string;
  synced_at?: Date;
  sync_error?: string;
  sync_attempts?: number;
  data_hash?: string;
}

export interface SyncResult {
  success: boolean;
  action: 'created' | 'updated' | 'linked' | 'skipped' | 'failed';
  datahub_property_id?: string;
  contribution_id?: string;
  error?: string;
  error_code?: string;
}

export interface SyncEligibility {
  eligible: boolean;
  reasons: string[];
  missingFields: string[];
  qualityScore: number;
}

export interface SyncStats {
  total_properties: number;
  synced_count: number;
  pending_count: number;
  failed_count: number;
  skipped_count: number;
  linked_count: number;
  synced_last_7_days: number;
  synced_last_30_days: number;
  last_sync_at?: Date;
}

export interface TransactionRecord {
  deal_id: string;
  crm_property_id?: string;
  transaction_type: string;
  transaction_date: Date;
  transaction_price: number;
  price_currency: string;
  property_snapshot: {
    property_type: string;
    region: string;
    city: string;
    bedrooms?: number;
    bathrooms?: number;
    total_area_sqm?: number;
    land_area_sqm?: number;
    latitude?: number;
    longitude?: number;
    digital_address?: string;
  };
  created_by?: string;
}

// ============================================================================
// Constants
// ============================================================================

const MIN_QUALITY_SCORE_FOR_SYNC = 30; // Minimum quality score to sync
const MAX_SYNC_RETRIES = 3;

// Required fields for sync eligibility
const REQUIRED_FIELDS = ['title', 'address_city', 'region', 'property_type'];
const RECOMMENDED_FIELDS = ['price', 'bedrooms', 'total_area_sqm', 'digital_address', 'latitude', 'longitude'];

// ============================================================================
// Service Class
// ============================================================================

export class CrmPropertySyncService {

  // ==========================================================================
  // Sync Eligibility
  // ==========================================================================

  /**
   * Check if a CRM property is eligible for Data Hub sync
   */
  async checkSyncEligibility(propertyId: string): Promise<SyncEligibility> {
    const result = await db.query<CrmPropertyForSync>(
      `SELECT * FROM crm_properties WHERE id = $1`,
      [propertyId]
    );

    if (result.rows.length === 0) {
      return {
        eligible: false,
        reasons: ['Property not found'],
        missingFields: [],
        qualityScore: 0,
      };
    }

    const property = result.rows[0];
    return this.evaluateEligibility(property);
  }

  /**
   * Evaluate property eligibility based on data quality
   */
  private evaluateEligibility(property: CrmPropertyForSync): SyncEligibility {
    const reasons: string[] = [];
    const missingFields: string[] = [];
    let qualityScore = 0;

    // Check required fields (40 points total)
    for (const field of REQUIRED_FIELDS) {
      const value = (property as any)[field];
      if (!value || (typeof value === 'string' && value.trim() === '')) {
        missingFields.push(field);
      } else {
        qualityScore += 10;
      }
    }

    // Check recommended fields (60 points total)
    for (const field of RECOMMENDED_FIELDS) {
      const value = (property as any)[field];
      if (value !== null && value !== undefined && value !== '') {
        qualityScore += 10;
      }
    }

    // Status check - don't sync withdrawn/expired
    if (['withdrawn', 'expired', 'archived'].includes(property.status)) {
      reasons.push(`Property status "${property.status}" not eligible for sync`);
    }

    // Already synced check
    if (property.sync_status === 'synced' && property.datahub_property_id) {
      reasons.push('Property already synced');
    }

    // Determine eligibility
    const eligible =
      missingFields.length === 0 &&
      qualityScore >= MIN_QUALITY_SCORE_FOR_SYNC &&
      !['withdrawn', 'expired', 'archived'].includes(property.status);

    if (missingFields.length > 0) {
      reasons.push(`Missing required fields: ${missingFields.join(', ')}`);
    }

    if (qualityScore < MIN_QUALITY_SCORE_FOR_SYNC) {
      reasons.push(`Quality score ${qualityScore} below minimum ${MIN_QUALITY_SCORE_FOR_SYNC}`);
    }

    return {
      eligible,
      reasons: eligible ? ['Property eligible for sync'] : reasons,
      missingFields,
      qualityScore,
    };
  }

  // ==========================================================================
  // Main Sync Method
  // ==========================================================================

  /**
   * Sync a CRM property to the Data Hub
   */
  async syncToDataHub(
    crmPropertyId: string,
    triggeredBy?: string,
    triggerSource: 'auto' | 'manual' | 'deal_closure' | 'update' = 'auto'
  ): Promise<SyncResult> {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Get property
      const propResult = await client.query<CrmPropertyForSync>(
        `SELECT * FROM crm_properties WHERE id = $1 FOR UPDATE`,
        [crmPropertyId]
      );

      if (propResult.rows.length === 0) {
        throw new Error('Property not found');
      }

      const property = propResult.rows[0];

      // Update sync status to processing
      await client.query(
        `UPDATE crm_properties 
         SET sync_status = 'syncing', last_sync_attempt_at = NOW(), sync_attempts = sync_attempts + 1
         WHERE id = $1`,
        [crmPropertyId]
      );

      // Check eligibility
      const eligibility = this.evaluateEligibility(property);

      if (!eligibility.eligible) {
        // Mark as skipped
        await this.logSyncAttempt(client, {
          crm_property_id: crmPropertyId,
          organization_id: property.organization_id,
          sync_action: 'create',
          sync_status: 'skipped',
          error_message: eligibility.reasons.join('; '),
          triggered_by: triggeredBy,
          trigger_source: triggerSource,
        });

        await client.query(
          `UPDATE crm_properties SET sync_status = 'skipped', sync_error = $2 WHERE id = $1`,
          [crmPropertyId, eligibility.reasons.join('; ')]
        );

        await client.query('COMMIT');

        return {
          success: false,
          action: 'skipped',
          error: eligibility.reasons.join('; '),
        };
      }

      // Geocode if missing coordinates
      let geocodedProperty = { ...property };
      if (!property.latitude || !property.longitude) {
        geocodedProperty = await this.geocodeProperty(property);
      }

      // Check for existing property (duplicate detection)
      const existingProperty = await this.findExistingProperty(geocodedProperty);

      let result: SyncResult;

      if (existingProperty) {
        // Link to existing property
        result = await this.linkToExistingProperty(client, geocodedProperty, existingProperty, triggeredBy, triggerSource);
      } else {
        // Create new property in Data Hub
        result = await this.createDataHubProperty(client, geocodedProperty, triggeredBy, triggerSource);
      }

      if (result.success) {
        // Update CRM property with sync result
        await client.query(
          `UPDATE crm_properties 
           SET datahub_property_id = $2, sync_status = 'synced', synced_at = NOW(), sync_error = NULL
           WHERE id = $1`,
          [crmPropertyId, result.datahub_property_id]
        );
      } else {
        await client.query(
          `UPDATE crm_properties SET sync_status = 'failed', sync_error = $2 WHERE id = $1`,
          [crmPropertyId, result.error]
        );
      }

      await client.query('COMMIT');

      logger.info('CRM property sync completed', {
        crmPropertyId,
        action: result.action,
        datahubPropertyId: result.datahub_property_id,
        success: result.success,
      });

      return result;

    } catch (error: any) {
      await client.query('ROLLBACK');

      logger.error('CRM property sync failed', {
        crmPropertyId,
        error: error.message,
      });

      // Update failure status
      await db.query(
        `UPDATE crm_properties SET sync_status = 'failed', sync_error = $2 WHERE id = $1`,
        [crmPropertyId, error.message]
      );

      return {
        success: false,
        action: 'failed',
        error: error.message,
        error_code: 'SYNC_ERROR',
      };
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // Geocoding
  // ==========================================================================

  /**
   * Geocode property using Ghana Post GPS
   */
  private async geocodeProperty(property: CrmPropertyForSync): Promise<CrmPropertyForSync> {
    const result = { ...property };

    try {
      // Try Ghana Post GPS digital address first
      if (property.digital_address) {
        const gpsResult = await ghanaPostService.geocodeDigitalAddress(property.digital_address);
        if (gpsResult && gpsResult.latitude && gpsResult.longitude) {
          result.latitude = gpsResult.latitude;
          result.longitude = gpsResult.longitude;
          logger.info('Property geocoded via Ghana Post GPS', {
            propertyId: property.id,
            digitalAddress: property.digital_address,
          });
          return result;
        }
      }

      // Try neighborhood-based geocoding
      if (property.address_city) {
        const neighborhoodResult = await ghanaPostService.geocodeByNeighborhood(property.address_city);
        if (neighborhoodResult) {
          result.latitude = neighborhoodResult.latitude;
          result.longitude = neighborhoodResult.longitude;

          // Also set digital address if we got one (use digitalAddress from GhanaPostGeocode type)
          if (neighborhoodResult.digitalAddress && !property.digital_address) {
            result.digital_address = neighborhoodResult.digitalAddress;
          }
        }
      }
    } catch (error) {
      logger.warn('Geocoding failed for property', {
        propertyId: property.id,
        error: (error as Error).message,
      });
    }

    return result;
  }

  // ==========================================================================
  // Duplicate Detection
  // ==========================================================================

  /**
   * Find existing property in Data Hub that matches this CRM property
   */
  private async findExistingProperty(property: CrmPropertyForSync): Promise<{ id: string; match_type: string } | null> {
    // Strategy 1: Match by Ghana Post GPS (exact match)
    if (property.digital_address) {
      const gpsMatch = await db.query<{ id: string }>(
        `SELECT id FROM properties 
         WHERE digital_address = $1 
         AND deleted_at IS NULL
         LIMIT 1`,
        [property.digital_address]
      );
      if (gpsMatch.rows.length > 0) {
        return { id: gpsMatch.rows[0].id, match_type: 'gps_exact' };
      }
    }

    // Strategy 2: Match by coordinates (within 50 meters)
    if (property.latitude && property.longitude) {
      const coordMatch = await db.query<{ id: string; distance: number }>(
        `SELECT id, 
                ST_Distance(
                  ST_SetSRID(ST_Point($2, $1), 4326)::geography,
                  ST_SetSRID(ST_Point(longitude, latitude), 4326)::geography
                ) as distance
         FROM properties 
         WHERE latitude IS NOT NULL 
           AND longitude IS NOT NULL
           AND deleted_at IS NULL
           AND ST_DWithin(
             ST_SetSRID(ST_Point($2, $1), 4326)::geography,
             ST_SetSRID(ST_Point(longitude, latitude), 4326)::geography,
             50  -- 50 meters
           )
         ORDER BY distance
         LIMIT 1`,
        [property.latitude, property.longitude]
      );

      if (coordMatch.rows.length > 0) {
        return { id: coordMatch.rows[0].id, match_type: 'coordinate_match' };
      }
    }

    // Strategy 3: Fuzzy match by address + property type + similar specs
    if (property.address_city && property.address_street) {
      const fuzzyMatch = await db.query<{ id: string }>(
        `SELECT id FROM properties
         WHERE LOWER(address_city) = LOWER($1)
           AND property_type = $2::property_type_enum
           AND deleted_at IS NULL
           AND (
             (bedrooms = $3 OR $3 IS NULL)
             AND (ABS(COALESCE(total_area_sqm, 0) - COALESCE($4::numeric, 0)) < 20 OR $4::numeric IS NULL)
           )
           AND SIMILARITY(LOWER(COALESCE(address_street, '')), LOWER($5)) > 0.5
         LIMIT 1`,
        [
          property.address_city,
          this.mapPropertyType(property.property_type),
          property.bedrooms,
          property.total_area_sqm,
          property.address_street || '',
        ]
      );

      if (fuzzyMatch.rows.length > 0) {
        return { id: fuzzyMatch.rows[0].id, match_type: 'fuzzy_address' };
      }
    }

    return null;
  }

  // ==========================================================================
  // Property Creation & Linking
  // ==========================================================================

  /**
   * Link CRM property to existing Data Hub property
   */
  private async linkToExistingProperty(
    client: any,
    crmProperty: CrmPropertyForSync,
    existingProperty: { id: string; match_type: string },
    triggeredBy?: string,
    triggerSource?: string
  ): Promise<SyncResult> {
    const contributionId = uuidv4();

    // Create contribution record for the link (canonical contributions columns).
    await client.query(
      `INSERT INTO contributions (
        id, contributor_id, contributor_type, contribution_type, data,
        validation_status, source_context, metadata,
        applied_property_id, is_applied, applied_at, created_at
      ) VALUES ($1, $2, 'system', 'crm_property_update', $3, 'auto_approved', 'crm', $4, $5, TRUE, NOW(), NOW())`,
      [
        contributionId,
        triggeredBy || null,
        JSON.stringify({
          action: 'link',
          match_type: existingProperty.match_type,
          crm_reference: crmProperty.reference_number,
          organization_id: crmProperty.organization_id,
        }),
        JSON.stringify({
          source_id: crmProperty.id,
          organization_id: crmProperty.organization_id,
          datahub_property_id: existingProperty.id,
          match_type: existingProperty.match_type,
          automated: true,
        }),
        existingProperty.id,
      ]
    );

    // Log sync attempt
    await this.logSyncAttempt(client, {
      crm_property_id: crmProperty.id,
      organization_id: crmProperty.organization_id,
      sync_action: 'link',
      sync_status: 'completed',
      datahub_property_id: existingProperty.id,
      contribution_id: contributionId,
      triggered_by: triggeredBy,
      trigger_source: triggerSource,
    });

    return {
      success: true,
      action: 'linked',
      datahub_property_id: existingProperty.id,
      contribution_id: contributionId,
    };
  }

  /**
   * Create new property in Data Hub from CRM property
   */
  private async createDataHubProperty(
    client: any,
    crmProperty: CrmPropertyForSync,
    triggeredBy?: string,
    triggerSource?: string
  ): Promise<SyncResult> {
    const propertyId = uuidv4();
    const contributionId = uuidv4();

    // Map CRM property to Data Hub schema
    const dataHubProperty = this.mapToDataHubSchema(crmProperty, propertyId);

    // Insert into the centralized `properties` table (the valuation comparable
    // source). Column names/types match the real schema — region & property_type
    // are NOT-NULL enums (region is the partition key); data hub comps are
    // marketplace_enabled=FALSE so they never surface as public listings.
    const geocoded = dataHubProperty.latitude != null && dataHubProperty.longitude != null;
    await client.query(
      `INSERT INTO properties (
        id, organization_id, reference_number, title, description,
        region, address_city, address_district, address_street, digital_address,
        property_type, transaction_type,
        bedrooms, bathrooms, floors, total_area_sqm, land_area_sqm, year_built,
        price, price_currency, status,
        latitude, longitude, location_verified, marketplace_enabled,
        features, amenities, image_urls, evidence_type,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6::region_code_enum, $7, $8, $9, $10,
        $11::property_type_enum, $12::transaction_type_enum,
        $13, $14, $15, $16, $17, $18,
        $19, $20, 'active',
        $21, $22, $23, FALSE,
        $24::jsonb, $25::jsonb, $26::jsonb, 'contributed',
        NOW(), NOW()
      )`,
      [
        dataHubProperty.id,
        crmProperty.organization_id,
        dataHubProperty.reference_number,
        dataHubProperty.title,
        dataHubProperty.description,
        dataHubProperty.region,
        dataHubProperty.city,
        dataHubProperty.neighborhood,
        dataHubProperty.address,
        dataHubProperty.digital_address,
        dataHubProperty.property_type,
        dataHubProperty.transaction_type,
        dataHubProperty.bedrooms,
        dataHubProperty.bathrooms,
        dataHubProperty.floors,
        dataHubProperty.total_area_sqm,
        dataHubProperty.land_area_sqm,
        dataHubProperty.year_built,
        dataHubProperty.price,
        dataHubProperty.currency,
        dataHubProperty.latitude,
        dataHubProperty.longitude,
        geocoded,
        JSON.stringify(dataHubProperty.features || []),
        JSON.stringify(dataHubProperty.amenities || []),
        JSON.stringify(dataHubProperty.images || []),
      ]
    );

    // Audit/credit record in the contributions queue, marked applied (the data
    // now lives in `properties`). Uses the canonical contributions columns.
    await client.query(
      `INSERT INTO contributions (
        id, contributor_id, contributor_type, contribution_type, data,
        validation_status, source_context, metadata,
        applied_property_id, is_applied, applied_at, created_at
      ) VALUES ($1, $2, 'system', 'crm_property_new', $3, 'auto_approved', 'crm', $4, $5, TRUE, NOW(), NOW())`,
      [
        contributionId,
        triggeredBy || null,
        JSON.stringify({
          action: 'create',
          crm_reference: crmProperty.reference_number,
          organization_id: crmProperty.organization_id,
          quality_score: dataHubProperty.data_quality_score,
        }),
        JSON.stringify({
          source_id: crmProperty.id,
          organization_id: crmProperty.organization_id,
          datahub_property_id: propertyId,
          automated: true,
        }),
        propertyId,
      ]
    );

    // Log sync attempt
    await this.logSyncAttempt(client, {
      crm_property_id: crmProperty.id,
      organization_id: crmProperty.organization_id,
      sync_action: 'create',
      sync_status: 'completed',
      datahub_property_id: propertyId,
      contribution_id: contributionId,
      triggered_by: triggeredBy,
      trigger_source: triggerSource,
    });

    return {
      success: true,
      action: 'created',
      datahub_property_id: propertyId,
      contribution_id: contributionId,
    };
  }

  // ==========================================================================
  // Transaction Sync (Deal Closure)
  // ==========================================================================

  /**
   * Create transaction record when a deal is closed
   */
  async syncDealTransaction(record: TransactionRecord): Promise<SyncResult> {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const transactionId = uuidv4();
      const contributionId = uuidv4();

      // Calculate price per sqm if we have area
      const pricePerSqm = record.property_snapshot.total_area_sqm && record.transaction_price
        ? record.transaction_price / record.property_snapshot.total_area_sqm
        : null;

      // Insert transaction record
      await client.query(
        `INSERT INTO crm_transaction_records (
          id, organization_id, deal_id, crm_property_id, datahub_property_id,
          transaction_type, transaction_date, transaction_price, price_currency, price_per_sqm,
          property_type, property_region, property_city, bedrooms, bathrooms,
          total_area_sqm, land_area_sqm, latitude, longitude, digital_address,
          verification_status, created_by, created_at
        ) VALUES (
          $1, (SELECT organization_id FROM deals WHERE id = $2), $2, $3, $4,
          $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
          'agent_verified', $20, NOW()
        )`,
        [
          transactionId,
          record.deal_id,
          record.crm_property_id,
          null, // Will be updated after Data Hub sync
          record.transaction_type,
          record.transaction_date,
          record.transaction_price,
          record.price_currency,
          pricePerSqm,
          record.property_snapshot.property_type,
          record.property_snapshot.region,
          record.property_snapshot.city,
          record.property_snapshot.bedrooms,
          record.property_snapshot.bathrooms,
          record.property_snapshot.total_area_sqm,
          record.property_snapshot.land_area_sqm,
          record.property_snapshot.latitude,
          record.property_snapshot.longitude,
          record.property_snapshot.digital_address,
          record.created_by,
        ]
      );

      // Create contribution for the transaction data
      await client.query(
        `INSERT INTO contributions (
          id, contributor_id, contribution_type, source_context, source_id,
          data, validation_status, property_region, trust_score, credits_awarded, created_at
        ) VALUES ($1, $2, 'crm_deal_transaction', 'crm', $3, $4, 'auto_validated', $5, 0.9, 50, NOW())`,
        [
          contributionId,
          record.created_by,
          record.deal_id,
          JSON.stringify({
            transaction_type: record.transaction_type,
            transaction_date: record.transaction_date,
            price: record.transaction_price,
            currency: record.price_currency,
            price_per_sqm: pricePerSqm,
            property_type: record.property_snapshot.property_type,
            region: record.property_snapshot.region,
            city: record.property_snapshot.city,
            bedrooms: record.property_snapshot.bedrooms,
            bathrooms: record.property_snapshot.bathrooms,
            area_sqm: record.property_snapshot.total_area_sqm,
          }),
          this.mapRegion(record.property_snapshot.region),
        ]
      );

      // Update transaction record with sync status
      await client.query(
        `UPDATE crm_transaction_records 
         SET synced_to_datahub = TRUE, datahub_contribution_id = $2, synced_at = NOW()
         WHERE id = $1`,
        [transactionId, contributionId]
      );

      await client.query('COMMIT');

      logger.info('Deal transaction synced to Data Hub', {
        dealId: record.deal_id,
        transactionId,
        contributionId,
        transactionType: record.transaction_type,
        price: record.transaction_price,
      });

      return {
        success: true,
        action: 'created',
        contribution_id: contributionId,
      };

    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('Failed to sync deal transaction', {
        dealId: record.deal_id,
        error: error.message,
      });

      return {
        success: false,
        action: 'failed',
        error: error.message,
        error_code: 'TRANSACTION_SYNC_ERROR',
      };
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // Status & Stats
  // ==========================================================================

  /**
   * Get sync status for a property
   */
  async getSyncStatus(crmPropertyId: string): Promise<{
    sync_status: string;
    datahub_property_id?: string;
    synced_at?: Date;
    sync_error?: string;
    sync_attempts: number;
    eligibility: SyncEligibility;
  }> {
    const result = await db.query<CrmPropertyForSync>(
      `SELECT * FROM crm_properties WHERE id = $1`,
      [crmPropertyId]
    );

    if (result.rows.length === 0) {
      throw new Error('Property not found');
    }

    const property = result.rows[0];
    const eligibility = this.evaluateEligibility(property);

    return {
      sync_status: property.sync_status,
      datahub_property_id: property.datahub_property_id,
      synced_at: property.synced_at,
      sync_error: property.sync_error,
      sync_attempts: property.sync_attempts || 0,
      eligibility,
    };
  }

  /**
   * Get sync stats for an organization
   */
  async getSyncStats(organizationId: string): Promise<SyncStats> {
    const result = await db.query<SyncStats>(
      `SELECT * FROM crm_sync_stats WHERE organization_id = $1`,
      [organizationId]
    );

    if (result.rows.length === 0) {
      return {
        total_properties: 0,
        synced_count: 0,
        pending_count: 0,
        failed_count: 0,
        skipped_count: 0,
        linked_count: 0,
        synced_last_7_days: 0,
        synced_last_30_days: 0,
      };
    }

    return result.rows[0];
  }

  /**
   * Get properties pending sync
   */
  async getPendingSyncProperties(organizationId: string, limit = 100): Promise<string[]> {
    const result = await db.query<{ id: string }>(
      `SELECT id FROM crm_properties
       WHERE organization_id = $1
         AND (sync_status = 'pending' OR sync_status IS NULL)
         AND (sync_attempts < $2 OR sync_attempts IS NULL)
       ORDER BY created_at ASC
       LIMIT $3`,
      [organizationId, MAX_SYNC_RETRIES, limit]
    );

    return result.rows.map(r => r.id);
  }

  /**
   * Retry failed syncs
   */
  async retryFailedSyncs(organizationId: string): Promise<{ retried: number; successful: number }> {
    const failedProperties = await db.query<{ id: string }>(
      `SELECT id FROM crm_properties
       WHERE organization_id = $1
         AND sync_status = 'failed'
         AND sync_attempts < $2
       ORDER BY last_sync_attempt_at ASC
       LIMIT 50`,
      [organizationId, MAX_SYNC_RETRIES]
    );

    let successful = 0;
    for (const prop of failedProperties.rows) {
      const result = await this.syncToDataHub(prop.id, undefined, 'auto');
      if (result.success) successful++;
    }

    return {
      retried: failedProperties.rows.length,
      successful,
    };
  }

  /**
   * Drain pending CRM property syncs ACROSS ALL ORGANIZATIONS.
   *
   * Org-agnostic version of getPendingSyncProperties — used by the scheduled
   * data-hub sync job so CRM/Deal properties flow into the centralized
   * `properties` table (the valuation comparable source) without anyone having
   * to click a manual "sync" button. Also retries 'failed' rows that still have
   * attempts left. Returns a summary.
   */
  async syncAllPending(limit = 200): Promise<{ processed: number; synced: number; linked: number; skipped: number; failed: number }> {
    const result = await db.query<{ id: string }>(
      `SELECT id FROM crm_properties
        WHERE (sync_status = 'pending' OR sync_status IS NULL OR sync_status = 'failed')
          AND (sync_attempts < $1 OR sync_attempts IS NULL)
          -- Exclude PM-CRM bridge mirrors: the underlying PM property is ALREADY in
          -- the properties table (the data hub), so syncing the mirror double-counts it.
          AND source_pm_property_id IS NULL
        ORDER BY COALESCE(last_sync_attempt_at, created_at) ASC
        LIMIT $2`,
      [MAX_SYNC_RETRIES, limit],
    );

    const summary = { processed: 0, synced: 0, linked: 0, skipped: 0, failed: 0 };
    for (const row of result.rows) {
      summary.processed++;
      try {
        const r = await this.syncToDataHub(row.id, undefined, 'auto');
        if (r.success && r.action === 'created') summary.synced++;
        else if (r.success && r.action === 'linked') summary.linked++;
        else if (r.action === 'skipped') summary.skipped++;
        else summary.failed++;
      } catch (err: any) {
        summary.failed++;
        logger.warn('syncAllPending: a property sync threw', { crmPropertyId: row.id, error: err.message });
      }
    }
    return summary;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * Log sync attempt for audit trail
   */
  private async logSyncAttempt(
    client: any,
    data: {
      crm_property_id: string;
      organization_id: string;
      sync_action: string;
      sync_status: string;
      datahub_property_id?: string;
      contribution_id?: string;
      error_code?: string;
      error_message?: string;
      triggered_by?: string;
      trigger_source?: string;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO crm_property_sync_log (
        crm_property_id, organization_id, sync_action, sync_status,
        datahub_property_id, contribution_id, error_code, error_message,
        triggered_by, trigger_source, processing_completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      [
        data.crm_property_id,
        data.organization_id,
        data.sync_action,
        data.sync_status,
        data.datahub_property_id,
        data.contribution_id,
        data.error_code,
        data.error_message,
        data.triggered_by,
        data.trigger_source,
      ]
    );
  }

  /**
   * Map CRM property to Data Hub schema
   */
  private mapToDataHubSchema(crmProperty: CrmPropertyForSync, newId: string): any {
    // Anonymize owner data - only use for internal reference
    const anonymizedDescription = this.anonymizeDescription(crmProperty.description);

    // Calculate quality score
    const qualityScore = this.calculateQualityScore(crmProperty);

    return {
      id: newId,
      source_slug: 'crm_client',
      source_id: crmProperty.id,
      source_url: null,
      reference_number: crmProperty.reference_number,
      title: this.anonymizeTitle(crmProperty.title),
      description: anonymizedDescription,
      property_type: this.mapPropertyType(crmProperty.property_type),
      transaction_type: crmProperty.transaction_type,
      region: this.mapRegion(crmProperty.region),
      city: crmProperty.address_city,
      neighborhood: crmProperty.address_city, // Use city as neighborhood
      address: crmProperty.address_street,
      digital_address: crmProperty.digital_address,
      landmark: crmProperty.landmark,
      latitude: crmProperty.latitude,
      longitude: crmProperty.longitude,
      coordinates_source: crmProperty.digital_address ? 'ghana_post_gps' : 'city_center',
      geocoding_confidence: crmProperty.digital_address ? 0.9 : 0.5,
      price: crmProperty.price,
      currency: crmProperty.price_currency,
      price_negotiable: true,
      bedrooms: crmProperty.bedrooms,
      bathrooms: crmProperty.bathrooms,
      total_area_sqm: crmProperty.total_area_sqm,
      land_area_sqm: crmProperty.land_area_sqm,
      floors: crmProperty.floors,
      year_built: crmProperty.year_built,
      features: crmProperty.features,
      amenities: crmProperty.amenities,
      images: this.sanitizeImages(crmProperty.images),
      data_quality_score: qualityScore,
      is_verified: false,
      verification_source: 'crm_submission',
    };
  }

  /**
   * Map CRM property type to Data Hub enum
   */
  private mapPropertyType(type: string): string {
    const mappings: Record<string, string> = {
      'residential': 'residential_house',
      'apartment': 'apartment_flat',
      'commercial': 'commercial_shop',
      'office': 'commercial_office',
      'land': 'land',
      'warehouse': 'warehouse',
      'industrial': 'industrial',
    };
    return mappings[type?.toLowerCase()] || 'residential_house';
  }

  /**
   * Map CRM region to Data Hub enum
   */
  private mapRegion(region: string): string {
    const normalized = region?.toLowerCase().replace(/[_\s]+/g, '_') || 'greater_accra';

    // Real Ghana regions (region_code_enum values that have table partitions).
    // Pass these through unchanged — do NOT remap to legacy cluster buckets
    // (kumasi_metro / western_cluster / northern_cluster), which may lack a
    // partition and would 500 on insert.
    const REAL_REGIONS = new Set([
      'greater_accra', 'ashanti', 'eastern', 'western', 'central', 'volta',
      'northern', 'upper_east', 'upper_west', 'bono', 'bono_east', 'ahafo',
      'savannah', 'north_east', 'oti', 'western_north',
    ]);
    if (REAL_REGIONS.has(normalized)) return normalized;

    // Common aliases / legacy cluster names → real regions.
    const aliases: Record<string, string> = {
      'accra': 'greater_accra',
      'kumasi': 'ashanti',
      'kumasi_metro': 'ashanti',
      'western_cluster': 'western',
      'northern_cluster': 'northern',
    };
    return aliases[normalized] || 'greater_accra';
  }

  /**
   * Anonymize title to remove personal info
   */
  private anonymizeTitle(title: string): string {
    if (!title) return 'Property Listing';
    // Remove phone numbers
    let cleaned = title.replace(/\d{10,}/g, '');
    // Remove email-like patterns
    cleaned = cleaned.replace(/[\w.-]+@[\w.-]+\.\w+/g, '');
    // Remove common owner references
    cleaned = cleaned.replace(/\b(mr|mrs|miss|dr|chief|alhaji)\s*\.?\s*\w+/gi, '');
    return cleaned.trim() || 'Property Listing';
  }

  /**
   * Anonymize description to remove personal info
   */
  private anonymizeDescription(description?: string): string | null {
    if (!description) return null;
    let cleaned = description;
    // Remove phone numbers
    cleaned = cleaned.replace(/(\+?233|0)\d{9,}/g, '[phone]');
    // Remove email addresses
    cleaned = cleaned.replace(/[\w.-]+@[\w.-]+\.\w+/g, '[email]');
    // Remove names after common titles
    cleaned = cleaned.replace(/\b(contact|call|reach|whatsapp)\s*:?\s*[\w\s]+\d+/gi, '');
    return cleaned;
  }

  /**
   * Sanitize images array
   */
  private sanitizeImages(images?: any[]): string[] {
    if (!Array.isArray(images)) return [];
    return images
      .filter(img => typeof img === 'string' || (img && typeof img.url === 'string'))
      .map(img => typeof img === 'string' ? img : img.url)
      .slice(0, 10); // Max 10 images
  }

  /**
   * Calculate quality score for the property
   */
  private calculateQualityScore(property: CrmPropertyForSync): number {
    let score = 0;

    // Required fields (40 points)
    if (property.title) score += 10;
    if (property.address_city) score += 10;
    if (property.region) score += 10;
    if (property.property_type) score += 10;

    // Location quality (30 points)
    if (property.digital_address) score += 15;
    if (property.latitude && property.longitude) score += 15;

    // Property details (20 points)
    if (property.price) score += 5;
    if (property.bedrooms) score += 5;
    if (property.total_area_sqm) score += 5;
    if (property.description && property.description.length > 50) score += 5;

    // Media (10 points)
    if (property.images && property.images.length > 0) score += 5;
    if (property.images && property.images.length > 3) score += 5;

    return Math.min(score, 100);
  }

  /**
   * Calculate credits to award for contribution
   */
  private calculateCredits(qualityScore: number): number {
    if (qualityScore >= 80) return 25;
    if (qualityScore >= 60) return 15;
    if (qualityScore >= 40) return 10;
    return 5;
  }
}

// Export singleton instance
export const crmPropertySyncService = new CrmPropertySyncService();
export default crmPropertySyncService;
