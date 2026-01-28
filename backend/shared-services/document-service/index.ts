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

        // Format date
        this.handlebars.registerHelper('formatDate', (date: Date | string, format: string = 'long') => {
            const d = new Date(date);
            if (format === 'short') {
                return d.toLocaleDateString('en-GH');
            } else if (format === 'long') {
                return d.toLocaleDateString('en-GH', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            }
            return d.toISOString();
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
     * Generate PDF from HTML content
     */
    async generateFromHTML(html: string, options?: {
        format?: 'A4' | 'Letter';
        margin?: { top: string; right: string; bottom: string; left: string };
        headerTemplate?: string;
        footerTemplate?: string;
    }): Promise<Buffer> {
        try {
            // Try using pdf-lib for basic PDF generation
            const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
            
            // For complex HTML, we'd use puppeteer, but for now use basic text extraction
            // This is a simplified version - production would use puppeteer
            const doc = await PDFDocument.create();
            const page = doc.addPage([595.28, 841.89]); // A4 size
            const font = await doc.embedFont(StandardFonts.Helvetica);
            
            // Strip HTML and render as text (simplified)
            const text = html.replace(/<[^>]*>/g, '\n').replace(/\n\s*\n/g, '\n').trim();
            const lines = text.split('\n').filter(line => line.trim());
            
            let y = 800;
            const lineHeight = 14;
            
            for (const line of lines) {
                if (y < 50) {
                    // Add new page
                    const newPage = doc.addPage([595.28, 841.89]);
                    y = 800;
                }
                page.drawText(line.substring(0, 80), { // Limit line length
                    x: 50,
                    y,
                    size: 11,
                    font,
                    color: rgb(0, 0, 0)
                });
                y -= lineHeight;
            }

            const pdfBytes = await doc.save();
            return Buffer.from(pdfBytes);
        } catch (error: any) {
            this.logger.error('Failed to generate PDF', { error: error.message });
            throw new Error(`Failed to generate PDF: ${error.message}`);
        }
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
