/**
 * BoG Charts PDF Service (Slice 1 — P1 Monthly Macro, current-rate refresh)
 *
 * The GSS StatsBank PxWeb interest-rate table lags badly (it republishes Bank of
 * Ghana data and currently stops at 2024). The genuinely-current source for the
 * Ghana average lending rate, Monetary Policy Rate and Ghana Reference Rate is the
 * Bank of Ghana's monthly "Summary of Economic and Financial Charts" PDF, e.g.
 *   https://www.bog.gov.gh/wp-content/uploads/2026/05/Summary-of-Economic-and-Financial-Charts-May-2026.pdf
 *
 * This service:
 *   1. Discovers the latest published monthly PDF (predictable URL, walked back a
 *      few months because BoG publishes with a lag).
 *   2. Parses the "Interest Rates" panel (page 2) — the three headline rates are
 *      rendered as positioned glyphs, so we reconstruct lines by (y, x) and read
 *      the three "<Month> <Year> = <value>%" values that follow the labels row.
 *   3. Upserts the three rates into `gss_interest_rates_monthly` keyed on the REAL
 *      data month (the "April 2026" reference, not the release month), so every
 *      downstream consumer — getLatestLendingRate → refreshMortgageRate → GHAI,
 *      the affordability sparkline, getLatestPolicyRate — reads a live value.
 *
 * BoG is the ultimate publisher of these series (GSS merely rebroadcasts them with
 * lag), so writing BoG-sourced points into this table is authoritative, not a mix.
 *
 * bog.gov.gh serves an incomplete TLS chain, so we relax cert verification for that
 * host only (same workaround as bogScraper) and send a browser UA.
 *
 * @module services/data-hub/scrapers/bogChartsPdfService
 */

import https from 'https';
import PDFParser from 'pdf2json';
import { query } from '../../../database';
import { logger } from '../../../utils/logger';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BOG_HOST = process.env.BOG_HOST || 'www.bog.gov.gh';
/** How many months back from "now" to probe for the latest published chart PDF. */
const MAX_LOOKBACK_MONTHS = parseInt(process.env.BOG_CHARTS_MAX_LOOKBACK || '4', 10);
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** BoG label → our canonical `gss_interest_rates_monthly.rate_type`. */
const RATE_LABELS: Array<{ label: string; rateType: string }> = [
  { label: 'Monetary Policy Rate', rateType: 'Monetary policy rate' },
  { label: 'Ghana Reference Rate', rateType: 'Ghana reference rate' },
  { label: 'Average Lending Rate', rateType: 'Average lending rate' },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BogChartRates {
  /** Reference data month the chart annotates, e.g. '2026-04' (NOT the release month). */
  referenceMonth: string;
  monetaryPolicyRate: number | null;
  ghanaReferenceRate: number | null;
  averageLendingRate: number | null;
  sourceUrl: string;
  /** The month the PDF file itself was published under, e.g. '2026-05'. */
  releaseMonth: string;
}

export interface BogChartRefreshResult {
  ok: boolean;
  referenceMonth?: string;
  averageLendingRate?: number | null;
  monetaryPolicyRate?: number | null;
  ghanaReferenceRate?: number | null;
  rowsUpserted?: number;
  sourceUrl?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class BogChartsPdfService {
  private readonly agent = new https.Agent({ rejectUnauthorized: false });

  /** Build the monthly chart-summary PDF URL for a given year/month (1-based month). */
  private pdfUrl(year: number, month: number): string {
    const name = MONTH_NAMES[month - 1];
    return `https://${BOG_HOST}/wp-content/uploads/${year}/${String(month).padStart(2, '0')}/Summary-of-Economic-and-Financial-Charts-${name}-${year}.pdf`;
  }

  /** Fetch a URL as a Buffer with the TLS/UA workaround. Returns null on any non-200 or non-PDF. */
  private async fetchPdf(url: string): Promise<Buffer | null> {
    return new Promise((resolve) => {
      const req = https.get(
        url,
        {
          agent: this.agent,
          headers: { 'User-Agent': BROWSER_UA, Accept: 'application/pdf,*/*' },
          timeout: 30_000,
        },
        (res) => {
          const status = res.statusCode || 0;
          const ctype = String(res.headers['content-type'] || '');
          if (status !== 200 || !ctype.includes('pdf')) {
            res.resume(); // drain
            resolve(null);
            return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c as Buffer));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', () => resolve(null));
        },
      );
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
    });
  }

  /**
   * Find the latest published monthly PDF, walking back from the current month
   * (BoG publishes the "<Month>" summary during the following month, and with a
   * variable lag). Returns the first month that resolves to a real PDF.
   */
  async discoverLatestPdf(now = new Date()): Promise<{ buffer: Buffer; year: number; month: number; url: string } | null> {
    for (let i = 0; i < MAX_LOOKBACK_MONTHS; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth() + 1;
      const url = this.pdfUrl(year, month);
      const buffer = await this.fetchPdf(url);
      if (buffer && buffer.length > 300_000) {
        logger.info('[BoG-Charts] Found monthly PDF', { url, bytes: buffer.length });
        return { buffer, year, month, url };
      }
    }
    logger.warn('[BoG-Charts] No monthly chart PDF found in lookback window', { lookback: MAX_LOOKBACK_MONTHS });
    return null;
  }

  /**
   * Reconstruct the text of a single PDF page from positioned glyphs.
   * pdf2json emits chart text as individually-placed runs, so we group runs into
   * lines by y (small tolerance) then order each line left-to-right by x.
   */
  private async pageLines(buffer: Buffer, pageIndex: number): Promise<string[]> {
    const data: any = await new Promise((resolve, reject) => {
      const parser = new (PDFParser as any)();
      parser.on('pdfParser_dataError', (err: any) => reject(new Error(err?.parserError || 'pdf parse error')));
      parser.on('pdfParser_dataReady', (d: any) => resolve(d));
      parser.parseBuffer(buffer);
    });

    const page = data?.Pages?.[pageIndex];
    if (!page?.Texts?.length) return [];

    const items = page.Texts.map((t: any) => ({
      x: t.x as number,
      y: t.y as number,
      s: (t.R || []).map((r: any) => decodeURIComponent(r.T)).join(''),
    })).filter((it: any) => it.s && it.s.trim() !== '');

    items.sort((a: any, b: any) => a.y - b.y || a.x - b.x);

    const lines: Array<{ y: number; parts: any[] }> = [];
    let cur: { y: number; parts: any[] } | null = null;
    for (const it of items) {
      if (!cur || Math.abs(cur.y - it.y) > 0.3) {
        cur = { y: it.y, parts: [it] };
        lines.push(cur);
      } else {
        cur.parts.push(it);
      }
    }
    return lines.map((l) => l.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(' '));
  }

  /**
   * Parse the three headline interest rates from the chart PDF. The "Interest
   * Rates" panel lives on page 2; the labels row ("Monetary Policy Rate  Ghana
   * Reference Rate  Average Lending Rate") is immediately followed by a values row
   * with the three "<Month> <Year> = <value>%" annotations, in the same order.
   */
  async parseRates(buffer: Buffer, sourceUrl: string, releaseMonth: string): Promise<BogChartRates | null> {
    // The interest-rates panel is on the second physical page in observed files,
    // but scan the first few pages defensively.
    let lines: string[] = [];
    let labelIdx = -1;
    for (let p = 1; p <= 3 && labelIdx === -1; p++) {
      lines = await this.pageLines(buffer, p);
      labelIdx = lines.findIndex(
        (l) => l.includes('Monetary') && l.includes('Policy') && l.includes('Lending'),
      );
    }
    if (labelIdx === -1) {
      logger.warn('[BoG-Charts] Interest-rate labels row not found in PDF', { sourceUrl });
      return null;
    }

    // The values row is the next line; be tolerant and search the next couple of lines.
    const valueRe = /([A-Z][a-z]+)\s+(\d{4})\s*=\s*([\d.]+)\s*%/g;
    let matches: RegExpMatchArray[] = [];
    let referenceMonth = '';
    for (let j = labelIdx + 1; j <= labelIdx + 3 && j < lines.length; j++) {
      const found = [...lines[j].matchAll(valueRe)];
      if (found.length >= 3) {
        matches = found;
        const monthName = found[0][1];
        const year = found[0][2];
        const mIdx = MONTH_NAMES.indexOf(monthName);
        if (mIdx >= 0) referenceMonth = `${year}-${String(mIdx + 1).padStart(2, '0')}`;
        break;
      }
    }
    if (matches.length < 3 || !referenceMonth) {
      logger.warn('[BoG-Charts] Interest-rate values row not parseable', { sourceUrl, sample: lines[labelIdx + 1] });
      return null;
    }

    // Order on both the labels row and the values row is MPR, GRR, Lending.
    const [mpr, grr, lending] = matches.map((m) => parseFloat(m[3]));
    const sane = (v: number) => (Number.isFinite(v) && v > 0 && v < 100 ? v : null);

    return {
      referenceMonth,
      monetaryPolicyRate: sane(mpr),
      ghanaReferenceRate: sane(grr),
      averageLendingRate: sane(lending),
      sourceUrl,
      releaseMonth,
    };
  }

  /**
   * Discover → parse → upsert the three current BoG rates into
   * `gss_interest_rates_monthly`, keyed on the real data month. Idempotent per
   * (rate_type, period_date). Returns a summary; never throws.
   */
  async refresh(now = new Date()): Promise<BogChartRefreshResult> {
    try {
      const found = await this.discoverLatestPdf(now);
      if (!found) return { ok: false, error: 'no chart PDF found' };

      const releaseMonth = `${found.year}-${String(found.month).padStart(2, '0')}`;
      const rates = await this.parseRates(found.buffer, found.url, releaseMonth);
      if (!rates) return { ok: false, error: 'rates not parseable', sourceUrl: found.url };

      const periodDate = `${rates.referenceMonth}-01`;
      const sourceMonthLabel = `BoG Charts ${MONTH_NAMES[found.month - 1]} ${found.year}`;
      const byType: Array<[string, number | null]> = [
        ['Monetary policy rate', rates.monetaryPolicyRate],
        ['Ghana reference rate', rates.ghanaReferenceRate],
        ['Average lending rate', rates.averageLendingRate],
      ];

      let rowsUpserted = 0;
      for (const [rateType, value] of byType) {
        if (value === null) continue;
        await query(
          `INSERT INTO gss_interest_rates_monthly
             (id, period_date, rate_type, rate_pct, source_month, source_updated_at, synced_at)
           VALUES (uuid_generate_v4(), $1::date, $2, $3, $4, NOW(), NOW())
           ON CONFLICT (rate_type, period_date) DO UPDATE SET
             rate_pct = EXCLUDED.rate_pct,
             source_month = EXCLUDED.source_month,
             source_updated_at = NOW(),
             synced_at = NOW()`,
          [periodDate, rateType, value, sourceMonthLabel],
        );
        rowsUpserted++;
      }

      logger.info('[BoG-Charts] Rates refreshed', {
        referenceMonth: rates.referenceMonth,
        lending: rates.averageLendingRate,
        mpr: rates.monetaryPolicyRate,
        grr: rates.ghanaReferenceRate,
        rowsUpserted,
        sourceUrl: found.url,
      });

      return {
        ok: true,
        referenceMonth: rates.referenceMonth,
        averageLendingRate: rates.averageLendingRate,
        monetaryPolicyRate: rates.monetaryPolicyRate,
        ghanaReferenceRate: rates.ghanaReferenceRate,
        rowsUpserted,
        sourceUrl: found.url,
      };
    } catch (err: any) {
      logger.error('[BoG-Charts] Refresh failed', { error: err?.message });
      return { ok: false, error: err?.message };
    }
  }
}

export const bogChartsPdfService = new BogChartsPdfService();
