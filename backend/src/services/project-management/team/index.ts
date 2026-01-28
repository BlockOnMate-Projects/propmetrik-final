/**
 * Team Module - Barrel Export
 * 
 * Phase 3.4: Split teamService
 * 
 * Exports all team-related services:
 * - TeamMemberService: Project team member management
 * - VendorService: Vendor directory and ratings
 * - CommunicationService: Communication logging and follow-ups
 * 
 * @module services/project-management/team
 */

// Types
export * from './types';

// Services
export { teamMemberService } from './TeamMemberService';
export { vendorService } from './VendorService';
export { communicationService } from './CommunicationService';

// =============================================================================
// FACADE - Backwards Compatibility Layer
// =============================================================================

import { teamMemberService } from './TeamMemberService';
import { vendorService } from './VendorService';
import { communicationService } from './CommunicationService';

/**
 * TeamServiceFacade
 * 
 * Provides backwards compatibility with the original teamService.
 * Delegates to the appropriate focused service.
 * 
 * @deprecated Use individual services directly:
 * - teamMemberService for team members
 * - vendorService for vendors
 * - communicationService for communication logs
 */
class TeamServiceFacade {
  // Team member operations
  addTeamMember = teamMemberService.addTeamMember.bind(teamMemberService);
  getProjectTeam = teamMemberService.getProjectTeam.bind(teamMemberService);
  getTeamMembers = teamMemberService.getTeamMembers.bind(teamMemberService);
  getTeamMemberById = teamMemberService.getTeamMemberById.bind(teamMemberService);
  updateMemberRole = teamMemberService.updateMemberRole.bind(teamMemberService);
  updateMemberPermissions = teamMemberService.updateMemberPermissions.bind(teamMemberService);
  removeTeamMember = teamMemberService.removeTeamMember.bind(teamMemberService);
  getTeamByCategory = teamMemberService.getTeamByCategory.bind(teamMemberService);

  // Vendor operations
  addVendor = vendorService.addVendor.bind(vendorService);
  getApprovedVendors = vendorService.getApprovedVendors.bind(vendorService);
  getVendorById = vendorService.getVendorById.bind(vendorService);
  searchVendors = vendorService.searchVendors.bind(vendorService);
  rateVendorPerformance = vendorService.rateVendorPerformance.bind(vendorService);
  approveVendor = vendorService.approveVendor.bind(vendorService);
  setPreferredVendor = vendorService.setPreferredVendor.bind(vendorService);

  // Communication operations
  logCommunication = communicationService.logCommunication.bind(communicationService);
  getCommunicationHistory = communicationService.getCommunicationHistory.bind(communicationService);
  getProjectCommunications = communicationService.getProjectCommunications.bind(communicationService);
  getPendingFollowUps = communicationService.getPendingFollowUps.bind(communicationService);
  markFollowUpComplete = communicationService.markFollowUpComplete.bind(communicationService);
}

/**
 * @deprecated Use individual services directly
 */
export const teamServiceFacade = new TeamServiceFacade();
