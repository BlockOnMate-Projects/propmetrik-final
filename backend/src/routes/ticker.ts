import { Router, Request, Response } from 'express';
import { pool } from '../database';

const router = Router();

/**
 * GET /api/v1/ticker
 * Lightweight endpoint for the TopNav ticker bar.
 * Returns live summary metrics from the database.
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    // Run all queries in parallel
    const [
      priceIndexResult,
      regionResult,
      dealsResult,
      valuationsResult,
      propertiesResult,
      capRateResult,
      ghaiResult,
      cciResult,
      miegResult,
      lendingResult,
      nplResult,
    ] = await Promise.all([
      // 1. Median sale prices — NATIONAL (the "Ghana Property Index") and Greater Accra, in one pass.
      // Median, not mean: a few ₵100M+ outlier rows drag the Accra mean to ~₵1.48M vs a ₵350K median.
      pool.query(`
        SELECT
          COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price), 0) AS national_median,
          COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price)
                   FILTER (WHERE region = 'greater_accra'), 0) AS accra_median,
          COUNT(*) FILTER (WHERE region = 'greater_accra') AS total_properties
        FROM properties
        WHERE price > 0
          AND transaction_type = 'sale'
      `).catch(() => ({ rows: [{ national_median: 0, accra_median: 0, total_properties: 0 }] })),

      // 2. Market segments — sale prices only for meaningful comparison
      pool.query(`
        WITH overall_median AS (
          SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) AS val
          FROM properties WHERE price > 0 AND transaction_type = 'sale'
        ),
        raw AS (
          SELECT
            CASE
              WHEN region = 'greater_accra' AND property_type = 'residential_house' THEN 'ACCRA HOUSES'
              WHEN region = 'greater_accra' AND property_type = 'apartment_flat'    THEN 'ACCRA FLATS'
              WHEN region = 'greater_accra' AND property_type = 'land'              THEN 'ACCRA LAND'
              WHEN region = 'greater_accra' AND property_type = 'commercial_shop'   THEN 'COMMERCIAL'
              WHEN region = 'kumasi_metro'                                           THEN 'KUMASI'
              WHEN address_city = 'Tema'                                             THEN 'TEMA'
              ELSE NULL
            END AS seg,
            price
          FROM properties
          WHERE price > 0 AND transaction_type = 'sale'
        ),
        segments AS (
          SELECT seg, AVG(price) AS avg_price, COUNT(*) AS cnt
          FROM raw
          WHERE seg IS NOT NULL
          GROUP BY seg
        )
        SELECT s.seg AS name, s.avg_price, s.cnt,
               CASE WHEN s.avg_price > o.val THEN 'up' ELSE 'down' END AS direction
        FROM segments s, overall_median o
        ORDER BY s.cnt DESC
      `).catch(() => ({ rows: [] as any[] })),

      // 3. Active deals count
      pool.query(`
        SELECT COUNT(*) AS active_deals
        FROM deals
        WHERE status NOT IN ('closed_won', 'closed_lost', 'archived')
      `).catch(() => ({ rows: [{ active_deals: 0 }] })),

      // 4. Pending valuations count
      pool.query(`
        SELECT COUNT(*) AS pending_vals
        FROM valuations
        WHERE status IN ('pending', 'in_progress', 'submitted', 'draft')
      `).catch(() => ({ rows: [{ pending_vals: 0 }] })),

      // 5. Total properties count
      pool.query(`SELECT COUNT(*) AS total FROM properties`).catch(() => ({ rows: [{ total: 0 }] })),

      // 6. Avg cap rate
      pool.query(`
        SELECT COALESCE(AVG(cap_rate_mean), 0) AS avg_cap_rate
        FROM market_cap_rate_benchmarks
      `).catch(() => ({ rows: [{ avg_cap_rate: 0 }] })),

      // 7. GHAI — latest composite affordability (prefer Greater Accra headline)
      pool.query(`
        SELECT ghai_composite, change_mom
        FROM housing_affordability_index
        ORDER BY (region = 'greater_accra') DESC, calculation_date DESC
        LIMIT 1
      `).catch(() => ({ rows: [] as any[] })),

      // 8. Construction Cost Index — latest national (region NULL) monthly
      pool.query(`
        SELECT index_value, change_yoy
        FROM construction_cost_index_analytics
        WHERE period_type = 'monthly'
        ORDER BY (region IS NULL) DESC, period_date DESC
        LIMIT 1
      `).catch(() => ({ rows: [] as any[] })),

      // 9. MIEG — latest Total growth YoY
      pool.query(`
        SELECT index_value, growth_yoy_pct
        FROM gss_mieg_monthly
        WHERE variable = 'Total_MIEG'
        ORDER BY period_date DESC
        LIMIT 1
      `).catch(() => ({ rows: [] as any[] })),

      // 10. Average lending rate — latest 2 months (for the pp change)
      pool.query(`
        SELECT rate_pct, period_date FROM gss_interest_rates_monthly
        WHERE rate_type = 'Average lending rate'
        ORDER BY period_date DESC LIMIT 2
      `).catch(() => ({ rows: [] as any[] })),

      // 11. NPL ratio — latest 2 months (for the pp change)
      pool.query(`
        SELECT value_pct, period_date FROM gss_financial_soundness_monthly
        WHERE indicator = 'Non performing loan ratio'
        ORDER BY period_date DESC LIMIT 2
      `).catch(() => ({ rows: [] as any[] })),
    ]);

    const nationalMedian = parseFloat(priceIndexResult.rows[0]?.national_median) || 0;
    const accraMedian = parseFloat(priceIndexResult.rows[0]?.accra_median) || 0;
    const totalProps = parseInt(propertiesResult.rows[0]?.total) || 0;
    const avgCapRate = parseFloat(capRateResult.rows[0]?.avg_cap_rate) || 0;

    // Pick top segments for the ticker
    const neighborhoods = (regionResult.rows || []).slice(0, 6).map((n: any) => ({
      name: String(n.name),
      avg_price: parseFloat(n.avg_price) || 0,
      direction: n.direction as 'up' | 'down',
      count: parseInt(n.cnt) || 0,
    }));

    const activeDeals = parseInt(dealsResult.rows[0]?.active_deals) || 0;
    const pendingVals = parseInt(valuationsResult.rows[0]?.pending_vals) || 0;

    // ── Headline market indices for the public marketing ticker ────────────────
    // Each entry is real, live data; entries with no data are omitted (never faked).
    type Idx = { key: string; label: string; value: number; unit: string; change: number | null; direction: 'up' | 'down' | null };
    const dir = (c: number | null): 'up' | 'down' | null => (c == null || c === 0 ? null : c > 0 ? 'up' : 'down');
    const num = (v: any): number | null => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
    // pp change between two rows, but ONLY if their periods are adjacent months
    // (≤ 45 days apart). Non-adjacent stored points would produce a bogus swing.
    const adjChange = (rows: any[], field: string): number | null => {
      if (!rows[0] || !rows[1]) return null;
      const cur = num(rows[0][field]); const prev = num(rows[1][field]);
      if (cur == null || prev == null) return null;
      const days = Math.abs((new Date(rows[0].period_date).getTime() - new Date(rows[1].period_date).getTime()) / 86_400_000);
      return days <= 45 ? +(cur - prev).toFixed(2) : null;
    };

    const marketIndices: Idx[] = [];

    // GH Property Index (national median sale price) — no reliable period series yet, so no change.
    if (nationalMedian || accraMedian) {
      marketIndices.push({ key: 'property', label: 'GH PROPERTY IDX', value: Math.round(nationalMedian || accraMedian), unit: 'GHS', change: null, direction: null });
    }
    // GHAI (affordability composite, 0–100)
    const ghai = ghaiResult.rows[0];
    if (ghai && num(ghai.ghai_composite) != null) {
      const chg = num(ghai.change_mom);
      marketIndices.push({ key: 'ghai', label: 'GHAI', value: +Number(ghai.ghai_composite).toFixed(1), unit: '/100', change: chg != null ? +chg.toFixed(2) : null, direction: dir(chg) });
    }
    // Construction Cost Index
    const cci = cciResult.rows[0];
    if (cci && num(cci.index_value) != null) {
      const chg = num(cci.change_yoy);
      marketIndices.push({ key: 'cci', label: 'CONSTRUCTION CCI', value: +Number(cci.index_value).toFixed(1), unit: 'idx', change: chg != null ? +chg.toFixed(1) : null, direction: dir(chg) });
    }
    // MIEG — economic growth (YoY %) is itself the headline value
    const mieg = miegResult.rows[0];
    if (mieg && num(mieg.growth_yoy_pct) != null) {
      const g = +Number(mieg.growth_yoy_pct).toFixed(1);
      marketIndices.push({ key: 'mieg', label: 'MIEG GROWTH', value: g, unit: '% YoY', change: null, direction: g >= 0 ? 'up' : 'down' });
    }
    // Average lending rate (%), with adjacent-month pp change
    if (lendingResult.rows[0] && num(lendingResult.rows[0].rate_pct) != null) {
      const chg = adjChange(lendingResult.rows, 'rate_pct');
      marketIndices.push({ key: 'lending', label: 'AVG LENDING RATE', value: +num(lendingResult.rows[0].rate_pct)!.toFixed(2), unit: '%', change: chg, direction: dir(chg) });
    }
    // NPL ratio (%), with adjacent-month pp change
    if (nplResult.rows[0] && num(nplResult.rows[0].value_pct) != null) {
      const chg = adjChange(nplResult.rows, 'value_pct');
      marketIndices.push({ key: 'npl', label: 'NPL RATIO', value: +num(nplResult.rows[0].value_pct)!.toFixed(2), unit: '%', change: chg, direction: dir(chg) });
    }

    res.json({
      success: true,
      data: {
        gh_property_index: {
          // National median sale price — robust to the ₵100M+ outlier rows that skewed the old mean.
          avg_price: Math.round(nationalMedian || accraMedian),
          total_properties: totalProps,
          // No reliable period-over-period price series yet, so no change is shown (the old value
          // here was the cap rate reused as a fake "+9.4%" — removed).
          change_pct: null,
        },
        accra_avg: Math.round(accraMedian || nationalMedian),
        neighborhoods,
        active_deals: activeDeals,
        pending_valuations: pendingVals,
        cap_rate: +(avgCapRate * 100).toFixed(2),
        market_indices: marketIndices,
      },
    });
  } catch (err: any) {
    console.error('[ticker] Error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to load ticker data' });
  }
});

export default router;
