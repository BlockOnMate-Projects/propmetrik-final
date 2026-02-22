/**
 * Occupancy Calculator Service
 * 
 * Logic for calculating short-stay metrics (Occupancy, ADR, RevPAR)
 * from availability snapshots and pricing data.
 */

import { logger } from '../../src/utils/logger';

interface DailySnapshot {
    date: string;       // YYYY-MM-DD
    is_available: boolean;
    price_usd: number | null;
    status: 'booked' | 'available' | 'blocked';
}

interface MonthlyMetric {
    month: string;      // YYYY-MM
    occupancy_rate: number; // 0-100
    adr_usd: number;    // Average Daily Rate
    revpar_usd: number; // Revenue Per Available Room
    active_listings: number;
}

export class OccupancyCalculator {

    /**
     * Calculate monthly metrics for a single listing based on daily snapshots
     */
    calculateListingMetrics(snapshots: DailySnapshot[]): MonthlyMetric[] {
        const metricsByMonth: Record<string, {
            total_days: number,
            booked_days: number,
            available_days: number,
            total_revenue: number,
            total_rate_sum: number, // Sum of rates for booked days (for ADR)
            revenue_days: number // Days with revenue (booked)
        }> = {};

        // 1. Group snapshots by month
        snapshots.forEach(day => {
            const month = day.date.substring(0, 7); // YYYY-MM

            if (!metricsByMonth[month]) {
                metricsByMonth[month] = {
                    total_days: 0,
                    booked_days: 0,
                    available_days: 0,
                    total_revenue: 0,
                    total_rate_sum: 0,
                    revenue_days: 0
                };
            }

            const m = metricsByMonth[month];
            m.total_days++;

            if (day.status === 'booked' || (!day.is_available && day.status !== 'blocked')) {
                // Assume unavailable means booked for now (naive approach, can be improved with block detection)
                m.booked_days++;

                // For revenue, if we don't have booked price, we use the listing's base price or last seen price
                // Here we assume price_usd is the rate for that day
                if (day.price_usd) {
                    m.total_revenue += day.price_usd;
                    m.total_rate_sum += day.price_usd;
                    m.revenue_days++;
                }
            } else if (day.status === 'available' || day.is_available) {
                m.available_days++;
            }
        });

        // 2. Calculate metrics per month
        const results: MonthlyMetric[] = [];

        Object.entries(metricsByMonth).forEach(([month, data]) => {
            // Occupancy Rate = Booked / (Booked + Available)
            // Exclude blocked days from denominator if possible (here total_days assumes active)
            const denominator = data.booked_days + data.available_days;
            const occupancy_rate = denominator > 0
                ? (data.booked_days / denominator) * 100
                : 0;

            // ADR = Total Revenue / Booked Nights
            const adr_usd = data.revenue_days > 0
                ? data.total_revenue / data.revenue_days
                : 0;

            // RevPAR = ADR * Occupancy Rate (or Total Revenue / Total Available Nights)
            const revpar_usd = (adr_usd * occupancy_rate) / 100;

            results.push({
                month,
                occupancy_rate: parseFloat(occupancy_rate.toFixed(2)),
                adr_usd: parseFloat(adr_usd.toFixed(2)),
                revpar_usd: parseFloat(revpar_usd.toFixed(2)),
                active_listings: 1 // Single listing context
            });
        });

        return results.sort((a, b) => a.month.localeCompare(b.month));
    }

    /**
     * Aggregate metrics across multiple listings (e.g., Neighborhood level)
     */
    aggregateMetrics(listingMetrics: MonthlyMetric[][]): MonthlyMetric[] {
        const aggregated: Record<string, {
            sum_occupancy: number,
            sum_adr: number,
            sum_revpar: number,
            count: number
        }> = {};

        // Flat map all months
        listingMetrics.flat().forEach(m => {
            if (!aggregated[m.month]) {
                aggregated[m.month] = { sum_occupancy: 0, sum_adr: 0, sum_revpar: 0, count: 0 };
            }
            const agg = aggregated[m.month];
            agg.sum_occupancy += m.occupancy_rate;
            agg.sum_adr += m.adr_usd;
            agg.sum_revpar += m.revpar_usd;
            agg.count++;
        });

        // Compute averages
        return Object.entries(aggregated).map(([month, data]) => ({
            month,
            occupancy_rate: parseFloat((data.sum_occupancy / data.count).toFixed(2)),
            adr_usd: parseFloat((data.sum_adr / data.count).toFixed(2)),
            revpar_usd: parseFloat((data.sum_revpar / data.count).toFixed(2)),
            active_listings: data.count
        })).sort((a, b) => a.month.localeCompare(b.month));
    }
}

export const occupancyCalculator = new OccupancyCalculator();
