/**
 * Unified Document Service
 * Shared service for document management across all modules
 * 
 * Features:
 * - File upload/download to MinIO/S3
 * - Document metadata management
 * - Template-based document generation
 * - PDF generation
 * - Version control
 * 
 * @module shared-services/document-service
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// =====================================================
// INTERFACES
// =====================================================

export interface DocumentServiceConfig {
    endpoint?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    bucket?: string;
    urlExpiry?: number; // seconds
}

export interface UploadDocumentParams {
    file: Buffer;
    filename: string;
    mimeType: string;
    organizationId: string;
    module: 'property-management' | 'crm' | 'projects' | 'valuation' | 'general';
    entityType?: string; // e.g., 'tenant', 'property', 'lease'
    entityId?: string;
    metadata?: Record<string, string>;
    isPublic?: boolean;
}

export interface DocumentInfo {
    id: string;
    key: string;
    filename: string;
    mimeType: string;
    size: number;
    hash: string;
    organizationId: string;
    module: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, string>;
    url?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface GenerateDocumentParams {
    templateId: string;
    data: Record<string, any>;
    format: 'pdf' | 'docx' | 'html';
    filename?: string;
}

export interface TemplateInfo {
    id: string;
    name: string;
    description?: string;
    content: string;
    format: 'handlebars' | 'mustache' | 'html';
    variables: string[];
    organizationId: string;
    module: string;
    createdAt: Date;
    updatedAt: Date;
}

// =====================================================
// DOCUMENT STORAGE SERVICE
// =====================================================

export class DocumentStorageService {
    private s3Client: S3Client;
    private bucket: string;
    private urlExpiry: number;
    private logger: { info: Function; warn: Function; error: Function };

    constructor(config?: DocumentServiceConfig, logger?: any) {
        // Parse MinIO URL or use individual settings
        const minioUrl = process.env.MINIO_URL || '';
        let endpoint = config?.endpoint;
        let accessKeyId = config?.accessKeyId;
        let secretAccessKey = config?.secretAccessKey;

        // Parse credentials from URL if present
        if (minioUrl && !endpoint) {
            try {
                const url = new URL(minioUrl);
                endpoint = `${url.protocol}//${url.host}`;
                if (url.username && url.password) {
                    accessKeyId = url.username;
                    secretAccessKey = decodeURIComponent(url.password);
                }
            } catch (e) {
                // Invalid URL, use defaults
            }
        }

        this.s3Client = new S3Client({
            endpoint: endpoint || process.env.MINIO_ENDPOINT || 'http://localhost:9000',
            region: config?.region || process.env.MINIO_REGION || 'us-east-1',
            credentials: {
                accessKeyId: accessKeyId || process.env.MINIO_ACCESS_KEY || '',
                secretAccessKey: secretAccessKey || process.env.MINIO_SECRET_KEY || ''
            },
            forcePathStyle: true // Required for MinIO
        });

        this.bucket = config?.bucket || process.env.MINIO_BUCKET_DOCUMENTS || 'propmetrik-documents';
        this.urlExpiry = config?.urlExpiry || 3600; // 1 hour default
        this.logger = logger || console;
    }

    /**
     * Upload a document to storage
     */
    async upload(params: UploadDocumentParams): Promise<DocumentInfo> {
        const id = uuidv4();
        const hash = crypto.createHash('sha256').update(params.file).digest('hex');
        
        // Build storage key: module/org/entityType/entityId/id_filename
        const keyParts = [
            params.module,
            params.organizationId,
            params.entityType || 'general',
            params.entityId || 'unassigned',
            `${id}_${params.filename}`
        ];
        const key = keyParts.join('/');

        try {
            const command = new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: params.file,
                ContentType: params.mimeType,
                Metadata: {
                    ...params.metadata,
                    'x-organization-id': params.organizationId,
                    'x-entity-type': params.entityType || '',
                    'x-entity-id': params.entityId || '',
                    'x-original-filename': params.filename,
                    'x-document-id': id,
                    'x-content-hash': hash
                }
            });

            await this.s3Client.send(command);

            this.logger.info('Document uploaded', { id, key, filename: params.filename });

            return {
                id,
                key,
                filename: params.filename,
                mimeType: params.mimeType,
                size: params.file.length,
                hash,
                organizationId: params.organizationId,
                module: params.module,
                entityType: params.entityType,
                entityId: params.entityId,
                metadata: params.metadata,
                createdAt: new Date(),
                updatedAt: new Date()
            };
        } catch (error: any) {
            this.logger.error('Failed to upload document', { error: error.message, key });
            throw new Error(`Failed to upload document: ${error.message}`);
        }
    }

    /**
     * Get a signed URL for downloading a document
     */
    async getDownloadUrl(key: string, expiresIn?: number): Promise<string> {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucket,
                Key: key
            });

            const url = await getSignedUrl(this.s3Client, command, {
                expiresIn: expiresIn || this.urlExpiry
            });

            return url;
        } catch (error: any) {
            this.logger.error('Failed to generate download URL', { error: error.message, key });
            throw new Error(`Failed to generate download URL: ${error.message}`);
        }
    }

    /**
     * Get a signed URL for uploading (direct client upload)
     */
    async getUploadUrl(key: string, mimeType: string, expiresIn?: number): Promise<string> {
        try {
            const command = new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                ContentType: mimeType
            });

            const url = await getSignedUrl(this.s3Client, command, {
                expiresIn: expiresIn || 300 // 5 minutes for uploads
            });

            return url;
        } catch (error: any) {
            this.logger.error('Failed to generate upload URL', { error: error.message, key });
            throw new Error(`Failed to generate upload URL: ${error.message}`);
        }
    }

    /**
     * Download a document
     */
    async download(key: string): Promise<{ buffer: Buffer; contentType: string }> {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucket,
                Key: key
            });

            const response = await this.s3Client.send(command);
            const chunks: Buffer[] = [];
            
            // @ts-ignore - Body is a readable stream
            for await (const chunk of response.Body) {
                chunks.push(chunk);
            }

            return {
                buffer: Buffer.concat(chunks),
                contentType: response.ContentType || 'application/octet-stream'
            };
        } catch (error: any) {
            this.logger.error('Failed to download document', { error: error.message, key });
            throw new Error(`Failed to download document: ${error.message}`);
        }
    }

    /**
     * Delete a document
     */
    async delete(key: string): Promise<void> {
        try {
            const command = new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: key
            });

            await this.s3Client.send(command);
            this.logger.info('Document deleted', { key });
        } catch (error: any) {
            this.logger.error('Failed to delete document', { error: error.message, key });
            throw new Error(`Failed to delete document: ${error.message}`);
        }
    }

    /**
     * Check if a document exists
     */
    async exists(key: string): Promise<boolean> {
        try {
            const command = new HeadObjectCommand({
                Bucket: this.bucket,
                Key: key
            });

            await this.s3Client.send(command);
            return true;
        } catch (error: any) {
            if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
                return false;
            }
            throw error;
        }
    }

    /**
     * Get document metadata
     */
    async getMetadata(key: string): Promise<Record<string, string>> {
        try {
            const command = new HeadObjectCommand({
                Bucket: this.bucket,
                Key: key
            });

            const response = await this.s3Client.send(command);
            return response.Metadata || {};
        } catch (error: any) {
            this.logger.error('Failed to get document metadata', { error: error.message, key });
            throw new Error(`Failed to get document metadata: ${error.message}`);
        }
    }
}

// =====================================================
// TEMPLATE SERVICE (Handlebars-based)
// =====================================================

export class TemplateService {
    private handlebars: any;
    private templates: Map<string, any> = new Map();
    private logger: { info: Function; warn: Function; error: Function };

    constructor(logger?: any) {
        this.logger = logger || console;

        // Lazy load handlebars
        try {
            this.handlebars = require('handlebars');
            this.registerHelpers();
        } catch (e) {
            this.logger.warn('Handlebars not installed. Template rendering will be limited.');
            this.handlebars = null;
        }
    }

    /**
     * Register common Handlebars helpers
     */
    private registerHelpers(): void {
        if (!this.handlebars) return;

        // Format currency
        this.handlebars.registerHelper('currency', (value: number, currencyCode: string = 'GHS') => {
            return new Intl.NumberFormat('en-GH', {
                style: 'currency',
                currency: currencyCode
            }).format(value);
        });

        // Format number (no currency symbol)
        this.handlebars.registerHelper('formatNumber', (value: number) => {
            if (value === null || value === undefined || isNaN(value)) return '0';
            return new Intl.NumberFormat('en-GH').format(value);
        });

        // Format date.
        // NOTE: Handlebars passes an `options` object as the final argument, so a
        // call like `{{formatDate someDate}}` (no explicit format) receives that
        // object as `format` — NOT undefined. Guard with a typeof check, otherwise
        // the default never applies and the helper would fall through to a raw ISO
        // string (the cause of leases printing `2026-06-06T04:00:00.000Z`).
        this.handlebars.registerHelper('formatDate', (date: Date | string, format?: unknown) => {
            const fmt = typeof format === 'string' ? format : 'long';
            const d = new Date(date);
            if (isNaN(d.getTime())) return '';
            if (fmt === 'short') {
                return d.toLocaleDateString('en-GH'); // dd/mm/yyyy
            }
            if (fmt === 'medium') {
                return d.toLocaleDateString('en-GH', { year: 'numeric', month: 'long', day: 'numeric' }); // 6 June 2026
            }
            return d.toLocaleDateString('en-GH', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        });

        // Humanize an enum/slug value: "apartment_flat" -> "Apartment Flat"
        this.handlebars.registerHelper('humanize', (value: unknown) => {
            return String(value == null ? '' : value)
                .replace(/[_-]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .replace(/\b\w/g, (c) => c.toUpperCase());
        });

        // Map a currency code to its full name for amount-in-words clauses.
        this.handlebars.registerHelper('currencyName', (code: unknown) => {
            const map: Record<string, string> = {
                USD: 'United States Dollars',
                GHS: 'Ghana Cedis',
                EUR: 'Euros',
                GBP: 'Pounds Sterling',
                NGN: 'Nigerian Naira'
            };
            const key = String(code == null ? '' : code).toUpperCase();
            return map[key] || String(code == null ? '' : code);
        });

        // Uppercase
        this.handlebars.registerHelper('uppercase', (str: string) => {
            return (str || '').toUpperCase();
        });

        // Lowercase
        this.handlebars.registerHelper('lowercase', (str: string) => {
            return (str || '').toLowerCase();
        });

        // Conditional equals
        this.handlebars.registerHelper('eq', (a: any, b: any) => a === b);

        // Math operations
        this.handlebars.registerHelper('add', (a: number, b: number) => a + b);
        this.handlebars.registerHelper('subtract', (a: number, b: number) => a - b);
        this.handlebars.registerHelper('multiply', (a: number, b: number) => a * b);
        this.handlebars.registerHelper('divide', (a: number, b: number) => a / b);

        // Ordinal suffix
        this.handlebars.registerHelper('ordinal', (n: number) => {
            const s = ['th', 'st', 'nd', 'rd'];
            const v = n % 100;
            return n + (s[(v - 20) % 10] || s[v] || s[0]);
        });
    }

    /**
     * Compile and cache a template
     */
    compileTemplate(id: string, content: string): void {
        if (!this.handlebars) {
            throw new Error('Handlebars not available');
        }

        const compiled = this.handlebars.compile(content);
        this.templates.set(id, compiled);
        this.logger.info('Template compiled', { id });
    }

    /**
     * Render a template with data
     */
    render(templateIdOrContent: string, data: Record<string, any>): string {
        if (!this.handlebars) {
            throw new Error('Handlebars not available');
        }

        // Check if it's a cached template
        let compiled = this.templates.get(templateIdOrContent);

        if (!compiled) {
            // Assume it's raw template content
            compiled = this.handlebars.compile(templateIdOrContent);
        }

        return compiled(data);
    }

    /**
     * Extract variables from a template
     */
    extractVariables(content: string): string[] {
        const regex = /\{\{([^}]+)\}\}/g;
        const variables: Set<string> = new Set();
        let match;

        while ((match = regex.exec(content)) !== null) {
            // Extract variable name, ignore helpers
            const varMatch = match[1].trim();
            if (!varMatch.startsWith('#') && !varMatch.startsWith('/') && !varMatch.startsWith('!')) {
                // Get the first word (variable name)
                const varName = varMatch.split(/\s+/)[0];
                if (!['if', 'unless', 'each', 'with', 'else'].includes(varName)) {
                    variables.add(varName);
                }
            }
        }

        return Array.from(variables);
    }
}

// =====================================================
// PDF GENERATION SERVICE
// =====================================================

export class PDFGenerationService {
    private logger: { info: Function; warn: Function; error: Function };

    constructor(logger?: any) {
        this.logger = logger || console;
    }

    /**
     * Generate PDF from HTML content using Puppeteer for proper rendering
     */
    async generateFromHTML(html: string, options?: {
        format?: 'A4' | 'Letter';
        margin?: { top: string; right: string; bottom: string; left: string };
        headerTemplate?: string;
        footerTemplate?: string;
    }): Promise<Buffer> {
        try {
            // Replace Unicode characters that might cause issues
            let sanitizedHtml = html
                .replace(/₵/g, 'GHS ')
                .replace(/€/g, 'EUR ')
                .replace(/£/g, 'GBP ')
                .replace(/¥/g, 'JPY ')
                .replace(/₦/g, 'NGN ');

            // Try Puppeteer first for proper HTML rendering
            try {
                const puppeteer = await import('puppeteer');
                const browser = await puppeteer.default.launch({
                    headless: true,
                    // Use the system Chromium installed in the Docker image (Alpine);
                    // falls back to Puppeteer's bundled binary when the env var is unset (local dev).
                    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
                    // --disable-dev-shm-usage: containers have a tiny /dev/shm; without this
                    // Chromium crashes on larger pages. --disable-gpu for headless servers.
                    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
                });
                
                const page = await browser.newPage();
                
                // Set the HTML content with proper styling
                await page.setContent(sanitizedHtml, {
                    waitUntil: 'load'
                });
                
                // Generate PDF with proper formatting
                const pdfBuffer = await page.pdf({
                    format: options?.format || 'A4',
                    margin: options?.margin || {
                        top: '2.5cm',
                        right: '2.5cm',
                        bottom: '2.5cm',
                        left: '2.5cm'
                    },
                    printBackground: true,
                    displayHeaderFooter: false
                });
                
                await browser.close();
                
                this.logger.info('PDF generated successfully with Puppeteer');
                return Buffer.from(pdfBuffer);
            } catch (puppeteerError: any) {
                this.logger.warn('Puppeteer not available, falling back to pdf-lib', { error: puppeteerError.message });
                // Fall back to pdf-lib for basic rendering
                return this.generateWithPdfLib(sanitizedHtml);
            }
        } catch (error: any) {
            this.logger.error('Failed to generate PDF', { error: error.message });
            throw new Error(`Failed to generate PDF: ${error.message}`);
        }
    }

    /**
     * Fallback PDF generation using pdf-lib (basic text rendering)
     */
    private async generateWithPdfLib(html: string): Promise<Buffer> {
        const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
        
        const doc = await PDFDocument.create();
        let page = doc.addPage([595.28, 841.89]); // A4 size
        const font = await doc.embedFont(StandardFonts.Helvetica);
        const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
        
        // Strip HTML tags but try to preserve structure
        const text = html
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style tags
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n\n')
            .replace(/<\/div>/gi, '\n')
            .replace(/<\/h[1-6]>/gi, '\n\n')
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            .trim();

        // pdf-lib's StandardFonts are WinAnsi-encoded and THROW on any character they
        // cannot encode (smart quotes, en/em dashes, ellipsis, accented names, the Cedi
        // sign, etc.). Real lease data routinely contains these, so normalise to
        // WinAnsi-safe ASCII before drawing — otherwise generation 500s.
        const lines = this.toWinAnsiSafe(text).split('\n');
        
        let y = 780;
        const lineHeight = 14;
        const marginLeft = 72; // 1 inch = 72 points
        const pageWidth = 595.28 - 144; // A4 width minus margins
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) {
                y -= lineHeight / 2;
                continue;
            }
            
            if (y < 72) {
                page = doc.addPage([595.28, 841.89]);
                y = 780;
            }
            
            // Word wrap long lines
            const words = trimmedLine.split(' ');
            let currentLine = '';
            
            for (const word of words) {
                const testLine = currentLine ? `${currentLine} ${word}` : word;
                const textWidth = font.widthOfTextAtSize(testLine, 11);
                
                if (textWidth > pageWidth && currentLine) {
                    page.drawText(currentLine, {
                        x: marginLeft,
                        y,
                        size: 11,
                        font,
                        color: rgb(0, 0, 0)
                    });
                    y -= lineHeight;
                    currentLine = word;
                    
                    if (y < 72) {
                        page = doc.addPage([595.28, 841.89]);
                        y = 780;
                    }
                } else {
                    currentLine = testLine;
                }
            }
            
            if (currentLine) {
                page.drawText(currentLine, {
                    x: marginLeft,
                    y,
                    size: 11,
                    font,
                    color: rgb(0, 0, 0)
                });
                y -= lineHeight;
            }
        }

        const pdfBytes = await doc.save();
        return Buffer.from(pdfBytes);
    }

    /**
     * Normalise text to characters the WinAnsi-encoded StandardFonts can draw.
     * Maps common typographic punctuation to ASCII, transliterates accents, and
     * replaces any remaining out-of-range codepoint so pdf-lib never throws.
     */
    private toWinAnsiSafe(input: string): string {
        return input
            // Smart quotes / apostrophes
            .replace(/[‘’‚‛]/g, "'")
            .replace(/[“”„‟]/g, '"')
            // Dashes & ellipsis
            .replace(/[‐-―]/g, '-')
            .replace(/…/g, '...')
            // Spaces & misc
            .replace(/[   ]/g, ' ')
            .replace(/•/g, '-')
            // Currency
            .replace(/₵/g, 'GHS ')
            .replace(/₦/g, 'NGN ')
            // Strip accents (é → e) where possible
            .normalize('NFKD').replace(/[̀-ͯ]/g, '')
            // Anything still outside the Latin-1 range the font can't encode → '?'
            .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '?');
    }

    /**
     * Generate PDF from template + data
     */
    async generateFromTemplate(
        templateContent: string,
        data: Record<string, any>,
        templateService: TemplateService,
        options?: any
    ): Promise<Buffer> {
        const html = templateService.render(templateContent, data);
        return this.generateFromHTML(html, options);
    }
}

// =====================================================
// UNIFIED DOCUMENT SERVICE
// =====================================================

export class UnifiedDocumentService {
    public storage: DocumentStorageService;
    public template: TemplateService;
    public pdf: PDFGenerationService;

    constructor(config?: DocumentServiceConfig, logger?: any) {
        this.storage = new DocumentStorageService(config, logger);
        this.template = new TemplateService(logger);
        this.pdf = new PDFGenerationService(logger);
    }

    /**
     * Generate a document from template and save to storage
     */
    async generateAndStore(params: {
        templateContent: string;
        data: Record<string, any>;
        filename: string;
        organizationId: string;
        module: 'property-management' | 'crm' | 'projects' | 'valuation' | 'general';
        entityType?: string;
        entityId?: string;
        format?: 'pdf' | 'html';
    }): Promise<DocumentInfo> {
        const format = params.format || 'pdf';
        let buffer: Buffer;
        let mimeType: string;

        if (format === 'pdf') {
            buffer = await this.pdf.generateFromTemplate(
                params.templateContent,
                params.data,
                this.template
            );
            mimeType = 'application/pdf';
        } else {
            const html = this.template.render(params.templateContent, params.data);
            buffer = Buffer.from(html, 'utf-8');
            mimeType = 'text/html';
        }

        return this.storage.upload({
            file: buffer,
            filename: params.filename,
            mimeType,
            organizationId: params.organizationId,
            module: params.module,
            entityType: params.entityType,
            entityId: params.entityId
        });
    }
}

// Singleton instances
export const documentStorageService = new DocumentStorageService();
export const templateService = new TemplateService();
export const pdfService = new PDFGenerationService();
export const documentService = new UnifiedDocumentService();
