/**
 * @propmetrik/types — Shared RBAC & Auth Types
 *
 * Single source of truth for role, tier, and permission types
 * used by backend, frontend, and tenant-portal.
 */

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/** All valid staff roles in the platform */
export type UserRole =
  | 'super_admin'
  | 'firm_principal'
  | 'admin'
  | 'senior_valuer'
  | 'manager'
  | 'project_manager'
  | 'valuer'
  | 'finance_manager'
  | 'compliance_officer'
  | 'agent'
  | 'probationer'
  | 'inspector'
  | 'analyst'
  | 'viewer';

/** All valid roles as a const array (runtime check) */
export const USER_ROLES: readonly UserRole[] = [
  'super_admin',
  'firm_principal',
  'admin',
  'senior_valuer',
  'manager',
  'project_manager',
  'valuer',
  'finance_manager',
  'compliance_officer',
  'agent',
  'probationer',
  'inspector',
  'analyst',
  'viewer',
] as const;

/** Role hierarchy — lower number = higher authority */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  super_admin: 1,
  firm_principal: 10,
  admin: 15,
  senior_valuer: 20,
  manager: 25,
  project_manager: 28,
  valuer: 30,
  agent: 30,
  finance_manager: 35,
  compliance_officer: 40,
  probationer: 50,
  inspector: 55,
  analyst: 60,
  viewer: 90,
};

// ---------------------------------------------------------------------------
// User Types
// ---------------------------------------------------------------------------

/** Distinguishes staff from external (customer/tenant) users */
export type UserType = 'staff' | 'customer';

// ---------------------------------------------------------------------------
// Subscription Tiers
// ---------------------------------------------------------------------------

export type SubscriptionTier = 'starter' | 'professional' | 'enterprise';

/** Tier hierarchy — higher number = more access */
export const TIER_LEVEL: Record<SubscriptionTier, number> = {
  starter: 1,
  professional: 2,
  enterprise: 3,
};

// ---------------------------------------------------------------------------
// Authorization Policies
// ---------------------------------------------------------------------------

/** A single authorization policy record from the DB */
export interface AuthorizationPolicy {
  policyName: string;
  resourceType: string;
  action: string;
  allowedRoles: string[];
  requireOwnership: boolean;
  requireAssignment: boolean;
  requireSameOrg: boolean;
}

// ---------------------------------------------------------------------------
// Feature Gates
// ---------------------------------------------------------------------------

/** Tier-based feature gate */
export interface FeatureGate {
  minTier: SubscriptionTier;
  label: string;
  description: string;
  category?: string;
}

// ---------------------------------------------------------------------------
// Platform Services
// ---------------------------------------------------------------------------

export type ServiceCategory = 'core' | 'analytics' | 'specialised' | 'shared';

export interface PlatformService {
  key: string;
  name: string;
  category: ServiceCategory;
}

// ---------------------------------------------------------------------------
// RBAC Config (returned by GET /api/v1/rbac/config)
// ---------------------------------------------------------------------------

export interface RbacConfigResponse {
  user: {
    role: string;
    tier: string;
    userType: string;
    organizationId?: string;
  };
  platformTabs: Record<string, string[]>;
  valuationTabs: Record<string, string[]>;
  featureGates: Record<string, { minTier: string; label: string; description: string }>;
  policies: Array<{
    resourceType: string;
    action: string;
    allowedRoles: string[];
  }>;
  services: PlatformService[];
  subscribedServices: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if a string is a valid UserRole */
export function isValidRole(role: string): role is UserRole {
  return USER_ROLES.includes(role as UserRole);
}

/** Check if a role is at or above a given authority level */
export function isRoleAtOrAbove(role: UserRole, threshold: UserRole): boolean {
  return ROLE_HIERARCHY[role] <= ROLE_HIERARCHY[threshold];
}
