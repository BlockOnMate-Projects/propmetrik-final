/**
 * RICS Compliance PDF Parsing Service
 * 
 * Analyzes valuation reports for RICS/IVS compliance.
 * Extracts mandatory disclosures and VPS adherence.
 * 
 * Uses Azure Document Intelligence (Form Recognizer) or Google Document AI
 */

import { query } from '../../database';
import { logger } from '../../utils/logger';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

interface RICSComplianceResult {
    id: string;
    valuation_report_id: string | null;
    document_url: string;
    document_name: string;
    compliance_status: 'pending' | 'compliant' | 'non_compliant' | 'partial_compliant' | 'failed_analysis';
    compliance_score: number;
    vps_compliance: {
        vps1_terms_of_engagement: boolean;
        vps2_inspections_investigations: boolean;
        vps3_reporting: boolean;
        vps4_bases_of_value: boolean;
        vps5_valuation_approaches: boolean;
    };
    disclosures: {
        has_special_assumptions: boolean;
        special_assumptions_text?: string;
        has_conflict_of_interest_declaration: boolean;
        conflict_declaration_text?: string;
        has_liability_cap: boolean;
        liability_cap_text?: string;
        has_valuer_accreditation: boolean;
        valuer_accreditation_details?: string;
        has_limitations_on_use: boolean;
        limitations_text?: string;
    };
    missing_disclosures: string[];
    document_quality_score: number;
    ocr_confidence: number;
}

interface DocumentIntelligenceConfig {
    endpoint: string;
    apiKey: string;
    modelId?: string;
}

export class RICSComplianceService {
    private azureConfig: DocumentIntelligenceConfig | null = null;

    constructor() {
        // Initialize Azure Document Intelligence config
        const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
        const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

        if (endpoint && apiKey) {
            this.azureConfig = {
                endpoint,
                apiKey,
                modelId: process.env.AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID || 'prebuilt-document',
            };
            logger.info('Azure Document Intelligence configured');
        } else {
            logger.warn('Azure Document Intelligence not configured - RICS compliance analysis unavailable');
        }
    }

    /**
     * Analyze a PDF valuation report for RICS compliance
     */
    async analyzeReport(params: {
        file_path: string;
        file_url?: string;
        valuation_report_id?: string;
    }): Promise<RICSComplianceResult> {
        const { file_path, file_url, valuation_report_id } = params;

        try {
            logger.info('Starting RICS compliance analysis', { file_path, valuation_report_id });

            // Extract text from PDF using Document Intelligence
            const extractedText = await this.extractTextFromPDF(file_path);

            if (!extractedText || extractedText.length < 100) {
                throw new Error('Failed to extract meaningful text from PDF');
            }

            // Analyze compliance
            const analysis = this.analyzeComplianceFromText(extractedText);

            // Calculate compliance score
            const complianceScore = this.calculateComplianceScore(analysis);

            // Determine compliance status
            let complianceStatus: RICSComplianceResult['compliance_status'] = 'non_compliant';
            if (complianceScore >= 90) {
                complianceStatus = 'compliant';
            } else if (complianceScore >= 60) {
                complianceStatus = 'partial_compliant';
            }

            // Save to database
            const result = await this.saveComplianceData({
                valuation_report_id,
                document_url: file_url || file_path,
                document_name: file_path.split('/').pop() || 'unknown.pdf',
                compliance_status: complianceStatus,
                compliance_score: complianceScore,
                ...analysis,
            });

            logger.info('RICS compliance analysis completed', {
                id: result.id,
                compliance_score: complianceScore,
                status: complianceStatus,
            });

            return result;
        } catch (error) {
            logger.error('Failed to analyze RICS compliance', { error, file_path });
            throw error;
        }
    }

    /**
     * Extract text from PDF using Azure Document Intelligence
     */
    private async extractTextFromPDF(filePath: string): Promise<string> {
        if (!this.azureConfig) {
            throw new Error('Azure Document Intelligence not configured');
        }

        try {
            // Read the PDF file
            const fileBuffer = fs.readFileSync(filePath);

            // Call Azure Document Intelligence API
            const analyzeUrl = `${this.azureConfig.endpoint}/formrecognizer/documentModels/${this.azureConfig.modelId}:analyze?api-version=2023-07-31`;

            // Start analysis
            const analyzeResponse = await axios.post(analyzeUrl, fileBuffer, {
                headers: {
                    'Content-Type': 'application/pdf',
                    'Ocp-Apim-Subscription-Key': this.azureConfig.apiKey,
                },
            });

            const operationLocation = analyzeResponse.headers['operation-location'];
            if (!operationLocation) {
                throw new Error('No operation location returned from Document Intelligence');
            }

            // Poll for results
            let analysisResult: any;
            let attempts = 0;
            const maxAttempts = 30; // 30 seconds timeout

            while (attempts < maxAttempts) {
                await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second

                const resultResponse = await axios.get(operationLocation, {
                    headers: {
                        'Ocp-Apim-Subscription-Key': this.azureConfig.apiKey,
                    },
                });

                if (resultResponse.data.status === 'succeeded') {
                    analysisResult = resultResponse.data.analyzeResult;
                    break;
                } else if (resultResponse.data.status === 'failed') {
                    throw new Error('Document Intelligence analysis failed');
                }

                attempts++;
            }

            if (!analysisResult) {
                throw new Error('Document Intelligence analysis timed out');
            }

            // Extract text content
            const extractedText = analysisResult.content || '';
            const ocrConfidence = analysisResult.paragraphs?.reduce(
                (sum: number, p: any) => sum + (p.confidence || 0),
                0
            ) / (analysisResult.paragraphs?.length || 1);

            logger.info('PDF text extracted successfully', {
                textLength: extractedText.length,
                ocrConfidence: ocrConfidence.toFixed(2),
            });

            return extractedText;
        } catch (error) {
            logger.error('Failed to extract text from PDF', { error, filePath });
            throw error;
        }
    }

    /**
     * Analyze RICS compliance from extracted text
     */
    private analyzeComplianceFromText(text: string): {
        vps_compliance: RICSComplianceResult['vps_compliance'];
        disclosures: RICSComplianceResult['disclosures'];
        missing_disclosures: string[];
        document_quality_score: number;
        ocr_confidence: number;
    } {
        const textLower = text.toLowerCase();

        // VPS compliance checks
        const vps_compliance = {
            vps1_terms_of_engagement: this.checkVPS1(textLower),
            vps2_inspections_investigations: this.checkVPS2(textLower),
            vps3_reporting: this.checkVPS3(textLower),
            vps4_bases_of_value: this.checkVPS4(textLower),
            vps5_valuation_approaches: this.checkVPS5(textLower),
        };

        // Mandatory disclosures
        const disclosures: RICSComplianceResult['disclosures'] = {
            has_special_assumptions: /special\s+assumption/i.test(text),
            special_assumptions_text: this.extractSection(text, /special\s+assumption/i),
            has_conflict_of_interest_declaration: /conflict\s+of\s+interest/i.test(text) || /no\s+conflict/i.test(text),
            conflict_declaration_text: this.extractSection(text, /conflict\s+of\s+interest/i),
            has_liability_cap: /liability\s+cap/i.test(text) || /limitation\s+of\s+liability/i.test(text),
            liability_cap_text: this.extractSection(text, /liability\s+cap|limitation\s+of\s+liability/i),
            has_valuer_accreditation: /rics|mrics|frics|chartered\s+surveyor/i.test(text),
            valuer_accreditation_details: this.extractSection(text, /rics|mrics|frics|accreditation/i),
            has_limitations_on_use: /limitation\s+on\s+use|purpose\s+of\s+valuation/i.test(text),
            limitations_text: this.extractSection(text, /limitation\s+on\s+use|purpose\s+of\s+valuation/i),
        };

        // Identify missing disclosures
        const missing_disclosures: string[] = [];
        if (!disclosures.has_conflict_of_interest_declaration) {
            missing_disclosures.push('Conflict of Interest Declaration');
        }
        if (!disclosures.has_valuer_accreditation) {
            missing_disclosures.push('Valuer Accreditation');
        }
        if (!disclosures.has_limitations_on_use) {
            missing_disclosures.push('Limitations on Use / Purpose Statement');
        }

        // Document quality score (based on completeness)
        const totalChecks = 5 + Object.keys(disclosures).length; // VPS + disclosures
        const passedChecks =
            Object.values(vps_compliance).filter((v) => v).length +
            Object.values(disclosures).filter((v) => v === true).length;
        const document_quality_score = (passedChecks / totalChecks) * 100;

        return {
            vps_compliance,
            disclosures,
            missing_disclosures,
            document_quality_score,
            ocr_confidence: 85, // Placeholder - would come from Document Intelligence
        };
    }

    /**
     * VPS compliance check methods
     */
    private checkVPS1(text: string): boolean {
        // VPS 1: Terms of Engagement
        return /terms\s+of\s+engagement/i.test(text) || /scope\s+of\s+work/i.test(text);
    }

    private checkVPS2(text: string): boolean {
        // VPS 2: Inspections and Investigations
        return /inspection/i.test(text) && (/site\s+visit/i.test(text) || /visual\s+inspection/i.test(text));
    }

    private checkVPS3(text: string): boolean {
        // VPS 3: Reporting
        return /valuation\s+report/i.test(text) || /market\s+value/i.test(text);
    }

    private checkVPS4(text: string): boolean {
        // VPS 4: Bases of Value
        return /market\s+value|fair\s+value|investment\s+value/i.test(text);
    }

    private checkVPS5(text: string): boolean {
        // VPS 5: Valuation Approaches
        return /comparative\s+method|income\s+approach|cost\s+approach/i.test(text) || /valuation\s+method/i.test(text);
    }

    /**
     * Extract a section of text around a keyword
     */
    private extractSection(text: string, regex: RegExp): string | undefined {
        const match = text.match(regex);
        if (!match) return undefined;

        const index = match.index || 0;
        const start = Math.max(0, index - 100);
        const end = Math.min(text.length, index + 300);

        return text.substring(start, end).trim();
    }

    /**
     * Calculate overall compliance score
     */
    private calculateComplianceScore(analysis: ReturnType<typeof this.analyzeComplianceFromText>): number {
        const vpsScore = (Object.values(analysis.vps_compliance).filter((v) => v).length / 5) * 50; // 50% weight
        const disclosureScore =
            (Object.values(analysis.disclosures).filter((v) => v === true).length /
                Object.keys(analysis.disclosures).length) *
            50; // 50% weight

        return Math.round(vpsScore + disclosureScore);
    }

    /**
     * Save compliance data to database
     */
    private async saveComplianceData(data: {
        valuation_report_id?: string;
        document_url: string;
        document_name: string;
        compliance_status: string;
        compliance_score: number;
        vps_compliance: any;
        disclosures: any;
        missing_disclosures: string[];
        document_quality_score: number;
        ocr_confidence: number;
    }): Promise<RICSComplianceResult> {
        const sql = `
      INSERT INTO rics_compliance_data (
        valuation_report_id,
        document_url,
        document_name,
        compliance_status,
        compliance_score,
        vps1_terms_of_engagement,
        vps2_inspections_investigations,
        vps3_reporting,
        vps4_bases_of_value,
        vps5_valuation_approaches,
        has_special_assumptions,
        special_assumptions_text,
        has_conflict_of_interest_declaration,
        conflict_declaration_text,
        has_liability_cap,
        liability_cap_text,
        has_valuer_accreditation,
        valuer_accreditation_details,
        has_limitations_on_use,
        limitations_text,
        missing_disclosures,
        document_quality_score,
        ocr_confidence
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
      ) RETURNING *
    `;

        const result = await query<RICSComplianceResult>(sql, [
            data.valuation_report_id || null,
            data.document_url,
            data.document_name,
            data.compliance_status,
            data.compliance_score,
            data.vps_compliance.vps1_terms_of_engagement,
            data.vps_compliance.vps2_inspections_investigations,
            data.vps_compliance.vps3_reporting,
            data.vps_compliance.vps4_bases_of_value,
            data.vps_compliance.vps5_valuation_approaches,
            data.disclosures.has_special_assumptions,
            data.disclosures.special_assumptions_text,
            data.disclosures.has_conflict_of_interest_declaration,
            data.disclosures.conflict_declaration_text,
            data.disclosures.has_liability_cap,
            data.disclosures.liability_cap_text,
            data.disclosures.has_valuer_accreditation,
            data.disclosures.valuer_accreditation_details,
            data.disclosures.has_limitations_on_use,
            data.disclosures.limitations_text,
            data.missing_disclosures,
            data.document_quality_score,
            data.ocr_confidence,
        ]);

        return result.rows[0];
    }

    /**
     * Get compliance analysis for a report
     */
    async getComplianceData(valuation_report_id: string): Promise<RICSComplianceResult | null> {
        const sql = `
      SELECT * FROM rics_compliance_data
      WHERE valuation_report_id = $1
      ORDER BY analyzed_at DESC
      LIMIT 1
    `;

        const result = await query<RICSComplianceResult>(sql, [valuation_report_id]);
        return result.rows[0] || null;
    }

    /**
     * Get all compliance reports with filters
     */
    async getComplianceReports(params: {
        compliance_status?: string;
        min_score?: number;
        limit?: number;
        offset?: number;
    }): Promise<{ data: RICSComplianceResult[]; total: number }> {
        const { compliance_status, min_score, limit = 100, offset = 0 } = params;

        const whereConditions: string[] = [];
        const queryParams: any[] = [];
        let paramIndex = 1;

        if (compliance_status) {
            whereConditions.push(`compliance_status = $${paramIndex++}`);
            queryParams.push(compliance_status);
        }

        if (min_score !== undefined) {
            whereConditions.push(`compliance_score >= $${paramIndex++}`);
            queryParams.push(min_score);
        }

        const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

        // Get total count
        const countSql = `SELECT COUNT(*) as total FROM rics_compliance_data ${whereClause}`;
        const countResult = await query(countSql, queryParams);
        const total = parseInt(countResult.rows[0].total);

        // Get data
        queryParams.push(limit, offset);
        const dataSql = `
      SELECT * FROM rics_compliance_data
      ${whereClause}
      ORDER BY analyzed_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `;

        const dataResult = await query<RICSComplianceResult>(dataSql, queryParams);

        return {
            data: dataResult.rows,
            total,
        };
    }
}

export const ricsComplianceService = new RICSComplianceService();
