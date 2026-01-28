/**
 * Quality Module - Barrel Export
 * 
 * Phase 3.3: Split qualityChecklistsService
 * 
 * Exports all quality-related services:
 * - ChecklistTemplateService: Template, section, and item management
 * - ChecklistInspectionService: Instance lifecycle and workflow
 * - ChecklistResponseService: Responses, signatures, and deficiencies
 * 
 * @module services/project-management/quality
 */

// Template Management
export {
  checklistTemplateService,
  ChecklistTemplateType,
  ChecklistResponseType,
  TemplateCreateInput,
  TemplateSectionInput,
  TemplateItemInput,
  TemplateFilters,
  ChecklistTemplate,
  TemplateSection,
  TemplateItem,
} from './ChecklistTemplateService';

// Inspection/Instance Management
export {
  checklistInspectionService,
  ChecklistStatus,
  ChecklistItemResult,
  InstanceCreateInput,
  InstanceFilters,
  ChecklistInstance,
} from './ChecklistInspectionService';

// Response and Signature Management
export {
  checklistResponseService,
  ResponseInput,
  ResponseUpdateInput,
  ChecklistResponse,
  SignatureInput,
  ChecklistSignature,
} from './ChecklistResponseService';

// =============================================================================
// FACADE - Backwards Compatibility Layer
// =============================================================================

import { checklistTemplateService } from './ChecklistTemplateService';
import { checklistInspectionService } from './ChecklistInspectionService';
import { checklistResponseService } from './ChecklistResponseService';

/**
 * QualityChecklistsFacade
 * 
 * Provides backwards compatibility with the original qualityChecklistsService.
 * Delegates to the appropriate focused service.
 * 
 * @deprecated Use individual services directly:
 * - checklistTemplateService for templates
 * - checklistInspectionService for instances
 * - checklistResponseService for responses
 */
class QualityChecklistsFacade {
  // Template operations
  getCategories = checklistTemplateService.getCategories.bind(checklistTemplateService);
  createCategory = checklistTemplateService.createCategory.bind(checklistTemplateService);
  createTemplate = checklistTemplateService.createTemplate.bind(checklistTemplateService);
  getTemplateById = checklistTemplateService.getTemplateById.bind(checklistTemplateService);
  getTemplateFull = checklistTemplateService.getTemplateFull.bind(checklistTemplateService);
  getTemplates = checklistTemplateService.getTemplates.bind(checklistTemplateService);
  updateTemplate = checklistTemplateService.updateTemplate.bind(checklistTemplateService);
  publishTemplate = checklistTemplateService.publishTemplate.bind(checklistTemplateService);
  duplicateTemplate = checklistTemplateService.duplicateTemplate.bind(checklistTemplateService);
  deleteTemplate = checklistTemplateService.deleteTemplate.bind(checklistTemplateService);
  
  // Section operations
  addSection = checklistTemplateService.addSection.bind(checklistTemplateService);
  getSections = checklistTemplateService.getSections.bind(checklistTemplateService);
  updateSection = checklistTemplateService.updateSection.bind(checklistTemplateService);
  deleteSection = checklistTemplateService.deleteSection.bind(checklistTemplateService);
  
  // Item operations
  addItem = checklistTemplateService.addItem.bind(checklistTemplateService);
  addItemsBulk = checklistTemplateService.addItemsBulk.bind(checklistTemplateService);
  getItems = checklistTemplateService.getItems.bind(checklistTemplateService);
  updateItem = checklistTemplateService.updateItem.bind(checklistTemplateService);
  deleteItem = checklistTemplateService.deleteItem.bind(checklistTemplateService);
  reorderItems = checklistTemplateService.reorderItems.bind(checklistTemplateService);

  // Instance operations
  createInstance = checklistInspectionService.createInstance.bind(checklistInspectionService);
  getInstanceById = checklistInspectionService.getInstanceById.bind(checklistInspectionService);
  getInstanceFull = checklistInspectionService.getInstanceFull.bind(checklistInspectionService);
  getInstances = checklistInspectionService.getInstances.bind(checklistInspectionService);
  startInstance = checklistInspectionService.startInstance.bind(checklistInspectionService);
  updateInstanceStatus = checklistInspectionService.updateInstanceStatus.bind(checklistInspectionService);
  submitForReview = checklistInspectionService.submitForReview.bind(checklistInspectionService);
  approveInstance = checklistInspectionService.approveInstance.bind(checklistInspectionService);
  rejectInstance = checklistInspectionService.rejectInstance.bind(checklistInspectionService);
  requireReinspection = checklistInspectionService.requireReinspection.bind(checklistInspectionService);

  // Response operations
  saveResponse = checklistResponseService.saveResponse.bind(checklistResponseService);
  updateResponse = checklistResponseService.updateResponse.bind(checklistResponseService);
  saveResponsesBulk = checklistResponseService.saveResponsesBulk.bind(checklistResponseService);
  getResponses = checklistResponseService.getResponses.bind(checklistResponseService);
  
  // Signature operations
  addSignature = checklistResponseService.addSignature.bind(checklistResponseService);
  getSignatures = checklistResponseService.getSignatures.bind(checklistResponseService);
  
  // Statistics
  getProjectStats = checklistInspectionService.getProjectStats.bind(checklistInspectionService);
  getDashboardData = checklistInspectionService.getDashboardData.bind(checklistInspectionService);
  getActivities = checklistResponseService.getActivities.bind(checklistResponseService);
}

/**
 * @deprecated Use individual services directly
 */
export const qualityChecklistsFacade = new QualityChecklistsFacade();
