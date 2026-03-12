/**
 * Unified Notification Service
 * Shared service for SMS (Twilio) and Email (Google SMTP) notifications
 * 
 * @module shared-services/notifications
 */

import { logger } from '../../../src/utils/logger';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

// =====================================================
// MARKETING / SOCIAL LINKS  (update when real URLs are live)
// =====================================================
const SOCIAL_LINKS = {
    twitter:   process.env.PROPMETRIK_TWITTER_URL   || 'https://twitter.com/propmetrik',
    instagram: process.env.PROPMETRIK_INSTAGRAM_URL || 'https://instagram.com/propmetrik',
    tiktok:    process.env.PROPMETRIK_TIKTOK_URL    || 'https://tiktok.com/@propmetrik',
    website:   process.env.PROPMETRIK_WEBSITE_URL   || 'https://propmetrik.com',
};

// =====================================================
// INTERFACES
// =====================================================

export interface SMSMessage {
    to: string;
    body: string;
    from?: string;
}

export interface EmailAttachment {
    filename: string;
    content: Buffer;
    contentType?: string;
}

export interface EmailMessage {
    to: string;
    subject: string;
    text?: string;
    html?: string;
    from?: string;
    fromName?: string;
    replyTo?: string;
    attachments?: EmailAttachment[];
}

export interface NotificationResult {
    success: boolean;
    messageId?: string;
    error?: string;
}

export interface SMSConfig {
    accountSid: string;
    authToken: string;
    defaultFrom: string;
}

export interface GoogleSMTPConfig {
    user: string;
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    smtpPassword?: string;
    defaultFrom: string;
    defaultFromName: string;
}

export interface MicrosoftSMTPConfig {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    scope: string;
    grantType: string;
    authUrl?: string;
    defaultFrom: string;
    defaultFromName: string;
}

export interface AwsSESConfig {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    defaultFrom: string;
    defaultFromName: string;
    replyTo?: string;
}

// =====================================================
// TWILIO SMS SERVICE
// =====================================================

export class TwilioSMSService {
    private accountSid: string;
    private authToken: string;
    private defaultFrom: string;
    private isTestMode: boolean;
    private client: any; // Twilio client

    constructor(config?: Partial<SMSConfig>) {
        // Determine mode from environment
        this.isTestMode = process.env.PAYMENT_MODE !== 'live';

        // Select keys based on mode
        if (this.isTestMode) {
            this.accountSid = config?.accountSid || process.env.TWILIO_TEST_ACCOUNT_SID || '';
            this.authToken = config?.authToken || process.env.TWILIO_TEST_AUTH_TOKEN || '';
            this.defaultFrom = config?.defaultFrom || process.env.TWILIO_TEST_PHONE_NUMBER || '';
        } else {
            this.accountSid = config?.accountSid || process.env.TWILIO_LIVE_ACCOUNT_SID || '';
            this.authToken = config?.authToken || process.env.TWILIO_LIVE_AUTH_TOKEN || '';
            this.defaultFrom = config?.defaultFrom || process.env.TWILIO_LIVE_PHONE_NUMBER || '';
        }

        if (!this.accountSid || !this.authToken) {
            logger.warn(`Twilio ${this.isTestMode ? 'TEST' : 'LIVE'} credentials not configured. SMS sending will fail.`);
        }

        logger.info(`TwilioSMSService initialized in ${this.isTestMode ? 'TEST' : 'LIVE'} mode`);

        // Lazy load Twilio client to avoid crashes if not installed
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const twilio = require('twilio');
            this.client = twilio(this.accountSid, this.authToken);
        } catch (e) {
            logger.warn('Twilio package not installed. SMS sending will be disabled.');
            this.client = null;
        }
    }

    /**
     * Check if running in test mode
     */
    isTest(): boolean {
        return this.isTestMode;
    }

    /**
     * Send SMS via Twilio
     */
    async send(message: SMSMessage): Promise<NotificationResult> {
        if (!this.client) {
            logger.error('Twilio client not initialized');
            return { success: false, error: 'SMS service not configured' };
        }

        try {
            // Format Ghana phone numbers
            const formattedTo = this.formatGhanaPhone(message.to);

            const result = await this.client.messages.create({
                body: message.body,
                to: formattedTo,
                from: message.from || this.defaultFrom
            });

            logger.info('SMS sent successfully', {
                messageId: result.sid,
                to: formattedTo
            });

            return {
                success: true,
                messageId: result.sid
            };
        } catch (error: any) {
            logger.error('Failed to send SMS', {
                error: error.message,
                to: message.to
            });
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Format Ghana phone number to E.164 format
     */
    private formatGhanaPhone(phone: string): string {
        // Remove spaces and special characters
        let cleaned = phone.replace(/[\s\-\(\)]/g, '');

        // If starts with 0, replace with +233
        if (cleaned.startsWith('0')) {
            cleaned = '+233' + cleaned.substring(1);
        }
        // If starts with 233 (no +), add +
        else if (cleaned.startsWith('233')) {
            cleaned = '+' + cleaned;
        }
        // If doesn't start with +, assume Ghana and add +233
        else if (!cleaned.startsWith('+')) {
            cleaned = '+233' + cleaned;
        }

        return cleaned;
    }
}

// =====================================================
// GOOGLE SMTP EMAIL SERVICE (using nodemailer)
// =====================================================

export class GoogleSMTPEmailService {
    private user: string;
    private clientId: string;
    private clientSecret: string;
    private refreshToken: string;
    private smtpPassword: string;
    private defaultFrom: string;
    private defaultFromName: string;
    private transporter: any; // nodemailer transporter

    constructor(config?: Partial<GoogleSMTPConfig>) {
        this.user = config?.user || process.env.GOOGLE_SMTP_USER || '';
        this.clientId = config?.clientId || process.env.GOOGLE_CLIENT_ID || '';
        this.clientSecret = config?.clientSecret || process.env.GOOGLE_CLIENT_SECRET || '';
        this.refreshToken = config?.refreshToken || process.env.GOOGLE_REFRESH_TOKEN || '';
        this.smtpPassword = config?.smtpPassword || process.env.GOOGLE_SMTP_PASSWORD || '';
        this.defaultFrom = config?.defaultFrom || process.env.GOOGLE_SMTP_FROM || this.user;
        this.defaultFromName = config?.defaultFromName || process.env.GOOGLE_SMTP_FROM_NAME || 'PROPMETRIK';

        this.initializeTransporter();
    }

    private async initializeTransporter(): Promise<void> {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const nodemailer = require('nodemailer');

            if (this.user && this.smtpPassword) {
                const appPasswordTransporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: this.user,
                        pass: this.smtpPassword
                    }
                });

                try {
                    await appPasswordTransporter.verify();
                    this.transporter = appPasswordTransporter;
                    logger.info('Google SMTP connected using App Password');
                    return;
                } catch (appPassError: any) {
                    logger.warn('Google SMTP app-password authentication failed, trying OAuth2', {
                        error: appPassError?.message
                    });
                }
            }

            if (!this.user || !this.clientId || !this.clientSecret || !this.refreshToken) {
                logger.warn('Google SMTP credentials not configured. Email sending will fail.');
                return;
            }

            this.transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    type: 'OAuth2',
                    user: this.user,
                    clientId: this.clientId,
                    clientSecret: this.clientSecret,
                    refreshToken: this.refreshToken
                }
            });

            await this.transporter.verify();
            logger.info('Google SMTP connection established with OAuth2');
        } catch (e: any) {
            logger.warn('Nodemailer package not installed. Email sending will be disabled.', { error: e.message });
            this.transporter = null;
        }
    }

    /**
     * Send email via Google SMTP
     */
    async send(message: EmailMessage): Promise<NotificationResult> {
        if (!this.transporter) {
            logger.error('Google SMTP transporter not initialized');
            return { success: false, error: 'Email service not configured' };
        }

        try {
            const fromAddress = message.from || this.defaultFrom;
            const fromName = message.fromName || this.defaultFromName;

            const mailOptions: any = {
                from: `"${fromName}" <${fromAddress}>`,
                to: message.to,
                subject: message.subject
            };

            if (message.html) mailOptions.html = message.html;
            if (message.text) mailOptions.text = message.text;
            if (message.replyTo) mailOptions.replyTo = message.replyTo;
            if (message.attachments?.length) {
                mailOptions.attachments = message.attachments.map(a => ({
                    filename: a.filename,
                    content: a.content,
                    contentType: a.contentType || 'application/octet-stream',
                }));
            }

            const result = await this.transporter.sendMail(mailOptions);

            logger.info('Email sent successfully via Google SMTP', {
                to: message.to,
                subject: message.subject,
                messageId: result.messageId
            });

            return {
                success: true,
                messageId: result.messageId
            };
        } catch (error: any) {
            logger.error('Failed to send email via Google SMTP', {
                error: error.message,
                to: message.to
            });
            return {
                success: false,
                error: error.message
            };
        }
    }
}

export class MicrosoftGraphEmailService {
    private tenantId: string;
    private clientId: string;
    private clientSecret: string;
    private scope: string;
    private grantType: string;
    private authUrl: string;
    private defaultFrom: string;
    private defaultFromName: string;

    constructor(config?: Partial<MicrosoftSMTPConfig>) {
        this.tenantId = config?.tenantId || process.env.MS_TENANT_ID || '';
        this.clientId = config?.clientId || process.env.MS_CLIENT_ID || '';
        this.clientSecret = config?.clientSecret || process.env.MS_CLIENT_SECRET || '';
        this.scope = config?.scope || process.env.MS_GRAPH_SCOPE || 'https://graph.microsoft.com/.default';
        this.grantType = config?.grantType || process.env.MS_GRANT_TYPE || 'client_credentials';
        // Always build authUrl from tenantId — MS_AUTH_URL in .env often contains un-interpolated ${MS_TENANT_ID}
        this.authUrl = config?.authUrl || `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
        this.defaultFrom = config?.defaultFrom || process.env.MS_SMTP_FROM || '';
        this.defaultFromName = config?.defaultFromName || process.env.MS_SMTP_FROM_NAME || 'PROPMETRIK';

        if (!this.tenantId || !this.clientId || !this.clientSecret || !this.defaultFrom) {
            logger.warn('Microsoft Graph SMTP credentials not fully configured. Provider will be skipped.');
        }
    }

    private isConfigured(): boolean {
        return !!(this.tenantId && this.clientId && this.clientSecret && this.defaultFrom);
    }

    private async getAccessToken(): Promise<string> {
        const params = new URLSearchParams();
        params.append('client_id', this.clientId);
        params.append('scope', this.scope);
        params.append('client_secret', this.clientSecret);
        params.append('grant_type', this.grantType);

        const response = await fetch(this.authUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Microsoft token request failed (${response.status}): ${body}`);
        }

        const tokenData: any = await response.json();
        if (!tokenData?.access_token) {
            throw new Error('Microsoft token response missing access_token');
        }
        return tokenData.access_token as string;
    }

    async send(message: EmailMessage): Promise<NotificationResult> {
        if (!this.isConfigured()) {
            return { success: false, error: 'Microsoft provider not configured' };
        }

        try {
            const token = await this.getAccessToken();
            const fromAddress = message.from || this.defaultFrom;
            const fromName = message.fromName || this.defaultFromName;
            const contentType: 'HTML' | 'Text' = message.html ? 'HTML' : 'Text';
            const content = message.html || message.text || '';

            const payload = {
                message: {
                    subject: message.subject,
                    body: {
                        contentType,
                        content,
                    },
                    from: {
                        emailAddress: {
                            address: fromAddress,
                            name: fromName,
                        },
                    },
                    toRecipients: [
                        {
                            emailAddress: {
                                address: message.to,
                            },
                        },
                    ],
                    ...(message.replyTo
                        ? {
                            replyTo: [
                                {
                                    emailAddress: {
                                        address: message.replyTo,
                                    },
                                },
                            ],
                        }
                        : {}),
                    ...(message.attachments?.length
                        ? {
                            attachments: message.attachments.map(a => ({
                                '@odata.type': '#microsoft.graph.fileAttachment',
                                name: a.filename,
                                contentType: a.contentType || 'application/octet-stream',
                                contentBytes: a.content.toString('base64'),
                            })),
                        }
                        : {}),
                },
                saveToSentItems: false,
            };

            const sendResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromAddress)}/sendMail`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!sendResponse.ok) {
                const body = await sendResponse.text();
                throw new Error(`Microsoft sendMail failed (${sendResponse.status}): ${body}`);
            }

            const requestId = sendResponse.headers.get('request-id') || undefined;

            logger.info('Email sent successfully via Microsoft Graph', {
                to: message.to,
                subject: message.subject,
                requestId,
            });

            return {
                success: true,
                messageId: requestId,
            };
        } catch (error: any) {
            logger.error('Failed to send email via Microsoft Graph', {
                error: error.message,
                to: message.to,
            });
            return {
                success: false,
                error: error.message,
            };
        }
    }
}

export class AwsSESEmailService {
    private region: string;
    private accessKeyId: string;
    private secretAccessKey: string;
    private defaultFrom: string;
    private defaultFromName: string;
    private replyTo?: string;
    private client: SESv2Client | null;

    constructor(config?: Partial<AwsSESConfig>) {
        this.region = config?.region || process.env.AWS_REGION || '';
        this.accessKeyId = config?.accessKeyId || process.env.AWS_ACCESS_KEY_ID || '';
        this.secretAccessKey = config?.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY || '';
        this.defaultFrom = config?.defaultFrom || process.env.AWS_SES_FROM_EMAIL || '';
        this.defaultFromName = config?.defaultFromName || process.env.AWS_SES_FROM_NAME || 'PROPMETRIK';
        this.replyTo = config?.replyTo || process.env.AWS_SES_REPLY_TO || undefined;

        if (!this.region || !this.accessKeyId || !this.secretAccessKey || !this.defaultFrom) {
            logger.warn('AWS SES credentials not fully configured. Provider will be skipped.');
            this.client = null;
            return;
        }

        this.client = new SESv2Client({
            region: this.region,
            credentials: {
                accessKeyId: this.accessKeyId,
                secretAccessKey: this.secretAccessKey,
            },
        });
    }

    private isConfigured(): boolean {
        return !!this.client;
    }

    async send(message: EmailMessage): Promise<NotificationResult> {
        if (!this.isConfigured() || !this.client) {
            return { success: false, error: 'AWS SES provider not configured' };
        }

        try {
            const fromAddress = message.from || this.defaultFrom;
            const fromName = message.fromName || this.defaultFromName;
            const content = message.html || message.text || '';
            const sendCommand = new SendEmailCommand({
                FromEmailAddress: `${fromName} <${fromAddress}>`,
                Destination: {
                    ToAddresses: [message.to],
                },
                Content: {
                    Simple: {
                        Subject: {
                            Data: message.subject,
                            Charset: 'UTF-8',
                        },
                        Body: {
                            ...(message.html
                                ? { Html: { Data: content, Charset: 'UTF-8' } }
                                : { Text: { Data: content, Charset: 'UTF-8' } }),
                        },
                    },
                },
                ...(message.replyTo || this.replyTo
                    ? { ReplyToAddresses: [message.replyTo || this.replyTo || ''] }
                    : {}),
            });

            const result = await this.client.send(sendCommand);

            logger.info('Email sent successfully via AWS SES', {
                to: message.to,
                subject: message.subject,
                messageId: result.MessageId,
            });

            return {
                success: true,
                messageId: result.MessageId,
            };
        } catch (error: any) {
            logger.error('Failed to send email via AWS SES', {
                error: error.message,
                to: message.to,
            });
            return {
                success: false,
                error: error.message,
            };
        }
    }
}

type EmailProvider = 'microsoft' | 'google' | 'aws_ses';

export class PrioritySMTPEmailService {
    private microsoftService: MicrosoftGraphEmailService;
    private googleService: GoogleSMTPEmailService;
    private awsSesService: AwsSESEmailService;
    private priority: EmailProvider[] = ['microsoft', 'aws_ses', 'google'];

    constructor() {
        this.microsoftService = new MicrosoftGraphEmailService();
        this.googleService = new GoogleSMTPEmailService();
        this.awsSesService = new AwsSESEmailService();
    }

    async send(message: EmailMessage): Promise<NotificationResult> {
        const errors: string[] = [];

        for (const provider of this.priority) {
            const result = await this.sendWithProvider(provider, message);
            if (result.success) {
                logger.info('Email sent with provider', { provider, to: message.to, subject: message.subject });
                return result;
            }
            const reason = result.error || 'unknown error';
            errors.push(`${provider}: ${reason}`);
            logger.warn('Email provider failed, trying next', { provider, error: reason, to: message.to });
        }

        return {
            success: false,
            error: `All email providers failed. ${errors.join(' | ')}`,
        };
    }

    private sendWithProvider(provider: EmailProvider, message: EmailMessage): Promise<NotificationResult> {
        switch (provider) {
            case 'microsoft':
                return this.microsoftService.send(message);
            case 'google':
                return this.googleService.send(message);
            case 'aws_ses':
                return this.awsSesService.send(message);
            default:
                return Promise.resolve({ success: false, error: `Unsupported provider: ${provider}` });
        }
    }
}

// =====================================================
// UNIFIED NOTIFICATION SERVICE
// =====================================================

export class UnifiedNotificationService {
    private smsService: TwilioSMSService;
    private emailService: PrioritySMTPEmailService;

    constructor() {
        this.smsService = new TwilioSMSService();
        this.emailService = new PrioritySMTPEmailService();
    }

    /**
     * Send SMS
     */
    async sendSMS(to: string, body: string): Promise<NotificationResult> {
        return this.smsService.send({ to, body });
    }

    /**
     * Send Email
     */
    async sendEmail(message: EmailMessage): Promise<NotificationResult> {
        return this.emailService.send(message);
    }

    /**
     * Send OTP via SMS
     */
    async sendOTP(phone: string, otp: string): Promise<NotificationResult> {
        const body = `Your PROPMETRIK verification code is: ${otp}. Valid for 5 minutes. Do not share this code.`;
        return this.sendSMS(phone, body);
    }

    /**
     * Send Magic Link via Email (generic / re-login)
     */
    async sendMagicLink(email: string, magicLink: string): Promise<NotificationResult> {
        return this.sendEmail({
            to: email,
            subject: 'Login to PROPMETRIK Tenant Portal',
            html: `
                <h2>Login to PROPMETRIK</h2>
                <p>Click the button below to log in to your tenant portal:</p>
                <p>
                    <a href="${magicLink}" 
                       style="background-color: #4CAF50; color: white; padding: 14px 28px; text-decoration: none; display: inline-block; border-radius: 4px;">
                        Log In
                    </a>
                </p>
                <p>Or copy and paste this link: ${magicLink}</p>
                <p>This link expires in 15 minutes.</p>
                <p>If you didn't request this, please ignore this email.</p>
            `,
            text: `Login to PROPMETRIK. Click this link: ${magicLink}. This link expires in 15 minutes.`
        });
    }

    /**
     * Send Tenant Portal Invite — branded, personalised first-time invite email
     */
    async sendPortalInvite(
        email: string,
        magicLink: string,
        context: {
            tenantName: string;
            organizationName: string;
            propertyTitle: string;
            propertyAddress: string;
        }
    ): Promise<NotificationResult> {
        const { tenantName, organizationName, propertyTitle, propertyAddress } = context;
        const firstName = tenantName.split(' ')[0] || tenantName;

        return this.sendEmail({
            to: email,
            subject: `You're Invited to Your Tenant Portal — ${propertyTitle}`,
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
                    <div style="background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%); padding: 32px 24px; border-radius: 12px 12px 0 0; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">Welcome to Your Tenant Portal</h1>
                    </div>

                    <div style="background: #ffffff; padding: 32px 24px; border: 1px solid #e2e8f0; border-top: none;">
                        <p style="font-size: 16px; margin-top: 0;">Dear <strong>${firstName}</strong>,</p>

                        <p style="font-size: 15px; line-height: 1.6;">
                            <strong>${organizationName}</strong> has invited you to activate your tenant portal for your tenancy at:
                        </p>

                        <div style="background: #f0fdfa; border-left: 4px solid #0891b2; padding: 16px 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                            <p style="margin: 0 0 4px 0; font-size: 16px; font-weight: 600; color: #0e7490;">${propertyTitle}</p>
                            <p style="margin: 0; font-size: 14px; color: #475569;">${propertyAddress}</p>
                        </div>

                        <p style="font-size: 15px; line-height: 1.6;">Your tenant portal gives you 24/7 access to:</p>

                        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                            <tr>
                                <td style="padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9;">
                                    <strong>Make rent payments</strong> &mdash; Mobile Money, Bank Transfer &amp; more
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9;">
                                    <strong>View payment history</strong> &mdash; Receipts &amp; transaction records
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 10px 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9;">
                                    <strong>Submit maintenance requests</strong> &mdash; Track progress in real time
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 10px 12px; font-size: 14px;">
                                    <strong>Access your lease</strong> &mdash; Documents always at your fingertips
                                </td>
                            </tr>
                        </table>

                        <p style="font-size: 15px; line-height: 1.6;">Get started by clicking the button below to set up your account:</p>

                        <div style="text-align: center; margin: 28px 0;">
                            <a href="${magicLink}"
                               style="background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%); color: #ffffff; padding: 16px 36px; text-decoration: none; display: inline-block; border-radius: 8px; font-size: 16px; font-weight: 600; letter-spacing: 0.3px;">
                                Activate My Portal
                            </a>
                        </div>

                        <p style="font-size: 13px; color: #64748b; word-break: break-all;">Or copy and paste this link: ${magicLink}</p>

                        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />

                        <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">
                            This link expires in <strong>24 hours</strong>. If it expires, contact your property manager for a new invitation.
                            If you didn't expect this email, you can safely ignore it.
                        </p>
                    </div>

                    <div style="background: #f8fafc; padding: 20px 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
                        <p style="margin: 0 0 12px 0; font-size: 13px; color: #94a3b8;">The PROPMETRIK Team &middot; On behalf of <strong>${organizationName}</strong></p>
                        <p style="margin: 0;">
                            <a href="${SOCIAL_LINKS.twitter}" style="color: #64748b; text-decoration: none; margin: 0 8px; font-size: 13px;">Twitter</a>
                            <span style="color: #cbd5e1;">&middot;</span>
                            <a href="${SOCIAL_LINKS.instagram}" style="color: #64748b; text-decoration: none; margin: 0 8px; font-size: 13px;">Instagram</a>
                            <span style="color: #cbd5e1;">&middot;</span>
                            <a href="${SOCIAL_LINKS.tiktok}" style="color: #64748b; text-decoration: none; margin: 0 8px; font-size: 13px;">TikTok</a>
                            <span style="color: #cbd5e1;">&middot;</span>
                            <a href="${SOCIAL_LINKS.website}" style="color: #64748b; text-decoration: none; margin: 0 8px; font-size: 13px;">propmetrik.com</a>
                        </p>
                    </div>
                </div>
            `,
            text: `Dear ${firstName}, ${organizationName} has invited you to activate your tenant portal for ${propertyTitle} at ${propertyAddress}. Click this link to get started: ${magicLink}. This link expires in 24 hours.`
        });
    }

    /**
     * Send Rent Reminder
     */
    async sendRentReminder(
        channel: 'sms' | 'email' | 'both',
        contact: { phone?: string; email?: string },
        data: {
            tenantName: string;
            propertyTitle: string;
            amount: number;
            currency: string;
            dueDate: string;
            paymentLink?: string;
        }
    ): Promise<{ sms?: NotificationResult; email?: NotificationResult }> {
        const results: { sms?: NotificationResult; email?: NotificationResult } = {};

        if ((channel === 'sms' || channel === 'both') && contact.phone) {
            const smsBody = `Dear ${data.tenantName}, your rent of ${data.currency} ${data.amount.toLocaleString()} for ${data.propertyTitle} is due on ${data.dueDate}. ${data.paymentLink ? `Pay now: ${data.paymentLink}` : 'Please make payment.'}`;
            results.sms = await this.sendSMS(contact.phone, smsBody);
        }

        if ((channel === 'email' || channel === 'both') && contact.email) {
            results.email = await this.sendEmail({
                to: contact.email,
                subject: `Rent Payment Reminder - ${data.propertyTitle}`,
                html: `
                    <h2>Rent Payment Reminder</h2>
                    <p>Dear ${data.tenantName},</p>
                    <p>This is a friendly reminder that your rent payment of <strong>${data.currency} ${data.amount.toLocaleString()}</strong> 
                       for <strong>${data.propertyTitle}</strong> is due on <strong>${data.dueDate}</strong>.</p>
                    ${data.paymentLink ? `
                        <p>
                            <a href="${data.paymentLink}" 
                               style="background-color: #2196F3; color: white; padding: 10px 20px; text-decoration: none; display: inline-block; border-radius: 4px;">
                                Pay Now
                            </a>
                        </p>
                    ` : ''}
                    <p>Thank you for your prompt payment.</p>
                `,
                text: `Dear ${data.tenantName}, your rent of ${data.currency} ${data.amount.toLocaleString()} for ${data.propertyTitle} is due on ${data.dueDate}. Please make payment.`
            });
        }

        return results;
    }

    /**
     * Send Rent Overdue Notice
     */
    async sendRentOverdueNotice(
        channel: 'sms' | 'email' | 'both',
        contact: { phone?: string; email?: string },
        data: {
            tenantName: string;
            propertyTitle: string;
            amount: number;
            currency: string;
            daysOverdue: number;
            lateFee: number;
            paymentLink?: string;
        }
    ): Promise<{ sms?: NotificationResult; email?: NotificationResult }> {
        const results: { sms?: NotificationResult; email?: NotificationResult } = {};

        if ((channel === 'sms' || channel === 'both') && contact.phone) {
            const smsBody = `URGENT: Your rent of ${data.currency} ${data.amount.toLocaleString()} for ${data.propertyTitle} is ${data.daysOverdue} days overdue. Late fee: ${data.currency} ${data.lateFee}. Please pay immediately.`;
            results.sms = await this.sendSMS(contact.phone, smsBody);
        }

        if ((channel === 'email' || channel === 'both') && contact.email) {
            results.email = await this.sendEmail({
                to: contact.email,
                subject: `URGENT: Rent Payment Overdue - ${data.propertyTitle}`,
                html: `
                    <h2 style="color: #d32f2f;">Rent Payment Overdue</h2>
                    <p>Dear ${data.tenantName},</p>
                    <p>Your rent payment of <strong>${data.currency} ${data.amount.toLocaleString()}</strong> 
                       for <strong>${data.propertyTitle}</strong> is now <strong style="color: #d32f2f;">${data.daysOverdue} days overdue</strong>.</p>
                    <p>A late fee of <strong>${data.currency} ${data.lateFee.toLocaleString()}</strong> has been applied.</p>
                    <p>Please make payment immediately to avoid further fees and potential legal action.</p>
                    ${data.paymentLink ? `
                        <p>
                            <a href="${data.paymentLink}" 
                               style="background-color: #d32f2f; color: white; padding: 10px 20px; text-decoration: none; display: inline-block; border-radius: 4px;">
                                Pay Now
                            </a>
                        </p>
                    ` : ''}
                `
            });
        }

        return results;
    }

    /**
     * Send Payment Confirmation
     */
    async sendPaymentConfirmation(
        channel: 'sms' | 'email' | 'both',
        contact: { phone?: string; email?: string },
        data: {
            tenantName: string;
            propertyTitle: string;
            amount: number;
            currency: string;
            receiptNumber: string;
            periodCovered: string;
        }
    ): Promise<{ sms?: NotificationResult; email?: NotificationResult }> {
        const results: { sms?: NotificationResult; email?: NotificationResult } = {};

        if ((channel === 'sms' || channel === 'both') && contact.phone) {
            const smsBody = `Thank you! Payment of ${data.currency} ${data.amount.toLocaleString()} received for ${data.propertyTitle}. Receipt: ${data.receiptNumber}`;
            results.sms = await this.sendSMS(contact.phone, smsBody);
        }

        if ((channel === 'email' || channel === 'both') && contact.email) {
            results.email = await this.sendEmail({
                to: contact.email,
                subject: `Payment Confirmation - ${data.receiptNumber}`,
                html: `
                    <h2 style="color: #4CAF50;">Payment Confirmed</h2>
                    <p>Dear ${data.tenantName},</p>
                    <p>We have received your payment. Thank you!</p>
                    <table style="border-collapse: collapse; margin: 20px 0;">
                        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Property</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.propertyTitle}</td></tr>
                        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Amount</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.currency} ${data.amount.toLocaleString()}</td></tr>
                        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Period</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.periodCovered}</td></tr>
                        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Receipt #</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${data.receiptNumber}</td></tr>
                    </table>
                `
            });
        }

        return results;
    }

    /**
     * Send Lease Expiry Warning
     */
    async sendLeaseExpiryWarning(
        channel: 'sms' | 'email' | 'both',
        contact: { phone?: string; email?: string },
        data: {
            tenantName: string;
            propertyTitle: string;
            expiryDate: string;
            daysRemaining: number;
        }
    ): Promise<{ sms?: NotificationResult; email?: NotificationResult }> {
        const results: { sms?: NotificationResult; email?: NotificationResult } = {};

        if ((channel === 'sms' || channel === 'both') && contact.phone) {
            const smsBody = `Your lease for ${data.propertyTitle} expires on ${data.expiryDate} (${data.daysRemaining} days). Please contact us to discuss renewal options.`;
            results.sms = await this.sendSMS(contact.phone, smsBody);
        }

        if ((channel === 'email' || channel === 'both') && contact.email) {
            results.email = await this.sendEmail({
                to: contact.email,
                subject: `Lease Expiring Soon - ${data.propertyTitle}`,
                html: `
                    <h2>Lease Expiry Notice</h2>
                    <p>Dear ${data.tenantName},</p>
                    <p>Your lease for <strong>${data.propertyTitle}</strong> will expire on <strong>${data.expiryDate}</strong> 
                       (${data.daysRemaining} days from now).</p>
                    <p>Please contact us at your earliest convenience to discuss renewal options.</p>
                `
            });
        }

        return results;
    }

    /**
     * Send Maintenance Update
     */
    async sendMaintenanceUpdate(
        channel: 'sms' | 'email' | 'both',
        contact: { phone?: string; email?: string },
        data: {
            tenantName: string;
            propertyTitle: string;
            workOrderRef: string;
            status: string;
            notes?: string;
        }
    ): Promise<{ sms?: NotificationResult; email?: NotificationResult }> {
        const results: { sms?: NotificationResult; email?: NotificationResult } = {};

        if ((channel === 'sms' || channel === 'both') && contact.phone) {
            const smsBody = `Maintenance update for ${data.propertyTitle}: ${data.status}. Ref: ${data.workOrderRef}`;
            results.sms = await this.sendSMS(contact.phone, smsBody);
        }

        if ((channel === 'email' || channel === 'both') && contact.email) {
            results.email = await this.sendEmail({
                to: contact.email,
                subject: `Maintenance Update - ${data.workOrderRef}`,
                html: `
                    <h2>Maintenance Request Update</h2>
                    <p>Dear ${data.tenantName},</p>
                    <p>There's an update on your maintenance request for <strong>${data.propertyTitle}</strong>.</p>
                    <p><strong>Reference:</strong> ${data.workOrderRef}</p>
                    <p><strong>Status:</strong> ${data.status}</p>
                    ${data.notes ? `<p><strong>Notes:</strong> ${data.notes}</p>` : ''}
                `
            });
        }

        return results;
    }
}

// Singleton exports
export const notificationService = new UnifiedNotificationService();
export const smsService = new TwilioSMSService();
export const emailService = new PrioritySMTPEmailService();
