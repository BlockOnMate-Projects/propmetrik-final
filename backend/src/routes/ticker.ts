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
      },
    });
  } catch (err: any) {
    console.error('[ticker] Error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to load ticker data' });
  }
});

export default router;
