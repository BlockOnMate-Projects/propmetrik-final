/**
 * Frontend RBAC — Role-Based Access Control + Subscription Tier Gating
 *
 * Mirrors the backend authorization_policies from migration 152.
 * Controls which platform services and sub-tabs a given role can see.
 * Also enforces subscription tier limits on features.
 *
 * Role hierarchy (lower = more authority):
 *   1  super_admin        — Full system access (platform owner)
 *  10  firm_principal     — Director / Principal Valuer
 *  15  admin              — Organization admin
 *  20  senior_valuer      — Lead Valuer, QA
 *  25  manager            — Team manager
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
// Platform-level service tabs (TopNav)
// ---------------------------------------------------------------------------

/** Which roles can see each top-level service tab */
const platformTabAccess: Record<string, UserRole[]> = {
  // Everyone who logs in sees overview
  overview: [
    'super_admin', 'firm_principal', 'admin', 'senior_valuer', 'manager',
    'valuer', 'finance_manager', 'compliance_officer', 'agent',
    'probationer', 'inspector', 'analyst', 'viewer',
  ],

  // Valuation service — valuation-category roles + management roles
  valuations: [
    'super_admin', 'firm_principal', 'admin', 'senior_valuer', 'manager',
    'valuer', 'finance_manager', 'compliance_officer', 'agent',
    'probationer', 'inspector', 'analyst',
  ],

  // Deals — only management/admin roles (not valuation-only roles)
  deals: [
    'super_admin', 'admin', 'manager', 'agent', 'firm_principal',
  ],

  // Projects — management/admin
  projects: [
    'super_admin', 'admin', 'manager', 'firm_principal',
  ],

  // Platform analytics — senior roles
  analytics: [
    'super_admin', 'admin', 'firm_principal', 'manager', 'analyst',
  ],

  // Property management — management/admin
  'property-management': [
    'super_admin', 'admin', 'manager', 'firm_principal',
  ],

  // E-Sign — anyone who generates or reviews reports
  'e-sign': [
    'super_admin', 'admin', 'firm_principal', 'senior_valuer', 'manager',
  ],

  // Admin panel — platform admins only
  admin: [
    'super_admin', 'admin',
  ],
};

// ---------------------------------------------------------------------------
// Subscription tier requirements per feature
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

/** Feature keys map to platform tabs and sub-features */
export const featureGates: Record<string, FeatureGate> = {
  // --- Platform tabs ---
  overview:             { minTier: 'starter',      label: 'Dashboard Overview',    description: 'Real-time overview of your organization\'s metrics' },
  valuations:           { minTier: 'starter',      label: 'Valuations',            description: 'Property valuation management and reporting' },
  deals:                { minTier: 'professional',  label: 'Deal Pipeline',         description: 'Full CRM deal pipeline tracking and management' },
  projects:             { minTier: 'professional',  label: 'Project Management',    description: 'Construction and development project tracking' },
  analytics:            { minTier: 'professional',  label: 'Market Analytics',       description: 'Advanced market intelligence and trend analysis' },
  'property-management':{ minTier: 'professional',  label: 'Property Management',   description: 'Tenant, lease, and facility management' },
  'e-sign':             { minTier: 'professional',  label: 'E-Sign',                description: 'Digital document signing and verification' },
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
};

// ---------------------------------------------------------------------------
// Valuation sub-tabs
// ---------------------------------------------------------------------------

/** Which roles can see each valuation sub-tab */
const valuationTabAccess: Record<string, UserRole[]> = {
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
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Check if a role can access a platform-level service tab.
 */
export function canAccessPlatformTab(role: string | undefined | null, tabKey: string): boolean {
  if (!role) return false;
  const allowed = platformTabAccess[tabKey];
  if (!allowed) return false;
  return allowed.includes(role as UserRole);
}

/**
 * Check if a role can access a valuation sub-tab.
 */
export function canAccessValuationTab(role: string | undefined | null, tabKey: string): boolean {
  if (!role) return false;
  const allowed = valuationTabAccess[tabKey];
  if (!allowed) return false;
  return allowed.includes(role as UserRole);
}

/**
 * Check if a subscription tier meets the minimum requirement for a feature.
 * super_admin always gets full access regardless of tier.
 */
export function canAccessFeature(
  role: string | undefined | null,
  tier: string | undefined | null,
  featureKey: string
): boolean {
  // super_admin bypasses all tier restrictions
  if (role === 'super_admin') return true;
  
  const gate = featureGates[featureKey];
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
  featureKey: string
): FeatureGate | null {
  if (canAccessFeature(role, tier, featureKey)) return null;
  return featureGates[featureKey] || null;
}

/**
 * Check if a role has both role-based AND tier-based access to a platform tab.
 */
export function canFullyAccessTab(
  role: string | undefined | null,
  tier: string | undefined | null,
  tabKey: string
): { hasRoleAccess: boolean; hasTierAccess: boolean; gate: FeatureGate | null } {
  const hasRoleAccess = canAccessPlatformTab(role, tabKey);
  const hasTierAccess = canAccessFeature(role, tier, tabKey);
  const gate = !hasTierAccess ? (featureGates[tabKey] || null) : null;
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
  return ['super_admin', 'admin', 'firm_principal', 'senior_valuer', 'manager'].includes(role);
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
  const gate = featureGates[featureKey];
  if (!gate) return 'Starter';
  return getTierDisplayName(gate.minTier);
}
