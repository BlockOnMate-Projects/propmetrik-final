/**
 * Property Management Metrics API Routes
 * Provides consolidated Cap Rate, NOI, Avg Rent, Returns metrics
 *
 * Mount: /api/v1/analytics/management  +  /api/analytics/management
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { pool } from '../database';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /summary
 * Consolidated management metrics: Cap Rate, NOI, AVG Rent, Returns
 */
router.get(
  '/summary',
  asyncHandler(async (req: Request, res: Response) => {
    const { region } = req.query as Record<string, string>;

    const regionFilter = region ? 'AND LOWER(region) = LOWER($1)' : '';
    const regionParam = region ? [region] : [];

    // 1. Cap Rate Benchmarks
    const capRateResult = await pool.query(
      `SELECT 
        region,
        property_type,
        cap_rate_min::float,
        cap_rate_max::float,
        cap_rate_median::float,
        cap_rate_mean::float,
        sample_size
       FROM market_cap_rate_benchmarks
       WHERE 1=1 ${region ? 'AND LOWER(region) = LOWER($1)' : ''}
       ORDER BY region, property_type`,
      regionParam,
    );

    // Deduplicate cap rates (some have duplicate rows)
    const seenCap = new Set<string>();
    const capRates = capRateResult.rows.filter(row => {
      const key = `${row.region}:${row.property_type}:${row.cap_rate_median}`;
      if (seenCap.has(key)) return false;
      seenCap.add(key);
      return true;
    });

    // 2. Rental Summary (AVG Rent, Median Rent by region/type)
    const rentalResult = await pool.query(
      `SELECT 
        region,
        property_type,
        COUNT(*) as listing_count,
        ROUND(AVG(price)::numeric, 0) as avg_rent,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price)::numeric, 0) as median_rent,
        ROUND(MIN(price)::numeric, 0) as min_rent,
        ROUND(MAX(price)::numeric, 0) as max_rent
       FROM properties
       WHERE transaction_type = 'rental'
         AND price > 0
         ${region ? 'AND LOWER(region) = LOWER($2)' : ''}
       GROUP BY region, property_type
       ORDER BY region, property_type`,
      region ? ['rental', region] : [],
    );

    // Fix: the query above has wrong param positions when no region
    // Re-query properly
    const rentalRows = region
      ? (await pool.query(
          `SELECT region, property_type, COUNT(*) as listing_count,
           ROUND(AVG(price)::numeric, 0) as avg_rent,
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price)::numeric, 0) as median_rent,
           ROUND(MIN(price)::numeric, 0) as min_rent,
           ROUND(MAX(price)::numeric, 0) as max_rent
           FROM properties
           WHERE transaction_type = 'rental' AND price > 0 AND LOWER(region) = LOWER($1)
           GROUP BY region, property_type ORDER BY region, property_type`,
          [region],
        )).rows
      : (await pool.query(
          `SELECT region, property_type, COUNT(*) as listing_count,
           ROUND(AVG(price)::numeric, 0) as avg_rent,
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price)::numeric, 0) as median_rent,
           ROUND(MIN(price)::numeric, 0) as min_rent,
           ROUND(MAX(price)::numeric, 0) as max_rent
           FROM properties
           WHERE transaction_type = 'rental' AND price > 0
           GROUP BY region, property_type ORDER BY region, property_type`,
        )).rows;

    // 3. Sale Prices (for returns calculation)
    const saleRows = region
      ? (await pool.query(
          `SELECT region, property_type, COUNT(*) as listing_count,
           ROUND(AVG(price)::numeric, 0) as avg_price,
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price)::numeric, 0) as median_price
           FROM properties
           WHERE transaction_type = 'sale' AND price > 0 AND LOWER(region) = LOWER($1)
           GROUP BY region, property_type ORDER BY region, property_type`,
          [region],
        )).rows
      : (await pool.query(
          `SELECT region, property_type, COUNT(*) as listing_count,
           ROUND(AVG(price)::numeric, 0) as avg_price,
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price)::numeric, 0) as median_price
           FROM properties
           WHERE transaction_type = 'sale' AND price > 0
           GROUP BY region, property_type ORDER BY region, property_type`,
        )).rows;

    // 4. Compute NOI and Returns
    // NOI = Annual Rent (assume monthly rent * 12, minus ~30% operating expenses)
    const operatingExpenseRatio = 0.30;
    const noiByRegionType = rentalRows.map((r: any) => {
      const annualRent = parseFloat(r.avg_rent) * 12;
      const noi = annualRent * (1 - operatingExpenseRatio);
      return {
        region: r.region,
        property_type: r.property_type,
        listing_count: parseInt(r.listing_count),
        avg_monthly_rent: parseFloat(r.avg_rent),
        median_monthly_rent: parseFloat(r.median_rent),
        annual_gross_income: annualRent,
        estimated_noi: Math.round(noi),
        operating_expense_ratio: operatingExpenseRatio,
      };
    });

    // 5. Gross Rental Yield = (Annual Rent / Sale Price) * 100
    const yields: any[] = [];
    for (const rental of rentalRows) {
      const sale = saleRows.find(
        (s: any) => s.region === rental.region && s.property_type === rental.property_type,
      );
      if (sale && parseFloat(sale.avg_price) > 0) {
        const annualRent = parseFloat(rental.avg_rent) * 12;
        const grossYield = (annualRent / parseFloat(sale.avg_price)) * 100;
        const netYield = ((annualRent * (1 - operatingExpenseRatio)) / parseFloat(sale.avg_price)) * 100;
        yields.push({
          region: rental.region,
          property_type: rental.property_type,
          avg_monthly_rent: parseFloat(rental.avg_rent),
          avg_sale_price: parseFloat(sale.avg_price),
          gross_rental_yield: parseFloat(grossYield.toFixed(2)),
          net_rental_yield: parseFloat(netYield.toFixed(2)),
          rental_listings: parseInt(rental.listing_count),
          sale_listings: parseInt(sale.listing_count),
        });
      }
    }

    // 6. Aggregate KPIs
    const totalRentalListings = rentalRows.reduce((s: number, r: any) => s + parseInt(r.listing_count), 0);
    const totalSaleListings = saleRows.reduce((s: number, r: any) => s + parseInt(r.listing_count), 0);
    const overallAvgRent = rentalRows.length
      ? rentalRows.reduce((s: number, r: any) => s + parseFloat(r.avg_rent) * parseInt(r.listing_count), 0) / totalRentalListings
      : 0;
    const overallAvgCapRate = capRates.length
      ? capRates.reduce((s: number, r: any) => s + r.cap_rate_mean, 0) / capRates.length
      : 0;
    const overallAvgNoi = noiByRegionType.length
      ? noiByRegionType.reduce((s: number, r: any) => s + r.estimated_noi * r.listing_count, 0) / totalRentalListings
      : 0;
    const overallGrossYield = yields.length
      ? yields.reduce((s: number, r: any) => s + r.gross_rental_yield, 0) / yields.length
      : 0;

    res.json({
      success: true,
      data: {
        kpis: {
          avg_cap_rate: parseFloat((overallAvgCapRate * 100).toFixed(2)),
          avg_monthly_rent: Math.round(overallAvgRent),
          avg_annual_noi: Math.round(overallAvgNoi),
          avg_gross_yield: parseFloat(overallGrossYield.toFixed(2)),
          total_rental_properties: totalRentalListings,
          total_sale_properties: totalSaleListings,
        },
        cap_rates: capRates,
        rental_summary: rentalRows,
        noi_breakdown: noiByRegionType,
        yields,
        sale_summary: saleRows,
      },
    });
  }),
);

export default router;
