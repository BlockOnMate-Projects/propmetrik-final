/**
 * PM Data Components for Client Portal
 * 
 * These components display PM-created data in the Client Portal,
 * enabling bidirectional communication and approval workflows.
 * 
 * Enterprise Architecture:
 * - Admin/Client defines frameworks and governs projects
 * - PM creates operational data (RFIs, Submittals, Change Orders, Milestones)
 * - Client reviews, responds, and approves through these components
 */

export { RFIsTab } from './RFIsTab'
export { SubmittalsTab } from './SubmittalsTab'
export { ChangeOrdersTab } from './ChangeOrdersTab'
export { MilestonesTab } from './MilestonesTab'
