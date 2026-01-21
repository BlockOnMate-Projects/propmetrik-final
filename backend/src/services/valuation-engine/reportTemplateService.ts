/**
 * Report Template Service
 * 
 * Handles loading and rendering of GhIS/RICS compliant report templates
 * with dynamic data injection from valuations.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger';
import { pool } from '../../database';
import { economicDataService } from '../data-hub/economicDataService';
import { GHANA_GPS_DISTRICTS } from '../data-hub/ghanaPostGeocodingService';
import { floorPlanService } from './floorPlanService';

// Template paths - resolve relative to this service file
// Templates are now in ./report-templates (same directory as this service)
function getTemplatesDir(): string {
  // Templates are co-located with the valuation-engine services
  const possiblePaths = [
    path.join(__dirname, 'report-templates'),                     // Direct sibling folder
    path.join(__dirname, '../report-templates'),                  // Parent folder when in dist
    path.resolve(process.cwd(), 'src/services/valuation-engine/report-templates'),   // From project root
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      logger.debug('Found templates directory', { path: p });
      return p;
    }
  }
  
  // Default fallback
  return path.resolve(process.cwd(), 'src/services/valuation-engine/report-templates');
}

interface ReportTemplate {
  template_id: string;
  name: string;
  version: string;
  sections: TemplateSection[];
}

interface TemplateSection {
  id: string;
  title: string;
  order: number;
  content: string;
}

interface MethodTemplate {
  id: string;
  name: string;
  description: string;
  when_to_use: string;
  template: string;
}

interface MethodsTemplateFile {
  methods: Record<string, MethodTemplate>;
}

interface ReportData {
  valuation: any;
  property: any;
  client: any;
  valuer: any;
  reconciliation: any;
  floor_plans: any[];
  comparables: any[];
  hbu: any;
  methods_used: any[];
  riskAssessment: any;
}

class ReportTemplateService {
  private templateCache: Map<string, ReportTemplate> = new Map();
  private methodsCache: MethodsTemplateFile | null = null;
  private templatesDir: string | null = null;

  /**
   * Get templates directory (lazy-loaded)
   */
  private getTemplatesDir(): string {
    // Templates are now co-located with valuation-engine services
    const hardcodedSrcPath = path.join(__dirname, 'report-templates');
    if (fs.existsSync(hardcodedSrcPath)) {
        this.templatesDir = hardcodedSrcPath;
        return this.templatesDir;
    }

    if (!this.templatesDir) {
      this.templatesDir = getTemplatesDir();
    }
    return this.templatesDir;
  }

  /**
   * Load a report template by ID
   */
  async loadTemplate(templateId: string): Promise<ReportTemplate> {
    // Check cache
    if (this.templateCache.has(templateId)) {
      return this.templateCache.get(templateId)!;
    }

    // Special handling for modular templates
    if (templateId === 'modular' || templateId === 'palm_lands' || templateId === 'ghis_standard' || templateId === 'ghis-standard') {
      try {
        const template = this.loadModularTemplate();
        // Preserve the requested ID so it matches cache/expectations
        template.template_id = templateId;
        this.templateCache.set(templateId, template);
        return template;
      } catch (e: any) {
        logger.warn('Failed to load modular template, falling back to file', { error: e.message });
      }
    }

    const templatePath = path.join(this.getTemplatesDir(), `${templateId}.json`);
    
    try {
      logger.debug('Loading template', { templatePath });
      const content = fs.readFileSync(templatePath, 'utf-8');
      const template = JSON.parse(content) as ReportTemplate;
      this.templateCache.set(templateId, template);
      return template;
    } catch (error: any) {
      // If allowed modular fallback
      if (templateId === 'ghis_standard') {
           try {
             logger.info('Falling back to modular sections for ghis_standard');
             const template = this.loadModularTemplate();
             this.templateCache.set(templateId, template);
             return template;
           } catch (modularError) {
             // Ignore and throw original error
           }
      }
      
      logger.error('Failed to load template', { templateId, templatePath, error: error.message });
      throw new Error(`Template not found: ${templateId}`);
    }
  }

  /**
   * Load modular template from sections directory
   */
  private loadModularTemplate(): ReportTemplate {
    const sectionsDir = path.join(this.getTemplatesDir(), 'sections');
    
    if (!fs.existsSync(sectionsDir)) {
      logger.error('Modular template directory missing', { sectionsDir });
      throw new Error(`Sections directory not found: ${sectionsDir}`);
    }

    const files = fs.readdirSync(sectionsDir)
      .filter(file => file.endsWith('.json'))
      .sort(); // Sort by filename (01_..., 02_...)

    logger.debug('Loading modular sections', { files });

    const sections: TemplateSection[] = [];

    for (const file of files) {
      const filePath = path.join(sectionsDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const section = JSON.parse(content) as TemplateSection;
        // Fix potential missing properties
        if (!section.title || !section.content) {
             logger.warn('Section file missing required props', { file });
        }
        sections.push(section);
      } catch (e: any) {
        logger.error(`Failed to load template section ${file}`, { error: e.message });
        throw new Error(`Failed to parse section file: ${file}`);
      }
    }

    // Force strict 1-11 ordering based on filename/numeric prefix regardless of internal JSON 'order' property
    sections.sort((a, b) => {
        // Find index in files array
        const indexA = files.findIndex(f => sections[files.indexOf(f)] === a); // Logic mismatch? No.
        // Better: Rely on the filename prefix we know is correct (01_..., 02_...)
        // Since 'files' is sorted, we can just map valid sections relative to their file order.
        return 0; // files are already sorted.
    });
    
    // Actually, ensure we update the order property to match the filename sort
    sections.forEach((s, idx) => {
      s.order = idx + 1;
    });

    return {
      template_id: 'modular_combined',
      name: 'Modular Generated Template',
      version: '1.0',
      sections: sections
    };
  }

  /**
   * Load valuation method templates
   */
  async loadMethodTemplates(): Promise<MethodsTemplateFile> {
    if (this.methodsCache) {
      return this.methodsCache;
    }

    const templatesDir = this.getTemplatesDir();
    const methodsPath = path.join(templatesDir, 'valuation-methods.json');
    
    try {
      logger.debug('Loading method templates', { methodsPath, dirContents: fs.readdirSync(templatesDir) });
      const content = fs.readFileSync(methodsPath, 'utf-8');
      this.methodsCache = JSON.parse(content) as MethodsTemplateFile;
      return this.methodsCache;
    } catch (error: any) {
      logger.error('Failed to load method templates', { methodsPath, error: error.message });
      // Fallback: Try looking in sibling report-templates folder
      const fallbackPath = path.join(__dirname, 'report-templates', 'valuation-methods.json');
      if (fallbackPath !== methodsPath && fs.existsSync(fallbackPath)) {
         try {
             const content = fs.readFileSync(fallbackPath, 'utf-8');
             this.methodsCache = JSON.parse(content) as MethodsTemplateFile;
             return this.methodsCache;
         } catch (e2) {
             // ignore
         }
      }

      throw new Error(`Method templates not found at ${methodsPath}`);
    }
  }

  /**
   * Collect all data needed for report rendering
   */
  async collectReportData(valuationId: string): Promise<ReportData> {
    // Fetch valuation with property - use SELECT * to avoid column name issues
    let valuationRow: any = null;
    let propertyRow: any = null;
    
    try {
      // First get the valuation
      const valuationResult = await pool.query(
        `SELECT * FROM valuations WHERE id = $1`,
        [valuationId]
      );
      valuationRow = valuationResult.rows[0];
      
      if (!valuationRow) {
        throw new Error(`Valuation not found: ${valuationId}`);
      }
      
      // Then get the property if property_id exists
      if (valuationRow.property_id) {
        const propertyResult = await pool.query(
          `SELECT * FROM properties WHERE id = $1`,
          [valuationRow.property_id]
        );
        propertyRow = propertyResult.rows[0] || {};
      } else {
        propertyRow = {};
      }
      
      logger.debug('Fetched valuation and property data', {
        valuationId,
        propertyId: valuationRow.property_id,
        hasProperty: !!propertyRow.id
      });
    } catch (e: any) {
      logger.error('Failed to fetch valuation', { valuationId, error: e.message, stack: e.stack });
      throw new Error(`Failed to fetch valuation: ${e.message}`);
    }

    const normalizeDigitalAddress = (value?: string | null): string => {
      if (!value) return 'Not specified';
      const raw = String(value).toUpperCase().replace(/\s+/g, '');
      const match = raw.match(/^([A-Z]{2})-?(\d{3})-?(\d{4})$/);
      if (match) {
        return `${match[1]}-${match[2]}-${match[3]}`;
      }
      return raw;
    };

    const deriveLocationFromGps = (gps?: string | null) => {
      const normalized = normalizeDigitalAddress(gps);
      const prefix = normalized.slice(0, 2);
      const district = GHANA_GPS_DISTRICTS[prefix];
      return {
        normalized,
        districtName: district?.name,
        regionName: district?.region,
      };
    };

    const gpsLookup = deriveLocationFromGps(propertyRow?.digital_address || propertyRow?.gps_address);

    // Merge valuation and property into combined row
    valuationRow = {
      ...valuationRow,
      // Map property fields with fallbacks
      property_id: propertyRow?.id || valuationRow.property_id,
      owner_name: propertyRow?.owner_name || valuationRow?.owner_name || null,
      owner_email: propertyRow?.owner_email || valuationRow?.owner_email || null,
      owner_phone: propertyRow?.owner_phone || valuationRow?.owner_phone || null,
      owner_address: propertyRow?.owner_address || valuationRow?.owner_address || null,
      owner_contact_preference: propertyRow?.owner_contact_preference || valuationRow?.owner_contact_preference || null,
      address: propertyRow?.address_street || propertyRow?.address || propertyRow?.address_city || gpsLookup.districtName || 'Not specified',
      city: propertyRow?.address_city || propertyRow?.city || gpsLookup.districtName || 'Not specified',
      region: propertyRow?.region || valuationRow?.region || gpsLookup.regionName || 'Greater Accra',
      gps_address: gpsLookup.normalized,
      latitude: propertyRow?.latitude,
      longitude: propertyRow?.longitude,
      property_type: propertyRow?.property_type || 'residential',
      land_area_sqm: propertyRow?.land_size_sqm || propertyRow?.land_area_sqm || 0,
      building_area_sqm: propertyRow?.total_floor_area_sqm || propertyRow?.building_area_sqm || 0,
      bedrooms: propertyRow?.num_bedrooms || propertyRow?.bedrooms || 0,
      bathrooms: propertyRow?.num_bathrooms || propertyRow?.bathrooms || 0,
      floors: propertyRow?.num_floors || propertyRow?.floors || 1,
      year_built: propertyRow?.year_of_construction || propertyRow?.year_built || 0,
      condition: propertyRow?.property_condition || propertyRow?.condition || 'Good',
      property_description: propertyRow?.description || 'Property as inspected',
      amenities: propertyRow?.amenities,
      tenure: propertyRow?.tenure || 'Freehold',
      neighborhood: propertyRow?.address_district || gpsLookup.districtName || propertyRow?.address_city || propertyRow?.neighborhood || 'Not specified',
      // Map valuation fields with fallbacks
      effective_date: valuationRow?.valuation_date || valuationRow?.effective_date || valuationRow?.created_at,
      valuation_purpose: valuationRow?.valuation_purpose || valuationRow?.purpose || 'Market Valuation',
      final_value_ghs: valuationRow?.estimated_value || valuationRow?.final_value_ghs || 0,
      final_value_usd: valuationRow?.final_value_usd || 0,
    };

    // Fetch client info from valuation_engagements, with fallback to property owner
    let client: any = {};
    try {
      const engagementResult = await pool.query(`
        SELECT 
          client_name as name,
          client_company as company_name,
          client_address as address,
          client_city as city,
          client_region as region,
          client_contact as contact,
          client_email as email,
          request_type,
          request_date,
          intended_user_name,
          intended_user_address,
          purpose
        FROM valuation_engagements
        WHERE valuation_id = $1
        LIMIT 1
      `, [valuationId]);
      
      if (engagementResult.rows[0]) {
        client = engagementResult.rows[0];
      }
    } catch (e: any) {
      logger.debug('Valuation engagements query failed', { error: e.message });
    }

    // Fallback: If no engagement client, use property owner as the client
    if (!client.name && valuationRow.owner_name) {
      client = {
        name: valuationRow.owner_name,
        address: valuationRow.owner_address,
        email: valuationRow.owner_email,
        phone: valuationRow.owner_phone,
        request_type: 'written', // Default for owner-initiated
      };
      logger.debug('Using property owner as client fallback', { owner_name: valuationRow.owner_name });
    }

    // Fetch valuer info
    let valuer = {};
    try {
      const valuerResult = await pool.query(`
        SELECT v.*
        FROM valuers v
        JOIN valuation_engagements e ON v.id = e.lead_valuer_id
        WHERE e.valuation_id = $1
        LIMIT 1
      `, [valuationId]);
      valuer = valuerResult.rows[0] || {};
    } catch (e: any) {
      logger.debug('Valuers table query failed, using empty valuer', { error: e.message });
    }

    // Fetch reconciliation
    let reconciliation = {};
    try {
      const reconResult = await pool.query(`
        SELECT * FROM valuation_reconciliations WHERE valuation_id = $1 ORDER BY created_at DESC LIMIT 1
      `, [valuationId]);
      reconciliation = reconResult.rows[0] || {};
    } catch (e: any) {
      logger.debug('Reconciliations table query failed', { error: e.message });
    }

    // Fetch floor plans
    let floor_plans: any[] = [];
    try {
      const floorPlanResult = await pool.query(`
        SELECT * FROM valuation_floor_plans WHERE valuation_id = $1 ORDER BY floor_number
      `, [valuationId]);
      floor_plans = floorPlanResult.rows || [];
    } catch (e: any) {
      logger.debug('Floor plans table query failed', { error: e.message });
    }

    // Fetch comparables
    let comparables: any[] = [];
    try {
      const comparablesResult = await pool.query(`
        SELECT * FROM valuation_comparables WHERE valuation_id = $1
      `, [valuationId]);
      comparables = comparablesResult.rows || [];
    } catch (e: any) {
      logger.debug('Comparables table query failed', { error: e.message });
    }

    // Fetch HBU analysis
    let hbu = {};
    try {
      const hbuResult = await pool.query(`
        SELECT * FROM valuation_hbu_analyses WHERE valuation_id = $1 ORDER BY created_at DESC LIMIT 1
      `, [valuationId]);
      hbu = hbuResult.rows[0] || {};
    } catch (e: any) {
      logger.debug('HBU table query failed', { error: e.message });
    }

    // Fetch method results - try valuation_reconciliations.method_weights or separate table
    let methods_used: any[] = [];
    try {
      // Check if we have method weights in reconciliation
      if ((reconciliation as any)?.method_weights) {
        const weights = (reconciliation as any).method_weights;
        // Only include methods with weight > 0 (actually used methods)
        methods_used = Object.entries(weights)
          .filter(([_, weight]) => Number(weight) > 0)
          .map(([method_type, weight]) => ({
            method_type,
            weight,
            indicated_value: (reconciliation as any)?.method_values?.[method_type] || 0,
          }));
      }
    } catch (e: any) {
      logger.debug('Method results extraction failed', { error: e.message });
    }

    // Fetch property risk assessment
    let riskAssessment: any = {};
    try {
      const riskResult = await pool.query(`
        SELECT * FROM property_risk_assessments 
        WHERE property_id = $1 
        ORDER BY assessment_date DESC LIMIT 1
      `, [propertyRow?.id]);
      riskAssessment = riskResult.rows[0] || {};
    } catch (e: any) {
      logger.debug('Risk assessment query failed', { error: e.message });
    }

    return {
      valuation: valuationRow,
      property: { ...valuationRow, metadata: propertyRow?.metadata }, // Include property metadata for Chapter 3
      client,
      valuer,
      reconciliation,
      floor_plans,
      comparables,
      hbu,
      methods_used,
      riskAssessment,
    };
  }

  /**
   * Format currency values
   */
  formatCurrency(value: number, currency: string = 'GHS'): string {
    if (!value && value !== 0) return 'N/A';
    
    const formatted = new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(value);
    
    return formatted;
  }

  /**
   * Convert number to words
   */
  numberToWords(num: number): string {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

    if (num === 0) return 'Zero';
    if (num < 0) return 'Negative ' + this.numberToWords(Math.abs(num));

    let words = '';

    if (Math.floor(num / 1000000) > 0) {
      words += this.numberToWords(Math.floor(num / 1000000)) + ' Million ';
      num %= 1000000;
    }

    if (Math.floor(num / 1000) > 0) {
      words += this.numberToWords(Math.floor(num / 1000)) + ' Thousand ';
      num %= 1000;
    }

    if (Math.floor(num / 100) > 0) {
      words += ones[Math.floor(num / 100)] + ' Hundred ';
      num %= 100;
    }

    if (num > 0) {
      if (num < 10) {
        words += ones[num];
      } else if (num < 20) {
        words += teens[num - 10];
      } else {
        words += tens[Math.floor(num / 10)];
        if (num % 10 > 0) {
          words += '-' + ones[num % 10];
        }
      }
    }

    return words.trim();
  }

  /**
   * Build floor plans table (Schedule of Accommodation) for Appendix A
   */
  buildFloorPlansTable(floor_plans: any[]): string {
    if (!floor_plans || floor_plans.length === 0) {
      return '';
    }

    let totalArea = 0;
    let tableHtml = `<table style='width: 100%; border-collapse: collapse; margin: 20px 0;'>
      <tr>
        <th style='border: 1px solid #000; padding: 10px; text-align: left; background: #f5f5f5;'>Floor</th>
        <th style='border: 1px solid #000; padding: 10px; text-align: left; background: #f5f5f5;'>Room</th>
        <th style='border: 1px solid #000; padding: 10px; text-align: right; background: #f5f5f5;'>Area (sqm)</th>
      </tr>`;

    for (const fp of floor_plans) {
      const floorLabel = fp.floor_label || `Floor ${fp.floor_number}`;
      const rooms = fp.rooms || [];
      const floorArea = fp.gross_building_area_sqm || 0;
      totalArea += Number(floorArea);

      if (rooms.length > 0) {
        // Show individual rooms
        for (let i = 0; i < rooms.length; i++) {
          const room = rooms[i];
          tableHtml += `<tr>
            <td style='border: 1px solid #000; padding: 8px;'>${i === 0 ? floorLabel : ''}</td>
            <td style='border: 1px solid #000; padding: 8px;'>${room.name || room.type || 'Room'}</td>
            <td style='border: 1px solid #000; padding: 8px; text-align: right;'>${(room.area_sqm || 0).toFixed(2)}</td>
          </tr>`;
        }
      } else {
        // No rooms defined, just show floor total
        tableHtml += `<tr>
          <td style='border: 1px solid #000; padding: 8px;'>${floorLabel}</td>
          <td style='border: 1px solid #000; padding: 8px;'>-</td>
          <td style='border: 1px solid #000; padding: 8px; text-align: right;'>${Number(floorArea).toFixed(2)}</td>
        </tr>`;
      }
    }

    // Total row
    tableHtml += `<tr>
      <td style='border: 1px solid #000; padding: 10px;' colspan='2'><strong>TOTAL GROSS FLOOR AREA</strong></td>
      <td style='border: 1px solid #000; padding: 10px; text-align: right;'><strong>${totalArea.toFixed(2)} sqm</strong></td>
    </tr>`;

    tableHtml += '</table>';
    return tableHtml;
  }

  /**
   * Build floor plan images HTML for Appendix B
   * Fetches presigned URLs for floor plan images from MinIO
   */
  private async buildFloorPlanImagesHtml(valuationId: string, floorPlans: any[]): Promise<string> {
    if (!floorPlans || floorPlans.length === 0) {
      return '';
    }

    try {
      // Get images with presigned URLs
      const floorPlanImages = await floorPlanService.getImagesForValuation(valuationId);
      
      if (!floorPlanImages || floorPlanImages.length === 0) {
        // Fallback if no images saved yet
        return `<p style="text-align: center; color: #666;">${floorPlans.map((fp: any) => 
          `<strong>${fp.floor_label || 'Floor ' + fp.floor_number}</strong>: ${(fp.gross_building_area_sqm || 0).toFixed(2)} sqm`
        ).join('<br>')}</p><p style="text-align: center; color: #999; margin-top: 20px; font-style: italic;">[Floor plan images will appear here when exported from the drawing tool]</p>`;
      }

      // Build HTML for each floor plan image
      let html = '';
      for (const fp of floorPlanImages) {
        if (fp.imageUrl) {
          html += `
            <div style="margin-bottom: 30px; page-break-inside: avoid;">
              <h3 style="text-align: center; margin-bottom: 15px; font-size: 14pt;">
                ${fp.floorLabel || 'Floor ' + fp.floorNumber}
                ${fp.grossBuildingAreaSqm ? ` (${fp.grossBuildingAreaSqm.toFixed(2)} sqm)` : ''}
              </h3>
              <div style="text-align: center;">
                <img src="${fp.imageUrl}" alt="${fp.floorLabel}" style="max-width: 100%; max-height: 500px; border: 1px solid #ccc;" />
              </div>
            </div>
          `;
        } else {
          // Floor plan exists but no image
          html += `
            <div style="margin-bottom: 30px; page-break-inside: avoid;">
              <h3 style="text-align: center; margin-bottom: 15px; font-size: 14pt;">
                ${fp.floorLabel || 'Floor ' + fp.floorNumber}
                ${fp.grossBuildingAreaSqm ? ` (${fp.grossBuildingAreaSqm.toFixed(2)} sqm)` : ''}
              </h3>
              <p style="text-align: center; color: #999; font-style: italic;">[Floor plan image not available]</p>
            </div>
          `;
        }
      }

      return html || `<p style="text-align: center; color: #999; font-style: italic;">[No floor plan images available]</p>`;
    } catch (error: any) {
      logger.warn('Failed to build floor plan images HTML', { error: error.message, valuationId });
      return `<p style="text-align: center; color: #999; font-style: italic;">[Unable to load floor plan images]</p>`;
    }
  }

  /**
   * Prepare template context with formatted values
   * 
   * RICS VPS 3 Compliant: Exchange rates are fetched as of the valuation effective date,
   * not the current date. This is critical for retrospective valuations and ensures
   * GhIS compliance for Ghana-based property valuations.
   */
  async prepareContext(data: ReportData): Promise<Record<string, any>> {
    const { valuation, property, client, valuer, reconciliation, floor_plans, comparables, hbu, methods_used, riskAssessment } = data;

    // Extract metadata for Chapter 3 detailed fields
    const metadata = property.metadata || {};

    // Determine the valuation effective date (RICS VPS 3 requirement)
    const valuationDate = valuation.effective_date 
      ? new Date(valuation.effective_date) 
      : new Date();
    
    const isRetrospective = valuation.is_retrospective || (valuationDate < new Date());
    
    // Fetch exchange rate AS OF THE VALUATION DATE (RICS/GhIS compliant)
    let exchangeRateData = { 
      rate: 15.65, 
      source: 'Default', 
      date: valuationDate.toISOString().split('T')[0],
      is_historical: false,
    };
    
    try {
      // Use date-specific rate for RICS compliance
      const exchangeRateResult = await economicDataService.getExchangeRateForDate(
        'USD', 
        'GHS',
        valuationDate
      );
      
      const fetchedRate = Number(exchangeRateResult?.rate);
      if (exchangeRateResult && Number.isFinite(fetchedRate) && fetchedRate > 0) {
        exchangeRateData = {
          rate: fetchedRate,
          source: exchangeRateResult.source || 'Bank of Ghana',
          date: exchangeRateResult.date 
            ? new Date(exchangeRateResult.date).toISOString().split('T')[0] 
            : valuationDate.toISOString().split('T')[0],
          is_historical: isRetrospective,
        };
        
        logger.info('Exchange rate fetched for RICS-compliant valuation', {
          valuationDate: valuationDate.toISOString(),
          rate: exchangeRateData.rate,
          source: exchangeRateData.source,
          isRetrospective,
        });
      }
    } catch (e: any) {
      logger.warn('Failed to fetch date-specific exchange rate, using saved or default', { 
        error: e.message,
        valuationDate: valuationDate.toISOString(),
      });
      
      // Use saved exchange rate from valuation if available (audit trail)
      if (valuation.exchange_rate_used) {
        const savedRate = Number(valuation.exchange_rate_used);
        exchangeRateData = {
          rate: Number.isFinite(savedRate) ? savedRate : 15.65,
          source: valuation.exchange_rate_source || 'Saved (Audit Trail)',
          date: valuation.exchange_rate_date || valuationDate.toISOString().split('T')[0],
          is_historical: true,
        };
      }
    }

    const normalizedRate = Number(exchangeRateData.rate);
    if (!Number.isFinite(normalizedRate) || normalizedRate <= 0) {
      exchangeRateData = {
        ...exchangeRateData,
        rate: 15.65,
        source: exchangeRateData.source || 'Default',
      };
    }

    // Calculate USD values using the date-appropriate exchange rate
    const finalValueGhs = valuation.final_value_ghs || reconciliation.final_value || 0;
    const finalValueUsd = valuation.final_value_usd || (exchangeRateData.rate > 0 ? finalValueGhs / exchangeRateData.rate : 0);
    
    // Calculate FSV (use saved or default to 20% discount)
    const fsvDiscountPercent = valuation.fsv_discount_percent || 20;
    const forceSaleValue = valuation.force_sale_value || (finalValueGhs * (1 - fsvDiscountPercent / 100));
    const forceSaleValueUsd = valuation.force_sale_value_usd || (exchangeRateData.rate > 0 ? forceSaleValue / exchangeRateData.rate : 0);

    // Format dates
    const formatDate = (date: any): string => {
      if (!date) return 'Not specified';
      return new Date(date).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    };

    // Build methods list
    const methodNames = methods_used.map((m: any) => {
      const methodMap: Record<string, string> = {
        comparable_sales: 'Comparable Sales Method',
        income_approach: 'Income Approach',
        cost_approach: 'Depreciated Cost Method',
        residual_method: 'Residual Method',
        profits_method: 'Profits Method',
      };
      return methodMap[m.method_type] || m.method_type;
    });

    // Build Part Four: Valuation Process dynamic content
    const methodTypesList = methods_used.map((m: any) => m.method_type);
    const hasComparableSales = methodTypesList.includes('comparable_sales');
    const hasIncomeApproach = methodTypesList.includes('income_approach');
    const hasCostApproach = methodTypesList.includes('cost_approach');
    const hasResidualMethod = methodTypesList.includes('residual_method');
    const hasProfitsMethod = methodTypesList.includes('profits_method');

    // Build methods used list for "Choice of Method" section
    const buildMethodsUsedList = (): string => {
      if (methodNames.length === 0) return 'appropriate valuation methods were';
      if (methodNames.length === 1) return `the ${methodNames[0]} was`;
      const lastMethod = methodNames[methodNames.length - 1];
      const otherMethods = methodNames.slice(0, -1).join(', ');
      return `the ${otherMethods} and ${lastMethod} were`;
    };

    // Build method justifications based on selected methods
    const buildMethodJustifications = (): string => {
      let justifications = '';
      
      if (hasCostApproach) {
        justifications += `<h4 style="margin-top: 16px;">THE DEPRECIATED REPLACEMENT COST METHOD</h4>
<ol style="margin-left: 20px; margin-bottom: 16px;">
<li style="margin-bottom: 8px;">The nature of the building is very different from most houses in the <u>neighbourhood</u>. Also, type of finishing, fittings and construction were considered.</li>
<li style="margin-bottom: 8px;">There is not enough evidence of recent sale of properties with similar attributes on the market within the area.</li>
<li style="margin-bottom: 8px;">Considering the inflationary nature of our economy this method takes into account the current cost of replacing an asset while factoring in depreciation. This provides a more accurate reflection of an asset's value.</li>
</ol>`;
      }

      if (hasComparableSales) {
        justifications += `<h4 style="margin-top: 16px;">THE MARKET COMPARISON METHOD</h4>
<ol style="margin-left: 20px; margin-bottom: 16px;">
<li style="margin-bottom: 8px;">This method was used to gather information on the prevailing land values in the area and making room for adjustments, taking into consideration the subject properties and their access to road network, electricity, water, etc.</li>
</ol>
<p style="margin-bottom: 16px;">The result from this approach is therefore deemed fair and gives a true reflection of the market value of the subject property.</p>`;
      }

      if (hasIncomeApproach) {
        justifications += `<h4 style="margin-top: 16px;">THE INCOME CAPITALISATION METHOD</h4>
<ol style="margin-left: 20px; margin-bottom: 16px;">
<li style="margin-bottom: 8px;">The property is income-producing or has potential to generate rental income.</li>
<li style="margin-bottom: 8px;">There is sufficient market evidence of rental values for similar properties in the area.</li>
<li style="margin-bottom: 8px;">This method reflects how investors typically value income-producing properties.</li>
</ol>`;
      }

      if (hasResidualMethod) {
        justifications += `<h4 style="margin-top: 16px;">THE RESIDUAL METHOD</h4>
<ol style="margin-left: 20px; margin-bottom: 16px;">
<li style="margin-bottom: 8px;">The subject property has development potential that needs to be reflected in its value.</li>
<li style="margin-bottom: 8px;">This method accounts for all costs of development including construction, professional fees, and developer's profit.</li>
</ol>`;
      }

      if (hasProfitsMethod) {
        justifications += `<h4 style="margin-top: 16px;">THE PROFITS METHOD</h4>
<ol style="margin-left: 20px; margin-bottom: 16px;">
<li style="margin-bottom: 8px;">The value of this property is closely linked to the trading potential of the business conducted on the premises.</li>
<li style="margin-bottom: 8px;">There is limited rental evidence for this type of specialised property.</li>
</ol>`;
      }

      return justifications || '<p>No specific method justifications provided.</p>';
    };

    // Build basis of valuation statement
    const buildBasisStatement = (): string => {
      const basis = metadata.basis_of_valuation || valuation.basis_of_valuation || 'Market Value';
      return `The principle of ${basis} forms the basis of this valuation.`;
    };

    // Calculate land area in acres
    const landAreaSqm = property.land_area_sqm ? Number(property.land_area_sqm) : 0;
    const landAreaAcres = landAreaSqm ? (landAreaSqm / 4046.86).toFixed(2) : null;
    const landAreaHectares = landAreaSqm ? (landAreaSqm / 10000).toFixed(2) : null;

    // Build detailed property description
    const buildPropertyDescription = (): string => {
      const type = (property.property_type || 'property').replace(/_/g, ' ');
      const bedrooms = property.bedrooms;
      const bathrooms = property.bathrooms;
      const yearBuilt = property.year_built;
      const landArea = landAreaSqm ? `${landAreaSqm.toFixed(0)} square meters (${landAreaAcres} acres)` : null;
      const buildingArea = property.building_area_sqm ? `${Number(property.building_area_sqm).toFixed(0)} square meters` : null;

      let description = `The subject property is a ${type}`;
      
      if (bedrooms && bedrooms > 0) {
        description += ` comprising ${bedrooms} bedroom${bedrooms > 1 ? 's' : ''}`;
        if (bathrooms && bathrooms > 0) {
          description += ` with ${bathrooms} bathroom${bathrooms > 1 ? 's' : ''} (all ensuite)`;
        }
      }
      
      if (landArea) {
        description += ` sited on a ${landArea} land`;
      }
      
      if (buildingArea) {
        description += ` with a total built-up area of ${buildingArea}`;
      }
      
      if (yearBuilt && yearBuilt > 0) {
        description += `. The property was built in ${yearBuilt}`;
      }
      
      // Add additional features if available
      if (property.property_description) {
        description += `. ${property.property_description}`;
      } else {
        description += '.';
      }
      
      return description;
    };

    // Build tenure description
    const buildTenureDescription = (): string => {
      const tenureType = property.tenure_type || property.tenure || 'freehold';
      const tenureMap: Record<string, string> = {
        freehold: 'Freehold Interest',
        leasehold: `Leasehold Interest${property.lease_years ? ` with ${property.lease_years}-year lease term` : ''}`,
        stool_land: 'Stool Land (Customary tenure)',
        family_land: 'Family Land (Customary tenure)',
        government_land: 'Government Land (State ownership)',
        customary: 'Customary Tenure',
        other: property.tenure_description || 'Other tenure arrangement',
      };
      return tenureMap[tenureType.toLowerCase()] || tenureType;
    };

    // Build use classification display
    const buildUseClassificationDisplay = (): string => {
      const type = (property.use_classification || property.property_type || 'residential').toLowerCase();
      const classificationMap: Record<string, string> = {
        residential: 'Residential Purpose',
        residential_house: 'Residential Purpose',
        residential_apartment: 'Residential Purpose',
        commercial: 'Commercial Purpose',
        commercial_office: 'Commercial Purpose',
        commercial_retail: 'Commercial Purpose',
        industrial: 'Industrial Purpose',
        mixed_use: 'Mixed Use Purpose',
        agricultural: 'Agricultural Purpose',
        hotel: 'Commercial Purpose (Hospitality)',
        warehouse: 'Industrial/Commercial Purpose',
      };
      return classificationMap[type] || type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) + ' Purpose';
    };

    // Build purpose description
    const buildPurposeDescription = (): string => {
      const purpose = (valuation.valuation_purpose || 'sale').toLowerCase();
      const purposeMap: Record<string, string> = {
        sale: 'To determine the Market Capital Value of the subject property for sale/negotiation purposes',
        purchase: 'To determine the Market Capital Value of the subject property for purchase purposes',
        mortgage: 'To determine the Market Value of the subject property for mortgage/loan security purposes',
        insurance: 'To determine the replacement/reinstatement value of the subject property for insurance purposes',
        rental: 'To determine the Market Rental Value of the subject property for letting purposes',
        accounting: 'To determine the Fair Value of the subject property for financial reporting purposes',
        taxation: 'To determine the Market Value of the subject property for taxation purposes',
        litigation: 'To determine the Market Value of the subject property for litigation/dispute resolution purposes',
        compulsory_acquisition: 'To determine the compensation value of the subject property for compulsory acquisition purposes',
        asset_valuation: 'To determine the Market Value of the subject property for asset valuation purposes',
        estate_duty: 'To determine the Market Value of the subject property for estate duty/probate purposes',
      };
      return purposeMap[purpose] || `To determine the Market Value of the subject property for ${purpose.replace(/_/g, ' ')} purposes`;
    };

    // Format month and year from date
    const formatMonthYear = (date: any): string => {
      if (!date) return 'Not specified';
      return new Date(date).toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
      });
    };

    // Build request type display (verbal, written, etc.)
    const buildRequestTypeDisplay = (): string => {
      const requestType = (client.request_type || 'written').toLowerCase();
      const requestTypeMap: Record<string, string> = {
        written: 'received in writing',
        verbal: 'by a verbal communication',
        email: 'via email',
        phone: 'via telephone',
        letter: 'received in writing',
      };
      return requestTypeMap[requestType] || 'received';
    };

    return {
      // Client data (from valuation_engagements - who instructed the valuation)
      // Falls back to property owner if no engagement record exists
      client: {
        name: client.name || client.company_name || property.owner_name || 'Not specified',
        name_display: client.name || client.company_name || property.owner_name || 'Not specified',
        address: client.address || property.owner_address || 'Not specified',
        address_display: client.address || property.owner_address || 'Not specified',
        salutation: client.salutation || 'Sir/Madam',
        email: client.email || property.owner_email,
        phone: client.phone || property.owner_phone,
        request_type: client.request_type || 'written',
        request_type_display: buildRequestTypeDisplay(),
        company_name: client.company_name,
      },

      // Property data
      property: {
        address: property.address || 'Not specified',
        address_uppercase: (property.address || '').toUpperCase(),
        city: property.city || 'Not specified',
        region: property.region || 'Greater Accra',
        gps_address: property.gps_address || 'Not available',
        gps_address_uppercase: (property.gps_address || 'NOT AVAILABLE').toUpperCase(),
        neighborhood_uppercase: (property.neighborhood || property.city || 'NOT SPECIFIED').toUpperCase(),
        type: property.property_type || 'Residential',
        type_uppercase: (property.property_type || 'PROPERTY').toUpperCase(),
        type_display: (property.property_type || 'PROPERTY').replace(/_/g, ' ').toUpperCase(),
        property_type_lower: (property.property_type || 'residential').replace(/_/g, ' ').toLowerCase(),
        description: property.property_description || 'Property as inspected',
        description_detailed: buildPropertyDescription(),
        land_area_sqm: landAreaSqm ? landAreaSqm.toFixed(2) : 'Not measured',
        land_area_acres: landAreaAcres,
        land_area_hectares: landAreaHectares,
        building_area_sqm: property.building_area_sqm ? Number(property.building_area_sqm).toFixed(2) : 'Not measured',
        bedrooms: property.bedrooms || 'N/A',
        bathrooms: property.bathrooms || 'N/A',
        floors: property.floors || '1',
        year_built: property.year_built || 'Unknown',
        condition: property.condition || 'Good',
        tenure: property.tenure || 'Freehold/Leasehold',
        tenure_description: buildTenureDescription(),
        use_classification: property.use_classification || property.property_type || 'Residential',
        use_classification_display: buildUseClassificationDisplay(),
        neighborhood: property.neighborhood || property.city || 'Not specified',
        amenities: property.amenities,
        plot_shape: property.plot_shape || 'Regular',
        topography: property.topography || 'Generally level',
        owner_name: property.owner_name,
        owner_address: property.owner_address,
        owner_email: property.owner_email,
        owner_phone: property.owner_phone,
        owner_name_display: property.owner_name || client.name || 'Not specified',
        owner_address_display: property.owner_address || client.address || '[Not provided]',
        // Chapter 3: Data Influencing Property Values - NO FALLBACKS, user data only
        digital_address: property.digital_address || property.gps_address || '[Not provided]',
        location_description: metadata.location_description || property.location_description || '[Location description not provided]',
        brief_description: metadata.brief_description || property.brief_description || property.description || '[Property description not provided]',
        grounds_external_works: metadata.grounds_external_works || property.grounds_external_works || '[Grounds and external works not provided]',
        floor_finish: metadata.floor_finish || property.floor_finish || '[Not provided]',
        wall_construction: metadata.wall_construction || property.wall_construction || '[Not provided]',
        doors: metadata.doors || property.doors || '[Not provided]',
        windows: metadata.windows || property.windows || '[Not provided]',
        ceiling: metadata.ceiling || property.ceiling || '[Not provided]',
        roofing: metadata.roofing || property.roofing || property.roof_type || '[Not provided]',
        fixtures_fittings: metadata.fixtures_fittings || property.fixtures_fittings || '[Not provided]',
        drainage_sanitation: metadata.drainage_sanitation || property.drainage_sanitation || '[Not provided]',
        condition_state: metadata.condition_state || property.condition_state || property.condition_details || '[Condition assessment not provided]',
        services_description: metadata.services_description || property.services_description || '[Services description not provided]',
        accommodation_description: metadata.accommodation_description || property.accommodation_description || '[Accommodation not provided]',
        land_value_evidence: metadata.land_value_evidence || property.land_value_evidence || '[Land value evidence not provided]',
      },

      // Location data (for Chapter 3) - NO FALLBACKS
      location: {
        city_description: metadata.city_description || property.city_description || '[City/regional data not provided]',
        neighborhood_description: metadata.neighbourhood_description || metadata.neighborhood_description || property.neighbourhood_description || property.neighborhood_description || '[Neighbourhood data not provided]',
        neighborhood_class: metadata.neighbourhood_class || metadata.neighborhood_class || property.neighbourhood_class || property.neighborhood_class || '[Not specified]',
        resident_income_level: metadata.resident_income_level || property.resident_income_level || '[Not specified]',
        primary_use: metadata.primary_use || property.primary_use || '[Not specified]',
      },

      // Valuation data
      valuation: {
        purpose: valuation.valuation_purpose || '[Not specified]',
        purpose_lower: (valuation.valuation_purpose || 'valuation').toLowerCase().replace(/_/g, ' '),
        purpose_description: buildPurposeDescription(),
        basis: 'Principle of Market Value',
        basis_statement: buildBasisStatement(),
        effective_date: formatDate(valuation.effective_date),
        effective_date_month_year: formatMonthYear(valuation.effective_date),
        instruction_date: formatDate(valuation.instruction_date),
        inspection_date: formatDate(valuation.inspection_date || valuation.effective_date),
        report_date: formatDate(new Date()),
        final_value: finalValueGhs,
        final_value_formatted: this.formatCurrency(finalValueGhs, 'GHS'),
        final_value_words: this.numberToWords(Math.round(finalValueGhs)).toUpperCase() + ' GHANA CEDIS',
        final_value_usd: finalValueUsd,
        final_value_usd_formatted: this.formatCurrency(finalValueUsd, 'USD'),
        final_value_usd_words: this.numberToWords(Math.round(finalValueUsd)).toUpperCase() + ' UNITED STATES DOLLARS',
        // Forced Sale Value
        force_sale_value: forceSaleValue,
        force_sale_value_formatted: this.formatCurrency(forceSaleValue, 'GHS'),
        force_sale_value_words: this.numberToWords(Math.round(forceSaleValue)).toUpperCase() + ' GHANA CEDIS',
        force_sale_value_usd: forceSaleValueUsd,
        force_sale_value_usd_formatted: this.formatCurrency(forceSaleValueUsd, 'USD'),
        force_sale_value_usd_words: this.numberToWords(Math.round(forceSaleValueUsd)).toUpperCase() + ' UNITED STATES DOLLARS',
        fsv_discount_percent: fsvDiscountPercent,
        // Exchange rate (as of valuation date per RICS VPS 3)
        exchange_rate: `GH₵ ${exchangeRateData.rate.toFixed(2)} = $1.00`,
        exchange_rate_value: exchangeRateData.rate,
        exchange_rate_source: exchangeRateData.source,
        exchange_rate_date: exchangeRateData.date,
        exchange_rate_is_historical: exchangeRateData.is_historical,
        is_retrospective: isRetrospective,
        methods_applied: methodNames.length > 0 ? methodNames.join(' and ') : 'Appropriate valuation methods',
        methods_used: methods_used.map((m: any) => ({
          name: m.method_type?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
          value: m.indicated_value,
          value_formatted: this.formatCurrency(m.indicated_value, 'GHS'),
        })),
        methods_used_list: buildMethodsUsedList(),
        methods_used_verb: methodNames.length === 1 ? 'was' : 'were',
        method_justifications: buildMethodJustifications(),
        hbu_conclusion: hbu.hbu_conclusion || 'Current use as the highest and best use',
        special_assumptions: valuation.special_assumptions || [],
        method_selection_rationale: 'The selection of valuation methods was based on the property type, availability of market data, purpose of the valuation, and GhIS/RICS guidance.',
      },

      // Methods flags for Part Four conditional rendering
      methods: {
        has_comparable_sales: hasComparableSales,
        has_income_approach: hasIncomeApproach,
        has_cost_approach: hasCostApproach,
        has_residual_method: hasResidualMethod,
        has_profits_method: hasProfitsMethod,
      },

      // Valuer data
      valuer: {
        name: valuer.name || valuer.full_name || '[Valuer Name]',
        name_uppercase: (valuer.name || valuer.full_name || 'VALUER NAME').toUpperCase(),
        qualifications: valuer.qualifications || 'BSc., MGhIS',
        title: valuer.title || 'Valuation & Estate Surveyor',
        registration_number: valuer.ghis_number || valuer.registration_number || '[GhIS Reg No]',
        firm: valuer.firm_name || valuer.company || 'PropMetrik',
        email: valuer.contact_email || valuer.email,
        phone: valuer.contact_phone || valuer.phone,
        address: valuer.contact_address || valuer.address,
      },

      // Reconciliation data
      reconciliation: {
        narrative: reconciliation.narrative || 'The indicated values from each approach have been reconciled considering the reliability and relevance of each method to the subject property.',
        has_multiple_methods: methods_used.length > 1,
        method_values: methods_used.map((m: any) => ({
          method: m.method_type?.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
          value: m.indicated_value,
          value_formatted: this.formatCurrency(m.indicated_value, 'GHS'),
          weight: (reconciliation.weights?.[m.method_type] || 0) * 100,
          weighted_value: (m.indicated_value || 0) * (reconciliation.weights?.[m.method_type] || 0),
          weighted_value_formatted: this.formatCurrency((m.indicated_value || 0) * (reconciliation.weights?.[m.method_type] || 0), 'GHS'),
        })),
      },

      // Floor plans
      floor_plans: floor_plans.map((fp: any) => ({
        floor_label: fp.floor_label || `Floor ${fp.floor_number}`,
        floor_number: fp.floor_number,
        total_area: fp.gross_building_area_sqm || fp.total_area_sqm,
        rooms: fp.rooms || [],
      })),

      // Floor plans table for Appendix A (Schedule of Accommodation)
      floor_plans_table: this.buildFloorPlansTable(floor_plans),

      // Floor plans images for Appendix B (fetched from MinIO with presigned URLs)
      floor_plans_images: await this.buildFloorPlanImagesHtml(valuation.id, floor_plans),

      // Comparables
      comparables: comparables.map((c: any) => ({
        name: c.name || `Comparable ${c.id?.slice(0, 4)}`,
        address: c.address,
        sale_date: formatDate(c.sale_date),
        sale_price: c.sale_price,
        sale_price_formatted: this.formatCurrency(c.sale_price, 'GHS'),
        land_area: c.land_area_sqm,
        building_area: c.building_area_sqm,
        price_per_sqm: c.building_area_sqm ? (c.sale_price / c.building_area_sqm) : null,
        price_per_sqm_formatted: c.building_area_sqm ? this.formatCurrency(c.sale_price / c.building_area_sqm, 'GHS') : 'N/A',
      })),

      // Risk Assessment - formatted with "x" markers for each rating level
      risk: {
        // Employment Stability
        employment_stability_good: riskAssessment.employment_stability === 'good' ? 'x' : '',
        employment_stability_avg: riskAssessment.employment_stability === 'average' ? 'x' : '',
        employment_stability_fair: riskAssessment.employment_stability === 'fair' ? 'x' : '',
        employment_stability_poor: riskAssessment.employment_stability === 'poor' ? 'x' : '',
        // Convenience to Employment
        employment_convenience_good: riskAssessment.convenience_employment === 'good' ? 'x' : '',
        employment_convenience_avg: riskAssessment.convenience_employment === 'average' ? 'x' : '',
        employment_convenience_fair: riskAssessment.convenience_employment === 'fair' ? 'x' : '',
        employment_convenience_poor: riskAssessment.convenience_employment === 'poor' ? 'x' : '',
        // Convenience to Shopping
        shopping_convenience_good: riskAssessment.convenience_shopping === 'good' ? 'x' : '',
        shopping_convenience_avg: riskAssessment.convenience_shopping === 'average' ? 'x' : '',
        shopping_convenience_fair: riskAssessment.convenience_shopping === 'fair' ? 'x' : '',
        shopping_convenience_poor: riskAssessment.convenience_shopping === 'poor' ? 'x' : '',
        // Convenience to School
        school_convenience_good: riskAssessment.convenience_school === 'good' ? 'x' : '',
        school_convenience_avg: riskAssessment.convenience_school === 'average' ? 'x' : '',
        school_convenience_fair: riskAssessment.convenience_school === 'fair' ? 'x' : '',
        school_convenience_poor: riskAssessment.convenience_school === 'poor' ? 'x' : '',
        // Public Transportation
        transport_good: riskAssessment.public_transportation === 'good' ? 'x' : '',
        transport_avg: riskAssessment.public_transportation === 'average' ? 'x' : '',
        transport_fair: riskAssessment.public_transportation === 'fair' ? 'x' : '',
        transport_poor: riskAssessment.public_transportation === 'poor' ? 'x' : '',
        // Utilities
        utilities_good: riskAssessment.utilities_adequacy === 'good' ? 'x' : '',
        utilities_avg: riskAssessment.utilities_adequacy === 'average' ? 'x' : '',
        utilities_fair: riskAssessment.utilities_adequacy === 'fair' ? 'x' : '',
        utilities_poor: riskAssessment.utilities_adequacy === 'poor' ? 'x' : '',
        // Recreation
        recreation_good: riskAssessment.recreation_facilities === 'good' ? 'x' : '',
        recreation_avg: riskAssessment.recreation_facilities === 'average' ? 'x' : '',
        recreation_fair: riskAssessment.recreation_facilities === 'fair' ? 'x' : '',
        recreation_poor: riskAssessment.recreation_facilities === 'poor' ? 'x' : '',
        // Police & Fire Protection
        protection_good: riskAssessment.police_fire_protection === 'good' ? 'x' : '',
        protection_avg: riskAssessment.police_fire_protection === 'average' ? 'x' : '',
        protection_fair: riskAssessment.police_fire_protection === 'fair' ? 'x' : '',
        protection_poor: riskAssessment.police_fire_protection === 'poor' ? 'x' : '',
        // Accessibility
        accessibility_good: riskAssessment.accessibility === 'good' ? 'x' : '',
        accessibility_avg: riskAssessment.accessibility === 'average' ? 'x' : '',
        accessibility_fair: riskAssessment.accessibility === 'fair' ? 'x' : '',
        accessibility_poor: riskAssessment.accessibility === 'poor' ? 'x' : '',
        // Overall
        overall_risk_level: riskAssessment.overall_risk_level || 'medium',
        notes: riskAssessment.notes || '',
      },
    };
  }

  /**
   * Simple template rendering (replace placeholders)
   */
  renderTemplate(template: string, context: Record<string, any>): string {
    let rendered = template;

    // Handle conditionals {{#if condition}}...{{else}}...{{/if}} FIRST
    // This regex handles both with and without else clause
    const ifElseRegex = /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
    rendered = rendered.replace(ifElseRegex, (match, condition, ifContent, elseContent) => {
      const value = this.getNestedValue(context, condition.trim());
      return value ? ifContent : elseContent;
    });

    // Handle simple conditionals {{#if condition}}...{{/if}} (no else)
    const ifRegex = /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
    rendered = rendered.replace(ifRegex, (match, condition, content) => {
      const value = this.getNestedValue(context, condition.trim());
      return value ? content : '';
    });

    // Handle each loops {{#each array}}...{{/each}}
    const eachRegex = /\{\{#each\s+([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
    rendered = rendered.replace(eachRegex, (match, arrayPath, itemTemplate) => {
      const array = this.getNestedValue(context, arrayPath.trim());
      if (!Array.isArray(array) || array.length === 0) {
        return '';
      }
      return array.map((item, index) => {
        let itemRendered = itemTemplate;
        // Replace {{this.property}} with item properties
        const thisRegex = /\{\{this\.([^}]+)\}\}/g;
        itemRendered = itemRendered.replace(thisRegex, (m: string, prop: string) => {
          const val = item[prop.trim()];
          return val !== undefined && val !== null ? String(val) : '';
        });
        // Replace {{@index}}
        itemRendered = itemRendered.replace(/\{\{@index\}\}/g, String(index));
        return itemRendered;
      }).join('');
    });

    // Replace simple placeholders {{path.to.value}} LAST
    const placeholderRegex = /\{\{([^}#@/]+)\}\}/g;
    
    rendered = rendered.replace(placeholderRegex, (match, path) => {
      const value = this.getNestedValue(context, path.trim());
      if (value === undefined || value === null) {
        return '';
      }
      return String(value);
    });

    return rendered;
  }

  /**
   * Get nested value from object
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Generate complete report sections with data
   */
  async generateReportSections(
    valuationId: string, 
    templateId: string = 'ghis-standard'
  ): Promise<TemplateSection[]> {
    try {
      // Load template
      logger.debug('Generating report sections', { valuationId, templateId });
      const template = await this.loadTemplate(templateId);
      logger.debug('Template loaded', { sections: template.sections.length });
      
      // Collect data
      const data = await this.collectReportData(valuationId);
      logger.debug('Data collected', { 
        hasValuation: !!data.valuation,
        methodsCount: data.methods_used.length 
      });
      
      // Prepare context (async to fetch live exchange rate)
      const context = await this.prepareContext(data);
      logger.debug('Context prepared');
      
      // Load method templates
      const methodTemplates = await this.loadMethodTemplates();
      logger.debug('Method templates loaded');
      
      // Build method-specific content
      let methodDetailsHtml = '';
      for (const method of data.methods_used) {
        const methodTemplate = methodTemplates.methods[method.method_type];
        if (methodTemplate) {
          // Add method result to context
          const methodContext = {
            ...context,
            method_result: {
              value: method.indicated_value,
              value_formatted: this.formatCurrency(method.indicated_value, 'GHS'),
            },
            // Add method-specific data from the result
            ...method.calculation_data,
          };
          methodDetailsHtml += this.renderTemplate(methodTemplate.template, methodContext);
        }
      }
      
      // Add method details to context
      context.valuation.method_details = methodDetailsHtml;
      
      // Render each section
      logger.debug('Rendering sections');
      const renderedSections = template.sections.map(section => ({
        id: section.id,
        title: section.title,
        order: section.order,
        content: this.renderTemplate(section.content, context),
      }));

      logger.debug('Sections rendered successfully', { count: renderedSections.length });
      return renderedSections;
    } catch (error: any) {
      logger.error('generateReportSections failed', { 
        valuationId, 
        templateId, 
        error: error.message,
        stack: error.stack 
      });
      throw error;
    }
  }
}

export const reportTemplateService = new ReportTemplateService();
export default reportTemplateService;
