/**
 * Report Data Service
 * 
 * Collects and structures all data required for RICS/GhIS compliant valuation reports.
 * Integrates with existing valuationReportService for data collection.
 * 
 * Phase 2: Data Collection Endpoints
 * - Cover page data
 * - Transmittal letter data
 * - Certification data
 * - Disclaimers
 * - Property legal, construction, externals, risk assessment
 * - Inspection and engagement data
 */

import { query } from '../../database';
import { logger } from '../../utils/logger';
import { resolveReportBranding } from './brandingService';
import { valuationReportService } from './valuationReportService';
import { economicDataService } from '../data-hub/economicDataService';

// =====================================================
// TYPES
// =====================================================

export interface ReportCoverData {
  title: string;
  subtitle: string;
  property_location: string;
  ghana_post_address: string | null;
  requested_by: {
    name: string;
    company: string | null;
    address: string;
  };
  prepared_for: {
    name: string;
    relationship: string | null;
    address: string;
  };
  certified_by: {
    name: string;
    qualifications: string;
    title: string;
    license_number: string | null;
    address: string;
  };
  date: string;
  company_logo_url: string | null;
}

export interface ReportTransmittalData {
  recipient: {
    name: string;
    company: string | null;
    address: string;
  };
  date: string;
  date_formatted: string;
  subject: string;
  body: string;
  valuation_methods_summary: string;
  values: {
    market_value: {
      ghs: number;
      ghs_formatted: string;
      usd: number;
      usd_formatted: string;
    };
    forced_sale_value: {
      ghs: number;
      ghs_formatted: string;
      usd: number;
      usd_formatted: string;
    };
  };
  exchange_rate: {
    rate: number;
    source: string;
    date: string;
  };
  valuer_signature: {
    name: string;
    title: string;
    qualifications: string;
  };
}

export interface ReportCertificationData {
  certification_text: string;
  disclosure: string;
  standards_compliance: string;
  values_table: {
    market_value: { ghs: number; usd: number };
    forced_sale_value: { ghs: number; usd: number };
  };
  valuation_date: string;
  exchange_rate: {
    rate: number;
    source: string;
    date: string;
  };
  valuer: {
    name: string;
    title: string;
    qualifications: string;
    license_number: string | null;
    signature_url: string | null;
  };
}

export interface ReportDisclaimersData {
  title: string;
  conditions: string[];
  standards_references: {
    code: string;
    name: string;
    year: number;
  }[];
}

export interface PropertyLegalData {
  property_id: string;
  tenure_type: string;
  tenure_details: {
    lease_term_years: number | null;
    lease_start_date: string | null;
    remaining_years: number | null;
    ground_rent: number | null;
    lessor: string | null;
  };
  title_registration: {
    status: 'registered' | 'pending' | 'unregistered';
    reference: string | null;
    date: string | null;
  };
  encumbrances: string[];
  easements: string[];
  planning_zone: string | null;
  permitted_uses: string[];
  assumptions: string[];
}

export interface PropertyConstructionData {
  property_id: string;
  structure_type: string | null;
  foundation: string | null;
  walls: string | null;
  roofing: string | null;
  flooring: string | null;
  ceiling: string | null;
  windows: string | null;
  doors: string | null;
  electrical: string | null;
  plumbing: string | null;
  hvac: string | null;
  age_years: number | null;
  condition: string | null;
  last_renovation_year: number | null;
  effective_age_years: number | null;
  fixtures: string[];
  defects: string[];
  structural_notes: string | null;
}

export interface PropertyExternalsData {
  property_id: string;
  grounds: {
    area_sqm: number | null;
    landscaping: string[];
    boundary_type: string | null;
    boundary_height_m: number | null;
    access_points: number | null;
  };
  external_works: {
    parking_spaces: number | null;
    parking_type: string | null;
    drainage_type: string | null;
    water_storage_capacity_liters: number | null;
    generator_capacity_kva: number | null;
    security_features: string[];
  };
  services: {
    water_supply: string | null;
    electricity_supply: string | null;
    sewage_system: string | null;
    telecom_available: boolean;
    internet_available: boolean;
  };
}

export interface PropertyRiskAssessmentData {
  property_id: string;
  assessment_date: string;
  items: {
    item: string;
    rating: 'good' | 'average' | 'fair' | 'poor';
  }[];
  overall_risk_level: 'low' | 'medium' | 'high';
  notes: string | null;
}

export interface InspectionData {
  valuation_id: string;
  inspection_date: string;
  inspector: {
    name: string;
    qualifications: string | null;
  } | null;
  scope: string | null;
  access_notes: string | null;
  weather_conditions: string | null;
  measurement_standard: string;
  areas_inspected: string[];
  limitations: string[];
  notes: string | null;
}

export interface EngagementData {
  valuation_id: string;
  request_type: string;
  request_date: string | null;
  client: {
    name: string;
    company: string | null;
    address: string | null;
    contact: string | null;
  };
  intended_user: {
    name: string | null;
    relationship: string | null;
    address: string | null;
  };
  purpose: string;
  basis_of_value: string;
  special_assumptions: string[];
  departures: string[];
}

// =====================================================
// CONSTANTS
// =====================================================

const STANDARDS_REFERENCES = [
  { code: 'RICS', name: 'RICS Valuation – Global Standards (Red Book)', year: 2022 },
  { code: 'IVS', name: 'International Valuation Standards', year: 2022 },
  { code: 'GhIS', name: 'Ghana Institution of Surveyors Valuation Standards', year: 2020 },
];

// =====================================================
// REPORT DATA SERVICE
// =====================================================

class ReportDataService {

  /**
   * Fetch USD/GHS exchange rate as of the valuation effective date.
   * Uses the data-hub's getExchangeRateForDate which queries
   * the economic_indicators table for the closest rate to that date.
   * Source is always attributed to Bank of Ghana for RICS/GhIS compliance.
   */
  private async getValuationDateExchangeRate(effectiveDate: Date | string): Promise<{ rate: number; source: string; date: string }> {
    const asOfDate = effectiveDate instanceof Date ? effectiveDate : new Date(effectiveDate);
    const dateStr = asOfDate.toISOString().split('T')[0];
    try {
      const fxRate = await economicDataService.getExchangeRateForDate('USD', 'GHS', asOfDate);
      if (fxRate && fxRate.rate > 0) {
        const rateDate = fxRate.date instanceof Date
          ? fxRate.date.toISOString().split('T')[0]
          : String(fxRate.date).split('T')[0];
        logger.info('Using valuation-date FX rate for report', {
          rate: fxRate.rate,
          requestedDate: dateStr,
          actualDate: rateDate,
        });
        return { rate: fxRate.rate, source: 'Bank of Ghana', date: rateDate };
      }
    } catch (err: any) {
      logger.error('Failed to fetch valuation-date FX rate — no fallback, exchange rate MUST come from economic_indicators or live API', { error: err.message, effectiveDate: dateStr });
      throw new Error(`Exchange rate unavailable for ${dateStr}. Ensure Bank of Ghana rate is recorded in economic_indicators table.`);
    }
    // If getExchangeRateForDate returned nothing usable, throw — we must NOT use a hardcoded rate
    throw new Error(`No valid exchange rate found for ${dateStr}. Populate the economic_indicators table.`);
  }

  /**
   * Get cover page data for a report
   */
  async getCoverData(reportId: string): Promise<ReportCoverData> {
    // Get report and related data
    const reportResult = await query(
      `SELECT r.*, v.id as valuation_id, v.property_id, v.effective_date
       FROM valuation_reports r
       JOIN valuations v ON r.valuation_id = v.id
       WHERE r.id = $1`,
      [reportId]
    );

    if (reportResult.rows.length === 0) {
      throw new Error(`Report not found: ${reportId}`);
    }

    const report = reportResult.rows[0];

    // Get property data
    const propertyResult = await query(
      `SELECT * FROM properties WHERE id = $1`,
      [report.property_id]
    );
    const property = propertyResult.rows[0];

    // Get engagement data
    const engagementResult = await query(
      `SELECT * FROM valuation_engagements WHERE valuation_id = $1`,
      [report.valuation_id]
    );
    const engagement = engagementResult.rows[0];

    // Get valuer data - prefer the valuation's assigned valuer
    const valuation = await this.getValuationData(report.valuation_id);
    const valuer = await this.getActiveValuer(valuation?.valuer_id);

    // Firm logo from the valuer org's saved branding (used by cover renderers)
    const branding = await resolveReportBranding((valuation as any)?.valuer_organization_id, { context: 'valuation', withLogo: false });

    const propertyLocation = this.formatPropertyLocation(property);

    return {
      title: 'VALUATION REPORT',
      subtitle: `ON ${(property?.title || 'PROPERTY').toUpperCase()}`,
      property_location: propertyLocation,
      ghana_post_address: property?.digital_address || property?.ghana_post_gps || null,
      requested_by: {
        // Client = the CLIENT the valuer entered (engagement, then the saved comprehensive-form
        // client). The property OWNER is NOT the client — do not fall back to it.
        name: engagement?.client_name || property?.metadata?.client_name || 'Client',
        company: engagement?.client_company || property?.metadata?.client_company || null,
        address: engagement?.client_address || property?.metadata?.client_address || 'Address not provided',
      },
      prepared_for: {
        name: engagement?.intended_user_name || engagement?.client_name || property?.metadata?.client_name || 'Client',
        relationship: engagement?.intended_user_relationship || null,
        address: engagement?.intended_user_address || engagement?.client_address || property?.metadata?.client_address || '',
      },
      certified_by: {
        name: valuer?.name || '[Valuer Name]',
        qualifications: valuer?.qualifications || '[Qualifications]',
        title: valuer?.title || '[Professional Title]',
        license_number: valuer?.license_number || null,
        address: valuer?.contact_address || null,
      },
      date: this.formatDate(report.effective_date || new Date()),
      company_logo_url: branding.logoUrl,
    };
  }

  /**
   * Get transmittal letter data for a report
   */
  async getTransmittalData(reportId: string): Promise<ReportTransmittalData> {
    const report = await this.getReportWithValuation(reportId);
    const engagement = await this.getEngagement(report.valuation_id);
    const valuer = await this.getActiveValuer(report.valuer_id);
    const property = await this.getProperty(report.property_id);
    const valuation = await this.getValuationData(report.valuation_id);

    const marketValue = Number(valuation?.final_value_ghs || valuation?.estimated_value || 0);
    // FSV is the valuer's figure set on the reconciliation page — NO hardcoded fallback.
    // If neither the stored value nor the discount is set, FSV is omitted (0), not fabricated.
    const fsvDiscountRaw = valuation?.fsv_discount_percent ?? valuation?.recon_fsv_discount;
    const forcedSaleValue = valuation?.force_sale_value != null
      ? Number(valuation.force_sale_value)
      : (fsvDiscountRaw != null ? Math.round(marketValue * (1 - Number(fsvDiscountRaw) / 100)) : 0);
    const effectiveDate = report.effective_date || valuation?.effective_date || new Date();
    // Use exchange rate from reconciliation if available, else fetch for valuation date
    const exchangeRate = valuation?.recon_exchange_rate && Number(valuation.recon_exchange_rate) > 0
      ? { rate: Number(valuation.recon_exchange_rate), source: 'Bank of Ghana', date: new Date(effectiveDate).toISOString().split('T')[0] }
      : await this.getValuationDateExchangeRate(effectiveDate);

    // Use recon_method_weights (reconciliation page = source of truth) as primary source
    const methodsSummary = this.generateMethodsSummary(
      valuation?.recon_method_weights || valuation?.methods_applied || valuation?.method_weights || valuation?.recon_method_results || valuation?.method_results || []
    );

    return {
      recipient: {
        name: engagement?.client_name || 'Client',
        company: engagement?.client_company || null,
        address: engagement?.client_address || '',
      },
      date: new Date().toISOString().split('T')[0],
      date_formatted: this.formatDateLong(new Date()),
      subject: `RE: ${this.formatPropertyType(property?.property_type).toUpperCase()} (${(property?.title || 'SUBJECT PROPERTY').toUpperCase()}) ON PLOT OF LAND SITUATE AT ${this.formatPropertyLocation(property).toUpperCase()}`,
      body: this.generateTransmittalBody(engagement, property),
      valuation_methods_summary: methodsSummary,
      values: {
        market_value: {
          ghs: marketValue,
          ghs_formatted: this.formatCurrencyWords(marketValue, 'GHS'),
          usd: Math.round(marketValue / exchangeRate.rate),
          usd_formatted: this.formatCurrencyWords(Math.round(marketValue / exchangeRate.rate), 'USD'),
        },
        forced_sale_value: {
          ghs: forcedSaleValue,
          ghs_formatted: this.formatCurrencyWords(forcedSaleValue, 'GHS'),
          usd: Math.round(forcedSaleValue / exchangeRate.rate),
          usd_formatted: this.formatCurrencyWords(Math.round(forcedSaleValue / exchangeRate.rate), 'USD'),
        },
      },
      exchange_rate: exchangeRate,
      valuer_signature: {
        name: valuer?.name || '[Valuer Name]',
        title: valuer?.title || '[Professional Title]',
        qualifications: valuer?.qualifications || '[Qualifications]',
      },
    };
  }

  /**
   * Get certification data for a report
   */
  async getCertificationData(reportId: string): Promise<ReportCertificationData> {
    const report = await this.getReportWithValuation(reportId);
    const valuer = await this.getActiveValuer(report.valuer_id);
    const property = await this.getProperty(report.property_id);
    const valuation = await this.getValuationData(report.valuation_id);

    const marketValue = Number(valuation?.final_value_ghs || valuation?.estimated_value || 0);
    // FSV is the valuer's figure set on the reconciliation page — NO hardcoded fallback.
    // If neither the stored value nor the discount is set, FSV is omitted (0), not fabricated.
    const fsvDiscountRaw = valuation?.fsv_discount_percent ?? valuation?.recon_fsv_discount;
    const forcedSaleValue = valuation?.force_sale_value != null
      ? Number(valuation.force_sale_value)
      : (fsvDiscountRaw != null ? Math.round(marketValue * (1 - Number(fsvDiscountRaw) / 100)) : 0);
    const effectiveDate = report.effective_date || valuation?.effective_date || new Date();
    // Use exchange rate from reconciliation if available, else fetch for valuation date
    const exchangeRate = valuation?.recon_exchange_rate && Number(valuation.recon_exchange_rate) > 0
      ? { rate: Number(valuation.recon_exchange_rate), source: 'Bank of Ghana', date: new Date(effectiveDate).toISOString().split('T')[0] }
      : await this.getValuationDateExchangeRate(effectiveDate);
    const propertyLocation = this.formatPropertyLocation(property);

    return {
      certification_text: `This is to certify that, I have inspected the subject property situated at ${propertyLocation}${property?.ghana_post_gps ? ` with Ghana Post Digital Address ${property.ghana_post_gps}` : ''} on ${this.formatDateLong(valuation?.inspection_date || new Date())} and can confirm that the following represents my opinion of the Market Value of the freehold/leasehold interest in the property as at the date of inspection and as more fully described in this report.`,
      disclosure: 'I deem it fit to disclose that, I have no present or prospective interest in the subject hereditament.',
      standards_compliance: 'I further certify that the appraisal has been made in conformity with the professional standards of Ghana Institution of Surveyors of which the undersigned is a member in good standing.',
      values_table: {
        market_value: {
          ghs: marketValue,
          usd: Math.round(marketValue / exchangeRate.rate),
        },
        forced_sale_value: {
          ghs: forcedSaleValue,
          usd: Math.round(forcedSaleValue / exchangeRate.rate),
        },
      },
      valuation_date: this.formatDateLong(valuation?.effective_date || new Date()),
      exchange_rate: exchangeRate,
      valuer: {
        name: valuer?.name?.toUpperCase() || '[VALUER NAME]',
        title: valuer?.title || '[Professional Title]',
        qualifications: valuer?.qualifications || '[Qualifications]',
        license_number: valuer?.license_number || null,
        signature_url: valuer?.signature_storage_key || null,
      },
    };
  }

  /**
   * Get disclaimers data for a report
   */
  async getDisclaimersData(reportId: string): Promise<ReportDisclaimersData> {
    const report = await this.getReportWithValuation(reportId);

    // 1. Check if custom disclaimers were saved in report content
    const customDisclaimers = report.content?.disclaimers;
    if (customDisclaimers && Array.isArray(customDisclaimers) && customDisclaimers.length > 0) {
      return {
        title: 'STATEMENT OF LIMITING CONDITIONS',
        conditions: customDisclaimers,
        standards_references: STANDARDS_REFERENCES,
      };
    }

    // 2. Try to load from valuation engagement (valuation methodology)
    const engagement = await this.getEngagement(report.valuation_id);
    if (engagement?.limiting_conditions && Array.isArray(engagement.limiting_conditions) && engagement.limiting_conditions.length > 0) {
      return {
        title: 'STATEMENT OF LIMITING CONDITIONS',
        conditions: engagement.limiting_conditions,
        standards_references: STANDARDS_REFERENCES,
      };
    }

    // 3. No disclaimers configured — return empty so the report can render without fabrication
    logger.warn('No disclaimers/limiting conditions found for report — section will be empty', { reportId });
    return {
      title: 'STATEMENT OF LIMITING CONDITIONS',
      conditions: [],
      standards_references: STANDARDS_REFERENCES,
    };
  }

  /**
   * Get property legal data
   */
  async getPropertyLegal(propertyId: string): Promise<PropertyLegalData> {
    // First check the property_legal table
    const legalResult = await query(
      `SELECT * FROM property_legal WHERE property_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [propertyId]
    );

    // Also get base property data
    const propertyResult = await query(
      `SELECT * FROM properties WHERE id = $1`,
      [propertyId]
    );
    const property = propertyResult.rows[0];

    if (legalResult.rows.length > 0) {
      const legal = legalResult.rows[0];
      const leaseStartDate = legal.lease_start_date ? new Date(legal.lease_start_date) : null;
      const remainingYears = leaseStartDate && legal.lease_term_years
        ? Math.max(0, legal.lease_term_years - Math.floor((Date.now() - leaseStartDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)))
        : null;

      return {
        property_id: propertyId,
        tenure_type: legal.tenure_type || 'freehold',
        tenure_details: {
          lease_term_years: legal.lease_term_years,
          lease_start_date: legal.lease_start_date?.toISOString().split('T')[0] || null,
          remaining_years: remainingYears,
          ground_rent: legal.ground_rent ? parseFloat(legal.ground_rent) : null,
          lessor: legal.lessor,
        },
        title_registration: {
          status: legal.land_title_registered ? 'registered' : 'unregistered',
          reference: legal.registration_number,
          date: null,
        },
        encumbrances: legal.encumbrances || [],
        easements: [],
        planning_zone: property?.zoning || null,
        permitted_uses: [],
        assumptions: legal.assumptions || [],
      };
    }

    // Return defaults from property table
    return {
      property_id: propertyId,
      // Subject form saves tenure into properties.metadata (no tenure_type column exists).
      tenure_type: property?.metadata?.tenure_type || property?.tenure_type || 'freehold',
      tenure_details: {
        // Subject form captures the unexpired term as metadata.lease_years_remaining.
        lease_term_years: property?.metadata?.lease_years_remaining ?? null,
        lease_start_date: null,
        remaining_years: property?.metadata?.lease_years_remaining ?? null,
        ground_rent: property?.metadata?.ground_rent ?? null,
        lessor: property?.metadata?.lessor ?? null,
      },
      title_registration: {
        status: 'unregistered',
        reference: null,
        date: null,
      },
      encumbrances: [],
      easements: [],
      planning_zone: property?.zoning || null,
      permitted_uses: [],
      assumptions: ['Property has been valued as though free from liens and encumbrances'],
    };
  }

  /**
   * Get property construction data
   */
  async getPropertyConstruction(propertyId: string): Promise<PropertyConstructionData> {
    // Check property_construction table
    const constructionResult = await query(
      `SELECT * FROM property_construction WHERE property_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [propertyId]
    );

    // Also get base property data
    const propertyResult = await query(
      `SELECT * FROM properties WHERE id = $1`,
      [propertyId]
    );
    const property = propertyResult.rows[0];

    if (constructionResult.rows.length > 0) {
      const construction = constructionResult.rows[0];
      return {
        property_id: propertyId,
        structure_type: construction.construction_type,
        foundation: null, // Not in current schema
        walls: construction.wall_finish,
        roofing: construction.roof_types,
        flooring: construction.floor_finish,
        ceiling: construction.ceiling_types,
        windows: construction.window_types,
        doors: construction.door_types,
        electrical: construction.electricity_supply,
        plumbing: construction.water_supply,
        hvac: null,
        age_years: property?.year_built ? new Date().getFullYear() - property.year_built : null,
        condition: construction.condition_overall || property?.condition,
        last_renovation_year: null,
        effective_age_years: null,
        fixtures: construction.fixtures || [],
        defects: construction.defects || [],
        structural_notes: construction.structural_notes,
      };
    }

    // Fallback: read from properties.metadata (comprehensive form Chapter 3 data)
    const metadata = property?.metadata || {};
    if (metadata.wall_construction || metadata.floor_finish || metadata.roofing || metadata.ceiling || metadata.doors || metadata.windows) {
      logger.info('Using construction data from properties.metadata (comprehensive form)', { propertyId });
      return {
        property_id: propertyId,
        structure_type: metadata.construction_type || property?.construction_type || null,
        foundation: metadata.foundation || null,
        walls: metadata.wall_construction || null,
        roofing: metadata.roofing || property?.roof_type || null,
        flooring: metadata.floor_finish || property?.floor_type || null,
        ceiling: metadata.ceiling || null,
        windows: metadata.windows || null,
        doors: metadata.doors || null,
        electrical: metadata.services_description || null,
        plumbing: metadata.drainage_sanitation || null,
        hvac: null,
        age_years: property?.year_built ? new Date().getFullYear() - property.year_built : null,
        condition: metadata.condition_state || property?.condition || null,
        last_renovation_year: null,
        effective_age_years: null,
        fixtures: metadata.fixtures_fittings ? [metadata.fixtures_fittings] : [],
        defects: [],
        structural_notes: metadata.brief_description || null,
      };
    }

    // Absolute last resort: basic property table columns only
    logger.warn('No construction data in property_construction table or properties.metadata', { propertyId });
    return {
      property_id: propertyId,
      structure_type: property?.construction_type || null,
      foundation: null,
      walls: null,
      roofing: property?.roof_type || null,
      flooring: property?.floor_type || null,
      ceiling: null,
      windows: null,
      doors: null,
      electrical: null,
      plumbing: null,
      hvac: null,
      age_years: property?.year_built ? new Date().getFullYear() - property.year_built : null,
      condition: property?.condition || null,
      last_renovation_year: null,
      effective_age_years: null,
      fixtures: [],
      defects: [],
      structural_notes: null,
    };
  }

  /**
   * Get property externals data
   */
  async getPropertyExternals(propertyId: string): Promise<PropertyExternalsData> {
    const propertyResult = await query(
      `SELECT * FROM properties WHERE id = $1`,
      [propertyId]
    );
    const property = propertyResult.rows[0];

    return {
      property_id: propertyId,
      grounds: {
        area_sqm: property?.land_area_sqm || null,
        landscaping: property?.landscaping || [],
        boundary_type: property?.boundary_type || null,
        boundary_height_m: property?.boundary_height_m || null,
        access_points: property?.access_points || null,
      },
      external_works: {
        parking_spaces: property?.parking_spaces || null,
        parking_type: property?.parking_type || null,
        drainage_type: property?.drainage_type || null,
        water_storage_capacity_liters: property?.water_storage_capacity || null,
        generator_capacity_kva: property?.generator_capacity || null,
        security_features: property?.security_features || [],
      },
      services: {
        water_supply: property?.water_supply || null,
        electricity_supply: property?.electricity_supply || null,
        sewage_system: property?.sewage_system || null,
        telecom_available: property?.telecom_available ?? true,
        internet_available: property?.internet_available ?? true,
      },
    };
  }

  /**
   * Get property risk assessment data
   */
  async getPropertyRiskAssessment(propertyId: string): Promise<PropertyRiskAssessmentData> {
    const result = await query(
      `SELECT * FROM property_risk_assessments WHERE property_id = $1 ORDER BY assessment_date DESC LIMIT 1`,
      [propertyId]
    );

    if (result.rows.length > 0) {
      const assessment = result.rows[0];
      const items = [
        { item: 'Employment stability', rating: assessment.employment_stability },
        { item: 'Convenience to Employment', rating: assessment.convenience_employment },
        { item: 'Convenience to Shopping', rating: assessment.convenience_shopping },
        { item: 'Convenience to School', rating: assessment.convenience_school },
        { item: 'Adequacy of Public Transportation', rating: assessment.public_transportation },
        { item: 'Adequacy of Utilities', rating: assessment.utilities_adequacy },
        { item: 'Recreation Facilities', rating: assessment.recreation_facilities },
        { item: 'Police & Fire Protection', rating: assessment.police_fire_protection },
        { item: 'Accessibility', rating: assessment.accessibility },
      ].filter(item => item.rating);

      return {
        property_id: propertyId,
        assessment_date: assessment.assessment_date?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
        items: items as any,
        overall_risk_level: assessment.overall_risk_level || 'medium',
        notes: assessment.notes,
      };
    }

    // No record in property_risk_assessments table.
    // Fall back to properties.metadata.risk_assessment (saved from comprehensive form)
    const propertyResult2 = await query(`SELECT metadata FROM properties WHERE id = $1`, [propertyId]);
    const metadata = propertyResult2.rows[0]?.metadata || {};
    const metaRisk = metadata.risk_assessment;

    if (metaRisk && typeof metaRisk === 'object') {
      logger.info('Using risk assessment from properties.metadata (comprehensive form)', { propertyId });
      const items = [
        { item: 'Employment stability', rating: metaRisk.employment_stability },
        { item: 'Convenience to Employment', rating: metaRisk.convenience_employment },
        { item: 'Convenience to Shopping', rating: metaRisk.convenience_shopping },
        { item: 'Convenience to School', rating: metaRisk.convenience_school },
        { item: 'Adequacy of Public Transportation', rating: metaRisk.public_transportation },
        { item: 'Adequacy of Utilities', rating: metaRisk.utilities_adequacy },
        { item: 'Recreation Facilities', rating: metaRisk.recreation_facilities },
        { item: 'Police & Fire Protection', rating: metaRisk.police_fire_protection },
        { item: 'Accessibility', rating: metaRisk.accessibility },
      ].filter(item => item.rating);

      // Derive overall risk from count of 'poor'/'fair' ratings
      const poorCount = items.filter(i => i.rating === 'poor' || i.rating === 'fair').length;
      const overallRisk = poorCount >= 4 ? 'high' : poorCount >= 2 ? 'medium' : 'low';

      return {
        property_id: propertyId,
        assessment_date: new Date().toISOString().split('T')[0],
        items: items as any,
        overall_risk_level: overallRisk as any,
        notes: null,
      };
    }

    // No risk assessment data anywhere
    logger.warn('No risk assessment found in property_risk_assessments or properties.metadata', { propertyId });
    return {
      property_id: propertyId,
      assessment_date: new Date().toISOString().split('T')[0],
      items: [],
      overall_risk_level: 'low' as const,
      notes: 'Risk assessment has not been conducted for this property.',
    };
  }

  /**
   * Get inspection data for a valuation
   */
  async getInspectionData(valuationId: string): Promise<InspectionData> {
    const result = await query(
      `SELECT i.*, u.name as inspector_name, u.qualifications as inspector_qualifications
       FROM valuation_inspections i
       LEFT JOIN valuers u ON i.inspector_id = u.id
       WHERE i.valuation_id = $1
       ORDER BY i.inspection_date DESC LIMIT 1`,
      [valuationId]
    );

    if (result.rows.length > 0) {
      const inspection = result.rows[0];
      return {
        valuation_id: valuationId,
        inspection_date: inspection.inspection_date?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
        inspector: inspection.inspector_name ? {
          name: inspection.inspector_name,
          qualifications: inspection.inspector_qualifications,
        } : null,
        scope: inspection.scope,
        access_notes: inspection.access_notes,
        weather_conditions: inspection.weather_conditions,
        measurement_standard: inspection.measurement_standard || 'RICS Property Measurement 2nd Edition',
        areas_inspected: inspection.areas_inspected || [],
        limitations: inspection.limitations || [
          'Structural tests not conducted',
          'Services not tested',
          'No soil investigation conducted',
        ],
        notes: inspection.notes,
      };
    }

    // No detailed inspection record in valuation_inspections table.
    // Fall back to valuations.inspection_date from the comprehensive data form.
    const valuation = await this.getValuationData(valuationId);
    const valuer = await this.getActiveValuer(valuation?.valuer_id);
    const inspectionDate = valuation?.inspection_date
      ? (valuation.inspection_date instanceof Date
        ? valuation.inspection_date.toISOString().split('T')[0]
        : String(valuation.inspection_date).split('T')[0])
      : null;

    if (inspectionDate) {
      logger.info('Using inspection_date from valuations table (comprehensive form)', { valuationId, inspectionDate });
    } else {
      logger.warn('No inspection date recorded for valuation', { valuationId });
    }

    return {
      valuation_id: valuationId,
      inspection_date: inspectionDate || new Date().toISOString().split('T')[0],
      inspector: valuer ? {
        name: valuer.name,
        qualifications: valuer.qualifications,
      } : null,
      scope: null,
      access_notes: null,
      weather_conditions: null,
      measurement_standard: 'RICS Property Measurement 2nd Edition',
      areas_inspected: [],
      limitations: [],
      notes: inspectionDate ? null : 'Inspection date not recorded.',
    };
  }

  /**
   * Get engagement data for a valuation
   */
  async getEngagementData(valuationId: string): Promise<EngagementData> {
    const engagement = await this.getEngagement(valuationId);
    const valuation = await this.getValuationData(valuationId);

    if (engagement) {
      return {
        valuation_id: valuationId,
        request_type: engagement.request_type || 'commissioned',
        request_date: engagement.request_date?.toISOString().split('T')[0] || null,
        client: {
          name: engagement.client_name || 'Client',
          company: engagement.client_company,
          address: engagement.client_address,
          contact: engagement.client_contact,
        },
        intended_user: {
          name: engagement.intended_user_name,
          relationship: engagement.intended_user_relationship,
          address: engagement.intended_user_address,
        },
        purpose: engagement.purpose || valuation?.purpose || 'Market Value Assessment',
        basis_of_value: engagement.basis_of_value || 'market_value',
        special_assumptions: engagement.special_assumptions || [],
        departures: engagement.departures || [],
      };
    }

    // Return default engagement
    return {
      valuation_id: valuationId,
      request_type: 'commissioned',
      request_date: null,
      client: {
        name: 'Client',
        company: null,
        address: null,
        contact: null,
      },
      intended_user: {
        name: null,
        relationship: null,
        address: null,
      },
      purpose: valuation?.purpose || 'Market Value Assessment',
      basis_of_value: 'market_value',
      special_assumptions: [],
      departures: [],
    };
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  private async getReportWithValuation(reportId: string): Promise<any> {
    const result = await query(
      `SELECT r.*, v.id as valuation_id, v.property_id, v.effective_date, v.final_value_ghs as final_value, v.valuation_purpose as purpose, v.valuer_id
       FROM valuation_reports r
       JOIN valuations v ON r.valuation_id = v.id
       WHERE r.id = $1`,
      [reportId]
    );
    if (result.rows.length === 0) {
      throw new Error(`Report not found: ${reportId}`);
    }
    return result.rows[0];
  }

  private async getValuationData(valuationId: string): Promise<any> {
    const result = await query(
      `SELECT v.*,
              vr.value_range_low as recon_value_low,
              vr.value_range_high as recon_value_high,
              vr.overall_confidence_score as recon_confidence,
              vr.overall_confidence_level as recon_confidence_level,
              vr.exchange_rate_used as recon_exchange_rate,
              vr.method_weights as recon_method_weights,
              vr.method_results as recon_method_results,
              vr.reconciliation_narrative,
              vr.special_assumptions as recon_special_assumptions,
              vr.fsv_discount_percent as recon_fsv_discount,
              vr.force_sale_value as recon_force_sale_value
       FROM valuations v
       LEFT JOIN valuation_reconciliations vr ON vr.valuation_id = v.id
       WHERE v.id = $1`,
      [valuationId]
    );
    return result.rows[0];
  }

  private async getProperty(propertyId: string): Promise<any> {
    const result = await query(
      `SELECT * FROM properties WHERE id = $1`,
      [propertyId]
    );
    return result.rows[0];
  }

  private async getEngagement(valuationId: string): Promise<any> {
    const result = await query(
      `SELECT * FROM valuation_engagements WHERE valuation_id = $1`,
      [valuationId]
    );
    return result.rows[0];
  }

  private async getActiveValuer(valuerId?: string): Promise<any> {
    // First try the specific valuer assigned to the valuation. valuer_id may hold
    // either the valuers row id OR the valuer's user id.
    if (valuerId) {
      const specific = await query(
        `SELECT * FROM valuers WHERE id = $1 OR user_id = $1`,
        [valuerId]
      );
      if (specific.rows.length > 0) {
        return specific.rows[0];
      }
    }
    // No fallback to another registered valuer: a report must never carry the
    // credentials of anyone but the valuer assigned to this valuation.
    return null;
  }

  private formatPropertyLocation(property: any): string {
    if (!property) return 'Property Location';
    const parts = [
      property.address_street,
      property.address_city,
      property.address_state || this.formatRegionName(property.region),
    ].filter(Boolean);
    return parts.join(', ') || property.title || 'Property Location';
  }

  /**
   * Format a snake_case property type into human-readable form.
   * e.g. "residential_house" → "Residential House"
   */
  private formatPropertyType(type: string | null | undefined): string {
    if (!type) return 'Property';
    return type
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  private formatRegionName(region: string | null | undefined): string {
    if (!region) return '';
    const regions: Record<string, string> = {
      greater_accra: 'Greater Accra',
      kumasi_metro: 'Kumasi Metropolitan',
      eastern: 'Eastern Region',
      western_cluster: 'Western Region',
      northern_cluster: 'Northern Region',
      ashanti: 'Ashanti Region',
      central: 'Central Region',
      volta: 'Volta Region',
      western: 'Western Region',
      northern: 'Northern Region',
      upper_east: 'Upper East Region',
      upper_west: 'Upper West Region',
      bono: 'Bono Region',
      bono_east: 'Bono East Region',
      ahafo: 'Ahafo Region',
      savannah: 'Savannah Region',
      north_east: 'North East Region',
      oti: 'Oti Region',
      western_north: 'Western North Region',
    };
    return regions[region.toLowerCase()] || region.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  private formatDate(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }

  private formatDateLong(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  private formatCurrency(amount: number, currency: string = 'GHS'): string {
    const symbol = currency === 'GHS' ? 'GH¢' : 'USD$';
    return `${symbol} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private formatCurrencyWords(amount: number, currency: string): string {
    const symbol = currency === 'GHS' ? 'GH¢' : 'USD$';
    const words = this.numberToWords(amount).toUpperCase();
    const currencyName = currency === 'GHS' ? 'GHANA CEDIS' : 'UNITED STATES DOLLARS';
    return `${words} ${currencyName} [${symbol} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}]`;
  }

  private numberToWords(num: number): string {
    const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    const teens = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];

    // Round to integer to avoid decimal indexing bugs (e.g. ones[7.03] = undefined)
    num = Math.round(num);

    if (num === 0) return 'zero';
    if (num < 0) return 'negative ' + this.numberToWords(-num);

    let words = '';

    if (Math.floor(num / 1000000) > 0) {
      words += this.numberToWords(Math.floor(num / 1000000)) + ' million ';
      num %= 1000000;
    }

    if (Math.floor(num / 1000) > 0) {
      words += this.numberToWords(Math.floor(num / 1000)) + ' thousand ';
      num %= 1000;
    }

    if (Math.floor(num / 100) > 0) {
      words += ones[Math.floor(num / 100)] + ' hundred ';
      num %= 100;
    }

    if (num > 0) {
      if (words !== '') words += 'and ';
      if (num < 10) words += ones[num];
      else if (num < 20) words += teens[num - 10];
      else {
        words += tens[Math.floor(num / 10)];
        if (num % 10 > 0) words += '-' + ones[num % 10];
      }
    }

    return words.trim();
  }

  private generateMethodsSummary(methodResults: any): string {
    // Handle array (methods_applied), object (method_weights/method_results)
    let methods: string[] = [];
    
    if (Array.isArray(methodResults)) {
      methods = methodResults.map(m => m.method || m);
    } else if (methodResults && typeof methodResults === 'object') {
      // Filter out zero-weight methods when using method_weights
      methods = Object.keys(methodResults).filter(k => {
        const val = methodResults[k];
        // If value is a number (weight), exclude zero-weight methods
        if (typeof val === 'number') return val > 0;
        // If value is an object (method_results), include all
        return true;
      });
    }
    
    if (methods.length === 0) {
      return 'The Market Approach to value has been considered in arriving at the Market Value.';
    }

    const methodNames = methods.map(method => {
      switch (method) {
        case 'sales_comparison': return 'Sales Comparison Approach';
        case 'cost_approach': return 'Cost Approach';
        case 'drc_method': return 'Depreciated Replacement Cost Method';
        case 'income_approach': return 'Income Approach';
        case 'profits_method': return 'Profits Method';
        case 'residual_method': return 'Residual Method';
        default: return method;
      }
    });

    if (methodNames.length === 1) {
      return `The ${methodNames[0]} has been considered in arriving at the Market Value.`;
    }

    const last = methodNames.pop();
    return `The ${methodNames.join(', ')} and ${last} have been considered in arriving at the Market Value.`;
  }

  private generateTransmittalBody(engagement: any, property: any): string {
    const purpose = engagement?.purpose || 'Market Value Assessment';
    const neighborhood = property?.neighborhood || property?.address_street || 'the subject location';
    const propertyType = this.formatPropertyType(property?.property_type).toLowerCase();
    const landArea = property?.land_area_sqm ? `${parseFloat(Number(property.land_area_sqm).toFixed(0))} sqm` : '';
    const landRef = landArea ? `${landArea} ` : '';

    return [
      `Pursuant to the REQUEST commissioning me to carry out valuation on the above-named property (hereinafter referred to as "the property"), I have completed the exercise and have the pleasure to present to you the report. A careful inspection of the property located at ${neighborhood} was made giving due consideration to all factors and forces influencing property values. The report is, thus, based on an analysis of general and specific data that influence residential and commercial property value as reported herein.`,
      `The purpose of this valuation is for ${purpose}.`,
      `In my professionally considered opinion, having regard to the Existing Use, State/Condition, location, economic, legal, physical and institutional factors, the value of the respective interest in the subject ${landRef}${propertyType} property located at ${neighborhood} is as stated in the Valuation Summary below.`,
      `It has been a pleasure working on your behalf in this matter. Please feel free to let me know if you desire additional information concerning this report, or if I may be of further assistance to you.`,
    ].join('\n\n');
  }
}

// Export singleton instance
export const reportDataService = new ReportDataService();
