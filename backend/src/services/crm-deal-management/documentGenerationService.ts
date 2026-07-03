/**
 * Document Generation Service
 * Phase 5.10: E-Sign & Document Integration
 * 
 * Generates documents from templates by substituting merge fields with actual data.
 * Supports HTML-to-PDF conversion and MinIO storage.
 * 
 * @module services/crm-deal-management/documentGenerationService
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../../database';
import { logger } from '../../utils/logger';
import { crmDocumentTemplateService, DocumentTemplate } from './crmDocumentTemplateService';
import * as minio from '../../database/minio';
// import puppeteer from 'puppeteer';
// import Handlebars from 'handlebars';
const Handlebars: any = { compile: (html: string) => () => html, registerHelper: () => { } };
const puppeteer: any = { launch: () => ({ close: () => { }, newPage: () => ({ setContent: () => { }, pdf: () => Buffer.from([]) }) }) };

// =============================================
// Types
// =============================================

export interface GeneratedDocument {
  id: string;
  organization_id: string;
  template_id: string;
  template_name?: string;
  deal_id?: string;
  contact_id?: string;
  property_id?: string;
  file_url: string;
  file_name: string;
  file_size?: number;
  mime_type: string;
  merge_data: Record<string, any>;
  status: 'draft' | 'final' | 'signed' | 'expired' | 'voided';
  esign_envelope_id?: string;
  signing_url?: string;
  signed_at?: Date;
  signed_by?: string[];
  expires_at?: Date;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

export interface GenerateDocumentInput {
  templateId: string;
  dealId?: string;
  contactId?: string;
  propertyId?: string;
  unitId?: string;
  projectId?: string;
  customData?: Record<string, any>;
  outputFormat?: 'pdf' | 'html';
  fileName?: string;
}

export interface MergeData {
  deal?: Record<string, any>;
  contact?: Record<string, any>;
  property?: Record<string, any>;
  unit?: Record<string, any>;
  project?: Record<string, any>;
  agent?: Record<string, any>;
  organization?: Record<string, any>;
  current?: Record<string, any>;
  custom?: Record<string, any>;
}

// =============================================
// Service Class
// =============================================

class DocumentGenerationService {

  constructor() {
    this.registerHandlebarsHelpers();
  }

  /**
   * Register custom Handlebars helpers for template processing
   */
  private registerHandlebarsHelpers() {
    // Format currency (GHS by default)
    Handlebars.registerHelper('currency', function (value: number, currency = 'GHS') {
      if (typeof value !== 'number') return value;
      return new Intl.NumberFormat('en-GH', {
        style: 'currency',
        currency: currency
      }).format(value);
    });

    // Format date
    Handlebars.registerHelper('formatDate', function (date: Date | string, format = 'long') {
      if (!date) return '';
      const d = new Date(date);
      if (format === 'long') {
        return d.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        });
      }
      return d.toLocaleDateString('en-GB');
    });

    // Uppercase
    Handlebars.registerHelper('uppercase', function (str: string) {
      return str?.toUpperCase() || '';
    });

    // Lowercase
    Handlebars.registerHelper('lowercase', function (str: string) {
      return str?.toLowerCase() || '';
    });

    // Number to words (for amounts)
    Handlebars.registerHelper('numberToWords', function (num: number) {
      return numberToWords(num);
    });

    // Default value
    Handlebars.registerHelper('default', function (value: any, defaultValue: any) {
      return value ?? defaultValue;
    });

    // Conditional
    Handlebars.registerHelper('ifEquals', function (this: any, arg1: any, arg2: any, options: any) {
      return (arg1 === arg2) ? options.fn(this) : options.inverse(this);
    });
  }

  // =============================================
  // Document Generation
  // =============================================

  /**
   * Generate a document from a template
   */
  async generate(
    organizationId: string,
    input: GenerateDocumentInput,
    createdBy: string
  ): Promise<GeneratedDocument> {
    // Get template
    const template = await crmDocumentTemplateService.getById(input.templateId, organizationId);
    if (!template) {
      throw new Error(`Template not found: ${input.templateId}`);
    }

    if (!template.template_html) {
      throw new Error('Template has no HTML content');
    }

    // Gather merge data
    const mergeData = await this.gatherMergeData(organizationId, input);

    // Flatten merge data for template
    const flattenedData = this.flattenMergeData(mergeData);

    // Process template
    const processedHtml = this.processTemplate(template.template_html, flattenedData);

    // Generate PDF or keep as HTML
    let fileUrl: string;
    let fileName: string;
    let mimeType: string;
    let fileSize: number;

    const safeName = (template.name || 'document').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');
    const baseName = input.fileName || `${safeName}_${new Date().toISOString().split('T')[0]}`;

    if (input.outputFormat === 'html') {
      // Store as HTML
      fileName = `${baseName}.html`;
      mimeType = 'text/html';
      const htmlBuffer = Buffer.from(processedHtml, 'utf-8');
      fileSize = htmlBuffer.length;
      fileUrl = await this.storeDocument(organizationId, fileName, htmlBuffer, mimeType);
    } else {
      // Generate and store PDF
      fileName = `${baseName}.pdf`;
      mimeType = 'application/pdf';
      const pdfBuffer = await this.htmlToPdf(processedHtml, template);
      fileSize = pdfBuffer.length;
      fileUrl = await this.storeDocument(organizationId, fileName, pdfBuffer, mimeType);
    }

    // Create record
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO crm_generated_documents (
        id, organization_id, template_id, deal_id, contact_id,
        property_id, file_url, file_name, file_size, mime_type,
        merge_data, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft', $12)
      RETURNING *`,
      [
        id,
        organizationId,
        input.templateId,
        input.dealId || null,
        input.contactId || null,
        input.propertyId || null,
        fileUrl,
        fileName,
        fileSize,
        mimeType,
        JSON.stringify(mergeData),
        createdBy
      ]
    );

    // Update template use count
    await db.query(
      `UPDATE crm_document_templates 
       SET use_count = use_count + 1, last_used_at = NOW() 
       WHERE id = $1`,
      [input.templateId]
    );

    // Update deal document checklist if applicable
    if (input.dealId) {
      await this.updateDealChecklist(input.dealId, input.templateId, id);
    }

    logger.info({ documentId: id, templateId: input.templateId, dealId: input.dealId }, 'Document generated');

    return this.mapRow(result.rows[0], template.name);
  }

  /**
   * Preview document without saving
   */
  async preview(
    organizationId: string,
    input: GenerateDocumentInput
  ): Promise<{ html: string; mergeData: MergeData }> {
    const template = await crmDocumentTemplateService.getById(input.templateId, organizationId);
    if (!template) {
      throw new Error(`Template not found: ${input.templateId}`);
    }

    if (!template.template_html) {
      throw new Error('Template has no HTML content');
    }

    const mergeData = await this.gatherMergeData(organizationId, input);
    const flattenedData = this.flattenMergeData(mergeData);
    const processedHtml = this.processTemplate(template.template_html, flattenedData);

    return { html: processedHtml, mergeData };
  }

  /**
   * Render an arbitrary template string (e.g. a drip-campaign step subject/body)
   * against a contact/deal/property merge context, using the SAME gather → flatten →
   * Handlebars pipeline as generate()/preview(). Keeps a single merge-field engine
   * across generated documents and drip campaigns (no duplicated {{field}} rendering).
   *
   * `context` carries the merge ids only (no templateId needed — gatherMergeData does
   * not read it). Unresolved placeholders are stripped by processTemplate.
   */
  async renderString(
    organizationId: string,
    context: Pick<GenerateDocumentInput, 'dealId' | 'contactId' | 'propertyId' | 'unitId' | 'projectId' | 'customData'>,
    template: string
  ): Promise<string> {
    if (!template) return '';
    const mergeData = await this.gatherMergeData(organizationId, context as GenerateDocumentInput);
    const flattenedData = this.flattenMergeData(mergeData);
    return this.processTemplate(template, flattenedData);
  }

  /**
   * Get generated document by ID
   */
  async getById(documentId: string, organizationId: string): Promise<GeneratedDocument | null> {
    const result = await db.query(
      `SELECT gd.*, dt.name as template_name
       FROM crm_generated_documents gd
       LEFT JOIN crm_document_templates dt ON gd.template_id = dt.id
       WHERE gd.id = $1 AND gd.organization_id = $2`,
      [documentId, organizationId]
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0], result.rows[0].template_name);
  }

  /**
   * List generated documents for a deal
   */
  async listByDeal(
    dealId: string,
    organizationId: string
  ): Promise<GeneratedDocument[]> {
    const result = await db.query(
      `SELECT gd.*, dt.name as template_name
       FROM crm_generated_documents gd
       LEFT JOIN crm_document_templates dt ON gd.template_id = dt.id
       WHERE gd.deal_id = $1 AND gd.organization_id = $2
       ORDER BY gd.created_at DESC`,
      [dealId, organizationId]
    );

    return result.rows.map(row => this.mapRow(row, row.template_name));
  }

  /**
   * Update document status
   */
  async updateStatus(
    documentId: string,
    organizationId: string,
    status: 'draft' | 'final' | 'signed' | 'expired' | 'voided',
    additionalData?: {
      esign_envelope_id?: string;
      signing_url?: string;
      signed_at?: Date;
      signed_by?: string[];
    }
  ): Promise<GeneratedDocument | null> {
    const updates: string[] = ['status = $3', 'updated_at = NOW()'];
    const params: any[] = [documentId, organizationId, status];
    let paramIndex = 4;

    if (additionalData?.esign_envelope_id) {
      updates.push(`esign_envelope_id = $${paramIndex++}`);
      params.push(additionalData.esign_envelope_id);
    }
    if (additionalData?.signing_url) {
      updates.push(`signing_url = $${paramIndex++}`);
      params.push(additionalData.signing_url);
    }
    if (additionalData?.signed_at) {
      updates.push(`signed_at = $${paramIndex++}`);
      params.push(additionalData.signed_at);
    }
    if (additionalData?.signed_by) {
      updates.push(`signed_by = $${paramIndex++}`);
      params.push(JSON.stringify(additionalData.signed_by));
    }

    const result = await db.query(
      `UPDATE crm_generated_documents
       SET ${updates.join(', ')}
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  /**
   * Delete generated document
   */
  async delete(documentId: string, organizationId: string): Promise<boolean> {
    // Get document to delete file
    const doc = await this.getById(documentId, organizationId);
    if (!doc) return false;

    // Delete file from storage
    try {
      await minio.deleteFile(minio.buckets.documents, doc.file_url);
    } catch (err) {
      logger.warn({ documentId, error: err }, 'Failed to delete document file');
    }

    // Delete record
    const result = await db.query(
      `DELETE FROM crm_generated_documents WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [documentId, organizationId]
    );

    return result.rows.length > 0;
  }

  // =============================================
  // Deal Document Checklist
  // =============================================

  /**
   * Get document checklist for a deal
   */
  async getDealChecklist(dealId: string, organizationId: string): Promise<DealDocumentChecklistItem[]> {
    const result = await db.query(
      `SELECT dc.*, dt.name as template_name, dt.category as template_category,
              gd.file_url, gd.status as document_status
       FROM crm_deal_document_checklist dc
       LEFT JOIN crm_document_templates dt ON dc.template_id = dt.id
       LEFT JOIN crm_generated_documents gd ON dc.generated_document_id = gd.id
       WHERE dc.deal_id = $1 AND dc.organization_id = $2
       ORDER BY dc.order_index`,
      [dealId, organizationId]
    );

    return result.rows.map(row => ({
      id: row.id,
      deal_id: row.deal_id,
      requirement_id: row.requirement_id,
      template_id: row.template_id,
      template_name: row.template_name,
      template_category: row.template_category,
      document_name: row.document_name,
      status: row.status,
      is_required: row.is_required,
      is_blocking: row.is_blocking,
      order_index: row.order_index,
      generated_document_id: row.generated_document_id,
      file_url: row.file_url,
      document_status: row.document_status,
      completed_at: row.completed_at,
      completed_by: row.completed_by,
      notes: row.notes
    }));
  }

  /**
   * Initialize document checklist for a deal based on stage requirements
   */
  async initializeDealChecklist(
    dealId: string,
    stageId: string,
    organizationId: string
  ): Promise<number> {
    const result = await db.query(
      'SELECT initialize_deal_document_checklist($1, $2, $3) as count',
      [dealId, stageId, organizationId]
    );
    return result.rows[0]?.count || 0;
  }

  /**
   * Update checklist item status
   */
  async updateChecklistItem(
    itemId: string,
    organizationId: string,
    update: {
      status?: 'pending' | 'in_progress' | 'completed' | 'waived';
      notes?: string;
      completedBy?: string;
    }
  ): Promise<boolean> {
    const updates: string[] = ['updated_at = NOW()'];
    const params: any[] = [itemId, organizationId];
    let paramIndex = 3;

    if (update.status) {
      updates.push(`status = $${paramIndex++}`);
      params.push(update.status);

      if (update.status === 'completed' || update.status === 'waived') {
        updates.push(`completed_at = NOW()`);
        if (update.completedBy) {
          updates.push(`completed_by = $${paramIndex++}`);
          params.push(update.completedBy);
        }
      }
    }
    if (update.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      params.push(update.notes);
    }

    const result = await db.query(
      `UPDATE crm_deal_document_checklist
       SET ${updates.join(', ')}
       WHERE id = $1 AND organization_id = $2
       RETURNING id`,
      params
    );

    return result.rows.length > 0;
  }

  // =============================================
  // Private Helpers
  // =============================================

  /**
   * Gather merge data from various sources
   */
  private async gatherMergeData(
    organizationId: string,
    input: GenerateDocumentInput
  ): Promise<MergeData> {
    const data: MergeData = {
      current: {
        date: new Date().toLocaleDateString('en-GB'),
        date_long: new Date().toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        }),
        year: new Date().getFullYear().toString()
      },
      custom: input.customData || {}
    };

    // Fetch deal data
    if (input.dealId) {
      const dealResult = await db.query(
        `SELECT d.*, p.pipeline_name as pipeline_name, s.stage_name as stage_name
         FROM deals d
         LEFT JOIN deal_pipelines p ON d.pipeline_id = p.id
         LEFT JOIN deal_stages s ON d.stage_id = s.id
         WHERE d.id = $1 AND d.organization_id = $2`,
        [input.dealId, organizationId]
      );
      if (dealResult.rows[0]) {
        const deal = dealResult.rows[0];
        const dealValue = deal.deal_value ?? deal.value ?? 0;
        data.deal = {
          id: deal.id,
          title: deal.title,
          value: dealValue,
          value_formatted: new Intl.NumberFormat('en-GH', {
            style: 'currency',
            currency: deal.currency || 'GHS'
          }).format(dealValue),
          currency: deal.currency || 'GHS',
          expected_close_date: deal.estimated_close_date || deal.expected_close_date,
          pipeline_name: deal.pipeline_name,
          stage_name: deal.stage_name,
          custom_fields: deal.custom_fields || {}
        };

        // Get contact from deal if not specified
        if (!input.contactId && deal.primary_contact_id) {
          input.contactId = deal.primary_contact_id;
        }
        // Get property from deal if not specified — property_ids is an array
        if (!input.propertyId) {
          const propId = deal.property_id || (Array.isArray(deal.property_ids) ? deal.property_ids[0] : null);
          if (propId) {
            input.propertyId = propId;
          }
        }
      }
    }

    // Fetch contact data
    if (input.contactId) {
      const contactResult = await db.query(
        `SELECT * FROM contacts WHERE id = $1 AND organization_id = $2`,
        [input.contactId, organizationId]
      );
      if (contactResult.rows[0]) {
        const contact = contactResult.rows[0];
        const cf = (typeof contact.custom_fields === 'string' ? JSON.parse(contact.custom_fields) : contact.custom_fields) || {};
        data.contact = {
          id: contact.id,
          full_name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
          first_name: contact.first_name,
          last_name: contact.last_name,
          email: contact.email,
          phone: contact.primary_phone || contact.phone,
          address: contact.current_address || contact.address,
          city: contact.city,
          country: contact.country_of_residence || contact.country,
          ghana_card_number: cf.ghana_card_number || '',
          tin_number: cf.tin_number || '',
          passport_number: cf.passport_number || '',
          occupation: contact.occupation || cf.occupation || '',
          employer: contact.employer || cf.employer || '',
          custom_fields: cf
        };
      }
    }

    // Fetch property data
    if (input.propertyId) {
      const propResult = await db.query(
        `SELECT * FROM properties WHERE id = $1 AND organization_id = $2`,
        [input.propertyId, organizationId]
      );
      if (propResult.rows[0]) {
        const prop = propResult.rows[0];
        const meta = (typeof prop.metadata === 'string' ? JSON.parse(prop.metadata) : prop.metadata) || {};
        data.property = {
          id: prop.id,
          name: prop.title || prop.name || '',
          address: prop.address_street || prop.address || '',
          city: prop.address_city || prop.city || '',
          region: prop.region || '',
          ghana_post_gps: prop.digital_address || prop.ghana_post_gps || '',
          land_title: meta.land_title_number || meta.land_title || '',
          plot_number: meta.plot_number || '',
          block_number: meta.block_number || '',
          land_size: prop.plot_size_acres || prop.land_area_sqm || prop.land_size || '',
          land_size_unit: prop.plot_size_acres ? 'acres' : (prop.land_area_sqm ? 'sqm' : 'acres'),
          property_type: prop.property_type || '',
          price: prop.price,
          price_formatted: new Intl.NumberFormat('en-GH', {
            style: 'currency',
            currency: prop.price_currency || 'GHS'
          }).format(prop.price || 0),
          bedrooms: prop.bedrooms,
          bathrooms: prop.bathrooms,
          description: prop.description || ''
        };
      }
    }

    // Fetch unit data
    if (input.unitId) {
      const unitResult = await db.query(
        `SELECT u.*, p.name as project_name
         FROM project_units u
         LEFT JOIN projects p ON u.project_id = p.id
         WHERE u.id = $1 AND u.organization_id = $2`,
        [input.unitId, organizationId]
      );
      if (unitResult.rows[0]) {
        const unit = unitResult.rows[0];
        data.unit = {
          id: unit.id,
          number: unit.unit_number,
          type: unit.unit_type,
          floor: unit.floor,
          bedrooms: unit.bedrooms,
          bathrooms: unit.bathrooms,
          size: unit.size,
          price: unit.price,
          price_formatted: new Intl.NumberFormat('en-GH', {
            style: 'currency',
            currency: 'GHS'
          }).format(unit.price || 0),
          project_name: unit.project_name
        };
      }
    }

    // Fetch project data
    if (input.projectId) {
      const projResult = await db.query(
        `SELECT * FROM projects WHERE id = $1 AND organization_id = $2`,
        [input.projectId, organizationId]
      );
      if (projResult.rows[0]) {
        const proj = projResult.rows[0];
        data.project = {
          id: proj.id,
          name: proj.name,
          location: proj.location,
          description: proj.description,
          developer: proj.developer,
          total_units: proj.total_units,
          available_units: proj.available_units
        };
      }
    }

    // Fetch organization data
    const orgResult = await db.query(
      `SELECT * FROM organizations WHERE id = $1`,
      [organizationId]
    );
    if (orgResult.rows[0]) {
      const org = orgResult.rows[0];
      const addressParts = [
        org.address_line1 || org.address_street || '',
        org.address_line2 || '',
        org.city || org.address_city || '',
        org.region || org.address_region || '',
        org.country || ''
      ].filter(Boolean);
      data.organization = {
        name: org.name,
        address: addressParts.join(', ') || org.address || '',
        phone: org.phone,
        email: org.email,
        website: org.website,
        logo_url: org.logo_url
      };
    }

    return data;
  }

  /**
   * Flatten merge data for template substitution
   * Converts nested object to dot notation keys
   */
  private flattenMergeData(data: MergeData): Record<string, any> {
    const flat: Record<string, any> = {};

    for (const [category, fields] of Object.entries(data)) {
      if (fields && typeof fields === 'object') {
        for (const [key, value] of Object.entries(fields)) {
          flat[`${category}.${key}`] = value;
          // Also add without prefix for convenience
          if (!flat[key]) {
            flat[key] = value;
          }
        }
        // Add the category object itself
        flat[category] = fields;
      }
    }

    return flat;
  }

  /**
   * Process template with merge data
   */
  private processTemplate(templateHtml: string, data: Record<string, any>): string {
    // Replace {{field.subfield}} patterns
    let processed = templateHtml.replace(
      /\{\{([a-zA-Z0-9_.]+)\}\}/g,
      (match, fieldPath) => {
        const value = this.getNestedValue(data, fieldPath);
        return value !== undefined ? String(value) : match;
      }
    );

    // Compile with Handlebars for advanced features
    try {
      const template = Handlebars.compile(processed);
      processed = template(data);
    } catch (err) {
      logger.warn({ error: err }, 'Handlebars compilation failed, using simple substitution');
    }

    // Remove any remaining unresolved placeholders
    processed = processed.replace(/\{\{[a-zA-Z0-9_.]+\}\}/g, '');

    return processed;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: Record<string, any>, path: string): any {
    const parts = path.split('.');
    let current: any = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = current[part];
    }

    return current;
  }

  /**
   * Convert HTML to PDF using Puppeteer
   */
  private async htmlToPdf(html: string, template: DocumentTemplate): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();

      // Set content with base styles
      const styledHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            @page {
              size: A4;
              margin: 25mm 20mm;
            }
            body {
              font-family: 'Times New Roman', Times, serif;
              font-size: 12pt;
              line-height: 1.6;
              color: #000;
            }
            h1 { font-size: 18pt; text-align: center; margin-bottom: 20pt; }
            h2 { font-size: 14pt; margin-top: 16pt; }
            p { margin: 8pt 0; text-align: justify; }
            .signature-line { 
              border-top: 1px solid #000; 
              width: 200px; 
              margin-top: 40px; 
              padding-top: 5px;
            }
            table { width: 100%; border-collapse: collapse; margin: 12pt 0; }
            th, td { border: 1px solid #000; padding: 8px; text-align: left; }
            .header { text-align: center; margin-bottom: 20pt; }
            .footer { position: fixed; bottom: 0; text-align: center; font-size: 10pt; }
          </style>
        </head>
        <body>
          ${html}
        </body>
        </html>
      `;

      await page.setContent(styledHtml, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '25mm',
          right: '20mm',
          bottom: '25mm',
          left: '20mm'
        }
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  /**
   * Store document in MinIO
   */
  private async storeDocument(
    organizationId: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<string> {
    const key = `${organizationId}/documents/${Date.now()}_${fileName}`;

    try {
      const { key: uploadedKey } = await minio.uploadFile(minio.buckets.documents, key, buffer, mimeType);
      return uploadedKey;
    } catch (err) {
      // Fallback: save locally if storage service fails
      logger.error({ error: err }, 'Failed to upload to storage, saving URL reference');
      return key;
    }
  }

  /**
   * Update deal document checklist when a document is generated
   */
  private async updateDealChecklist(
    dealId: string,
    templateId: string,
    generatedDocumentId: string
  ): Promise<void> {
    await db.query(
      `UPDATE crm_deal_document_checklist
       SET generated_document_id = $3,
           status = 'completed',
           completed_at = NOW(),
           updated_at = NOW()
       WHERE deal_id = $1 AND template_id = $2 AND generated_document_id IS NULL`,
      [dealId, templateId, generatedDocumentId]
    );
  }

  private mapRow(row: any, templateName?: string): GeneratedDocument {
    return {
      id: row.id,
      organization_id: row.organization_id,
      template_id: row.template_id,
      template_name: templateName || row.template_name,
      deal_id: row.deal_id,
      contact_id: row.contact_id,
      property_id: row.property_id,
      file_url: row.file_url,
      file_name: row.file_name,
      file_size: row.file_size,
      mime_type: row.mime_type,
      merge_data: typeof row.merge_data === 'string'
        ? JSON.parse(row.merge_data)
        : row.merge_data || {},
      status: row.status,
      esign_envelope_id: row.esign_envelope_id,
      signing_url: row.signing_url,
      signed_at: row.signed_at,
      signed_by: row.signed_by,
      expires_at: row.expires_at,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

// =============================================
// Additional Types
// =============================================

export interface DealDocumentChecklistItem {
  id: string;
  deal_id: string;
  requirement_id?: string;
  template_id?: string;
  template_name?: string;
  template_category?: string;
  document_name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'waived';
  is_required: boolean;
  is_blocking: boolean;
  order_index: number;
  generated_document_id?: string;
  file_url?: string;
  document_status?: string;
  completed_at?: Date;
  completed_by?: string;
  notes?: string;
}

// =============================================
// Helper Functions
// =============================================

/**
 * Convert number to words (for legal documents)
 */
function numberToWords(num: number): string {
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  if (num === 0) return 'zero';
  if (num < 0) return 'minus ' + numberToWords(Math.abs(num));

  let words = '';

  if (Math.floor(num / 1000000000) > 0) {
    words += numberToWords(Math.floor(num / 1000000000)) + ' billion ';
    num %= 1000000000;
  }

  if (Math.floor(num / 1000000) > 0) {
    words += numberToWords(Math.floor(num / 1000000)) + ' million ';
    num %= 1000000;
  }

  if (Math.floor(num / 1000) > 0) {
    words += numberToWords(Math.floor(num / 1000)) + ' thousand ';
    num %= 1000;
  }

  if (Math.floor(num / 100) > 0) {
    words += ones[Math.floor(num / 100)] + ' hundred ';
    num %= 100;
  }

  if (num > 0) {
    if (words !== '') words += 'and ';
    if (num < 20) {
      words += ones[num];
    } else {
      words += tens[Math.floor(num / 10)];
      if (num % 10 > 0) {
        words += '-' + ones[num % 10];
      }
    }
  }

  return words.trim();
}

// =============================================
// Export Singleton
// =============================================

export const documentGenerationService = new DocumentGenerationService();
export default documentGenerationService;
