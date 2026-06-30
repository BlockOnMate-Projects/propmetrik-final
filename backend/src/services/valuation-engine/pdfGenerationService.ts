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
import { query, pool } from '../../database';
import { uploadFile, getFile, getPresignedDownloadUrl, buckets } from '../../database/minio';
import { logger } from '../../utils/logger';
import { PDF, pdfCover } from '../../utils/pdfReportKit';

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

const isProd = process.env.NODE_ENV === 'production';

export class PdfGenerationService {
  private readonly tempDir: string;
  private readonly libreOfficePath: string;
  private readonly verificationBaseUrl: string;

  constructor() {
    this.tempDir = process.env.TEMP_DIR || '/tmp/propmetrik-pdf';
    this.libreOfficePath = isProd 
      ? (process.env.PROD_LIBREOFFICE_PATH || '/usr/bin/soffice')
      : (process.env.DEV_LIBREOFFICE_PATH || 'libreoffice');
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
    const conversionId = uuidv4();
    const tempDocxPath = path.join(this.tempDir, `${reportId}-${conversionId}.docx`);
    let tempPdfPath: string | null = null;
    
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
      await fs.writeFile(tempDocxPath, repairedBuffer);

      // Convert to PDF
      tempPdfPath = await this.convertToPdf(tempDocxPath, this.tempDir);
      
      // Read PDF
      let pdfBuffer: Buffer = Buffer.from(await fs.readFile(tempPdfPath));

      // Replace cover page with edge-to-edge PDFKit cover
      pdfBuffer = await this.replaceCoverPage(pdfBuffer, report, reportId);

      // Overlay real page numbers onto the (manual) Table of Contents.
      pdfBuffer = await this.addTocPageNumbers(pdfBuffer);

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
      await this.cleanupTempFiles(tempDocxPath, tempPdfPath);

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
      await this.cleanupTempFiles(tempDocxPath, tempPdfPath);

      return {
        success: false,
        reportId,
        error: error.message,
      };
    }
  }

  /**
   * Overlay real page numbers onto the manual Table of Contents.
   *
   * The TOC is built programmatically with clean titles but no page numbers (LibreOffice
   * headless won't populate a field-based TOC). So after the PDF is assembled we use poppler's
   * `pdftotext -bbox` to (a) find the page each section starts on and (b) find the y-position of
   * each TOC entry, then draw the page number right-aligned on that line with pdf-lib. The
   * displayed page number equals the PDF page index (cover = page 0, TOC = page 1, per the
   * section pageNumbers). Best-effort: any failure leaves the TOC unchanged.
   */
  private async addTocPageNumbers(pdfBuffer: Buffer): Promise<Buffer> {
    const id = uuidv4();
    const pdfPath = path.join(this.tempDir, `${id}-toc.pdf`);
    const bboxPath = path.join(this.tempDir, `${id}-toc.xml`);
    try {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileP = promisify(execFile);

      await fs.writeFile(pdfPath, pdfBuffer);
      await execFileP('pdftotext', ['-bbox', pdfPath, bboxPath], { timeout: 30_000 });
      const xml = await fs.readFile(bboxPath, 'utf8');

      const decode = (s: string) =>
        s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
      const blocks = xml.split(/<page\b/).slice(1);
      const pages = blocks.map((b) => {
        const words: Array<{ x: number; y1: number; text: string }> = [];
        const re = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"[^>]*>([^<]*)<\/word>/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(b))) words.push({ x: parseFloat(m[1]), y1: parseFloat(m[4]), text: decode(m[5]) });
        return { words, text: words.map((w) => w.text).join(' ') };
      });

      const tocIdx = pages.findIndex((p) => /Table\s+of\s+Contents/i.test(p.text));
      if (tocIdx < 0) return pdfBuffer;

      // (TOC-entry anchor word, case-SENSITIVE start-of-section phrase). Headings are uppercase,
      // so case-sensitivity avoids false hits like the body text "...at the appendices".
      const ENTRIES: Array<{ word: string; start: RegExp }> = [
        { word: 'Transmittal', start: /Dear Sir/ },
        { word: 'Summary', start: /SUMMARY OF KEY DATA/ },
        { word: 'Risk', start: /RISK ASSESSMENT/ },
        { word: 'Introduction', start: /CHAPTER ONE/ },
        { word: 'Legal', start: /CHAPTER TWO/ },
        { word: 'Influencing', start: /CHAPTER THREE/ },
        { word: 'Description', start: /CHAPTER FOUR/ },
        { word: 'Process', start: /PART FOUR/ },
        { word: 'Certification', start: /CERTIFICATION/ },
        { word: 'Limiting', start: /LIMITING CONDITIONS/ },
        { word: 'Appendices', start: /APPENDICES/ },
      ];
      const startOf = (re: RegExp): number | null => {
        for (let i = tocIdx + 1; i < pages.length; i++) if (re.test(pages[i].text)) return i;
        return null;
      };

      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
      const doc = await PDFDocument.load(pdfBuffer);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const tocPage = doc.getPages()[tocIdx];
      const ph = tocPage.getHeight();
      const pw = tocPage.getWidth();
      const tocWords = pages[tocIdx].words;
      let placed = 0;

      for (const e of ENTRIES) {
        const startPage = startOf(e.start);
        if (startPage == null) continue;
        const anchor = tocWords.find((w) => w.text.replace(/[^A-Za-z]/g, '') === e.word);
        if (!anchor) continue;
        const num = String(startPage);
        const size = 11;
        const tw = font.widthOfTextAtSize(num, size);
        tocPage.drawText(num, {
          x: pw - 86 - tw, // ~1.2in right margin, right-aligned
          y: ph - anchor.y1 + 1.5,
          size,
          font,
          color: rgb(0.32, 0.32, 0.32),
        });
        placed++;
      }
      if (placed === 0) return pdfBuffer;
      logger.info('TOC page numbers added', { placed });
      return Buffer.from(await doc.save());
    } catch (err: any) {
      logger.warn('addTocPageNumbers failed; leaving TOC without page numbers', { error: err?.message });
      return pdfBuffer;
    } finally {
      await fs.unlink(pdfPath).catch(() => {});
      await fs.unlink(bboxPath).catch(() => {});
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
      `SELECT pdf_storage_key AS pdf_url, valuation_id FROM valuation_reports WHERE id = $1`,
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
  // COVER PAGE REPLACEMENT
  // ---------------------------------------------------

  /**
   * Replace DOCX-generated cover page (page 1) with an edge-to-edge
   * PDFKit cover page matching the portfolio brochure design.
   */
  private async replaceCoverPage(pdfBuffer: Buffer, report: any, reportId: string): Promise<Buffer> {
    try {
      const { PDFDocument: PdfLibDocument } = await import('pdf-lib');

      // Get property/valuation/client/valuer data for cover
      const propResult = await pool.query(
        `SELECT p.title, p.address_street, p.address_city, p.region,
                p.building_size_sqm, p.land_area_sqm,
                v.final_value_ghs, v.created_at,
                v.effective_date
         FROM valuations v
         JOIN properties p ON v.property_id = p.id
         WHERE v.id = $1`,
        [report.valuation_id]
      );

      const prop = propResult.rows[0] || {};

      // Get client (engagement) info
      const clientResult = await pool.query(
        `SELECT client_name, client_company FROM valuation_engagements
         WHERE valuation_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [report.valuation_id]
      );
      const clientName = clientResult.rows[0]?.client_name || clientResult.rows[0]?.client_company || 'Client';

      // Get valuer info
      // valuations.valuer_id may hold either the valuers.id OR the valuers.user_id (the latter is
      // what the workflow actually stores) — match on either so the certifying valuer resolves.
      const valuerResult = await pool.query(
        `SELECT vl.name, vl.qualifications, vl.license_number, vl.title as job_title
         FROM valuations v
         JOIN valuers vl ON (vl.id = v.valuer_id OR vl.user_id = v.valuer_id)
         WHERE v.id = $1
         ORDER BY (vl.id = v.valuer_id) DESC
         LIMIT 1`,
        [report.valuation_id]
      );
      const valuer = valuerResult.rows[0] || {};
      const valuerName = valuer.name ? `Surv. ${valuer.name}` : '';

      const humanizeLocationPart = (value?: string | null) => {
        if (!value) return '';
        return String(value)
          .replace(/_/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .replace(/\b\w/g, (char) => char.toUpperCase());
      };

      const propertyAddress = [
        humanizeLocationPart(prop.address_street),
        humanizeLocationPart(prop.address_city),
        humanizeLocationPart(prop.region),
      ]
        .filter(Boolean).join(', ') || prop.title || 'Property';

      const marketValue = prop.final_value_ghs
        ? Number(prop.final_value_ghs).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
        : '';
      const buildingArea = prop.building_size_sqm ? `${Number(prop.building_size_sqm).toLocaleString()} m²` : '';
      const landArea = prop.land_area_sqm ? `${Number(prop.land_area_sqm).toLocaleString()} m²` : '';
      const reportDate = new Date(prop.effective_date || prop.created_at || Date.now())
        .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      const QRCode = await import('qrcode');
      const servicesQrDataUrl = await QRCode.toDataURL('https://propmetrik.com/services', {
        width: 128,
        margin: 1,
        color: {
          dark: '#111111',
          light: '#FFFFFF',
        },
      });
      const meta = [
        marketValue ? `Market Value: GHS ${marketValue}` : '',
        buildingArea ? `Building Area: ${buildingArea}` : '',
        landArea ? `Land Area: ${landArea}` : '',
        clientName ? `Prepared For: ${clientName}` : '',
        reportDate ? `Effective Date: ${reportDate}` : '',
      ].filter(Boolean);
      // NOTE: "Certified By" is intentionally NOT in `meta` — it renders once via the dedicated
      // certifiedBy slot on the cover (passed below), avoiding the earlier duplicate.

      // Generate replacement cover page using the centralized shared cover utility.
      const coverBuffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const doc = PDF.create({ margin: 0 });
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        pdfCover(doc, {
          title: propertyAddress.toUpperCase(),
          subtitle: 'Valuation Report',
          reportType: 'VALUATION',
          brandTagline: 'Real Estate Intelligence',
          meta,
          certifiedBy: valuerName || undefined,
          qrCodeDataUrl: servicesQrDataUrl,
        });

        doc.end();
      });

      // Load both PDFs with pdf-lib
      const mainPdf = await PdfLibDocument.load(pdfBuffer);
      const coverPdf = await PdfLibDocument.load(coverBuffer);

      // Create new PDF: cover page + all pages except page 1 from original
      const finalPdf = await PdfLibDocument.create();

      // Copy cover page (first page from the PDFKit-generated PDF)
      const [coverPage] = await finalPdf.copyPages(coverPdf, [0]);
      finalPdf.addPage(coverPage);

      // Copy remaining pages from original (skip page 0 = old cover)
      const pageCount = mainPdf.getPageCount();
      if (pageCount > 1) {
        const pageIndices = Array.from({ length: pageCount - 1 }, (_, i) => i + 1);
        const copiedPages = await finalPdf.copyPages(mainPdf, pageIndices);
        copiedPages.forEach(page => finalPdf.addPage(page));
      }

      const finalBytes = await finalPdf.save();
      logger.info('Replaced cover page with shared valuation cover', { reportId });
      return Buffer.from(finalBytes);
    } catch (err: any) {
      logger.warn('Failed to replace cover page, using original', { 
        reportId, error: err.message 
      });
      return pdfBuffer;
    }
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

  private async cleanupTempFiles(docxPath: string, pdfPath?: string | null): Promise<void> {
    try {
      await fs.unlink(docxPath).catch(() => {});
      if (pdfPath) {
        await fs.unlink(pdfPath).catch(() => {});
      }
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
