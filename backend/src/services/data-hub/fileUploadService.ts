/**
 * File Upload Service
 * Handles parsing and processing of uploaded CSV, Excel, and PDF files
 */

import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import XLSX from 'xlsx';
const pdfParse = require('pdf-parse');
import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { cleanupFile } from '../../middleware/file-upload';
import { getFile, deleteFile } from '../../database/minio';
import crypto from 'crypto';

export interface FileUpload {
    id: string;
    source_id: string;
    file_name: string;
    file_type: 'csv' | 'excel' | 'pdf';
    file_size_bytes: number;
    file_path: string;
    original_name: string;
    mime_type: string;
    upload_status: 'pending' | 'parsing' | 'validating' | 'processing' | 'completed' | 'failed' | 'cancelled';
    rows_detected: number | null;
    columns_detected: number | null;
    preview_data: any[] | null;
    column_mapping: Record<string, string> | null;
    records_imported: number;
    records_failed: number;
    records_skipped: number;
    error_message: string | null;
    error_details: any | null;
    etl_job_id: string | null;
    uploaded_by: string;
    processed_at: Date | null;
    deleted_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

export interface CreateFileUploadInput {
    source_id: string;
    file_name: string;
    file_type: 'csv' | 'excel' | 'pdf';
    file_size_bytes: number;
    file_path: string;
    original_name: string;
    mime_type: string;
    uploaded_by: string;
    dataset_type?: string;
    source_tier?: string;
}

export interface ParsedFileData {
    rows: any[];
    columns: string[];
    rowCount: number;
    preview: any[];
}

class FileUploadService {
    private parseMinioPath(filePath: string): { bucket: string; key: string } | null {
        if (!filePath || typeof filePath !== 'string') return null;
        if (!filePath.startsWith('minio://')) return null;

        const withoutScheme = filePath.slice('minio://'.length);
        const firstSlash = withoutScheme.indexOf('/');
        if (firstSlash <= 0) return null;

        const bucket = withoutScheme.slice(0, firstSlash);
        const key = withoutScheme.slice(firstSlash + 1);
        if (!bucket || !key) return null;
        return { bucket, key };
    }

    private async materializeToLocalPath(fileUpload: FileUpload): Promise<{ localPath: string; shouldCleanup: boolean }> {
        const minio = this.parseMinioPath(fileUpload.file_path);
        if (!minio) {
            return { localPath: fileUpload.file_path, shouldCleanup: false };
        }

        const { body } = await getFile(minio.bucket, minio.key);
        const ext = path.extname(fileUpload.original_name || '') || path.extname(minio.key) || '';
        const tmpDir = path.resolve(process.cwd(), 'uploads', 'tmp');
        fs.mkdirSync(tmpDir, { recursive: true });
        const tmpPath = path.join(tmpDir, `${fileUpload.id}${ext}`);
        fs.writeFileSync(tmpPath, Buffer.from(body));
        return { localPath: tmpPath, shouldCleanup: true };
    }

    private async validateParsedData(fileUpload: FileUpload, parsed: ParsedFileData): Promise<{ is_valid: boolean; errors: string[]; warnings: string[] }> {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!parsed.columns || parsed.columns.length === 0) {
            errors.push('No columns detected');
        }

        if (parsed.rowCount <= 0) {
            errors.push('No rows detected');
        }

        // Phase 1: minimal dataset-specific validation based on source tier.
        // If dataset_type exists, prefer it; otherwise infer from tier.
        const datasetType = (fileUpload as any).dataset_type as string | undefined;
        const sourceTier = (fileUpload as any).source_tier as string | undefined;
        const inferred = datasetType || (sourceTier === 'tier2_financial' ? 'mortgage_transaction_stats' : 'land_title_record');

        const normalizedCols = new Set(parsed.columns.map(c => String(c).trim().toLowerCase()));

        const requiredByDataset: Record<string, string[]> = {
            land_title_record: ['title_number', 'parcel_id'],
            mortgage_transaction_stats: ['period', 'count'],
        };

        const required = requiredByDataset[inferred];
        if (required && required.length > 0) {
            const missing = required.filter((c) => !normalizedCols.has(c));
            if (missing.length > 0) {
                errors.push(`Missing required columns: ${missing.join(', ')}`);
            }
        } else {
            warnings.push('No dataset validation rules configured for this upload');
        }

        return { is_valid: errors.length === 0, errors, warnings };
    }

    /**
     * Create file upload record
     */
    async create(input: CreateFileUploadInput): Promise<FileUpload> {
        const query = `
      INSERT INTO file_uploads (
        source_id, file_name, file_type, file_size_bytes, 
        file_path, original_name, mime_type, uploaded_by,
        dataset_type, source_tier
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

        const values = [
            input.source_id,
            input.file_name,
            input.file_type,
            input.file_size_bytes,
            input.file_path,
            input.original_name,
            input.mime_type,
            input.uploaded_by,
            input.dataset_type || null,
            input.source_tier || null,
        ];

        const result = await pool.query(query, values);
        logger.info('File upload record created', { id: result.rows[0].id, file_name: input.file_name });
        return result.rows[0];
    }

    /**
     * Parse CSV file
     */
    async parseCSV(filePath: string): Promise<ParsedFileData> {
        return new Promise((resolve, reject) => {
            const rows: any[] = [];
            let columns: string[] = [];

            fs.createReadStream(filePath)
                .pipe(csvParser())
                .on('headers', (headers: string[]) => {
                    columns = headers;
                })
                .on('data', (row: any) => {
                    rows.push(row);
                })
                .on('end', () => {
                    const preview = rows.slice(0, 10);
                    resolve({
                        rows,
                        columns,
                        rowCount: rows.length,
                        preview,
                    });
                })
                .on('error', (error: Error) => {
                    reject(new Error(`CSV parsing failed: ${error.message}`));
                });
        });
    }

    /**
     * Parse Excel file
     */
    async parseExcel(filePath: string): Promise<ParsedFileData> {
        try {
            const workbook = XLSX.readFile(filePath);
            const sheetName = workbook.SheetNames[0]; // Use first sheet
            const worksheet = workbook.Sheets[sheetName];

            // Convert to JSON
            const rows: any[] = XLSX.utils.sheet_to_json(worksheet);

            // Extract columns from first row
            const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

            const preview = rows.slice(0, 10);

            return {
                rows,
                columns,
                rowCount: rows.length,
                preview,
            };
        } catch (error: any) {
            throw new Error(`Excel parsing failed: ${error.message}`);
        }
    }

    /**
     * Parse PDF file (extract text)
     */
    async parsePDF(filePath: string): Promise<ParsedFileData> {
        try {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);

            // For PDFs, we extract text but don't parse into structured data
            // This is mainly for metadata extraction and preview
            const textLines = data.text.split('\n').filter((line: string) => line.trim().length > 0);
            const preview = textLines.slice(0, 20).map((line: string, index: number) => ({
                line_number: index + 1,
                content: line.trim(),
            }));

            return {
                rows: [], // PDFs don't have structured rows
                columns: ['line_number', 'content'],
                rowCount: textLines.length,
                preview,
            };
        } catch (error: any) {
            throw new Error(`PDF parsing failed: ${error.message}`);
        }
    }

    /**
     * Parse file based on type
     */
    async parseFile(fileUpload: FileUpload): Promise<ParsedFileData> {
        logger.info('Parsing file', { id: fileUpload.id, type: fileUpload.file_type });

        // Update status to parsing
        await this.updateStatus(fileUpload.id, 'parsing');

        let materialized: { localPath: string; shouldCleanup: boolean } | null = null;

        try {
            let parsedData: ParsedFileData;

            materialized = await this.materializeToLocalPath(fileUpload);
            const localPath = materialized.localPath;

            switch (fileUpload.file_type) {
                case 'csv':
                    parsedData = await this.parseCSV(localPath);
                    break;
                case 'excel':
                    parsedData = await this.parseExcel(localPath);
                    break;
                case 'pdf':
                    parsedData = await this.parsePDF(localPath);
                    break;
                default:
                    throw new Error(`Unsupported file type: ${fileUpload.file_type}`);
            }

            // Update file upload with parsed data
            await this.updateParsedData(
                fileUpload.id,
                parsedData.rowCount,
                parsedData.columns.length,
                parsedData.preview
            );

            // Validation report (Phase 1)
            const report = await this.validateParsedData(fileUpload, parsedData);
            await this.updateValidationReport(fileUpload.id, report);

            if (!report.is_valid) {
                await this.fail(fileUpload.id, 'Validation failed', { validation_report: report });
            }

            logger.info('File parsed successfully', {
                id: fileUpload.id,
                rows: parsedData.rowCount,
                columns: parsedData.columns.length,
            });

            return parsedData;
        } catch (error: any) {
            logger.error('File parsing failed', { id: fileUpload.id, error: error.message });
            await this.fail(fileUpload.id, error.message);
            throw error;
        } finally {
            if (materialized?.shouldCleanup) {
                cleanupFile(materialized.localPath);
            }
        }
    }

    /**
     * Store validation report on upload
     */
    async updateValidationReport(
        id: string,
        report: { is_valid: boolean; errors: string[]; warnings: string[] }
    ): Promise<void> {
        const query = `
      UPDATE file_uploads
      SET 
        validation_report = $1,
        updated_at = NOW()
      WHERE id = $2
    `;
        await pool.query(query, [JSON.stringify(report), id]);
    }

    /**
     * Import a validated upload into Tier staging tables
     */
    async importToStaging(id: string): Promise<{ staged: number; table: string }> {
        const upload = await this.findById(id);
        if (!upload) {
            throw new Error('File upload not found');
        }

        if (upload.upload_status !== 'validating') {
            throw new Error(`Upload is not ready to import (status=${upload.upload_status})`);
        }

        const report = (upload as any).validation_report as { is_valid?: boolean } | null;
        if (report && report.is_valid === false) {
            throw new Error('Upload failed validation');
        }

        await this.updateStatus(id, 'processing');

        // Re-parse full rows for staging
        const materialized = await this.materializeToLocalPath(upload);
        try {
            let parsed: ParsedFileData;
            switch (upload.file_type) {
                case 'csv':
                    parsed = await this.parseCSV(materialized.localPath);
                    break;
                case 'excel':
                    parsed = await this.parseExcel(materialized.localPath);
                    break;
                default:
                    throw new Error('Only CSV/Excel are supported for staging import');
            }

            const datasetType = (upload as any).dataset_type as string | undefined;
            const sourceTier = (upload as any).source_tier as string | undefined;
            const inferred = datasetType || (sourceTier === 'tier2_financial' ? 'mortgage_transaction_stats' : 'land_title_record');

            const table = inferred === 'mortgage_transaction_stats'
                ? 'tier2_mortgage_transaction_stats_staging'
                : 'tier1_land_title_records_staging';

            const rows = parsed.rows;
            const chunkSize = 250;
            let staged = 0;

            for (let i = 0; i < rows.length; i += chunkSize) {
                const chunk = rows.slice(i, i + chunkSize);
                const values: any[] = [];
                const placeholders: string[] = [];
                let p = 1;

                for (const row of chunk) {
                    const raw = row || {};
                    const hash = crypto.createHash('sha256').update(JSON.stringify(raw)).digest('hex');
                    placeholders.push(`($${p++}, $${p++}, $${p++}, $${p++})`);
                    values.push(upload.id, upload.source_id, hash, JSON.stringify(raw));
                }

                await pool.query(
                    `INSERT INTO ${table} (submission_id, source_id, row_hash, raw_row)
                     VALUES ${placeholders.join(', ')}
                     ON CONFLICT (submission_id, row_hash) DO NOTHING`,
                    values
                );

                staged += chunk.length;
            }

            await this.complete(id, staged, 0, 0);

            return { staged, table };
        } catch (error: any) {
            await this.fail(id, error instanceof Error ? error.message : String(error));
            throw error;
        } finally {
            if (materialized.shouldCleanup) {
                cleanupFile(materialized.localPath);
            }
        }
    }

    /**
     * Update parsed data
     */
    async updateParsedData(
        id: string,
        rowsDetected: number,
        columnsDetected: number,
        previewData: any[]
    ): Promise<void> {
        const query = `
      UPDATE file_uploads
      SET 
        rows_detected = $1,
        columns_detected = $2,
        preview_data = $3,
        upload_status = 'validating',
        updated_at = NOW()
      WHERE id = $4
    `;

        await pool.query(query, [rowsDetected, columnsDetected, JSON.stringify(previewData), id]);
    }

    /**
     * Update upload status
     */
    async updateStatus(
        id: string,
        status: FileUpload['upload_status'],
        errorMessage?: string
    ): Promise<void> {
        const query = `
      UPDATE file_uploads
      SET 
        upload_status = $1,
        error_message = $2,
        updated_at = NOW()
      WHERE id = $3
    `;

        await pool.query(query, [status, errorMessage || null, id]);
    }

    /**
     * Mark upload as failed
     */
    async fail(id: string, errorMessage: string, errorDetails?: any): Promise<void> {
        const query = `
      UPDATE file_uploads
      SET 
        upload_status = 'failed',
        error_message = $1,
        error_details = $2,
        updated_at = NOW()
      WHERE id = $3
    `;

        await pool.query(query, [errorMessage, errorDetails ? JSON.stringify(errorDetails) : null, id]);
    }

    /**
     * Mark upload as completed
     */
    async complete(
        id: string,
        recordsImported: number,
        recordsFailed: number,
        recordsSkipped: number
    ): Promise<void> {
        const query = `
      UPDATE file_uploads
      SET 
        upload_status = 'completed',
        records_imported = $1,
        records_failed = $2,
        records_skipped = $3,
        processed_at = NOW(),
        updated_at = NOW()
      WHERE id = $4
    `;

        await pool.query(query, [recordsImported, recordsFailed, recordsSkipped, id]);
    }

    /**
     * Link ETL job to upload
     */
    async linkEtlJob(id: string, etlJobId: string): Promise<void> {
        const query = `
      UPDATE file_uploads
      SET etl_job_id = $1, updated_at = NOW()
      WHERE id = $2
    `;

        await pool.query(query, [etlJobId, id]);
    }

    /**
     * Find upload by ID
     */
    async findById(id: string): Promise<FileUpload | null> {
        const query = `
      SELECT * FROM file_uploads
      WHERE id = $1 AND deleted_at IS NULL
    `;

        const result = await pool.query(query, [id]);
        return result.rows[0] || null;
    }

    /**
     * Find all uploads with filters
     */
    async findAll(filters: {
        source_id?: string;
        upload_status?: string;
        file_type?: string;
        uploaded_by?: string;
        page?: number;
        limit?: number;
    }): Promise<{ data: FileUpload[]; meta: any }> {
        const page = filters.page || 1;
        const limit = Math.min(filters.limit || 20, 100);
        const offset = (page - 1) * limit;

        let whereConditions = ['deleted_at IS NULL'];
        const values: any[] = [];
        let paramIndex = 1;

        if (filters.source_id) {
            whereConditions.push(`source_id = $${paramIndex++}`);
            values.push(filters.source_id);
        }

        if (filters.upload_status) {
            whereConditions.push(`upload_status = $${paramIndex++}`);
            values.push(filters.upload_status);
        }

        if (filters.file_type) {
            whereConditions.push(`file_type = $${paramIndex++}`);
            values.push(filters.file_type);
        }

        if (filters.uploaded_by) {
            whereConditions.push(`uploaded_by = $${paramIndex++}`);
            values.push(filters.uploaded_by);
        }

        const whereClause = whereConditions.join(' AND ');

        // Get total count
        const countQuery = `SELECT COUNT(*) FROM file_uploads WHERE ${whereClause}`;
        const countResult = await pool.query(countQuery, values);
        const total = parseInt(countResult.rows[0].count, 10);

        // Get paginated data
        const dataQuery = `
      SELECT * FROM file_uploads
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;
        const dataResult = await pool.query(dataQuery, [...values, limit, offset]);

        return {
            data: dataResult.rows,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNext: page * limit < total,
                hasPrevious: page > 1,
            },
        };
    }

    /**
     * Delete upload (soft delete)
     */
    async delete(id: string): Promise<boolean> {
        const upload = await this.findById(id);
        if (!upload) {
            return false;
        }

        // Soft delete
        const query = `
      UPDATE file_uploads
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `;

        await pool.query(query, [id]);

        // Clean up file
        const minio = this.parseMinioPath(upload.file_path);
        if (minio) {
            try {
                await deleteFile(minio.bucket, minio.key);
            } catch (error) {
                logger.warn('Failed to delete MinIO object for upload', {
                    id,
                    bucket: minio.bucket,
                    key: minio.key,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        } else {
            cleanupFile(upload.file_path);
        }

        logger.info('File upload deleted', { id });
        return true;
    }

    /**
     * Get recent uploads
     */
    async getRecent(limit: number = 10): Promise<FileUpload[]> {
        const query = `
      SELECT fu.*, ds.name as source_name
      FROM file_uploads fu
      LEFT JOIN data_sources ds ON fu.source_id = ds.id
      WHERE fu.deleted_at IS NULL
      ORDER BY fu.created_at DESC
      LIMIT $1
    `;

        const result = await pool.query(query, [limit]);
        return result.rows;
    }
}

export const fileUploadService = new FileUploadService();
