/**
 * Unified Notification Service
 * Shared service for SMS (Twilio) and Email (Google SMTP) notifications
 * 
 * @module shared-services/notifications
 */

import { logger } from '../../utils/logger';

// =====================================================
// INTERFACES
// =====================================================

export interface SMSMessage {
    to: string;
    body: string;
    from?: string;
}

export interface EmailMessage {
    to: string;
    subject: string;
    text?: string;
    html?: string;
    from?: string;
    fromName?: string;
    replyTo?: string;
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
    defaultFrom: string;
    defaultFromName: string;
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
    private defaultFrom: string;
    private defaultFromName: string;
    private transporter: any; // nodemailer transporter

    constructor(config?: Partial<GoogleSMTPConfig>) {
        this.user = config?.user || process.env.GOOGLE_SMTP_USER || '';
        this.clientId = config?.clientId || process.env.GOOGLE_CLIENT_ID || '';
        this.clientSecret = config?.clientSecret || process.env.GOOGLE_CLIENT_SECRET || '';
        this.refreshToken = config?.refreshToken || process.env.GOOGLE_REFRESH_TOKEN || '';
        this.defaultFrom = config?.defaultFrom || process.env.GOOGLE_SMTP_FROM || this.user;
        this.defaultFromName = config?.defaultFromName || process.env.GOOGLE_SMTP_FROM_NAME || 'PropMetrik';

        this.initializeTransporter();
    }

    private async initializeTransporter(): Promise<void> {
        if (!this.user || !this.clientId || !this.clientSecret || !this.refreshToken) {
            logger.warn('Google SMTP credentials not configured. Email sending will fail.');
            return;
        }

        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const nodemailer = require('nodemailer');

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

            // Verify connection
            this.transporter.verify((error: any) => {
                if (error) {
                    logger.error('Google SMTP connection failed', { error: error.message });
                } else {
                    logger.info('Google SMTP connection established');
                }
            });
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

// =====================================================
// UNIFIED NOTIFICATION SERVICE
// =====================================================

export class UnifiedNotificationService {
    private smsService: TwilioSMSService;
    private emailService: GoogleSMTPEmailService;

    constructor() {
        this.smsService = new TwilioSMSService();
        this.emailService = new GoogleSMTPEmailService();
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
        const body = `Your PropMetrik verification code is: ${otp}. Valid for 5 minutes. Do not share this code.`;
        return this.sendSMS(phone, body);
    }

    /**
     * Send Magic Link via Email
     */
    async sendMagicLink(email: string, magicLink: string): Promise<NotificationResult> {
        return this.sendEmail({
            to: email,
            subject: 'Login to PropMetrik Tenant Portal',
            html: `
                <h2>Login to PropMetrik</h2>
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
            text: `Login to PropMetrik. Click this link: ${magicLink}. This link expires in 15 minutes.`
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
export const emailService = new GoogleSMTPEmailService();
