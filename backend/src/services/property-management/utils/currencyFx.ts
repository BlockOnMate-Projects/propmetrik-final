import { economicDataService } from '../../data-hub/economicDataService';
import { logger } from '../../../utils/logger';

/**
 * Currency normalization helpers for portfolio-level aggregates.
 *
 * Properties, rents and financial records are each stored in their own listed
 * currency (GHS | USD | EUR | GBP). Individual amounts are always shown in their
 * native currency. But any AGGREGATE (a SUM across many rows) must first convert
 * every row to a single base currency — you cannot add USD and GHS as raw numbers.
 *
 * Base currency is GHS. Rates are "GHS per 1 foreign unit" (e.g. USD rate 15.5 =>
 * 1 USD = 15.5 GHS), so converting a foreign amount to GHS is `amount * rate`.
 *
 * Rates come from the existing live FX engine (economicDataService -> fxFeedService),
 * which is refreshed every 5 minutes and persisted daily.
 */

export const BASE_CURRENCY = 'GHS';
const CONVERTIBLE = ['USD', 'EUR', 'GBP'];

export interface FxRateMap {
    base: string;                    // always 'GHS'
    rates: Record<string, number>;   // { GHS: 1, USD: 15.5, EUR: 17.0, GBP: 20.0 }
    asOf: string;                    // ISO timestamp of the freshest rate used
    source: string;                  // e.g. 'Yahoo Finance'
    degraded: boolean;               // true if any rate fell back to 1:1 (rate unavailable)
}

// Process-wide cache. Rates move slowly, but this function is called by ~7 aggregate
// endpoints per dashboard load — each previously triggering 3 remote DB/FX lookups.
// Caching collapses that to one refresh per TTL, and the in-flight promise dedupes the
// burst of concurrent dashboard requests into a single fetch.
const RATE_TTL_MS = 5 * 60 * 1000;          // healthy rates: refresh every 5 min
const RATE_TTL_DEGRADED_MS = 30 * 1000;     // degraded (a rate fell back to 1:1): retry sooner
let _rateCache: { map: FxRateMap; expiresAt: number } | null = null;
let _rateInflight: Promise<FxRateMap> | null = null;

/**
 * Cached accessor for the GHS rate map (see fetchGhsRateMap for the underlying fetch).
 * Returns the cached map within its TTL; otherwise refreshes once, sharing a single
 * in-flight fetch across all concurrent callers.
 */
export async function getGhsRateMap(): Promise<FxRateMap> {
    const now = Date.now();
    if (_rateCache && now < _rateCache.expiresAt) return _rateCache.map;
    if (_rateInflight) return _rateInflight;

    _rateInflight = (async () => {
        try {
            const map = await fetchGhsRateMap();
            _rateCache = {
                map,
                expiresAt: Date.now() + (map.degraded ? RATE_TTL_DEGRADED_MS : RATE_TTL_MS),
            };
            return map;
        } finally {
            _rateInflight = null;
        }
    })();
    return _rateInflight;
}

/**
 * Fetch the live GHS conversion rates for every supported foreign currency in one shot.
 * Resilient: if an individual rate can't be fetched it falls back to 1:1 and flags
 * `degraded` so the UI can warn rather than silently produce a wrong total.
 */
async function fetchGhsRateMap(): Promise<FxRateMap> {
    const rates: Record<string, number> = { [BASE_CURRENCY]: 1 };
    let latestMs = 0;
    let asOf: Date | null = null;
    let source = 'live';
    let degraded = false;

    await Promise.all(
        CONVERTIBLE.map(async (cur) => {
            try {
                const r = await economicDataService.getExchangeRate(cur, BASE_CURRENCY);
                const rate = Number(r?.rate);
                if (Number.isFinite(rate) && rate > 0) {
                    rates[cur] = rate;
                    const t = new Date(r.date).getTime();
                    if (!Number.isNaN(t) && t > latestMs) {
                        latestMs = t;
                        asOf = new Date(r.date);
                        source = r.source || source;
                    }
                } else {
                    rates[cur] = 1;
                    degraded = true;
                }
            } catch (err) {
                logger.warn('FX rate unavailable, falling back to 1:1', { currency: cur, err });
                rates[cur] = 1;
                degraded = true;
            }
        })
    );

    return {
        base: BASE_CURRENCY,
        rates,
        asOf: (asOf ?? new Date()).toISOString(),
        source,
        degraded,
    };
}

/**
 * Build a SQL expression that converts a per-row (amount, currency) pair to GHS using
 * the supplied rate map. Rates are server-computed finite numbers (never user input),
 * so inlining them is safe and avoids juggling positional parameters inside aggregates.
 *
 * Example: ghsValueSql('price', 'price_currency', map)
 *   => (CASE UPPER(COALESCE(price_currency, 'GHS'))
 *         WHEN 'USD' THEN (price) * 15.5
 *         WHEN 'EUR' THEN (price) * 17
 *         WHEN 'GBP' THEN (price) * 20
 *         ELSE (price) END)
 */
export function ghsValueSql(amountExpr: string, currencyExpr: string, map: FxRateMap): string {
    const safe = (v: number) => (Number.isFinite(v) && v > 0 ? v : 1);
    const cases = CONVERTIBLE
        .map((c) => `WHEN '${c}' THEN (${amountExpr}) * ${safe(map.rates[c])}`)
        .join(' ');
    // Cast the currency to text first — it is usually a Postgres enum (currency_enum),
    // and UPPER()/comparison against text literals requires an explicit ::text cast.
    return `(CASE UPPER(COALESCE((${currencyExpr})::text, '${BASE_CURRENCY}')) ${cases} ELSE (${amountExpr}) END)`;
}

/**
 * Like ghsValueSql, but for REALIZED transactions (income/expense records, payments):
 * converts each row using the exchange rate that was in effect AS OF the row's own
 * transaction date — not today's rate. This avoids silently restating historical
 * income every time the cedi moves (IAS 21 / RICS-style treatment of past flows).
 *
 * The dated rate is read from `economic_indicators` (the same table the FX scheduler
 * persists into) — the closest rate on/before the transaction date. If no historical
 * rate exists for that date (gaps / pre-history), it falls back to the live rate.
 *
 * Example: ghsHistoricalValueSql('fr.amount', 'fr.currency', 'fr.transaction_date', map)
 */
export function ghsHistoricalValueSql(
    amountExpr: string,
    currencyExpr: string,
    dateExpr: string,
    map: FxRateMap
): string {
    const safe = (v: number) => (Number.isFinite(v) && v > 0 ? v : 1);
    const branch = (c: string) => {
        const live = safe(map.rates[c]);
        // Compare against the enum literal directly (not ::text) so the
        // (indicator_type, effective_date DESC) index is used. The three
        // exchange_rate_* labels are guaranteed to exist in economic_indicator_type_enum.
        const histRate = `COALESCE((
            SELECT ei.value FROM economic_indicators ei
            WHERE ei.indicator_type = 'exchange_rate_${c.toLowerCase()}'
              AND ei.effective_date <= (${dateExpr})::date
            ORDER BY ei.effective_date DESC
            LIMIT 1
        ), ${live})`;
        return `WHEN '${c}' THEN (${amountExpr}) * ${histRate}`;
    };
    const cases = CONVERTIBLE.map(branch).join(' ');
    return `(CASE UPPER(COALESCE((${currencyExpr})::text, '${BASE_CURRENCY}')) ${cases} ELSE (${amountExpr}) END)`;
}

/** Compact FX metadata to attach to API responses so the UI can stamp "rates as of …". */
export function fxMeta(map: FxRateMap) {
    return {
        baseCurrency: map.base,
        rates: map.rates,
        ratesAsOf: map.asOf,
        ratesSource: map.source,
        ratesDegraded: map.degraded,
    };
}

export type FxMeta = ReturnType<typeof fxMeta>;
