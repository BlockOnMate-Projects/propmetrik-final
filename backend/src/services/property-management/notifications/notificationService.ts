/**
 * Property Management Notification Service
 * Phase 4.5: Centralized Notification System
 * 
 * Handles SMS, Email, and WhatsApp notifications for property management events
 * 
 * @module services/property-management/notifications
 */

import { logger } from '../../../utils/logger';
import db from '../../../database';

// Notification Types
export enum NotificationType {
    RENT_DUE_REMINDER = 'rent_due_reminder',
    RENT_OVERDUE = 'rent_overdue',
    LEASE_EXPIRY_WARNING = 'lease_expiry_warning',
    LEASE_EXPIRED = 'lease_expired',
    PAYMENT_RECEIVED = 'payment_received',
    WORK_ORDER_CREATED = 'work_order_created',
    WORK_ORDER_ASSIGNED = 'work_order_assigned',
    WORK_ORDER_COMPLETED = 'work_order_completed',
    TENANT_WELCOME = 'tenant_welcome',
    MAINTENANCE_SCHEDULED = 'maintenance_scheduled'
}

export enum NotificationChannel {
    SMS = 'sms',
    EMAIL = 'email',
    WHATSAPP = 'whatsapp',
    IN_APP = 'in_app'
}

export interface NotificationPayload {
    recipientId: string;
    recipientType: 'tenant' | 'landlord' | 'vendor' | 'user';
    notificationType: NotificationType;
    channel: NotificationChannel;
    templateData: Record<string, any>;
    scheduledAt?: Date;
    organizationId: string;
}

export interface NotificationTemplate {
    type: NotificationType;
    subject: string;
    smsTemplate: string;
    emailTemplate: string;
    whatsappTemplate?: string;
}

// Ghana-specific notification templates
const NOTIFICATION_TEMPLATES: Record<NotificationType, NotificationTemplate> = {
    [NotificationType.RENT_DUE_REMINDER]: {
        type: NotificationType.RENT_DUE_REMINDER,
        subject: 'Rent Payment Reminder - {{propertyTitle}}',
        smsTemplate: 'Dear {{tenantName}}, your rent of GHS {{amount}} for {{propertyTitle}} is due on {{dueDate}}. Kindly make payment. Thank you.',
        emailTemplate: `
            <h2>Rent Payment Reminder</h2>
            <p>Dear {{tenantName}},</p>
            <p>This is a friendly reminder that your rent payment of <strong>GHS {{amount}}</strong> for <strong>{{propertyTitle}}</strong> is due on <strong>{{dueDate}}</strong>.</p>
            <p>Payment Methods:</p>
            <ul>
                <li>Mobile Money: {{mobileMoneyNumber}}</li>
                <li>Bank Transfer: {{bankDetails}}</li>
            </ul>
            <p>Thank you for your prompt payment.</p>
        `
    },
    [NotificationType.RENT_OVERDUE]: {
        type: NotificationType.RENT_OVERDUE,
        subject: 'URGENT: Rent Payment Overdue - {{propertyTitle}}',
        smsTemplate: 'URGENT: Your rent of GHS {{amount}} for {{propertyTitle}} is {{daysOverdue}} days overdue. Please pay immediately to avoid late fees.',
        emailTemplate: `
            <h2 style="color: red;">Rent Payment Overdue</h2>
            <p>Dear {{tenantName}},</p>
            <p>Your rent payment of <strong>GHS {{amount}}</strong> for <strong>{{propertyTitle}}</strong> is now <strong>{{daysOverdue}} days overdue</strong>.</p>
            <p>Please make payment immediately to avoid additional late fees of GHS {{lateFee}}.</p>
        `
    },
    [NotificationType.LEASE_EXPIRY_WARNING]: {
        type: NotificationType.LEASE_EXPIRY_WARNING,
        subject: 'Lease Expiring Soon - {{propertyTitle}}',
        smsTemplate: 'Your lease for {{propertyTitle}} expires on {{expiryDate}}. Please contact us to discuss renewal options.',
        emailTemplate: `
            <h2>Lease Expiry Notice</h2>
            <p>Dear {{tenantName}},</p>
            <p>Your lease for <strong>{{propertyTitle}}</strong> will expire on <strong>{{expiryDate}}</strong>.</p>
            <p>Please contact us at your earliest convenience to discuss renewal options.</p>
        `
    },
    [NotificationType.LEASE_EXPIRED]: {
        type: NotificationType.LEASE_EXPIRED,
        subject: 'Lease Expired - {{propertyTitle}}',
        smsTemplate: 'Your lease for {{propertyTitle}} has expired. Please contact us immediately.',
        emailTemplate: `
            <h2>Lease Expired</h2>
            <p>Dear {{tenantName}},</p>
            <p>Your lease for <strong>{{propertyTitle}}</strong> has expired as of <strong>{{expiryDate}}</strong>.</p>
            <p>Please contact us immediately to discuss next steps.</p>
        `
    },
    [NotificationType.PAYMENT_RECEIVED]: {
        type: NotificationType.PAYMENT_RECEIVED,
        subject: 'Payment Confirmation - {{propertyTitle}}',
        smsTemplate: 'Thank you! Payment of GHS {{amount}} received for {{propertyTitle}}. Receipt: {{receiptNumber}}',
        emailTemplate: `
            <h2>Payment Confirmation</h2>
            <p>Dear {{tenantName}},</p>
            <p>We have received your payment of <strong>GHS {{amount}}</strong> for <strong>{{propertyTitle}}</strong>.</p>
            <p>Receipt Number: <strong>{{receiptNumber}}</strong></p>
            <p>Thank you for your payment.</p>
        `
    },
    [NotificationType.WORK_ORDER_CREATED]: {
        type: NotificationType.WORK_ORDER_CREATED,
        subject: 'Maintenance Request Received - {{propertyTitle}}',
        smsTemplate: 'Your maintenance request for {{propertyTitle}} has been received. Reference: {{workOrderRef}}. We will contact you shortly.',
        emailTemplate: `
            <h2>Maintenance Request Received</h2>
            <p>Dear {{tenantName}},</p>
            <p>Your maintenance request for <strong>{{propertyTitle}}</strong> has been received.</p>
            <p>Reference Number: <strong>{{workOrderRef}}</strong></p>
            <p>Issue: {{issueDescription}}</p>
            <p>We will contact you shortly to schedule the repair.</p>
        `
    },
    [NotificationType.WORK_ORDER_ASSIGNED]: {
        type: NotificationType.WORK_ORDER_ASSIGNED,
        subject: 'New Work Order Assigned - {{propertyTitle}}',
        smsTemplate: '{{vendorName}}: New work order assigned at {{propertyTitle}}. Ref: {{workOrderRef}}. Contact: {{tenantPhone}}',
        emailTemplate: `
            <h2>New Work Order Assignment</h2>
            <p>Dear {{vendorName}},</p>
            <p>A new work order has been assigned to you:</p>
            <ul>
                <li>Property: {{propertyTitle}}</li>
                <li>Issue: {{issueDescription}}</li>
                <li>Priority: {{priority}}</li>
                <li>Contact: {{tenantName}} - {{tenantPhone}}</li>
            </ul>
        `
    },
    [NotificationType.WORK_ORDER_COMPLETED]: {
        type: NotificationType.WORK_ORDER_COMPLETED,
        subject: 'Maintenance Completed - {{propertyTitle}}',
        smsTemplate: 'Maintenance at {{propertyTitle}} has been completed. Ref: {{workOrderRef}}. Please rate the service.',
        emailTemplate: `
            <h2>Maintenance Completed</h2>
            <p>Dear {{tenantName}},</p>
            <p>The maintenance work at <strong>{{propertyTitle}}</strong> has been completed.</p>
            <p>Work performed: {{completionNotes}}</p>
            <p>Please let us know if you have any concerns.</p>
        `
    },
    [NotificationType.TENANT_WELCOME]: {
        type: NotificationType.TENANT_WELCOME,
        subject: 'Welcome to {{propertyTitle}}',
        smsTemplate: 'Welcome to {{propertyTitle}}! Your lease starts {{startDate}}. Contact us for any assistance.',
        emailTemplate: `
            <h2>Welcome to Your New Home!</h2>
            <p>Dear {{tenantName}},</p>
            <p>Welcome to <strong>{{propertyTitle}}</strong>!</p>
            <p>Your lease begins on <strong>{{startDate}}</strong>.</p>
            <p>Please don't hesitate to contact us if you need any assistance.</p>
        `
    },
    [NotificationType.MAINTENANCE_SCHEDULED]: {
        type: NotificationType.MAINTENANCE_SCHEDULED,
        subject: 'Maintenance Scheduled - {{propertyTitle}}',
        smsTemplate: 'Maintenance scheduled for {{propertyTitle}} on {{scheduledDate}} at {{scheduledTime}}. Please ensure access.',
        emailTemplate: `
            <h2>Maintenance Scheduled</h2>
            <p>Dear {{tenantName}},</p>
            <p>Maintenance has been scheduled for <strong>{{propertyTitle}}</strong>:</p>
            <ul>
                <li>Date: {{scheduledDate}}</li>
                <li>Time: {{scheduledTime}}</li>
                <li>Vendor: {{vendorName}}</li>
            </ul>
            <p>Please ensure someone is available to provide access.</p>
        `
    }
};

export class NotificationService {
    /**
     * Send a notification
     */
    async sendNotification(payload: NotificationPayload): Promise<{ success: boolean; messageId?: string }> {
        const template = NOTIFICATION_TEMPLATES[payload.notificationType];
        if (!template) {
            throw new Error(`Unknown notification type: ${payload.notificationType}`);
        }

        // Get recipient contact info
        const contact = await this.getRecipientContact(payload.recipientId, payload.recipientType);
        if (!contact) {
            logger.warn('Recipient contact not found', { recipientId: payload.recipientId });
            return { success: false };
        }

        // Render template
        const renderedMessage = this.renderTemplate(
            payload.channel === NotificationChannel.EMAIL ? template.emailTemplate : template.smsTemplate,
            payload.templateData
        );

        // Log notification attempt
        const notificationId = await this.logNotification({
            ...payload,
            recipientContact: contact,
            message: renderedMessage,
            status: 'pending'
        });

        try {
            let messageId: string | undefined;

            switch (payload.channel) {
                case NotificationChannel.SMS:
                    if (contact.phone) {
                        messageId = await this.sendSMS(contact.phone, renderedMessage);
                    }
                    break;
                case NotificationChannel.EMAIL:
                    if (contact.email) {
                        messageId = await this.sendEmail(
                            contact.email,
                            this.renderTemplate(template.subject, payload.templateData),
                            renderedMessage
                        );
                    }
                    break;
                case NotificationChannel.WHATSAPP:
                    if (contact.phone) {
                        messageId = await this.sendWhatsApp(contact.phone, renderedMessage);
                    }
                    break;
                case NotificationChannel.IN_APP:
                    messageId = await this.createInAppNotification(payload);
                    break;
            }

            await this.updateNotificationStatus(notificationId, 'sent', messageId);
            return { success: true, messageId };

        } catch (error: any) {
            logger.error('Failed to send notification', { error: error.message, notificationId });
            await this.updateNotificationStatus(notificationId, 'failed', undefined, error.message);
            return { success: false };
        }
    }

    /**
     * Schedule rent due reminders for all active tenancies
     */
    async scheduleRentReminders(organizationId: string, daysBeforeDue: number = 3): Promise<number> {
        const query = `
            SELECT 
                t.id as tenancy_id,
                t.monthly_rent,
                t.rent_due_day,
                t.rent_currency,
                tn.id as tenant_id,
                tn.full_name as tenant_name,
                tn.phone_primary as tenant_phone,
                tn.email as tenant_email,
                p.title as property_title
            FROM tenancies t
            JOIN tenants tn ON t.tenant_id = tn.id
            JOIN properties p ON t.property_id = p.id
            WHERE t.organization_id = $1
            AND t.status = 'active'
            AND t.rent_due_day = EXTRACT(DAY FROM CURRENT_DATE + INTERVAL '${daysBeforeDue} days')
        `;

        const result = await db.query(query, [organizationId]);
        let sentCount = 0;

        for (const row of result.rows) {
            const dueDate = new Date();
            dueDate.setDate(row.rent_due_day);
            if (dueDate < new Date()) {
                dueDate.setMonth(dueDate.getMonth() + 1);
            }

            await this.sendNotification({
                recipientId: row.tenant_id,
                recipientType: 'tenant',
                notificationType: NotificationType.RENT_DUE_REMINDER,
                channel: row.tenant_phone ? NotificationChannel.SMS : NotificationChannel.EMAIL,
                organizationId,
                templateData: {
                    tenantName: row.tenant_name,
                    amount: row.monthly_rent,
                    propertyTitle: row.property_title,
                    dueDate: dueDate.toLocaleDateString('en-GB')
                }
            });
            sentCount++;
        }

        return sentCount;
    }

    /**
     * Send lease expiry warnings
     */
    async sendLeaseExpiryWarnings(organizationId: string, daysBeforeExpiry: number = 30): Promise<number> {
        const query = `
            SELECT 
                t.id as tenancy_id,
                t.lease_end_date,
                tn.id as tenant_id,
                tn.full_name as tenant_name,
                tn.phone_primary,
                tn.email,
                p.title as property_title
            FROM tenancies t
            JOIN tenants tn ON t.tenant_id = tn.id
            JOIN properties p ON t.property_id = p.id
            WHERE t.organization_id = $1
            AND t.status = 'active'
            AND t.lease_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '${daysBeforeExpiry} days'
        `;

        const result = await db.query(query, [organizationId]);
        let sentCount = 0;

        for (const row of result.rows) {
            await this.sendNotification({
                recipientId: row.tenant_id,
                recipientType: 'tenant',
                notificationType: NotificationType.LEASE_EXPIRY_WARNING,
                channel: row.phone_primary ? NotificationChannel.SMS : NotificationChannel.EMAIL,
                organizationId,
                templateData: {
                    tenantName: row.tenant_name,
                    propertyTitle: row.property_title,
                    expiryDate: new Date(row.lease_end_date).toLocaleDateString('en-GB')
                }
            });
            sentCount++;
        }

        return sentCount;
    }

    /**
     * Get recipient contact information
     */
    private async getRecipientContact(recipientId: string, recipientType: string): Promise<{ phone?: string; email?: string } | null> {
        let query: string;
        
        switch (recipientType) {
            case 'tenant':
                query = 'SELECT phone_primary as phone, email FROM tenants WHERE id = $1';
                break;
            case 'vendor':
                query = 'SELECT phone_primary as phone, email FROM vendors WHERE id = $1';
                break;
            case 'user':
                query = 'SELECT phone as phone, email FROM users WHERE id = $1';
                break;
            default:
                return null;
        }

        const result = await db.query(query, [recipientId]);
        return result.rows[0] || null;
    }

    /**
     * Render template with data
     */
    private renderTemplate(template: string, data: Record<string, any>): string {
        return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || '');
    }

    /**
     * Send SMS (integrate with Twilio or local provider)
     */
    private async sendSMS(phone: string, message: string): Promise<string> {
        // TODO: Integrate with Twilio or Hubtel for Ghana
        logger.info('SMS notification', { phone, message: message.substring(0, 50) });
        
        // Placeholder - in production, integrate with SMS provider
        const twilioSid = process.env.TWILIO_ACCOUNT_SID;
        if (twilioSid) {
            // Twilio integration would go here
        }
        
        return `SMS-${Date.now()}`;
    }

    /**
     * Send Email (integrate with Google SMTP via nodemailer)
     */
    private async sendEmail(email: string, subject: string, html: string): Promise<string> {
        logger.info('Email notification', { email, subject });
        
        // Use unified notification service if available
        try {
            const { emailService } = require('../../../shared-services/notifications');
            const result = await emailService.send({ to: email, subject, html });
            if (result.success) {
                return result.messageId || `EMAIL-${Date.now()}`;
            }
        } catch (e) {
            logger.warn('Unified email service not available, email not sent');
        }
        
        return `EMAIL-${Date.now()}`;
    }

    /**
     * Send WhatsApp message
     */
    private async sendWhatsApp(phone: string, message: string): Promise<string> {
        // TODO: Integrate with WhatsApp Business API
        logger.info('WhatsApp notification', { phone, message: message.substring(0, 50) });
        return `WA-${Date.now()}`;
    }

    /**
     * Create in-app notification
     */
    private async createInAppNotification(payload: NotificationPayload): Promise<string> {
        const query = `
            INSERT INTO user_notifications (user_id, type, title, message, data, read)
            VALUES ($1, $2, $3, $4, $5, false)
            RETURNING id
        `;
        
        // Note: This table would need to be created if not exists
        try {
            const result = await db.query(query, [
                payload.recipientId,
                payload.notificationType,
                payload.templateData.subject || payload.notificationType,
                JSON.stringify(payload.templateData),
                JSON.stringify(payload.templateData)
            ]);
            return result.rows[0].id;
        } catch {
            return `INAPP-${Date.now()}`;
        }
    }

    /**
     * Log notification to database
     */
    private async logNotification(data: any): Promise<string> {
        // For now, just log - in production, save to notifications table
        logger.info('Notification logged', { type: data.notificationType, recipient: data.recipientId });
        return `NOTIF-${Date.now()}`;
    }

    /**
     * Update notification status
     */
    private async updateNotificationStatus(id: string, status: string, messageId?: string, error?: string): Promise<void> {
        logger.info('Notification status updated', { id, status, messageId, error });
    }
}

export const notificationService = new NotificationService();
