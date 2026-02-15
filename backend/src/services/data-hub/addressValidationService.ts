/**
 * Address Validation Service
 * 
 * Cross-references GPS data with scraped addresses to:
 * - Validate and standardize addresses
 * - Generate GPS codes for properties with only coordinates
 * - Enrich property data with accurate location information
 * - Detect and flag address discrepancies
 */

import { logger } from '../../utils/logger';
import { ghanaPostService, GhanaPostGeocode, AddressComponents } from './ghanaPostGeocodingService';

// Validation result interface
export interface AddressValidationResult {
  isValid: boolean;
  confidence: number;  // 0-1 scale
  originalAddress: AddressComponents;
  validatedAddress: {
    digitalAddress?: string;
    latitude?: number;
    longitude?: number;
    region?: string;
    district?: string;
    area?: string;
    street?: string;
    city?: string;
    postCode?: string;
  };
  normalized?: {
    street?: string;
    city?: string;
    region?: string;
  };
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  issues: AddressIssue[];
  enrichments: AddressEnrichment[];
  source: 'gps_api' | 'gps_decode' | 'reverse_geocode' | 'neighborhood_lookup' | 'partial';
}

export interface AddressIssue {
  type: 'missing_gps' | 'invalid_gps' | 'coordinates_mismatch' | 'region_mismatch' | 
        'district_mismatch' | 'outside_ghana' | 'low_confidence';
  severity: 'error' | 'warning' | 'info';
  message: string;
  field?: string;
  expected?: string;
  actual?: string;
}

export interface AddressEnrichment {
  field: string;
  value: string;
  source: string;
  confidence: number;
}

// Ghana bounds for coordinate validation
const GHANA_BOUNDS = {
  minLat: 4.5,
  maxLat: 11.2,
  minLng: -3.3,
  maxLng: 1.2,
};

// Distance threshold for coordinate mismatch (in km)
const COORDINATE_MISMATCH_THRESHOLD_KM = 1.0;

class AddressValidationService {
  /**
   * Validate and enrich an address with GPS data
   */
  async validateAddress(
    rawAddress: string,
    coordinates?: { latitude: number; longitude: number }
  ): Promise<AddressValidationResult> {
    const issues: AddressIssue[] = [];
    const enrichments: AddressEnrichment[] = [];
    
    // Extract address components from raw text
    const components = ghanaPostService.extractAddressComponents(rawAddress);
    
    // Initialize result
    const result: AddressValidationResult = {
      isValid: false,
      confidence: 0,
      originalAddress: components,
      validatedAddress: {},
      issues: [],
      enrichments: [],
      source: 'partial',
    };

    // Validate coordinates if provided
    if (coordinates) {
      if (!this.isWithinGhana(coordinates.latitude, coordinates.longitude)) {
        issues.push({
          type: 'outside_ghana',
          severity: 'error',
          message: 'Coordinates are outside Ghana boundaries',
          field: 'coordinates',
          actual: `${coordinates.latitude}, ${coordinates.longitude}`,
        });
      } else {
        result.validatedAddress.latitude = coordinates.latitude;
        result.validatedAddress.longitude = coordinates.longitude;
      }
    }

    // Priority 1: Validate GPS code if present
    if (components.digitalAddress) {
      const gpsResult = await this.validateGPSCode(components.digitalAddress, coordinates);
      
      if (gpsResult.geocode) {
        result.validatedAddress = {
          ...result.validatedAddress,
          digitalAddress: gpsResult.geocode.digitalAddress,
          latitude: gpsResult.geocode.latitude,
          longitude: gpsResult.geocode.longitude,
          region: gpsResult.geocode.region,
          district: gpsResult.geocode.district,
          area: gpsResult.geocode.area,
          street: gpsResult.geocode.street,
          postCode: gpsResult.geocode.postCode,
        };
        result.confidence = gpsResult.geocode.confidence;
        result.source = gpsResult.geocode.source.startsWith('api') ? 'gps_api' : 'gps_decode';
        result.isValid = gpsResult.geocode.confidence >= 0.5;

        // Add enrichments for new data
        if (gpsResult.geocode.area && !components.neighborhood) {
          enrichments.push({
            field: 'area',
            value: gpsResult.geocode.area,
            source: gpsResult.geocode.source,
            confidence: gpsResult.geocode.confidence,
          });
        }
        if (gpsResult.geocode.street) {
          enrichments.push({
            field: 'street',
            value: gpsResult.geocode.street,
            source: gpsResult.geocode.source,
            confidence: gpsResult.geocode.confidence,
          });
        }

        // Check for coordinate mismatch if both GPS and coordinates provided
        if (coordinates && gpsResult.geocode) {
          const distance = this.calculateDistance(
            coordinates.latitude,
            coordinates.longitude,
            gpsResult.geocode.latitude,
            gpsResult.geocode.longitude
          );
          
          if (distance > COORDINATE_MISMATCH_THRESHOLD_KM) {
            issues.push({
              type: 'coordinates_mismatch',
              severity: 'warning',
              message: `GPS code location differs from provided coordinates by ${distance.toFixed(2)}km`,
              field: 'coordinates',
              expected: `${gpsResult.geocode.latitude}, ${gpsResult.geocode.longitude}`,
              actual: `${coordinates.latitude}, ${coordinates.longitude}`,
            });
          }
        }
      }
      
      issues.push(...gpsResult.issues);
    } else {
      // No GPS code - try to generate one via reverse geocoding
      if (coordinates && this.isWithinGhana(coordinates.latitude, coordinates.longitude)) {
        const reverseResult = await ghanaPostService.reverseGeocode(
          coordinates.latitude,
          coordinates.longitude
        );
        
        if (reverseResult) {
          result.validatedAddress = {
            ...result.validatedAddress,
            digitalAddress: reverseResult.digitalAddress,
            latitude: reverseResult.latitude,
            longitude: reverseResult.longitude,
            region: reverseResult.region,
            district: reverseResult.district,
            area: reverseResult.area,
            street: reverseResult.street,
            postCode: reverseResult.postCode,
          };
          result.confidence = reverseResult.confidence;
          result.source = 'reverse_geocode';
          result.isValid = true;

          enrichments.push({
            field: 'digitalAddress',
            value: reverseResult.digitalAddress,
            source: reverseResult.source,
            confidence: reverseResult.confidence,
          });

          issues.push({
            type: 'missing_gps',
            severity: 'info',
            message: 'GPS code was generated via reverse geocoding',
            field: 'digitalAddress',
          });
        } else {
          issues.push({
            type: 'missing_gps',
            severity: 'warning',
            message: 'No GPS code found and reverse geocoding failed',
            field: 'digitalAddress',
          });
        }
      } else {
        issues.push({
          type: 'missing_gps',
          severity: 'warning',
          message: 'No GPS code found in address and no valid coordinates for reverse geocoding',
          field: 'digitalAddress',
        });
      }
    }

    // Priority 2: Try neighborhood lookup if still low confidence
    if (result.confidence < 0.5 && components.neighborhood) {
      const neighborhoodResult = await ghanaPostService.geocodeByNeighborhood(components.neighborhood);
      
      if (neighborhoodResult && neighborhoodResult.confidence > result.confidence) {
        if (!result.validatedAddress.latitude) {
          result.validatedAddress.latitude = neighborhoodResult.latitude;
          result.validatedAddress.longitude = neighborhoodResult.longitude;
        }
        if (!result.validatedAddress.region) {
          result.validatedAddress.region = neighborhoodResult.region;
        }
        if (!result.validatedAddress.district) {
          result.validatedAddress.district = neighborhoodResult.district;
        }
        
        // Only update confidence if we didn't have better data
        if (result.confidence < neighborhoodResult.confidence) {
          result.confidence = neighborhoodResult.confidence;
          result.source = 'neighborhood_lookup';
          result.isValid = neighborhoodResult.confidence >= 0.5;
        }
      }
    }

    // Cross-reference region/district from address components
    if (components.region && result.validatedAddress.region) {
      if (!this.regionsMatch(components.region, result.validatedAddress.region)) {
        issues.push({
          type: 'region_mismatch',
          severity: 'warning',
          message: 'Region in address does not match GPS code region',
          field: 'region',
          expected: result.validatedAddress.region,
          actual: components.region,
        });
      }
    }

    if (components.district && result.validatedAddress.district) {
      if (!this.districtsMatch(components.district, result.validatedAddress.district)) {
        issues.push({
          type: 'district_mismatch',
          severity: 'warning',
          message: 'District in address does not match GPS code district',
          field: 'district',
          expected: result.validatedAddress.district,
          actual: components.district,
        });
      }
    }

    // Add low confidence warning
    if (result.confidence < 0.5 && result.confidence > 0) {
      issues.push({
        type: 'low_confidence',
        severity: 'warning',
        message: `Address validation confidence is low (${(result.confidence * 100).toFixed(0)}%)`,
      });
    }

    result.issues = issues;
    result.enrichments = enrichments;

    return result;
  }

  /**
   * Validate a GPS code and optionally check against coordinates
   */
  private async validateGPSCode(
    digitalAddress: string,
    coordinates?: { latitude: number; longitude: number }
  ): Promise<{ geocode: GhanaPostGeocode | null; issues: AddressIssue[] }> {
    const issues: AddressIssue[] = [];
    
    // Normalize and validate format
    const normalized = ghanaPostService.normalizeGPSCode(digitalAddress);
    if (!normalized) {
      issues.push({
        type: 'invalid_gps',
        severity: 'error',
        message: 'GPS code format is invalid',
        field: 'digitalAddress',
        actual: digitalAddress,
      });
      return { geocode: null, issues };
    }

    // Geocode the GPS code
    const geocode = await ghanaPostService.geocodeDigitalAddress(normalized);
    
    if (!geocode) {
      issues.push({
        type: 'invalid_gps',
        severity: 'error',
        message: 'GPS code could not be geocoded - may not exist',
        field: 'digitalAddress',
        actual: normalized,
      });
      return { geocode: null, issues };
    }

    return { geocode, issues };
  }

  /**
   * Batch validate addresses for multiple properties
   */
  async validateAddressBatch(
    properties: Array<{
      id: string;
      address: string;
      coordinates?: { latitude: number; longitude: number };
    }>
  ): Promise<Map<string, AddressValidationResult>> {
    const results = new Map<string, AddressValidationResult>();
    
    // Process in parallel with concurrency limit
    const batchSize = 10;
    for (let i = 0; i < properties.length; i += batchSize) {
      const batch = properties.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (prop) => {
          try {
            const result = await this.validateAddress(prop.address, prop.coordinates);
            return { id: prop.id, result };
          } catch (error) {
            logger.error('Address validation failed', { 
              propertyId: prop.id, 
              error: error instanceof Error ? error.message : 'Unknown error' 
            });
            return {
              id: prop.id,
              result: {
                isValid: false,
                confidence: 0,
                originalAddress: { rawAddress: prop.address, landmarks: [] },
                validatedAddress: {},
                issues: [{
                  type: 'invalid_gps' as const,
                  severity: 'error' as const,
                  message: 'Validation failed due to an error',
                }],
                enrichments: [],
                source: 'partial' as const,
              },
            };
          }
        })
      );
      
      for (const { id, result } of batchResults) {
        results.set(id, result);
      }
    }

    return results;
  }

  /**
   * Generate GPS code for properties with only coordinates
   */
  async generateGPSForProperties(
    properties: Array<{
      id: string;
      latitude: number;
      longitude: number;
    }>
  ): Promise<Map<string, GhanaPostGeocode | null>> {
    const results = new Map<string, GhanaPostGeocode | null>();
    
    const batchSize = 10;
    for (let i = 0; i < properties.length; i += batchSize) {
      const batch = properties.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (prop) => {
          try {
            if (!this.isWithinGhana(prop.latitude, prop.longitude)) {
              return { id: prop.id, result: null };
            }
            const result = await ghanaPostService.reverseGeocode(prop.latitude, prop.longitude);
            return { id: prop.id, result };
          } catch (error) {
            logger.error('GPS generation failed', { 
              propertyId: prop.id, 
              error: error instanceof Error ? error.message : 'Unknown error' 
            });
            return { id: prop.id, result: null };
          }
        })
      );
      
      for (const { id, result } of batchResults) {
        results.set(id, result);
      }
    }

    return results;
  }

  /**
   * Get validation statistics for a batch of properties
   */
  getValidationStats(results: Map<string, AddressValidationResult>): {
    total: number;
    valid: number;
    invalid: number;
    enriched: number;
    avgConfidence: number;
    issuesByType: Record<string, number>;
  } {
    let valid = 0;
    let enriched = 0;
    let totalConfidence = 0;
    const issuesByType: Record<string, number> = {};

    for (const result of results.values()) {
      if (result.isValid) valid++;
      if (result.enrichments.length > 0) enriched++;
      totalConfidence += result.confidence;
      
      for (const issue of result.issues) {
        issuesByType[issue.type] = (issuesByType[issue.type] || 0) + 1;
      }
    }

    return {
      total: results.size,
      valid,
      invalid: results.size - valid,
      enriched,
      avgConfidence: results.size > 0 ? totalConfidence / results.size : 0,
      issuesByType,
    };
  }

  // ==================== Helper Methods ====================

  /**
   * Check if coordinates are within Ghana
   */
  private isWithinGhana(latitude: number, longitude: number): boolean {
    return (
      latitude >= GHANA_BOUNDS.minLat &&
      latitude <= GHANA_BOUNDS.maxLat &&
      longitude >= GHANA_BOUNDS.minLng &&
      longitude <= GHANA_BOUNDS.maxLng
    );
  }

  /**
   * Calculate distance between two points in km (Haversine formula)
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * Check if two region names match (fuzzy matching)
   */
  private regionsMatch(region1: string, region2: string): boolean {
    const normalize = (s: string) => 
      s.toLowerCase().replace(/\s+/g, ' ').replace(/region$/i, '').trim();
    return normalize(region1) === normalize(region2);
  }

  /**
   * Check if two district names match (fuzzy matching)
   */
  private districtsMatch(district1: string, district2: string): boolean {
    const normalize = (s: string) => 
      s.toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/municipal|metropolitan|district$/gi, '')
        .trim();
    return normalize(district1).includes(normalize(district2)) ||
           normalize(district2).includes(normalize(district1));
  }
}

export const addressValidationService = new AddressValidationService();
export default addressValidationService;
