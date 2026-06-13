/**
 * Bank of Ghana — Daily Interbank FX Rates scraper
 *
 * Scrapes the OFFICIAL daily interbank exchange rates from
 *   https://www.bog.gov.gh/treasury-and-the-markets/daily-interbank-fx-rates/
 *
 * This is distinct from the MONTHLY end-period series the main `bogScraper`
 * reads (/economic-data/exchange-rate/) — that one is far too stale to settle
 * money against. The daily page is the correct source of truth for converting a
 * foreign-currency invoice to GHS for Paystack settlement.
 *
 * Persisted under the standard `exchange_rate_<ccy>` indicator with period 'daily'
 * and source 'Bank of Ghana (Daily Interbank)'. It is distinguished from the live
 * FX cache by source_name: the daily-save writer is guarded to never overwrite a
 * Bank-of-Ghana-sourced row, and this scraper writes authoritatively. The monthly
 * scrape uses period 'monthly' + a different source string, so it can't clash
 * either. `economicDataService.getExchangeRate` prefers this row when it is recent.
 *
 * NOTE: BoG's web server presents an incomplete TLS certificate chain, so the
 * fetch uses a relaxed https agent. The data is a public government rates page and
 * is cross-checked against the other live FX sources downstream.
 */
import axios from 'axios';
import * as https from 'https';
import * as cheerio from 'cheerio';
import { query } from '../../../database';
import { logger } from '../../../utils/logger';

const BOG_DAILY_FX_URL =
  'https://www.bog.gov.gh/treasury-and-the-markets/daily-interbank-fx-rates/';

// Only the currencies the platform actually settles in GHS are persisted.
const WANTED_CURRENCIES = new Set(['USD', 'GBP', 'EUR']);
const SOURCE_NAME = 'Bank of Ghana (Daily Interbank)';

export interface BogDailyRate {
  currency: string; // e.g. 'USD'
  buying: number;
  selling: number;
  mid: number;
  date: Date;
}

export class BogDailyFxScraper {
  // BoG sends an incomplete cert chain — accept it for this public rates page only.
  private readonly httpsAgent = new https.Agent({ rejectUnauthorized: false });

  /**
   * Fetch + parse today's interbank rates table. Returns one entry per wanted
   * currency (USD/GBP/EUR). Throws if the page can't be fetched.
   */
  async fetchDailyRates(): Promise<BogDailyRate[]> {
    const res = await axios.get(BOG_DAILY_FX_URL, {
      timeout: 30000,
      httpsAgent: this.httpsAgent,
      headers: {
        'User-Agent': 'PROPMETRIK Economic Data Bot/1.0 (+https://propmetrik.com/bot)',
      },
    });

    const $ = cheerio.load(res.data);
    const rates: BogDailyRate[] = [];
    const seen = new Set<string>();

    // Rows look like: [date, currencyName, pair(USDGHS), buying, selling, mid]
    $('table tr').each((_, row) => {
      const cells = $(row)
        .find('td')
        .map((_, c) => $(c).text().trim())
        .get();
      if (cells.length < 6) return;

      const [dateStr, , pairRaw, buyingStr, sellingStr, midStr] = cells;
      const pairMatch = /^([A-Z]{3})GHS$/i.exec((pairRaw || '').replace(/\s+/g, ''));
      if (!pairMatch) return;

      const currency = pairMatch[1].toUpperCase();
      if (!WANTED_CURRENCIES.has(currency) || seen.has(currency)) return;

      const mid = this.parseNumber(midStr);
      const buying = this.parseNumber(buyingStr);
      const selling = this.parseNumber(sellingStr);
      const date = this.parseDate(dateStr);
      if (!mid || mid <= 0 || !date) return;

      seen.add(currency);
      rates.push({ currency, buying, selling, mid, date });
    });

    return rates;
  }

  /**
   * Fetch and upsert the daily interbank rates into economic_indicators.
   * Idempotent on (indicator_type, effective_date).
   */
  async syncDailyRates(): Promise<{ saved: number; date: Date | null; currencies: string[] }> {
    let rates: BogDailyRate[];
    try {
      rates = await this.fetchDailyRates();
    } catch (error: any) {
      logger.error('[BoG Daily FX] Fetch failed', { error: error.message });
      return { saved: 0, date: null, currencies: [] };
    }

    if (rates.length === 0) {
      logger.warn('[BoG Daily FX] No rates parsed from the daily interbank page');
      return { saved: 0, date: null, currencies: [] };
    }

    let saved = 0;
    for (const r of rates) {
      const indicatorType = `exchange_rate_${r.currency.toLowerCase()}`;
      const effectiveDate = new Date(r.date);
      effectiveDate.setHours(0, 0, 0, 0);

      try {
        await query(
          `INSERT INTO economic_indicators (
             id, indicator_type, indicator_name, value, effective_date, period_type,
             source_name, source_url, unit, metadata, created_at, updated_at
           ) VALUES (
             uuid_generate_v4(), $1, $2, $3, $4, 'daily', $5, $6, 'ghs_per_unit', $7, NOW(), NOW()
           )
           ON CONFLICT (indicator_type, effective_date) DO UPDATE SET
             value = EXCLUDED.value,
             source_name = EXCLUDED.source_name,
             metadata = EXCLUDED.metadata,
             updated_at = NOW()`,
          [
            indicatorType,
            `GHS/${r.currency} Daily Interbank Rate`,
            r.mid,
            effectiveDate,
            SOURCE_NAME,
            BOG_DAILY_FX_URL,
            JSON.stringify({
              buying: r.buying,
              selling: r.selling,
              mid: r.mid,
              scraped_at: new Date().toISOString(),
            }),
          ]
        );
        saved++;
      } catch (error: any) {
        logger.error('[BoG Daily FX] Failed to save rate', {
          currency: r.currency,
          error: error.message,
        });
      }
    }

    logger.info('[BoG Daily FX] Synced daily interbank rates', {
      saved,
      date: rates[0].date,
      currencies: rates.map((r) => r.currency),
    });
    return { saved, date: rates[0].date, currencies: rates.map((r) => r.currency) };
  }

  private parseNumber(s: string): number {
    return parseFloat((s || '').replace(/[^0-9.]/g, ''));
  }

  private parseDate(s: string): Date | null {
    const d = new Date(s); // "11 Jun 2026" parses reliably
    return isNaN(d.getTime()) ? null : d;
  }
}

export const bogDailyFxScraper = new BogDailyFxScraper();
