# E-Signature Platform Integration Guide

**Project**: PropMetrik E-Signature System  
**Status**: Integration Planning  
**Author**: Development Team  
**Last Updated**: January 2026

---

## 🎯 Executive Summary

This document outlines how to **enhance the existing TypeScript e-sign service** (`backend/shared-services/e-sign/`) by porting features from `phase12-esign` (Python/FastAPI). After integration is complete, `phase12-esign` will be **deprecated and deleted**.

### Integration Direction

```
┌────────────────────────────────────────────────────────────────┐
│                     INTEGRATION FLOW                            │
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│   phase12-esign (Python)                                        │
│   ├── Templates System         ─────┐                          │
│   ├── Envelope Workflow        ─────┤                          │
│   ├── Quick Sign               ─────┤     PORT TO              │
│   ├── Email Templates          ─────┼───────────────►           │
│   ├── Reminder System          ─────┤                          │
│   └── Google Drive Integration ─────┘                          │
│                                                                  │
│                           ▼                                      │
│                                                                  │
│   shared-services/e-sign (TypeScript) ◄── ENHANCE               │
│   ├── signingService.ts        ✅ Keep & Enhance               │
│   ├── pdfSigningService.ts     ✅ Keep & Enhance               │
│   ├── auditLogService.ts       ✅ Keep (hash-chained)          │
│   ├── magicLinkService.ts      ✅ Keep & Enhance               │
│   ├── keyManagementService.ts  ✅ Keep                         │
│   ├── timestampService.ts      ✅ Keep                         │
│   ├── consentService.ts        ✅ Keep                         │
│   ├── templateService.ts       🆕 New (from phase12)           │
│   ├── envelopeService.ts       🆕 New (from phase12)           │
│   ├── emailService.ts          🆕 New (from phase12)           │
│   ├── reminderService.ts       🆕 New (from phase12)           │
│   └── signatureIdService.ts    🆕 New (unique IDs)             │
│                                                                  │
│                           ▼                                      │
│                                                                  │
│   DELETE: phase12-esign/ (after migration complete)             │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
```

### Key Goals

1. **DocuSign-Level Functionality**: Complete signature workflow with templates, envelopes, field placements
2. **Unique Signature IDs**: Cryptographic identifiers (`SIG-2026-PM-XXXXXX-YYYY`) for compliance
3. **On-Document Rendering**: Signatures embed at exact x/y positions on the PDF
4. **Flexible Authentication**: Support internal JWT, API keys, and public magic links
5. **Ghana Electronic Transactions Act Compliance**: Audit trails, tamper-evident sealing

---

## 📊 Current State Analysis

### Existing shared-services/e-sign (TypeScript) - KEEP & ENHANCE

| Service | Status | Notes |
|---------|--------|-------|
| `signingService.ts` | ✅ Complete | Core orchestration, internal/external signing |
| `pdfSigningService.ts` | ✅ Complete | PDF hashing, visual signatures, certificate page |
| `auditLogService.ts` | ✅ Complete | Hash-chained append-only audit trail |
| `magicLinkService.ts` | ✅ Complete | External signee access tokens + OTP |
| `keyManagementService.ts` | ✅ Complete | RSA key pairs, cryptographic signatures |
| `timestampService.ts` | ✅ Complete | RFC 3161 timestamping |
| `consentService.ts` | ✅ Complete | Versioned consent statements |
| `types/index.ts` | ✅ Complete | Comprehensive TypeScript types |

### Features to Port FROM phase12-esign (Python)

| Feature | Source | Port To |
|---------|--------|---------|
| **Template System** | `api/templates.py` | `templateService.ts` |
| **Envelope Workflow** | `api/envelopes.py` | `envelopeService.ts` |
| **Quick Sign** | `api/quick_sign.py` | Integrate into `signingService.ts` |
| **Email Notifications** | `email_service.py` | `emailService.ts` |
| **Signature Field Positions** | `models.py` (EnvelopeField) | Enhance `pdfSigningService.ts` |
| **Reminder Scheduling** | - | `reminderService.ts` (new) |
| **Unique Signature IDs** | - | `signatureIdService.ts` (new) |

### Existing esign_* Tables (backend/database/migrations/050_esign_envelopes.sql)

Already have:
- `esign_envelopes` - Envelope management
- `esign_signers` - Signer tracking  
- `esign_fields` - Field positions (x/y/width/height)
- `esign_audit_log` - Event logging

---

## 📐 Database Schema Enhancement

### New Tables to Add (Migration 051)

```sql
-- Migration: 051_esign_phase2_enhancements.sql

-- 1. Unique Signature Records with Cryptographic IDs
CREATE TABLE IF NOT EXISTS esign_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signature_id VARCHAR(64) UNIQUE NOT NULL, -- e.g., SIG-2026-PM-000001-A7F3
    envelope_id UUID NOT NULL REFERENCES esign_envelopes(id) ON DELETE CASCADE,
    signer_id UUID NOT NULL REFERENCES esign_signers(id) ON DELETE CASCADE,
    field_id UUID NOT NULL REFERENCES esign_fields(id) ON DELETE CASCADE,
    
    -- Signature Data
    signature_data TEXT NOT NULL, -- Base64 encoded signature image
    signature_type VARCHAR(20) NOT NULL DEFAULT 'drawn', -- drawn, typed, uploaded
    signature_hash VARCHAR(128), -- SHA-256 hash for tamper detection
    
    -- Legal Metadata (Ghana Electronic Transactions Act compliance)
    ip_address VARCHAR(45),
    user_agent TEXT,
    geolocation JSONB,
    device_fingerprint VARCHAR(128),
    
    -- Timestamps
    signed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT signature_unique_per_field UNIQUE (field_id)
);

CREATE INDEX idx_esign_signatures_envelope ON esign_signatures(envelope_id);
CREATE INDEX idx_esign_signatures_signer ON esign_signatures(signer_id);
CREATE INDEX idx_esign_signatures_id ON esign_signatures(signature_id);

-- 2. Certificate of Completion
CREATE TABLE IF NOT EXISTS esign_certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_id VARCHAR(64) UNIQUE NOT NULL, -- e.g., CERT-2026-PM-000001-B2C4
    envelope_id UUID UNIQUE NOT NULL REFERENCES esign_envelopes(id) ON DELETE CASCADE,
    
    -- Certificate Content
    certificate_pdf_url TEXT, -- S3/MinIO storage URL
    certificate_html TEXT, -- For web viewing
    
    -- Metadata
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    document_hash VARCHAR(128), -- Hash of final signed document
    
    -- Signer summary snapshot
    signers_summary JSONB NOT NULL, -- Array of {name, email, signed_at, signature_id, ip}
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Reusable Templates (ported from phase12-esign)
CREATE TABLE IF NOT EXISTS esign_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) DEFAULT 'General',
    
    -- Document Source
    document_html TEXT,
    document_pdf_url TEXT,
    document_drive_id VARCHAR(255), -- Google Drive ID if applicable
    
    -- Field Definitions (reusable placeholders)
    field_definitions JSONB NOT NULL DEFAULT '[]',
    -- Example: [{ role: 'landlord', type: 'signature', x: 50, y: 80, page: 1, width: 200, height: 50 }]
    
    -- Role Definitions
    roles JSONB NOT NULL DEFAULT '[]',
    -- Example: [{ name: 'landlord', order: 1, required: true }, { name: 'tenant', order: 2, required: true }]
    
    is_shared BOOLEAN DEFAULT FALSE,
    used_count INTEGER DEFAULT 0,
    
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_esign_templates_org ON esign_templates(organization_id);
CREATE INDEX idx_esign_templates_category ON esign_templates(category);
CREATE INDEX idx_esign_templates_shared ON esign_templates(is_shared) WHERE is_shared = TRUE;

-- 4. Reminder Schedule
CREATE TABLE IF NOT EXISTS esign_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id UUID NOT NULL REFERENCES esign_envelopes(id) ON DELETE CASCADE,
    signer_id UUID NOT NULL REFERENCES esign_signers(id) ON DELETE CASCADE,
    
    reminder_type VARCHAR(50) NOT NULL, -- 'initial', 'follow_up', 'final_warning'
    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'pending', -- pending, sent, cancelled, failed
    error_message TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_esign_reminders_pending ON esign_reminders(scheduled_for) 
    WHERE status = 'pending';
CREATE INDEX idx_esign_reminders_envelope ON esign_reminders(envelope_id);

-- Add reminder settings to envelopes
ALTER TABLE esign_envelopes 
ADD COLUMN IF NOT EXISTS reminder_frequency_days INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN DEFAULT TRUE;

-- Updated at trigger for templates
CREATE OR REPLACE FUNCTION update_esign_template_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_esign_template_timestamp ON esign_templates;
CREATE TRIGGER trigger_update_esign_template_timestamp
    BEFORE UPDATE ON esign_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_esign_template_timestamp();

-- Comments
COMMENT ON TABLE esign_signatures IS 'Individual signature records with unique compliance IDs';
COMMENT ON TABLE esign_certificates IS 'Certificate of Completion for finalized envelopes';
COMMENT ON TABLE esign_templates IS 'Reusable document templates with predefined fields';
COMMENT ON TABLE esign_reminders IS 'Scheduled reminder notifications for pending signers';
```

---

## 🔐 Unique Signature ID Service (NEW)

Create `backend/shared-services/e-sign/signatureIdService.ts`:

```typescript
/**
 * Signature ID Service
 * Generates unique, verifiable signature IDs for compliance
 * Format: SIG-YYYY-ORG-NNNNNN-CCCC
 */

import crypto from 'crypto';
import db from '../../src/database';
import { logger } from '../../src/utils/logger';

const SIGNATURE_SECRET = process.env.ESIGN_SIGNATURE_SECRET || 'propmetrik-esign-secret-key';

export interface SignatureIdComponents {
    prefix: 'SIG';
    year: string;           // e.g., '2026'
    organizationCode: string; // e.g., 'PM'
    sequenceNumber: string;   // e.g., '000001'
    checksum: string;         // e.g., 'A7F3'
}

export class SignatureIdService {
    /**
     * Generate a unique, verifiable signature ID
     * Format: SIG-2026-PM-000001-A7F3
     */
    async generateSignatureId(organizationCode: string = 'PM'): Promise<string> {
        // Get next sequence number from database
        const result = await db.query(
            `SELECT COALESCE(MAX(CAST(SUBSTRING(signature_id FROM 14 FOR 6) AS INTEGER)), 0) + 1 as next_seq
             FROM esign_signatures 
             WHERE signature_id LIKE $1`,
            [`SIG-${new Date().getFullYear()}-${organizationCode}-%`]
        );
        
        const sequenceNumber = result.rows[0]?.next_seq || 1;
        const year = new Date().getFullYear().toString();
        const seqStr = sequenceNumber.toString().padStart(6, '0');
        
        // Create base ID
        const baseId = `SIG-${year}-${organizationCode}-${seqStr}`;
        
        // Generate 4-char checksum
        const hash = crypto
            .createHmac('sha256', SIGNATURE_SECRET)
            .update(baseId)
            .digest('hex');
        const checksum = hash.substring(0, 4).toUpperCase();
        
        return `${baseId}-${checksum}`;
    }

    /**
     * Verify a signature ID's checksum
     */
    verifySignatureId(signatureId: string): boolean {
        const parts = signatureId.split('-');
        if (parts.length !== 5) return false;
        
        const [prefix, year, orgCode, seq, providedChecksum] = parts;
        if (prefix !== 'SIG') return false;
        
        const baseId = `${prefix}-${year}-${orgCode}-${seq}`;
        const hash = crypto
            .createHmac('sha256', SIGNATURE_SECRET)
            .update(baseId)
            .digest('hex');
        const expectedChecksum = hash.substring(0, 4).toUpperCase();
        
        return providedChecksum === expectedChecksum;
    }

    /**
     * Generate signature hash for tamper detection
     */
    generateSignatureHash(signatureData: string): string {
        return crypto.createHash('sha256').update(signatureData).digest('hex');
    }

    /**
     * Generate certificate ID
     * Format: CERT-2026-PM-000001-B2C4
     */
    async generateCertificateId(organizationCode: string = 'PM'): Promise<string> {
        const result = await db.query(
            `SELECT COALESCE(MAX(CAST(SUBSTRING(certificate_id FROM 15 FOR 6) AS INTEGER)), 0) + 1 as next_seq
             FROM esign_certificates 
             WHERE certificate_id LIKE $1`,
            [`CERT-${new Date().getFullYear()}-${organizationCode}-%`]
        );
        
        const sequenceNumber = result.rows[0]?.next_seq || 1;
        const year = new Date().getFullYear().toString();
        const seqStr = sequenceNumber.toString().padStart(6, '0');
        
        const baseId = `CERT-${year}-${organizationCode}-${seqStr}`;
        const hash = crypto
            .createHmac('sha256', SIGNATURE_SECRET)
            .update(baseId)
            .digest('hex');
        const checksum = hash.substring(0, 4).toUpperCase();
        
        return `${baseId}-${checksum}`;
    }
}

export const signatureIdService = new SignatureIdService();
```

---

## 📧 Email Service (NEW - Port from phase12-esign)

Create `backend/shared-services/e-sign/emailService.ts`:

```typescript
/**
 * Email Service for E-Sign Notifications
 * Ported from phase12-esign/backend/email_service.py
 */

import nodemailer from 'nodemailer';
import { logger } from '../../src/utils/logger';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '1025'), // MailHog default
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    } : undefined,
});

export interface SigningRequestEmailParams {
    signerEmail: string;
    signerName: string;
    documentTitle: string;
    creatorName: string;
    signingUrl: string;
    expiresAt?: Date;
    message?: string;
}

export class EmailService {
    /**
     * Send signature request email
     */
    async sendSigningRequestEmail(params: SigningRequestEmailParams): Promise<boolean> {
        try {
            const expiresText = params.expiresAt 
                ? `This request expires on ${params.expiresAt.toLocaleDateString()}.` 
                : '';

            const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #1a365d 0%, #2563eb 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; padding: 15px 30px; background: #2563eb; color: white; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
        .document-title { font-size: 18px; font-weight: bold; color: #1a365d; margin: 15px 0; padding: 15px; background: white; border-radius: 8px; }
        .warning { color: #dc2626; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📝 Signature Required</h1>
        </div>
        <div class="content">
            <p>Hello <strong>${params.signerName}</strong>,</p>
            
            <p><strong>${params.creatorName}</strong> has requested your signature on:</p>
            
            <div class="document-title">📄 ${params.documentTitle}</div>
            
            ${params.message ? `<p style="font-style: italic; color: #666;">"${params.message}"</p>` : ''}
            
            <p>Please review and sign the document by clicking below:</p>
            
            <center>
                <a href="${params.signingUrl}" class="button">Review & Sign Document</a>
            </center>
            
            ${expiresText ? `<p class="warning">⏰ ${expiresText}</p>` : ''}
            
            <p style="font-size: 13px; color: #666;">
                <strong>Security Notice:</strong> Do not forward this email. 
                The signing link is unique to you.
            </p>
        </div>
        <div class="footer">
            <p>Powered by PropMetrik E-Sign</p>
            <p>© ${new Date().getFullYear()} PropMetrik Ghana Ltd. All rights reserved.</p>
            <p style="font-size: 10px;">Compliant with Ghana Electronic Transactions Act (Act 772)</p>
        </div>
    </div>
</body>
</html>`;

            await transporter.sendMail({
                from: process.env.EMAIL_FROM || 'PropMetrik E-Sign <noreply@propmetrik.com>',
                to: params.signerEmail,
                subject: `Signature Request: ${params.documentTitle}`,
                html,
            });

            logger.info('Signing request email sent', { 
                to: params.signerEmail, 
                document: params.documentTitle 
            });
            return true;
        } catch (error) {
            logger.error('Failed to send signing request email', { error, to: params.signerEmail });
            return false;
        }
    }

    /**
     * Send signature completion notification
     */
    async sendSignatureCompletedEmail(params: {
        recipientEmail: string;
        recipientName: string;
        documentTitle: string;
        signerName: string;
        completedCount: number;
        totalCount: number;
        viewUrl?: string;
    }): Promise<boolean> {
        const allComplete = params.completedCount === params.totalCount;
        const progressPercent = Math.round((params.completedCount / params.totalCount) * 100);

        try {
            const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${allComplete ? '#059669' : '#1a365d'}; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .progress-bar { background: #e5e7eb; border-radius: 4px; height: 10px; margin: 15px 0; }
        .progress-fill { background: #059669; border-radius: 4px; height: 10px; width: ${progressPercent}%; }
        .status-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 8px; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${allComplete ? '✅ Document Completed!' : '📝 Signature Received'}</h1>
        </div>
        <div class="content">
            <p>Hello <strong>${params.recipientName}</strong>,</p>
            
            <p><strong>${params.signerName}</strong> has signed:</p>
            
            <div class="status-box">
                <h3 style="margin: 0 0 10px 0;">${params.documentTitle}</h3>
                <p style="margin: 0; color: #666;">
                    Progress: ${params.completedCount} of ${params.totalCount} signatures
                </p>
                <div class="progress-bar">
                    <div class="progress-fill"></div>
                </div>
            </div>
            
            ${allComplete ? `
                <p style="color: #059669; font-weight: bold; font-size: 16px;">
                    🎉 All signers have completed! Your document is ready.
                </p>
                ${params.viewUrl ? `
                    <center>
                        <a href="${params.viewUrl}" class="button">View Completed Document</a>
                    </center>
                ` : ''}
            ` : `
                <p style="color: #666;">
                    Waiting for ${params.totalCount - params.completedCount} more signature(s).
                </p>
            `}
        </div>
        <div class="footer">
            <p>Powered by PropMetrik E-Sign</p>
        </div>
    </div>
</body>
</html>`;

            await transporter.sendMail({
                from: process.env.EMAIL_FROM || 'PropMetrik E-Sign <noreply@propmetrik.com>',
                to: params.recipientEmail,
                subject: allComplete 
                    ? `✅ Completed: ${params.documentTitle}` 
                    : `${params.signerName} signed ${params.documentTitle}`,
                html,
            });

            logger.info('Signature completed email sent', { to: params.recipientEmail, allComplete });
            return true;
        } catch (error) {
            logger.error('Failed to send completion email', { error });
            return false;
        }
    }

    /**
     * Send reminder email
     */
    async sendReminderEmail(params: {
        signerEmail: string;
        signerName: string;
        documentTitle: string;
        signingUrl: string;
        daysRemaining?: number;
        reminderType: 'initial' | 'follow_up' | 'final_warning';
    }): Promise<boolean> {
        const urgencyText = {
            initial: '',
            follow_up: 'This is a reminder.',
            final_warning: '⚠️ FINAL REMINDER - Document expires soon!'
        };

        try {
            const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${params.reminderType === 'final_warning' ? '#dc2626' : '#f59e0b'}; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; padding: 15px 30px; background: #2563eb; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h2>⏰ Signature Reminder</h2>
        </div>
        <div class="content">
            <p>Hello ${params.signerName},</p>
            
            <p>${urgencyText[params.reminderType]} You have a pending signature request:</p>
            
            <p style="font-size: 18px; font-weight: bold;">${params.documentTitle}</p>
            
            ${params.daysRemaining ? `<p style="color: #dc2626;">Expires in ${params.daysRemaining} days</p>` : ''}
            
            <center>
                <a href="${params.signingUrl}" class="button">Sign Now</a>
            </center>
        </div>
    </div>
</body>
</html>`;

            await transporter.sendMail({
                from: process.env.EMAIL_FROM || 'PropMetrik E-Sign <noreply@propmetrik.com>',
                to: params.signerEmail,
                subject: `⏰ Reminder: ${params.documentTitle} awaits your signature`,
                html,
            });

            logger.info('Reminder email sent', { to: params.signerEmail, type: params.reminderType });
            return true;
        } catch (error) {
            logger.error('Failed to send reminder email', { error });
            return false;
        }
    }
}

export const emailService = new EmailService();
```

---

## 📋 Template Service (NEW - Port from phase12-esign)

Create `backend/shared-services/e-sign/templateService.ts`:

```typescript
/**
 * Template Service
 * Reusable document templates with predefined fields
 * Ported from phase12-esign/backend/api/templates.py
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../../src/database';
import { logger } from '../../src/utils/logger';

export interface TemplateFieldDefinition {
    role: string;           // 'landlord', 'tenant', etc.
    type: string;           // 'signature', 'initials', 'date_signed', 'text'
    page: number;
    x: number;              // Percentage or pixels
    y: number;
    width: number;
    height: number;
    required: boolean;
    label?: string;
}

export interface TemplateRole {
    name: string;
    order: number;
    required: boolean;
}

export interface Template {
    id: string;
    organizationId: string;
    name: string;
    description?: string;
    category: string;
    documentHtml?: string;
    documentPdfUrl?: string;
    documentDriveId?: string;
    fieldDefinitions: TemplateFieldDefinition[];
    roles: TemplateRole[];
    isShared: boolean;
    usedCount: number;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateTemplateDto {
    name: string;
    description?: string;
    category?: string;
    documentHtml?: string;
    documentPdfUrl?: string;
    documentDriveId?: string;
    fieldDefinitions: TemplateFieldDefinition[];
    roles: TemplateRole[];
    isShared?: boolean;
}

export class TemplateService {
    /**
     * Create a new template
     */
    async createTemplate(
        organizationId: string,
        userId: string,
        dto: CreateTemplateDto
    ): Promise<Template> {
        const id = uuidv4();

        const result = await db.query(
            `INSERT INTO esign_templates (
                id, organization_id, name, description, category,
                document_html, document_pdf_url, document_drive_id,
                field_definitions, roles, is_shared, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *`,
            [
                id,
                organizationId,
                dto.name,
                dto.description || null,
                dto.category || 'General',
                dto.documentHtml || null,
                dto.documentPdfUrl || null,
                dto.documentDriveId || null,
                JSON.stringify(dto.fieldDefinitions),
                JSON.stringify(dto.roles),
                dto.isShared || false,
                userId
            ]
        );

        logger.info('Template created', { id, name: dto.name });
        return this.mapToTemplate(result.rows[0]);
    }

    /**
     * List templates for organization
     */
    async listTemplates(
        organizationId: string,
        options: { category?: string; search?: string } = {}
    ): Promise<Template[]> {
        let query = `
            SELECT * FROM esign_templates 
            WHERE (organization_id = $1 OR is_shared = TRUE)
        `;
        const params: any[] = [organizationId];
        let paramIndex = 2;

        if (options.category) {
            query += ` AND category = $${paramIndex++}`;
            params.push(options.category);
        }

        if (options.search) {
            query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
            params.push(`%${options.search}%`);
            paramIndex++;
        }

        query += ` ORDER BY used_count DESC, created_at DESC`;

        const result = await db.query(query, params);
        return result.rows.map(this.mapToTemplate);
    }

    /**
     * Get template by ID
     */
    async getTemplateById(templateId: string, organizationId: string): Promise<Template | null> {
        const result = await db.query(
            `SELECT * FROM esign_templates 
             WHERE id = $1 AND (organization_id = $2 OR is_shared = TRUE)`,
            [templateId, organizationId]
        );

        if (result.rows.length === 0) return null;
        return this.mapToTemplate(result.rows[0]);
    }

    /**
     * Use a template (increment counter and return data)
     */
    async useTemplate(templateId: string, organizationId: string): Promise<Template | null> {
        const template = await this.getTemplateById(templateId, organizationId);
        if (!template) return null;

        await db.query(
            `UPDATE esign_templates SET used_count = used_count + 1 WHERE id = $1`,
            [templateId]
        );

        return template;
    }

    /**
     * Delete template
     */
    async deleteTemplate(templateId: string, organizationId: string, userId: string): Promise<boolean> {
        const result = await db.query(
            `DELETE FROM esign_templates 
             WHERE id = $1 AND organization_id = $2 AND created_by = $3 AND is_shared = FALSE
             RETURNING id`,
            [templateId, organizationId, userId]
        );

        return result.rowCount > 0;
    }

    /**
     * Get template categories
     */
    async getCategories(organizationId: string): Promise<string[]> {
        const result = await db.query(
            `SELECT DISTINCT category FROM esign_templates 
             WHERE organization_id = $1 OR is_shared = TRUE
             ORDER BY category`,
            [organizationId]
        );

        return result.rows.map(r => r.category);
    }

    private mapToTemplate(row: any): Template {
        return {
            id: row.id,
            organizationId: row.organization_id,
            name: row.name,
            description: row.description,
            category: row.category,
            documentHtml: row.document_html,
            documentPdfUrl: row.document_pdf_url,
            documentDriveId: row.document_drive_id,
            fieldDefinitions: typeof row.field_definitions === 'string' 
                ? JSON.parse(row.field_definitions) 
                : row.field_definitions,
            roles: typeof row.roles === 'string' 
                ? JSON.parse(row.roles) 
                : row.roles,
            isShared: row.is_shared,
            usedCount: row.used_count,
            createdBy: row.created_by,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}

export const templateService = new TemplateService();
```

---

## 🔄 Enhance pdfSigningService.ts for Field-Position Embedding

Add these methods to the existing `pdfSigningService.ts`:

```typescript
/**
 * Embed signature at specific x/y position on document
 * Enhanced version that handles field positions from esign_fields
 */
async embedSignatureAtPosition(
    pdfBytes: Uint8Array,
    signatureData: string,
    options: {
        page: number;
        x: number;          // Percentage (0-100)
        y: number;          // Percentage (0-100)
        width: number;
        height: number;
        signatureId: string;
        signedAt: Date;
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
    
    // Convert percentage to pixels
    const x = (options.x / 100) * pageWidth;
    const y = pageHeight - ((options.y / 100) * pageHeight) - options.height;
    
    // Decode and embed signature image
    const sigBase64 = signatureData.replace(/^data:image\/\w+;base64,/, '');
    const sigBytes = Buffer.from(sigBase64, 'base64');
    
    let sigImage;
    if (signatureData.includes('image/png')) {
        sigImage = await pdfDoc.embedPng(sigBytes);
    } else {
        sigImage = await pdfDoc.embedJpg(sigBytes);
    }
    
    // Draw signature
    page.drawImage(sigImage, {
        x,
        y,
        width: options.width,
        height: options.height,
    });
    
    // Add signature ID and timestamp below
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page.drawText(`Signed: ${options.signedAt.toISOString().split('T')[0]} | ID: ${options.signatureId}`, {
        x,
        y: y - 10,
        size: 6,
        font,
        color: rgb(0.4, 0.4, 0.4),
    });
    
    return pdfDoc.save();
}
```

---

## 📋 Implementation Checklist

### Phase 1: Database & Core Services (Week 1) ✅ COMPLETED

- [x] Create migration `051_esign_phase2_enhancements.sql`
  - [x] `esign_signatures` table with unique IDs
  - [x] `esign_certificates` table
  - [x] `esign_templates` table
  - [x] `esign_reminders` table
- [x] Create `signatureIdService.ts`
- [x] Update `signingService.ts` to create signature records
- [x] Add signature_id to signing flow

### Phase 2: Template & Envelope Integration (Week 2) ✅ COMPLETED

- [x] Create `templateService.ts`
- [x] Create template API endpoints in routes
- [x] Enhance envelope creation to use templates
- [x] Update `pdfSigningService.ts` for field-position embedding

### Phase 3: Email & Notifications (Week 3) ✅ COMPLETED

- [x] Create `emailService.ts` (port from phase12)
- [x] Create `reminderService.ts`
- [x] Add reminder scheduling cron job
- [x] Integrate email sending into signing flow

### Phase 4: PDF Enhancement (Week 4)

- [ ] Enhance `pdfSigningService.ts` for signature embedding at x/y positions
- [ ] Generate Certificate of Completion PDF
- [ ] Add signed PDF download endpoint
- [ ] Test with various document types

### Phase 5: Frontend Integration (Week 5)

- [ ] Update envelope viewer to show signatures at field positions
- [ ] Add template management UI
- [ ] Add signature ID display on completed documents
- [ ] Add Certificate of Completion viewer

### Phase 6: Testing & Cleanup (Week 6)

- [ ] End-to-end testing of full signing flow
- [ ] Security audit (token expiration, access control)
- [ ] Performance testing
- [ ] **DELETE phase12-esign folder** after verification

---

## 🔗 Updated Export Index

Update `backend/shared-services/e-sign/index.ts`:

```typescript
/**
 * E-Signature Service Exports
 */

export * from './types';

// Existing services
export { signingService, SigningService } from './signingService';
export { keyManagementService, KeyManagementService } from './keyManagementService';
export { timestampService, TimestampService } from './timestampService';
export { auditLogService, AuditLogService } from './auditLogService';
export { consentService, ConsentService } from './consentService';
export { magicLinkService, MagicLinkService } from './magicLinkService';
export { pdfSigningService, PdfSigningService } from './pdfSigningService';

// New services (ported from phase12-esign)
export { signatureIdService, SignatureIdService } from './signatureIdService';
export { emailService, EmailService } from './emailService';
export { templateService, TemplateService } from './templateService';
export { reminderService, ReminderService } from './reminderService';
```

---

## 📚 References

### To Delete After Migration:
- `phase12-esign/` - Entire folder (Python/FastAPI implementation)

### Enhanced Files:
- [backend/shared-services/e-sign/](../backend/shared-services/e-sign/) - Main e-sign service
- [backend/src/services/esign/esignService.ts](../backend/src/services/esign/esignService.ts) - Envelope management
- [backend/database/migrations/050_esign_envelopes.sql](../backend/database/migrations/050_esign_envelopes.sql) - Existing schema

### New Files to Create:
- `backend/shared-services/e-sign/signatureIdService.ts`
- `backend/shared-services/e-sign/emailService.ts`
- `backend/shared-services/e-sign/templateService.ts`
- `backend/shared-services/e-sign/reminderService.ts`
- `backend/database/migrations/051_esign_phase2_enhancements.sql`
