/**
 * Valuation comparables, method calculations, and cap-rate routes — extracted from valuations.ts (Phase 4).
 */

import { Router, Request, Response } from 'express';
import { query } from '../database';
import { logger } from '../utils/logger';
import { ghanaPostService } from '../services/data-hub/ghanaPostGeocodingService';
import { capRateService, CapRateMethodology, ListingDerivedCapRate } from '../services/analytics/capRateService';
import { constructionCostService } from '../services/data-hub/constructionCostService';
import { validateUUID, engineHeaders } from './valuationRouteMiddleware';

const router = Router();

/**
 * @route GET /api/valuations/:id/comparables
 * @desc Get comparables used in a valuation
 * @access Private
 */
router.get('/:id/comparables', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT * FROM valuation_comparables
       WHERE valuation_id = $1
       ORDER BY similarity_score DESC`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No comparables found for this valuation',
      });
    }

    res.json({
      success: true,
      data: result.rows,
      meta: {
        valuationId: id,
        count: result.rows.length,
      },
    });

  } catch (error: any) {
    logger.error('Failed to get comparables', {
      valuationId: req.params.id,
      error: error.message,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve comparables',
    });
  }
});

/**
 * @route POST /api/valuations/:id/comparables/search
 * @desc Search for comparable properties based on subject property characteristics
 * @access Private
 * 
 * RICS-Compliant Comparable Search Criteria:
 * - Location: Within specified radius from subject property
 * - Property Type: Same or similar property type
 * - Size: Within ±30% of subject GFA/plot size
 * - Age: Within reasonable age range
 * - Condition: Similar condition category
 * - Transaction Recency: Within specified months (default 12)
 * - Building Features: Quality rating, floor level, view, parking
 */
router.post('/:id/comparables/search', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { id: valuationId } = req.params;
    const {
      latitude,
      longitude,
      radiusKm = 15,
      propertyType,
      priceMin,
      priceMax,
      sizeMin,
      sizeMax,
      bedroomsMin,
      bedroomsMax,
      maxAgeMonths = 24,
      condition,
      qualityRating,
      excludeIds = [],
      includeContributed = true,
      limit = 20,
    } = req.body;

    // Get the subject property for context
    const valuationResult = await query(
      `SELECT v.*, p.*
       FROM valuations v
       LEFT JOIN properties p ON p.id = v.property_id
       WHERE v.id = $1`,
      [valuationId]
    );

    if (valuationResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Valuation not found',
      });
    }

    const subjectProperty = valuationResult.rows[0];

    // Use provided values or fall back to subject property
    let searchLat = latitude || subjectProperty.latitude;
    let searchLng = longitude || subjectProperty.longitude;

    // If still no coordinates but we have a digital address, geocode it
    if ((!searchLat || !searchLng) && subjectProperty.digital_address) {
      logger.info('Geocoding digital address for comparables search', {
        digitalAddress: subjectProperty.digital_address,
        valuationId,
      });

      try {
        const geocodeResult = await ghanaPostService.geocodeDigitalAddress(subjectProperty.digital_address);
        if (geocodeResult) {
          searchLat = geocodeResult.latitude;
          searchLng = geocodeResult.longitude;

          // Update the property with the geocoded coordinates for future use
          await query(
            `UPDATE properties SET latitude = $1, longitude = $2 WHERE id = $3`,
            [searchLat, searchLng, subjectProperty.property_id]
          );

          logger.info('Successfully geocoded and updated property coordinates', {
            digitalAddress: subjectProperty.digital_address,
            latitude: searchLat,
            longitude: searchLng,
          });
        }
      } catch (geocodeError) {
        logger.warn('Failed to geocode digital address', {
          digitalAddress: subjectProperty.digital_address,
          error: geocodeError instanceof Error ? geocodeError.message : 'Unknown error',
        });
      }
    }

    const searchPropertyType = propertyType || subjectProperty.property_type;
    const subjectSize = subjectProperty.built_area_sqm || subjectProperty.plot_size || 200;
    const searchSizeMin = sizeMin ?? subjectSize * 0.7;
    const searchSizeMax = sizeMax ?? subjectSize * 1.3;

    // Build RICS-compliant comparable search query
    // Includes: location proximity, property type, size range, age, condition, building features
    // Evidence Types: 'listing' (active), 'delisted_inferred' (probable sale), 
    //                 'verified_sale' (confirmed), 'contributed' (user-submitted)
    // Currency conversion: All prices converted to GHS for uniform comparison
    let searchQuery = `
      WITH fx_rate AS (
        -- Get latest USD/GHS exchange rate
        SELECT (
          SELECT value FROM economic_indicators
           WHERE indicator_type = 'exchange_rate_usd'
           ORDER BY effective_date DESC LIMIT 1
        ) AS usd_to_ghs  -- no fallback: USD rows yield NULL (and are excluded) if no live rate
      )
      SELECT 
        p.id,
        p.reference_number,
        p.title,
        p.address_street,
        p.address_city,
        p.address_district AS neighborhood,
        p.region,
        p.latitude,
        p.longitude,
        p.property_type,
        p.bedrooms,
        p.bathrooms,
        p.built_area_sqm AS gfa,
        p.total_area_sqm AS plot_size,
        p.year_built,
        p.condition,
        p.floors,
        p.amenities,
        -- Original price fields
        p.price AS price_original,
        p.price_currency,
        -- Currency-normalized prices in GHS for uniform comparison
        CASE 
          WHEN p.price_currency = 'USD' THEN p.price * fx.usd_to_ghs
          ELSE p.price  -- Already in GHS or other (treat as GHS)
        END AS asking_price_ghs,
        CASE 
          WHEN p.price_currency = 'USD' THEN COALESCE(p.inferred_sale_price, p.price) * fx.usd_to_ghs
          ELSE COALESCE(p.inferred_sale_price, p.price)
        END AS sale_price,
        -- Keep original asking_price for reference
        p.price AS asking_price,
        -- Exchange rate used for conversion
        fx.usd_to_ghs AS fx_rate_used,
        -- For delisted properties, use delisted_at as sale_date; otherwise use last_seen/created
        COALESCE(p.delisted_at, p.last_seen_at, p.created_at) AS sale_date,
        p.transaction_type AS listing_type,
        p.data_source,
        p.created_at,
        -- Evidence quality fields for RICS/GhIS compliance
        COALESCE(p.evidence_type, 'listing') AS evidence_type,
        p.is_delisted,
        p.first_seen_at,
        p.last_seen_at,
        p.delisted_at,
        p.inferred_sale_price,
        -- Transaction classification fields
        COALESCE(p.is_transaction_record, FALSE) AS is_transaction_record,
        p.transaction_value,
        p.transaction_date,
        p.transaction_source,
        p.transaction_confidence,
        -- Evidence weight from config table (replaces hardcoded values)
        -- Falls back to legacy hardcoded values if config not found
        COALESCE(
          (SELECT ewc.base_weight 
           FROM evidence_weight_config ewc 
           WHERE ewc.evidence_type = COALESCE(p.evidence_type, 'listing')
             AND ewc.is_active = TRUE
             AND (ewc.source_tier IS NULL OR ewc.source_tier = p.data_source::text)
           ORDER BY CASE WHEN ewc.source_tier IS NOT NULL THEN 0 ELSE 1 END
           LIMIT 1),
          CASE 
            WHEN p.evidence_type = 'verified_sale' THEN 1.0
            WHEN p.evidence_type = 'government_record' THEN 1.0
            WHEN p.evidence_type = 'bank_valuation' THEN 0.95
            WHEN p.evidence_type = 'bank_collateral' THEN 0.92
            WHEN p.evidence_type = 'partner_transaction' THEN 0.88
            WHEN p.evidence_type = 'agent_confirmed' THEN 0.85
            WHEN p.evidence_type = 'delisted_inferred' THEN 0.80
            WHEN p.evidence_type = 'contributed' THEN 0.75
            ELSE 0.6  -- listing (asking price)
          END
        ) AS evidence_weight,
        -- Selection priority (lower = better, for ordering)
        COALESCE(
          (SELECT ewc.selection_priority 
           FROM evidence_weight_config ewc 
           WHERE ewc.evidence_type = COALESCE(p.evidence_type, 'listing')
             AND ewc.is_active = TRUE
           LIMIT 1),
          CASE 
            WHEN p.evidence_type = 'verified_sale' THEN 10
            WHEN p.evidence_type = 'government_record' THEN 10
            WHEN p.evidence_type = 'bank_valuation' THEN 20
            WHEN p.evidence_type = 'delisted_inferred' THEN 50
            WHEN p.evidence_type = 'contributed' THEN 60
            ELSE 80  -- listing
          END
        ) AS selection_priority,
        -- RICS classification for reporting
        COALESCE(
          (SELECT ewc.rics_classification 
           FROM evidence_weight_config ewc 
           WHERE ewc.evidence_type = COALESCE(p.evidence_type, 'listing')
             AND ewc.is_active = TRUE
           LIMIT 1),
          CASE 
            WHEN p.evidence_type IN ('verified_sale', 'government_record') THEN 'verified_transaction'
            WHEN p.evidence_type IN ('bank_valuation', 'bank_collateral') THEN 'verified_valuation'
            WHEN p.evidence_type = 'delisted_inferred' THEN 'inferred_transaction'
            WHEN p.evidence_type = 'partner_transaction' THEN 'agent_reported'
            ELSE 'asking_price'
          END
        ) AS rics_classification,
        -- Effective transaction/sale value (prioritize verified data)
        COALESCE(
          p.sold_price,           -- 1. Actual sold price (highest priority)
          p.transaction_value,    -- 2. Transaction value (bank valuation, etc.)
          p.inferred_sale_price,  -- 3. Inferred from delisting
          p.price                 -- 4. Asking price (lowest priority)
        ) AS effective_value,
        -- Calculate distance using Haversine formula (in km)
        (
          6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians($1)) * cos(radians(p.latitude)) *
              cos(radians(p.longitude) - radians($2)) +
              sin(radians($1)) * sin(radians(p.latitude))
            ))
          )
        ) AS distance_km,
        -- Calculate similarity score
        CASE 
          WHEN p.property_type::text = $3::text THEN 30 ELSE 10 
        END +
        CASE 
          WHEN ABS(COALESCE(p.built_area_sqm, p.total_area_sqm, 0) - $4) / NULLIF($4, 0) <= 0.15 THEN 25
          WHEN ABS(COALESCE(p.built_area_sqm, p.total_area_sqm, 0) - $4) / NULLIF($4, 0) <= 0.30 THEN 15
          ELSE 5
        END +
        CASE 
          WHEN p.bedrooms = $5 THEN 15
          WHEN ABS(COALESCE(p.bedrooms, 0) - $5) <= 1 THEN 10
          ELSE 5
        END +
        CASE 
          WHEN p.created_at >= NOW() - INTERVAL '6 months' THEN 20
          WHEN p.created_at >= NOW() - INTERVAL '12 months' THEN 15
          ELSE 5
        END +
        CASE 
          WHEN p.condition::text = $6 THEN 10
          ELSE 5
        END AS similarity_score
      FROM properties p
      CROSS JOIN fx_rate fx
      WHERE p.id != COALESCE($7::uuid, p.id)
        AND p.latitude IS NOT NULL 
        AND p.longitude IS NOT NULL
        AND (p.price IS NOT NULL OR p.inferred_sale_price IS NOT NULL)
        AND COALESCE(p.inferred_sale_price, p.price) > 0
        -- Location filter: within radius
        AND (
          6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians($1)) * cos(radians(p.latitude)) *
              cos(radians(p.longitude) - radians($2)) +
              sin(radians($1)) * sin(radians(p.latitude))
            ))
          )
        ) <= $8
        -- Property type filter
        AND ($3::text IS NULL OR p.property_type::text = $3::text)
        -- Size filter (±30% by default) - also include properties with unknown size
        AND (
          $9::numeric IS NULL OR 
          (p.built_area_sqm IS NULL AND p.total_area_sqm IS NULL) OR
          COALESCE(p.built_area_sqm, p.total_area_sqm) >= $9
        )
        AND (
          $10::numeric IS NULL OR 
          (p.built_area_sqm IS NULL AND p.total_area_sqm IS NULL) OR
          COALESCE(p.built_area_sqm, p.total_area_sqm) <= $10
        )
        -- Transaction recency filter
        AND (p.created_at >= NOW() - ($11::text || ' months')::interval)
        -- Exclude already selected comparables
        AND p.id != ALL($12::uuid[])
        -- Only include sale properties (not rentals)
        AND p.transaction_type = 'sale'
        -- Exclude deleted properties (PM delete sets deleted_at)
        AND p.deleted_at IS NULL
        -- DATA-QUALITY SANITY BAND: drop implausible rows that would pollute the comparable
        -- set AND the summary aggregates (e.g. GHS amounts mislabelled USD -> multi-₵100M rows,
        -- or tiny built areas carrying huge prices -> ₵-millions/m²). Uses the GHS-normalised price.
        AND (CASE WHEN p.price_currency = 'USD'
                  THEN COALESCE(p.inferred_sale_price, p.price) * fx.usd_to_ghs
                  ELSE COALESCE(p.inferred_sale_price, p.price) END)
            BETWEEN 50000 AND 100000000               -- ₵50k .. ₵100M absolute sanity
        AND (
          COALESCE(p.built_area_sqm, p.total_area_sqm) IS NULL          -- unknown size: keep (no ₵/m² check)
          OR (
            COALESCE(p.built_area_sqm, p.total_area_sqm) >= 20          -- reject sub-20 m² "houses"
            AND (CASE WHEN p.price_currency = 'USD'
                      THEN COALESCE(p.inferred_sale_price, p.price) * fx.usd_to_ghs
                      ELSE COALESCE(p.inferred_sale_price, p.price) END)
                / COALESCE(p.built_area_sqm, p.total_area_sqm)
                BETWEEN 500 AND 60000                  -- plausible Ghana ₵/m² band
          )
        )
    `;

    // Add optional filters
    const params: any[] = [
      searchLat,                           // $1
      searchLng,                           // $2
      searchPropertyType,                  // $3
      subjectSize,                         // $4
      subjectProperty.bedrooms || 3,       // $5
      subjectProperty.condition || 'good', // $6
      subjectProperty.id,                  // $7 (exclude subject property)
      radiusKm,                            // $8
      searchSizeMin,                       // $9
      searchSizeMax,                       // $10
      maxAgeMonths,                        // $11
      excludeIds.length > 0 ? excludeIds : ['00000000-0000-0000-0000-000000000000'], // $12
    ];

    // Add price filters if provided
    if (priceMin !== undefined) {
      params.push(priceMin);
      searchQuery += ` AND p.price >= $${params.length}`;
    }
    if (priceMax !== undefined) {
      params.push(priceMax);
      searchQuery += ` AND p.price <= $${params.length}`;
    }

    // Add bedroom filters if provided
    if (bedroomsMin !== undefined) {
      params.push(bedroomsMin);
      searchQuery += ` AND p.bedrooms >= $${params.length}`;
    }
    if (bedroomsMax !== undefined) {
      params.push(bedroomsMax);
      searchQuery += ` AND p.bedrooms <= $${params.length}`;
    }

    // Add condition filter if provided
    if (condition) {
      params.push(condition);
      searchQuery += ` AND p.condition = $${params.length}`;
    }

    // Add quality rating filter if provided
    if (qualityRating) {
      params.push(qualityRating);
      searchQuery += ` AND p.quality_rating = $${params.length}`;
    }

    // RICS/GhIS Compliant Ordering:
    // 1. Prioritize verified transactions over listings (selection_priority)
    // 2. Higher evidence weight (closer to 1.0 = more reliable)
    // 3. Higher similarity score (better match to subject)
    // 4. Closer distance
    // This ensures we prefer verified sales/bank valuations over asking prices
    searchQuery += `
      ORDER BY 
        selection_priority ASC,     -- Lower = better (verified > bank > inferred > listing)
        evidence_weight DESC,       -- Higher = more reliable
        similarity_score DESC,      -- Better physical match
        distance_km ASC            -- Closer = more relevant
      LIMIT $${params.length + 1}
    `;
    params.push(limit);

    const result = await query(searchQuery, params);

    // Calculate gap analysis
    const comparablesFound = result.rows.length;
    const minRequired = 3; // RICS minimum for reliable valuation
    const hasGap = comparablesFound < minRequired;
    const gapSeverity = comparablesFound === 0 ? 'severe' : comparablesFound < 3 ? 'moderate' : comparablesFound < 5 ? 'minor' : 'none';

    // Calculate aggregate statistics for the UI
    // Note: PostgreSQL numeric columns are returned as strings by node-pg, so parseFloat is required
    // Median is the correct central tendency for comparables: robust to the odd high/low
    // outlier so a single atypical sale can't distort the headline figures (mean can).
    const median = (vals: number[]): number => {
      const a = vals.filter((v) => Number.isFinite(v) && v > 0).sort((x, y) => x - y);
      if (a.length === 0) return 0;
      const mid = Math.floor(a.length / 2);
      return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
    };
    const pricesGhs = result.rows.map((r: any) => parseFloat(r.sale_price) || parseFloat(r.effective_value) || 0);
    const pricePerSqm = result.rows.map((r: any) => {
      const price = parseFloat(r.sale_price) || parseFloat(r.effective_value) || 0;
      const area = parseFloat(r.gfa) || parseFloat(r.plot_size) || 0;
      return area > 0 ? price / area : 0;
    });
    const aggregates = comparablesFound > 0 ? {
      avgPrice: Math.round(median(pricesGhs)),            // median (robust), exposed under the same key
      avgPricePerSqm: Math.round(median(pricePerSqm)),    // median (robust)
      avgDistance: Math.round((result.rows.reduce((sum: number, r: any) => sum + (parseFloat(r.distance_km) || 0), 0) / comparablesFound) * 10) / 10,
      avgSimilarity: Math.round(result.rows.reduce((sum: number, r: any) => sum + (parseFloat(r.similarity_score) || 0), 0) / comparablesFound),
      minPrice: Math.min(...result.rows.map((r: any) => parseFloat(r.sale_price) || parseFloat(r.effective_value) || 0)),
      maxPrice: Math.max(...result.rows.map((r: any) => parseFloat(r.sale_price) || parseFloat(r.effective_value) || 0)),
      minPricePerSqm: Math.round(Math.min(...result.rows.map((r: any) => (parseFloat(r.sale_price) || parseFloat(r.effective_value) || 0) / (parseFloat(r.gfa) || parseFloat(r.plot_size) || 1)))),
      maxPricePerSqm: Math.round(Math.max(...result.rows.map((r: any) => (parseFloat(r.sale_price) || parseFloat(r.effective_value) || 0) / (parseFloat(r.gfa) || parseFloat(r.plot_size) || 1)))),
      // Enhanced evidence quality breakdown per RICS/GhIS guidance
      evidenceQuality: {
        // Tier 1: Government verified (highest reliability)
        governmentRecords: result.rows.filter((r: any) => r.evidence_type === 'government_record' || r.evidence_type === 'lands_commission').length,
        // Tier 2: Bank valuations
        bankValuations: result.rows.filter((r: any) => ['bank_valuation', 'bank_collateral', 'forced_sale'].includes(r.evidence_type)).length,
        // Verified sales (any source with confirmed transaction)
        verifiedSales: result.rows.filter((r: any) => r.evidence_type === 'verified_sale').length,
        // Partner/agent reported
        partnerTransactions: result.rows.filter((r: any) => ['partner_transaction', 'agent_confirmed'].includes(r.evidence_type)).length,
        // Inferred from delisting
        delistedInferred: result.rows.filter((r: any) => r.evidence_type === 'delisted_inferred').length,
        // User contributed
        contributed: result.rows.filter((r: any) => r.evidence_type === 'contributed').length,
        // Active listings (asking prices only)
        activeListings: result.rows.filter((r: any) => r.evidence_type === 'listing' || r.evidence_type === 'listing_aged').length,

        // Transaction-based count (actual sales vs listing prices)
        transactionRecords: result.rows.filter((r: any) => r.is_transaction_record === true).length,
        askingPriceOnly: result.rows.filter((r: any) => r.is_transaction_record !== true).length,

        // Average evidence weight (1.0 = all verified, 0.6 = all listings)
        avgWeight: Math.round(result.rows.reduce((sum: number, r: any) => sum + (r.evidence_weight || 0.6), 0) / comparablesFound * 100) / 100,

        // RICS classification breakdown
        ricsClassification: {
          verifiedTransaction: result.rows.filter((r: any) => r.rics_classification === 'verified_transaction').length,
          verifiedValuation: result.rows.filter((r: any) => r.rics_classification === 'verified_valuation').length,
          inferredTransaction: result.rows.filter((r: any) => r.rics_classification === 'inferred_transaction').length,
          agentReported: result.rows.filter((r: any) => r.rics_classification === 'agent_reported').length,
          askingPrice: result.rows.filter((r: any) => r.rics_classification === 'asking_price' || !r.rics_classification).length,
        },

        // RICS compliance quality rating based on transaction evidence
        qualityRating: (() => {
          // Count all transaction-based evidence (not just asking prices)
          const verified = result.rows.filter((r: any) => ['verified_sale', 'government_record', 'lands_commission'].includes(r.evidence_type)).length;
          const bankBased = result.rows.filter((r: any) => ['bank_valuation', 'bank_collateral'].includes(r.evidence_type)).length;
          const partnerBased = result.rows.filter((r: any) => ['partner_transaction', 'agent_confirmed'].includes(r.evidence_type)).length;
          const delisted = result.rows.filter((r: any) => r.evidence_type === 'delisted_inferred').length;

          // Weight: verified=1.0, bank=0.9, partner=0.8, delisted=0.7
          const weightedScore = (verified * 1.0 + bankBased * 0.9 + partnerBased * 0.8 + delisted * 0.7) / comparablesFound;

          if (weightedScore >= 0.85) return 'excellent';  // >85% weighted transaction evidence
          if (weightedScore >= 0.65) return 'good';       // >65% weighted transaction evidence
          if (weightedScore >= 0.40) return 'fair';       // >40% weighted transaction evidence
          if (weightedScore >= 0.20) return 'limited';    // >20% weighted transaction evidence
          return 'insufficient';  // Mostly asking prices
        })(),

        // Compliance note for RICS reporting
        complianceNote: (() => {
          const transactionBased = result.rows.filter((r: any) => r.is_transaction_record === true).length;
          const ratio = transactionBased / comparablesFound;
          if (ratio >= 0.75) return 'Evidence quality meets RICS requirements - majority transaction-based';
          if (ratio >= 0.50) return 'Evidence quality acceptable - mixed transaction and listing data';
          if (ratio >= 0.25) return 'Evidence quality limited - predominantly listing prices, apply caution';
          return 'Evidence quality insufficient - primarily asking prices, consider expanding search or noting limitation';
        })(),
      },
    } : null;

    res.json({
      success: true,
      data: result.rows,
      meta: {
        valuationId,
        searchCriteria: {
          latitude: searchLat,
          longitude: searchLng,
          radiusKm,
          propertyType: searchPropertyType,
          sizeRange: { min: searchSizeMin, max: searchSizeMax },
          maxAgeMonths,
        },
        count: comparablesFound,
        hasGap,
        gapSeverity,
        aggregates,
        // Currency conversion info
        currencyConversion: {
          targetCurrency: 'GHS',
          fxRateUsed: result.rows[0]?.fx_rate_used ?? null,
          fxRateDate: new Date().toISOString().split('T')[0],
          usdCount: result.rows.filter((r: any) => r.price_currency === 'USD').length,
          ghsCount: result.rows.filter((r: any) => r.price_currency === 'GHS').length,
          note: 'All prices converted to GHS for uniform comparison'
        },
        gapAnalysis: hasGap ? {
          required: minRequired,
          found: comparablesFound,
          shortfall: minRequired - comparablesFound,
          message: `Found ${comparablesFound} comparable${comparablesFound === 1 ? '' : 's'}, need at least ${minRequired} for reliable valuation`,
          contributionPrompt: {
            type: 'comparable',
            title: 'Help Improve Valuations in This Area',
            description: `We need more comparable sales data for ${subjectProperty.neighborhood || subjectProperty.address_city || 'this area'}. Contribute property data to earn credits.`,
            rewardCredits: 50 + (minRequired - comparablesFound) * 25,
            searchCriteria: {
              region: subjectProperty.region,
              propertyType: searchPropertyType,
              minArea: searchSizeMin,
              maxArea: searchSizeMax,
              radiusKm,
            },
          },
        } : null,
      },
    });

  } catch (error: any) {
    logger.error('Failed to search comparables', {
      valuationId: req.params.id,
      error: error.message,
      stack: error.stack,
      detail: error.detail || 'No detail',
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to search for comparables',
      detail: error.message,
    });
  }
});

/**
 * @route POST /api/valuations/:id/rental-comparables/search
 * @desc Search for rental comparable properties for Income Approach rent estimation
 * @access Private
 * 
 * RICS-Compliant Rental Comparable Search:
 * - Location: Within specified radius (default 3km - tighter for rentals)
 * - Property Type: Same or similar property type
 * - Size: Within ±25% of subject GFA
 * - Bedrooms: Within ±1 of subject
 * - Recency: Within 6 months (rentals change faster than sales)
 * - Transaction Type: Rental listings only
 * 
 * Used by: Income Approach to estimate market rent for subject property
 */
router.post('/:id/rental-comparables/search', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { id: valuationId } = req.params;
    const {
      latitude,
      longitude,
      radiusKm = 3,              // Default: 3km (tighter for rentals)
      propertyType,
      bedroomsMin,
      bedroomsMax,
      sizeMin,
      sizeMax,
      maxAgeMonths = 6,         // Default: 6 months (rentals change faster)
      furnishing,               // 'furnished' | 'unfurnished' | 'semi-furnished'
      excludeIds = [],
      limit = 20,
    } = req.body;

    // Get the subject property for context
    const valuationResult = await query(
      `SELECT v.*, p.*
       FROM valuations v
       LEFT JOIN properties p ON p.id = v.property_id
       WHERE v.id = $1`,
      [valuationId]
    );

    if (valuationResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Valuation not found',
      });
    }

    const subjectProperty = valuationResult.rows[0];

    // Use provided values or fall back to subject property
    let searchLat = latitude || subjectProperty.latitude;
    let searchLng = longitude || subjectProperty.longitude;

    // If still no coordinates but we have a digital address, geocode it
    if ((!searchLat || !searchLng) && subjectProperty.digital_address) {
      logger.info('Geocoding digital address for rental comparables search', {
        digitalAddress: subjectProperty.digital_address,
        valuationId,
      });

      try {
        const geocodeResult = await ghanaPostService.geocodeDigitalAddress(subjectProperty.digital_address);
        if (geocodeResult) {
          searchLat = geocodeResult.latitude;
          searchLng = geocodeResult.longitude;
        }
      } catch (geocodeError) {
        logger.warn('Failed to geocode digital address for rental search', {
          digitalAddress: subjectProperty.digital_address,
          error: geocodeError instanceof Error ? geocodeError.message : 'Unknown error',
        });
      }
    }

    const searchPropertyType = propertyType || subjectProperty.property_type;
    const subjectSize = subjectProperty.built_area_sqm || subjectProperty.plot_size || 150;
    const subjectBedrooms = subjectProperty.bedrooms || 3;

    // RICS/GhIS tiered comparability: prefer the SAME sub-type, but admit other rentals in the same
    // CATEGORY (e.g. a house compared to apartments where same-type evidence is scarce). Same-type
    // comps still rank higher via the similarity score (exact type = 25 vs other = 10), and the
    // cross-type difference is flagged for adjustment/disclosure — rather than excluding them outright,
    // which forced the area-benchmark fallback even when local residential evidence existed.
    const PROPERTY_CATEGORY: Record<string, string[]> = {
      residential: ['residential_house', 'apartment_flat', 'townhouse'],
      commercial: ['commercial_shop', 'commercial_office', 'warehouse', 'industrial', 'mixed_use'],
      land: ['land'],
    };
    const categoryOf = (t?: string | null): string =>
      Object.keys(PROPERTY_CATEGORY).find((cat) => PROPERTY_CATEGORY[cat].includes(String(t))) || 'residential';
    const subjectCategory = categoryOf(searchPropertyType);
    // Always include the subject's own sub-type even if it is not in the map.
    const searchCategoryTypes = Array.from(
      new Set([...(PROPERTY_CATEGORY[subjectCategory] || []), String(searchPropertyType)])
    );

    // Size range: ±25% for rentals (tighter than sales)
    const searchSizeMin = sizeMin ?? subjectSize * 0.75;
    const searchSizeMax = sizeMax ?? subjectSize * 1.25;

    // Bedroom range: ±1 by default
    const searchBedroomsMin = bedroomsMin ?? Math.max(1, subjectBedrooms - 1);
    const searchBedroomsMax = bedroomsMax ?? subjectBedrooms + 1;

    // Build rental comparables search query
    // Filters for transaction_type = 'rental' only
    let searchQuery = `
      WITH fx_rate AS (
        -- Get latest USD/GHS exchange rate
        SELECT (
          SELECT value FROM economic_indicators
           WHERE indicator_type = 'exchange_rate_usd'
           ORDER BY effective_date DESC LIMIT 1
        ) AS usd_to_ghs  -- no fallback: USD rows yield NULL (and are excluded) if no live rate
      )
      SELECT 
        p.id,
        p.reference_number,
        p.title,
        p.address_street,
        p.address_city,
        p.address_district AS neighborhood,
        p.region,
        p.latitude,
        p.longitude,
        p.property_type,
        p.bedrooms,
        p.bathrooms,
        p.built_area_sqm AS gfa_sqm,
        p.total_area_sqm AS plot_size,
        -- Original price fields
        p.price AS price_original,
        p.price_currency,
        -- Currency-normalized rent in GHS
        CASE 
          WHEN p.price_currency = 'USD' THEN p.price * fx.usd_to_ghs
          ELSE p.price
        END AS asking_rent_monthly,
        -- Rent per sqm per month
        CASE 
          WHEN p.price_currency = 'USD' THEN (p.price * fx.usd_to_ghs) / NULLIF(COALESCE(p.built_area_sqm, p.total_area_sqm), 0)
          ELSE p.price / NULLIF(COALESCE(p.built_area_sqm, p.total_area_sqm), 0)
        END AS rent_per_sqm_monthly,
        -- Exchange rate used
        fx.usd_to_ghs AS fx_rate_used,
        p.amenities,
        p.data_source,
        p.created_at AS listing_date,
        -- Calculate distance using Haversine formula (in km)
        (
          6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians($1)) * cos(radians(p.latitude)) *
              cos(radians(p.longitude) - radians($2)) +
              sin(radians($1)) * sin(radians(p.latitude))
            ))
          )
        ) AS distance_km,
        -- Calculate rental similarity score (weighted for rental-specific factors)
        CASE 
          WHEN p.property_type::text = $3::text THEN 25 ELSE 10 
        END +
        -- Size similarity (more important for rentals)
        CASE 
          WHEN ABS(COALESCE(p.built_area_sqm, p.total_area_sqm, 0) - $4) / NULLIF($4, 0) <= 0.10 THEN 25
          WHEN ABS(COALESCE(p.built_area_sqm, p.total_area_sqm, 0) - $4) / NULLIF($4, 0) <= 0.20 THEN 18
          WHEN ABS(COALESCE(p.built_area_sqm, p.total_area_sqm, 0) - $4) / NULLIF($4, 0) <= 0.30 THEN 10
          ELSE 5
        END +
        -- Bedroom match (critical for rentals)
        CASE 
          WHEN p.bedrooms = $5 THEN 25
          WHEN ABS(COALESCE(p.bedrooms, 0) - $5) = 1 THEN 15
          ELSE 5
        END +
        -- Freshness (rentals change faster, recent data more valuable)
        CASE 
          WHEN p.created_at >= NOW() - INTERVAL '1 month' THEN 25
          WHEN p.created_at >= NOW() - INTERVAL '3 months' THEN 20
          WHEN p.created_at >= NOW() - INTERVAL '6 months' THEN 12
          ELSE 5
        END AS similarity_score,
        -- Collapse duplicate ingests of the same listing (same title + rent + location):
        -- keep only the most recent row per distinct listing.
        ROW_NUMBER() OVER (
          PARTITION BY p.title, p.price, round(p.latitude::numeric, 5), round(p.longitude::numeric, 5)
          ORDER BY p.created_at DESC NULLS LAST, p.id
        ) AS dup_rn
      FROM properties p
      CROSS JOIN fx_rate fx
      WHERE p.id != COALESCE($6::uuid, p.id)
        -- RENTAL ONLY filter
        AND p.transaction_type = 'rental'
        -- Exclude deleted properties (PM delete sets deleted_at)
        AND p.deleted_at IS NULL
        AND p.latitude IS NOT NULL
        AND p.longitude IS NOT NULL
        AND p.price IS NOT NULL
        AND p.price > 0
        -- Location filter: within radius
        AND (
          6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians($1)) * cos(radians(p.latitude)) *
              cos(radians(p.longitude) - radians($2)) +
              sin(radians($1)) * sin(radians(p.latitude))
            ))
          )
        ) <= $7
        -- Property type filter: same CATEGORY (RICS tiered — same sub-type preferred via the
        -- similarity score, other same-category sub-types admitted at lower weight). $14 = sub-type list.
        AND p.property_type::text = ANY($14::text[])
        -- Data hygiene (RICS evidence verification): drop obviously-erroneous rows
        AND (p.bedrooms IS NULL OR p.bedrooms BETWEEN 0 AND 15)
        AND (COALESCE(p.built_area_sqm, p.total_area_sqm) IS NULL OR COALESCE(p.built_area_sqm, p.total_area_sqm) BETWEEN 5 AND 10000)
        -- Size filter (±25% for rentals)
        AND (
          $8::numeric IS NULL OR 
          (p.built_area_sqm IS NULL AND p.total_area_sqm IS NULL) OR
          COALESCE(p.built_area_sqm, p.total_area_sqm) >= $8
        )
        AND (
          $9::numeric IS NULL OR 
          (p.built_area_sqm IS NULL AND p.total_area_sqm IS NULL) OR
          COALESCE(p.built_area_sqm, p.total_area_sqm) <= $9
        )
        -- Bedroom filter
        AND ($10::integer IS NULL OR p.bedrooms >= $10)
        AND ($11::integer IS NULL OR p.bedrooms <= $11)
        -- Recency filter (rentals = 6 months default)
        AND (p.created_at >= NOW() - ($12::text || ' months')::interval)
        -- Exclude already selected comparables
        AND p.id != ALL($13::uuid[])
    `;

    const params: any[] = [
      searchLat,                                                                    // $1
      searchLng,                                                                    // $2
      searchPropertyType,                                                           // $3
      subjectSize,                                                                  // $4
      subjectBedrooms,                                                              // $5
      subjectProperty.id,                                                           // $6 (exclude subject)
      radiusKm,                                                                     // $7
      searchSizeMin,                                                                // $8
      searchSizeMax,                                                                // $9
      searchBedroomsMin,                                                            // $10
      searchBedroomsMax,                                                            // $11
      maxAgeMonths,                                                                 // $12
      excludeIds.length > 0 ? excludeIds : ['00000000-0000-0000-0000-000000000000'], // $13
      searchCategoryTypes,                                                          // $14 same-category sub-types
    ];

    // Keep one row per distinct listing (dup_rn = 1), then order + limit.
    searchQuery = `
      SELECT * FROM (${searchQuery}) dq
      WHERE dq.dup_rn = 1
      ORDER BY dq.similarity_score DESC, dq.distance_km ASC
      LIMIT $${params.length + 1}
    `;
    params.push(limit);

    // params[6] is $7 (radiusKm); params is [...$1-$14, $15 limit].
    let radiusUsed = radiusKm;
    let result = await query(searchQuery, params);
    // RICS: comparables should be local, so widen ONLY as needed. If nothing is within the requested
    // radius, step out to a capped maximum; distance is disclosed and already down-weights similarity.
    const MAX_RADIUS_KM = 25;
    if (result.rows.length === 0) {
      for (const r of [radiusKm * 2, radiusKm * 3, MAX_RADIUS_KM]) {
        if (r <= radiusUsed || r > MAX_RADIUS_KM) continue;
        params[6] = r; // $7 radius
        result = await query(searchQuery, params);
        radiusUsed = r;
        if (result.rows.length > 0) break;
      }
    }

    // Flag each comparable's type comparability for adjustment/disclosure (RICS): exact sub-type vs
    // same-category. Same-category comps already score lower (10 vs 25) but the explicit flag lets the
    // UI/report disclose and apply a property-type adjustment.
    for (const row of result.rows as any[]) {
      row.type_match = String(row.property_type) === String(searchPropertyType) ? 'exact' : 'category';
    }

    // Calculate rental market statistics
    const comparablesFound = result.rows.length;
    const minRequired = 3; // Minimum for reliable rent estimation
    const hasGap = comparablesFound < minRequired;

    // Parse decimal strings to numbers for calculations
    const parseRent = (r: any) => parseFloat(r.asking_rent_monthly) || 0;
    const parseRentPerSqm = (r: any) => parseFloat(r.rent_per_sqm_monthly) || 0;

    const aggregates = comparablesFound > 0 ? {
      // Rental-specific metrics
      avgRentMonthly: Math.round(result.rows.reduce((sum: number, r: any) => sum + parseRent(r), 0) / comparablesFound),
      medianRentMonthly: (() => {
        const rents = result.rows.map((r: any) => parseRent(r)).sort((a: number, b: number) => a - b);
        const mid = Math.floor(rents.length / 2);
        return rents.length % 2 ? rents[mid] : Math.round((rents[mid - 1] + rents[mid]) / 2);
      })(),
      avgRentPerSqm: Math.round(
        result.rows.reduce((sum: number, r: any) => sum + parseRentPerSqm(r), 0) / comparablesFound * 100
      ) / 100,
      minRent: Math.min(...result.rows.map((r: any) => parseRent(r))),
      maxRent: Math.max(...result.rows.map((r: any) => parseRent(r))),
      minRentPerSqm: Math.round(Math.min(...result.rows.map((r: any) => parseRentPerSqm(r))) * 100) / 100,
      maxRentPerSqm: Math.round(Math.max(...result.rows.map((r: any) => parseRentPerSqm(r))) * 100) / 100,
      avgDistance: Math.round((result.rows.reduce((sum: number, r: any) => sum + (r.distance_km || 0), 0) / comparablesFound) * 10) / 10,
      avgSimilarity: Math.round(result.rows.reduce((sum: number, r: any) => sum + (r.similarity_score || 0), 0) / comparablesFound),
      // Suggested rent based on subject size (fallback to avg rent if no sqm data)
      suggestedRentForSubject: (() => {
        const avgRentPerSqm = result.rows.reduce((sum: number, r: any) => sum + parseRentPerSqm(r), 0) / comparablesFound;
        if (avgRentPerSqm > 0) {
          return Math.round(avgRentPerSqm * subjectSize);
        }
        // Fallback: use average rent if no sqm data available
        return Math.round(result.rows.reduce((sum: number, r: any) => sum + parseRent(r), 0) / comparablesFound);
      })(),
      suggestedRentPerSqm: Math.round(
        result.rows.reduce((sum: number, r: any) => sum + parseRentPerSqm(r), 0) / comparablesFound * 100
      ) / 100,
      confidence: Math.min(100, Math.round(
        (comparablesFound / 5) * 50 + // More comparables = higher confidence
        (result.rows.reduce((sum: number, r: any) => sum + (r.similarity_score || 0), 0) / comparablesFound / 100) * 50
      )),
    } : null;

    logger.info('Rental comparables search completed', {
      valuationId,
      comparablesFound,
      searchCriteria: { radiusKm, propertyType: searchPropertyType, maxAgeMonths },
    });

    res.json({
      success: true,
      data: result.rows,
      meta: {
        valuationId,
        searchCriteria: {
          latitude: searchLat,
          longitude: searchLng,
          radiusKm,
          propertyType: searchPropertyType,
          bedroomsRange: { min: searchBedroomsMin, max: searchBedroomsMax },
          sizeRange: { min: searchSizeMin, max: searchSizeMax },
          maxAgeMonths,
        },
        count: comparablesFound,
        hasGap,
        // RICS disclosure: how far we had to search, and how many comps are a different sub-type
        // (same category) and therefore need a property-type adjustment.
        radiusUsed,
        radiusWidened: radiusUsed > radiusKm,
        crossTypeCount: result.rows.filter((r: any) => r.type_match === 'category').length,
        aggregates,
        // Currency conversion info
        currencyConversion: {
          targetCurrency: 'GHS',
          fxRateUsed: result.rows[0]?.fx_rate_used ?? null,
          usdCount: result.rows.filter((r: any) => r.price_currency === 'USD').length,
          ghsCount: result.rows.filter((r: any) => r.price_currency === 'GHS').length,
        },
        // Rent estimation helper
        rentEstimation: aggregates ? {
          suggestedMonthlyRent: aggregates.suggestedRentForSubject,
          rentPerSqm: aggregates.suggestedRentPerSqm,
          confidence: aggregates.confidence,
          comparablesUsed: comparablesFound,
          methodology: 'weighted_average',
          note: `Based on ${comparablesFound} rental comparable${comparablesFound === 1 ? '' : 's'} within ${radiusKm}km`,
        } : null,
        gapAnalysis: hasGap ? {
          required: minRequired,
          found: comparablesFound,
          shortfall: minRequired - comparablesFound,
          message: `Found ${comparablesFound} rental comparable${comparablesFound === 1 ? '' : 's'}, need at least ${minRequired} for reliable rent estimation`,
        } : null,
      },
    });

  } catch (error: any) {
    logger.error('Failed to search rental comparables', {
      valuationId: req.params.id,
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to search for rental comparables',
      detail: error.message,
    });
  }
});

/**
 * POST /api/valuations/:id/rental-comparables/value
 * Single source of truth for market-rent estimation. Sources the adjustment factors from
 * valuation_adjustment_factors + the live USD/GHS rate, resolves comparable rents from the DB,
 * and runs the Python market-rent engine. The frontend only renders the result.
 */
router.post('/:id/rental-comparables/value', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const valuationId = req.params.id;

    const vRes = await query(
      `SELECT p.id, p.region, p.property_type, p.bedrooms, p.bathrooms, p.built_area_sqm, p.year_built
       FROM valuations v JOIN properties p ON v.property_id = p.id WHERE v.id = $1`,
      [valuationId]
    );
    if (vRes.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Valuation not found' });
    }
    const subject = vRes.rows[0];

    // Live FX — strict, no fallback.
    const fxRes = await query(
      `SELECT value FROM economic_indicators WHERE indicator_type='exchange_rate_usd' ORDER BY effective_date DESC LIMIT 1`
    );
    const usdToGhs = parseFloat(fxRes.rows[0]?.value);
    if (!usdToGhs || usdToGhs <= 0) {
      return res.status(503).json({ error: 'FX rate unavailable', message: 'No live USD/GHS rate. Valuation refused.' });
    }
    const toGhs = (price: number, cur?: string | null) =>
      (cur || 'GHS').toUpperCase() === 'USD' ? price * usdToGhs : price;

    // Adjustment factors from config — prefer region/type-specific, else global. No hardcoded factors.
    const facRes = await query(
      `SELECT adjustment_factor, base_adjustment_percent, min_value, max_value, unit,
              (region IS NOT NULL)::int + (property_type IS NOT NULL)::int AS specificity
       FROM valuation_adjustment_factors
       WHERE adjustment_category = 'rental_market' AND is_active = TRUE
         AND (effective_date IS NULL OR effective_date <= CURRENT_DATE)
         AND (expiry_date IS NULL OR expiry_date >= CURRENT_DATE)
         AND (region IS NULL OR region = $1)
         AND (property_type IS NULL OR property_type::text = $2::text)
       ORDER BY specificity DESC`,
      [subject.region, subject.property_type]
    );
    const adjustment_factors: Record<string, any> = {};
    for (const r of facRes.rows) {
      if (!adjustment_factors[r.adjustment_factor]) {
        adjustment_factors[r.adjustment_factor] = {
          base_adjustment_percent: parseFloat(r.base_adjustment_percent) || 0,
          min_value: r.min_value != null ? parseFloat(r.min_value) : null,
          max_value: r.max_value != null ? parseFloat(r.max_value) : null,
          unit: r.unit,
        };
      }
    }
    if (Object.keys(adjustment_factors).length === 0) {
      return res.status(503).json({
        error: 'No adjustment factors configured',
        message: 'valuation_adjustment_factors has no active rental_market rows (run migration 251).',
      });
    }

    // Resolve comparable rents from the DB by id (never trust frontend prices); convert to GHS once.
    const bodyComps = Array.isArray(req.body.comparables) ? req.body.comparables : [];
    const ids = bodyComps.map((c: any) => c.id).filter(Boolean);
    const propRows = ids.length ? (await query(
      `SELECT id, price, price_currency, built_area_sqm, bedrooms, bathrooms, year_built, created_at
       FROM properties WHERE id = ANY($1)`, [ids]
    )).rows : [];
    const byId = new Map(propRows.map((r: any) => [String(r.id), r]));
    const comparables = bodyComps.map((c: any) => {
      const p: any = byId.get(String(c.id));
      const nativeRent = p ? parseFloat(p.price) : parseFloat(c.monthly_rent_ghs ?? c.asking_rent_monthly ?? c.price);
      const nativeCur = p ? p.price_currency : c.price_currency;
      return {
        id: String(c.id),
        monthly_rent_ghs: toGhs(nativeRent || 0, nativeCur),
        bedrooms: p?.bedrooms ?? c.bedrooms,
        bathrooms: p?.bathrooms ?? c.bathrooms,
        gfa_sqm: p?.built_area_sqm ?? c.gfa_sqm,
        year_built: p?.year_built ?? c.year_built,
        furnishing: c.furnishing,                 // not a DB column; only if the UI supplies it
        transaction_date: p?.created_at ?? c.transaction_date,
        weight: parseFloat(c.weight) || 1.0,
      };
    });

    const pythonBase = process.env.PYTHON_VALUATION_URL || 'http://localhost:8001';
    const pyRes = await fetch(`${pythonBase}/api/v1/methods/market-rent`, {
      method: 'POST',
      headers: engineHeaders(),
      body: JSON.stringify({
        subject: {
          bedrooms: subject.bedrooms,
          bathrooms: subject.bathrooms,
          building_size_sqm: subject.built_area_sqm,
          year_built: subject.year_built,
          furnishing: req.body.subject_furnishing,
        },
        comparables,
        adjustment_factors,
      }),
    });
    if (!pyRes.ok) {
      const txt = await pyRes.text();
      logger.error('Market-rent engine failed', { status: pyRes.status, error: txt });
      return res.status(502).json({
        error: 'Engine error',
        message: 'Market-rent engine failed',
        details: process.env.NODE_ENV === 'development' ? txt : undefined,
      });
    }
    const data = await pyRes.json();
    return res.json({
      success: true,
      data,
      meta: { engine: 'python', method: 'market_rent', usd_to_ghs: usdToGhs, factors_used: Object.keys(adjustment_factors) },
    });
  } catch (error: any) {
    logger.error('rental-comparables/value failed', { error: error.message, stack: error.stack });
    return res.status(500).json({ error: 'Internal error', message: error.message });
  }
});

/**
 * POST /api/valuations/:id/drc/value
 * Single source of truth for the Depreciated Replacement Cost (DRC) method. Sources the
 * replacement cost/sqm, MEA factor and economic (useful) life from specialized_construction_costs
 * (Data Hub), the land value from the system-wide Land Value reconciliation, and the building
 * attributes from the property — then runs the Python DRC engine. NO hardcoded fallbacks: any
 * input not resolvable from the DB must be supplied explicitly by the valuer, otherwise the
 * calculation strict-fails with a clear list of what's missing. The frontend only renders the result.
 */
router.post('/:id/drc/value', validateUUID('id'), async (req: Request, res: Response) => {
  const num = (v: any): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  try {
    const valuationId = req.params.id;
    const b = req.body || {};

    const buildingFunction = String(b.building_function || '').trim();
    const qualityLevel = String(b.quality_level || '').trim();
    if (!buildingFunction || !qualityLevel) {
      return res.status(400).json({ error: 'Bad Request', message: 'building_function and quality_level are required.' });
    }

    // Subject property
    const vRes = await query(
      `SELECT p.id, p.region, p.built_area_sqm, p.land_area_sqm, p.year_built, p.condition,
              p.floors, p.metadata, p.address_city, p.address_street
       FROM valuations v JOIN properties p ON v.property_id = p.id WHERE v.id = $1`,
      [valuationId]
    );
    if (vRes.rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Valuation not found' });
    const prop = vRes.rows[0];
    const region = prop.region || 'greater_accra';

    // DRC parameters from the Data Hub config table. Prefer the property's own region; otherwise the
    // greater_accra published reference rate (surfaced in meta.cost_region so it is never silent).
    const costRes = await query(
      `SELECT base_cost_sqm, useful_life_years, mea_factor, mea_feature_range, region
         FROM specialized_construction_costs
        WHERE building_function::text = $1 AND quality_level::text = $2
          AND region::text IN ($3, 'greater_accra')
        ORDER BY (region::text = $3) DESC
        LIMIT 1`,
      [buildingFunction, qualityLevel, region]
    );
    const costRow = costRes.rows[0];

    // Each input: explicit valuer override > DB config / property. Strict-fail if neither.
    const replacementCostPerSqm = num(b.replacement_cost_per_sqm) ?? num(costRow?.base_cost_sqm);
    // MEA: the DB value is the per-class BASELINE (anchor). Features modulate it within the range;
    // the valuer may instead post an explicit final MEA (mea_factor_override).
    const meaBaseline = num(b.mea_factor) ?? num(costRow?.mea_factor);
    const meaFeatureRange = num(b.mea_feature_range) ?? num(costRow?.mea_feature_range) ?? 0;
    const meaOverride = num(b.mea_factor_override);
    const usefulLife = num(b.useful_life_years) ?? num(costRow?.useful_life_years);
    const gfa = num(b.gfa_sqm) ?? num(prop.built_area_sqm);
    const yearBuilt = num(b.year_built) ?? num(prop.year_built);
    const condition = String(b.condition || prop.condition || '').trim();

    // Feature set for the feature-driven MEA (RICS Model A). Pulled from the property + metadata;
    // missing items are simply absent and the engine scores them neutral (never a silent skew).
    const md: any = prop.metadata || {};
    const floors = num(b.floors) ?? num(prop.floors) ?? num(md.total_floors) ?? num(md.floors);
    const features = {
      age_years: yearBuilt ? new Date().getFullYear() - yearBuilt : null,
      quality_rating: b.quality_rating || md.quality_rating || qualityLevel,
      floors: floors ?? null,
      services: {
        generator: !!md.has_generator,
        security: !!md.has_security,
        water: !!md.has_borehole,
        drainage: !!md.drainage_sanitation,
        elevator: !!md.has_elevator,
        solar: !!md.has_solar,
        ac: !!(md.has_ac ?? md.has_air_conditioning),
      },
    };

    // Land value — explicit override > system-wide Land Value reconciliation.
    let landValue = num(b.land_value);
    let landSource = 'user_entered';
    if (landValue == null || landValue <= 0) {
      const lvRes = await query(
        `SELECT calculated_value FROM valuation_method_inputs WHERE valuation_id = $1 AND method_type = 'land_value'`,
        [valuationId]
      );
      landValue = num(lvRes.rows[0]?.calculated_value);
      landSource = 'land_value_system';
    }

    const missing: string[] = [];
    if (!replacementCostPerSqm || replacementCostPerSqm <= 0) missing.push(`replacement cost/sqm (no published rate for ${buildingFunction}/${qualityLevel} and none supplied)`);
    if (!meaBaseline || meaBaseline <= 0) missing.push('MEA baseline factor');
    if (!usefulLife || usefulLife <= 0) missing.push('economic (useful) life');
    if (!gfa || gfa <= 0) missing.push('GFA (gross floor area)');
    if (!yearBuilt || yearBuilt <= 0) missing.push('year built');
    if (!condition) missing.push('building condition');
    if (landValue == null || landValue <= 0) missing.push('land value (no Land Value reconciliation on file and none supplied)');
    if (missing.length) {
      return res.status(422).json({
        error: 'Missing required DRC inputs',
        message: `Cannot run DRC — resolve or supply: ${missing.join('; ')}.`,
        missing,
      });
    }

    const pythonBase = process.env.PYTHON_VALUATION_URL || 'http://localhost:8001';
    const pyRes = await fetch(`${pythonBase}/api/v1/methods/drc`, {
      method: 'POST',
      headers: engineHeaders(),
      body: JSON.stringify({
        property: {
          id: prop.id,
          property_type: buildingFunction,
          region,
          building_size_sqm: gfa,
          land_area_sqm: num(prop.land_area_sqm),
          year_built: yearBuilt,
          condition,
          address_city: prop.address_city,
          address_street: prop.address_street,
        },
        options: {
          replacement_cost_per_sqm: replacementCostPerSqm,
          mea_factor: meaBaseline,                 // per-class baseline (anchor)
          mea_feature_range: meaFeatureRange,      // bounded feature modulation
          mea_factor_override: meaOverride ?? undefined,
          features,
          useful_life: usefulLife,
          land_value: landValue,
          depreciation_overrides: b.depreciation_overrides || {},
        },
      }),
    });
    if (!pyRes.ok) {
      const txt = await pyRes.text();
      logger.error('DRC engine failed', { status: pyRes.status, error: txt });
      return res.status(502).json({ error: 'Engine error', message: 'DRC engine failed', details: process.env.NODE_ENV === 'development' ? txt : undefined });
    }
    const data = await pyRes.json();
    return res.json({
      success: true,
      data,
      meta: {
        engine: 'python',
        method: 'drc_method',
        sources: {
          replacement_cost_per_sqm: num(b.replacement_cost_per_sqm) != null ? 'user' : 'data_hub',
          mea_factor: meaOverride != null ? 'valuer_override' : 'feature_model',
          useful_life: num(b.useful_life_years) != null ? 'user' : 'data_hub',
          gfa: num(b.gfa_sqm) != null ? 'user' : 'property',
          land_value: landSource,
          cost_region: costRow?.region || null,
        },
      },
    });
  } catch (error: any) {
    logger.error('drc/value failed', { error: error.message, stack: error.stack });
    return res.status(500).json({ error: 'Internal error', message: error.message });
  }
});

/**
 * POST /api/valuations/:id/profits/value
 * Single source of truth for the Profits (trade-related) method. Sources the per-type trading
 * benchmarks (revenue/unit, operating cost ratios, operator's remuneration %, trading cap rate)
 * from trading_property_benchmarks (Data Hub), applies any valuer overrides / actual turnover,
 * and runs the Python profits engine. NO hardcoded fallbacks — anything unresolved strict-fails
 * with a clear list. The frontend renders the result only.
 */
router.post('/:id/profits/value', validateUUID('id'), async (req: Request, res: Response) => {
  const num = (v: any): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  try {
    const valuationId = req.params.id;
    const b = req.body || {};
    const tradingType = String(b.trading_property_type || b.property_type || '').trim();
    if (!tradingType) {
      return res.status(400).json({ error: 'Bad Request', message: 'trading_property_type is required.' });
    }

    const vRes = await query(
      `SELECT p.id, p.region, p.building_size_sqm, p.built_area_sqm
       FROM valuations v JOIN properties p ON v.property_id = p.id WHERE v.id = $1`,
      [valuationId]
    );
    if (vRes.rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Valuation not found' });
    const prop = vRes.rows[0];
    const region = prop.region || 'greater_accra';

    // Trading benchmarks from the Data Hub config. Prefer the property's region; else greater_accra.
    const bmRes = await query(
      `SELECT unit_metric, revenue_per_unit, occupancy_default_pct, operating_cost_ratios,
              operator_remuneration_pct, typical_cap_rate, cap_rate_low, cap_rate_high,
              operator_capital_pct, return_on_operator_capital_pct, region
         FROM trading_property_benchmarks
        WHERE property_type = $1 AND region IN ($2, 'greater_accra')
        ORDER BY (region = $2) DESC
        LIMIT 1`,
      [tradingType, region]
    );
    const bm = bmRes.rows[0];

    // Resolve each input: explicit valuer override > DB benchmark.
    const grossActual = num(b.gross_annual_revenue);
    const haveActual = grossActual != null && grossActual > 0;
    const unitCount = num(b.unit_count);
    const revenuePerUnit = num(b.revenue_per_unit) ?? num(bm?.revenue_per_unit);
    const occupancyRate = num(b.occupancy_rate) ?? num(bm?.occupancy_default_pct);
    const ratiosOverride = b.operating_cost_ratios && typeof b.operating_cost_ratios === 'object'
      && Object.keys(b.operating_cost_ratios).length > 0;
    const operatingCostRatios = ratiosOverride ? b.operating_cost_ratios : bm?.operating_cost_ratios;
    const operatorRemPct = num(b.operator_remuneration_pct) ?? num(bm?.operator_remuneration_pct);

    // Cap rate resolution (priority): 1) valuer override, 2) the trading type's OWN yield from the
    // analytics cap-rate authority (capRateService.resolveCapRate → reads trading_property_benchmarks
    // directly; NO commercial-office proxy). Provenance is surfaced so a seeded yield is never
    // presented as hard market evidence.
    let capRate = num(b.cap_rate);
    let capLow: number | null = null;
    let capHigh: number | null = null;
    let capRateSource = 'valuer_override';
    let capRateMeta: any = null;
    if (capRate == null || capRate <= 0) {
      try {
        const mk = await capRateService.resolveCapRate(region, tradingType);
        if (mk && mk.benchmarkCapRate > 0) {
          capRate = mk.benchmarkCapRate;
          capLow = mk.capRateRangeLow;
          capHigh = mk.capRateRangeHigh;
          // sampleSize > 0 ⇒ real transaction evidence; trading seeds carry sampleSize 0.
          capRateSource = mk.sampleSize > 0 ? 'market_analytics' : 'indicative_benchmark';
          capRateMeta = {
            property_type: tradingType,
            sample_size: mk.sampleSize,
            confidence: mk.confidenceScore,
            data_quality: mk.dataQuality,
            note: mk.sampleSize > 0
              ? `Trading yield for ${tradingType} derived from market analytics.`
              : `Indicative ${tradingType} yield — valuer to confirm as market evidence accrues.`,
          };
        }
      } catch (e: any) {
        logger.debug('CapRateService.resolveCapRate failed for profits; falling back to seed', { error: e?.message });
      }
      // Last resort: the trading benchmark row already fetched above.
      if (capRate == null || capRate <= 0) {
        capRate = num(bm?.typical_cap_rate);
        capLow = num(bm?.cap_rate_low);
        capHigh = num(bm?.cap_rate_high);
        capRateSource = 'indicative_benchmark';
        capRateMeta = { note: 'Indicative trading yield — no market evidence available; valuer to confirm.' };
      }
    } else {
      capLow = num(bm?.cap_rate_low);
      capHigh = num(bm?.cap_rate_high);
    }

    const missing: string[] = [];
    if (!operatingCostRatios || Object.keys(operatingCostRatios).length === 0) missing.push(`operating cost ratios (no benchmark for ${tradingType} and none supplied)`);
    if (operatorRemPct == null || operatorRemPct <= 0) missing.push("operator's remuneration %");
    if (capRate == null || capRate <= 0) missing.push('capitalisation rate');
    if (!haveActual) {
      if (unitCount == null || unitCount <= 0) missing.push('unit count (or supply actual turnover)');
      if (revenuePerUnit == null || revenuePerUnit <= 0) missing.push('revenue per unit');
      if (occupancyRate == null) missing.push('occupancy rate');
    }
    if (missing.length) {
      return res.status(422).json({
        error: 'Missing required Profits inputs',
        message: `Cannot run the profits method — resolve or supply: ${missing.join('; ')}.`,
        missing,
      });
    }

    const pythonBase = process.env.PYTHON_VALUATION_URL || 'http://localhost:8001';
    const pyRes = await fetch(`${pythonBase}/api/v1/methods/profits`, {
      method: 'POST',
      headers: engineHeaders(),
      body: JSON.stringify({
        property: {
          id: prop.id,
          property_type: tradingType,
          region,
          building_size_sqm: num(prop.building_size_sqm) ?? num(prop.built_area_sqm),
        },
        options: {
          gross_annual_revenue: haveActual ? grossActual : undefined,
          unit_count: unitCount ?? undefined,
          revenue_per_unit: revenuePerUnit ?? undefined,
          occupancy_rate: occupancyRate ?? undefined,
          operating_cost_ratios: operatingCostRatios,
          ratios_source: ratiosOverride ? 'user' : 'config',
          operator_remuneration_pct: operatorRemPct,
          // Institutional divisible balance: return on the operator's capital (FF&E + stock).
          operator_capital_pct: num(b.operator_capital_pct) ?? num(bm?.operator_capital_pct) ?? undefined,
          return_on_operator_capital_pct: num(b.return_on_operator_capital_pct) ?? num(bm?.return_on_operator_capital_pct) ?? undefined,
          cap_rate: capRate,
          cap_rate_source: capRateSource === 'valuer_override' ? 'user' : 'config',
          cap_rate_low: capLow ?? undefined,
          cap_rate_high: capHigh ?? undefined,
        },
      }),
    });
    if (!pyRes.ok) {
      const txt = await pyRes.text();
      logger.error('Profits engine failed', { status: pyRes.status, error: txt });
      return res.status(502).json({ error: 'Engine error', message: 'Profits engine failed', details: process.env.NODE_ENV === 'development' ? txt : undefined });
    }
    const data = await pyRes.json();
    return res.json({
      success: true,
      data,
      meta: {
        engine: 'python',
        method: 'profits_method',
        unit_metric: bm?.unit_metric || null,
        benchmark_region: bm?.region || null,
        cap_rate_provenance: { source: capRateSource, ...(capRateMeta || {}) },
        sources: {
          revenue: haveActual ? 'actual_turnover' : (num(b.revenue_per_unit) != null ? 'user' : 'benchmark'),
          operating_cost_ratios: ratiosOverride ? 'user' : 'benchmark',
          operator_remuneration_pct: num(b.operator_remuneration_pct) != null ? 'user' : 'benchmark',
          cap_rate: capRateSource,
        },
      },
    });
  } catch (error: any) {
    logger.error('profits/value failed', { error: error.message, stack: error.stack });
    return res.status(500).json({ error: 'Internal error', message: error.message });
  }
});

/**
 * POST /api/valuations/:id/residual/value
 * Single source of truth for the Residual (development land) method. Sources the sale price/sqm
 * (market comparables), construction cost/sqm (base_costs_per_sqm — live, scrape-computed), development finance rate
 * (economic_indicators — live), and the development assumptions (residual_development_assumptions)
 * from the Data Hub, applies any valuer overrides, and runs the full Python residual engine.
 * NO hardcoded fallbacks — anything unresolved strict-fails with a clear list. Frontend renders only.
 */
router.post('/:id/residual/value', validateUUID('id'), async (req: Request, res: Response) => {
  const num = (v: any): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  // dev type → property_type for the two evidence sources
  const DEV_TO_SALE_TYPE: Record<string, string> = {
    house: 'residential_house', townhouse: 'residential_house', apartment: 'apartment_flat',
    commercial: 'commercial_shop', office: 'commercial_shop', industrial: 'commercial_shop', warehouse: 'commercial_shop',
  };
  const DEV_TO_COST_TYPE: Record<string, string> = {
    house: 'residential', townhouse: 'residential', apartment: 'residential',
    commercial: 'commercial', office: 'commercial', industrial: 'industrial', warehouse: 'industrial',
  };
  try {
    const valuationId = req.params.id;
    const b = req.body || {};

    const vRes = await query(
      `SELECT p.id, p.region, p.land_area_sqm, p.built_area_sqm, p.floors, p.property_type, p.property_sub_type
       FROM valuations v JOIN properties p ON v.property_id = p.id WHERE v.id = $1`,
      [valuationId]
    );
    if (vRes.rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Valuation not found' });
    const prop = vRes.rows[0];
    const region = prop.region || 'greater_accra';

    // Development type: explicit body, else inferred from the property type.
    let devType = String(b.development_type || '').trim();
    if (!devType) {
      const pt = `${prop.property_type || ''} ${prop.property_sub_type || ''}`.toLowerCase();
      devType = pt.includes('commercial') ? 'commercial' : pt.includes('office') ? 'office'
        : pt.includes('industrial') ? 'industrial' : pt.includes('warehouse') ? 'warehouse'
        : (pt.includes('apartment') || pt.includes('flat')) ? 'apartment'
        : pt.includes('townhouse') ? 'townhouse' : 'house';
    }

    // Development assumptions from config (region-aware).
    const aRes = await query(
      `SELECT * FROM residual_development_assumptions
        WHERE development_type = $1 AND region IN ($2, 'greater_accra')
        ORDER BY (region = $2) DESC LIMIT 1`,
      [devType, region]
    );
    const a = aRes.rows[0];

    // Sale price/sqm from market comparables (evidence); construction cost from base costs.
    let salePriceEvidence: any = null;
    let basePrice: number | null = null;
    let baseCost: number | null = null;
    try {
      const comps = await constructionCostService.getComparablePricePerSqm(region, DEV_TO_SALE_TYPE[devType]);
      const match = comps.find((c: any) => c.property_type === DEV_TO_SALE_TYPE[devType]) || comps[0];
      if (match) { basePrice = num(match.median_price_sqm); salePriceEvidence = { count: match.comparable_count, p25: match.p25_price_sqm, p75: match.p75_price_sqm, median: match.median_price_sqm }; }
    } catch (e: any) { logger.debug('residual sale-price lookup failed', { error: e?.message }); }
    try {
      const costs = await constructionCostService.getBaseCosts(DEV_TO_COST_TYPE[devType], region);
      const std = costs.find((c: any) => c.quality_tier === 'standard') || costs[0];
      if (std) baseCost = num(std.base_cost_per_sqm);
    } catch (e: any) { logger.debug('residual base-cost lookup failed', { error: e?.message }); }

    // Live development finance rate (most recent of lending/prime/policy), unless overridden.
    let financeRate = num(b.finance_rate);
    if (financeRate == null || financeRate <= 0) {
      const fr = await query(
        `SELECT value::float AS value FROM economic_indicators
          WHERE indicator_type::text = ANY($1)
          ORDER BY effective_date DESC, array_position($1, indicator_type::text) LIMIT 1`,
        [['lending_rate', 'interest_rate_prime', 'interest_rate_policy']]
      );
      financeRate = num(fr.rows[0]?.value);
    }

    // Resolve every input: valuer override > evidence/config. Floors/coverage from property when known.
    const plotSize = num(b.plot_size) ?? num(prop.land_area_sqm);
    const floors = num(b.floors) ?? num(prop.floors) ?? 1;
    const builtArea = num(prop.built_area_sqm);
    let plotCoverage = num(b.plot_coverage);
    if (plotCoverage == null && plotSize && builtArea && floors && plotSize * floors > 0) {
      const c = builtArea / (plotSize * floors);
      if (c > 0 && c <= 1) plotCoverage = c;
    }
    if (plotCoverage == null) plotCoverage = num(a?.plot_coverage_default);

    const salePricePerSqm = num(b.sale_price_per_sqm) ?? basePrice;
    const constructionCostPerSqm = num(b.construction_cost_per_sqm) ?? baseCost;
    const efficiency = num(b.efficiency) ?? num(a?.efficiency_pct);

    const missing: string[] = [];
    if (!a) missing.push(`development assumptions (no config for ${devType})`);
    if (plotSize == null || plotSize <= 0) missing.push('plot size (land area)');
    if (salePricePerSqm == null || salePricePerSqm <= 0) missing.push('sale price/sqm (no comparables for this type/region and none supplied)');
    if (constructionCostPerSqm == null || constructionCostPerSqm <= 0) missing.push('construction cost/sqm (no base cost for this type/region and none supplied)');
    if (financeRate == null || financeRate <= 0) missing.push('development finance rate (no economic indicator and none supplied)');
    if (missing.length) {
      return res.status(422).json({ error: 'Missing required residual inputs', message: `Cannot run the residual method — resolve or supply: ${missing.join('; ')}.`, missing });
    }

    const pythonBase = process.env.PYTHON_VALUATION_URL || 'http://localhost:8001';
    const pyRes = await fetch(`${pythonBase}/api/v1/methods/residual`, {
      method: 'POST',
      headers: engineHeaders(),
      body: JSON.stringify({
        property: { id: prop.id, property_type: devType, region, land_area_sqm: plotSize },
        options: {
          plot_coverage: plotCoverage,
          floors,
          efficiency,
          sale_price_per_sqm: salePricePerSqm,
          construction_cost_per_sqm: constructionCostPerSqm,
          cost_basis: b.cost_basis || 'gross',
          professional_fees_pct: num(b.professional_fees_pct) ?? num(a.professional_fees_pct),
          contingency_pct: num(b.contingency_pct) ?? num(a.contingency_pct),
          marketing_pct: num(b.marketing_pct) ?? num(a.marketing_pct),
          sales_commission_pct: num(b.sales_commission_pct) ?? num(a.sales_commission_pct),
          legal_fees_pct: num(b.legal_fees_pct) ?? num(a.legal_fees_pct),
          finance_rate: financeRate,
          finance_ltv_pct: num(b.finance_ltv_pct) ?? num(a.finance_ltv_pct),
          finance_avg_balance_factor: num(b.finance_avg_balance_factor) ?? num(a.finance_avg_balance_factor),
          construction_months: num(b.construction_months) ?? num(a.construction_months),
          developer_profit_pct: num(b.developer_profit_pct) ?? num(a.developer_profit_pct),
          min_profit_pct: num(a.min_profit_pct),
        },
      }),
    });
    if (!pyRes.ok) {
      const txt = await pyRes.text();
      logger.error('Residual engine failed', { status: pyRes.status, error: txt });
      return res.status(502).json({ error: 'Engine error', message: 'Residual engine failed', details: process.env.NODE_ENV === 'development' ? txt : undefined });
    }
    const data = await pyRes.json();
    return res.json({
      success: true,
      data,
      meta: {
        engine: 'python',
        method: 'residual_method',
        development_type: devType,
        sale_price_evidence: salePriceEvidence,
        sources: {
          sale_price_per_sqm: num(b.sale_price_per_sqm) != null ? 'user' : 'comparables',
          construction_cost_per_sqm: num(b.construction_cost_per_sqm) != null ? 'user' : 'base_costs',
          finance_rate: num(b.finance_rate) != null ? 'user' : 'economic_indicators',
          assumptions: 'config',
        },
      },
    });
  } catch (error: any) {
    logger.error('residual/value failed', { error: error.message, stack: error.stack });
    return res.status(500).json({ error: 'Internal error', message: error.message });
  }
});

/**
 * POST /api/valuations/:id/sensitivity
 * Real, method-specific sensitivity analysis (RICS VPS 3). For the selected driver, it RE-RUNS the
 * actual Python method engine (via that method's /value route, which sources Data Hub inputs and
 * accepts overrides) at ±range around the base input, returning the true engine value at each point.
 * NO weight×% approximation — every point is an actual engine re-run with the driver perturbed.
 * The frontend re-weights these into the reconciled value using the weights it already holds.
 * Body: { driver, range_pct=10, points=5 }
 */
router.post('/:id/sensitivity', validateUUID('id'), async (req: Request, res: Response) => {
  // driver → which method engine to re-run, which input to perturb, and where to read its base value.
  const SENS_DRIVERS: Record<string, { method: string; endpoint: string; overrideKey: string; detailKey: string; label: string }> = {
    // Profits (trade-related)
    profits_cap_rate:       { method: 'profits_method',  endpoint: 'profits',  overrideKey: 'cap_rate',                   detailKey: 'cap_rate',                   label: 'Capitalisation Rate' },
    profits_revenue:        { method: 'profits_method',  endpoint: 'profits',  overrideKey: 'revenue_per_unit',           detailKey: 'revenue_per_unit',           label: 'Revenue per Unit' },
    profits_operator_share: { method: 'profits_method',  endpoint: 'profits',  overrideKey: 'operator_remuneration_pct',  detailKey: 'operator_remuneration_pct',  label: "Operator's Remuneration" },
    // Residual (development land)
    residual_gdv:           { method: 'residual_method', endpoint: 'residual', overrideKey: 'sale_price_per_sqm',         detailKey: 'sale_price_per_sqm',         label: 'GDV (Sale Price/sqm)' },
    residual_build_cost:    { method: 'residual_method', endpoint: 'residual', overrideKey: 'construction_cost_per_sqm',  detailKey: 'construction_cost_per_sqm',  label: 'Construction Cost/sqm' },
    residual_finance:       { method: 'residual_method', endpoint: 'residual', overrideKey: 'finance_rate',              detailKey: 'finance_rate',               label: 'Finance Rate' },
    // DRC (specialised)
    drc_replacement_cost:   { method: 'drc_method',      endpoint: 'drc',      overrideKey: 'replacement_cost_per_sqm',   detailKey: 'replacement_cost_per_sqm',   label: 'Replacement Cost/sqm' },
    drc_land_value:         { method: 'drc_method',      endpoint: 'drc',      overrideKey: 'land_value',                 detailKey: 'land_value',                 label: 'Land Value' },
  };
  // Methods WITHOUT a /value route (cost/income/sales): re-run the Python engine from the inputs the
  // engine echoed into the saved method_results.details, perturbing one driver. (Income is computed
  // from its echoed NOI/cap — exact for the cap-rate driver — since its engine recomputes NOI from
  // opex components not all echoed.)
  const RECON: Record<string, { method: string; pyEndpoint?: string; detailKey: string; kind: 'cost' | 'sales' | 'income'; overrideKey?: string; label: string }> = {
    construction_cost:     { method: 'cost_approach',     pyEndpoint: 'cost-approach',   kind: 'cost',  overrideKey: 'construction_cost_per_sqm', detailKey: 'cost_per_sqm',            label: 'Construction Cost/sqm' },
    land_value:            { method: 'cost_approach',     pyEndpoint: 'cost-approach',   kind: 'cost',  overrideKey: 'land_value_per_sqm',        detailKey: 'land_value_per_sqm',      label: 'Land Value/sqm' },
    depreciation:          { method: 'cost_approach',     pyEndpoint: 'cost-approach',   kind: 'cost',  overrideKey: 'physical_dep',              detailKey: 'physical_depreciation_pct', label: 'Depreciation' },
    price_per_sqm:         { method: 'sales_comparison',  pyEndpoint: 'sales-comparison', kind: 'sales', overrideKey: 'indicated_value',          detailKey: 'indicated_value',         label: 'Price per SQM' },
    comparable_adjustments:{ method: 'sales_comparison',  pyEndpoint: 'sales-comparison', kind: 'sales', overrideKey: 'total_multiplier',         detailKey: 'indicated_value',         label: 'Comparable Adjustments' },
    rental_rate:           { method: 'income_approach',   kind: 'income', detailKey: 'rental_rate',  label: 'Rental Rate' },
    cap_rate:              { method: 'income_approach',   kind: 'income', detailKey: 'cap_rate',     label: 'Capitalisation Rate' },
    vacancy_rate:          { method: 'income_approach',   kind: 'income', detailKey: 'vacancy_rate', label: 'Vacancy Rate' },
  };

  try {
    const valuationId = req.params.id;
    const b = req.body || {};
    const driver = String(b.driver || '').trim();
    const map = SENS_DRIVERS[driver];
    const recon = RECON[driver];
    if (!map && !recon) {
      return res.status(400).json({ error: 'Bad Request', message: `Unknown or unsupported sensitivity driver '${driver}'.`, supported: [...Object.keys(SENS_DRIVERS), ...Object.keys(RECON)] });
    }

    // ── Reconstruction path (cost / income / sales) ──────────────────────────
    if (recon) {
      const rangePctR = Number(b.range_pct) > 0 ? Number(b.range_pct) : 10;
      const pctsR = [-rangePctR, -rangePctR / 2, 0, rangePctR / 2, rangePctR];
      const vr = await query(
        `SELECT v.method_results, p.id AS property_id, p.property_type, p.building_size_sqm, p.built_area_sqm, p.land_area_sqm, p.year_built, p.condition, p.region
           FROM valuations v JOIN properties p ON v.property_id = p.id WHERE v.id = $1`,
        [valuationId]
      );
      if (vr.rows.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Valuation not found' });
      const prop = vr.rows[0];
      const mr = (prop.method_results || {})[recon.method];
      const d: any = mr?.details || {};
      const baseValueR = Number(mr?.value);
      let baseInputR = Number(d[recon.detailKey]);
      // Sales comparison persists only its headline value (no per-comp detail grid). Since the
      // method value scales linearly with the price/sqm (and with the adjustment multiplier), the
      // saved value IS a valid base input for those drivers.
      if (recon.kind === 'sales' && (!Number.isFinite(baseInputR) || baseInputR === 0)) baseInputR = baseValueR;
      if (!Number.isFinite(baseValueR) || !Number.isFinite(baseInputR) || baseInputR === 0) {
        return res.status(422).json({ error: 'Sensitivity unavailable', message: `No saved ${recon.method} result/input for '${driver}' — run that method first.` });
      }
      const pyBase = process.env.PYTHON_VALUATION_URL || 'http://localhost:8001';
      const callPy = async (endpoint: string, property: any, options: any): Promise<number | null> => {
        try {
          const r = await fetch(`${pyBase}/api/v1/methods/${endpoint}`, { method: 'POST', headers: engineHeaders(), body: JSON.stringify({ property, options }) });
          if (!r.ok) return null;
          const j: any = await r.json();
          return Number(j?.estimated_value);
        } catch { return null; }
      };

      const points = await Promise.all(pctsR.map(async (pct) => {
        const factor = 1 + pct / 100;
        if (pct === 0) return { pct, method_value: baseValueR };
        let mv: number | null = null;

        if (recon.kind === 'cost') {
          const property = { id: prop.property_id, property_type: prop.property_type, building_size_sqm: d.building_size_sqm, land_area_sqm: d.land_area_sqm, year_built: prop.year_built, condition: prop.condition, region: prop.region };
          const opts: any = {
            construction_cost_per_sqm: d.cost_per_sqm,
            land_value_per_sqm: d.land_value_per_sqm,
            soft_costs_percent: d.soft_costs_pct,
            siteworks: d.siteworks,
            entrepreneurial_profit_percent: d.entrepreneurial_profit_pct,
            depreciation_overrides: { physical: d.physical_depreciation_pct, functional: d.functional_obsolescence_pct, external: d.external_obsolescence_pct },
          };
          if (recon.overrideKey === 'construction_cost_per_sqm') opts.construction_cost_per_sqm = baseInputR * factor;
          else if (recon.overrideKey === 'land_value_per_sqm') opts.land_value_per_sqm = baseInputR * factor;
          else if (recon.overrideKey === 'physical_dep') opts.depreciation_overrides.physical = baseInputR * factor;
          mv = await callPy('cost-approach', property, opts);
        } else if (recon.kind === 'sales') {
          // Sales comparison value scales linearly with the indicated value and the comparable
          // adjustment multiplier (mv = indicated × total_multiplier). Compute inline — exact, and
          // avoids a redundant engine round-trip. (The legacy passthrough endpoint was removed.)
          const adj = { ...(d.adjustments || {}) };
          let indicated = Number(d.indicated_value) || baseValueR;                                // fall back to the saved headline value
          if (recon.overrideKey === 'indicated_value') indicated = indicated * factor;            // price per sqm scales value
          else if (recon.overrideKey === 'total_multiplier') adj.total_multiplier = (Number(adj.total_multiplier) || 1) * factor;
          mv = indicated * (Number(adj.total_multiplier) || 1);
        } else {
          // income — analytical perturbation from the engine's echoed NOI / EGI / cap (actual variables).
          const cap = Number(d.cap_rate_pct) / 100;
          const noi = Number(d.net_operating_income);
          const egi = Number(d.effective_gross_income);
          const pgi = Number(d.potential_gross_income);
          const opex = Number(d.operating_expenses);
          const expenseRatio = egi > 0 ? opex / egi : 0;
          const coll = Number(d.collection_loss_pct || 0) / 100;
          if (cap > 0) {
            if (recon.detailKey === 'cap_rate') {
              mv = noi / (cap * factor);                                                          // exact: value = NOI / cap
            } else if (recon.detailKey === 'rental_rate' && pgi > 0) {
              const newEgi = egi * factor;                                                        // rent scales PGI→EGI
              mv = (newEgi * (1 - expenseRatio)) / cap;
            } else if (recon.detailKey === 'vacancy_rate' && pgi > 0) {
              const vac = Number(d.vacancy_rate) / 100;
              const newEgi = pgi * (1 - vac * factor - coll);
              mv = (newEgi * (1 - expenseRatio)) / cap;
            }
          }
        }
        return { pct, method_value: Number.isFinite(mv as number) ? mv : null };
      }));

      return res.json({
        success: true, driver, driver_label: recon.label, method: recon.method, range_pct: rangePctR,
        base_input: baseInputR, base_method_value: baseValueR, points,
        meta: { engine: 'python', basis: recon.kind === 'income' ? 'engine variables (NOI/cap) perturbed' : 'actual engine re-run per point' },
      });
    }
    const rangePct = Number(b.range_pct) > 0 ? Number(b.range_pct) : 10;
    const pcts = [-rangePct, -rangePct / 2, 0, rangePct / 2, rangePct];

    // Re-run a method engine via its /value route (internal, on this same server).
    const base = `http://127.0.0.1:${process.env.PORT || 4000}/api/v1/valuations/${valuationId}/${map.endpoint}/value`;
    const headers: any = { 'Content-Type': 'application/json' };
    if (req.headers.authorization) headers['Authorization'] = req.headers.authorization;
    if (req.headers.cookie) headers['Cookie'] = req.headers.cookie;
    const runValue = async (override: Record<string, any>): Promise<any> => {
      const r = await fetch(base, { method: 'POST', headers, body: JSON.stringify(override) });
      if (!r.ok) { const t = await r.text(); throw new Error(`engine ${r.status}: ${t.slice(0, 200)}`); }
      return r.json();
    };

    // Base run — resolves the input from the Data Hub and gives the base engine value.
    const baseRes = await runValue({});
    const baseMethodValue = Number(baseRes?.data?.estimated_value);
    const baseInput = Number(baseRes?.data?.details?.[map.detailKey]);
    if (!Number.isFinite(baseMethodValue) || !Number.isFinite(baseInput) || baseInput === 0) {
      return res.status(422).json({ error: 'Sensitivity unavailable', message: `Could not resolve a base value/input for '${driver}' — the method may not be computable for this property.` });
    }

    // Perturb the driver input by each %, re-running the actual engine.
    const points = await Promise.all(pcts.map(async (pct) => {
      if (pct === 0) return { pct, input_value: baseInput, method_value: baseMethodValue };
      const perturbedInput = baseInput * (1 + pct / 100);
      try {
        const r = await runValue({ [map.overrideKey]: perturbedInput });
        return { pct, input_value: perturbedInput, method_value: Number(r?.data?.estimated_value) };
      } catch {
        return { pct, input_value: perturbedInput, method_value: null };
      }
    }));

    return res.json({
      success: true,
      driver,
      driver_label: map.label,
      method: map.method,
      range_pct: rangePct,
      base_input: baseInput,
      base_method_value: baseMethodValue,
      points,
      meta: { engine: 'python', basis: 'actual engine re-run per point' },
    });
  } catch (error: any) {
    logger.error('sensitivity failed', { error: error.message });
    return res.status(500).json({ error: 'Internal error', message: error.message });
  }
});

/**
 * @route GET /api/valuations/rental-benchmarks
 * @desc Get rental market benchmarks computed from Data Hub
 * @query area - Filter by area name (optional)
 * @query propertyType - Filter by property type (optional)
 * @access Private
 */
router.get('/rental-benchmarks', async (req: Request, res: Response) => {
  try {
    const { area, propertyType, limit = 50 } = req.query;

    let benchmarkQuery = `
      SELECT 
        id,
        area_name,
        area_type,
        property_type,
        listing_count,
        avg_rent_monthly,
        median_rent_monthly,
        min_rent_monthly,
        max_rent_monthly,
        avg_rent_per_sqm,
        median_rent_per_sqm,
        rent_by_bedrooms,
        vacancy_rate_estimate,
        avg_days_on_market,
        data_source,
        computed_at
      FROM rental_market_benchmarks
      WHERE 1=1
    `;
    const params: any[] = [];

    if (area) {
      params.push(`%${area}%`);
      benchmarkQuery += ` AND LOWER(area_name) LIKE LOWER($${params.length})`;
    }

    if (propertyType === 'all' || !propertyType) {
      // Return only aggregated benchmarks (property_type IS NULL)
      benchmarkQuery += ` AND property_type IS NULL`;
    } else if (propertyType) {
      params.push(propertyType);
      benchmarkQuery += ` AND property_type = $${params.length}`;
    }

    benchmarkQuery += ` ORDER BY listing_count DESC LIMIT $${params.length + 1}`;
    params.push(Number(limit));

    const result = await query(benchmarkQuery, params);

    res.json({
      success: true,
      data: result.rows,
      meta: {
        count: result.rows.length,
        dataSource: 'computed_from_data_hub',
        lastUpdated: result.rows[0]?.computed_at || null,
      },
    });

  } catch (error: any) {
    logger.error('Failed to fetch rental benchmarks', {
      error: error.message,
      stack: error.stack,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch rental market benchmarks',
    });
  }
});

/**
 * @route GET /api/valuations/rental-benchmarks/:area
 * @desc Get rental market benchmark for a specific area
 * @access Private
 */
router.get('/rental-benchmarks/:area', async (req: Request, res: Response) => {
  try {
    const { area } = req.params;
    const { propertyType } = req.query;

    // Try exact match first, then fuzzy match
    const benchmarkQuery = `
      SELECT 
        id,
        area_name,
        area_type,
        property_type,
        listing_count,
        avg_rent_monthly,
        median_rent_monthly,
        min_rent_monthly,
        max_rent_monthly,
        avg_rent_per_sqm,
        median_rent_per_sqm,
        rent_by_bedrooms,
        vacancy_rate_estimate,
        data_source,
        computed_at
      FROM rental_market_benchmarks
      WHERE (LOWER(area_name) = LOWER($1) OR LOWER(area_name) LIKE LOWER($2))
        AND ($3::text IS NULL OR property_type IS NULL OR property_type = $3)
      ORDER BY 
        CASE WHEN LOWER(area_name) = LOWER($1) THEN 0 ELSE 1 END,
        listing_count DESC
      LIMIT 1
    `;

    const result = await query(benchmarkQuery, [area, `%${area}%`, propertyType || null]);

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: `No rental benchmark found for area: ${area}`,
        suggestion: 'Try a nearby area or check available benchmarks at /rental-benchmarks',
      });
    }

    const benchmark = result.rows[0];

    res.json({
      success: true,
      data: {
        areaName: benchmark.area_name,
        areaType: benchmark.area_type,
        propertyType: benchmark.property_type,
        listingCount: benchmark.listing_count,
        avgRentMonthly: parseFloat(benchmark.avg_rent_monthly),
        medianRentMonthly: parseFloat(benchmark.median_rent_monthly),
        minRentMonthly: parseFloat(benchmark.min_rent_monthly),
        maxRentMonthly: parseFloat(benchmark.max_rent_monthly),
        avgRentPerSqm: benchmark.avg_rent_per_sqm ? parseFloat(benchmark.avg_rent_per_sqm) : null,
        rentByBedrooms: benchmark.rent_by_bedrooms,
        vacancyRateEstimate: benchmark.vacancy_rate_estimate ? parseFloat(benchmark.vacancy_rate_estimate) : null,
        dataSource: benchmark.data_source,
        computedAt: benchmark.computed_at,
      },
    });

  } catch (error: any) {
    logger.error('Failed to fetch rental benchmark for area', {
      area: req.params.area,
      error: error.message,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch rental market benchmark',
    });
  }
});

// =====================================================
// CAP RATE ENDPOINTS
// =====================================================

/**
 * @route GET /api/valuations/neighborhood-premiums
 * @desc Location premium factors for sales-comparison adjustments, sourced from the
 *       neighborhood_premiums table (single source of truth). Replaces the hardcoded
 *       copy that used to live in the frontend AdjustmentGrid. Optional ?region filter.
 * @access Private
 */
router.get('/neighborhood-premiums', async (req: Request, res: Response) => {
  try {
    const region = (req.query.region as string | undefined)?.toLowerCase();
    // Order canonical (no-space) neighborhood rows FIRST so that, combined with the
    // first-write-wins map build below, a canonical row (e.g. 'east_legon') deterministically
    // wins over a space-variant duplicate ('East Legon') that normalizes to the same key.
    const result = region
      ? await query(
          `SELECT neighborhood, region, premium_factor, market_tier
           FROM neighborhood_premiums WHERE LOWER(region) = $1
           ORDER BY (neighborhood LIKE '% %') ASC, premium_factor DESC`,
          [region]
        )
      : await query(
          `SELECT neighborhood, region, premium_factor, market_tier
           FROM neighborhood_premiums
           ORDER BY (neighborhood LIKE '% %') ASC, region, premium_factor DESC`
        );

    // Map keyed by normalized neighborhood (underscore + lowercase) for fast client lookup.
    // First-write-wins (see ORDER BY above) makes the result deterministic.
    const premiums: Record<string, number> = {};
    for (const row of result.rows) {
      const key = String(row.neighborhood).toLowerCase().trim().replace(/\s+/g, '_');
      if (!(key in premiums)) premiums[key] = Number(row.premium_factor);
    }

    res.json({ success: true, data: { premiums, rows: result.rows, count: result.rows.length } });
  } catch (error: any) {
    logger.error('Failed to fetch neighborhood premiums', { error: error?.message });
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to fetch neighborhood premiums' });
  }
});

/**
 * @route GET /api/valuations/cap-rate/:region/:propertyType
 * @desc Get current market cap rate for region/property type combination.
 *       Uses RICS-compliant fallback hierarchy:
 *       1. Market extraction (transactions) - Category A
 *       2. Partner/bank data - Category A
 *       3. Listing-derived - Category B
 *       4. Survey/default - Category C
 * @access Private
 */
router.get('/cap-rate/:region/:propertyType', async (req: Request, res: Response) => {
  try {
    const { region, propertyType } = req.params;

    // Validate inputs
    const validRegions = ['greater_accra', 'ashanti', 'eastern', 'central', 'western', 'volta', 'northern', 'upper_east', 'upper_west', 'bono', 'bono_east', 'ahafo', 'savannah', 'north_east', 'oti', 'western_north'];
    const validPropertyTypes = ['residential_house', 'apartment_flat', 'commercial_office', 'commercial_shop', 'warehouse', 'mixed_use', 'land', 'industrial'];

    if (!validRegions.includes(region.toLowerCase())) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Invalid region. Valid regions: ${validRegions.join(', ')}`
      });
    }

    if (!validPropertyTypes.includes(propertyType.toLowerCase())) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Invalid property type. Valid types: ${validPropertyTypes.join(', ')}`
      });
    }

    // Select best cap rate methodology based on available data
    const capRateMethodology: CapRateMethodology = await capRateService.selectCapRateMethodology(
      region.toLowerCase(),
      propertyType.toLowerCase()
    );

    res.json({
      success: true,
      data: {
        region: region.toLowerCase(),
        propertyType: propertyType.toLowerCase(),
        capRate: capRateMethodology.capRate,
        range: {
          low: capRateMethodology.capRateLow,
          high: capRateMethodology.capRateHigh
        },
        confidence: capRateMethodology.confidence,
        methodology: capRateMethodology.method,
        ricsCategory: capRateMethodology.ricsCategory,
        sampleSize: capRateMethodology.sampleSize,
        description: capRateMethodology.description,
        uncertaintyNote: capRateMethodology.uncertaintyNote,
        source: capRateMethodology.source,
        retrievedAt: new Date().toISOString()
      },
      meta: {
        ricsCompliance: {
          category: capRateMethodology.ricsCategory,
          categoryDescription: capRateMethodology.ricsCategory === 'A'
            ? 'Direct transaction evidence'
            : capRateMethodology.ricsCategory === 'B'
              ? 'Adjusted listing evidence'
              : 'Indices, surveys, or defaults',
          materialUncertainty: capRateMethodology.confidence === 'limited' || capRateMethodology.confidence === 'insufficient',
          vps3Disclosure: capRateMethodology.uncertaintyNote || null
        }
      }
    });

  } catch (error: any) {
    logger.error('Failed to get cap rate', {
      region: req.params.region,
      propertyType: req.params.propertyType,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve cap rate benchmark'
    });
  }
});

/**
 * @route POST /api/valuations/cap-rate/derive
 * @desc Manually trigger cap rate derivation from listings for a region/property type.
 *       This derives a new cap rate from current market listings and saves it as a benchmark.
 * @access Private (admin/valuer only)
 */
router.post('/cap-rate/derive', async (req: Request, res: Response) => {
  try {
    const { region, propertyType, forceRefresh = false } = req.body;

    // Validate inputs
    if (!region || !propertyType) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Both region and propertyType are required'
      });
    }

    const validRegions = ['greater_accra', 'ashanti', 'eastern', 'central', 'western', 'volta', 'northern', 'upper_east', 'upper_west', 'bono', 'bono_east', 'ahafo', 'savannah', 'north_east', 'oti', 'western_north'];
    const validPropertyTypes = ['residential_house', 'apartment_flat', 'commercial_office', 'commercial_shop', 'warehouse', 'mixed_use', 'land', 'industrial'];

    if (!validRegions.includes(region.toLowerCase())) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Invalid region. Valid regions: ${validRegions.join(', ')}`
      });
    }

    if (!validPropertyTypes.includes(propertyType.toLowerCase())) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Invalid property type. Valid types: ${validPropertyTypes.join(', ')}`
      });
    }

    // Derive cap rate from listings
    const listingCapRate: ListingDerivedCapRate = await capRateService.deriveCapRateFromListings(
      region.toLowerCase(),
      propertyType.toLowerCase()
    );

    // Save the derived benchmark
    await capRateService.saveListingDerivedBenchmark(
      region.toLowerCase(),
      propertyType.toLowerCase(),
      listingCapRate
    );

    res.json({
      success: true,
      message: 'Cap rate derived and saved successfully',
      data: {
        region: region.toLowerCase(),
        propertyType: propertyType.toLowerCase(),
        derivedCapRate: listingCapRate.derivedCapRate,
        capRatePercentage: (listingCapRate.derivedCapRate * 100).toFixed(2) + '%',
        range: {
          low: listingCapRate.capRateLow,
          high: listingCapRate.capRateHigh,
          lowPercentage: (listingCapRate.capRateLow * 100).toFixed(2) + '%',
          highPercentage: (listingCapRate.capRateHigh * 100).toFixed(2) + '%'
        },
        methodology: listingCapRate.methodology,
        sampleSize: listingCapRate.sampleSize,
        confidence: listingCapRate.confidence,
        dataQuality: listingCapRate.dataQuality,
        marketCondition: listingCapRate.marketCondition,
        yieldTrend: listingCapRate.yieldTrend,
        warnings: listingCapRate.warnings,
        ricsDisclosure: listingCapRate.ricsDisclosure,
        impliedRatesSummary: {
          count: listingCapRate.impliedRates.length,
          avgAskingToAdjustedDiscount: listingCapRate.impliedRates.length > 0
            ? (listingCapRate.impliedRates.reduce((sum, r) => sum + r.adjustmentTotal, 0) / listingCapRate.impliedRates.length * 100).toFixed(2) + '%'
            : 'N/A',
          avgEstimatedNoi: listingCapRate.impliedRates.length > 0
            ? Math.round(listingCapRate.impliedRates.reduce((sum, r) => sum + r.estimatedNoi, 0) / listingCapRate.impliedRates.length)
            : 0
        },
        derivedAt: new Date().toISOString()
      }
    });

  } catch (error: any) {
    logger.error('Failed to derive cap rate', {
      region: req.body.region,
      propertyType: req.body.propertyType,
      error: error.message,
      stack: error.stack
    });

    // Specific error handling
    if (error.message.includes('Insufficient')) {
      return res.status(422).json({
        error: 'Insufficient Data',
        message: error.message,
        suggestion: 'Need at least 3 listings with valid data to derive cap rate'
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to derive cap rate from listings'
    });
  }
});

/**
 * @route GET /api/valuations/cap-rate/benchmarks
 * @desc Get all cap rate benchmarks currently stored in the database
 * @access Private
 */
router.get('/cap-rate/benchmarks', async (req: Request, res: Response) => {
  try {
    const { region, propertyType, methodology } = req.query;

    let benchmarkQuery = `
      SELECT 
        id,
        region,
        property_type,
        benchmark_cap_rate,
        typical_cap_rate_low,
        typical_cap_rate_high,
        sample_size,
        confidence_score,
        market_condition,
        yield_trend,
        data_quality,
        methodology_notes,
        effective_date,
        valid_until,
        created_at,
        last_updated
      FROM market_cap_rate_benchmarks
      WHERE (valid_until IS NULL OR valid_until >= CURRENT_DATE)
    `;
    const params: any[] = [];

    if (region) {
      params.push(region);
      benchmarkQuery += ` AND region = $${params.length}::region_code_enum`;
    }

    if (propertyType) {
      params.push(propertyType);
      benchmarkQuery += ` AND property_type = $${params.length}::property_type_enum`;
    }

    if (methodology) {
      params.push(`%${methodology}%`);
      benchmarkQuery += ` AND methodology_notes ILIKE $${params.length}`;
    }

    benchmarkQuery += ` ORDER BY region, property_type, effective_date DESC`;

    const result = await query(benchmarkQuery, params);

    res.json({
      success: true,
      data: result.rows.map((row: any) => ({
        id: row.id,
        region: row.region,
        propertyType: row.property_type,
        benchmarkCapRate: parseFloat(row.benchmark_cap_rate),
        benchmarkCapRatePercentage: (parseFloat(row.benchmark_cap_rate) * 100).toFixed(2) + '%',
        range: {
          low: parseFloat(row.typical_cap_rate_low),
          high: parseFloat(row.typical_cap_rate_high)
        },
        sampleSize: row.sample_size,
        confidenceScore: parseFloat(row.confidence_score),
        marketCondition: row.market_condition,
        yieldTrend: row.yield_trend,
        dataQuality: row.data_quality,
        methodologyNotes: row.methodology_notes,
        effectiveDate: row.effective_date,
        expiryDate: row.valid_until,
        createdAt: row.created_at,
        updatedAt: row.last_updated
      })),
      meta: {
        count: result.rows.length,
        filters: { region, propertyType, methodology }
      }
    });

  } catch (error: any) {
    logger.error('Failed to fetch cap rate benchmarks', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch cap rate benchmarks'
    });
  }
});

/**
 * @route POST /api/valuations/cap-rate/income-approach
 * @desc Perform income approach valuation using the best available cap rate methodology
 * @access Private
 */
router.post('/cap-rate/income-approach', async (req: Request, res: Response) => {
  try {
    const {
      propertyId,
      region,
      propertyType,
      propertySubtype,
      totalAreaSqm,
      customNoi,
      customCapRate,
      vacancyRateOverride,
      expenseRatioOverride
    } = req.body;

    // Validate required inputs
    if (!region || !propertyType) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'region and propertyType are required'
      });
    }

    if (!propertyId && !totalAreaSqm) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Either propertyId or totalAreaSqm is required for NOI estimation'
      });
    }

    // Perform income approach valuation
    const incomeResult = await capRateService.performIncomeApproachValuation({
      propertyId: propertyId || 'custom',
      region: region.toLowerCase(),
      propertyType: propertyType.toLowerCase(),
      propertySubtype,
      totalAreaSqm: totalAreaSqm ? parseFloat(totalAreaSqm) : undefined,
      customNoi: customNoi ? parseFloat(customNoi) : undefined,
      customCapRate: customCapRate ? parseFloat(customCapRate) : undefined,
      vacancyRateOverride: vacancyRateOverride ? parseFloat(vacancyRateOverride) : undefined,
      expenseRatioOverride: expenseRatioOverride ? parseFloat(expenseRatioOverride) : undefined
    });

    res.json({
      success: true,
      data: {
        indicatedValue: incomeResult.indicatedValue,
        valueRange: incomeResult.valueRange,
        confidenceScore: incomeResult.confidenceScore,
        methodology: incomeResult.methodology,
        noi: {
          grossPotentialRent: incomeResult.noi.grossPotentialRent,
          vacancyRate: incomeResult.noi.vacancyRate,
          vacancyLoss: incomeResult.noi.vacancyLoss,
          effectiveGrossIncome: incomeResult.noi.effectiveGrossIncome,
          operatingExpenses: incomeResult.noi.operatingExpenses,
          operatingExpenseRatio: incomeResult.noi.operatingExpenseRatio,
          netOperatingIncome: incomeResult.noi.netOperatingIncome,
          noiPerSqm: incomeResult.noi.noiPerSqm,
          methodology: incomeResult.noi.methodology,
          confidenceScore: incomeResult.noi.confidenceScore,
          evidenceCount: incomeResult.noi.evidenceCount
        },
        capRate: {
          baseCapRate: incomeResult.capRate.baseCapRate,
          adjustedCapRate: incomeResult.capRate.adjustedCapRate,
          adjustedCapRatePercentage: (incomeResult.capRate.adjustedCapRate * 100).toFixed(2) + '%',
          capRateRange: incomeResult.capRate.capRateRange,
          adjustments: incomeResult.capRate.adjustments,
          methodology: incomeResult.capRate.methodology,
          justification: incomeResult.capRate.justification,
          dataQuality: incomeResult.capRate.dataQuality,
          confidenceScore: incomeResult.capRate.confidenceScore,
          warnings: incomeResult.capRate.warnings
        },
        ricsCompliance: incomeResult.ricsCompliance
      }
    });

  } catch (error: any) {
    logger.error('Failed to perform income approach valuation', {
      body: req.body,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to perform income approach valuation'
    });
  }
});

export default router;
