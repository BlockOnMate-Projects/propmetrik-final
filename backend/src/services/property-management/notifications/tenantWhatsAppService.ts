/**
 * Tenant WhatsApp Notification Service
 * 
 * Property Management-specific WhatsApp messaging for tenants:
 * - Rent reminders and payment confirmations
 * - Maintenance request updates
 * - Lease notifications
 * - Emergency alerts
 * 
 * Uses WhatsApp Business Cloud API via shared whatsappService
 */

import { whatsappService, TemplateComponent, WhatsAppResponse } from '../../../../shared-services/messaging/whatsappService';
import { pool } from '../../../database';
import { logger } from '../../../utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface TenantContact {
  tenantId: string;
  tenancyId?: string;
  fullName: string;
  phoneNumber: string;
  email?: string;
  unitNumber?: string;
  propertyAddress?: string;
}

export interface RentReminderData {
  tenant: TenantContact;
  rentAmount: number;
  currency: string;
  dueDate: Date;
  daysPastDue?: number;
  paymentLink?: string;
}

export interface PaymentConfirmationData {
  tenant: TenantContact;
  amount: number;
  currency: string;
  paymentDate: Date;
  receiptNumber: string;
  paymentMethod: string;
  balance?: number;
}

export interface MaintenanceUpdateData {
  tenant: TenantContact;
  requestId: string;
  issueType: string;
  status: 'received' | 'assigned' | 'scheduled' | 'in_progress' | 'completed';
  scheduledDate?: Date;
  vendorName?: string;
  completionNotes?: string;
}

export interface LeaseNotificationData {
  tenant: TenantContact;
  leaseEndDate: Date;
  daysRemaining: number;
  renewalOffer?: {
    newRent: number;
    currency: string;
    term: string;
  };
}

export interface EmergencyAlertData {
  tenant: TenantContact;
  alertType: 'fire' | 'water_leak' | 'security' | 'power_outage' | 'general';
  message: string;
  instructions?: string;
  contactNumber?: string;
}

// ============================================================================
// Service Class
// ============================================================================

export class TenantWhatsAppService {
  /**
   * Check if WhatsApp notifications are enabled
   */
  isEnabled(): boolean {
    return whatsappService.isEnabled();
  }

  // ==========================================================================
  // RENT & PAYMENT NOTIFICATIONS
  // ==========================================================================

  /**
   * Send rent reminder before due date
   */
  async sendRentReminder(data: RentReminderData): Promise<WhatsAppResponse | null> {
    const { tenant, rentAmount, currency, dueDate, paymentLink } = data;
    
    const dateStr = dueDate.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

    let message = `Hello ${tenant.fullName},\n\n`;
    message += `💰 *Rent Payment Reminder*\n\n`;
    message += `Your rent of *${currency} ${rentAmount.toLocaleString()}* is due on *${dateStr}*.\n\n`;
    
    if (tenant.unitNumber) {
      message += `Unit: ${tenant.unitNumber}\n`;
    }
    
    if (paymentLink) {
      message += `\n📱 Pay now: ${paymentLink}\n`;
    }
    
    message += `\nPlease ensure timely payment to avoid late fees.\n\n`;
    message += `Questions? Reply to this message or contact your property manager.\n\n`;
    message += `PROPMETRIK Property Management`;

    const result = await whatsappService.sendTextMessage(tenant.phoneNumber, message);
    
    if (result) {
      await this.logNotification(tenant.tenantId, 'rent_reminder', result.messages[0]?.id);
    }
    
    return result;
  }

  /**
   * Send overdue rent notice
   */
  async sendOverdueNotice(data: RentReminderData): Promise<WhatsAppResponse | null> {
    const { tenant, rentAmount, currency, dueDate, daysPastDue, paymentLink } = data;

    let message = `Hello ${tenant.fullName},\n\n`;
    message += `⚠️ *Overdue Rent Notice*\n\n`;
    message += `Your rent payment of *${currency} ${rentAmount.toLocaleString()}* is now *${daysPastDue} days overdue*.\n\n`;
    
    if (tenant.unitNumber) {
      message += `Unit: ${tenant.unitNumber}\n`;
    }
    
    message += `\nPlease make payment immediately to avoid additional late fees and potential further action.\n`;
    
    if (paymentLink) {
      message += `\n📱 Pay now: ${paymentLink}\n`;
    }
    
    message += `\nIf you're experiencing financial difficulties, please contact your property manager to discuss options.\n\n`;
    message += `PROPMETRIK Property Management`;

    const result = await whatsappService.sendTextMessage(tenant.phoneNumber, message);
    
    if (result) {
      await this.logNotification(tenant.tenantId, 'overdue_notice', result.messages[0]?.id);
    }
    
    return result;
  }

  /**
   * Send payment confirmation/receipt
   */
  async sendPaymentConfirmation(data: PaymentConfirmationData): Promise<WhatsAppResponse | null> {
    const { tenant, amount, currency, paymentDate, receiptNumber, paymentMethod, balance } = data;

    const dateStr = paymentDate.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    let message = `Hello ${tenant.fullName},\n\n`;
    message += `✅ *Payment Received*\n\n`;
    message += `Thank you for your payment!\n\n`;
    message += `💵 Amount: *${currency} ${amount.toLocaleString()}*\n`;
    message += `📅 Date: ${dateStr}\n`;
    message += `🧾 Receipt: ${receiptNumber}\n`;
    message += `💳 Method: ${paymentMethod}\n`;
    
    if (tenant.unitNumber) {
      message += `🏠 Unit: ${tenant.unitNumber}\n`;
    }
    
    if (balance !== undefined && balance > 0) {
      message += `\n📊 Remaining Balance: ${currency} ${balance.toLocaleString()}\n`;
    } else if (balance === 0) {
      message += `\n🎉 Your account is now fully paid!\n`;
    }
    
    message += `\nThank you for being a valued tenant.\n\n`;
    message += `PROPMETRIK Property Management`;

    const result = await whatsappService.sendTextMessage(tenant.phoneNumber, message);
    
    if (result) {
      await this.logNotification(tenant.tenantId, 'payment_confirmation', result.messages[0]?.id);
    }
    
    return result;
  }

  // ==========================================================================
  // MAINTENANCE NOTIFICATIONS
  // ==========================================================================

  /**
   * Send maintenance request acknowledgment
   */
  async sendMaintenanceAcknowledgment(data: MaintenanceUpdateData): Promise<WhatsAppResponse | null> {
    const { tenant, requestId, issueType } = data;

    let message = `Hello ${tenant.fullName},\n\n`;
    message += `🔧 *Maintenance Request Received*\n\n`;
    message += `We've received your maintenance request.\n\n`;
    message += `📋 Request ID: ${requestId}\n`;
    message += `🏠 Issue: ${issueType}\n`;
    
    if (tenant.unitNumber) {
      message += `📍 Unit: ${tenant.unitNumber}\n`;
    }
    
    message += `\nOur team will review and assign a technician shortly. You'll receive updates on the progress.\n\n`;
    message += `For urgent issues, please call the emergency line.\n\n`;
    message += `PROPMETRIK Property Management`;

    const result = await whatsappService.sendTextMessage(tenant.phoneNumber, message);
    
    if (result) {
      await this.logNotification(tenant.tenantId, 'maintenance_ack', result.messages[0]?.id);
    }
    
    return result;
  }

  /**
   * Send maintenance scheduled notification
   */
  async sendMaintenanceScheduled(data: MaintenanceUpdateData): Promise<WhatsAppResponse | null> {
    const { tenant, requestId, issueType, scheduledDate, vendorName } = data;

    if (!scheduledDate) {
      throw new Error('Scheduled date is required');
    }

    const dateStr = scheduledDate.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    const timeStr = scheduledDate.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });

    let message = `Hello ${tenant.fullName},\n\n`;
    message += `📅 *Maintenance Visit Scheduled*\n\n`;
    message += `A technician has been scheduled for your maintenance request.\n\n`;
    message += `📋 Request ID: ${requestId}\n`;
    message += `🔧 Issue: ${issueType}\n`;
    message += `📅 Date: ${dateStr}\n`;
    message += `🕐 Time: ${timeStr}\n`;
    
    if (vendorName) {
      message += `👷 Technician: ${vendorName}\n`;
    }
    
    if (tenant.unitNumber) {
      message += `📍 Unit: ${tenant.unitNumber}\n`;
    }
    
    message += `\n*Please ensure someone is available to provide access.*\n\n`;
    message += `If you need to reschedule, please reply to this message or contact your property manager.\n\n`;
    message += `PROPMETRIK Property Management`;

    const result = await whatsappService.sendTextMessage(tenant.phoneNumber, message);
    
    if (result) {
      await this.logNotification(tenant.tenantId, 'maintenance_scheduled', result.messages[0]?.id);
    }
    
    return result;
  }

  /**
   * Send maintenance in-progress notification
   */
  async sendMaintenanceInProgress(data: MaintenanceUpdateData): Promise<WhatsAppResponse | null> {
    const { tenant, requestId, issueType, vendorName } = data;

    let message = `Hello ${tenant.fullName},\n\n`;
    message += `🔧 *Maintenance In Progress*\n\n`;
    message += `Work has begun on your maintenance request.\n\n`;
    message += `📋 Request ID: ${requestId}\n`;
    message += `🔧 Issue: ${issueType}\n`;
    
    if (vendorName) {
      message += `👷 Technician: ${vendorName}\n`;
    }
    
    message += `\nWe'll notify you once the work is complete.\n\n`;
    message += `PROPMETRIK Property Management`;

    const result = await whatsappService.sendTextMessage(tenant.phoneNumber, message);
    
    if (result) {
      await this.logNotification(tenant.tenantId, 'maintenance_in_progress', result.messages[0]?.id);
    }
    
    return result;
  }

  /**
   * Send maintenance completed notification
   */
  async sendMaintenanceCompleted(data: MaintenanceUpdateData): Promise<WhatsAppResponse | null> {
    const { tenant, requestId, issueType, completionNotes } = data;

    let message = `Hello ${tenant.fullName},\n\n`;
    message += `✅ *Maintenance Completed*\n\n`;
    message += `Your maintenance request has been completed!\n\n`;
    message += `📋 Request ID: ${requestId}\n`;
    message += `🔧 Issue: ${issueType}\n`;
    
    if (completionNotes) {
      message += `\n📝 Notes: ${completionNotes}\n`;
    }
    
    message += `\nIf you have any concerns about the work performed, please reply to this message within 48 hours.\n\n`;
    message += `Thank you for your patience!\n\n`;
    message += `PROPMETRIK Property Management`;

    const result = await whatsappService.sendTextMessage(tenant.phoneNumber, message);
    
    if (result) {
      await this.logNotification(tenant.tenantId, 'maintenance_completed', result.messages[0]?.id);
    }
    
    return result;
  }

  // ==========================================================================
  // LEASE NOTIFICATIONS
  // ==========================================================================

  /**
   * Send lease renewal reminder
   */
  async sendLeaseRenewalReminder(data: LeaseNotificationData): Promise<WhatsAppResponse | null> {
    const { tenant, leaseEndDate, daysRemaining, renewalOffer } = data;

    const dateStr = leaseEndDate.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    let message = `Hello ${tenant.fullName},\n\n`;
    message += `📋 *Lease Renewal Reminder*\n\n`;
    message += `Your lease expires on *${dateStr}* (${daysRemaining} days remaining).\n\n`;
    
    if (tenant.unitNumber) {
      message += `Unit: ${tenant.unitNumber}\n`;
    }
    
    if (renewalOffer) {
      message += `\n🎉 *Renewal Offer Available*\n`;
      message += `New Rent: ${renewalOffer.currency} ${renewalOffer.newRent.toLocaleString()}/month\n`;
      message += `Term: ${renewalOffer.term}\n`;
    }
    
    message += `\nPlease contact your property manager to discuss renewal options or move-out arrangements.\n\n`;
    message += `PROPMETRIK Property Management`;

    const result = await whatsappService.sendTextMessage(tenant.phoneNumber, message);
    
    if (result) {
      await this.logNotification(tenant.tenantId, 'lease_renewal', result.messages[0]?.id);
    }
    
    return result;
  }

  /**
   * Send lease signed confirmation
   */
  async sendLeaseSignedConfirmation(tenant: TenantContact, leaseStartDate: Date, leaseEndDate: Date): Promise<WhatsAppResponse | null> {
    const startStr = leaseStartDate.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const endStr = leaseEndDate.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    let message = `Hello ${tenant.fullName},\n\n`;
    message += `🎉 *Lease Agreement Signed*\n\n`;
    message += `Congratulations! Your lease has been successfully signed.\n\n`;
    message += `📅 Lease Period: ${startStr} to ${endStr}\n`;
    
    if (tenant.unitNumber) {
      message += `🏠 Unit: ${tenant.unitNumber}\n`;
    }
    
    if (tenant.propertyAddress) {
      message += `📍 Property: ${tenant.propertyAddress}\n`;
    }
    
    message += `\nA copy of your signed lease will be sent to your email.\n\n`;
    message += `Welcome to your new home! 🏡\n\n`;
    message += `PROPMETRIK Property Management`;

    const result = await whatsappService.sendTextMessage(tenant.phoneNumber, message);
    
    if (result) {
      await this.logNotification(tenant.tenantId, 'lease_signed', result.messages[0]?.id);
    }
    
    return result;
  }

  // ==========================================================================
  // EMERGENCY & GENERAL ALERTS
  // ==========================================================================

  /**
   * Send emergency alert to tenant
   */
  async sendEmergencyAlert(data: EmergencyAlertData): Promise<WhatsAppResponse | null> {
    const { tenant, alertType, message: alertMessage, instructions, contactNumber } = data;

    const alertEmojis: Record<string, string> = {
      fire: '🔥',
      water_leak: '💧',
      security: '🚨',
      power_outage: '⚡',
      general: '⚠️',
    };

    let message = `🚨🚨🚨 *EMERGENCY ALERT* 🚨🚨🚨\n\n`;
    message += `${alertEmojis[alertType] || '⚠️'} ${alertMessage}\n\n`;
    
    if (tenant.unitNumber) {
      message += `Property: ${tenant.unitNumber}${tenant.propertyAddress ? ' - ' + tenant.propertyAddress : ''}\n\n`;
    }
    
    if (instructions) {
      message += `📋 *Instructions:*\n${instructions}\n\n`;
    }
    
    if (contactNumber) {
      message += `📞 *Emergency Contact:* ${contactNumber}\n\n`;
    }
    
    message += `Please follow emergency procedures and stay safe!\n\n`;
    message += `PROPMETRIK Property Management`;

    const result = await whatsappService.sendTextMessage(tenant.phoneNumber, message);
    
    if (result) {
      await this.logNotification(tenant.tenantId, 'emergency_alert', result.messages[0]?.id);
    }
    
    return result;
  }

  /**
   * Send general announcement to tenant
   */
  async sendAnnouncement(tenant: TenantContact, subject: string, content: string): Promise<WhatsAppResponse | null> {
    let message = `Hello ${tenant.fullName},\n\n`;
    message += `📢 *${subject}*\n\n`;
    message += `${content}\n\n`;
    message += `PROPMETRIK Property Management`;

    const result = await whatsappService.sendTextMessage(tenant.phoneNumber, message);
    
    if (result) {
      await this.logNotification(tenant.tenantId, 'announcement', result.messages[0]?.id);
    }
    
    return result;
  }

  // ==========================================================================
  // BULK NOTIFICATIONS
  // ==========================================================================

  /**
   * Send rent reminders to all tenants with rent due
   */
  async sendBulkRentReminders(organizationId: string, dueDate: Date): Promise<{ sent: number; failed: number }> {
    const result = await pool.query(`
      SELECT 
        t.id as tenant_id, t.full_name, t.phone,
        ten.id as tenancy_id, ten.rent_amount, ten.rent_currency,
        u.unit_number,
        p.address_street
      FROM tenants t
      JOIN tenancies ten ON t.id = ten.tenant_id
      JOIN units u ON ten.unit_id = u.id
      JOIN properties p ON u.property_id = p.id
      WHERE p.organization_id = $1
        AND ten.status = 'active'
        AND t.phone IS NOT NULL
        AND t.notification_preferences->>'whatsapp' != 'false'
    `, [organizationId]);

    let sent = 0;
    let failed = 0;

    for (const row of result.rows) {
      try {
        await this.sendRentReminder({
          tenant: {
            tenantId: row.tenant_id,
            tenancyId: row.tenancy_id,
            fullName: row.full_name,
            phoneNumber: row.phone,
            unitNumber: row.unit_number,
            propertyAddress: row.address_street,
          },
          rentAmount: Number(row.rent_amount),
          currency: row.rent_currency || 'GHS',
          dueDate,
        });
        sent++;
      } catch (error) {
        logger.error('Failed to send bulk rent reminder', {
          tenantId: row.tenant_id,
          error: (error as Error).message,
        });
        failed++;
      }

      // Rate limiting: wait 1 second between messages
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.info('Bulk rent reminders sent', { organizationId, sent, failed });
    return { sent, failed };
  }

  /**
   * Send emergency alert to all tenants in a property
   */
  async sendBulkEmergencyAlert(
    propertyId: string,
    alertData: Omit<EmergencyAlertData, 'tenant'>
  ): Promise<{ sent: number; failed: number }> {
    const result = await pool.query(`
      SELECT 
        t.id as tenant_id, t.full_name, t.phone,
        u.unit_number,
        p.address_street
      FROM tenants t
      JOIN tenancies ten ON t.id = ten.tenant_id
      JOIN units u ON ten.unit_id = u.id
      JOIN properties p ON u.property_id = p.id
      WHERE p.id = $1
        AND ten.status = 'active'
        AND t.phone IS NOT NULL
    `, [propertyId]);

    let sent = 0;
    let failed = 0;

    for (const row of result.rows) {
      try {
        await this.sendEmergencyAlert({
          ...alertData,
          tenant: {
            tenantId: row.tenant_id,
            fullName: row.full_name,
            phoneNumber: row.phone,
            unitNumber: row.unit_number,
            propertyAddress: row.address_street,
          },
        });
        sent++;
      } catch (error) {
        logger.error('Failed to send emergency alert', {
          tenantId: row.tenant_id,
          error: (error as Error).message,
        });
        failed++;
      }

      // Faster for emergencies: 500ms between messages
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    logger.info('Bulk emergency alerts sent', { propertyId, sent, failed });
    return { sent, failed };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Log WhatsApp notification to database
   */
  private async logNotification(tenantId: string, type: string, messageId?: string): Promise<void> {
    try {
      await pool.query(`
        INSERT INTO whatsapp_notifications (
          tenant_id, notification_type, whatsapp_message_id, sent_at
        ) VALUES ($1, $2, $3, NOW())
      `, [tenantId, type, messageId]);
    } catch (error) {
      // Don't fail the notification if logging fails
      logger.error('Failed to log WhatsApp notification', {
        tenantId,
        type,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get tenant contact info from database
   */
  async getTenantContact(tenantId: string): Promise<TenantContact | null> {
    const result = await pool.query(`
      SELECT 
        t.id as tenant_id, t.full_name, t.phone, t.email,
        ten.id as tenancy_id,
        u.unit_number,
        p.address_street, p.address_city
      FROM tenants t
      LEFT JOIN tenancies ten ON t.id = ten.tenant_id AND ten.status = 'active'
      LEFT JOIN units u ON ten.unit_id = u.id
      LEFT JOIN properties p ON u.property_id = p.id
      WHERE t.id = $1
    `, [tenantId]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      tenantId: row.tenant_id,
      tenancyId: row.tenancy_id,
      fullName: row.full_name,
      phoneNumber: row.phone,
      email: row.email,
      unitNumber: row.unit_number,
      propertyAddress: row.address_street ? `${row.address_street}, ${row.address_city}` : undefined,
    };
  }
}

// Export singleton instance
export const tenantWhatsAppService = new TenantWhatsAppService();
export default tenantWhatsAppService;
