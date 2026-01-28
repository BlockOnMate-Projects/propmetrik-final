/**
 * Construction Operations Service
 * 
 * @deprecated This service has been replaced by SiteOperationsService.
 *             Please migrate to: import { siteOperationsService } from './operations'
 *             This file will be removed in the next major version.
 *             Migration Date: 2024-01-XX
 */

import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { whatsappService } from '../../../shared-services/notifications/whatsapp/whatsapp.service';
import { v4 as uuidv4 } from 'uuid';

export interface SiteDiaryEntry {
  projectId: string;
  reportDate: string; // YYYY-MM-DD
  weatherCondition: string;
  temperatureCelsius?: number;
  informalLaborCount: number;
  informalLaborNotes?: string;
  workPerformed?: string;
  incidentsOrDelays?: string;
  submittedBy?: string;
  submissionSource?: 'web' | 'whatsapp' | 'mobile_app';
}

export interface PettyCashEntry {
  projectId: string;
  amount: number;
  currency: string;
  recipientName: string;
  category: 'transport' | 'food' | 'tips' | 'airtime' | 'misc';
  description?: string;
  requestedBy?: string;
}

export interface MaterialPriceEntry {
  materialCategory: string;
  itemName: string;
  unitPrice: number;
  currency: string;
  uom: string;
  vendorName?: string;
  locationRegion?: string;
  effectiveDate?: string;
  dataSource?: string;
}

export class ConstructionOpsService {

  /**
   * Log a Daily Site Diary entry (filling the Informal Labor gap)
   * Triggers WhatsApp summary to Project Manager.
   */
  async logSiteDiary(entry: SiteDiaryEntry) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const id = uuidv4();
      const queryText = `
        INSERT INTO project_site_diaries (
          id, project_id, report_date, weather_condition, temperature_celsius,
          informal_labor_count, informal_labor_notes, work_performed,
          indecents_or_delays, submission_source, submitted_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (project_id, report_date) 
        DO UPDATE SET 
          informal_labor_count = EXCLUDED.informal_labor_count,
          work_performed = EXCLUDED.work_performed,
          updated_at = NOW()
        RETURNING *
      `;

      const res = await client.query(queryText, [
        id, entry.projectId, entry.reportDate, entry.weatherCondition, entry.temperatureCelsius,
        entry.informalLaborCount, entry.informalLaborNotes, entry.workPerformed,
        entry.incidentsOrDelays, entry.submissionSource || 'web', entry.submittedBy
      ]);

      await client.query('COMMIT');
      logger.info(`Site diary logged for project ${entry.projectId}`);

      // SEND WHATSAPP NOTIFICATION
      this.sendDailySummaryWhatsapp(entry);

      return res.rows[0];
    } catch (e: any) {
      await client.query('ROLLBACK');
      logger.error(`Error logging site diary: ${e.message}`);
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Record a "Chop Money" Transaction
   * Sends WhatsApp alert if amount is high.
   */
  async recordPettyCash(entry: PettyCashEntry) {
    const id = uuidv4();
    const queryText = `
      INSERT INTO project_petty_cash_ledger (
        id, project_id, amount, currency, recipient_name,
        category, description, requested_by, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
      RETURNING *
    `;

    try {
      const res = await pool.query(queryText, [
        id, entry.projectId, entry.amount, entry.currency || 'GHS',
        entry.recipientName, entry.category, entry.description, entry.requestedBy
      ]);

      const record = res.rows[0];

      // WhatsApp Alert for expenses > 500 GHS
      if (entry.amount > 500) {
        // In a real app, fetch PM phone number from project_id -> project -> project_manager -> phone
        const mockPmPhone = '233241234567';
        await whatsappService.sendMessage(
          mockPmPhone,
          `🚨 *High Value Petty Cash Alert*\n\nAmount: ${entry.currency} ${entry.amount}\nTo: ${entry.recipientName}\nFor: ${entry.category}\n\nReply 'APPROVE ${record.id.substring(0, 4)}' to authorize.`
        );
      }

      return record;
    } catch (e: any) {
      logger.error(`Error recording petty cash: ${e.message}`);
      throw e;
    }
  }

  /**
   * Get Material Market Prices
   * Fetches latest scraped data from Data Hub ('material_prices' table)
   */
  async getMarketPrices(filter: { region?: string, category?: string }) {
    // We want the LATEST price for each material in the region
    // Using DISTINCT ON or a simple filtered query sorted by date

    let queryText = `
      SELECT DISTINCT ON (mp.material_name, mp.region)
        mp.id,
        mp.category,
        mp.material_name,
        mp.specification,
        mp.price_ghs as "unitPrice",
        'GHS' as currency,
        mp.unit as uom,
        mp.region,
        mp.supplier_name as "vendorName",
        mp.effective_date as "effectiveDate",
        mp.source_name as "source"
      FROM material_prices mp
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (filter.region) {
      // Handle region enum vs string mismatch if necessary, simplified here
      queryText += ` AND (mp.region::text = $${paramIndex} OR mp.region_id = $${paramIndex})`;
      params.push(filter.region);
      paramIndex++;
    }

    if (filter.category) {
      queryText += ` AND mp.category::text = $${paramIndex}`;
      params.push(filter.category);
      paramIndex++;
    }

    // Sort to get the latest date first for DISTINCT ON
    queryText += ` ORDER BY mp.material_name, mp.region, mp.effective_date DESC`;

    try {
      const res = await pool.query(queryText, params);
      return res.rows;
    } catch (e: any) {
      logger.error(`Error fetching material prices: ${e.message}`);
      throw e;
    }
  }


  private async sendDailySummaryWhatsapp(entry: SiteDiaryEntry) {
    // In production: Fetch PM phone number from Project ID
    const mockPmPhone = '233241234567';

    const message = `🏗️ *Daily Site Report: ${entry.reportDate}*\n\n` +
      `☁️ Weather: ${entry.weatherCondition}\n` +
      `👷 Informal Labor: ${entry.informalLaborCount} workers\n` +
      `🚧 Progress: ${entry.workPerformed || 'No major updates'}\n` +
      `⚠️ Issues: ${entry.incidentsOrDelays || 'None'}`;

    await whatsappService.sendMessage(mockPmPhone, message);
  }
}

export const constructionOpsService = new ConstructionOpsService();
