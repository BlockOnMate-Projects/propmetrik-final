/**
 * Valuation Engine - Service Exports
 * 
 * Central export point for all valuation engine services.
 * 
 * ARCHITECTURE (Hybrid TypeScript + Python):
 *   TypeScript (Orchestration):
 *     - valuationEngineService - Main orchestrator, workflow coordination
 *     - valuationReportService - PDF/report generation
 *     - floorPlanService - Floor plan data management
 *     - hbuAnalysisService - Highest & Best Use analysis
 *     - overrideTrackingService - Manual override tracking
 *     - contributionWorkflowService - Gap detection and contributions
 * 
 *   Python (Calculations) - via pythonClient:
 *     - Sales Comparison Method
 *     - Cost Approach Method
 *     - Income Approach Method
 *     - Residual Method
 *     - Profits Method
 *     - DRC Method
 *     - Confidence Scoring
 *     - Sensitivity Analysis
 *     - Reconciliation
 *     - Market Data
 * 
 * @module valuation-engine
 */

// =====================================================
// CORE SERVICES
// =====================================================

// Main orchestrator (routes valuation method calls to Python)
export { valuationEngineService, default as valuationEngine } from './valuationEngineService';

// Python client for valuation method calculations
export {
  PythonClient,
  pythonClient,
  type PythonPropertyInput,
  type ValuationMethodRequest,
  type ValuationMethodResponse,
  type MultiMethodRequest,
  type MultiMethodResponse,
  type ReconciliationRequest,
  type ReconciliationResponse,
  type SensitivityRequest,
  type SensitivityResponse,
  type ConfidenceRequest,
  type ConfidenceResponse,
  type MarketConditionsRequest,
  type MarketConditionsResponse,
} from './pythonClient';

// Report generation (TypeScript)
export { valuationReportService } from './valuationReportService';

// Report management (Phase 1 API)
export {
  ReportService,
  reportService,
  type ReportStatus,
  type ReportTemplate,
  type PhotoCategory,
  type AuditAction,
  type ReportOptions,
  type CreateReportInput,
  type UpdateReportInput,
  type ValuationReport,
  type ReportPhoto,
  type ReportWithValuer,
  type ReportListFilters,
  type PaginatedReports,
} from './reportService';

// Report data collection (Phase 2)
export {
  reportDataService,
  type ReportCoverData,
  type ReportTransmittalData,
  type ReportCertificationData,
  type ReportDisclaimersData,
  type PropertyLegalData,
  type PropertyConstructionData,
  type PropertyExternalsData,
  type PropertyRiskAssessmentData,
  type InspectionData,
  type EngagementData,
} from './reportDataService';

// Document generation (Phase 2 - DOCX)
export {
  docGenerationService,
  type DocxGenerationOptions,
  type GeneratedReport,
  type ReportSectionData,
} from './docGenerationService';

// =====================================================
// DOCUMENT SERVICES (Phase 3 & 4)
// Moved from /services/document for consolidation
// =====================================================

// Image processing (Phase 3)
export {
  imageProcessingService,
  type ProcessedImage,
  type ImageMetadata
} from './imageProcessingService';

// Approval workflow (Phase 4)
export {
  approvalService,
  type ApprovalRequest,
  type ApprovalResult,
  type Valuer,
  type ValuerCredentials
} from './approvalService';

// PDF generation (Phase 4)
export {
  pdfGenerationService,
  type PdfGenerationOptions,
  type PdfGenerationResult,
  type VerificationData
} from './pdfGenerationService';

// Audit logging (Phase 4)
export {
  auditLogService,
  type AuditLogEntry,
  type AuditLogInput,
  type AuditSummary,
  type PaginatedAuditLog
} from './auditLogService';

// =====================================================
// SUPPORTING SERVICES (TypeScript)
// =====================================================

// Cap rate service for income approach
export {
  CapRateService,
  capRateService,
  type MarketCapRateBenchmark,
  type PropertyCapRateEstimate,
  type CapRateAdjustment,
  type NOICalculation,
  type IncomeApproachInputs,
  type IncomeApproachResult,
  type ListingDerivedCapRate,
  type CapRateMethodology,
} from './CapRateService';

// Contribution workflow
export {
  GapDetectionService,
  ContributionService,
  gapDetectionService,
  contributionService
} from './contributionWorkflowService';

// Gap analysis services
export { floorPlanService } from './floorPlanService';
export { hbuAnalysisService } from './hbuAnalysisService';
export { overrideTrackingService } from './overrideTrackingService';

// =====================================================
// GEOMETRY SERVICES
// =====================================================

export * from './geometry';

// =====================================================
// TYPES
// =====================================================

export * from './types';

// =====================================================
// CONVENIENCE FUNCTIONS
// =====================================================

import { valuationEngineService } from './valuationEngineService';
import { pythonClient } from './pythonClient';
import type { PropertyForValuation, ValuationOptions, ValuationResult, CreateValuationInput } from './types';

/**
 * Create a valuation for a property
 * @param input - The valuation input (property_id and options)
 * @param options - Additional valuation options
 * @returns Valuation result with all method values
 */
export async function createValuation(
  input: CreateValuationInput,
  options: ValuationOptions = {}
): Promise<ValuationResult> {
  return valuationEngineService.createValuation(input, options);
}

/**
 * Create valuation from property object (convenience wrapper)
 * @param property - The property to value
 * @param options - Valuation options
 * @returns Valuation result
 */
export async function createValuationForProperty(
  property: PropertyForValuation,
  options: ValuationOptions = {}
): Promise<ValuationResult> {
  return valuationEngineService.createValuation({
    property_id: property.id,
    valuation_type: options.valuation_type || 'avm',
    valuation_purpose: options.valuation_purpose || 'sale',
  }, options);
}

/**
 * Get a property valuation by ID
 * @param valuationId - The valuation UUID
 * @returns Valuation result or null if not found
 */
export async function getValuation(valuationId: string): Promise<ValuationResult | null> {
  return valuationEngineService.getValuation(valuationId);
}

/**
 * Get valuation history for a property
 * @param propertyId - The property ID
 * @param limit - Maximum number of valuations to return
 * @returns Array of valuation results
 */
export async function getValuationHistory(
  propertyId: string,
  limit: number = 10
): Promise<ValuationResult[]> {
  return valuationEngineService.getValuationHistory(propertyId, limit);
}

/**
 * Get market conditions for a region (via Python service)
 * @param region - Region code
 * @param propertyType - Property type (optional)
 * @returns Market conditions data
 */
export async function getMarketConditions(
  region: string,
  propertyType?: string
) {
  return pythonClient.getMarketConditions({ region, property_type: propertyType });
}

/**
 * Check if Python valuation service is available
 * @returns true if Python service is healthy
 */
export async function isPythonServiceAvailable(): Promise<boolean> {
  return pythonClient.isAvailable();
}
