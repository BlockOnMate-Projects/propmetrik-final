/**
 * Litigation Risk API Routes
 * 
 * Endpoints for accessing litigation/landguard data and risk assessments
 */

import { Router } from 'express';
import { litigationRiskService } from '../../shared-services/risk/litigationRiskService';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/v1/litigation/cases
 * Get litigation cases with filters
 */
router.get('/cases', async (req, res) => {
    try {
        const {
            region,
            city,
            neighborhood,
            status,
            involves_landguard,
            start_date,
            end_date,
            limit = '100',
            offset = '0',
        } = req.query;

        const result = await litigationRiskService.getCases({
            region: region as string,
            city: city as string,
            neighborhood: neighborhood as string,
            status: status as any,
            involves_landguard: involves_landguard === 'true',
            start_date: start_date as string,
            end_date: end_date as string,
            limit: parseInt(limit as string),
            offset: parseInt(offset as string),
        });

        res.json({
            success: true,
            data: result.cases,
            pagination: {
                total: result.total,
                limit: parseInt(limit as string),
                offset: parseInt(offset as string),
            },
        });
    } catch (error) {
        logger.error('Failed to get litigation cases', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve litigation cases',
        });
    }
});

/**
 * GET /api/v1/litigation/hotspots
 * Get litigation hotspots (high-risk neighborhoods)
 */
router.get('/hotspots', async (req, res) => {
    try {
        const { region, city, min_cases = '2' } = req.query;

        const hotspots = await litigationRiskService.getHotspots({
            region: region as string,
            city: city as string,
            min_cases: parseInt(min_cases as string),
        });

        res.json({
            success: true,
            data: hotspots,
        });
    } catch (error) {
        logger.error('Failed to get litigation hotspots', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve litigation hotspots',
        });
    }
});

/**
 * POST /api/v1/litigation/assess-risk
 * Assess litigation risk for a property location
 */
router.post('/assess-risk', async (req, res) => {
    try {
        const { latitude, longitude, radius_km = 2 } = req.body;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                error: 'Latitude and longitude are required',
            });
        }

        const assessment = await litigationRiskService.assessPropertyRisk({
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            radius_km: parseFloat(radius_km),
        });

        res.json({
            success: true,
            data: assessment,
        });
    } catch (error) {
        logger.error('Failed to assess property risk', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to assess property risk',
        });
    }
});

/**
 * GET /api/v1/litigation/trends
 * Get litigation trends over time
 */
router.get('/trends', async (req, res) => {
    try {
        const { region, city, dispute_type, months = '12' } = req.query;

        const trends = await litigationRiskService.getTrends({
            region: region as string,
            city: city as string,
            dispute_type: dispute_type as string,
            months: parseInt(months as string),
        });

        res.json({
            success: true,
            data: trends,
        });
    } catch (error) {
        logger.error('Failed to get litigation trends', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve litigation trends',
        });
    }
});

/**
 * POST /api/v1/litigation/refresh-hotspots
 * Refresh litigation hotspots materialized view
 */
router.post('/refresh-hotspots', async (req, res) => {
    try {
        await litigationRiskService.refreshHotspots();

        res.json({
            success: true,
            message: 'Litigation hotspots refreshed successfully',
        });
    } catch (error) {
        logger.error('Failed to refresh hotspots', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to refresh litigation hotspots',
        });
    }
});

export default router;
