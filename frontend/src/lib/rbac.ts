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
  | 'viewer'
  | 'tenant';

export type SubscriptionTier = 'starter' | 'professional' | 'enterprise';

/**
 * Customer service-specific roles.
 * Stored per service in `user_service_subscriptions.service_role`.
 * service_admin = full access within a subscribed service.
 */
export type CustomerServiceRole =
  | 'service_admin'
  | 'viewer'
  // Valuations
  | 'senior_associate'
  | 'associate'
  | 'finance_officer'
  // CRM
  | 'sales_manager'
  | 'sales_agent'
  // Projects
  | 'project_manager'
  | 'site_supervisor'
  | 'quantity_surveyor'
  // Property Management
  | 'property_manager'
  | 'leasing_agent'
  | 'maintenance_coordinator'
  | 'accounts_officer'
  // Analytics
  | 'analyst';

// Tier hierarchy for comparison (higher = more access)
const TIER_LEVEL: Record<string, number> = {
  starter: 1,
  professional: 2,
  enterprise: 3,
  annual: 3, // unlimited annual SKU — same access as enterprise
};

/** Map marketing tier labels to access tiers for comparisons. */
export function normalizeTier(tier?: string | null): string {
  if (!tier) return 'starter';
  if (tier === 'annual') return 'enterprise';
  return tier;
}

function getEffectiveTierLevel(tier?: string | null): number {
  return TIER_LEVEL[normalizeTier(tier)] ?? TIER_LEVEL.starter;
}



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
  /** Customer-only: per-service roles (e.g. { crm: 'sales_agent', projects: 'project_manager' }) */
  customerServiceRoles?: Record<string, string>;
  /** Customer-only: per-service sub-tab access map */
  customerSubTabAccess?: Record<string, Record<string, string[]>>;
  /** Customer-only: available roles per service for invite UI */
  customerRoleConfig?: Array<{ serviceKey: string; roleKey: string; displayName: string; description: string }>;
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
    'valuer', 'finance_manager', 'compliance_officer',
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

  // Calendar — roles that have access to projects (calendar fetches project milestones)
  calendar: [
    'super_admin', 'firm_principal', 'admin', 'manager',
    'project_manager',
  ],

  // Platform analytics — senior roles + project managers
  analytics: [
    'super_admin', 'admin', 'firm_principal', 'manager', 'project_manager', 'analyst',
  ],

  // Property management — management/admin + project managers
  'property-management': [
    'super_admin', 'admin', 'manager', 'project_manager', 'firm_principal',
  ],

  // E-Sign — shared service, available to all authenticated users
  'e-sign': [
    'super_admin', 'firm_principal', 'admin', 'senior_valuer', 'manager',
    'project_manager', 'valuer', 'finance_manager', 'compliance_officer', 'agent',
    'probationer', 'inspector', 'analyst', 'viewer',
  ],

  // Admin panel — platform admins only
  admin: [
    'super_admin', 'admin',
  ],

  // Tenant portal — tenant role only (accessed via /dashboard/tenant)
  tenant: [
    'tenant',
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
  'analytics-demand':         { minTier: 'professional',  label: 'Housing Demand',          description: 'Regional housing demand scoring from PHC 2021 population, employment and poverty data' },
  'analytics-infrastructure': { minTier: 'professional',  label: 'Infrastructure Quality',  description: 'Neighbourhood Infrastructure Quality Score (NIQS) from PHC 2021 electricity, water, sanitation and ICT access' },
  'analytics-api':            { minTier: 'professional',  label: 'Analytics API',           description: 'Programmatic access to PropMetrik analytics — base URL, resources catalog, users and API keys' },
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
  'pm-communications': { minTier: 'starter',       label: 'Communications',      description: 'Mail and calendar' },
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
    'valuer', 'finance_manager', 'compliance_officer',
    'probationer', 'inspector', 'analyst',
  ],

  // Document vault — same audience as the valuations list (access is org-scoped server-side)
  documents: [
    'super_admin', 'firm_principal', 'admin', 'senior_valuer', 'manager',
    'valuer', 'finance_manager', 'compliance_officer',
    'probationer', 'inspector', 'analyst',
  ],

  // Team tab — visible to all (read), but manage restricted server-side
  team: [
    'super_admin', 'firm_principal', 'admin', 'senior_valuer', 'manager',
    'valuer', 'finance_manager', 'compliance_officer',
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
    'valuer', 'finance_manager',
  ],

  // Calendar — all valuation staff
  calendar: [
    'super_admin', 'firm_principal', 'admin', 'senior_valuer', 'manager',
    'valuer', 'probationer', 'inspector',
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

  // Integrations — connect org-level accounts (accounting, storage, etc.); admin-level like settings
  integrations: [
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
    'pm-communications': ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager', 'finance_manager', 'inspector', 'viewer'],
    'pm-units':         ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager', 'agent'],
    'pm-analytics':     ['super_admin', 'firm_principal', 'admin', 'manager', 'analyst'],
    'pm-settings':      ['super_admin', 'firm_principal', 'admin'],
    'pm-team':          ['super_admin', 'firm_principal', 'admin', 'manager'],
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
    'crm-inbox':        ['super_admin', 'firm_principal', 'admin', 'manager', 'agent'],
    'crm-communications': ['super_admin', 'firm_principal', 'admin', 'manager', 'agent'],
    'crm-calendar':     ['super_admin', 'firm_principal', 'admin', 'manager', 'agent'],
    'crm-analytics':    ['super_admin', 'firm_principal', 'admin', 'manager', 'analyst'],
    'crm-workflows':    ['super_admin', 'firm_principal', 'admin', 'manager'],
    'crm-pipelines':    ['super_admin', 'firm_principal', 'admin'],
    // Commissions: admin-only by default (agents are salary-paid; toggle via RBAC)
    'crm-commissions':  ['super_admin', 'firm_principal', 'admin', 'finance_manager'],
    'crm-targets':      ['super_admin', 'firm_principal', 'admin', 'manager', 'agent'],
    'crm-drip-campaigns': ['super_admin', 'firm_principal', 'admin', 'manager'],
    'crm-team':          ['super_admin', 'firm_principal', 'admin', 'manager'],
    'crm-integrations':  ['super_admin', 'firm_principal', 'admin', 'manager'],
  },

  // ── Property Management ────────────────────────────────────
  'property-management': {
    'propmgmt-overview':      ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager'],
    'propmgmt-properties':    ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager'],
    'propmgmt-messages':      ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager'],
    'propmgmt-communications': ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager'],
    'propmgmt-portfolios':    ['super_admin', 'firm_principal', 'admin', 'manager'],
    'propmgmt-applications':  ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager'],
    'propmgmt-tenants':       ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager'],
    'propmgmt-maintenance':   ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager'],
    'propmgmt-documents':     ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager'],
    'propmgmt-vendors':       ['super_admin', 'firm_principal', 'admin', 'manager'],
    'propmgmt-financials':    ['super_admin', 'firm_principal', 'admin', 'manager', 'finance_manager'],
    'propmgmt-calendar':      ['super_admin', 'firm_principal', 'admin', 'manager', 'project_manager'],
    'propmgmt-team':          ['super_admin', 'firm_principal', 'admin', 'manager'],
    'propmgmt-integrations':  ['super_admin', 'firm_principal', 'admin', 'manager'],
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
    'analytics-demand':        ['super_admin', 'firm_principal', 'admin', 'manager', 'analyst'],
    'analytics-infrastructure':['super_admin', 'firm_principal', 'admin', 'manager', 'analyst'],
    'analytics-api':           ['super_admin', 'firm_principal', 'admin', 'manager', 'analyst'],
    'analytics-management':    ['super_admin', 'firm_principal', 'admin', 'manager'],
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
  // Overview and E-Sign are shared services available to every authenticated user
  // (consistent with navigation filtering); never gate them on the RBAC config,
  // which may omit them for some roles/orgs.
  if (tabKey === 'overview' || tabKey === 'e-sign') return true;
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
  
  const userLevel = getEffectiveTierLevel(tier);
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

// ---------------------------------------------------------------------------
// Customer service-specific role scoping (spec §5)
// ---------------------------------------------------------------------------

/**
 * Per-service sub-tab access for CUSTOMER roles.
 * Maps serviceKey → subTabKey → allowed CustomerServiceRole[].
 * service_admin always bypasses (handled in canCustomerAccessSubTab).
 */
const FALLBACK_customerSubTabAccess: Record<string, Record<string, CustomerServiceRole[]>> = {
  // ── Valuations ────────────────────────────────────────────
  valuations: {
    'val-valuations':  ['service_admin', 'senior_associate', 'associate', 'finance_officer', 'viewer'],
    'val-finance':     ['service_admin', 'finance_officer'],
    'val-clients':     ['service_admin', 'senior_associate', 'associate'],
    'val-calendar':    ['service_admin', 'senior_associate', 'associate'],
    'val-analytics':   ['service_admin', 'senior_associate'],
    'val-team':        ['service_admin', 'senior_associate', 'associate'],
    'val-settings':    ['service_admin'],
  },

  // ── Deal Management (CRM) ────────────────────────────────
  deals: {
    'crm-deals':           ['service_admin', 'sales_manager', 'sales_agent', 'viewer'],
    'crm-properties':      ['service_admin', 'sales_manager', 'sales_agent', 'viewer'],
    'crm-contacts':        ['service_admin', 'sales_manager', 'sales_agent', 'viewer'],
    'crm-agents':          ['service_admin', 'sales_manager'],
    'crm-companies':       ['service_admin', 'sales_manager', 'sales_agent', 'viewer'],
    'crm-tasks':           ['service_admin', 'sales_manager', 'sales_agent', 'viewer'],
    'crm-documents':       ['service_admin', 'sales_manager', 'sales_agent', 'viewer'],
    'crm-financials':      ['service_admin', 'sales_manager'],
    'crm-messaging':       ['service_admin', 'sales_manager', 'sales_agent', 'viewer'],
    'crm-inbox':           ['service_admin', 'sales_manager', 'sales_agent', 'viewer'],
    'crm-calendar':        ['service_admin', 'sales_manager', 'sales_agent', 'viewer'],
    'crm-analytics':       ['service_admin', 'sales_manager'],
    'crm-workflows':       ['service_admin', 'sales_manager'],
    'crm-pipelines':       ['service_admin'],
    'crm-commissions':     ['service_admin', 'sales_manager'],
    'crm-targets':         ['service_admin', 'sales_manager', 'sales_agent'],
    'crm-drip-campaigns':  ['service_admin', 'sales_manager'],
    'crm-team':            ['service_admin'],
    'crm-integrations':    ['service_admin'],
  },

  // ── Project Management ───────────────────────────────────
  projects: {
    'pm-overview':      ['service_admin', 'project_manager', 'site_supervisor', 'quantity_surveyor', 'viewer'],
    'pm-construction':  ['service_admin', 'project_manager', 'site_supervisor'],
    'pm-procurement':   ['service_admin', 'project_manager', 'quantity_surveyor'],
    'pm-financials':    ['service_admin', 'project_manager', 'quantity_surveyor'],
    'pm-documents':     ['service_admin', 'project_manager', 'site_supervisor', 'quantity_surveyor', 'viewer'],
    'pm-communications': ['service_admin', 'project_manager', 'site_supervisor', 'quantity_surveyor', 'viewer'],
    'pm-units':         ['service_admin', 'project_manager', 'viewer'],
    'pm-analytics':     ['service_admin', 'project_manager'],
    'pm-settings':      ['service_admin'],
    'pm-team':          ['service_admin'],
  },

  // ── Property Management ──────────────────────────────────
  'property-management': {
    'propmgmt-overview':      ['service_admin', 'property_manager', 'leasing_agent', 'maintenance_coordinator', 'accounts_officer', 'viewer'],
    'propmgmt-properties':    ['service_admin', 'property_manager', 'leasing_agent', 'maintenance_coordinator', 'accounts_officer', 'viewer'],
    'propmgmt-messages':      ['service_admin', 'property_manager', 'leasing_agent', 'maintenance_coordinator', 'viewer'],
    'propmgmt-communications': ['service_admin', 'property_manager', 'leasing_agent', 'maintenance_coordinator', 'viewer'],
    'propmgmt-portfolios':    ['service_admin', 'property_manager', 'accounts_officer'],
    'propmgmt-applications':  ['service_admin', 'property_manager', 'leasing_agent', 'viewer'],
    'propmgmt-tenants':       ['service_admin', 'property_manager', 'leasing_agent', 'maintenance_coordinator', 'accounts_officer', 'viewer'],
    'propmgmt-maintenance':   ['service_admin', 'property_manager', 'maintenance_coordinator', 'viewer'],
    'propmgmt-documents':     ['service_admin', 'property_manager', 'leasing_agent', 'maintenance_coordinator', 'accounts_officer', 'viewer'],
    'propmgmt-vendors':       ['service_admin', 'property_manager', 'maintenance_coordinator'],
    'propmgmt-financials':    ['service_admin', 'accounts_officer'],
    'propmgmt-calendar':      ['service_admin', 'property_manager', 'leasing_agent', 'maintenance_coordinator', 'viewer'],
    'propmgmt-team':          ['service_admin'],
    'propmgmt-integrations':  ['service_admin'],
  },

  // ── Analytics ────────────────────────────────────────────
  analytics: {
    'analytics-market':        ['service_admin', 'analyst', 'viewer'],
    'analytics-construction':  ['service_admin', 'analyst', 'viewer'],
    'analytics-affordability': ['service_admin', 'analyst', 'viewer'],
    'analytics-valuations':    ['service_admin', 'analyst', 'viewer'],
    'analytics-ml':            ['service_admin', 'analyst'],
    'analytics-risk':          ['service_admin', 'analyst', 'viewer'],
    'analytics-short-stay':    ['service_admin', 'analyst', 'viewer'],
    'analytics-forecasting':   ['service_admin', 'analyst'],
    'analytics-geographic':    ['service_admin', 'analyst', 'viewer'],
    'analytics-demand':        ['service_admin', 'analyst', 'viewer'],
    'analytics-infrastructure':['service_admin', 'analyst', 'viewer'],
    'analytics-api':           ['service_admin', 'analyst', 'viewer'],
    'analytics-management':    ['service_admin'],
  },
};

/**
 * Check if a customer service role can access a specific sub-tab within a service.
 * service_admin always has full access.
 * Falls back to hardcoded map when dynamic config is unavailable.
 */
export function canCustomerAccessSubTab(
  serviceRole: string | undefined | null,
  serviceKey: string,
  subTabKey: string,
): boolean {
  if (!serviceRole) return false;
  if (serviceRole === 'service_admin') return true;

  // Try dynamic config first
  const config = getRbacConfig();
  if (config?.customerSubTabAccess?.[serviceKey]?.[subTabKey]) {
    return config.customerSubTabAccess[serviceKey][subTabKey].includes(serviceRole);
  }

  // Fallback to hardcoded
  const access = FALLBACK_customerSubTabAccess[serviceKey];
  if (!access) return true; // no scoping defined = allow
  const allowed = access[subTabKey];
  if (!allowed) return true; // sub-tab not in map = allow
  return allowed.includes(serviceRole as CustomerServiceRole);
}

/**
 * Build the customer navigation: Overview + subscribed service tabs + shared services.
 * Customers never see the Admin tab.
 */
export const TAB_TO_SERVICE_KEY: Record<string, string> = {
  valuations: 'valuations',
  deals: 'crm',
  projects: 'projects',
  analytics: 'analytics',
  'property-management': 'property_management',
};

/** Whether a customer org may use a platform tab (subscription row or top-tier plan). */
export function customerHasServiceForTab(
  tabKey: string,
  subscribedServices: string[],
  tier?: string | null,
): boolean {
  if (tabKey === 'overview' || tabKey === 'e-sign') return true;
  const serviceKey = TAB_TO_SERVICE_KEY[tabKey];
  if (!serviceKey) return true;
  if (subscribedServices.includes(serviceKey)) return true;
  // Full-platform / annual plans unlock all workflow services even if USS rows lag
  return getEffectiveTierLevel(tier) >= TIER_LEVEL.enterprise;
}

/**
 * Platform tabs visible in TopNav. Workflow tabs stay visible for all authenticated
 * users; admin/staff-only tabs are filtered by role. Tier/subscription gates apply on click.
 */
export function filterPlatformNavigation<T extends { tabKey: string; adminOnly?: boolean; staffOnly?: boolean }>(
  navigation: T[],
  opts: { userRole?: string | null; userType?: string | null },
): T[] {
  const userRole = opts.userRole || '';
  const userType = opts.userType || 'customer';
  return navigation.filter((item) => {
    if (item.adminOnly) {
      return userType === 'staff' && canAccessPlatformTab(userRole, item.tabKey);
    }
    if (item.staffOnly) {
      return userType === 'staff' && canAccessPlatformTab(userRole, item.tabKey);
    }
    return true;
  });
}

/** True when a tab should show the lock icon (tier, subscription, or role block). */
export function isPlatformTabLocked(
  tabKey: string,
  opts: {
    userRole?: string | null;
    userTier?: string | null;
    userType?: string | null;
    subscribedServices?: string[];
  },
): boolean {
  const { userRole, userTier, userType = 'customer', subscribedServices = [] } = opts;
  if (userType === 'customer') {
    if (!customerHasServiceForTab(tabKey, subscribedServices, userTier)) return true;
    return !canAccessFeature(userRole, userTier, tabKey, userType);
  }
  if (!canAccessPlatformTab(userRole, tabKey)) return true;
  return !canAccessFeature(userRole, userTier, tabKey, userType);
}

/** Route guard + navigation — may the user open this tab? */
export function canNavigateToPlatformTab(
  tabKey: string,
  opts: {
    userRole?: string | null;
    userTier?: string | null;
    userType?: string | null;
    subscribedServices?: string[];
  },
): boolean {
  return !isPlatformTabLocked(tabKey, opts);
}

/** @deprecated Use filterPlatformNavigation — tabs are shown, not hidden, for customers. */
export function buildCustomerNavigation<T extends { tabKey?: string; key?: string; adminOnly?: boolean }>(
  navigation: T[],
  subscribedServices: string[],
): T[] {
  return navigation.filter(item => {
    const tabKey = item.tabKey || item.key || '';
    if (item.adminOnly || tabKey === 'admin') return false;
    if (tabKey === 'overview' || tabKey === 'e-sign') return true;
    const serviceKey = TAB_TO_SERVICE_KEY[tabKey];
    if (serviceKey) return subscribedServices.includes(serviceKey);
    return false;
  });
}

/**
 * Check if a customer is a service admin (can invite team members).
 */
export function isCustomerServiceAdmin(serviceRole: string | undefined | null): boolean {
  return serviceRole === 'service_admin';
}

/**
 * Get the customer's service role for a given service.
 * Returns from RBAC config (populated by backend from user_service_subscriptions).
 */
export function getCustomerServiceRole(serviceKey: string): string | undefined {
  const config = getRbacConfig();
  return config?.customerServiceRoles?.[serviceKey];
}

/**
 * Roles that a service_admin can invite for each service.
 * Excludes service_admin (only org owner gets that; cannot invite another admin from UI).
 */
export const CUSTOMER_INVITABLE_ROLES: Record<string, Array<{ key: CustomerServiceRole; label: string }>> = {
  valuations: [
    { key: 'senior_associate', label: 'Senior Valuation Associate' },
    { key: 'associate', label: 'Valuation Associate' },
    { key: 'finance_officer', label: 'Finance Officer' },
    { key: 'viewer', label: 'Viewer' },
  ],
  crm: [
    { key: 'sales_manager', label: 'Sales Manager' },
    { key: 'sales_agent', label: 'Sales Agent' },
    { key: 'viewer', label: 'Viewer' },
  ],
  projects: [
    { key: 'project_manager', label: 'Project Manager' },
    { key: 'site_supervisor', label: 'Site Supervisor' },
    { key: 'quantity_surveyor', label: 'Quantity Surveyor' },
    { key: 'viewer', label: 'Viewer' },
  ],
  property_management: [
    { key: 'property_manager', label: 'Property Manager' },
    { key: 'leasing_agent', label: 'Leasing Agent' },
    { key: 'maintenance_coordinator', label: 'Maintenance Coordinator' },
    { key: 'accounts_officer', label: 'Accounts Officer' },
    { key: 'viewer', label: 'Viewer' },
  ],
  analytics: [
    { key: 'analyst', label: 'Analyst' },
    { key: 'viewer', label: 'Viewer' },
  ],
};
