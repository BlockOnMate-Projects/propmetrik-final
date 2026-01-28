/**
 * PDF Signing Service
 * Handles PDF document hashing and signature embedding
 * Uses pdf-lib for PDF manipulation
 */

import { createHash } from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { logger } from '../../src/utils/logger';

export interface SignatureVisualOptions {
    pageNumber?: number;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    signerName: string;
    signedAt: Date;
    signatureImageBase64?: string;
}

export class PdfSigningService {
    /**
     * Calculate SHA-256 hash of a PDF document
     */
    calculateDocumentHash(pdfBytes: Uint8Array): string {
        return createHash('sha256').update(pdfBytes).digest('hex');
    }

    /**
     * Add a visual signature to a PDF document
     * Note: This adds a visual representation, not a cryptographic signature embedded in PDF structure
     * The cryptographic signature is stored separately in SignatureEvidence
     */
    async addVisualSignature(
        pdfBytes: Uint8Array,
        options: SignatureVisualOptions
    ): Promise<Uint8Array> {
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();

        // Default to last page
        const pageIndex = (options.pageNumber || pages.length) - 1;
        const page = pages[Math.min(pageIndex, pages.length - 1)];

        const { width: pageWidth, height: pageHeight } = page.getSize();

        // Default positioning (bottom right)
        const x = options.x || pageWidth - 220;
        const y = options.y || 50;
        const boxWidth = options.width || 200;
        const boxHeight = options.height || 60;

        // Draw signature box
        page.drawRectangle({
            x,
            y,
            width: boxWidth,
            height: boxHeight,
            borderColor: rgb(0, 0, 0),
            borderWidth: 1,
        });

        // Add signature content
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        // If signature image provided (drawn signature), we'd embed it here
        // For simplicity, using text-based representation

        page.drawText('Digitally Signed By:', {
            x: x + 5,
            y: y + boxHeight - 15,
            size: 8,
            font,
            color: rgb(0.3, 0.3, 0.3),
        });

        page.drawText(options.signerName, {
            x: x + 5,
            y: y + boxHeight - 30,
            size: 10,
            font: fontBold,
            color: rgb(0, 0, 0),
        });

        page.drawText(`Date: ${options.signedAt.toISOString().split('T')[0]}`, {
            x: x + 5,
            y: y + boxHeight - 45,
            size: 8,
            font,
            color: rgb(0.3, 0.3, 0.3),
        });

        page.drawText('PROPMETRIK E-Sign', {
            x: x + 5,
            y: y + 5,
            size: 6,
            font,
            color: rgb(0.5, 0.5, 0.5),
        });

        const signedPdfBytes = await pdfDoc.save();
        return signedPdfBytes;
    }

    /**
     * Add a signature certificate page to the PDF
     * This provides a human-readable summary of all signatures
     */
    async addSignatureCertificatePage(
        pdfBytes: Uint8Array,
        signatures: Array<{
            signerName: string;
            signerEmail: string;
            signedAt: Date;
            signatureMethod: string;
            ipAddress?: string;
        }>,
        documentHash: string
    ): Promise<Uint8Array> {
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        // Add a new page at the end
        const page = pdfDoc.addPage([612, 792]); // US Letter

        let yPosition = 750;
        const margin = 50;
        const lineHeight = 15;

        // Header
        page.drawText('ELECTRONIC SIGNATURE CERTIFICATE', {
            x: margin,
            y: yPosition,
            size: 16,
            font: fontBold,
            color: rgb(0, 0, 0),
        });
        yPosition -= 30;

        page.drawText('This document has been electronically signed using PROPMETRIK E-Sign.', {
            x: margin,
            y: yPosition,
            size: 10,
            font,
            color: rgb(0.3, 0.3, 0.3),
        });
        yPosition -= 30;

        // Document Hash
        page.drawText('Document Integrity Hash (SHA-256):', {
            x: margin,
            y: yPosition,
            size: 9,
            font: fontBold,
            color: rgb(0, 0, 0),
        });
        yPosition -= lineHeight;

        page.drawText(documentHash, {
            x: margin,
            y: yPosition,
            size: 7,
            font,
            color: rgb(0.2, 0.2, 0.2),
        });
        yPosition -= 30;

        // Signature Details
        page.drawText('SIGNATURE DETAILS', {
            x: margin,
            y: yPosition,
            size: 12,
            font: fontBold,
            color: rgb(0, 0, 0),
        });
        yPosition -= 20;

        // Draw line
        page.drawLine({
            start: { x: margin, y: yPosition },
            end: { x: 562, y: yPosition },
            thickness: 1,
            color: rgb(0.8, 0.8, 0.8),
        });
        yPosition -= 20;

        // List each signature
        for (let i = 0; i < signatures.length; i++) {
            const sig = signatures[i];

            page.drawText(`Signer ${i + 1}:`, {
                x: margin,
                y: yPosition,
                size: 10,
                font: fontBold,
                color: rgb(0, 0, 0),
            });
            yPosition -= lineHeight;

            page.drawText(`Name: ${sig.signerName}`, {
                x: margin + 20,
                y: yPosition,
                size: 9,
                font,
                color: rgb(0.2, 0.2, 0.2),
            });
            yPosition -= lineHeight;

            page.drawText(`Email: ${sig.signerEmail}`, {
                x: margin + 20,
                y: yPosition,
                size: 9,
                font,
                color: rgb(0.2, 0.2, 0.2),
            });
            yPosition -= lineHeight;

            page.drawText(`Signed: ${sig.signedAt.toISOString()}`, {
                x: margin + 20,
                y: yPosition,
                size: 9,
                font,
                color: rgb(0.2, 0.2, 0.2),
            });
            yPosition -= lineHeight;

            page.drawText(`Method: ${sig.signatureMethod.replace(/_/g, ' ')}`, {
                x: margin + 20,
                y: yPosition,
                size: 9,
                font,
                color: rgb(0.2, 0.2, 0.2),
            });
            yPosition -= lineHeight;

            if (sig.ipAddress) {
                page.drawText(`IP Address: ${sig.ipAddress}`, {
                    x: margin + 20,
                    y: yPosition,
                    size: 9,
                    font,
                    color: rgb(0.2, 0.2, 0.2),
                });
                yPosition -= lineHeight;
            }

            yPosition -= 15; // Space between signers
        }

        // Footer
        yPosition = 50;
        page.drawText('This certificate was generated by PROPMETRIK Ghana Ltd.', {
            x: margin,
            y: yPosition,
            size: 8,
            font,
            color: rgb(0.5, 0.5, 0.5),
        });
        yPosition -= 12;
        page.drawText('Compliant with Ghana Electronic Transactions Act (Act 772)', {
            x: margin,
            y: yPosition,
            size: 8,
            font,
            color: rgb(0.5, 0.5, 0.5),
        });

        const finalPdfBytes = await pdfDoc.save();
        return finalPdfBytes;
    }

    /**
     * Create a simple test PDF document
     */
    async createTestPdf(content: string): Promise<Uint8Array> {
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([612, 792]);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

        page.drawText(content, {
            x: 50,
            y: 700,
            size: 12,
            font,
            color: rgb(0, 0, 0),
        });

        page.drawText('This is a test document for E-Signature testing.', {
            x: 50,
            y: 680,
            size: 10,
            font,
            color: rgb(0.3, 0.3, 0.3),
        });

        page.drawText('Generated by PROPMETRIK E-Sign System', {
            x: 50,
            y: 50,
            size: 8,
            font,
            color: rgb(0.5, 0.5, 0.5),
        });

        return pdfDoc.save();
    }

    /**
     * Embed signature at specific x/y position on document
     * Enhanced version that handles field positions from esign_fields
     * Coordinates can be in percentage (0-100) or absolute pixels
     */
    async embedSignatureAtPosition(
        pdfBytes: Uint8Array,
        signatureData: string,
        options: {
            page: number;
            x: number;              // Percentage (0-100) by default
            y: number;              // Percentage (0-100) by default
            width: number;
            height: number;
            signatureId?: string;
            signatureHash?: string;  // NEW: For compliance metadata
            signedAt?: Date;
            usePercentage?: boolean; // Default true
        }
    ): Promise<Uint8Array> {
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = pdfDoc.getPages();

        const pageIndex = options.page - 1;
        if (pageIndex < 0 || pageIndex >= pages.length) {
            throw new Error(`Invalid page number: ${options.page}`);
        }

        const page = pages[pageIndex];
        const { width: pageWidth, height: pageHeight } = page.getSize();

        // Calculate actual coordinates
        const usePercentage = options.usePercentage !== false;
        let x: number, y: number;

        if (usePercentage) {
            // Convert percentage to pixels
            x = (options.x / 100) * pageWidth;
            // Y coordinate: PDF origin is bottom-left, but we measure from top
            y = pageHeight - ((options.y / 100) * pageHeight) - options.height;
        } else {
            x = options.x;
            // Y coordinate from top
            y = pageHeight - options.y - options.height;
        }

        // Decode and embed signature image
        const sigBase64 = signatureData.replace(/^data:image\/\w+;base64,/, '');
        const sigBytes = Buffer.from(sigBase64, 'base64');

        let sigImage;
        try {
            if (signatureData.includes('image/png') || signatureData.includes('PNG')) {
                sigImage = await pdfDoc.embedPng(sigBytes);
            } else {
                sigImage = await pdfDoc.embedJpg(sigBytes);
            }
        } catch (imageError) {
            // If image embedding fails, try the other format
            try {
                sigImage = await pdfDoc.embedPng(sigBytes);
            } catch {
                sigImage = await pdfDoc.embedJpg(sigBytes);
            }
        }

        // Draw signature
        page.drawImage(sigImage, {
            x,
            y,
            width: options.width,
            height: options.height,
        });

        // Add signature ID, timestamp and hash below if provided
        if (options.signatureId || options.signedAt || options.signatureHash) {
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const dateStr = options.signedAt
                ? options.signedAt.toISOString().split('T')[0]
                : new Date().toISOString().split('T')[0];

            const line1 = options.signatureId
                ? `Signed: ${dateStr} | ID: ${options.signatureId}`
                : `Signed: ${dateStr}`;

            page.drawText(line1, {
                x,
                y: y - 8,
                size: 5,
                font,
                color: rgb(0.4, 0.4, 0.4),
            });

            if (options.signatureHash) {
                const hashLabel = `DIGITAL HASH: ${options.signatureHash}`;
                page.drawText(hashLabel, {
                    x,
                    y: y - 14,
                    size: 4,
                    font,
                    color: rgb(0.6, 0.6, 0.6),
                });
            }
        }

        logger.info('Signature embedded at position', {
            page: options.page,
            x: options.x,
            y: options.y,
            signatureId: options.signatureId
        });

        return pdfDoc.save();
    }

    /**
     * Embed multiple signatures at their respective positions
     */
    async embedAllSignatures(
        pdfBytes: Uint8Array,
        signatures: Array<{
            signatureData: string;
            page: number;
            x: number;
            y: number;
            width: number;
            height: number;
            signatureId?: string;
            signatureHash?: string;
            signedAt?: Date;
        }>
    ): Promise<Uint8Array> {
        let currentPdfBytes = pdfBytes;

        for (const sig of signatures) {
            currentPdfBytes = await this.embedSignatureAtPosition(
                currentPdfBytes,
                sig.signatureData,
                {
                    page: sig.page,
                    x: sig.x,
                    y: sig.y,
                    width: sig.width,
                    height: sig.height,
                    signatureId: sig.signatureId,
                    signatureHash: sig.signatureHash,
                    signedAt: sig.signedAt
                }
            );
        }

        return currentPdfBytes;
    }

    /**
     * Generate a Certificate of Completion PDF
     * A standalone document with full audit trail for completed envelopes
     */
    async generateCertificateOfCompletion(params: {
        certificateId: string;
        documentTitle: string;
        documentHash: string;
        envelopeId: string;
        organizationName: string;
        completedAt: Date;
        signers: Array<{
            name: string;
            email: string;
            role?: string;
            signedAt: Date;
            signatureId?: string;
            ipAddress?: string;
            userAgent?: string;
        }>;
        auditEvents?: Array<{
            eventType: string;
            timestamp: Date;
            description: string;
            actor?: string;
            ipAddress?: string;
        }>;
    }): Promise<Uint8Array> {
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        // Page 1: Certificate Summary
        const page1 = pdfDoc.addPage([612, 792]); // US Letter
        const margin = 50;
        let yPos = 742;

        // Header with blue background
        page1.drawRectangle({
            x: 0,
            y: 720,
            width: 612,
            height: 72,
            color: rgb(0.102, 0.212, 0.365), // #1a365d
        });

        page1.drawText('CERTIFICATE OF COMPLETION', {
            x: margin,
            y: 755,
            size: 22,
            font: fontBold,
            color: rgb(1, 1, 1),
        });

        page1.drawText('PropMetrik E-Sign Platform', {
            x: margin,
            y: 735,
            size: 10,
            font,
            color: rgb(0.8, 0.8, 0.8),
        });

        // Certificate ID box
        yPos = 690;
        page1.drawRectangle({
            x: margin,
            y: yPos - 25,
            width: 512,
            height: 35,
            color: rgb(0.97, 0.97, 0.97),
            borderColor: rgb(0.8, 0.8, 0.8),
            borderWidth: 1,
        });

        page1.drawText('Certificate ID:', {
            x: margin + 10,
            y: yPos - 10,
            size: 9,
            font,
            color: rgb(0.4, 0.4, 0.4),
        });

        page1.drawText(params.certificateId, {
            x: margin + 100,
            y: yPos - 10,
            size: 10,
            font: fontBold,
            color: rgb(0.1, 0.1, 0.1),
        });

        // Document Information Section
        yPos = 640;
        page1.drawText('DOCUMENT INFORMATION', {
            x: margin,
            y: yPos,
            size: 12,
            font: fontBold,
            color: rgb(0.102, 0.212, 0.365),
        });

        yPos -= 5;
        page1.drawLine({
            start: { x: margin, y: yPos },
            end: { x: 562, y: yPos },
            thickness: 1,
            color: rgb(0.8, 0.8, 0.8),
        });

        yPos -= 20;
        const docInfo = [
            ['Document Title:', params.documentTitle],
            ['Envelope ID:', params.envelopeId],
            ['Organization:', params.organizationName],
            ['Status:', '✓ COMPLETED'],
            ['Completed On:', params.completedAt.toISOString().replace('T', ' ').replace(/\..+/, '') + ' UTC'],
        ];

        for (const [label, value] of docInfo) {
            page1.drawText(label, {
                x: margin,
                y: yPos,
                size: 9,
                font,
                color: rgb(0.4, 0.4, 0.4),
            });
            page1.drawText(value, {
                x: margin + 120,
                y: yPos,
                size: 9,
                font: fontBold,
                color: label === 'Status:' ? rgb(0.02, 0.59, 0.41) : rgb(0.1, 0.1, 0.1),
            });
            yPos -= 18;
        }

        // Document Integrity Section
        yPos -= 15;
        page1.drawText('DOCUMENT INTEGRITY', {
            x: margin,
            y: yPos,
            size: 12,
            font: fontBold,
            color: rgb(0.102, 0.212, 0.365),
        });

        yPos -= 5;
        page1.drawLine({
            start: { x: margin, y: yPos },
            end: { x: 562, y: yPos },
            thickness: 1,
            color: rgb(0.8, 0.8, 0.8),
        });

        yPos -= 20;
        page1.drawText('SHA-256 Document Hash:', {
            x: margin,
            y: yPos,
            size: 9,
            font,
            color: rgb(0.4, 0.4, 0.4),
        });

        yPos -= 15;
        page1.drawRectangle({
            x: margin,
            y: yPos - 5,
            width: 512,
            height: 18,
            color: rgb(0.95, 0.95, 0.95),
        });
        page1.drawText(params.documentHash, {
            x: margin + 5,
            y: yPos,
            size: 7,
            font,
            color: rgb(0.2, 0.2, 0.2),
        });

        // Signers Section
        yPos -= 40;
        page1.drawText('SIGNATURE SUMMARY', {
            x: margin,
            y: yPos,
            size: 12,
            font: fontBold,
            color: rgb(0.102, 0.212, 0.365),
        });

        yPos -= 5;
        page1.drawLine({
            start: { x: margin, y: yPos },
            end: { x: 562, y: yPos },
            thickness: 1,
            color: rgb(0.8, 0.8, 0.8),
        });

        yPos -= 15;
        page1.drawText(`Total Signers: ${params.signers.length}`, {
            x: margin,
            y: yPos,
            size: 9,
            font,
            color: rgb(0.4, 0.4, 0.4),
        });

        yPos -= 20;

        // Signers table
        for (let i = 0; i < params.signers.length; i++) {
            const signer = params.signers[i];

            // Signer box
            const boxHeight = 70;
            if (yPos - boxHeight < 100) {
                // Need a new page
                break;
            }

            page1.drawRectangle({
                x: margin,
                y: yPos - boxHeight + 10,
                width: 512,
                height: boxHeight,
                color: rgb(0.98, 0.98, 0.98),
                borderColor: rgb(0.9, 0.9, 0.9),
                borderWidth: 1,
            });

            // Checkmark
            page1.drawText('✓', {
                x: margin + 10,
                y: yPos - 10,
                size: 16,
                font: fontBold,
                color: rgb(0.02, 0.59, 0.41),
            });

            // Signer info
            page1.drawText(`${signer.name}${signer.role ? ` (${signer.role})` : ''}`, {
                x: margin + 35,
                y: yPos - 8,
                size: 10,
                font: fontBold,
                color: rgb(0.1, 0.1, 0.1),
            });

            page1.drawText(signer.email, {
                x: margin + 35,
                y: yPos - 22,
                size: 8,
                font,
                color: rgb(0.4, 0.4, 0.4),
            });

            page1.drawText(`Signed: ${signer.signedAt.toLocaleString()}`, {
                x: margin + 35,
                y: yPos - 36,
                size: 8,
                font,
                color: rgb(0.3, 0.3, 0.3),
            });

            if (signer.signatureId) {
                page1.drawText(`Signature ID: ${signer.signatureId}`, {
                    x: margin + 35,
                    y: yPos - 50,
                    size: 7,
                    font,
                    color: rgb(0.5, 0.5, 0.5),
                });
            }

            if (signer.ipAddress) {
                page1.drawText(`IP: ${signer.ipAddress}`, {
                    x: 400,
                    y: yPos - 36,
                    size: 7,
                    font,
                    color: rgb(0.5, 0.5, 0.5),
                });
            }

            yPos -= boxHeight + 10;
        }

        // Footer
        page1.drawLine({
            start: { x: margin, y: 70 },
            end: { x: 562, y: 70 },
            thickness: 1,
            color: rgb(0.8, 0.8, 0.8),
        });

        page1.drawText('This certificate confirms that all parties have electronically signed the document.', {
            x: margin,
            y: 55,
            size: 8,
            font,
            color: rgb(0.5, 0.5, 0.5),
        });

        page1.drawText('PropMetrik Ghana Ltd. | Compliant with Ghana Electronic Transactions Act (Act 772)', {
            x: margin,
            y: 42,
            size: 8,
            font,
            color: rgb(0.5, 0.5, 0.5),
        });

        page1.drawText(`Generated: ${new Date().toISOString()}`, {
            x: margin,
            y: 29,
            size: 7,
            font,
            color: rgb(0.6, 0.6, 0.6),
        });

        // Page 2: Audit Trail (if events provided)
        if (params.auditEvents && params.auditEvents.length > 0) {
            const page2 = pdfDoc.addPage([612, 792]);
            let y2 = 742;

            // Header
            page2.drawRectangle({
                x: 0,
                y: 720,
                width: 612,
                height: 72,
                color: rgb(0.102, 0.212, 0.365),
            });

            page2.drawText('AUDIT TRAIL', {
                x: margin,
                y: 755,
                size: 22,
                font: fontBold,
                color: rgb(1, 1, 1),
            });

            page2.drawText(`Document: ${params.documentTitle}`, {
                x: margin,
                y: 735,
                size: 10,
                font,
                color: rgb(0.8, 0.8, 0.8),
            });

            y2 = 690;
            page2.drawText('Complete history of all actions taken on this document:', {
                x: margin,
                y: y2,
                size: 9,
                font,
                color: rgb(0.4, 0.4, 0.4),
            });

            y2 -= 25;

            // Table header
            page2.drawRectangle({
                x: margin,
                y: y2 - 5,
                width: 512,
                height: 20,
                color: rgb(0.95, 0.95, 0.95),
            });

            page2.drawText('TIMESTAMP', { x: margin + 5, y: y2, size: 8, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
            page2.drawText('EVENT', { x: margin + 130, y: y2, size: 8, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
            page2.drawText('DETAILS', { x: margin + 250, y: y2, size: 8, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
            page2.drawText('IP ADDRESS', { x: margin + 420, y: y2, size: 8, font: fontBold, color: rgb(0.3, 0.3, 0.3) });

            y2 -= 20;

            for (const event of params.auditEvents) {
                if (y2 < 100) break;

                const timestamp = event.timestamp.toISOString().replace('T', ' ').substring(5, 16);

                page2.drawText(timestamp, { x: margin + 5, y: y2, size: 7, font, color: rgb(0.3, 0.3, 0.3) });

                // Event type with color
                const eventColors: Record<string, [number, number, number]> = {
                    'created': [0.15, 0.39, 0.92],
                    'sent': [0.15, 0.39, 0.92],
                    'viewed': [0.6, 0.4, 0.8],
                    'signed': [0.02, 0.59, 0.41],
                    'completed': [0.02, 0.59, 0.41],
                    'declined': [0.86, 0.15, 0.15],
                    'voided': [0.86, 0.15, 0.15],
                };
                const eventColor = eventColors[event.eventType] || [0.3, 0.3, 0.3];

                page2.drawText(event.eventType.toUpperCase(), {
                    x: margin + 130,
                    y: y2,
                    size: 7,
                    font: fontBold,
                    color: rgb(eventColor[0], eventColor[1], eventColor[2]),
                });

                // Truncate description if too long
                const desc = event.description.length > 40
                    ? event.description.substring(0, 37) + '...'
                    : event.description;
                page2.drawText(desc, { x: margin + 250, y: y2, size: 7, font, color: rgb(0.4, 0.4, 0.4) });

                if (event.ipAddress) {
                    page2.drawText(event.ipAddress, { x: margin + 420, y: y2, size: 7, font, color: rgb(0.5, 0.5, 0.5) });
                }

                y2 -= 15;

                // Draw separator line
                page2.drawLine({
                    start: { x: margin, y: y2 + 5 },
                    end: { x: 562, y: y2 + 5 },
                    thickness: 0.5,
                    color: rgb(0.9, 0.9, 0.9),
                });
            }

            // Footer
            page2.drawText(`Page 2 of 2 | Certificate ID: ${params.certificateId}`, {
                x: margin,
                y: 30,
                size: 7,
                font,
                color: rgb(0.5, 0.5, 0.5),
            });
        }

        logger.info('Certificate of Completion generated', {
            certificateId: params.certificateId,
            envelopeId: params.envelopeId,
            signerCount: params.signers.length,
        });

        return pdfDoc.save();
    }

    /**
     * Generate a finalized signed PDF with all signatures embedded
     * and optional certificate page appended
     */
    async generateFinalSignedPdf(params: {
        originalPdfBytes: Uint8Array;
        signatures: Array<{
            signatureData: string;
            page: number;
            x: number;
            y: number;
            width: number;
            height: number;
            signatureId?: string;
            signedAt?: Date;
            signerName?: string;
            signerEmail?: string;
        }>;
        appendCertificatePage?: boolean;
        documentHash?: string;
    }): Promise<Uint8Array> {
        // First, embed all signatures
        let pdfBytes = await this.embedAllSignatures(
            params.originalPdfBytes,
            params.signatures
        );

        // Optionally append a certificate summary page
        if (params.appendCertificatePage && params.documentHash) {
            const sigSummary = params.signatures
                .filter(s => s.signerName && s.signerEmail && s.signedAt)
                .map(s => ({
                    signerName: s.signerName!,
                    signerEmail: s.signerEmail!,
                    signedAt: s.signedAt!,
                    signatureMethod: 'DRAWN_SIGNATURE',
                    ipAddress: undefined,
                }));

            if (sigSummary.length > 0) {
                pdfBytes = await this.addSignatureCertificatePage(
                    pdfBytes,
                    sigSummary,
                    params.documentHash
                );
            }
        }

        return pdfBytes;
    }
}

export const pdfSigningService = new PdfSigningService();
