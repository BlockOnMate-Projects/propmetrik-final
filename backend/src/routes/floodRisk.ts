/**
 * Flood Risk API Routes
 * 
 * Endpoints for flood risk assessment and incident reporting.
 */

import { Router } from 'express';
import { floodRiskService } from '../../shared-services/risk/floodRiskService';
import { nadmoIngestionService } from '../services/data-hub/ingestion/nadmoIngestion';
import { logger } from '../utils/logger';
import { scanUploadedFile } from '../middleware/virusScan';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Configure upload for NADMO reports
const upload = multer({
    dest: path.join(__dirname, '../../uploads/nadmo'),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel') {
            cb(null, true);
        } else {
            cb(new Error('Only CSV/Excel files are allowed'));
        }
    }
});

// Ensure upload dir exists
const uploadDir = path.join(__dirname, '../../uploads/nadmo');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * GET /api/v1/flood-risk/score
 * Get flood risk score for a specific location
 * Query params: lat, lng, radius (optional)
 */
router.get('/score', async (req, res) => {
    try {
        const { lat, lng, radius } = req.query;

        if (!lat || !lng) {
            return res.status(400).json({
                success: false,
                error: 'Latitude and Longitude are required'
            });
        }

        const result = await floodRiskService.assessPropertyRisk({
            latitude: parseFloat(lat as string),
            longitude: parseFloat(lng as string),
            radius_meters: radius ? parseInt(radius as string) : 500
        });

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Failed to get flood risk score', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve flood risk score'
        });
    }
});

/**
 * GET /api/v1/flood-risk/incidents
 * Get historical flood incidents
 * Query params: city, severity, start_date, limit
 */
router.get('/incidents', async (req, res) => {
    try {
        const { city, severity, start_date, limit } = req.query;

        const incidents = await floodRiskService.getIncidents({
            city: city as string,
            severity: severity as string,
            start_date: start_date as string,
            limit: limit ? parseInt(limit as string) : 100
        });

        res.json({
            success: true,
            data: incidents
        });
    } catch (error) {
        logger.error('Failed to get flood incidents', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve flood incidents'
        });
    }
});

/**
 * POST /api/v1/flood-risk/report
 * Report a new flood incident
 */
router.post('/report', async (req, res) => {
    try {
        const { incident_date, description, severity, latitude, longitude, neighborhood, city } = req.body;

        // Basic validation
        if (!incident_date || !description || !latitude || !longitude) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        const id = await floodRiskService.reportIncident({
            incident_date,
            description,
            severity: severity || 'moderate',
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            neighborhood,
            city,
            source: 'user_report'
        });

        res.json({
            success: true,
            data: { id, message: 'Incident reported successfully' }
        });
    } catch (error) {
        logger.error('Failed to report flood incident', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to report incident'
        });
    }
});

/**
 * POST /api/v1/flood-risk/ingest/nadmo
 * Upload NADMO CSV report
 */
router.post('/ingest/nadmo', upload.single('report'), scanUploadedFile, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }

        const result = await nadmoIngestionService.importFromCsv(req.file.path);

        // Cleanup
        try {
            fs.unlinkSync(req.file.path);
        } catch (e) {
            logger.warn('Failed to cleanup temp file', { path: req.file.path });
        }

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        logger.error('Failed to ingest NADMO report', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to process NADMO report'
        });
    }
});

export default router;
