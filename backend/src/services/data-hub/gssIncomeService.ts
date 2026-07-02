/**
 * GSS Regional Household Income Service
 *
 * Produces real, monthly-refreshing median household income per region — the input the Ghana
 * Housing Affordability Index (GHAI) needs, which previously had no live source and was hardcoded.
 *
 * Everything is sourced from the Ghana Statistical Service (GSS) StatsBank PxWeb API + the CPI we
 * already sync monthly. Nothing is seeded:
 *
 *   median_hourly_earnings  ← AHIES `med_earnings.px`        (live, quarterly, by region)
 *   avg_household_size      ← PHC 2021 `avg_hhsize_table.px` (census, by region)
 *   employment_rate         ← PHC 2021 `econact_table.px`    (Employed / Total 15+, by region)
 *   mean_weekly_hours       ← GSS AHIES Labour Statistics     (documented national mean — sole constant)
 *   cpi_index               ← economic_indicators.cpi_index   (live, monthly via BoG/GSS sync)
 *
 *   household_income(survey) = hourly × weekly_hours × (52/12) × (hh_size × employment_rate)
 *   household_income(month)  = household_income(survey) × cpi_current / cpi_base
 *
 * Stored in `regional_household_income` (one row per region per escalation month) and consumed by
 * ghaiService. Run monthly by the economicDataScheduler.
 */

import https from 'https';
import { query } from '../../database';
import { logger } from '../../utils/logger';
import { syncLogRepository } from './scrapers/syncLogRepository';
import type { SyncResult } from './scrapers/types';

// ---------------------------------------------------------------------------
// GSS StatsBank PxWeb API
// ---------------------------------------------------------------------------

const STATSBANK_HOST = process.env.GSS_STATSBANK_HOST || 'statsbank.statsghana.gov.gh';
const AHIES_DB = '/api/v1/en/Annual%20Household%20Income%20and%20Expenditure%20Survey%20(AHIES)';
const PHC_DB = '/api/v1/en/PHC%202021%20StatsBank';
const CPI_TABLE = '/api/v1/en/Macroeconomic%20Indicators/Prices%20and%20Inflation/cpi.px';

/**
 * GSS AHIES Labour Statistics mean actual hours worked per week (full-time-equivalent standard
 * workweek). The PxWeb labour module exposes hourly earnings but not an hours table, so this is
 * sourced from the published AHIES Labour Statistics report. This is the ONLY non-API constant.
 * Override via env if a newer AHIES report revises it.
 */
const MEAN_WEEKLY_HOURS = Number(process.env.GSS_MEAN_WEEKLY_HOURS || 40);
const WEEKS_PER_MONTH = 52 / 12;

/** The 16 GSS region labels (PxWeb value codes are the labels verbatim). */
const GSS_REGIONS = [
  'Western', 'Central', 'Greater Accra', 'Volta', 'Eastern', 'Ashanti',
  'Western North', 'Ahafo', 'Bono', 'Bono East', 'Oti', 'Northern',
  'Savannah', 'North East', 'Upper East', 'Upper West',
];

/** GSS label → internal snake_case region key (matches ghaiService REGIONAL_WEIGHTS). */
function regionKey(gssLabel: string): string {
  return gssLabel.toLowerCase().replace(/\s+/g, '_');
}

interface PxStat2 {
  value: (number | null)[];
  dimension: Record<string, { category: { index: Record<string, number>; label: Record<string, string> } }>;
}

/** POST a PxWeb json-stat2 query and return the parsed response. */
function pxPost(path: string, queryBody: unknown): Promise<PxStat2> {
  const body = JSON.stringify({ query: queryBody, response: { format: 'json-stat2' } });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: 'POST',
        hostname: STATSBANK_HOST,
        path,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'propmetrik-datahub',
        },
        timeout: 30000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`GSS PxWeb ${res.statusCode} for ${path}: ${data.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(data) as PxStat2);
          } catch (e) {
            reject(new Error(`GSS PxWeb parse error for ${path}: ${(e as Error).message}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`GSS PxWeb timeout for ${path}`)));
    req.write(body);
    req.end();
  });
}

/** Reduce a single-measure json-stat2 response to { regionLabel: value } over the Region/Geographic_Area dim. */
function valuesByRegion(px: PxStat2, dimCode: string): Record<string, number | null> {
  const dim = px.dimension[dimCode];
  if (!dim) throw new Error(`GSS response missing dimension ${dimCode}`);
  const out: Record<string, number | null> = {};
  for (const [label, idx] of Object.entries(dim.category.index)) {
    // category.index is keyed by value-code; for these tables the code === label
    const labelText = dim.category.label[label] ?? label;
    out[labelText] = px.value[idx];
  }
  return out;
}

// ---------------------------------------------------------------------------
// GSS fetchers
// ---------------------------------------------------------------------------

/**
 * PHC 2021 formal employment % per region — from sector_table.px.
 * Formal = Public sector + Private formal sector as % of employed population 15+.
 * Used to replace the hardcoded 15% in ghaiService.calculateMAS().
 */
async function fetchFormalEmploymentPct(): Promise<Record<string, number>> {
  // sector_table.px actual dimension value codes (verified 2026-06-30):
  // Sector: 'Total' | 'Public (Government)' | 'Semi-Public/Parastatal' | 'Private Formal' | 'Private Informal' | 'Local NGO/CSO'
  // Must include all 6 dimensions to get clean region-level totals
  const makeQuery = (sector: string) => [
    { code: 'Sector', selection: { filter: 'item', values: [sector] } },
    { code: 'Locality', selection: { filter: 'item', values: ['All Locality Types'] } },
    { code: 'Education', selection: { filter: 'item', values: ['Total'] } },
    { code: 'Sex', selection: { filter: 'item', values: ['Both sexes'] } },
    { code: 'Age', selection: { filter: 'item', values: ['All ages'] } },
    { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } },
  ];

  // Fetch public (government) + private formal + total in parallel
  const [publicPx, privateFormalPx, totalPx] = await Promise.all([
    pxPost(`${PHC_DB}/Economic%20Activity/sector_table.px`, makeQuery('Public (Government)')),
    pxPost(`${PHC_DB}/Economic%20Activity/sector_table.px`, makeQuery('Private Formal')),
    pxPost(`${PHC_DB}/Economic%20Activity/sector_table.px`, makeQuery('Total')),
  ]);

  const publicMap = valuesByRegion(publicPx, 'Geographic_Area');
  const privateFormalMap = valuesByRegion(privateFormalPx, 'Geographic_Area');
  const totalMap = valuesByRegion(totalPx, 'Geographic_Area');

  const out: Record<string, number> = {};
  for (const label of GSS_REGIONS) {
    const pub = publicMap[label];
    const priv = privateFormalMap[label];
    const total = totalMap[label];
    if (
      typeof pub === 'number' &&
      typeof priv === 'number' &&
      typeof total === 'number' &&
      total > 0
    ) {
      // formal % = (public + private formal) / total * 100
      out[label] = ((pub + priv) / total) * 100;
    }
  }
  return out;
}

/** Latest available AHIES quarter's median hourly earnings (GHS/hr) per region. */
async function fetchHourlyEarnings(): Promise<{ surveyPeriod: string; byRegion: Record<string, number> }> {
  // Discover the latest Date code from table metadata.
  const meta = await pxGet(`${AHIES_DB}/med_earnings.px`);
  const dateVar = meta.variables.find((v) => v.code === 'Date');
  if (!dateVar || dateVar.values.length === 0) throw new Error('AHIES med_earnings: no Date dimension');
  const latest = dateVar.values[dateVar.values.length - 1];

  const px = await pxPost(`${AHIES_DB}/med_earnings.px`, [
    { code: 'Date', selection: { filter: 'item', values: [latest] } },
    { code: 'Region', selection: { filter: 'item', values: GSS_REGIONS } },
    { code: 'Locality', selection: { filter: 'item', values: ['All Locality Types'] } },
    { code: 'Education', selection: { filter: 'item', values: ['All Educational Levels'] } },
    { code: 'Sex', selection: { filter: 'item', values: ['Both Sexes'] } },
    { code: 'Age', selection: { filter: 'item', values: ['All Ages'] } },
  ]);
  const raw = valuesByRegion(px, 'Region');
  const byRegion: Record<string, number> = {};
  for (const label of GSS_REGIONS) {
    const v = raw[label];
    if (typeof v === 'number' && v > 0) byRegion[label] = v;
  }
  return { surveyPeriod: latest, byRegion };
}

/** PHC 2021 average household size per region. */
async function fetchHouseholdSize(): Promise<Record<string, number>> {
  const px = await pxPost(`${PHC_DB}/Population/avg_hhsize_table.px`, [
    { code: 'Locality', selection: { filter: 'item', values: ['All Locality Types'] } },
    { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } },
  ]);
  const raw = valuesByRegion(px, 'Geographic_Area');
  const out: Record<string, number> = {};
  for (const label of GSS_REGIONS) {
    const v = raw[label];
    if (typeof v === 'number' && v > 0) out[label] = v;
  }
  return out;
}

/** PHC 2021 employment rate (Employed / Total population 15+) per region. */
async function fetchEmploymentRate(): Promise<Record<string, number>> {
  const econQuery = (status: string) => [
    { code: 'Econact', selection: { filter: 'item', values: [status] } },
    { code: 'Education', selection: { filter: 'item', values: ['Total'] } },
    { code: 'Locality', selection: { filter: 'item', values: ['All Locality Types'] } },
    { code: 'Sex', selection: { filter: 'item', values: ['Both sexes'] } },
    { code: 'Age', selection: { filter: 'item', values: ['Total'] } },
    { code: 'Geographic_Area', selection: { filter: 'item', values: GSS_REGIONS } },
  ];
  const [employedPx, totalPx] = await Promise.all([
    pxPost(`${PHC_DB}/Economic%20Activity/econact_table.px`, econQuery('Employed')),
    pxPost(`${PHC_DB}/Economic%20Activity/econact_table.px`, econQuery('Total')),
  ]);
  const employed = valuesByRegion(employedPx, 'Geographic_Area');
  const total = valuesByRegion(totalPx, 'Geographic_Area');
  const out: Record<string, number> = {};
  for (const label of GSS_REGIONS) {
    const e = employed[label];
    const t = total[label];
    if (typeof e === 'number' && typeof t === 'number' && t > 0) out[label] = e / t;
  }
  return out;
}

/** GET PxWeb table metadata (variable list). */
function pxGet(path: string): Promise<{ variables: Array<{ code: string; values: string[]; valueTexts: string[] }> }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      { hostname: STATSBANK_HOST, path, headers: { 'User-Agent': 'propmetrik-datahub' }, timeout: 30000 },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`GSS PxWeb meta parse error for ${path}: ${(e as Error).message}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`GSS PxWeb meta timeout for ${path}`)));
  });
}

// ---------------------------------------------------------------------------
// CPI (escalation) — sourced from GSS StatsBank cpi.px (national, All products)
// ---------------------------------------------------------------------------

/** Map an AHIES quarter code (e.g. 2023Q3) to the GSS CPI month code of its quarter end (2023M09). */
function surveyQuarterCpiMonth(period: string): string {
  const m = /^(\d{4})Q([1-4])$/.exec(period);
  if (!m) return `${period.slice(0, 4)}M12`;
  const endMonth = Number(m[2]) * 3; // Q1→3, Q2→6, Q3→9, Q4→12
  return `${m[1]}M${String(endMonth).padStart(2, '0')}`;
}

/** GSS CPI month code (e.g. 2026M01) → first-of-month Date. */
function cpiMonthToDate(code: string): Date {
  const m = /^(\d{4})M(\d{2})$/.exec(code);
  if (!m) return new Date();
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
}

/**
 * Fetch GSS national CPI (All products, All sources) for the requested months, plus the latest
 * available month code. Returns { latestMonth, byMonth }.
 */
async function fetchGssCpi(months: string[]): Promise<{ latestMonth: string; byMonth: Record<string, number> }> {
  const meta = await pxGet(CPI_TABLE);
  const monthVar = meta.variables.find((v) => v.code === 'Month');
  if (!monthVar || monthVar.values.length === 0) throw new Error('GSS cpi.px: no Month dimension');
  // Month values are newest-first in this table; the latest is the first entry.
  const latestMonth = monthVar.values[0];
  const want = Array.from(new Set([...months, latestMonth])).filter((m) => monthVar.values.includes(m));

  const px = await pxPost(CPI_TABLE, [
    { code: 'Indicator', selection: { filter: 'item', values: ['Consumer Price Index'] } },
    { code: 'Month', selection: { filter: 'item', values: want } },
    { code: 'Region', selection: { filter: 'item', values: ['Ghana'] } },
    { code: 'Product', selection: { filter: 'item', values: ['All products'] } },
    { code: 'Source', selection: { filter: 'item', values: ['All sources'] } },
  ]);
  const dim = px.dimension.Month;
  const byMonth: Record<string, number> = {};
  for (const [code, idx] of Object.entries(dim.category.index)) {
    const label = dim.category.label[code] ?? code;
    const v = px.value[idx];
    if (typeof v === 'number') byMonth[label] = v;
  }
  return { latestMonth, byMonth };
}

/** Upsert a real GSS CPI index point into economic_indicators (self-heals the seeded cpi_index). */
async function upsertCpiIndicator(monthCode: string, value: number): Promise<void> {
  const effectiveDate = cpiMonthToDate(monthCode).toISOString().slice(0, 10);
  await query(
    `INSERT INTO economic_indicators (
       id, indicator_type, indicator_name, value, effective_date, period_type,
       source_name, source_url, unit, created_at, updated_at
     ) VALUES (uuid_generate_v4(), 'cpi_index', 'Consumer Price Index (All products)', $1, $2, 'monthly',
       'Ghana Statistical Service', 'https://statsbank.statsghana.gov.gh', 'index', NOW(), NOW())
     ON CONFLICT (indicator_type, effective_date) DO UPDATE
       SET value = EXCLUDED.value, source_name = EXCLUDED.source_name,
           indicator_name = EXCLUDED.indicator_name, updated_at = NOW()`,
    [value, effectiveDate],
  );
}

/** Fetch the latest GSS Year-on-year inflation (%) for Ghana / All products (null if unavailable). */
async function fetchGssInflationLatest(): Promise<{ month: string; yoy: number } | null> {
  const meta = await pxGet(CPI_TABLE);
  const monthVar = meta.variables.find((v) => v.code === 'Month');
  if (!monthVar || monthVar.values.length === 0) return null;
  const latestMonth = monthVar.values[0];
  const px = await pxPost(CPI_TABLE, [
    { code: 'Indicator', selection: { filter: 'item', values: ['Year-on-year inflation (%)'] } },
    { code: 'Month', selection: { filter: 'item', values: [latestMonth] } },
    { code: 'Region', selection: { filter: 'item', values: ['Ghana'] } },
    { code: 'Product', selection: { filter: 'item', values: ['All products'] } },
    { code: 'Source', selection: { filter: 'item', values: ['All sources'] } },
  ]);
  const v = px.value[0];
  return typeof v === 'number' ? { month: latestMonth, yoy: v } : null;
}

/** Upsert the real GSS YoY inflation into economic_indicators.inflation_rate (self-heals the seed). */
async function upsertInflationIndicator(monthCode: string, yoy: number): Promise<void> {
  const effectiveDate = cpiMonthToDate(monthCode).toISOString().slice(0, 10);
  await query(
    `INSERT INTO economic_indicators (
       id, indicator_type, indicator_name, value, effective_date, period_type,
       source_name, source_url, unit, created_at, updated_at
     ) VALUES (uuid_generate_v4(), 'inflation_rate', 'Year-on-year inflation (All products)', $1, $2, 'monthly',
       'Ghana Statistical Service', 'https://statsbank.statsghana.gov.gh', 'percent', NOW(), NOW())
     ON CONFLICT (indicator_type, effective_date) DO UPDATE
       SET value = EXCLUDED.value, source_name = EXCLUDED.source_name,
           indicator_name = EXCLUDED.indicator_name, updated_at = NOW()`,
    [yoy, effectiveDate],
  );
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export interface RegionalIncomeRow {
  region: string;
  median_household_income_monthly_ghs: number;
  median_household_income_annual_ghs: number;
}

export class GSSIncomeService {
  /**
   * Fetch GSS earnings + census factors, CPI-escalate, and upsert one row per region into
   * regional_household_income for the current month. Logged to economic_data_sync_log.
   */
  async syncRegionalHouseholdIncome(triggeredBy: string = 'scheduler'): Promise<SyncResult> {
    const started_at = new Date();
    const sourceName = 'GSS Regional Household Income';
    const syncId = await syncLogRepository.startSync(sourceName, 'scheduled', triggeredBy);
    const errors: { message: string }[] = [];
    let fetched = 0;
    let saved = 0;

    try {
      const [earnings, hhSize, empRate] = await Promise.all([
        fetchHourlyEarnings(),
        fetchHouseholdSize(),
        fetchEmploymentRate(),
      ]);

      // Fetch formal employment % from PHC 2021 sector_table (non-fatal if missing)
      let formalEmpPct: Record<string, number> = {};
      try {
        formalEmpPct = await fetchFormalEmploymentPct();
        logger.info('[GSSIncome] Formal employment % fetched', { regions: Object.keys(formalEmpPct).length });
      } catch (formalErr: any) {
        logger.warn('[GSSIncome] fetchFormalEmploymentPct failed (non-fatal)', { error: formalErr.message });
      }

      const surveyPeriod = earnings.surveyPeriod;
      // Real GSS CPI escalation: CPI(now) / CPI(survey quarter end). Both from GSS cpi.px.
      const surveyCpiMonth = surveyQuarterCpiMonth(surveyPeriod);
      const cpi = await fetchGssCpi([surveyCpiMonth]);
      const cpiBase = cpi.byMonth[surveyCpiMonth] ?? null;
      const cpiCurrent = cpi.byMonth[cpi.latestMonth] ?? null;
      const escalation = cpiBase && cpiCurrent && cpiBase > 0 ? cpiCurrent / cpiBase : 1;
      // Self-heal the platform CPI + inflation: persist real GSS points into economic_indicators.
      if (cpiCurrent != null) await upsertCpiIndicator(cpi.latestMonth, cpiCurrent);
      if (cpiBase != null) await upsertCpiIndicator(surveyCpiMonth, cpiBase);
      const inflation = await fetchGssInflationLatest();
      if (inflation) await upsertInflationIndicator(inflation.month, inflation.yoy);

      // First day of the current month = the escalation period.
      const now = new Date();
      const periodMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
        .toISOString()
        .slice(0, 10);

      for (const label of GSS_REGIONS) {
        const hourly = earnings.byRegion[label];
        const size = hhSize[label];
        const rate = empRate[label];
        if (hourly == null || size == null || rate == null) {
          errors.push({ message: `Missing GSS factor for ${label} (hourly=${hourly}, hhSize=${size}, empRate=${rate})` });
          continue;
        }
        fetched++;

        const earnersPerHousehold = size * rate;
        const monthlySurvey = hourly * MEAN_WEEKLY_HOURS * WEEKS_PER_MONTH * earnersPerHousehold;
        const monthly = monthlySurvey * escalation;
        const annual = monthly * 12;

        await query(
          `INSERT INTO regional_household_income (
             region, period_month,
             median_hourly_earnings_ghs, survey_period, mean_weekly_hours,
             avg_household_size, employment_rate, earners_per_household,
             cpi_base, cpi_current, escalation_factor,
             median_household_income_monthly_ghs, median_household_income_annual_ghs,
             source_name, source_reference, metadata, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
           ON CONFLICT (region, period_month) DO UPDATE SET
             median_hourly_earnings_ghs = EXCLUDED.median_hourly_earnings_ghs,
             survey_period = EXCLUDED.survey_period,
             mean_weekly_hours = EXCLUDED.mean_weekly_hours,
             avg_household_size = EXCLUDED.avg_household_size,
             employment_rate = EXCLUDED.employment_rate,
             earners_per_household = EXCLUDED.earners_per_household,
             cpi_base = EXCLUDED.cpi_base,
             cpi_current = EXCLUDED.cpi_current,
             escalation_factor = EXCLUDED.escalation_factor,
             median_household_income_monthly_ghs = EXCLUDED.median_household_income_monthly_ghs,
             median_household_income_annual_ghs = EXCLUDED.median_household_income_annual_ghs,
             source_reference = EXCLUDED.source_reference,
             metadata = EXCLUDED.metadata,
             updated_at = NOW()`,
          [
            regionKey(label),
            periodMonth,
            hourly,
            surveyPeriod,
            MEAN_WEEKLY_HOURS,
            size,
            rate,
            earnersPerHousehold,
            cpiBase,
            cpiCurrent,
            escalation,
            Math.round(monthly * 100) / 100,
            Math.round(annual * 100) / 100,
            'Ghana Statistical Service (AHIES + PHC 2021)',
            `AHIES ${surveyPeriod} med_earnings.px; PHC 2021 avg_hhsize_table.px + econact_table.px`,
            JSON.stringify({
              gss_label: label,
              cpi_escalated: escalation !== 1,
              weeks_per_month: WEEKS_PER_MONTH,
            }),
          ],
        );

        // Update formal_employment_pct on the just-upserted row if available (Slice 1 extension).
        // Uses a separate UPDATE so it never blocks the income calculation if sector_table fails.
        const formalPct = formalEmpPct[label];
        if (typeof formalPct === 'number' && formalPct > 0) {
          await query(
            `UPDATE regional_household_income
             SET formal_employment_pct = $1
             WHERE region = $2 AND period_month = $3`,
            [Math.round(formalPct * 100) / 100, regionKey(label), periodMonth],
          ).catch((updateErr: Error) => {
            // Column may not exist yet if migration 262 hasn't run; silently skip.
            if ((updateErr as any).code !== '42703') throw updateErr;
          });
        }

        saved++;
      }

      const status: SyncResult['status'] = saved === 0 ? 'failed' : errors.length > 0 ? 'partial' : 'success';
      const result: SyncResult = {
        source: sourceName,
        status,
        started_at,
        completed_at: new Date(),
        records_fetched: fetched,
        records_saved: saved,
        records_failed: errors.length,
        errors: errors.map((e) => ({ code: 'MISSING_FACTOR', message: e.message, timestamp: new Date() })),
        metadata: { surveyPeriod, cpiBase, cpiCurrent, escalation, regions: saved },
      };
      await syncLogRepository.completeSync(syncId, result);
      logger.info('[GSSIncome] Regional household income synced', {
        surveyPeriod, saved, escalation: Number(escalation.toFixed(4)),
      });
      return result;
    } catch (error: any) {
      const result: SyncResult = {
        source: sourceName,
        status: 'failed',
        started_at,
        completed_at: new Date(),
        records_fetched: fetched,
        records_saved: saved,
        records_failed: errors.length + 1,
        errors: [
          ...errors.map((e) => ({ code: 'MISSING_FACTOR', message: e.message, timestamp: new Date() })),
          { code: 'SYNC_FAILED', message: error?.message || String(error), timestamp: new Date() },
        ],
        metadata: {},
      };
      await syncLogRepository.completeSync(syncId, result);
      logger.error('[GSSIncome] Sync failed', { error: error?.message });
      return result;
    }
  }

  /** Latest median household income (annual + monthly) per region, keyed by snake_case region. */
  async getLatestIncomeByRegion(): Promise<Record<string, { monthly: number; annual: number }>> {
    const r = await query<{ region: string; monthly: string; annual: string }>(
      `SELECT DISTINCT ON (region) region,
              median_household_income_monthly_ghs AS monthly,
              median_household_income_annual_ghs AS annual
       FROM regional_household_income
       ORDER BY region, period_month DESC`,
    );
    const out: Record<string, { monthly: number; annual: number }> = {};
    for (const row of r.rows) out[row.region] = { monthly: Number(row.monthly), annual: Number(row.annual) };
    return out;
  }
}

export const gssIncomeService = new GSSIncomeService();
