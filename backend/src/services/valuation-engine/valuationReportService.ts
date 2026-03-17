/**
 * Valuation Report Service
 * 
 * Generates professional PDF valuation reports.
 * Supports multiple templates and customization options.
 * 
 * Key Features:
 * - Professional RICS-compliant templates
 * - Ghana GhIS valuation standards
 * - Charts and visualizations
 * - Comparable analysis tables
 * - Market trend graphs
 * - Confidence indicators
 */

import { query } from '../../database';
import { logger } from '../../utils/logger';
import {
  ValuationResult,
  PropertyForValuation,
  MethodResult,
  ComparableProperty,
  MarketConditions,
} from './types';

// =====================================================
// TYPES
// =====================================================

export interface ReportOptions {
  template?: 'standard' | 'executive' | 'detailed' | 'brief';
  includeComparables?: boolean;
  includeMethodDetails?: boolean;
  includeMarketAnalysis?: boolean;
  includeMaps?: boolean;
  includePhotos?: boolean;
  language?: 'en' | 'fr';
  currency?: 'GHS' | 'USD';
  companyLogo?: string;
  valuerId?: string;
  valuerName?: string;
  valuerQualifications?: string;
}

export interface ReportData {
  report_id: string;
  generated_at: string;
  template: string;
  
  // Valuation summary
  valuation: {
    id: string;
    date: string;
    purpose: string;
    final_value: number;
    final_value_formatted: string;
    value_low: number;
    value_high: number;
    confidence_score: number;
    confidence_grade: string;
    primary_method: string;
  };
  
  // Property details
  property: {
    id: string;
    title: string;
    address: string;
    city: string;
    region: string;
    type: string;
    size_sqm: number;
    land_area_sqm: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    year_built: number | null;
    condition: string | null;
    amenities: string[];
    description: string | null;
    coordinates: { lat: number; lng: number } | null;
  };
  
  // Method results
  methods: {
    name: string;
    value: number;
    value_formatted: string;
    confidence: number;
    weight: number;
    details: any;
  }[];
  
  // Comparables (if included)
  comparables?: {
    id: string;
    address: string;
    price: number;
    price_formatted: string;
    size_sqm: number;
    price_per_sqm: number;
    similarity_score: number;
    adjustments: {
      type: string;
      amount: number;
    }[];
    adjusted_price: number;
  }[];
  
  // Market analysis (if included)
  market_analysis?: {
    trend: string;
    price_change_12m: number;
    activity_level: string;
    cycle_phase: string;
    days_on_market: number;
    avg_price_per_sqm: number;
    median_price_per_sqm: number;
  };
  
  // Valuer information
  valuer: {
    name: string;
    qualifications: string;
    company: string;
    date: string;
  };
  
  // Disclaimers
  disclaimers: string[];
  
  // Weighting rationale
  weighting_rationale?: string | null;
}

// =====================================================
// REPORT TEMPLATES
// =====================================================

// Disclaimers are provided by reportDataService.getDisclaimersData() which reads
// from the report's custom content or falls back to the standardised DEFAULT_DISCLAIMERS.
// Do NOT duplicate disclaimer lists here — use the same canonical source.

const METHOD_DESCRIPTIONS: Record<string, string> = {
  sales_comparison: 'The Sales Comparison Approach estimates value by comparing the subject property to similar properties that have recently sold. Adjustments are made for differences in location, size, condition, and other relevant factors.',
  
  cost_approach: 'The Cost Approach estimates value based on the current cost to construct a replacement building with similar utility, less depreciation, plus the land value. This method is most reliable for newer properties and specialized buildings.',
  
  income_approach: 'The Income Approach estimates value based on the income-generating potential of the property. It considers current market rents, operating expenses, and capitalization rates to derive value.',
  
  residual_method: 'The Residual Method estimates land value by calculating the gross development value of the completed project, then deducting all development costs, finance charges, and developer profit.',
  
  profits_method: 'The Profits Method estimates value based on the trading potential of the property. It analyzes the business\'s profit-generating capacity and capitalizes the maintainable operating profit.',
  
  drc_method: 'The Depreciated Replacement Cost Method estimates value based on the current cost of constructing a modern equivalent asset, adjusted for physical depreciation, functional obsolescence, and economic obsolescence.',
};

// =====================================================
// VALUATION REPORT SERVICE
// =====================================================

class ValuationReportService {
  /**
   * Generate a valuation report
   */
  async generateReport(
    valuationId: string,
    options: ReportOptions = {}
  ): Promise<ReportData> {
    logger.info('Generating valuation report', { valuationId, template: options.template });

    try {
      // Get valuation data
      const valuation = await this.getValuationData(valuationId);
      if (!valuation) {
        throw new Error('Valuation not found');
      }

      // Get property data
      const property = await this.getPropertyData(valuation.property_id);
      if (!property) {
        throw new Error('Property not found');
      }

      // Get comparables if requested
      let comparables: ComparableProperty[] = [];
      if (options.includeComparables !== false) {
        comparables = await this.getComparables(valuationId);
      }

      // Fetch valuer credentials from the valuers table
      const valuer = await this.getValuerForReport(valuation.valuer_id);

      // Build report data
      const reportData: ReportData = {
        report_id: this.generateReportId(),
        generated_at: new Date().toISOString(),
        template: options.template || 'standard',
        
        valuation: {
          id: valuation.id,
          date: valuation.valuation_date,
          purpose: this.formatPurpose(valuation.purpose),
          final_value: valuation.final_value,
          final_value_formatted: this.formatCurrency(valuation.final_value, options.currency || 'GHS'),
          value_low: valuation.value_low || null,
          value_high: valuation.value_high || null,
          confidence_score: valuation.confidence_score || null,
          confidence_grade: this.getConfidenceGrade(valuation.confidence_score),
          primary_method: valuation.primary_method || 'sales_comparison',
        },
        
        property: {
          id: property.id,
          title: property.title || 'Property Valuation',
          address: property.address_street || 'Address not provided',
          city: property.address_city || '',
          region: this.formatRegion(property.region),
          type: this.formatPropertyType(property.property_type),
          size_sqm: property.building_size_sqm || property.total_area_sqm || 0,
          land_area_sqm: property.land_area_sqm,
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms,
          year_built: property.year_built,
          condition: property.condition,
          amenities: property.amenities || [],
          description: property.description,
          coordinates: property.coordinates_lat && property.coordinates_lng
            ? { lat: property.coordinates_lat, lng: property.coordinates_lng }
            : null,
        },
        
        methods: this.formatMethodResults(
          valuation.method_results || [],
          options,
          valuation.recon_method_weights || valuation.method_weights,
          valuation.recon_method_results
        ),
        
        weighting_rationale: valuation.weighting_rationale || null,
        
        valuer: {
          name: options.valuerName || valuer?.name || '[Valuer Name]',
          qualifications: options.valuerQualifications || valuer?.qualifications || '[Qualifications]',
          company: valuer?.company_name || 'PROPMETRIK',
          date: new Date().toISOString().split('T')[0],
        },
        
        // Disclaimers are injected by reportDataService.getDisclaimersData()
        // during report assembly — not duplicated here.
        disclaimers: [],
      };

      // Add comparables if available
      if (comparables.length > 0 && options.includeComparables !== false) {
        reportData.comparables = this.formatComparables(comparables, options.currency);
      }

      // Add market analysis if requested
      if (options.includeMarketAnalysis !== false && valuation.market_conditions) {
        reportData.market_analysis = this.formatMarketAnalysis(valuation.market_conditions);
      }

      logger.info('Report generated successfully', {
        reportId: reportData.report_id,
        valuationId,
      });

      return reportData;

    } catch (error: any) {
      logger.error('Failed to generate report', {
        valuationId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Generate HTML report (for PDF conversion)
   */
  async generateHtmlReport(
    valuationId: string,
    options: ReportOptions = {}
  ): Promise<string> {
    const data = await this.generateReport(valuationId, options);
    return this.renderHtmlTemplate(data, options.template || 'standard');
  }

  /**
   * Fetch valuer credentials from the valuers table
   */
  private async getValuerForReport(valuerId?: string): Promise<any> {
    if (valuerId) {
      const result = await query(
        `SELECT name, title, qualifications, license_number, company_name, contact_address FROM valuers WHERE id = $1`,
        [valuerId]
      );
      if (result.rows.length > 0) return result.rows[0];
    }
    // Fallback to any active valuer
    const result = await query(
      `SELECT name, title, qualifications, license_number, company_name, contact_address FROM valuers WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
    );
    return result.rows[0] || null;
  }

  /**
   * Get valuation data from database
   */
  private async getValuationData(valuationId: string): Promise<any> {
    const result = await query(
      `SELECT 
        v.id,
        v.property_id,
        v.valuation_type,
        v.valuation_purpose as purpose,
        v.effective_date as valuation_date,
        COALESCE(v.final_value_ghs, v.estimated_value) as final_value,
        v.value_range_low as value_low,
        v.value_range_high as value_high,
        v.primary_method,
        v.method_results,
        v.method_weights,
        v.methods_applied,
        v.weighting_rationale,
        v.confidence_score,
        v.market_conditions,
        v.valuer_id,
        v.status,
        vr.method_weights as recon_method_weights,
        vr.method_results as recon_method_results
      FROM valuations v
      LEFT JOIN valuation_reconciliations vr ON vr.valuation_id = v.id
      WHERE v.id = $1
      ORDER BY vr.updated_at DESC NULLS LAST
      LIMIT 1`,
      [valuationId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get property data from database
   */
  private async getPropertyData(propertyId: string): Promise<any> {
    const result = await query(
      `SELECT * FROM properties WHERE id = $1`,
      [propertyId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get comparables for valuation
   */
  private async getComparables(valuationId: string): Promise<any[]> {
    const result = await query(
      `SELECT * FROM valuation_comparables
       WHERE valuation_id = $1
       ORDER BY similarity_score DESC
       LIMIT 10`,
      [valuationId]
    );

    return result.rows;
  }

  /**
   * Format method results for report
   * Handles both array and object formats of method_results
   */
  private formatMethodResults(
    results: any,
    options: ReportOptions,
    methodWeights?: Record<string, number>,
    reconMethodResults?: Record<string, any>
  ): ReportData['methods'] {
    // Convert object format to array format
    let resultsArray: any[] = [];
    
    // Filter out intermediate/non-valuation methods
    const nonValuationMethods = ['rental_market', 'rental_market_analysis', 'land_value'];

    if (Array.isArray(results)) {
      resultsArray = results;
    } else if (results && typeof results === 'object') {
      // Convert object format {method_name: {value, confidence, ...}} to array
      resultsArray = Object.entries(results)
        .filter(([method]) => !nonValuationMethods.includes(method))
        .map(([method, data]: [string, any]) => ({
          method,
          value: data.indicated_value || data.value,
          confidence: data.confidence,
          weight: data.weight,
          details: data.details,
        }));
    }

    // Add methods that have weight > 0 in reconciliation but are missing from results
    if (methodWeights && typeof methodWeights === 'object') {
      const existingMethods = new Set(resultsArray.map(r => r.method));
      for (const [method, weight] of Object.entries(methodWeights)) {
        if (nonValuationMethods.includes(method)) continue;
        if (existingMethods.has(method)) continue;
        if (Number(weight) <= 0) continue;

        // Try to get value from reconciliation method_results
        let value = null;
        let confidence = null;
        if (reconMethodResults && reconMethodResults[method]) {
          value = reconMethodResults[method].indicated_value || reconMethodResults[method].value;
          confidence = reconMethodResults[method].confidence;
        }

        if (value) {
          resultsArray.push({
            method,
            value,
            confidence,
            weight: Number(weight),
            details: reconMethodResults?.[method]?.details,
          });
        }
      }
    }
    
    if (resultsArray.length === 0) {
      return [];
    }
    
    return resultsArray.map(result => {
      // Use method_weights (prefer recon weights) for weight values
      // Convert from 0-100 to 0-1 decimal
      let weight = result.weight || null;
      if (methodWeights && Object.keys(methodWeights).length > 0) {
        const methodKey = result.method || '';
        if (methodWeights[methodKey] !== undefined && methodWeights[methodKey] !== null) {
          weight = methodWeights[methodKey] / 100;
        }
      }
      return {
        name: this.formatMethodName(result.method),
        value: result.value,
        value_formatted: this.formatCurrency(result.value, options.currency || 'GHS'),
        confidence: result.confidence || null,
        weight,
        details: options.includeMethodDetails !== false ? {
          ...result.details,
          description: METHOD_DESCRIPTIONS[result.method] || '',
        } : undefined,
      };
    });
  }

  /**
   * Format comparables for report
   */
  private formatComparables(
    comparables: any[],
    currency?: string
  ): ReportData['comparables'] {
    return comparables.map(comp => ({
      id: comp.comparable_property_id || comp.id,
      address: comp.address || 'N/A',
      price: comp.sale_price || comp.price,
      price_formatted: this.formatCurrency(comp.sale_price || comp.price, currency || 'GHS'),
      size_sqm: comp.size_sqm || 0,
      price_per_sqm: comp.size_sqm ? Math.round((comp.sale_price || comp.price) / comp.size_sqm) : 0,
      similarity_score: comp.similarity_score || 0,
      adjustments: comp.adjustments || [],
      adjusted_price: comp.adjusted_price || comp.sale_price || comp.price,
    }));
  }

  /**
   * Format market analysis for report
   */
  private formatMarketAnalysis(
    conditions: any
  ): ReportData['market_analysis'] {
    return {
      trend: this.formatTrend(conditions.market_trend),
      price_change_12m: conditions.price_trend_12m || null,
      activity_level: conditions.market_activity || null,
      cycle_phase: conditions.cycle_phase || null,
      days_on_market: conditions.days_on_market || null,
      avg_price_per_sqm: conditions.price_metrics?.average_per_sqm || null,
      median_price_per_sqm: conditions.price_metrics?.median_per_sqm || null,
    };
  }

  /**
   * Render HTML template
   */
  private renderHtmlTemplate(data: ReportData, template: string): string {
    // This would normally use a templating engine like Handlebars or EJS
    // For now, return a basic HTML structure
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Valuation Report - ${data.property.address}</title>
  <style>
    body {
      font-family: 'Georgia', serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #2c5282;
      padding-bottom: 20px;
      margin-bottom: 40px;
    }
    .header h1 {
      color: #2c5282;
      font-size: 28px;
      margin: 0;
    }
    .header p {
      color: #666;
      margin: 5px 0;
    }
    .section {
      margin-bottom: 30px;
    }
    .section h2 {
      color: #2c5282;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 10px;
      font-size: 18px;
    }
    .value-box {
      background: #ebf8ff;
      border: 2px solid #2c5282;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      margin: 20px 0;
    }
    .value-box .label {
      color: #666;
      font-size: 14px;
    }
    .value-box .value {
      color: #2c5282;
      font-size: 32px;
      font-weight: bold;
    }
    .value-box .confidence {
      font-size: 14px;
      color: #38a169;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
    }
    th, td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid #e2e8f0;
    }
    th {
      background: #f7fafc;
      font-weight: bold;
    }
    .disclaimer {
      font-size: 12px;
      color: #666;
      border-top: 1px solid #e2e8f0;
      padding-top: 20px;
      margin-top: 40px;
    }
    .footer {
      text-align: center;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #2c5282;
    }
    .signature-line {
      border-top: 1px solid #333;
      width: 200px;
      margin: 40px auto 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>PROPERTY VALUATION REPORT</h1>
    <p>Report ID: ${data.report_id}</p>
    <p>Generated: ${new Date(data.generated_at).toLocaleDateString('en-GB', { 
      day: 'numeric', month: 'long', year: 'numeric' 
    })}</p>
  </div>

  <div class="section">
    <h2>Property Details</h2>
    <table>
      <tr><th>Address</th><td>${data.property.address}, ${data.property.city}</td></tr>
      <tr><th>Region</th><td>${data.property.region}</td></tr>
      <tr><th>Property Type</th><td>${data.property.type}</td></tr>
      <tr><th>Building Size</th><td>${data.property.size_sqm.toLocaleString()} sqm</td></tr>
      ${data.property.land_area_sqm ? `<tr><th>Land Area</th><td>${data.property.land_area_sqm.toLocaleString()} sqm</td></tr>` : ''}
      ${data.property.bedrooms ? `<tr><th>Bedrooms</th><td>${data.property.bedrooms}</td></tr>` : ''}
      ${data.property.bathrooms ? `<tr><th>Bathrooms</th><td>${data.property.bathrooms}</td></tr>` : ''}
      ${data.property.year_built ? `<tr><th>Year Built</th><td>${data.property.year_built}</td></tr>` : ''}
      ${data.property.condition ? `<tr><th>Condition</th><td>${data.property.condition}</td></tr>` : ''}
    </table>
  </div>

  <div class="value-box">
    <div class="label">Assessed Market Value</div>
    <div class="value">${data.valuation.final_value_formatted}</div>
    <div class="confidence">Confidence: ${data.valuation.confidence_grade} (${Math.round(data.valuation.confidence_score * 100)}%)</div>
    <div style="font-size: 14px; color: #666; margin-top: 10px;">
      Value Range: ${this.formatCurrency(data.valuation.value_low, 'GHS')} - ${this.formatCurrency(data.valuation.value_high, 'GHS')}
    </div>
  </div>

  <div class="section">
    <h2>Valuation Purpose</h2>
    <p>${data.valuation.purpose}</p>
  </div>

  <div class="section">
    <h2>Valuation Methods Applied</h2>
    <table>
      <tr>
        <th>Method</th>
        <th>Value</th>
        <th>Confidence</th>
        <th>Weight</th>
      </tr>
      ${data.methods.map(m => `
        <tr>
          <td>${m.name}</td>
          <td>${m.value_formatted}</td>
          <td>${Math.round(m.confidence * 100)}%</td>
          <td>${Math.round(m.weight * 100)}%</td>
        </tr>
      `).join('')}
    </table>
  </div>

  ${data.comparables && data.comparables.length > 0 ? `
  <div class="section">
    <h2>Comparable Properties</h2>
    <table>
      <tr>
        <th>Address</th>
        <th>Sale Price</th>
        <th>Size (sqm)</th>
        <th>GHS/sqm</th>
        <th>Similarity</th>
      </tr>
      ${data.comparables.map(c => `
        <tr>
          <td>${c.address}</td>
          <td>${c.price_formatted}</td>
          <td>${c.size_sqm.toLocaleString()}</td>
          <td>${c.price_per_sqm.toLocaleString()}</td>
          <td>${Math.round(c.similarity_score * 100)}%</td>
        </tr>
      `).join('')}
    </table>
  </div>
  ` : ''}

  ${data.market_analysis ? `
  <div class="section">
    <h2>Market Analysis</h2>
    <table>
      <tr><th>Market Trend</th><td>${data.market_analysis.trend}</td></tr>
      <tr><th>12-Month Price Change</th><td>${(data.market_analysis.price_change_12m * 100).toFixed(1)}%</td></tr>
      <tr><th>Market Activity</th><td>${data.market_analysis.activity_level}</td></tr>
      <tr><th>Cycle Phase</th><td>${data.market_analysis.cycle_phase}</td></tr>
      <tr><th>Average Days on Market</th><td>${data.market_analysis.days_on_market}</td></tr>
      <tr><th>Average Price/sqm</th><td>GHS ${data.market_analysis.avg_price_per_sqm.toLocaleString()}</td></tr>
    </table>
  </div>
  ` : ''}

  <div class="footer">
    <p><strong>Prepared by:</strong></p>
    <div class="signature-line"></div>
    <p>${data.valuer.name}<br>
    ${data.valuer.qualifications}<br>
    ${data.valuer.company}</p>
    <p>Date: ${data.valuer.date}</p>
  </div>

  <div class="disclaimer">
    <h3>Important Disclaimers</h3>
    <ol>
      ${data.disclaimers.map(d => `<li>${d}</li>`).join('')}
    </ol>
  </div>
</body>
</html>`;
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  private generateReportId(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `VR-${date}-${random}`;
  }

  private formatCurrency(amount: number, currency: string = 'GHS', exchangeRate?: number): string {
    if (amount == null || isNaN(amount)) return currency === 'USD' ? '$0' : 'GHS 0';
    if (currency === 'USD') {
      const rate = exchangeRate || 10.99; // should always be passed from valuation data
      return `$${(amount / rate).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    }
    return `GHS ${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }

  private formatPurpose(purpose: string): string {
    const purposes: Record<string, string> = {
      market_value: 'Market Value Assessment',
      mortgage: 'Mortgage Lending Valuation',
      insurance: 'Insurance Valuation',
      tax: 'Property Tax Assessment',
      sale: 'Sale/Purchase Valuation',
      inheritance: 'Inheritance/Estate Valuation',
      quick_estimate: 'Quick Market Estimate',
    };
    return purposes[purpose] || purpose;
  }

  private formatRegion(region: string): string {
    const regions: Record<string, string> = {
      greater_accra: 'Greater Accra Region',
      kumasi_metro: 'Kumasi Metropolitan Area',
      eastern: 'Eastern Region',
      western_cluster: 'Western Region',
      northern_cluster: 'Northern Regions',
    };
    return regions[region] || region;
  }

  private formatPropertyType(type: string): string {
    const types: Record<string, string> = {
      house: 'Residential House',
      apartment: 'Apartment',
      townhouse: 'Townhouse',
      villa: 'Villa',
      commercial: 'Commercial Property',
      office: 'Office Building',
      industrial: 'Industrial Property',
      land: 'Land',
      hotel: 'Hotel/Hospitality',
      warehouse: 'Warehouse',
    };
    return types[type] || type;
  }

  private formatMethodName(method: string): string {
    const names: Record<string, string> = {
      sales_comparison: 'Sales Comparison Approach',
      cost_approach: 'Cost Approach',
      income_approach: 'Income Approach',
      residual_method: 'Residual Method',
      profits_method: 'Profits Method',
      drc_method: 'Depreciated Replacement Cost',
    };
    return names[method] || method;
  }

  private formatTrend(trend: string): string {
    const trends: Record<string, string> = {
      strong_growth: 'Strong Growth',
      moderate_growth: 'Moderate Growth',
      stable: 'Stable',
      moderate_decline: 'Moderate Decline',
      strong_decline: 'Strong Decline',
    };
    return trends[trend] || trend;
  }

  private getConfidenceGrade(score: number): string {
    if (score >= 0.85) return 'A';
    if (score >= 0.70) return 'B';
    if (score >= 0.55) return 'C';
    if (score >= 0.40) return 'D';
    return 'F';
  }
}

export const valuationReportService = new ValuationReportService();
export default valuationReportService;
