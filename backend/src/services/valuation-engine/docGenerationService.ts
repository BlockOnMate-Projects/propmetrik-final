/**
 * Document Generation Service
 * 
 * Generates DOCX reports using docxtemplater (legacy) or the
 * professional docx builder (new programmatic approach).
 * Integrates with reportDataService for data collection.
 * Uploads to MinIO for storage.
 * 
 * Phase 2: DOCX Generation
 */

import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
// @ts-ignore - no type definitions available for this package
import ImageModule from 'docxtemplater-image-module-free';
import * as fs from 'fs';
import * as path from 'path';
import * as QRCode from 'qrcode';
import { query } from '../../database';
import { logger } from '../../utils/logger';
import { uploadFile, getPresignedDownloadUrl } from '../../database/minio';
import { reportDataService } from './reportDataService';
import { valuationReportService } from './valuationReportService';
import { reportTemplateService } from './reportTemplateService';
import { valuationDocumentService } from './valuationDocumentService';
import { floorPlanService } from './floorPlanService';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { buildProfessionalDocx } from './professionalDocxBuilder';

// =====================================================
// TYPES
// =====================================================

export interface DocxGenerationOptions {
  template?: 'ghis_standard' | 'rics_residential' | 'rics_commercial' | 'bank_mortgage' | 'insurance';
  includeFloorPlans?: boolean;
  includePhotos?: boolean;
  includeMaps?: boolean;
  includeComparables?: boolean;
  currency?: 'GHS' | 'USD';
  secondaryCurrency?: 'GHS' | 'USD' | null;
}

export interface GeneratedReport {
  reportId: string;
  docxBuffer: Buffer;
  docxUrl: string;
  filename: string;
  generatedAt: Date;
}

export interface ReportSectionData {
  cover: any;
  transmittal: any;
  certification: any;
  disclaimers: any;
  property: any;
  legal: any;
  construction: any;
  externals: any;
  riskAssessment: any;
  inspection: any;
  engagement: any;
  valuation: any;
  methods: any[];
  comparables: any[];
  photos: any[];
  /** Valuation documents (location map / subject photos / title docs) → Appendices C/D/E. */
  documentImages?: Array<{ docType: string; caption: string | null; filename: string | null; mime: string; buffer: Buffer }>;
  floorPlans: any[];
  floorPlanImages?: Array<{
    label: string;
    area: string;
    imageBuffer: Buffer;
    imageUrl: string;
  }>;
  weightingRationale?: string | null;
  /** Saved TipTap editor HTML sections — the user-edited report content */
  editorSections?: Array<{
    id: string;
    title: string;
    order: number;
    content: string; // HTML
  }>;
}

// =====================================================
// CONSTANTS
// =====================================================

const TEMPLATES_DIR = path.join(__dirname, '../../../templates');
const MINIO_REPORTS_BUCKET = process.env.MINIO_REPORTS_BUCKET || 'propmetrik-documents';
const VERIFICATION_BASE_URL = process.env.VERIFICATION_BASE_URL || 'https://verify.propmetrik.com';

// =====================================================
// DOCUMENT GENERATION SERVICE
// =====================================================

class DocGenerationService {

  /**
   * Generate a DOCX report for a given report ID
   */
  async generateDocx(
    reportId: string,
    options: DocxGenerationOptions = {}
  ): Promise<GeneratedReport> {
    logger.info('Starting DOCX generation', { reportId, template: options.template });

    try {
      // 1. Get report record
      const report = await this.getReport(reportId);
      if (!report) {
        throw new Error(`Report not found: ${reportId}`);
      }

      // 2. Collect all report data (including saved TipTap editor content)
      const sectionData = await this.collectReportData(reportId, report, options);

      // 3. Generate QR code for verification
      const verificationUrl = `${VERIFICATION_BASE_URL}/reports/${reportId}`;
      const qrCodeDataUrl = await this.generateQRCode(verificationUrl);

      // 4. Load and populate template
      const templateName = options.template || report.template || 'ghis_standard';
      const docxBuffer = await this.populateTemplate(templateName, sectionData, qrCodeDataUrl);

      // 5. Upload to MinIO
      const filename = this.generateFilename(report, sectionData.property);
      const storageKey = `reports/${reportId}/${filename}`;
      
      await uploadFile(MINIO_REPORTS_BUCKET, storageKey, docxBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

      // 6. Get signed URL
      const docxUrl = await getPresignedDownloadUrl(MINIO_REPORTS_BUCKET, storageKey, 7 * 24 * 60 * 60); // 7 days

      // 7. Update report record with document storage key
      // Editor sections are the source of truth and are NOT cleared here.
      // The DOCX builder reads and uses them via resolveSection().
      await query(
        `UPDATE valuation_reports 
         SET docx_storage_key = $1, 
             content = COALESCE(content, '{}'::jsonb) || $2::jsonb,
             updated_at = NOW()
         WHERE id = $3`,
        [
          storageKey,
          JSON.stringify({ generated_at: new Date().toISOString(), docx_url: docxUrl }),
          reportId,
        ]
      );

      logger.info('DOCX generation completed', { reportId, filename, storageKey });

      return {
        reportId,
        docxBuffer,
        docxUrl,
        filename,
        generatedAt: new Date(),
      };

    } catch (error: any) {
      console.error('DOCX generation error:', error);
      logger.error('DOCX generation failed', { 
        reportId, 
        error: error.message,
        stack: error.stack,
        code: error.code,
        detail: error.detail,
      });
      throw error;
    }
  }

  /**
   * Collect all data needed for the report
   */
  private async collectReportData(
    reportId: string,
    report: any,
    options: DocxGenerationOptions
  ): Promise<ReportSectionData> {
    const valuationId = report.valuation_id;
    const propertyId = report.property_id;

    // Collect data in parallel where possible
    const [
      cover,
      transmittal,
      certification,
      disclaimers,
      legal,
      construction,
      externals,
      riskAssessment,
      inspection,
      engagement,
    ] = await Promise.all([
      reportDataService.getCoverData(reportId),
      reportDataService.getTransmittalData(reportId),
      reportDataService.getCertificationData(reportId),
      reportDataService.getDisclaimersData(reportId),
      reportDataService.getPropertyLegal(propertyId),
      reportDataService.getPropertyConstruction(propertyId),
      reportDataService.getPropertyExternals(propertyId),
      reportDataService.getPropertyRiskAssessment(propertyId),
      reportDataService.getInspectionData(valuationId),
      reportDataService.getEngagementData(valuationId),
    ]);

    // Get property and valuation data from existing service
    const valuationReportData = await valuationReportService.generateReport(valuationId, {
      includeComparables: options.includeComparables !== false,
      includeMethodDetails: true,
      includeMarketAnalysis: true,
      currency: options.currency || 'GHS',
    });

    // Get photos if requested
    const photos = options.includePhotos !== false 
      ? await this.getReportPhotos(reportId) 
      : [];

    // Get floor plans if requested
    const floorPlans = options.includeFloorPlans !== false
      ? await this.getFloorPlans(valuationId)
      : [];

    // Get floor plan images with presigned URLs and fetch as base64
    const floorPlanImages = options.includeFloorPlans !== false
      ? await this.getFloorPlanImagesWithData(valuationId)
      : [];

    // Valuation documents → Appendices C (location map), D (photos), E (title docs).
    // Auto-generate the location map from the subject coordinates if one isn't present.
    try {
      const existing = await valuationDocumentService.list(valuationId, 'location_map');
      if (existing.length === 0) {
        const coordRes = await query(
          `SELECT p.id, p.latitude, p.longitude FROM valuations v JOIN properties p ON v.property_id = p.id WHERE v.id = $1`,
          [valuationId]
        );
        const c = coordRes.rows[0];
        if (c?.latitude != null && c?.longitude != null) {
          await valuationDocumentService.generateLocationMap(valuationId, Number(c.latitude), Number(c.longitude), { propertyId: c.id });
        }
      }
    } catch (e: any) {
      logger.warn('Location map auto-generation skipped', { valuationId, error: e.message });
    }
    const documentImages = await valuationDocumentService.getImageBuffers(
      valuationId, ['location_map', 'photo', 'title_document']
    );

    // Load saved TipTap editor sections (user-edited report content)
    let editorSections: ReportSectionData['editorSections'] = undefined;
    try {
      const editorResult = await query(
        `SELECT content->'sections' AS sections FROM valuation_reports WHERE id = $1`,
        [reportId]
      );
      const savedSections = editorResult.rows[0]?.sections;
      if (savedSections && Array.isArray(savedSections) && savedSections.length > 0) {
        editorSections = savedSections;
        logger.info('Loaded saved TipTap editor sections for DOCX generation', {
          reportId,
          sectionCount: savedSections.length,
          sectionIds: savedSections.map((s: any) => s.id),
        });
      }
    } catch (err: any) {
      logger.warn('Failed to load editor sections, will use programmatic builder', { error: err.message });
    }

    // If the report was never hand-edited in the TipTap editor, render the SAME sections
    // the report viewer shows (reportTemplateService) rather than letting professionalDocxBuilder
    // re-assemble from raw DB (which diverges and shows N/A). The sealed PDF must match the
    // report that was reviewed and approved — not a freshly rebuilt one.
    if (!editorSections || editorSections.length === 0) {
      try {
        const generated = await reportTemplateService.generateReportSections(valuationId);
        if (generated && generated.length > 0) {
          editorSections = generated as ReportSectionData['editorSections'];
          logger.info('Using reportTemplateService sections for DOCX (no hand-edited content)', {
            reportId,
            sectionCount: generated.length,
          });
        }
      } catch (err: any) {
        logger.warn('Failed to generate template sections for DOCX, falling back to programmatic builder', {
          reportId,
          error: err.message,
        });
      }
    }

    return {
      cover,
      transmittal,
      certification,
      disclaimers,
      property: valuationReportData.property,
      legal,
      construction,
      externals,
      riskAssessment,
      inspection,
      engagement,
      valuation: valuationReportData.valuation,
      methods: valuationReportData.methods,
      comparables: valuationReportData.comparables || [],
      photos,
      documentImages,
      floorPlans,
      floorPlanImages,
      weightingRationale: (valuationReportData as any).weighting_rationale || null,
      editorSections,
    };
  }

  /**
   * Populate DOCX template with data
   */
  private async populateTemplate(
    templateName: string,
    data: ReportSectionData,
    qrCodeDataUrl: string
  ): Promise<Buffer> {
    const templatePath = path.join(TEMPLATES_DIR, `${templateName}.docx`);
    
    // Check if template exists, if not use fallback HTML-to-DOCX
    if (!fs.existsSync(templatePath)) {
      logger.info(`Template not found: ${templatePath}, using professional DOCX builder`);
      return buildProfessionalDocx(data);
    }

    // Use professional programmatic builder for ghis_standard (better formatting)
    if (templateName === 'ghis_standard') {
      logger.info('Using professional DOCX builder for ghis_standard template');
      return buildProfessionalDocx(data);
    }

    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);

    // Store image data for the image module
    const imageData: Record<string, Buffer> = {};
    
    // Add floor plan images to the image data map
    if (data.floorPlanImages && data.floorPlanImages.length > 0) {
      for (let i = 0; i < data.floorPlanImages.length; i++) {
        const fp = data.floorPlanImages[i];
        if (fp.imageBuffer) {
          imageData[`floor_plan_${i}`] = fp.imageBuffer;
          logger.debug('Added floor plan image to imageData', { 
            key: `floor_plan_${i}`, 
            size: fp.imageBuffer.length 
          });
        }
      }
    }

    // Configure image module for embedding images in DOCX
    const imageOpts = {
      centered: false,
      getImage: (tagValue: string) => {
        logger.debug('Image module getImage called', { tagValue });
        // tagValue will be the image key like "floor_plan_0"
        if (imageData[tagValue]) {
          return imageData[tagValue];
        }
        // Return a 1x1 transparent PNG if image not found
        return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
      },
      getSize: (img: Buffer, tagValue: string) => {
        // Return size in pixels [width, height]
        // For floor plans, use a reasonable size that fits the page
        logger.debug('Image module getSize called', { tagValue, imgSize: img?.length });
        return [450, 350]; // Width x Height in points (approx 6x4.5 inches)
      },
    };

    const imageModule = new ImageModule(imageOpts);

    // Configure docxtemplater with double curly brace delimiters and image module
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
      modules: [imageModule],
    });

    // Prepare template data
    const templateData = {
      // Cover page
      report_title: data.cover.title,
      report_subtitle: data.cover.subtitle,
      property_location: data.cover.property_location,
      ghana_post_address: data.cover.ghana_post_address || '',
      client_name: data.cover.requested_by.name,
      client_address: data.cover.requested_by.address,
      prepared_for_name: data.cover.prepared_for.name,
      prepared_for_address: data.cover.prepared_for.address,
      valuer_name: data.cover.certified_by.name,
      valuer_qualifications: data.cover.certified_by.qualifications,
      valuer_title: data.cover.certified_by.title,
      valuer_license: data.cover.certified_by.license_number || '',
      valuer_address: data.cover.certified_by.address,
      report_date: data.cover.date,

      // Transmittal
      transmittal_recipient: data.transmittal.recipient.name,
      transmittal_address: data.transmittal.recipient.address,
      transmittal_date: data.transmittal.date_formatted,
      transmittal_subject: data.transmittal.subject,
      transmittal_body: data.transmittal.body,
      methods_summary: data.transmittal.valuation_methods_summary,
      
      // Values
      market_value_ghs: data.transmittal.values.market_value.ghs_formatted,
      market_value_usd: data.transmittal.values.market_value.usd_formatted,
      forced_sale_value_ghs: data.transmittal.values.forced_sale_value.ghs_formatted,
      forced_sale_value_usd: data.transmittal.values.forced_sale_value.usd_formatted,
      exchange_rate: data.transmittal.exchange_rate.rate,
      exchange_source: data.transmittal.exchange_rate.source,
      exchange_date: data.transmittal.exchange_rate.date,

      // Property details
      property_type: data.property.type,
      property_address: data.property.address,
      property_city: data.property.city,
      property_region: data.property.region,
      property_size_sqm: data.property.size_sqm,
      land_area_sqm: data.property.land_area_sqm || 'N/A',
      bedrooms: data.property.bedrooms || 'N/A',
      bathrooms: data.property.bathrooms || 'N/A',
      year_built: data.property.year_built || 'N/A',
      property_condition: data.property.condition || 'N/A',

      // Legal
      tenure_type: data.legal.tenure_type,
      lease_term: data.legal.tenure_details.lease_term_years || 'N/A',
      remaining_years: data.legal.tenure_details.remaining_years || 'N/A',
      title_status: data.legal.title_registration.status,
      title_reference: data.legal.title_registration.reference || 'N/A',

      // Construction
      structure_type: data.construction.structure_type || 'N/A',
      walls: data.construction.walls || 'N/A',
      roofing: data.construction.roofing || 'N/A',
      flooring: data.construction.flooring || 'N/A',
      ceiling: data.construction.ceiling || 'N/A',
      windows: data.construction.windows || 'N/A',
      doors: data.construction.doors || 'N/A',
      age_years: data.construction.age_years || 'N/A',
      building_condition: data.construction.condition || 'N/A',

      // Services
      water_supply: data.externals.services.water_supply || 'N/A',
      electricity_supply: data.externals.services.electricity_supply || 'N/A',
      sewage_system: data.externals.services.sewage_system || 'N/A',

      // Risk assessment
      risk_items: data.riskAssessment.items,
      overall_risk: data.riskAssessment.overall_risk_level,

      // Inspection
      inspection_date: data.inspection.inspection_date,
      measurement_standard: data.inspection.measurement_standard,
      areas_inspected: data.inspection.areas_inspected.join(', '),
      limitations: data.inspection.limitations,

      // Engagement
      purpose: data.engagement.purpose,
      basis_of_value: data.engagement.basis_of_value,
      special_assumptions: data.engagement.special_assumptions,
      departures: data.engagement.departures,

      // Valuation
      valuation_date: data.valuation.date,
      valuation_purpose: data.valuation.purpose,
      final_value: data.valuation.final_value_formatted,
      value_range_low: data.valuation.value_low,
      value_range_high: data.valuation.value_high,
      confidence_score: Math.round(data.valuation.confidence_score * 100),
      confidence_grade: data.valuation.confidence_grade,
      primary_method: data.valuation.primary_method,

      // Methods (array)
      methods: data.methods.map(m => ({
        name: m.name,
        value: m.value_formatted,
        confidence: Math.round(m.confidence * 100),
        weight: Math.round(m.weight * 100),
      })),

      // Comparables (array)
      comparables: data.comparables.map(c => ({
        address: c.address,
        price: c.price_formatted,
        size: c.size_sqm,
        price_per_sqm: c.price_per_sqm,
        similarity: Math.round(c.similarity_score * 100),
      })),

      // Certification
      certification_text: data.certification.certification_text,
      disclosure_text: data.certification.disclosure,
      standards_compliance: data.certification.standards_compliance,

      // Disclaimers
      disclaimer_title: data.disclaimers.title,
      disclaimer_conditions: data.disclaimers.conditions,
      standards_references: data.disclaimers.standards_references,

      // Photos count
      photo_count: data.photos.length,
      has_photos: data.photos.length > 0,

      // Floor plans count and data
      floor_plan_count: data.floorPlans.length,
      has_floor_plans: data.floorPlans.length > 0,
      
      // Floor plan images for the template
      floor_plan_images: (data.floorPlanImages || []).map((fp, index) => ({
        label: fp.label || `Floor Plan ${index + 1}`,
        area: fp.area || '',
        filename: fp.imageUrl ? fp.imageUrl.split('/').pop()?.split('?')[0] || `floor_plan_${index + 1}.png` : `floor_plan_${index + 1}.png`,
        image: fp.imageBuffer ? `floor_plan_${index}` : null,
        has_image: !!fp.imageBuffer,
      })),

      // Schedule of accommodation (rooms from floor plans)
      accommodation_schedule: (data.floorPlans || []).flatMap((fp: any) => {
        const rooms = fp.rooms || [];
        logger.debug('Floor plan rooms', { 
          floor_label: fp.floor_label,
          floor_number: fp.floor_number,
          rooms_count: rooms.length,
        });
        return rooms.map((room: any) => {
          const areaSqm = parseFloat(room.area_sqm || room.area || 0);
          // Try to calculate dimensions from width/length if available
          const width = room.width_m || room.width || Math.sqrt(areaSqm).toFixed(1);
          const length = room.length_m || room.length || Math.sqrt(areaSqm).toFixed(1);
          return {
            floor: fp.floor_label || `Floor ${fp.floor_number}`,
            room_name: room.name || room.room_type || 'Room',
            dimensions: `${width} x ${length}`,
            area: areaSqm.toFixed(2),
            area_sqm: areaSqm.toFixed(2),
          };
        });
      }),
      total_floor_area: ((data.floorPlans || []).reduce((sum: number, fp: any) =>
        sum + parseFloat(fp.gross_building_area_sqm || 0), 0
      )).toFixed(2),

      // QR code
      verification_qr: qrCodeDataUrl,
    };

    logger.info('Template data prepared', { 
      floor_plans_count: data.floorPlans?.length || 0,
      accommodation_schedule_count: templateData.accommodation_schedule?.length || 0,
      floor_plan_images_count: templateData.floor_plan_images?.length || 0,
      sample_accommodation: templateData.accommodation_schedule?.slice(0, 2),
    });

    // Render template
    doc.render(templateData);

    // Generate buffer
    return doc.getZip().generate({ type: 'nodebuffer' });
  }

  /**
   * Generate a basic DOCX when no template is available
   */
  private generateBasicDocx(data: ReportSectionData): Buffer {
    // For now, create a minimal DOCX structure
    // In production, this would use a more sophisticated approach
    logger.info('Generating basic DOCX (no template)');

    // We'll use the existing HTML generation as a fallback
    // and note that a proper template should be created
    const htmlContent = this.generateHtmlReport(data);
    
    // Create a minimal DOCX with the content
    // This is a placeholder - in production, use a proper DOCX library
    const minimalDocx = this.createMinimalDocx(htmlContent);
    
    return minimalDocx;
  }

  /**
   * Generate HTML report content
   */
  private generateHtmlReport(data: ReportSectionData): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Valuation Report - ${data.property.address}</title>
</head>
<body>
  <h1>${data.cover.title}</h1>
  <h2>${data.cover.subtitle}</h2>
  <p><strong>Property:</strong> ${data.cover.property_location}</p>
  <p><strong>Date:</strong> ${data.cover.date}</p>
  
  <h2>Market Value</h2>
  <p>${data.transmittal.values.market_value.ghs_formatted}</p>
  
  <h2>Property Details</h2>
  <p>Type: ${data.property.type}</p>
  <p>Size: ${data.property.size_sqm} sqm</p>
  <p>Condition: ${data.property.condition || 'N/A'}</p>
  
  <h2>Valuation Methods</h2>
  <ul>
    ${data.methods.map(m => `<li>${m.name}: ${m.value_formatted}</li>`).join('\n')}
  </ul>
  
  <h2>Certification</h2>
  <p>${data.certification.certification_text}</p>
  
  <h2>Limiting Conditions</h2>
  <ul>
    ${data.disclaimers.conditions.map((c: string) => `<li>${c}</li>`).join('\n')}
  </ul>
  
  <p><strong>Certified by:</strong> ${data.cover.certified_by.name}</p>
  <p>${data.cover.certified_by.qualifications}</p>
</body>
</html>
    `;
  }

  /**
   * Create a minimal DOCX file
   * This is a fallback when no template exists
   */
  private createMinimalDocx(content: string): Buffer {
    // In production, this would create a proper DOCX
    // For now, return empty buffer as placeholder
    // The real implementation would use docx or another library
    logger.warn('Creating minimal DOCX - template file should be created');
    
    // Return an empty DOCX structure
    // This needs to be replaced with actual DOCX generation
    const zip = new PizZip();
    
    // Add minimal DOCX structure
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
    
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
    
    zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`);
    
    // Create document.xml with content
    const escapedContent = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">
  <w:body>
    <w:p>
      <w:r>
        <w:t>PROPMETRIK VALUATION REPORT</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Note: A proper template file should be created for full report generation.</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Please create templates/ghis_standard.docx with proper formatting.</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`);
    
    return zip.generate({ type: 'nodebuffer' });
  }

  /**
   * Generate QR code for verification URL
   */
  private async generateQRCode(url: string): Promise<string> {
    try {
      return await QRCode.toDataURL(url, {
        width: 150,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
    } catch (error) {
      logger.error('Failed to generate QR code', { url, error });
      return '';
    }
  }

  /**
   * Generate filename for the report
   */
  private generateFilename(report: any, property: any): string {
    const date = new Date().toISOString().split('T')[0];
    const propertyName = (property?.title || property?.address || 'property')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 30);
    return `valuation_report_${propertyName}_${date}_v${report.version}.docx`;
  }

  /**
   * Get report record
   */
  private async getReport(reportId: string): Promise<any> {
    const result = await query(
      `SELECT r.*, v.property_id
       FROM valuation_reports r
       JOIN valuations v ON r.valuation_id = v.id
       WHERE r.id = $1`,
      [reportId]
    );
    return result.rows[0];
  }

  /**
   * Get photos for a report
   */
  private async getReportPhotos(reportId: string): Promise<any[]> {
    const result = await query(
      `SELECT * FROM report_photos 
       WHERE report_id = $1 
       ORDER BY display_order ASC`,
      [reportId]
    );
    return result.rows;
  }

  /**
   * Get floor plans for a valuation
   */
  private async getFloorPlans(valuationId: string): Promise<any[]> {
    // Check if floor plans exist
    const result = await query(
      `SELECT * FROM valuation_floor_plans 
       WHERE valuation_id = $1 
       ORDER BY floor_number ASC`,
      [valuationId]
    );
    return result.rows;
  }

  /**
   * Get floor plan images with actual image data for embedding in DOCX
   */
  private async getFloorPlanImagesWithData(valuationId: string): Promise<Array<{
    label: string;
    area: string;
    imageBuffer: Buffer;
    imageUrl: string;
  }>> {
    try {
      // Get floor plans with presigned URLs
      const floorPlanImages = await floorPlanService.getImagesForValuation(valuationId);
      
      if (!floorPlanImages || floorPlanImages.length === 0) {
        return [];
      }

      // Fetch each image and convert to buffer
      const imagesWithData = await Promise.all(
        floorPlanImages.map(async (fp) => {
          let imageBuffer: Buffer | null = null;
          
          if (fp.imageUrl) {
            try {
              // Fetch image from presigned URL
              const response = await axios.get(fp.imageUrl, {
                responseType: 'arraybuffer',
                timeout: 30000, // 30 second timeout
              });
              imageBuffer = Buffer.from(response.data);
              logger.debug('Fetched floor plan image', { 
                planId: fp.planId, 
                size: imageBuffer.length 
              });
            } catch (fetchError: any) {
              logger.warn('Failed to fetch floor plan image', {
                planId: fp.planId,
                imageUrl: fp.imageUrl?.substring(0, 100),
                error: fetchError.message,
              });
            }
          }

          return {
            label: fp.floorLabel || `Floor ${fp.floorNumber}`,
            area: fp.grossBuildingAreaSqm ? `${fp.grossBuildingAreaSqm.toFixed(2)} sqm` : '',
            imageBuffer: imageBuffer!,
            imageUrl: fp.imageUrl || '',
          };
        })
      );

      // Filter out entries without image buffers
      return imagesWithData.filter(img => img.imageBuffer);
    } catch (error: any) {
      logger.error('Failed to get floor plan images with data', {
        valuationId,
        error: error.message,
      });
      return [];
    }
  }
}

// Export singleton instance
export const docGenerationService = new DocGenerationService();
