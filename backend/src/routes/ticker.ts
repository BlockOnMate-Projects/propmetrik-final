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
      // 1. Accra median sale price (more representative than mean)
      pool.query(`
        SELECT
          COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price), 0) AS median_price,
          COALESCE(AVG(price), 0) AS avg_price,
          COUNT(*) AS total_properties
        FROM properties
        WHERE region = 'greater_accra'
          AND price > 0
          AND transaction_type = 'sale'
      `),

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
      `),

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
      pool.query(`SELECT COUNT(*) AS total FROM properties`),

      // 6. Avg cap rate
      pool.query(`
        SELECT COALESCE(AVG(cap_rate_mean), 0) AS avg_cap_rate
        FROM market_cap_rate_benchmarks
      `).catch(() => ({ rows: [{ avg_cap_rate: 0 }] })),
    ]);

    const medianPrice = parseFloat(priceIndexResult.rows[0]?.median_price) || 0;
    const avgPrice = parseFloat(priceIndexResult.rows[0]?.avg_price) || 0;
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
          avg_price: Math.round(avgPrice),
          total_properties: totalProps,
          // Use cap rate as proxy for market performance indicator
          change_pct: avgCapRate > 0 ? +(avgCapRate * 100).toFixed(2) : 0,
        },
        accra_avg: Math.round(medianPrice || avgPrice),
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
