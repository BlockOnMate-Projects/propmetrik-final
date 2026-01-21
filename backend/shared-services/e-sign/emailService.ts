/**
 * Email Service for E-Sign Notifications
 * Ported from phase12-esign/backend/email_service.py
 * 
 * Handles all signature-related email notifications:
 * - Signature request emails
 * - Signature completion notifications
 * - Reminder emails
 * - Envelope completion notifications
 */

import nodemailer from 'nodemailer';
import { logger } from '../../src/utils/logger';

// SMTP Configuration
const SMTP_HOST = process.env.SMTP_HOST || 'localhost';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '1025', 10); // MailHog default
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || 'PropMetrik E-Sign <noreply@propmetrik.com>';

// Create transporter
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: SMTP_USER ? {
    user: SMTP_USER,
    pass: SMTP_PASS,
  } : undefined,
});

// Email Templates
const baseStyles = `
  body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f4f4f4; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .header { background: linear-gradient(135deg, #1a365d 0%, #2563eb 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
  .content { background: #ffffff; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
  .button { display: inline-block; padding: 15px 30px; background: #2563eb; color: white !important; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: bold; }
  .button:hover { background: #1d4ed8; }
  .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
  .document-title { font-size: 18px; font-weight: bold; color: #1a365d; margin: 15px 0; padding: 15px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #2563eb; }
  .warning { color: #dc2626; font-weight: bold; }
  .success { color: #059669; font-weight: bold; }
  .progress-bar { background: #e5e7eb; border-radius: 4px; height: 10px; margin: 15px 0; overflow: hidden; }
  .progress-fill { background: #059669; border-radius: 4px; height: 10px; transition: width 0.3s ease; }
  .status-box { background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e2e8f0; }
  .security-notice { font-size: 13px; color: #666; background: #fef3c7; padding: 12px; border-radius: 6px; margin-top: 20px; }
`;

export interface SigningRequestEmailParams {
  signerEmail: string;
  signerName: string;
  documentTitle: string;
  creatorName: string;
  signingUrl: string;
  expiresAt?: Date;
  message?: string;
}

export interface SignatureCompletedEmailParams {
  recipientEmail: string;
  recipientName: string;
  documentTitle: string;
  signerName: string;
  completedCount: number;
  totalCount: number;
  viewUrl?: string;
}

export interface ReminderEmailParams {
  signerEmail: string;
  signerName: string;
  documentTitle: string;
  signingUrl: string;
  daysRemaining?: number;
  reminderType: 'initial' | 'follow_up' | 'final_warning';
  creatorName?: string;
}

export interface EnvelopeCompletedEmailParams {
  recipientEmail: string;
  recipientName: string;
  documentTitle: string;
  completedAt: Date;
  downloadUrl?: string;
  certificateUrl?: string;
  signers: { name: string; signedAt: Date }[];
}

export class EmailService {
  /**
   * Send signature request email to a signer
   */
  async sendSigningRequestEmail(params: SigningRequestEmailParams): Promise<boolean> {
    try {
      const expiresText = params.expiresAt
        ? `This request expires on ${params.expiresAt.toLocaleDateString('en-US', { 
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
          })}.`
        : '';

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${baseStyles}</style>
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
      
      ${params.message ? `<p style="font-style: italic; color: #666; padding: 15px; background: #f0f9ff; border-radius: 6px;">"${params.message}"</p>` : ''}
      
      <p>Please review and sign the document by clicking below:</p>
      
      <center>
        <a href="${params.signingUrl}" class="button">Review & Sign Document</a>
      </center>
      
      ${expiresText ? `<p class="warning">⏰ ${expiresText}</p>` : ''}
      
      <div class="security-notice">
        <strong>🔒 Security Notice:</strong> Do not forward this email. 
        The signing link is unique to you and will expire after use.
      </div>
    </div>
    <div class="footer">
      <p>Powered by PropMetrik E-Sign</p>
      <p>© ${new Date().getFullYear()} PropMetrik Ghana Ltd. All rights reserved.</p>
      <p style="font-size: 10px;">Compliant with Ghana Electronic Transactions Act (Act 772)</p>
    </div>
  </div>
</body>
</html>`;

      const text = `
Hello ${params.signerName},

${params.creatorName} has requested your signature on: "${params.documentTitle}"

${params.message ? `Message: "${params.message}"` : ''}

Please click the link below to review and sign the document:
${params.signingUrl}

${expiresText}

Security Notice: Do not forward this email. The signing link is unique to you.

Powered by PropMetrik E-Sign
© ${new Date().getFullYear()} PropMetrik Ghana Ltd. All rights reserved.
`;

      await transporter.sendMail({
        from: EMAIL_FROM,
        to: params.signerEmail,
        subject: `📝 Signature Request: ${params.documentTitle}`,
        text,
        html,
      });

      logger.info('Signing request email sent', {
        to: params.signerEmail,
        document: params.documentTitle,
        from: params.creatorName,
      });
      return true;
    } catch (error) {
      logger.error('Failed to send signing request email', {
        error,
        to: params.signerEmail,
        document: params.documentTitle,
      });
      return false;
    }
  }

  /**
   * Send signature completion notification to creator
   */
  async sendSignatureCompletedEmail(params: SignatureCompletedEmailParams): Promise<boolean> {
    const allComplete = params.completedCount === params.totalCount;
    const progressPercent = Math.round((params.completedCount / params.totalCount) * 100);

    try {
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header" style="background: ${allComplete ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' : 'linear-gradient(135deg, #1a365d 0%, #2563eb 100%)'};">
      <h1>${allComplete ? '✅ Document Completed!' : '📝 Signature Received'}</h1>
    </div>
    <div class="content">
      <p>Hello <strong>${params.recipientName}</strong>,</p>
      
      <p><strong>${params.signerName}</strong> has signed:</p>
      
      <div class="status-box">
        <h3 style="margin: 0 0 10px 0;">📄 ${params.documentTitle}</h3>
        <p style="margin: 0; color: #666;">
          Progress: ${params.completedCount} of ${params.totalCount} signatures
        </p>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progressPercent}%;"></div>
        </div>
      </div>
      
      ${allComplete ? `
        <p class="success" style="font-size: 16px; text-align: center;">
          🎉 All signers have completed! Your document is ready.
        </p>
        ${params.viewUrl ? `
          <center>
            <a href="${params.viewUrl}" class="button">View & Download Document</a>
          </center>
        ` : ''}
      ` : `
        <p style="color: #666;">
          ⏳ Waiting for ${params.totalCount - params.completedCount} more signature(s).
        </p>
      `}
    </div>
    <div class="footer">
      <p>Powered by PropMetrik E-Sign</p>
      <p>© ${new Date().getFullYear()} PropMetrik Ghana Ltd.</p>
    </div>
  </div>
</body>
</html>`;

      const text = `
Hello ${params.recipientName},

${params.signerName} has signed: "${params.documentTitle}"

Progress: ${params.completedCount} of ${params.totalCount} signatures completed

${allComplete 
  ? '🎉 All signers have completed! Your document is ready.' 
  : `Waiting for ${params.totalCount - params.completedCount} more signature(s).`}

${params.viewUrl ? `View document: ${params.viewUrl}` : ''}

Powered by PropMetrik E-Sign
`;

      await transporter.sendMail({
        from: EMAIL_FROM,
        to: params.recipientEmail,
        subject: allComplete
          ? `✅ Completed: ${params.documentTitle}`
          : `📝 ${params.signerName} signed ${params.documentTitle}`,
        text,
        html,
      });

      logger.info('Signature completed email sent', {
        to: params.recipientEmail,
        document: params.documentTitle,
        allComplete,
      });
      return true;
    } catch (error) {
      logger.error('Failed to send signature completed email', {
        error,
        to: params.recipientEmail,
      });
      return false;
    }
  }

  /**
   * Send reminder email to pending signer
   */
  async sendReminderEmail(params: ReminderEmailParams): Promise<boolean> {
    const urgencyConfig = {
      initial: {
        headerBg: '#f59e0b',
        icon: '⏰',
        title: 'Signature Reminder',
        urgencyText: '',
      },
      follow_up: {
        headerBg: '#f97316',
        icon: '⏰',
        title: 'Signature Reminder',
        urgencyText: 'This is a friendly reminder.',
      },
      final_warning: {
        headerBg: '#dc2626',
        icon: '⚠️',
        title: 'FINAL REMINDER',
        urgencyText: '⚠️ This document will expire soon!',
      },
    };

    const config = urgencyConfig[params.reminderType];

    try {
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header" style="background: ${config.headerBg};">
      <h2>${config.icon} ${config.title}</h2>
    </div>
    <div class="content">
      <p>Hello <strong>${params.signerName}</strong>,</p>
      
      <p>${config.urgencyText} You have a pending signature request:</p>
      
      <div class="document-title">📄 ${params.documentTitle}</div>
      
      ${params.daysRemaining !== undefined ? `
        <p style="color: #dc2626; font-weight: bold;">
          ⏰ Expires in ${params.daysRemaining} day${params.daysRemaining !== 1 ? 's' : ''}
        </p>
      ` : ''}
      
      ${params.creatorName ? `<p style="color: #666;">Requested by: ${params.creatorName}</p>` : ''}
      
      <center>
        <a href="${params.signingUrl}" class="button">Sign Now</a>
      </center>
      
      <div class="security-notice">
        <strong>🔒 Security Notice:</strong> This link is unique to you. Do not share or forward.
      </div>
    </div>
    <div class="footer">
      <p>Powered by PropMetrik E-Sign</p>
    </div>
  </div>
</body>
</html>`;

      const text = `
Hello ${params.signerName},

${config.urgencyText} You have a pending signature request:

Document: "${params.documentTitle}"
${params.daysRemaining !== undefined ? `Expires in: ${params.daysRemaining} days` : ''}
${params.creatorName ? `Requested by: ${params.creatorName}` : ''}

Sign now: ${params.signingUrl}

Powered by PropMetrik E-Sign
`;

      await transporter.sendMail({
        from: EMAIL_FROM,
        to: params.signerEmail,
        subject: `⏰ ${params.reminderType === 'final_warning' ? 'URGENT: ' : ''}Reminder: ${params.documentTitle} awaits your signature`,
        text,
        html,
      });

      logger.info('Reminder email sent', {
        to: params.signerEmail,
        document: params.documentTitle,
        type: params.reminderType,
      });
      return true;
    } catch (error) {
      logger.error('Failed to send reminder email', {
        error,
        to: params.signerEmail,
        type: params.reminderType,
      });
      return false;
    }
  }

  /**
   * Send envelope completion notification with download links
   */
  async sendEnvelopeCompletedEmail(params: EnvelopeCompletedEmailParams): Promise<boolean> {
    try {
      const signersHtml = params.signers
        .map(s => `<li><strong>${s.name}</strong> - signed ${s.signedAt.toLocaleDateString()}</li>`)
        .join('');

      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header" style="background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
      <h1>🎉 Document Completed!</h1>
    </div>
    <div class="content">
      <p>Hello <strong>${params.recipientName}</strong>,</p>
      
      <p>Great news! All parties have signed the document:</p>
      
      <div class="document-title">📄 ${params.documentTitle}</div>
      
      <div class="status-box">
        <h4 style="margin: 0 0 10px 0;">✅ All Signatures Collected</h4>
        <p style="margin: 0; color: #666;">Completed on ${params.completedAt.toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        })}</p>
        <ul style="margin-top: 15px; padding-left: 20px;">
          ${signersHtml}
        </ul>
      </div>
      
      <center>
        ${params.downloadUrl ? `<a href="${params.downloadUrl}" class="button">📥 Download Signed Document</a>` : ''}
        ${params.certificateUrl ? `<br><a href="${params.certificateUrl}" style="color: #2563eb; text-decoration: underline;">View Certificate of Completion</a>` : ''}
      </center>
      
      <p style="font-size: 13px; color: #666; margin-top: 20px;">
        📋 This document has been digitally signed and timestamped. The Certificate of Completion 
        contains a full audit trail of all signing events.
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

      const text = `
Hello ${params.recipientName},

Great news! All parties have signed the document: "${params.documentTitle}"

Completed on: ${params.completedAt.toLocaleDateString()}

Signers:
${params.signers.map(s => `- ${s.name} (signed ${s.signedAt.toLocaleDateString()})`).join('\n')}

${params.downloadUrl ? `Download: ${params.downloadUrl}` : ''}
${params.certificateUrl ? `Certificate: ${params.certificateUrl}` : ''}

Powered by PropMetrik E-Sign
`;

      await transporter.sendMail({
        from: EMAIL_FROM,
        to: params.recipientEmail,
        subject: `🎉 Completed: ${params.documentTitle}`,
        text,
        html,
      });

      logger.info('Envelope completed email sent', {
        to: params.recipientEmail,
        document: params.documentTitle,
      });
      return true;
    } catch (error) {
      logger.error('Failed to send envelope completed email', {
        error,
        to: params.recipientEmail,
      });
      return false;
    }
  }

  /**
   * Verify SMTP connection is working
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await transporter.verify();
      logger.info('SMTP connection verified successfully');
      return true;
    } catch (error) {
      logger.error('SMTP connection verification failed', { error });
      return false;
    }
  }
}

export const emailService = new EmailService();
