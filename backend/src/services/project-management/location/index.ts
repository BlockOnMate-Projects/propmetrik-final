/**
 * Location Module - Barrel Export
 * 
 * Phase 3.5: Split projectLocationService
 * 
 * Exports all location-related services:
 * - LocationValidationService: Validate/enrich locations via Data Hub
 * - ProjectSearchService: Location-based project search
 * - RegulatoryService: Permits and regulatory authorities
 * 
 * @module services/project-management/location
 */

// Types
export * from './types';

// Services
export { locationValidationService } from './LocationValidationService';
export { projectSearchService } from './ProjectSearchService';
export { regulatoryService } from './RegulatoryService';

// =============================================================================
// FACADE - Backwards Compatibility Layer
// =============================================================================

import { locationValidationService } from './LocationValidationService';
import { projectSearchService } from './ProjectSearchService';
import { regulatoryService } from './RegulatoryService';

/**
 * ProjectLocationFacade
 * 
 * Provides backwards compatibility with the original projectLocationService.
 * Delegates to the appropriate focused service.
 * 
 * @deprecated Use individual services directly:
 * - locationValidationService for validation
 * - projectSearchService for searches
 * - regulatoryService for permits and authorities
 */
class ProjectLocationFacade {
  // Validation operations
  validateAndEnrichLocation = locationValidationService.validateAndEnrichLocation.bind(locationValidationService);
  getGhanaRegions = locationValidationService.getGhanaRegions.bind(locationValidationService);
  getDistrictsByRegion = locationValidationService.getDistrictsByRegion.bind(locationValidationService);
  getNeighborhoodsByDistrict = locationValidationService.getNeighborhoodsByDistrict.bind(locationValidationService);

  // Search operations
  searchProjects = projectSearchService.searchProjects.bind(projectSearchService);
  findNearbyProjects = projectSearchService.findNearbyProjects.bind(projectSearchService);
  getProjectsByRegion = projectSearchService.getProjectsByRegion.bind(projectSearchService);
  getLocationStats = projectSearchService.getLocationStats.bind(projectSearchService);

  // Permit operations
  getProjectPermits = regulatoryService.getProjectPermits.bind(regulatoryService);
  addProjectPermit = regulatoryService.addProjectPermit.bind(regulatoryService);
  updatePermitStatus = regulatoryService.updatePermitStatus.bind(regulatoryService);
  getRequiredPermits = regulatoryService.getRequiredPermits.bind(regulatoryService);
  getPermitComplianceStatus = regulatoryService.getPermitComplianceStatus.bind(regulatoryService);

  // Authority operations
  getTraditionalAuthorities = regulatoryService.getTraditionalAuthorities.bind(regulatoryService);
  findTraditionalAuthority = regulatoryService.findTraditionalAuthority.bind(regulatoryService);
  getRegulatoryAssemblies = regulatoryService.getRegulatoryAssemblies.bind(regulatoryService);
  findRegulatoryAssembly = regulatoryService.findRegulatoryAssembly.bind(regulatoryService);
  getAssembliesByRegion = regulatoryService.getAssembliesByRegion.bind(regulatoryService);
}

/**
 * @deprecated Use individual services directly
 */
export const projectLocationFacade = new ProjectLocationFacade();
