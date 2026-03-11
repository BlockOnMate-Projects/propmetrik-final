/**
 * Role Profile Configuration
 * Maps each team member role to the tabs, metrics, and data scopes
 * visible in their profile view.
 */

export type ProfileTab =
  | 'overview'
  | 'projects'
  | 'timesheets'
  | 'documents'
  | 'financials'
  | 'permissions'
  | 'activity'

export interface RoleProfileConfig {
  /** Ordered list of tabs visible for this role */
  tabs: ProfileTab[]
  /** Primary KPI keys shown in the overview header */
  primaryMetrics: string[]
  /** Label for the activity feed section */
  activityLabel: string
}

/**
 * Map from team member `role` (as stored in project_team_members) to
 * their profile configuration.  Roles not listed here get DEFAULT_PROFILE.
 */
const ROLE_PROFILES: Record<string, RoleProfileConfig> = {
  // ── Management ──────────────────────────────────────────────
  project_manager: {
    tabs: ['overview', 'projects', 'timesheets', 'documents', 'financials', 'permissions', 'activity'],
    primaryMetrics: ['activeProjects', 'totalHours', 'documentsUploaded', 'invoicesManaged'],
    activityLabel: 'Management Activity',
  },
  site_engineer: {
    tabs: ['overview', 'projects', 'timesheets', 'documents', 'permissions', 'activity'],
    primaryMetrics: ['activeProjects', 'totalHours', 'documentsUploaded'],
    activityLabel: 'Engineering Activity',
  },

  // ── Professional ────────────────────────────────────────────
  architect: {
    tabs: ['overview', 'projects', 'documents', 'permissions', 'activity'],
    primaryMetrics: ['activeProjects', 'documentsUploaded'],
    activityLabel: 'Design Activity',
  },
  quantity_surveyor: {
    tabs: ['overview', 'projects', 'documents', 'financials', 'permissions', 'activity'],
    primaryMetrics: ['activeProjects', 'documentsUploaded', 'invoicesManaged'],
    activityLabel: 'QS Activity',
  },
  structural_engineer: {
    tabs: ['overview', 'projects', 'documents', 'permissions', 'activity'],
    primaryMetrics: ['activeProjects', 'documentsUploaded'],
    activityLabel: 'Structural Activity',
  },
  electrical_engineer: {
    tabs: ['overview', 'projects', 'documents', 'permissions', 'activity'],
    primaryMetrics: ['activeProjects', 'documentsUploaded'],
    activityLabel: 'Electrical Activity',
  },
  surveyor: {
    tabs: ['overview', 'projects', 'documents', 'permissions', 'activity'],
    primaryMetrics: ['activeProjects', 'documentsUploaded'],
    activityLabel: 'Survey Activity',
  },
  consultant: {
    tabs: ['overview', 'projects', 'documents', 'financials', 'permissions', 'activity'],
    primaryMetrics: ['activeProjects', 'documentsUploaded', 'invoicesManaged'],
    activityLabel: 'Consulting Activity',
  },

  // ── Construction ────────────────────────────────────────────
  foreman: {
    tabs: ['overview', 'projects', 'timesheets', 'permissions', 'activity'],
    primaryMetrics: ['activeProjects', 'totalHours'],
    activityLabel: 'Site Activity',
  },
  mason: {
    tabs: ['overview', 'projects', 'timesheets', 'permissions'],
    primaryMetrics: ['activeProjects', 'totalHours'],
    activityLabel: 'Work Activity',
  },
  carpenter: {
    tabs: ['overview', 'projects', 'timesheets', 'permissions'],
    primaryMetrics: ['activeProjects', 'totalHours'],
    activityLabel: 'Work Activity',
  },
  plumber: {
    tabs: ['overview', 'projects', 'timesheets', 'permissions'],
    primaryMetrics: ['activeProjects', 'totalHours'],
    activityLabel: 'Work Activity',
  },
  contractor: {
    tabs: ['overview', 'projects', 'documents', 'financials', 'permissions', 'activity'],
    primaryMetrics: ['activeProjects', 'documentsUploaded', 'invoicesManaged'],
    activityLabel: 'Contractor Activity',
  },
  sub_contractor: {
    tabs: ['overview', 'projects', 'documents', 'financials', 'permissions', 'activity'],
    primaryMetrics: ['activeProjects', 'documentsUploaded', 'invoicesManaged'],
    activityLabel: 'Sub-contractor Activity',
  },

  // ── Safety / Compliance ─────────────────────────────────────
  safety_officer: {
    tabs: ['overview', 'projects', 'documents', 'permissions', 'activity'],
    primaryMetrics: ['activeProjects', 'documentsUploaded'],
    activityLabel: 'Safety Activity',
  },
}

/** Fallback config for any role not explicitly listed above */
const DEFAULT_PROFILE: RoleProfileConfig = {
  tabs: ['overview', 'projects', 'documents', 'permissions'],
  primaryMetrics: ['activeProjects', 'documentsUploaded'],
  activityLabel: 'Recent Activity',
}

/**
 * Get the profile configuration for a given role string.
 * Returns DEFAULT_PROFILE for unknown roles.
 */
export function getRoleProfileConfig(role: string): RoleProfileConfig {
  return ROLE_PROFILES[role] || DEFAULT_PROFILE
}

/** Human-readable labels for each tab */
export const TAB_LABELS: Record<ProfileTab, string> = {
  overview: 'Overview',
  projects: 'Projects',
  timesheets: 'Timesheets',
  documents: 'Documents',
  financials: 'Financials',
  permissions: 'Permissions',
  activity: 'Activity',
}
