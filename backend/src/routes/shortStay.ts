/**
 * Short-Stay Metrics API Routes
 * 
 * AirDNA-style endpoints for short-term rental market analytics
 */

import { Router } from 'express';
import { shortStayMetricsService } from '../../shared-services/analytics/shortStayMetricsService';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/v1/short-stay/metrics
 * Get short-stay rental metrics (occupancy, ADR, RevPAR)
 */
router.get('/metrics', async (req, res) => {
    try {
        const {
            neighborhood,
            city = 'Accra',
            platform = 'all',
            property_type = 'all',
            start_month,
            end_month,
            limit = '12',
        } = req.query;

        const metrics = await shortStayMetricsService.getMetrics({
            neighborhood: neighborhood as string,
            city: city as string,
            platform: platform as any,
            property_type: property_type as any,
            start_month: start_month as string,
            end_month: end_month as string,
            limit: parseInt(limit as string),
        });

        res.json({
            success: true,
            data: metrics,
        });
    } catch (error) {
        logger.error('Failed to get short-stay metrics', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve short-stay metrics',
        });
    }
});

/**
 * GET /api/v1/short-stay/benchmarks
 * Get neighborhood benchmarks for current month
 */
router.get('/benchmarks', async (req, res) => {
    try {
        const { city = 'Accra' } = req.query;

        const benchmarks = await shortStayMetricsService.getNeighborhoodBenchmarks(
            city as string
        );

        res.json({
            success: true,
            data: benchmarks,
        });
    } catch (error) {
        logger.error('Failed to get neighborhood benchmarks', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve neighborhood benchmarks',
        });
    }
});

/**
 * GET /api/v1/short-stay/trends/:neighborhood
 * Get occupancy trends for a specific neighborhood
 */
router.get('/trends/:neighborhood', async (req, res) => {
    try {
        const { neighborhood } = req.params;
        const { months = '12' } = req.query;

        const trends = await shortStayMetricsService.getOccupancyTrends({
            neighborhood,
            months: parseInt(months as string),
        });

        res.json({
            success: true,
            data: trends,
        });
    } catch (error) {
        logger.error('Failed to get occupancy trends', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve occupancy trends',
        });
    }
});

/**
 * GET /api/v1/short-stay/competitive-analysis/:platform/:listing_id
 * Compare a listing against neighborhood averages
 */
router.get('/competitive-analysis/:platform/:listing_id', async (req, res) => {
    try {
        const { platform, listing_id } = req.params;

        const analysis = await shortStayMetricsService.getCompetitiveSetAnalysis({
            listing_id,
            platform,
        });

        if (!analysis) {
            return res.status(404).json({
                success: false,
                error: 'Listing not found',
            });
        }

        res.json({
            success: true,
            data: analysis,
        });
    } catch (error) {
        logger.error('Failed to get competitive analysis', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve competitive analysis',
        });
    }
});

/**
 * GET /api/v1/short-stay/investment-opportunities
 * Get neighborhoods with high investment potential
 */
router.get('/investment-opportunities', async (req, res) => {
    try {
        const { city = 'Accra' } = req.query;

        const opportunities = await shortStayMetricsService.getInvestmentOpportunities(
            city as string
        );

        res.json({
            success: true,
            data: opportunities,
        });
    } catch (error) {
        logger.error('Failed to get investment opportunities', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve investment opportunities',
        });
    }
});

/**
 * POST /api/v1/short-stay/refresh-metrics
 * Refresh short-stay metrics materialized view
 */
router.post('/refresh-metrics', async (req, res) => {
    try {
        await shortStayMetricsService.refreshMetrics();

        res.json({
            success: true,
            message: 'Short-stay metrics refreshed successfully',
        });
    } catch (error) {
        logger.error('Failed to refresh metrics', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to refresh short-stay metrics',
        });
    }
});

export default router;
