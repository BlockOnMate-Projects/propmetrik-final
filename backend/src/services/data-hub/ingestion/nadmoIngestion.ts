/**
 * NADMO Ingestion Service
 * 
 * Handles the ingestion of flood data from NADMO reports and external sources.
 * Supports CSV parsing and normalization of disaster records.
 */

import { floodRiskService } from '../../risk/floodRiskService';
import { logger } from '../../../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as csv from 'fast-csv';

interface NadmoRecord {
    Date: string;
    Location: string;
    Neighborhood: string;
    Region: string;
    Description: string;
    Severity: string;  // Minor, Moderate, Major, Catastrophic
    Latitude?: string;
    Longitude?: string;
}

export class NadmoIngestionService {

    /**
     * Import NADMO flood incidents from a CSV file
     * Expected columns: Date, Location, Neighborhood, Region, Description, Severity, Latitude, Longitude
     */
    async importFromCsv(filePath: string): Promise<{ success: number; failed: number; errors: any[] }> {
        logger.info(`Starting NADMO CSV import from ${filePath}`);

        const results: { success: number; failed: number; errors: any[] } = {
            success: 0,
            failed: 0,
            errors: []
        };

        return new Promise((resolve, reject) => {
            const stream = fs.createReadStream(filePath);

            const parser = csv.parseStream(stream, { headers: true, trim: true })
                .on('data', async (row: NadmoRecord) => {
                    // Pause stream to process async
                    parser.pause();

                    try {
                        await this.processRecord(row);
                        results.success++;
                    } catch (error) {
                        results.failed++;
                        results.errors.push({ row, error: error instanceof Error ? error.message : String(error) });
                    } finally {
                        parser.resume();
                    }
                })
                .on('error', (error) => {
                    logger.error('CSV parse error', error);
                    reject(error);
                })
                .on('end', async () => {
                    logger.info(`NADMO import completed. Success: ${results.success}, Failed: ${results.failed}`);
                    // Trigger risk score refresh after batch import
                    if (results.success > 0) {
                        await floodRiskService.refreshRiskScores();
                    }
                    resolve(results);
                });
        });
    }

    /**
     * Process a single NADMO record and save it to the database
     */
    private async processRecord(record: NadmoRecord): Promise<void> {
        // Validate required fields
        if (!record.Date || !record.Description) {
            throw new Error('Missing required fields: Date or Description');
        }

        // Parse coordinates if available
        let lat = 0;
        let lng = 0;

        if (record.Latitude && record.Longitude) {
            lat = parseFloat(record.Latitude);
            lng = parseFloat(record.Longitude);
        } else {
            // TODO: Integrate Geocoding service here if coordinates are missing
            // For now, we skip or throw if no coords (since strict risk mapping needs coords)
            // Alternatively, we could default to neighborhood center if known
            throw new Error('Missing coordinates and geocoding not enabled');
        }

        // Normalize Severity
        const severityMap: Record<string, string> = {
            'minor': 'minor',
            'low': 'minor',
            'moderate': 'moderate',
            'medium': 'moderate',
            'major': 'major',
            'high': 'major',
            'severe': 'major',
            'catastrophic': 'catastrophic',
            'extreme': 'catastrophic'
        };

        const normalizedSeverity = severityMap[record.Severity?.toLowerCase()] || 'moderate';

        // Save to DB via FloodRiskService
        await floodRiskService.reportIncident({
            incident_date: new Date(record.Date).toISOString(),
            description: record.Description,
            severity: normalizedSeverity,
            latitude: lat,
            longitude: lng,
            neighborhood: record.Neighborhood,
            city: record.Location || 'Accra', // Default to Accra/Location column often holds City
            source: 'NADMO_IMPORT'
        });
    }
}

export const nadmoIngestionService = new NadmoIngestionService();
