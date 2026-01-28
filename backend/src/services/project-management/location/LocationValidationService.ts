/**
 * Location Validation Service
 * 
 * Phase 3.5: Split projectLocationService
 * 
 * Validates and enriches project locations using Data Hub services:
 * - Ghana PostGPS validation
 * - Address cross-referencing
 * - Coordinate validation
 * 
 * IMPORTANT: This service CONSUMES Data Hub services, NOT duplicates them.
 * 
 * @module services/project-management/location/LocationValidationService
 */

import { pool } from '../../../database';
import { BaseService } from '../../base/BaseService';
import { eventBus } from '../events/EventBus';

// Import existing Data Hub services - DO NOT DUPLICATE
import { ghanaPostService, GHANA_GPS_DISTRICTS, GHANA_NEIGHBORHOODS } from '../../data-hub/ghanaPostGeocodingService';
import { addressValidationService, AddressValidationResult } from '../../data-hub/addressValidationService';
import { geocodingService } from '../../data-hub/geocodingService';

import {
  LocationValidationInput,
  LocationValidationResult,
  ProjectLocationInput,
  ValidatedLocation,
} from './types';

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

class LocationValidationServiceImpl extends BaseService {
  constructor() {
    super('LocationValidationService');
  }

  /**
   * Validate and enrich location data using Data Hub services
   * @param input Raw location input (GPS code, coordinates, or address)
   * @returns Validation result with enriched location data
   */
  async validateAndEnrichLocation(input: LocationValidationInput): Promise<LocationValidationResult> {
    const result: LocationValidationResult = {
      isValid: false,
      confidence: 0,
      validated: {},
      enrichments: [],
      issues: [],
      source: 'none',
    };

    // 1. Try Ghana PostGPS validation first (most reliable for Ghana)
    if (input.ghana_post_gps) {
      await this.validateGhanaPostGPS(input.ghana_post_gps, result);
    }

    // 2. Try coordinate validation
    if (!result.isValid && (input.latitude && input.longitude)) {
      await this.validateCoordinates(input.latitude, input.longitude, result);
    }

    // 3. Try address validation as fallback
    if (!result.isValid && input.address_line1) {
      await this.validateAddress(input, result);
    }

    // 4. Apply any provided values that weren't enriched
    this.applyInputDefaults(input, result);

    return result;
  }

  /**
   * Validate a Ghana PostGPS code and enrich with location data
   */
  private async validateGhanaPostGPS(gpsCode: string, result: LocationValidationResult): Promise<void> {
    const normalized = ghanaPostService.normalizeGPSCode(gpsCode);

    if (!normalized) {
      result.issues.push({
        type: 'invalid_gps_format',
        severity: 'error',
        message: `Invalid Ghana PostGPS format: ${gpsCode}. Expected format: XX-XXXX-XXXX`,
        field: 'ghana_post_gps',
      });
      return;
    }

    // Valid format - now geocode it
    const geocodeResult = await ghanaPostService.geocodeDigitalAddress(normalized);

    if (geocodeResult) {
      result.isValid = true;
      result.confidence = 0.95;
      result.source = 'ghana_post_gps';
      result.validated = {
        ghana_post_gps: normalized,
        latitude: geocodeResult.latitude,
        longitude: geocodeResult.longitude,
        ghana_region: geocodeResult.region,
        ghana_district: geocodeResult.district,
        ghana_area: geocodeResult.area,
      };

      // Add enrichments
      if (geocodeResult.region) {
        result.enrichments.push({
          field: 'ghana_region',
          value: geocodeResult.region,
          source: 'ghana_post_gps',
          confidence: 0.95,
        });
      }

      if (geocodeResult.district) {
        result.enrichments.push({
          field: 'ghana_district',
          value: geocodeResult.district,
          source: 'ghana_post_gps',
          confidence: 0.95,
        });
      }
    } else {
      result.issues.push({
        type: 'gps_not_found',
        severity: 'warning',
        message: `Ghana PostGPS code ${normalized} could not be geocoded. The format is valid but the code may not exist.`,
        field: 'ghana_post_gps',
      });

      // Still use the GPS code but with lower confidence
      result.validated.ghana_post_gps = normalized;
      result.confidence = 0.3;
    }
  }

  /**
   * Validate coordinates and reverse geocode to get address details
   */
  private async validateCoordinates(
    latitude: number,
    longitude: number,
    result: LocationValidationResult
  ): Promise<void> {
    // Check if coordinates are within Ghana bounds (approximately)
    const isInGhana = this.isWithinGhanaBounds(latitude, longitude);

    if (!isInGhana) {
      result.issues.push({
        type: 'coordinates_outside_ghana',
        severity: 'warning',
        message: 'Coordinates appear to be outside Ghana. Please verify.',
        field: 'latitude,longitude',
      });
    }

    // Try reverse geocoding
    try {
      const reverseResult = await geocodingService.reverseGeocode(latitude, longitude);

      if (reverseResult) {
        result.isValid = true;
        result.confidence = isInGhana ? 0.85 : 0.5;
        result.source = 'coordinates';
        result.validated = {
          latitude,
          longitude,
          city: reverseResult.city,
          region: reverseResult.region,
          ghana_region: reverseResult.region,
        };

        if (reverseResult.district) {
          result.validated.ghana_district = reverseResult.district;
          result.enrichments.push({
            field: 'ghana_district',
            value: reverseResult.district,
            source: 'reverse_geocoding',
            confidence: 0.8,
          });
        }
      } else {
        result.validated = { latitude, longitude };
        result.isValid = true;
        result.confidence = 0.5;
        result.source = 'coordinates_only';

        result.issues.push({
          type: 'reverse_geocode_failed',
          severity: 'info',
          message: 'Could not determine address from coordinates.',
        });
      }
    } catch (error) {
      result.validated = { latitude, longitude };
      result.isValid = true;
      result.confidence = 0.4;
      result.source = 'coordinates_only';
    }
  }

  /**
   * Validate address and try to geocode it
   */
  private async validateAddress(
    input: LocationValidationInput,
    result: LocationValidationResult
  ): Promise<void> {
    const fullAddress = [
      input.address_line1,
      input.city,
      input.region,
      'Ghana',
    ].filter(Boolean).join(', ');

    try {
      const validationResult = await addressValidationService.validateAddress({
        address: input.address_line1 || '',
        city: input.city || '',
        region: input.region || '',
        country: 'Ghana',
      });

      if (validationResult.isValid) {
        result.isValid = true;
        result.confidence = validationResult.confidence;
        result.source = 'address_validation';
        result.validated = {
          city: validationResult.normalized?.city || input.city,
          region: validationResult.normalized?.region || input.region,
          ghana_region: validationResult.normalized?.region || input.region,
        };

        if (validationResult.coordinates) {
          result.validated.latitude = validationResult.coordinates.latitude;
          result.validated.longitude = validationResult.coordinates.longitude;
        }
      } else {
        result.issues.push({
          type: 'address_validation_failed',
          severity: 'warning',
          message: 'Address could not be validated. Please verify the details.',
        });

        // Still use provided values with low confidence
        result.validated = {
          city: input.city,
          region: input.region,
          ghana_region: input.region,
        };
        result.confidence = 0.3;
        result.isValid = true;
        result.source = 'user_input';
      }
    } catch (error) {
      result.validated = {
        city: input.city,
        region: input.region,
      };
      result.isValid = true;
      result.confidence = 0.2;
      result.source = 'user_input_unverified';
    }
  }

  /**
   * Apply input values as defaults for fields not enriched
   */
  private applyInputDefaults(input: LocationValidationInput, result: LocationValidationResult): void {
    if (input.city && !result.validated.city) {
      result.validated.city = input.city;
    }
    if (input.region && !result.validated.region) {
      result.validated.region = input.region;
      result.validated.ghana_region = input.region;
    }
    if (input.latitude && !result.validated.latitude) {
      result.validated.latitude = input.latitude;
    }
    if (input.longitude && !result.validated.longitude) {
      result.validated.longitude = input.longitude;
    }
    if (input.ghana_post_gps && !result.validated.ghana_post_gps) {
      result.validated.ghana_post_gps = input.ghana_post_gps;
    }
  }

  /**
   * Check if coordinates are within Ghana's approximate bounding box
   */
  private isWithinGhanaBounds(latitude: number, longitude: number): boolean {
    // Ghana approximate bounds
    const GHANA_BOUNDS = {
      north: 11.2,
      south: 4.5,
      east: 1.2,
      west: -3.3,
    };

    return (
      latitude >= GHANA_BOUNDS.south &&
      latitude <= GHANA_BOUNDS.north &&
      longitude >= GHANA_BOUNDS.west &&
      longitude <= GHANA_BOUNDS.east
    );
  }

  /**
   * Get Ghana regions list
   */
  getGhanaRegions(): string[] {
    return [
      'Greater Accra',
      'Ashanti',
      'Western',
      'Eastern',
      'Central',
      'Northern',
      'Upper East',
      'Upper West',
      'Volta',
      'Bono',
      'Bono East',
      'Ahafo',
      'Western North',
      'Oti',
      'North East',
      'Savannah',
    ];
  }

  /**
   * Get districts for a region
   */
  async getDistrictsByRegion(region: string): Promise<string[]> {
    // Use Data Hub's district data
    const districts = GHANA_GPS_DISTRICTS[region.toUpperCase()];
    return districts ? Object.keys(districts) : [];
  }

  /**
   * Get neighborhoods/areas for a district
   */
  async getNeighborhoodsByDistrict(district: string): Promise<string[]> {
    return GHANA_NEIGHBORHOODS[district] || [];
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const locationValidationService = new LocationValidationServiceImpl();
