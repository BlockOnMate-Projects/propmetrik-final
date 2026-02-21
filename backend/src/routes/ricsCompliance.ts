/**
 * RICS Compliance API Routes
 * 
 * Endpoints for valuation report compliance analysis
 */

import { Router } from 'express';
import { ricsComplianceService } from '../../shared-services/compliance/ricsComplianceService';
import { logger } from '../utils/logger';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Configure multer for PDF uploads
const upload = multer({
    dest: path.join(__dirname, '../../uploads/compliance'),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    },
});

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../uploads/compliance');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * POST /api/v1/rics-compliance/analyze
 * Analyze a PDF valuation report for RICS compliance
 */
router.post('/analyze', upload.single('report'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No PDF file uploaded',
            });
        }

        const { valuation_report_id } = req.body;

        const result = await ricsComplianceService.analyzeReport({
            file_path: req.file.path,
            file_url: req.file.filename,
            valuation_report_id,
        });

        // Clean up uploaded file after analysis
        try {
            fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
            logger.warn('Failed to delete temp file', { path: req.file.path });
        }

        res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        logger.error('Failed to analyze RICS compliance', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to analyze RICS compliance',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * GET /api/v1/rics-compliance/report/:valuation_report_id
 * Get compliance analysis for a specific valuation report
 */
router.get('/report/:valuation_report_id', async (req, res) => {
    try {
        const { valuation_report_id } = req.params;

        const result = await ricsComplianceService.getComplianceData(valuation_report_id);

        if (!result) {
            return res.status(404).json({
                success: false,
                error: 'Compliance analysis not found',
            });
        }

        res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        logger.error('Failed to get compliance data', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve compliance data',
        });
    }
});

/**
 * GET /api/v1/rics-compliance/reports
 * Get all compliance reports with filters
 */
router.get('/reports', async (req, res) => {
    try {
        const { compliance_status, min_score, limit = '100', offset = '0' } = req.query;

        const result = await ricsComplianceService.getComplianceReports({
            compliance_status: compliance_status as string,
            min_score: min_score ? parseFloat(min_score as string) : undefined,
            limit: parseInt(limit as string),
            offset: parseInt(offset as string),
        });

        res.json({
            success: true,
            data: result.data,
            pagination: {
                total: result.total,
                limit: parseInt(limit as string),
                offset: parseInt(offset as string),
            },
        });
    } catch (error) {
        logger.error('Failed to get compliance reports', { error });
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve compliance reports',
        });
    }
});

export default router;
