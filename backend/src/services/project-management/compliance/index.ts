/**
 * Compliance Services Module
 * 
 * Ghana-specific regulatory compliance:
 * - GhanaComplianceService: EPA, Lands Commission, GRA, SSNIT, etc.
 * 
 * @module services/project-management/compliance
 */

export {
  ghanaComplianceService,
  GhanaRegulatoryBody,
  PermitType,
  ComplianceRequirement,
  CreateComplianceRequirementInput,
  UpdateComplianceRequirementInput,
  ComplianceSummary,
  TINValidationResult,
  SSNITEmployerInfo,
} from './GhanaComplianceService';
