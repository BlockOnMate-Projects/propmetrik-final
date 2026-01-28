/**
 * Compliance Reports Module - Type Definitions
 * 
 * Phase 3.9: Split complianceReportService (1201 lines)
 * 
 * Types for compliance report generation:
 * - Report data structures
 * - PDF styling constants
 * - Signing interfaces
 * 
 * @module services/project-management/compliance-reports/types
 */

import { rgb } from 'pdf-lib';

// =============================================================================
// CORE INTERFACES
// =============================================================================

export interface ComplianceScore {
  overall: number;
  permits: number;
  inspections: number;
  documentation: number;
  regulatory: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface ProjectPermit {
  id: string;
  projectId: string;
  permitType: string;
  permitNumber?: string;
  issuingAuthority: string;
  status: 'pending' | 'submitted' | 'approved' | 'rejected' | 'expired';
  applicationDate?: string;
  issueDate?: string;
  expiryDate?: string;
  conditions?: string[];
  documents?: string[];
}

export interface PermitInspection {
  id: string;
  permitId: string;
  inspectionType: string;
  scheduledDate?: string;
  actualDate?: string;
  inspector?: string;
  result?: 'pass' | 'fail' | 'conditional' | 'pending';
  findings?: string;
  correctiveActions?: string[];
}

export interface ComplianceReportData {
  project: {
    id: string;
    name: string;
    location: string;
    projectType: string;
    startDate?: string;
    expectedCompletion?: string;
    organizationName?: string;
  };
  score: ComplianceScore | null;
  permits: ProjectPermit[];
  inspections: PermitInspection[];
  expiringSoon: ProjectPermit[];
  regulatoryAuthorities: RegulatoryAuthority[];
  generatedAt: string;
  generatedBy: string;
}

export interface RegulatoryAuthority {
  id: string;
  name: string;
  department?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  jurisdiction?: string;
}

// =============================================================================
// INPUT INTERFACES
// =============================================================================

export interface GenerateReportInput {
  projectId: string;
  generatedBy: string;
  organizationId: string;
  includeInspections?: boolean;
  includeTimeline?: boolean;
  includeRecommendations?: boolean;
  forSigning?: boolean;
  signees?: SigneeInput[];
}

export interface SigneeInput {
  signeeType: 'internal' | 'external';
  userId?: string;
  name?: string;
  email?: string;
  role?: string;
}

export interface ComplianceReportResult {
  reportId: string;
  pdfUrl: string;
  pdfBuffer: Buffer;
  signingRequestId?: string;
}

// =============================================================================
// REPORT RECORD
// =============================================================================

export interface ComplianceReport {
  id: string;
  projectId: string;
  organizationId: string;
  reportType: 'compliance' | 'inspection' | 'permit_status' | 'full_audit';
  title: string;
  pdfUrl: string;
  signingRequestId?: string;
  status: 'draft' | 'generated' | 'pending_signatures' | 'signed' | 'archived';
  score?: number;
  generatedBy: string;
  generatedByName?: string;
  generatedAt: string;
  signedAt?: string;
  expiresAt?: string;
  metadata?: Record<string, any>;
}

// =============================================================================
// PDF STYLING
// =============================================================================

export const PDF_COLORS = {
  primary: rgb(0.09, 0.45, 0.67),      // PropMetrik blue
  secondary: rgb(0.8, 0.6, 0.2),        // Ghana gold
  success: rgb(0.16, 0.65, 0.31),
  warning: rgb(0.85, 0.65, 0.13),
  danger: rgb(0.86, 0.21, 0.27),
  text: rgb(0.1, 0.1, 0.1),
  textLight: rgb(0.4, 0.4, 0.4),
  border: rgb(0.8, 0.8, 0.8),
  background: rgb(0.97, 0.97, 0.97),
};

export const PDF_MARGINS = {
  top: 60,
  bottom: 60,
  left: 50,
  right: 50,
};

export const PAGE_SIZE = {
  width: 595.28,  // A4
  height: 841.89,
};

// =============================================================================
// FILTER INTERFACES
// =============================================================================

export interface ReportFilters {
  projectId?: string;
  organizationId?: string;
  reportType?: string;
  status?: string;
  generatedBy?: string;
  dateFrom?: string;
  dateTo?: string;
}
