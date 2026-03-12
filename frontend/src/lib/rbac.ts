/**
 * Frontend RBAC — Role-Based Access Control + Subscription Tier Gating
 *
 * Fetches authorization policies from GET /api/v1/rbac/config at runtime
 * and falls back to hardcoded defaults when the backend is unreachable.
 *
 * Role hierarchy (lower = more authority):
 *   1  super_admin        — Full system access (platform owner)
 *  10  firm_principal     — Director / Principal Valuer
 *  15  admin              — Organization admin
 *  20  senior_valuer      — Lead Valuer, QA
 *  25  manager            — Team manager
 *  28  project_manager    — Project management (PM Portal)
 *  30  valuer / agent     — Independent valuer / legacy agent
 *  35  finance_manager    — Finance & billing
 *  40  compliance_officer — Regulatory
 *  50  probationer        — Trainee (supervised)
 *  55  inspector          — Field inspections
 *  60  analyst            — Read-only analytics
 *  90  viewer             — Read-only basic
 *
 * Subscription tiers:
 *   starter       — Basic features, limited usage
 *   professional  — Full features, higher limits
 *   enterprise    — Unlimited, API access, white-label
 */

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

export type SubscriptionTier = 'starter' | 'professional' | 'enterprise';

// Tier hierarchy for comparison (higher = more access)
const TIER_LEVEL: Record<string, number> = {
  starter: 1,
  professional: 2,
  enterprise: 3,
};



// ---------------------------------------------------------------------------
// Remote RBAC config (fetched from backend)
// ---------------------------------------------------------------------------

interface RbacConfig {
  platformTabs: Record<string, string[]>;
  valuationTabs: Record<string, string[]>;
  featureGates: Record<string, { minTier: string; label: string; description: string }>;
  policies: Array<{ resourceType: string; action: string; allowedRoles: string[] }>;
  services: Array<{ key: string; name: string; category: string }>;
  subscribedServices: string[];
  user: { role: string; tier: string; userType: string; organizationId?: string };
}

let _rbacConfig: RbacConfig | null = null;
let _rbacFetchTime = 0;
const RBAC_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let _rbacFetchPromise: Promise<RbacConfig | null> | null = null;

/**
 * Fetch RBAC config from backend. Caches for 5 minutes.
 * Returns null if fetch fails (caller should use fallback).
 */
async function fetchRbacConfig(accessToken?: string): Promise<RbacConfig | null> {
  const now = Date.now();
  if (_rbacConfig && now - _rbacFetchTime < RBAC_CACHE_TTL) {
    return _rbacConfig;
  }

  // Deduplicate concurrent requests
  if (_rbacFetchPromise) return _rbacFetchPromise;

  _rbacFetchPromise = (async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      const res = await fetch(`${apiUrl}/rbac/config`, {
        headers,
        credentials: 'include',
        next: { revalidate: 300 },  // ISR: revalidate every 5 min
      } as RequestInit);

      if (!res.ok) return null;

      const body = await res.json();
      if (body.success && body.data) {
        _rbacConfig = body.data;
        _rbacFetchTime = Date.now();
        return _rbacConfig;
      }
      return null;
    } catch {
      return null;
    } finally {
      _rbacFetchPromise = null;
    }
  })();

  return _rbacFetchPromise;
}

/** Force-clear the RBAC config cache (call on logout or role change) */
export function clearRbacCache(): void {
  _rbacConfig = null;
  _rbacFetchTime = 0;
}

/**
 * React hook-compatible: get the cached RBAC config synchronously.
 * Returns null if not yet fetched. Use `prefetchRbacConfig` to prime.
 */
export function getRbacConfig(): RbacConfig | null {
  return _rbacConfig;
}

/**
 * Pre-fetch RBAC config (call early, e.g. in layout or auth callback).
 */
export async function prefetchRbacConfig(accessToken?: string): Promise<void> {
  await fetchRbacConfig(accessToken);
}

// ---------------------------------------------------------------------------
// Platform-level service tabs — hardcoded FALLBACK (used when API unreachable)
// ---------------------------------------------------------------------------

/** Which roles can see each top-level service tab (fallback only) */
const FALLBACK_platformTabAccess: Record<string, UserRole[]> = {
  // Everyone who logs in sees overview
  overview: [
    'super_admin', 'firm_principal', 'admin', 'senior_valuer', 'manager',
    'project_manager', 'valuer', 'finance_manager', 'compliance_officer', 'agent',
    'probationer', 'inspector', 'analyst', 'viewer',
  ],

  // Valuation service — valuation-category roles + management roles
  valuations: [
    'super_admin', 'firm_principal', 'admin', 'senior_valuer', 'manager',
    'valuer', 'finance_manager', 'compliance_officer', 'agent',
    'probationer', 'inspector', 'analyst',
  ],

  // Deals — management/admin roles + agents
  deals: [
    'super_admin', 'admin', 'manager', 'agent', 'firm_principal',
  ],

  // Projects — management/admin + project managers
  projects: [
    'super_admin', 'admin', 'manager', 'project_manager', 'firm_principal',
  ],

  // Calendar — all roles that use projects or valuations
  calendar: [
    'super_admin', 'firm_principal', 'admin', 'senior_valuer', 'manager',
    'project_manager', 'valuer', 'finance_manager', 'agent',
    'probationer', 'inspector', 'analyst',
  ],

  // Platform analytics — senior roles + project managers
  analytics: [
    'super_admin', 'admin', 'firm_principal', 'manager', 'project_manager', 'analyst',
  ],

  // Property management — management/admin + project managers
  'property-management': [
    'super_admin', 'admin', 'manager', 'project_manager', 'firm_principal',
  ],

  // E-Sign — anyone who generates or reviews reports
  'e-sign': [
    'super_admin', 'admin', 'firm_principal', 'senior_valuer', 'manager',
    'project_manager',
  ],

  // Admin panel — platform admins only
  admin: [
    'super_admin', 'admin',
  ],
};

// ---------------------------------------------------------------------------
// Subscription tier requirements per feature — hardcoded FALLBACK
// ---------------------------------------------------------------------------

export interface FeatureGate {
  /** Minimum subscription tier required */
  minTier: SubscriptionTier;
  /** Feature display name for upgrade prompts */
  label: string;
  /** Short description of what this feature does */
  description: string;
  /** Which plan category this falls under */
  category?: string;
}

/** Feature keys map to platform tabs and sub-features (fallback only) */
export const featureGates: Record<string, FeatureGate> = {
  // --- Platform tabs ---
  overview:             { minTier: 'starter',      label: 'Dashboard Overview',    description: 'Real-time overview of your organization\'s metrics' },
  valuations:           { minTier: 'starter',      label: 'Valuations',            description: 'Property valuation management and reporting' },
  deals:                { minTier: 'professional',  label: 'Deal Pipeline',         description: 'Full CRM deal pipeline tracking and management' },
  projects:             { minTier: 'professional',  label: 'Project Management',    description: 'Construction and development project tracking' },
  analytics:            { minTier: 'professional',  label: 'Market Analytics',       description: 'Advanced market intelligence and trend analysis' },
  'property-management':{ minTier: 'professional',  label: 'Property Management',   description: 'Tenant, lease, and facility management' },
  'e-sign':             { minTier: 'starter',       label: 'E-Sign',                description: 'Digital document signing and verification (shared service)' },
  admin:                { minTier: 'starter',      label: 'Admin Panel',            description: 'Platform administration and settings' },

  // --- Sub-features (gated at higher tiers) ---
  'analytics-forecasting':    { minTier: 'enterprise',    label: 'AI Forecasting',         description: 'ML-powered property price predictions and trend forecasting' },
  'analytics-risk':           { minTier: 'professional',  label: 'Risk Assessment',        description: 'Property and portfolio risk analysis' },
  'analytics-geographic':     { minTier: 'professional',  label: 'Geographic Intelligence', description: 'Spatial market analysis with heatmaps' },
  'api-access':               { minTier: 'enterprise',    label: 'API Access',              description: 'Programmatic access to PROPMETRIK data and services' },
  'bulk-valuations':          { minTier: 'professional',  label: 'Bulk Valuations',         description: 'Batch property valuation processing' },
  'custom-reports':           { minTier: 'enterprise',    label: 'Custom Reports',          description: 'White-label custom valuation report templates' },
  'data-hub':                 { minTier: 'professional',  label: 'Data Hub',                description: 'Connect external data sources and feeds' },
  'portfolio-analysis':       { minTier: 'enterprise',    label: 'Portfolio Analysis',      description: 'Multi-property portfolio performance tracking' },
  'blockchain-verification':  { minTier: 'enterprise',    label: 'Blockchain Verification', description: 'On-chain property record verification' },

  // --- PM sub-groups (project management section tabs) ---
  'pm-overview':       { minTier: 'starter',       label: 'PM Overview',         description: 'Project dashboard, calendar, and team' },
  'pm-construction':   { minTier: 'professional',  label: 'Construction Mgmt',   description: 'Drawings, issues, punch lists, safety, equipment' },
  'pm-procurement':    { minTier: 'professional',  label: 'Procurement',         description: 'Bid management, contracts, contractors' },
  'pm-financials':     { minTier: 'professional',  label: 'Project Financials',  description: 'Costs, budget, invoicing, timesheets, reports' },
  'pm-documents':      { minTier: 'starter',       label: 'Project Documents',   description: 'Files, meetings, and closeout' },
  'pm-units':          { minTier: 'professional',  label: 'Units Management',    description: 'Unit tracking and sales management' },
  'pm-analytics':      { minTier: 'enterprise',    label: 'Project Analytics',   description: 'Analytics, audit log, and integrations' },
  'pm-settings':       { minTier: 'professional',  label: 'Project Settings',    description: 'Project configuration and settings' },
};

// ---------------------------------------------------------------------------
// Valuation sub-tabs — hardcoded FALLBACK
// ---------------------------------------------------------------------------

/** Which roles can see each valuation sub-tab (fallback only) */
const FALLBACK_valuationTabAccess: Record<string, UserRole[]> = {
  // Valuations list — everyone in valuation service
  valuations: [
    'super_admin', 'firm_principal', 'admin', 'senior_valuer', 'manager',
    'valuer', 'finance_manager', 'compliance_officer', 'agent',
    'probationer', 'inspector', 'analyst',
  ],

  // Team tab — visible to all (read), but manage restricted server-side
  team: [
    'super_admin', 'firm_principal', 'admin', 'senior_valuer', 'manager',
    'valuer', 'finance_manager', 'compliance_officer', 'agent',
    'probationer', 'inspector', 'analyst',
  ],

  // Finance — restricted to finance/admin roles
  finance: [
    'super_admin', 'firm_principal', 'admin', 'finance_manager',
    'compliance_officer', 'manager',
  ],

  // Clients — valuers can read, but broader access
  clients: [
    'super_admin', 'firm_principal', 'admin', 'senior_valuer', 'manager',
    'valuer', 'finance_manager', 'agent',
  ],

  // Calendar — all valuation staff
  calendar: [
    'super_admin', 'firm_principal', 'admin', 'senior_valuer', 'manager',
    'valuer', 'agent', 'probationer', 'inspector',
  ],

  // Valuation analytics — senior & management
  analytics: [
    'super_admin', 'firm_principal', 'admin', 'senior_valuer',
    'finance_manager', 'compliance_officer', 'manager', 'analyst',
  ],

  // Settings — admin only
  settings: [
    'super_admin', 'firm_principal', 'admin',
  ],
};

// ---------------------------------------------------------------------------
// Per-service sub-tab role scoping (see rbac.md §7.3)
// ---------------------------------------------------------------------------

/**
 * Per-service sub-tab access: serviceKey → subTabKey → allowedRoles[]
 * Valuations use their own `FALLBACK_valuationTabAccess` above.
 */
const FALLBACK_serviceSubTabAccess: Record<string, Record<string, UserRole[]>> = {
  // ── Project Management ──────────────────────────────────────
  projects: {
    'pm-overview':      ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager', 'finance_manager', 'analyst', 'inspector', 'viewer'],
    'pm-construction':  ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager', 'inspector'],
    'pm-procurement':   ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager', 'finance_manager'],
    'pm-financials':    ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager', 'finance_manager'],
    'pm-documents':     ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager', 'finance_manager', 'inspector', 'viewer'],
    'pm-units':         ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager', 'agent'],
    'pm-analytics':     ['super_admin', 'firm_principal', 'admin', 'manager', 'analyst'],
    'pm-settings':      ['super_admin', 'firm_principal', 'admin'],
  },

  // ── Deal Management (CRM) ──────────────────────────────────
  deals: {
    'crm-deals':        ['super_admin', 'firm_principal', 'admin', 'manager', 'agent'],
    'crm-properties':   ['super_admin', 'firm_principal', 'admin', 'manager', 'agent'],
    'crm-contacts':     ['super_admin', 'firm_principal', 'admin', 'manager', 'agent'],
    'crm-agents':       ['super_admin', 'firm_principal', 'admin', 'manager'],
    'crm-companies':    ['super_admin', 'firm_principal', 'admin', 'manager', 'agent'],
    'crm-tasks':        ['super_admin', 'firm_principal', 'admin', 'manager', 'agent'],
    'crm-documents':    ['super_admin', 'firm_principal', 'admin', 'manager', 'agent'],
    'crm-financials':   ['super_admin', 'firm_principal', 'admin', 'manager', 'finance_manager'],
    'crm-messaging':    ['super_admin', 'firm_principal', 'admin', 'manager', 'agent'],
    'crm-calendar':     ['super_admin', 'firm_principal', 'admin', 'manager', 'agent'],
    'crm-analytics':    ['super_admin', 'firm_principal', 'admin', 'manager', 'analyst'],
    'crm-workflows':    ['super_admin', 'firm_principal', 'admin', 'manager'],
    'crm-pipelines':    ['super_admin', 'firm_principal', 'admin'],
  },

  // ── Property Management ────────────────────────────────────
  'property-management': {
    'propmgmt-overview':      ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager'],
    'propmgmt-properties':    ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager'],
    'propmgmt-messages':      ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager'],
    'propmgmt-portfolios':    ['super_admin', 'firm_principal', 'admin', 'manager'],
    'propmgmt-applications':  ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager'],
    'propmgmt-tenants':       ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager'],
    'propmgmt-maintenance':   ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager'],
    'propmgmt-documents':     ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager'],
    'propmgmt-vendors':       ['super_admin', 'firm_principal', 'admin', 'manager'],
    'propmgmt-financials':    ['super_admin', 'firm_principal', 'admin', 'manager', 'finance_manager'],
    'propmgmt-calendar':      ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager'],
  },

  // ── Analytics ──────────────────────────────────────────────
  analytics: {
    'analytics-market':        ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager', 'analyst'],
    'analytics-construction':  ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager', 'analyst'],
    'analytics-affordability': ['super_admin', 'firm_principal', 'admin', 'manager', 'analyst'],
    'analytics-valuations':    ['super_admin', 'firm_principal', 'admin', 'senior_valuer', 'manager', 'valuer', 'analyst'],
    'analytics-ml':            ['super_admin', 'firm_principal', 'admin', 'analyst'],
    'analytics-risk':          ['super_admin', 'firm_principal', 'admin', 'manager', 'analyst', 'compliance_officer'],
    'analytics-short-stay':    ['super_admin', 'firm_principal', 'admin', 'manager', 'analyst'],
    'analytics-forecasting':   ['super_admin', 'firm_principal', 'admin', 'analyst'],
    'analytics-crm':           ['super_admin', 'firm_principal', 'admin', 'manager', 'agent', 'analyst'],
    'analytics-geographic':    ['super_admin', 'firm_principal', 'admin', 'manager', 'analyst'],
    'analytics-management':    ['super_admin', 'firm_principal', 'admin', 'manager'],
    'analytics-settings':      ['super_admin', 'firm_principal', 'admin'],
  },
};

// ---------------------------------------------------------------------------
// Helper functions (dynamic config → hardcoded fallback)
// ---------------------------------------------------------------------------

/**
 * Get platform tab access map (dynamic or fallback).
 */
function getPlatformTabAccess(): Record<string, string[]> {
  return _rbacConfig?.platformTabs || FALLBACK_platformTabAccess;
}

/**
 * Get valuation tab access map (dynamic or fallback).
 */
function getValuationTabAccess(): Record<string, string[]> {
  return _rbacConfig?.valuationTabs || FALLBACK_valuationTabAccess;
}

/**
 * Get sub-tab access for a specific service (fallback only for now).
 */
function getServiceSubTabAccess(serviceKey: string): Record<string, string[]> | null {
  return FALLBACK_serviceSubTabAccess[serviceKey] || null;
}

/**
 * Check if a role can access a specific sub-tab within a service.
 * Returns true if no sub-tab scoping is defined for the service (fail-open for unconfigured services).
 */
export function canAccessServiceSubTab(
  role: string | undefined | null,
  serviceKey: string,
  subTabKey: string,
): boolean {
  if (!role) return false;
  if (role === 'super_admin') return true;

  const tabAccess = getServiceSubTabAccess(serviceKey);
  if (!tabAccess) return true; // no scoping defined → allow all
  const allowed = tabAccess[subTabKey];
  if (!allowed) return true; // sub-tab not in map → allow
  return allowed.includes(role);
}

/**
 * Get feature gates (dynamic or fallback).
 */
function getFeatureGates(): Record<string, { minTier: string; label: string; description: string }> {
  return _rbacConfig?.featureGates || featureGates;
}

/**
 * Check if a role can access a platform-level service tab.
 */
export function canAccessPlatformTab(role: string | undefined | null, tabKey: string): boolean {
  if (!role) return false;
  const tabs = getPlatformTabAccess();
  const allowed = tabs[tabKey];
  if (!allowed) return false;
  return allowed.includes(role);
}

/**
 * Check if a role can access a valuation sub-tab.
 */
export function canAccessValuationTab(role: string | undefined | null, tabKey: string): boolean {
  if (!role) return false;
  const tabs = getValuationTabAccess();
  const allowed = tabs[tabKey];
  if (!allowed) return false;
  return allowed.includes(role);
}

/**
 * Check if a subscription tier meets the minimum requirement for a feature.
 * super_admin always gets full access regardless of tier.
 * Staff users (userType='staff') bypass ALL tier restrictions per RBAC spec.
 */
export function canAccessFeature(
  role: string | undefined | null,
  tier: string | undefined | null,
  featureKey: string,
  userType?: string | null,
): boolean {
  // super_admin bypasses all tier restrictions
  if (role === 'super_admin') return true;

  // Staff users bypass all tier restrictions — tiers only apply to customers
  if (!userType || userType === 'staff') return true;
  
  const gates = getFeatureGates();
  const gate = gates[featureKey];
  if (!gate) return true; // ungated feature
  
  const userLevel = TIER_LEVEL[tier || 'starter'] || 0;
  const requiredLevel = TIER_LEVEL[gate.minTier] || 0;
  return userLevel >= requiredLevel;
}

/**
 * Get the upgrade info for a feature the user cannot access.
 * Returns null if user has access.
 */
export function getUpgradeInfo(
  role: string | undefined | null,
  tier: string | undefined | null,
  featureKey: string,
  userType?: string | null,
): FeatureGate | null {
  if (canAccessFeature(role, tier, featureKey, userType)) return null;
  const gates = getFeatureGates();
  const gate = gates[featureKey];
  return gate ? { minTier: gate.minTier as SubscriptionTier, label: gate.label, description: gate.description } : null;
}

/**
 * Check if a role has both role-based AND tier-based access to a platform tab.
 */
export function canFullyAccessTab(
  role: string | undefined | null,
  tier: string | undefined | null,
  tabKey: string,
  userType?: string | null,
): { hasRoleAccess: boolean; hasTierAccess: boolean; gate: FeatureGate | null } {
  const hasRoleAccess = canAccessPlatformTab(role, tabKey);
  const hasTierAccess = canAccessFeature(role, tier, tabKey, userType);
  const gates = getFeatureGates();
  const rawGate = !hasTierAccess ? (gates[tabKey] || null) : null;
  const gate = rawGate ? { minTier: rawGate.minTier as SubscriptionTier, label: rawGate.label, description: rawGate.description } : null;
  return { hasRoleAccess, hasTierAccess, gate };
}

/**
 * Check if a role is an admin-level role (platform admin).
 */
export function isAdminRole(role: string | undefined | null): boolean {
  if (!role) return false;
  return ['super_admin', 'admin'].includes(role);
}

/**
 * Check if a role is at manager level or above.
 */
export function isManagerOrAbove(role: string | undefined | null): boolean {
  if (!role) return false;
  return ['super_admin', 'admin', 'firm_principal', 'senior_valuer', 'manager', 'project_manager'].includes(role);
}

/**
 * Get the display name for a subscription tier.
 */
export function getTierDisplayName(tier: string | undefined | null): string {
  switch (tier) {
    case 'enterprise': return 'Enterprise';
    case 'professional': return 'Professional';
    case 'starter': return 'Starter';
    default: return 'Free';
  }
}

/**
 * Get the required tier display name for a feature.
 */
export function getRequiredTierName(featureKey: string): string {
  const gates = getFeatureGates();
  const gate = gates[featureKey];
  if (!gate) return 'Starter';
  return getTierDisplayName(gate.minTier);
}

/**
 * Check if the user has a specific policy-level permission.
 * Uses dynamic policies from the backend if available.
 */
export function hasPermission(
  role: string | undefined | null,
  resourceType: string,
  action: string
): boolean {
  if (!role) return false;
  if (role === 'super_admin') return true;

  const config = getRbacConfig();
  if (config?.policies) {
    const policy = config.policies.find(
      p => p.resourceType === resourceType && p.action === action
    );
    return policy ? policy.allowedRoles.includes(role) : false;
  }

  // No dynamic config loaded — allow (the backend will enforce)
  return true;
}
