/**
 * PDF Generation Service
 * 
 * Handles DOCX to PDF conversion using LibreOffice headless,
 * digital seal generation, and QR code embedding.
 * 
 * Phase 4: Week 8 - PDF Generation & Digital Seal
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../../database';
import { uploadFile, getFile, getPresignedDownloadUrl, buckets } from '../../database/minio';
import { logger } from '../../utils/logger';

const execAsync = promisify(exec);

// =====================================================
// TYPES
// =====================================================

export interface PdfGenerationOptions {
  addQrCode?: boolean;
  addWatermark?: boolean;
  addDigitalSeal?: boolean;
  includeSignature?: boolean;
}

export interface PdfGenerationResult {
  success: boolean;
  reportId: string;
  pdfUrl?: string;
  storageKey?: string;
  digitalSealHash?: string;
  verificationUrl?: string;
  fileSize?: number;
  generatedAt?: Date;
  error?: string;
}

export interface VerificationData {
  reportId: string;
  documentHash: string;
  approvedAt: string;
  approvedBy: string;
  verificationUrl: string;
}

// =====================================================
// PDF GENERATION SERVICE CLASS
// =====================================================

export class PdfGenerationService {
  private readonly tempDir: string;
  private readonly libreOfficePath: string;
  private readonly verificationBaseUrl: string;

  constructor() {
    this.tempDir = process.env.TEMP_DIR || '/tmp/propmetrik-pdf';
    this.libreOfficePath = process.env.LIBREOFFICE_PATH || 'libreoffice';
    this.verificationBaseUrl = process.env.VERIFICATION_BASE_URL || 'https://verify.propmetrik.com';
  }

  // ---------------------------------------------------
  // PDF CONVERSION
  // ---------------------------------------------------

  /**
   * Convert DOCX to PDF using LibreOffice headless
   */
  async convertDocxToPdf(reportId: string, options: PdfGenerationOptions = {}): Promise<PdfGenerationResult> {
    const startTime = Date.now();
    
    try {
      // Get report details
      const reportResult = await query(
        `SELECT * FROM valuation_reports WHERE id = $1`,
        [reportId]
      );

      if (reportResult.rows.length === 0) {
        return {
          success: false,
          reportId,
          error: 'Report not found',
        };
      }

      const report = reportResult.rows[0];
      const content = typeof report.content === 'string' 
        ? JSON.parse(report.content) 
        : report.content || {};

      // Check both content.storage_key and docx_storage_key column
      const docxStorageKey = content.storage_key || report.docx_storage_key;
      if (!docxStorageKey) {
        return {
          success: false,
          reportId,
          error: 'Report DOCX has not been generated yet',
        };
      }

      // Ensure temp directory exists
      await this.ensureTempDir();

      // Download DOCX from MinIO
      const bucket = process.env.MINIO_REPORTS_BUCKET || buckets.documents || 'propmetrik-documents';
      const docxBuffer = await this.downloadDocx(bucket, docxStorageKey);
      
      // Repair DOCX if needed (fix missing namespace declarations)
      const repairedBuffer = await this.repairDocxNamespaces(docxBuffer);

      // Save to temp file
      const tempDocxPath = path.join(this.tempDir, `${reportId}.docx`);
      await fs.writeFile(tempDocxPath, repairedBuffer);

      // Convert to PDF
      const pdfPath = await this.convertToPdf(tempDocxPath, this.tempDir);
      
      // Read PDF
      let pdfBuffer: Buffer = Buffer.from(await fs.readFile(pdfPath));

      // Generate document hash
      const documentHash = this.generateHash(pdfBuffer);

      // Add QR code if requested
      if (options.addQrCode) {
        pdfBuffer = Buffer.from(await this.addQrCodeToPdf(
          pdfBuffer, 
          reportId, 
          documentHash
        ));
      }

      // Upload to MinIO
      const pdfKey = `reports/${reportId}/final.pdf`;
      await uploadFile(
        bucket,
        pdfKey,
        new Uint8Array(pdfBuffer),
        'application/pdf',
        {
          'report-id': reportId,
          'document-hash': documentHash,
          'generated-at': new Date().toISOString(),
        }
      );

      // Get signed URL
      const pdfUrl = await getPresignedDownloadUrl(bucket, pdfKey, 7 * 24 * 60 * 60); // 7 days

      // Update report record
      const verificationUrl = `${this.verificationBaseUrl}/verify/${reportId}`;
      await query(
        `UPDATE valuation_reports 
         SET pdf_storage_key = $1,
             digital_seal_hash = $2,
             verification_url = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [pdfKey, documentHash, verificationUrl, reportId]
      );

      // Cleanup temp files
      await this.cleanupTempFiles(reportId);

      const duration = Date.now() - startTime;
      logger.info('PDF generated successfully', {
        reportId,
        duration: `${duration}ms`,
        fileSize: pdfBuffer.length,
      });

      return {
        success: true,
        reportId,
        pdfUrl,
        storageKey: pdfKey,
        digitalSealHash: documentHash,
        verificationUrl,
        fileSize: pdfBuffer.length,
        generatedAt: new Date(),
      };
    } catch (error: any) {
      logger.error('PDF generation failed', {
        reportId,
        error: error.message,
      });

      // Cleanup on error
      await this.cleanupTempFiles(reportId);

      return {
        success: false,
        reportId,
        error: error.message,
      };
    }
  }

  /**
   * Repair DOCX namespace declarations.
   * Some generated DOCXes are missing xmlns:r, xmlns:wp, xmlns:a, xmlns:pic
   * on the <w:document> root element, which causes LibreOffice to fail.
   */
  private async repairDocxNamespaces(buffer: Buffer): Promise<Buffer> {
    try {
      const PizZip = (await import('pizzip')).default;
      const zip = new PizZip(buffer);
      const docXmlFile = zip.file('word/document.xml');
      if (!docXmlFile) return buffer;

      const docXml = docXmlFile.asText();

      // Check if wp namespace is already declared (indicator of well-formed file)
      if (docXml.includes('xmlns:wp=')) return buffer;

      // Add missing namespace declarations to <w:document> root element
      const requiredNs = {
        'xmlns:r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
        'xmlns:wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
        'xmlns:a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
        'xmlns:pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture',
        'xmlns:w14': 'http://schemas.microsoft.com/office/word/2010/wordml',
        'xmlns:mc': 'http://schemas.openxmlformats.org/markup-compatibility/2006',
      };

      let fixedXml = docXml;
      const insertions: string[] = [];
      for (const [attr, uri] of Object.entries(requiredNs)) {
        if (!fixedXml.includes(attr + '=')) {
          insertions.push(`${attr}="${uri}"`);
        }
      }

      if (insertions.length > 0) {
        // Insert right after the first xmlns:w="..." declaration
        fixedXml = fixedXml.replace(
          /(<w:document\s+xmlns:w="[^"]*")/,
          `$1 ${insertions.join(' ')}`
        );
        zip.file('word/document.xml', fixedXml);
        logger.info('Repaired DOCX namespace declarations', { added: insertions.length });
        return zip.generate({ type: 'nodebuffer' }) as Buffer;
      }

      return buffer;
    } catch (err: any) {
      logger.warn('Failed to repair DOCX namespaces, proceeding with original', { error: err.message });
      return buffer;
    }
  }

  /**
   * Convert file using LibreOffice headless
   */
  private async convertToPdf(docxPath: string, outputDir: string): Promise<string> {
    try {
      // Build command
      const command = `${this.libreOfficePath} --headless --convert-to pdf --outdir "${outputDir}" "${docxPath}"`;
      
      logger.debug('Running LibreOffice conversion', { command });
      
      const { stdout, stderr } = await execAsync(command, {
        timeout: 60000, // 60 second timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      if (stderr && !stderr.includes('warn')) {
        logger.warn('LibreOffice stderr', { stderr });
      }

      // Get PDF path
      const pdfPath = docxPath.replace('.docx', '.pdf');

      // Verify file exists
      await fs.access(pdfPath);

      return pdfPath;
    } catch (error: any) {
      // Check if it's a command not found error
      if (error.message.includes('command not found') || error.code === 127) {
        throw new Error(
          'LibreOffice not installed. Please install it using: brew install libreoffice (macOS) or apt-get install libreoffice (Linux)'
        );
      }
      throw error;
    }
  }

  // ---------------------------------------------------
  // DIGITAL SEAL & HASH
  // ---------------------------------------------------

  /**
   * Generate SHA-256 hash of document
   */
  generateHash(buffer: Buffer): string {
    return crypto
      .createHash('sha256')
      .update(buffer)
      .digest('hex');
  }

  /**
   * Generate digital seal data
   */
  generateDigitalSeal(
    reportId: string,
    valuerId: string,
    documentHash: string
  ): string {
    const sealData = {
      report_id: reportId,
      valuer_id: valuerId,
      document_hash: documentHash,
      sealed_at: new Date().toISOString(),
      seal_version: '1.0',
    };

    // Create signature of seal data
    const sealString = JSON.stringify(sealData);
    const sealHash = crypto
      .createHash('sha256')
      .update(sealString)
      .digest('hex');

    return sealHash;
  }

  /**
   * Verify document integrity
   */
  async verifyDocumentHash(reportId: string): Promise<{
    valid: boolean;
    storedHash?: string;
    currentHash?: string;
    error?: string;
  }> {
    try {
      const result = await query(
        `SELECT digital_seal_hash, pdf_url FROM valuation_reports WHERE id = $1`,
        [reportId]
      );

      if (result.rows.length === 0) {
        return { valid: false, error: 'Report not found' };
      }

      const { digital_seal_hash, pdf_url } = result.rows[0];

      if (!pdf_url) {
        return { valid: false, error: 'PDF not generated' };
      }

      // Download current PDF
      const bucket = process.env.MINIO_REPORTS_BUCKET || buckets.documents || 'propmetrik-documents';
      const pdfData = await getFile(bucket, pdf_url);
      const currentHash = this.generateHash(Buffer.from(pdfData.body));

      return {
        valid: digital_seal_hash === currentHash,
        storedHash: digital_seal_hash,
        currentHash,
      };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }

  // ---------------------------------------------------
  // QR CODE
  // ---------------------------------------------------

  /**
   * Add QR code to PDF
   */
  private async addQrCodeToPdf(
    pdfBuffer: Buffer,
    reportId: string,
    documentHash: string
  ): Promise<Buffer> {
    try {
      // Dynamic import for qrcode
      const QRCode = await import('qrcode');
      const { PDFDocument, rgb } = await import('pdf-lib');

      // Generate QR code
      const verificationUrl = `${this.verificationBaseUrl}/verify/${reportId}?hash=${documentHash.substring(0, 16)}`;
      const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl, {
        width: 100,
        margin: 1,
        errorCorrectionLevel: 'M',
      });

      // Load PDF
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const pages = pdfDoc.getPages();
      
      if (pages.length === 0) {
        return pdfBuffer;
      }

      // Add QR code to last page
      const lastPage = pages[pages.length - 1];
      const { width, height } = lastPage.getSize();

      // Convert data URL to PNG buffer
      const qrPngBuffer = Buffer.from(
        qrCodeDataUrl.replace(/^data:image\/png;base64,/, ''),
        'base64'
      );

      // Embed QR code
      const qrImage = await pdfDoc.embedPng(qrPngBuffer);
      const qrSize = 80;

      // Position in bottom-right corner, above the footer area
      lastPage.drawImage(qrImage, {
        x: width - qrSize - 30,
        y: 70,
        width: qrSize,
        height: qrSize,
      });

      // Add verification text above footer
      const helvetica = await pdfDoc.embedFont('Helvetica');
      lastPage.drawText('Scan to verify', {
        x: width - qrSize - 40,
        y: 60,
        size: 8,
        font: helvetica,
        color: rgb(0.4, 0.4, 0.4),
      });

      lastPage.drawText(`Hash: ${documentHash.substring(0, 16)}...`, {
        x: width - qrSize - 60,
        y: 50,
        size: 6,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });

      // Save modified PDF
      const modifiedPdfBytes = await pdfDoc.save();
      return Buffer.from(modifiedPdfBytes);
    } catch (error: any) {
      logger.warn('Failed to add QR code to PDF, returning original', {
        error: error.message,
      });
      return pdfBuffer;
    }
  }

  /**
   * Generate standalone QR code
   */
  async generateQrCode(reportId: string, hash: string): Promise<string> {
    const QRCode = await import('qrcode');
    const verificationUrl = `${this.verificationBaseUrl}/verify/${reportId}?hash=${hash.substring(0, 16)}`;
    return QRCode.toDataURL(verificationUrl, {
      width: 200,
      margin: 2,
      errorCorrectionLevel: 'H',
    });
  }

  // ---------------------------------------------------
  // DOWNLOAD ENDPOINTS
  // ---------------------------------------------------

  /**
   * Get PDF download URL
   */
  async getPdfDownloadUrl(reportId: string): Promise<{
    url?: string;
    filename?: string;
    error?: string;
  }> {
    const result = await query(
      `SELECT pdf_url, valuation_id FROM valuation_reports WHERE id = $1`,
      [reportId]
    );

    if (result.rows.length === 0) {
      return { error: 'Report not found' };
    }

    const { pdf_url, valuation_id } = result.rows[0];

    if (!pdf_url) {
      return { error: 'PDF has not been generated. Please approve the report first.' };
    }

    const bucket = process.env.MINIO_REPORTS_BUCKET || buckets.documents || 'propmetrik-documents';
    const url = await getPresignedDownloadUrl(bucket, pdf_url, 60 * 60); // 1 hour

    return {
      url,
      filename: `ValuationReport_${valuation_id.substring(0, 8)}.pdf`,
    };
  }

  /**
   * Get DOCX download URL
   */
  async getDocxDownloadUrl(reportId: string): Promise<{
    url?: string;
    filename?: string;
    error?: string;
  }> {
    const result = await query(
      `SELECT content, valuation_id FROM valuation_reports WHERE id = $1`,
      [reportId]
    );

    if (result.rows.length === 0) {
      return { error: 'Report not found' };
    }

    const { content, valuation_id } = result.rows[0];
    const parsedContent = typeof content === 'string' ? JSON.parse(content) : content || {};

    if (!parsedContent.storage_key) {
      return { error: 'DOCX has not been generated yet' };
    }

    const bucket = process.env.MINIO_REPORTS_BUCKET || buckets.documents || 'propmetrik-documents';
    const url = await getPresignedDownloadUrl(bucket, parsedContent.storage_key, 60 * 60);

    return {
      url,
      filename: parsedContent.filename || `ValuationReport_${valuation_id.substring(0, 8)}.docx`,
    };
  }

  // ---------------------------------------------------
  // HELPER METHODS
  // ---------------------------------------------------

  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      // Ignore if already exists
    }
  }

  private async downloadDocx(bucket: string, key: string): Promise<Buffer> {
    const { body } = await getFile(bucket, key);
    return Buffer.from(body);
  }

  private async cleanupTempFiles(reportId: string): Promise<void> {
    try {
      const docxPath = path.join(this.tempDir, `${reportId}.docx`);
      const pdfPath = path.join(this.tempDir, `${reportId}.pdf`);

      await fs.unlink(docxPath).catch(() => {});
      await fs.unlink(pdfPath).catch(() => {});
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  /**
   * Check if LibreOffice is available
   */
  async isLibreOfficeAvailable(): Promise<boolean> {
    try {
      await execAsync(`${this.libreOfficePath} --version`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get LibreOffice version
   */
  async getLibreOfficeVersion(): Promise<string | null> {
    try {
      const { stdout } = await execAsync(`${this.libreOfficePath} --version`);
      return stdout.trim();
    } catch {
      return null;
    }
  }
}

// Export singleton instance
export const pdfGenerationService = new PdfGenerationService();
