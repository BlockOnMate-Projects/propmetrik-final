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
import { valuationReportService } from './valuationReportService';

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

const DEFAULT_DISCLAIMERS = [
  'This valuation is premised on a proposed fifty (50) year lease hold interest where applicable',
  'The property has been valued as though free from liens and encumbrances other than those contained in the deeds of records',
  'No liability is to be assumed for matters legal in nature nor is any opinion of title rendered by this report',
  'The capital value of the subject property is assumed to be on all cash basis',
  'The valuer by this report is not required to give testimony in court with reference to the property in question unless prior arrangements have been agreed upon',
  'The physical condition of the improvements and the soil characteristics were based on visual inspection only',
  'Sketches are accurate only for purposes of approximation',
  'Possession of any copy of this report does not carry with it the right to publication or use for any purpose by any other than the addressee without the written consent of the appraiser',
];

const STANDARDS_REFERENCES = [
  { code: 'RICS', name: 'RICS Valuation – Global Standards (Red Book)', year: 2022 },
  { code: 'IVS', name: 'International Valuation Standards', year: 2022 },
  { code: 'GhIS', name: 'Ghana Institution of Surveyors Valuation Standards', year: 2020 },
];

const DEFAULT_EXCHANGE_RATE = {
  rate: 15.65,
  source: 'Bank of Ghana',
  date: new Date().toISOString().split('T')[0],
};

// =====================================================
// REPORT DATA SERVICE
// =====================================================

class ReportDataService {
  
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

    // Get valuer data
    const valuerResult = await query(
      `SELECT * FROM valuers WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
    );
    const valuer = valuerResult.rows[0];

    const propertyLocation = this.formatPropertyLocation(property);

    return {
      title: 'VALUATION REPORT',
      subtitle: `ON ${(property?.title || 'PROPERTY').toUpperCase()}`,
      property_location: propertyLocation,
      ghana_post_address: property?.ghana_post_gps || null,
      requested_by: {
        name: engagement?.client_name || 'Client',
        company: engagement?.client_company || null,
        address: engagement?.client_address || 'Address not provided',
      },
      prepared_for: {
        name: engagement?.intended_user_name || engagement?.client_name || 'Client',
        relationship: engagement?.intended_user_relationship || null,
        address: engagement?.intended_user_address || engagement?.client_address || '',
      },
      certified_by: {
        name: valuer?.name || 'Certified Valuer',
        qualifications: valuer?.qualifications || 'BSc., MGhIS',
        title: valuer?.title || 'Valuation & Estate Surveyor',
        license_number: valuer?.license_number || null,
        address: valuer?.contact_address || 'PropMetrik Ghana',
      },
      date: this.formatDate(report.effective_date || new Date()),
      company_logo_url: null, // TODO: Add company logo support
    };
  }

  /**
   * Get transmittal letter data for a report
   */
  async getTransmittalData(reportId: string): Promise<ReportTransmittalData> {
    const report = await this.getReportWithValuation(reportId);
    const engagement = await this.getEngagement(report.valuation_id);
    const valuer = await this.getActiveValuer();
    const property = await this.getProperty(report.property_id);
    const valuation = await this.getValuationData(report.valuation_id);

    const marketValue = valuation?.final_value_ghs || valuation?.estimated_value || 0;
    const forcedSaleValue = Math.round(marketValue * 0.7); // 70% of market value
    const exchangeRate = DEFAULT_EXCHANGE_RATE;

    const methodsSummary = this.generateMethodsSummary(valuation?.method_results || []);

    return {
      recipient: {
        name: engagement?.client_name || 'Client',
        company: engagement?.client_company || null,
        address: engagement?.client_address || '',
      },
      date: new Date().toISOString().split('T')[0],
      date_formatted: this.formatDateLong(new Date()),
      subject: `RE: ${(property?.property_type || 'PROPERTY').toUpperCase()} (${(property?.title || 'SUBJECT PROPERTY').toUpperCase()}) ON PLOT OF LAND SITUATE AT ${this.formatPropertyLocation(property).toUpperCase()}`,
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
        name: valuer?.name || 'Certified Valuer',
        title: valuer?.title || 'Valuation & Estate Surveyor',
        qualifications: valuer?.qualifications || 'BSc., MGhIS',
      },
    };
  }

  /**
   * Get certification data for a report
   */
  async getCertificationData(reportId: string): Promise<ReportCertificationData> {
    const report = await this.getReportWithValuation(reportId);
    const valuer = await this.getActiveValuer();
    const property = await this.getProperty(report.property_id);
    const valuation = await this.getValuationData(report.valuation_id);

    const marketValue = valuation?.final_value_ghs || valuation?.estimated_value || 0;
    const forcedSaleValue = Math.round(marketValue * 0.7);
    const exchangeRate = DEFAULT_EXCHANGE_RATE;
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
        name: valuer?.name?.toUpperCase() || 'CERTIFIED VALUER',
        title: valuer?.title || 'Valuation & Estate Surveyor',
        qualifications: valuer?.qualifications || 'BSc., MGhIS',
        license_number: valuer?.license_number || null,
        signature_url: valuer?.signature_storage_key || null,
      },
    };
  }

  /**
   * Get disclaimers data for a report
   */
  async getDisclaimersData(reportId: string): Promise<ReportDisclaimersData> {
    // Could potentially load custom disclaimers from report content
    const report = await this.getReportWithValuation(reportId);
    const customDisclaimers = report.content?.disclaimers;

    return {
      title: 'STATEMENT OF LIMITING CONDITIONS',
      conditions: customDisclaimers || DEFAULT_DISCLAIMERS,
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
      tenure_type: property?.tenure_type || 'freehold',
      tenure_details: {
        lease_term_years: null,
        lease_start_date: null,
        remaining_years: null,
        ground_rent: null,
        lessor: null,
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

    // Return data from property table
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

    // Return default assessment
    return {
      property_id: propertyId,
      assessment_date: new Date().toISOString().split('T')[0],
      items: [
        { item: 'Employment stability', rating: 'good' },
        { item: 'Convenience to Employment', rating: 'good' },
        { item: 'Convenience to Shopping', rating: 'average' },
        { item: 'Convenience to School', rating: 'average' },
        { item: 'Adequacy of Public Transportation', rating: 'good' },
        { item: 'Adequacy of Utilities', rating: 'good' },
        { item: 'Recreation Facilities', rating: 'average' },
        { item: 'Police & Fire Protection', rating: 'good' },
        { item: 'Accessibility', rating: 'good' },
      ],
      overall_risk_level: 'low',
      notes: null,
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

    // Return default inspection data
    return {
      valuation_id: valuationId,
      inspection_date: new Date().toISOString().split('T')[0],
      inspector: null,
      scope: 'Full physical inspection of the property',
      access_notes: 'Full access was granted to all areas of the property',
      weather_conditions: 'Clear',
      measurement_standard: 'RICS Property Measurement 2nd Edition',
      areas_inspected: ['All accessible areas of the property'],
      limitations: [
        'Structural tests not conducted',
        'Services not tested',
        'No soil investigation conducted',
      ],
      notes: null,
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
      `SELECT r.*, v.id as valuation_id, v.property_id, v.effective_date, v.final_value_ghs as final_value, v.valuation_purpose as purpose
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
      `SELECT * FROM valuations WHERE id = $1`,
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

  private async getActiveValuer(): Promise<any> {
    const result = await query(
      `SELECT * FROM valuers WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
    );
    return result.rows[0];
  }

  private formatPropertyLocation(property: any): string {
    if (!property) return 'Property Location';
    const parts = [
      property.address_street,
      property.address_city,
      property.address_state || property.region,
    ].filter(Boolean);
    return parts.join(', ') || property.title || 'Property Location';
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
    // Handle both array and object formats
    let methods: string[] = [];
    
    if (Array.isArray(methodResults)) {
      methods = methodResults.map(m => m.method || m);
    } else if (methodResults && typeof methodResults === 'object') {
      methods = Object.keys(methodResults);
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
    const requestType = engagement?.request_type || 'commissioned';
    const purpose = engagement?.purpose || 'Market Value Assessment';

    return `Pursuant to the ${requestType.toUpperCase()} commissioning me to carry out valuation on the above-named property, I wish to submit for your kind perusal and retention, my formal valuation report.\n\nThe purpose of this valuation is for ${purpose}.`;
  }
}

// Export singleton instance
export const reportDataService = new ReportDataService();
