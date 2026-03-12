# PROPMETRIK — Centralized RBAC System

> **Version:** 1.0  
> **Last Updated:** June 2025  
> **Authors:** Engineering Team  
> **Status:** Specification & Audit  

This document serves as the **single source of truth** for Role-Based Access Control (RBAC) across the entire PROPMETRIK platform. It covers the current state audit, identifies critical gaps, and specifies the target architecture for a centralized, secure, and maintainable authorization system.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [User Types](#2-user-types)
3. [Role Hierarchy](#3-role-hierarchy)
4. [Subscription Tier Gating](#4-subscription-tier-gating)
5. [Authentication Layer](#5-authentication-layer)
6. [Authorization Layer](#6-authorization-layer)
7. [Per-Service Authorization Matrix](#7-per-service-authorization-matrix)
8. [Keycloak Integration](#8-keycloak-integration)
9. [Centralized User Invite System](#9-centralized-user-invite-system)
10. [Current State Audit & Findings](#10-current-state-audit--findings)
11. [Implementation Plan](#11-implementation-plan)

---

## 1. Architecture Overview

### Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTS                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Frontend    │  │ Tenant Portal│  │  Mobile / External   │  │
│  │  (Next.js)   │  │  (Next.js)   │  │      API Clients     │  │
│  │  Port 3000   │  │  Port 3001   │  │                      │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                      │              │
│  ┌──────┴───────┐  ┌──────┴───────┐              │              │
│  │   NextAuth   │  │ Client-side  │              │              │
│  │   (JWT)      │  │ Token Auth   │              │              │
│  └──────┬───────┘  └──────┬───────┘              │              │
└─────────┼─────────────────┼──────────────────────┼──────────────┘
          │                 │                      │
          ▼                 ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND (Express.js)                          │
│                       Port 4000                                  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              authenticate middleware                      │   │
│  │   1. Extract Bearer JWT                                   │   │
│  │   2. Try Keycloak JWKS verification                       │   │
│  │   3. Fallback: local JWT verification                     │   │
│  │   4. Check token blacklist (Redis)                        │   │
│  │   5. Attach AuthenticatedUser to req.user                 │   │
│  └──────────────────────┬───────────────────────────────────┘   │
│                         │                                        │
│  ┌──────────────────────┴───────────────────────────────────┐   │
│  │            authorize(resourceType, action)                │   │
│  │   1. super_admin bypass                                   │   │
│  │   2. Query authorization_policies table (5-min cache)     │   │
│  │   3. Match user DB role against allowed_roles[]           │   │
│  │   4. Dev: fail-open / Prod: fail-closed                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  requireRoles │  │requireOrg    │  │requireResourcePerm   │   │
│  │  (role check) │  │(org check)   │  │(owner check)         │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│                                                                  │
│                    ┌──────────────────┐                          │
│                    │   PostgreSQL     │                          │
│                    │   • users        │                          │
│                    │   • tenants      │                          │
│                    │   • auth_policies│                          │
│                    └──────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│               KEYCLOAK (sso.cedynhq.com)                        │
│               Realm: propmetrik                                  │
│                                                                  │
│  Clients:                                                        │
│  • propmetrik-api         (backend service account)              │
│  • propmetrik-web         (frontend SSO)                         │
│  • propmetrik-tenant-portal (tenant portal SSO)                  │
│  • propmetrik-esign       (e-sign service)                       │
│  • propmetrik-automation-admin (automation)                      │
└─────────────────────────────────────────────────────────────────┘
```

### Target Architecture (Centralized)

The target state consolidates all RBAC decisions through a **single authorization pipeline**:

```
Request → authenticate → resolveUserType → route to handler
                                │
                                ├── user_type = staff?
                                │     ├── All services: ✅ ALLOWED (no role check needed)
                                │     ├── /admin routes: Check role (admin, super_admin only)
                                │     └── Shared services (e-sign): ✅ ALLOWED
                                │
                                ├── user_type = customer?
                                │     ├── Subscribed services: ✅ FULL ADMIN within service
                                │     ├── Non-subscribed services: ❌ DENIED
                                │     ├── /admin routes: ❌ ALWAYS DENIED
                                │     └── Shared services (e-sign): ✅ ALLOWED
                                │
                                └── Organization scope + resource ownership (both types)
```

---

## 2. User Types

### Current State

There is **no `user_type` column** in the database. Staff and customers (tenants) are separated by **different tables**:

| Attribute | Staff (`users` table) | Customer (`tenants` table) |
|-----------|----------------------|---------------------------|
| Auth method | Email/password (local JWT) or Keycloak SSO | Magic link, OTP, email/password, or Keycloak OIDC |
| Role storage | `users.role` (`user_role_enum`) | No role column (implicit "tenant") |
| Org binding | `users.organization_id` | `tenants.organization_id` |
| Keycloak ID | `users.keycloak_id` | `tenants.keycloak_user_id` |
| Portal access | Main dashboard (port 3000) | Tenant portal (port 3001) |
| JWT source | Backend `/auth/login` or Keycloak | `tenantAuthService` + Keycloak |

### Proposed User Type System

Add a `user_type` discriminator to enable centralized RBAC decisions:

```sql
-- Migration: Add user_type to users table
ALTER TABLE users ADD COLUMN user_type VARCHAR(20) NOT NULL DEFAULT 'staff';

-- Valid values: 'staff', 'customer'
ALTER TABLE users ADD CONSTRAINT chk_user_type 
  CHECK (user_type IN ('staff', 'customer'));

-- Index for fast filtering
CREATE INDEX idx_users_user_type ON users(user_type);
```

#### User Type Definitions

| User Type | Description | How Created | Auth Method | Default Role | Access Scope |
|-----------|-------------|-------------|-------------|--------------|--------------|
| `staff` | Internal organization members (valuers, admins, agents, managers) **and** automated integrations (API clients) | Invited by org admin via invite system, self-signup with company, or created by super_admin (for API clients) | Keycloak SSO + local JWT, or API key / client_credentials (for `api_client` role) | Per invitation or `firm_principal` (self-signup) | **All services** regardless of role. Role only gates `/admin` panel access. Staff with `api_client` role are scoped by their API permissions. |
| `customer` | External subscribers — companies or individuals who purchase access to specific platform services | Invited by org admin, self-signup via marketplace, or sales onboarding | Keycloak SSO, magic link, OTP | No role needed (access via service subscription) | **Full admin within subscribed service(s).** Can do everything within a service they've paid for. Never sees `/admin`. Access scoped by `user_service_subscriptions` table. |

#### Unified User Table (Target State)

In the target state, **merge `tenants` into `users`** with `user_type = 'customer'`:

```sql
-- New columns on users table for customer data
ALTER TABLE users ADD COLUMN portal_access_status VARCHAR(20) DEFAULT 'not_invited';
ALTER TABLE users ADD COLUMN portal_invited_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN portal_invite_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN property_ids UUID[]; -- For customers: which properties they're linked to
ALTER TABLE users ADD COLUMN lease_ids UUID[];    -- For customers: active leases
```

> **Migration Strategy:** Keep the `tenants` table as a view during transition. Create the unified `users` rows with `user_type = 'customer'` and maintain a foreign key back to tenants for backward compatibility.

#### User Type Middleware

```typescript
// backend/src/middleware/userType.ts
export function requireUserType(...allowedTypes: UserType[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    
    const userType = req.user.userType || 'staff'; // backward-compatible default
    
    if (!allowedTypes.includes(userType)) {
      return res.status(403).json({ 
        error: 'Access denied',
        message: `This endpoint requires user type: ${allowedTypes.join(' or ')}`
      });
    }
    next();
  };
}

// Usage examples:
router.get('/tenant/dashboard', authenticate, requireUserType('customer'), handler);
router.get('/admin/users',      authenticate, requireUserType('staff'), requireAdmin, handler);
router.post('/api/ingest',      authenticate, requireUserType('staff'), requireRoles('api_client', 'admin', 'super_admin'), handler);
```

---

## 3. Role Hierarchy

### Current Roles

#### Backend Roles (`user_role_enum` — 13 roles)

| Priority | Role | Description | Scope |
|----------|------|-------------|-------|
| 1 | `super_admin` | Platform owner. Bypasses all authorization checks. | Global |
| 2 | `firm_principal` | Organization director / principal valuer | Organization |
| 3 | `admin` | Organization administrator | Organization |
| 4 | `senior_valuer` | Lead valuer, quality assurance | Organization |
| 5 | `manager` | Team manager | Organization |
| 6 | `valuer` | Licensed valuer | Organization |
| 7 | `finance_manager` | Finance & billing | Organization |
| 8 | `compliance_officer` | Regulatory compliance | Organization |
| 9 | `agent` | Real estate agent / deal pipeline | Organization |
| 10 | `probationer` | Trainee (supervised access) | Organization |
| 11 | `inspector` | Field inspections | Organization |
| 12 | `analyst` | Read-only analytics | Organization |
| 13 | `viewer` | Read-only basic access | Organization |

#### Frontend Roles (`rbac.ts` — 14 roles)

All of the above **plus**:

| Priority | Role | Description | Status |
|----------|------|-------------|--------|
| 5.5 | `project_manager` | Project management access | **⚠️ EXISTS IN FRONTEND ONLY — NOT IN `user_role_enum`** |

#### Proposed Additions

| Role | User Type | Description | Priority |
|------|-----------|-------------|----------|
| `project_manager` | staff | **Must be added to `user_role_enum`** — already in frontend | 5.5 |
| `api_client` | staff | Automated integrations, API keys, webhook processors. Created by super_admin. Authenticates via API key or `client_credentials`. Can be flagged `is_service_account = true` to hide from team UIs. | 16 |

```sql
-- Migration: Add missing roles to user_role_enum
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'project_manager';
ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'api_client';
```

> **Note:** Customers do NOT need separate roles like `tenant` or `property_owner`. Customers are full admins within their subscribed service — their access is scoped by **service subscription**, not by role. The `user_type = 'customer'` column plus the `user_service_subscriptions` table handles this.
>
> **Note:** There is no `service_account` user type. Automated integrations use the `api_client` **staff role** instead. Auth method differences (API key vs SSO) are handled at the authentication layer. Add `is_service_account BOOLEAN DEFAULT FALSE` to the users table to hide bot/integration accounts from team UIs without introducing a third user type.

### Role Scope: What Roles Actually Control

For **staff**, roles control **very little** — only `/admin` panel access:

| What | Controlled By | Who Can |
|------|---------------|---------|
| Access any service (valuations, PM, CRM, etc.) | `user_type = 'staff'` | **All staff, regardless of role** |
| View/use E-Sign | `authenticate` only | All authenticated users |
| Access `/admin` panel | `requireRoles('admin', 'super_admin')` | Only admin + super_admin |
| Manage payments & billing | `requireRoles('admin', 'super_admin')` | Only admin + super_admin |
| Manage API keys | `requireRoles('super_admin')` | Only super_admin |
| Platform configuration | `requireRoles('super_admin')` | Only super_admin |
| Invite team members | `requireRoles('admin', 'manager', 'super_admin')` | Admin, manager, super_admin |

For **customers**, access is controlled by **service subscription**:

| What | Controlled By | Who Can |
|------|---------------|---------|
| Access a service | `requireServiceAccess(serviceKey)` | Customers subscribed to that service |
| Full admin within service | Automatic (customer = admin of their service) | All subscribed customers |
| Access `/admin` panel | **BLOCKED** by `requireStaffOnly()` | Never — no customer ever |
| Use E-Sign | `authenticate` only | All customers (shared service) |
| Invite their own team | `requireServiceAccess` + own org | Customers within their org |

### Role Hierarchy (Staff Only)

This hierarchy is for staff roles and **only applies to `/admin` features and team management**:

```
super_admin  ← Platform owner (staff only, never customer)
  └── firm_principal
       └── admin
            ├── senior_valuer
            │    └── valuer
            │         └── probationer
            ├── manager
            │    ├── project_manager
            │    ├── agent
            │    └── inspector
            ├── finance_manager
            ├── compliance_officer
            └── analyst
                 └── viewer
```

> **Critical:** All of these roles can access ALL platform services. The hierarchy only matters for `/admin` access, team invitations, and org-level management operations.

### Invitable Roles

Roles that organization admins can invite (all except `super_admin`):

```typescript
const INVITABLE_ROLES = new Set([
  'firm_principal', 'admin', 'senior_valuer', 'manager',
  'project_manager', 'valuer', 'finance_manager', 'compliance_officer',
  'agent', 'probationer', 'inspector', 'analyst', 'viewer'
]);
```

### Valuation Team Roles (Per-Assignment)

Separate from org roles, these are assigned per-valuation:

| Team Role | Description |
|-----------|-------------|
| `lead_valuer` | Lead on the valuation assignment |
| `valuer` | Assigned valuer |
| `reviewer` | QA reviewer |
| `trainee` | Learning / shadowing |
| `inspector` | Site inspector |

---

## 4. Subscription Tier Gating

### How Tiers Apply by User Type

| User Type | How tiers work |
|-----------|----------------|
| **Staff** | Staff do NOT have tier restrictions on services. Tiers are irrelevant — staff can access everything. The organization's plan level may gate some advanced features (AI forecasting, blockchain, API access), but basic service access is unrestricted. |
| **Customer** | Tiers are **per-service subscription**. A customer subscribed to Valuations at the `professional` tier gets more features within Valuations than a `starter` customer. Tiers gate features within a service, not service access itself. |

### Tiers

| Tier | Level | Description |
|------|-------|-------------|
| `free` | 0 | Self-signup default (limited access) |
| `starter` | 1 | Basic feature set within a service |
| `professional` | 2 | Full features within a service |
| `enterprise` | 3 | AI, API access, blockchain, custom reports |

### Feature-to-Tier Mapping (Within a Service)

| Feature | Min Tier | Applies To |
|---------|----------|------------|
| Dashboard Overview | starter | All users (staff + customer) |
| Valuations | starter | Customers subscribed to valuations; all staff |
| Admin Panel | starter | Staff with admin/super_admin role ONLY |
| Deal Pipeline | professional | Customers subscribed to CRM; all staff |
| Project Management | professional | Customers subscribed to projects; all staff |
| Market Analytics | professional | Customers subscribed; all staff |
| Property Management | professional | Customers subscribed to PM; all staff |
| E-Sign | — (shared) | All authenticated users (no tier gating) |
| Risk Assessment | professional | Within subscribed analytics |
| Geographic Intelligence | professional | Within subscribed analytics |
| Data Hub | professional | Customers subscribed; all staff |
| Bulk Valuations | professional | Within subscribed valuations |
| AI Forecasting | enterprise | Within subscribed analytics |
| API Access | enterprise | Staff admin only; or enterprise customer |
| Custom Reports | enterprise | Enterprise tier within any service |
| Portfolio Analysis | enterprise | Enterprise tier within valuations/PM |
| Blockchain Verification | enterprise | Enterprise tier |

### Current Enforcement Status

| Layer | Enforced? | Method |
|-------|-----------|--------|
| **Frontend** | ✅ Yes | `canAccessFeature()` in `rbac.ts` checks tier level |
| **Backend** | ❌ **NO** | Tier is in JWT but no middleware checks it |

### Proposed: Backend Tier Middleware

```typescript
// backend/src/middleware/tierGuard.ts
export function requireTier(minTier: 'starter' | 'professional' | 'enterprise') {
  const TIER_LEVELS = { free: 0, starter: 1, professional: 2, enterprise: 3 };
  
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    
    // super_admin bypasses tier checks
    if (req.user.realmRoles?.includes('super_admin')) return next();
    
    // Staff: tier comes from their organization's plan (or skip if org has no tier limit)
    // Customer: tier comes from their service-specific subscription
    const userType = req.user.userType || 'staff';
    
    if (userType === 'staff') {
      // Staff access is unrestricted for standard features.
      // Only gate truly advanced features (AI, API, blockchain) by org plan.
      const orgTier = await getOrganizationTier(req.user.organizationId);
      if (TIER_LEVELS[orgTier] >= TIER_LEVELS[minTier]) return next();
    } else {
      // Customer: check their service subscription tier
      const serviceTier = req.user.currentServiceTier || 'free';
      if (TIER_LEVELS[serviceTier] >= TIER_LEVELS[minTier]) return next();
    }
    
    return res.status(403).json({
      error: 'Subscription upgrade required',
      requiredTier: minTier
    });
  };
}

// Usage:
router.get('/api/forecasting', authenticate, requireTier('enterprise'), handler);
router.post('/api/bulk-valuations', authenticate, requireTier('professional'), handler);
```

---

## 5. Authentication Layer

### 5.1 Backend Authentication (`backend/src/middleware/auth.ts`)

The `authenticate` middleware implements a **two-layer JWT verification**:

```
Token → Keycloak JWKS verification → success → attach user
                 │
                 └── failure → Local JWT verification → success → attach user
                                        │
                                        └── failure → 401 Unauthorized
```

#### AuthenticatedUser Interface

```typescript
interface AuthenticatedUser {
  sub: string;            // Keycloak subject ID or local user ID
  id: string;             // Alias for sub
  email?: string;
  emailVerified: boolean;
  name?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  realmRoles: string[];   // From Keycloak realm_access.roles
  clientRoles: string[];  // From Keycloak resource_access
  organizationId?: string;
  region?: string;
  // PROPOSED ADDITIONS:
  // userType?: 'staff' | 'customer';
  // tier?: 'free' | 'starter' | 'professional' | 'enterprise';
}
```

#### Request Extensions

```typescript
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      token?: string;
      organizationId?: string;
      userId?: string;
    }
  }
}
```

#### Development Mode Bypass

In `NODE_ENV === 'development'`, if no token is provided, the middleware loads the first `super_admin` user from the database and attaches it to the request. **This must never reach production.**

### 5.2 Frontend Authentication (`frontend/src/auth.ts`)

NextAuth with two providers:

| Provider | Method | Token Source |
|----------|--------|--------------|
| `CredentialsProvider` | Email + password → `POST /api/v1/auth/login` | Backend-issued JWT |
| `KeycloakProvider` | Keycloak SSO (enterprise) | Keycloak-issued JWT |

**Session carries:** `accessToken`, `role`, `tier`, `organizationId`, `organizationName`, `roles[]`

**Strategy:** JWT with 30-day max age.

**No frontend middleware auth guard** — authentication is purely client-side via `useSession()`.

### 5.3 Tenant Portal Authentication

**Completely separate auth system** — does NOT use NextAuth:

| Method | Flow |
|--------|------|
| Magic Link | Email → click link → `verifyMagicLink(token)` → session token |
| Email/Password | Direct grant against Keycloak (`loginWithPassword()`) |
| Keycloak OIDC | Standard authorization code + PKCE flow |

Auth gating is client-side only via `PortalShell.tsx` checking session token presence.

> **⚠️ Known Issue:** The tenant portal's `src/lib/` directory (containing `api.ts` with auth helpers like `getSessionToken`, `clearSession`, etc.) does not exist in the repository. These imports are unresolved.

---

## 6. Authorization Layer

### 6.1 Policy-Based Authorization (`authorize.ts`)

The primary authorization mechanism uses database-driven policies:

#### Database Schema: `authorization_policies`

```sql
CREATE TABLE authorization_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_name VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,   -- e.g., 'valuations', 'finance', 'team'
  action VARCHAR(50) NOT NULL,          -- e.g., 'read', 'write', 'manage', 'delete'
  allowed_roles TEXT[] NOT NULL,        -- e.g., '{admin,manager,valuer}'
  require_ownership BOOLEAN DEFAULT FALSE,
  require_assignment BOOLEAN DEFAULT FALSE,
  require_same_org BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(resource_type, action)
);
```

#### Middleware Behavior

```typescript
authorize(resourceType: string, action: string, options?: {
  superAdminBypass?: boolean;  // default: true
  additionalRoles?: string[];  // roles always allowed
})
```

1. **Super admin bypass** — `super_admin` always passes
2. **Policy lookup** — Queries with 5-minute in-memory cache
3. **Role resolution** — Queries `users.role` from DB (not JWT) for accuracy
4. **Match** — Checks if user's DB role is in the policy's `allowed_roles[]`
5. **Fail behavior** — Dev mode: fail-open / Production: fail-closed

#### ⚠️ Critical Gap: Unenforced Policy Flags

The `require_ownership`, `require_assignment`, and `require_same_org` columns are **loaded from the database but never enforced** in the `authorize()` middleware. This means:

- A valuer in Org A can potentially access valuations from Org B
- A viewer could access resources they don't own if only role-checked
- Assignment-based scoping (e.g., "only assigned valuer can edit") is not applied

### 6.2 Role-Check Middleware (`auth.ts`)

Pre-defined role gates:

```typescript
requireAdmin      = requireRoles('admin', 'super_admin')
requireSuperAdmin = requireRoles('super_admin')
requireAgent      = requireRoles('agent', 'admin', 'super_admin')
requireValuer     = requireRoles('valuer', 'admin', 'super_admin')
requireAnalyst    = requireRoles('analyst', 'admin', 'super_admin')
```

Factory function:

```typescript
requireRoles(...allowedRoles: string[])
// Checks req.user.realmRoles + req.user.clientRoles for any match
```

### 6.3 Organization-Scope Middleware

```typescript
requireOrganization(allowSuperAdmin?: boolean)
// Requires req.user.organizationId to exist
// super_admin bypasses when allowSuperAdmin = true
```

### 6.4 Resource-Permission Middleware

```typescript
requireResourcePermission(
  getResourceOwnerId: (req) => Promise<string | null>,
  allowRoles?: string[]  // default: ['admin', 'super_admin']
)
// Admin/super_admin always pass
// Others must be the resource owner (req.user.sub === ownerId)
// ⚠️ TODO: org-level access check NOT IMPLEMENTED
```

### 6.5 Frontend RBAC (`frontend/src/lib/rbac.ts`)

**Fully hardcoded** — does NOT query the `authorization_policies` table. This creates a **divergence risk** between backend and frontend access rules.

Functions:

| Function | Purpose |
|----------|---------|
| `canAccessPlatformTab(role, tabKey)` | Check role-based tab visibility |
| `canAccessValuationTab(role, tabKey)` | Check valuation sub-tab visibility |
| `canAccessFeature(role, tier, featureKey)` | Combined role + tier gate |
| `canFullyAccessTab(role, tier, tabKey)` | Returns `{ hasRoleAccess, hasTierAccess, gate }` |
| `isAdminRole(role)` | `super_admin` or `admin` |
| `isManagerOrAbove(role)` | `super_admin`, `admin`, `firm_principal`, `senior_valuer`, `manager`, `project_manager` |

---

## 7. Per-Service Authorization Matrix

### Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Authentication + authorization applied correctly |
| ⚠️ | Authentication applied but no role/policy authorization |
| ❌ | **No authentication at all** (mounted without `authenticate`) |
| 🔓 | Intentionally public |

### Route-Level Auth Status

#### ✅ Properly Secured (authenticate + role/policy checks)

| Service | Route | Auth | Authorization |
|---------|-------|------|---------------|
| Workflows | `/api/v1/workflows` | `authenticate` | `requireRoles('admin', 'manager')` + org-scoped queries |
| Enterprise | `/api/v1/enterprise` | `authenticate` (per-route) | `authorize()` policy-based |
| Subscriptions | `/api/v1/subscriptions` | `authenticate` (per-route) | `authorize()` + `requireSuperAdmin` |
| Team | `/api/v1/team` | `authenticate` | Various `requireRoles` |
| Valuation Org | `/api/v1/valuation-org` | `authenticate` (per-route) | `authorize('team', 'manage')` |

#### ⚠️ Authenticated but No Authorization

| Service | Route | Issue | Recommended Fix |
|---------|-------|-------|-----------------|
| Projects | `/api/v1/projects` | `authenticate` at mount, no role checks | Add `authorize('projects', action)` |
| Property Mgmt | `/api/v1/pm` | `authenticate` at mount, no role checks | Add `authorize('property_management', action)` |
| Budget | `/api/v1/budget` | `authenticate` at mount, no role checks | Add `authorize('budget', action)` |
| Calendar | `/api/v1/calendar` | `authenticate` at mount, no role checks | Add `authorize('calendar', action)` |
| Vendors | `/api/v1/vendors` | `authenticate` at mount, no role checks | Add `authorize('vendors', action)` |
| Construction | `/api/v1` (construction) | `authenticate` at mount, no role checks | Add `authorize('construction', action)` |
| RFIs | `/api/v1/rfis` | `authenticate` at mount, no role checks | Add `authorize('rfis', action)` |
| Change Orders | `/api/v1/change-orders` | `authenticate` at mount, no role checks | Add `authorize('change_orders', action)` |
| Submittals | `/api/v1/submittals` | `authenticate` at mount, no role checks | Add `authorize('submittals', action)` |
| Portfolio | `/api/v1/portfolio` | `authenticate` at mount, no role checks | Add `authorize('portfolio', action)` |
| Photos | `/api/v1/photos` | `authenticate` at mount, no role checks | Add `authorize('photos', action)` |
| Checklists | `/api/v1/checklists` | `authenticate` at mount, no role checks | Add `authorize('checklists', action)` |
| Procurement | `/api/v1/procurement` | `authenticate` at mount, no role checks | Add `authorize('procurement', action)` |
| Site Diaries | `/api/v1/site-diaries` | `authenticate` at mount, no role checks | Add `authorize('site_diaries', action)` |
| Governance | `/api/v1` (governance) | `authenticate` at mount, no role checks | Add `authorize('governance', action)` |
| Realtime | `/api/v1/realtime` | `authenticate` at mount, no role checks | Add `authorize('realtime', action)` |

#### ❌ CRITICAL: No Authentication

| Service | Route | Risk | Recommended Fix |
|---------|-------|------|-----------------|
| **Admin** | `/api/v1/admin` | **CRITICAL** — Admin panel API accessible without auth | Add `authenticate` + `requireAdmin` at mount |
| **CRM** | `/api/v1/crm` | **CRITICAL** — Customer data exposed | Add `authenticate` + `authorize('crm', action)` |
| **E-Sign** | `/api/v1/esign` | **CRITICAL** — Legal documents exposed | Add `authenticate` + `authorize('esign', action)` |
| **Analytics** (all 5 routes) | `/api/v1/analytics/*` | **HIGH** — Business intelligence exposed | Add `authenticate` + `authorize('analytics', action)` |
| **Data Hub** | `/api/v1/data-hub` | **HIGH** — Market data exposed | Add `authenticate` + `authorize('data_hub', action)` |
| **Notifications** | `/api/v1/notifications` | **MEDIUM** — User notifications accessible | Add `authenticate` at mount |
| **Messaging** | `/api/v1/messaging` | **MEDIUM** — Internal messages accessible | Add `authenticate` at mount |
| **User Profile** | `/api/v1/user` | **HIGH** — User profile data exposed | Add `authenticate` at mount |
| **Litigation** | `/api/v1/litigation` | **HIGH** — Legal case data exposed | Add `authenticate` + `authorize('litigation', action)` |
| **Short Stay** | `/api/v1/short-stay` | **MEDIUM** — Booking data exposed | Add `authenticate` at mount |
| **Reports** | `/api/v1/reports` | **HIGH** — Valuation reports exposed | Add `authenticate` + `authorize('reports', action)` |
| **Valuers** | `/api/v1/valuers` | **MEDIUM** — Valuer directory exposed | Add `authenticate` at mount |
| **Integrations** | `/api/v1/integrations` | **HIGH** — Integration credentials exposed | Add `authenticate` + `requireAdmin` |
| **RICS Compliance** | `/api/v1/rics-compliance` | **MEDIUM** — Compliance data exposed | Add `authenticate` at mount |
| **Autopilot** | `/api/v1/autopilot` | **HIGH** — AI automation controls exposed | Add `authenticate` + `requireAdmin` |
| **AI (Kobby)** | `/api/v1/ai/kobby` | **MEDIUM** — AI assistant API exposed | Add `authenticate` at mount |
| **Workspace** | `/api/v1/workspace` | **HIGH** — Multi-tenant workspace data | Add `authenticate` + `requireOrganization()` |
| **Charts** | `/api/v1/charts` | **LOW** — Chart data exposed | Add `authenticate` at mount |
| **Publications** | `/api/v1/publications` | **LOW** — Publication data exposed | Add `authenticate` at mount |
| **Ticker** | `/api/v1/ticker` | **LOW** — Market ticker data exposed | Evaluate if public |

> **Note:** Some of these routes may apply `authenticate` inside individual route handlers rather than at mount level. However, the absence of mount-level auth means any new route added to these routers defaults to **unauthenticated** — a dangerous pattern.

#### 🔓 Intentionally Public

| Service | Route | Justification |
|---------|-------|---------------|
| Health | `/health` | Infrastructure health checks |
| Auth | `/api/v1/auth` | Login, signup, password reset |
| Marketplace | `/api/v1/marketplace` | Public marketplace listings |
| Webhooks | `/api/v1/webhooks` | External webhook receivers |
| API Docs | `/api/docs` | OpenAPI documentation |
| Public Properties | `/api/public/properties` | Public property search |

#### 🔀 Special Cases

| Service | Route | Auth | Notes |
|---------|-------|------|-------|
| Valuations | `/api/v1/valuations` | `optionalAuth` | Public read, authenticated write |
| Tenant Portal | `/api/v1/tenant-portal` | Per-route (custom tenant JWT) | Uses tenantAuthService, not standard authenticate |
| Ingestion | `/api/v1/ingestion` | None at mount | May use API key auth internally |
| Contributions | `/api/v1/contributions` | None at mount | Data contribution API |
| Pull Integrations | `/api/v1/pull-integrations` | None at mount | External data pulls |

### 7.1 Per-Service Privilege Definitions

Each service defines its own set of **resource types** and **actions** — these are the values passed to `authorize(resourceType, action)`. This replaces the current generic CRUD approach with granular, service-specific privileges.

**Current coverage:** Only Enterprise uses `authorize()` (100% coverage). All other services need these policies added. Total: **~50 resource types, ~200 distinct actions across 27 services, 700+ endpoints.**

---

#### Valuations Service

**Mount:** `/api/v1/valuations` · **Endpoints:** ~55 · **Current `authorize()` Coverage:** 0%

| Resource Type | Action | Description | Staff Default | Customer (Subscribed) |
|---------------|--------|-------------|---------------|----------------------|
| `valuation` | `list` | List valuations, view stats | All staff | ✅ Full access |
| `valuation` | `read` | View valuation details, HBU, overrides, baskets, reconciliation, engagement | All staff | ✅ Full access |
| `valuation` | `create` | Create new valuation, quick valuation, batch valuation | All staff | ✅ Full access |
| `valuation` | `update` | Edit valuation, update property, reconciliation weights/narrative | All staff | ✅ Full access |
| `valuation` | `delete` | Delete a valuation | All staff | ✅ Full access |
| `valuation` | `run_engine` | Run valuation engine, calculate methods (cost, income, DRC, profits, residual, sales-comparison), land value | All staff | ✅ Full access |
| `valuation` | `search_comparables` | Search/view comparables, rental comparables, rental benchmarks, cap rates | All staff | ✅ Full access |
| `valuation` | `manage_floor_plans` | CRUD floor plans on a valuation | All staff | ✅ Full access |
| `valuation` | `perform_hbu` | Run HBU analysis (legal, physical, financial, productivity, finalize) | All staff | ✅ Full access |
| `valuation` | `override` | Create value overrides | All staff | ✅ Full access |
| `valuation` | `approve_override` | Approve a value override | senior_valuer+ | ✅ Full access |
| `valuation` | `reject_override` | Reject a value override | senior_valuer+ | ✅ Full access |
| `valuation` | `sensitivity_analysis` | Run tornado, Monte Carlo, cap rate sensitivity | All staff | ✅ Full access |
| `valuation` | `reconcile` | Create/update reconciliation, set weights, update narrative, finalize | All staff | ✅ Full access |
| `valuation` | `approve_reconciliation` | Approve final reconciliation | senior_valuer+ | ✅ Full access |
| `valuation` | `lock_reconciliation` | Lock reconciliation (irreversible) | admin+ | ✅ Full access |
| `valuation` | `manage_inspection` | Create/update inspection data | All staff | ✅ Full access |
| `valuation` | `manage_engagement` | Create/view engagement letters | All staff | ✅ Full access |
| `valuation` | `generate_report` | Generate report, view market conditions | All staff | ✅ Full access |

---

#### Valuation Reports Service

**Mount:** `/api/v1/reports` · **Endpoints:** ~33 · **Current `authorize()` Coverage:** 0%

| Resource Type | Action | Description | Staff Default | Customer (Subscribed) |
|---------------|--------|-------------|---------------|----------------------|
| `report` | `list` | List reports | All staff | ✅ Full access |
| `report` | `read` | View report details, status, content, audit log, audit summary, integrity | All staff | ✅ Full access |
| `report` | `create` | Create a new report | All staff | ✅ Full access |
| `report` | `update` | Update report, content, cover, transmittal, certification, disclaimers | All staff | ✅ Full access |
| `report` | `delete` | Delete a report | admin+ | ✅ Full access |
| `report` | `supersede` | Supersede an existing report | senior_valuer+ | ✅ Full access |
| `report` | `manage_photos` | Add/update/delete/reorder photos, view gallery | All staff | ✅ Full access |
| `report` | `submit_review` | Submit report for review | All staff | ✅ Full access |
| `report` | `approve` | Approve a report (QA gate) | senior_valuer+ | ❌ Not applicable |
| `report` | `reject` | Reject a report | senior_valuer+ | ❌ Not applicable |
| `report` | `generate_pdf` | Generate PDF, stream PDF | All staff | ✅ Full access |
| `report` | `download` | Download PDF, DOCX | All staff | ✅ Full access |
| `report` | `prepare_esign` | Send report for e-signature | All staff | ✅ Full access |
| `report` | `verify` | Public report verification (QR code, verify code) | 🔓 Public | 🔓 Public |

---

#### Valuation Org (Team/Firm Management)

**Mount:** `/api/v1/valuation-org` · **Endpoints:** ~14 · **Current `authorize()` Coverage:** 29%

| Resource Type | Action | Description | Staff Default | Customer (Subscribed) |
|---------------|--------|-------------|---------------|----------------------|
| `valuation_org` | `read_invitations` | View invitations list, invitation details | manager+ | ❌ N/A |
| `valuation_org` | `manage_invitations` | Send, cancel, resend invitations | admin+ | ❌ N/A |
| `valuation_org` | `accept_invitation` | Accept an invitation (token-based) | 🔓 Public (token auth) | 🔓 Public (token auth) |
| `valuation_org` | `read_members` | View team members, available roles | All staff | ❌ N/A |
| `valuation_org` | `manage_members` | Change member role, remove member | admin+ | ❌ N/A |
| `valuation_org` | `manage_valuation_team` | Assign/remove team members on a specific valuation | manager+ | ❌ N/A |

---

#### Valuation Invoices

**Mount:** `/api/v1/valuation-invoices` · **Endpoints:** ~25 · **Current `authorize()` Coverage:** 0%

| Resource Type | Action | Description | Staff Default | Customer (Subscribed) |
|---------------|--------|-------------|---------------|----------------------|
| `valuation_invoice` | `list` | List invoices | All staff | ✅ Full access |
| `valuation_invoice` | `read` | View invoice details, receipt | All staff | ✅ Full access |
| `valuation_invoice` | `create` | Create an invoice | All staff | ✅ Full access |
| `valuation_invoice` | `update` | Update an invoice | All staff | ✅ Full access |
| `valuation_invoice` | `delete` | Delete an invoice | admin+ | ✅ Full access |
| `valuation_invoice` | `send` | Send invoice to client | All staff | ✅ Full access |
| `valuation_invoice` | `mark_paid` | Mark invoice as paid | finance_manager+ | ✅ Full access |
| `valuation_invoice` | `cancel` | Cancel an invoice | All staff | ✅ Full access |
| `valuation_invoice` | `calculate_fees` | Use fee calculator, view man-day rates | All staff | ✅ Full access |
| `valuation_invoice` | `manage_payment_accounts` | Register/resolve payment accounts, manage crypto wallets | finance_manager+ | ✅ Full access |
| `valuation_invoice` | `crypto_payments` | Crypto payment estimation, initiation, verification | All staff | ✅ Full access |

---

#### Valuation Clients

**Mount:** `/api/v1/valuation-clients` · **Endpoints:** ~8 · **Current `authorize()` Coverage:** 0%

| Resource Type | Action | Description | Staff Default | Customer (Subscribed) |
|---------------|--------|-------------|---------------|----------------------|
| `valuation_client` | `list` | List clients | All staff | ✅ Full access |
| `valuation_client` | `read` | View client details, invoices, valuations | All staff | ✅ Full access |
| `valuation_client` | `create` | Add a new client | All staff | ✅ Full access |
| `valuation_client` | `update` | Update client details | All staff | ✅ Full access |
| `valuation_client` | `delete` | Delete a client | admin+ | ✅ Full access |
| `valuation_client` | `email` | Send email to client | All staff | ✅ Full access |

---

#### Property Management Service

**Mount:** `/api/v1/pm` · **Endpoints:** ~123 · **Current `authorize()` Coverage:** 0%

This is a large service with many sub-resources. Each sub-resource gets its own resource type:

| Resource Type | Action | Description | Staff Default | Customer (Subscribed) |
|---------------|--------|-------------|---------------|----------------------|
| **Properties** | | | | |
| `pm_property` | `list` | List properties | All staff | ✅ Full access |
| `pm_property` | `read` | View property details | All staff | ✅ Full access |
| `pm_property` | `create` | Add a new property | All staff | ✅ Full access |
| `pm_property` | `update` | Update property details | All staff | ✅ Full access |
| `pm_property` | `delete` | Delete a property | admin+ | ✅ Full access |
| **Tenants** | | | | |
| `pm_tenant` | `list` | List tenants | All staff | ✅ Full access |
| `pm_tenant` | `read` | View tenant details | All staff | ✅ Full access |
| `pm_tenant` | `create` | Add a new tenant | All staff | ✅ Full access |
| `pm_tenant` | `update` | Update tenant details | All staff | ✅ Full access |
| `pm_tenant` | `delete` | Delete a tenant | admin+ | ✅ Full access |
| `pm_tenant` | `screen` | Run tenant screening | All staff | ✅ Full access |
| `pm_tenant` | `verify` | Verify tenant identity | All staff | ✅ Full access |
| **Tenancies** | | | | |
| `pm_tenancy` | `list` | List tenancies, view expiring | All staff | ✅ Full access |
| `pm_tenancy` | `read` | View tenancy details, payment summary | All staff | ✅ Full access |
| `pm_tenancy` | `create` | Create a new tenancy | All staff | ✅ Full access |
| `pm_tenancy` | `update` | Update tenancy details | All staff | ✅ Full access |
| `pm_tenancy` | `activate` | Activate a tenancy | manager+ | ✅ Full access |
| `pm_tenancy` | `terminate` | Terminate a tenancy | manager+ | ✅ Full access |
| `pm_tenancy` | `renew` | Renew a tenancy | All staff | ✅ Full access |
| **Payments** | | | | |
| `pm_payment` | `record` | Record a payment | All staff | ✅ Full access |
| `pm_payment` | `read` | View payment details, tenancy payments | All staff | ✅ Full access |
| `pm_payment` | `initialize` | Initialize online payment | All staff | ✅ Full access |
| `pm_payment` | `manage_accounts` | Register/resolve bank accounts, crypto wallets | finance_manager+ | ✅ Full access |
| **Work Orders** | | | | |
| `pm_work_order` | `list` | List work orders, view stats | All staff | ✅ Full access |
| `pm_work_order` | `read` | View work order details | All staff | ✅ Full access |
| `pm_work_order` | `create` | Create a work order | All staff | ✅ Full access |
| `pm_work_order` | `update` | Update a work order | All staff | ✅ Full access |
| `pm_work_order` | `assign` | Assign work order to vendor/staff | manager+ | ✅ Full access |
| `pm_work_order` | `complete` | Mark work order complete | All staff | ✅ Full access |
| `pm_work_order` | `approve_budget` | Approve work order budget | manager+ | ✅ Full access |
| **Reports** | | | | |
| `pm_report` | `read` | View all PM reports (defaulting tenants, collection, vacancy, etc.) | All staff | ✅ Full access |
| **Documents** | | | | |
| `pm_document` | `create` | Upload a document | All staff | ✅ Full access |
| `pm_document` | `list` | List documents, view vault | All staff | ✅ Full access |
| `pm_document` | `verify` | Verify a document | All staff | ✅ Full access |
| `pm_document` | `delete` | Delete a document | admin+ | ✅ Full access |
| **Financials** | | | | |
| `pm_financials` | `create` | Create financial record | finance_manager+ | ✅ Full access |
| `pm_financials` | `read` | View financials, cash flow, ROI, NOI, cap rate, IRR, DSCR, etc. | All staff | ✅ Full access |
| **Bulk Operations** | | | | |
| `pm_bulk` | `rent_increase` | Bulk rent increase | admin+ | ✅ Full access |
| `pm_bulk` | `work_orders` | Bulk work order creation | manager+ | ✅ Full access |
| `pm_bulk` | `status_update` | Bulk status updates | manager+ | ✅ Full access |
| `pm_bulk` | `import` | Bulk import | admin+ | ✅ Full access |
| `pm_bulk` | `export` | Bulk export | All staff | ✅ Full access |
| **Applications** | | | | |
| `pm_application` | `list` | List applications, view stats | All staff | ✅ Full access |
| `pm_application` | `read` | View application details, history, documents | All staff | ✅ Full access |
| `pm_application` | `create` | Create an application | All staff | ✅ Full access |
| `pm_application` | `update` | Update an application | All staff | ✅ Full access |
| `pm_application` | `delete` | Delete an application | admin+ | ✅ Full access |
| `pm_application` | `submit` | Submit application for review | All staff | ✅ Full access |
| `pm_application` | `review` | Start reviewing an application | manager+ | ✅ Full access |
| `pm_application` | `approve` | Approve application | manager+ | ✅ Full access |
| `pm_application` | `reject` | Reject application | manager+ | ✅ Full access |
| `pm_application` | `convert` | Convert application to tenant, generate/send lease | manager+ | ✅ Full access |
| **Lease Templates** | | | | |
| `pm_lease_template` | `list` | List lease templates | All staff | ✅ Full access |
| `pm_lease_template` | `read` | View lease template | All staff | ✅ Full access |
| `pm_lease_template` | `create` | Create a lease template | admin+ | ✅ Full access |
| `pm_lease_template` | `update` | Update a lease template | admin+ | ✅ Full access |
| `pm_lease_template` | `delete` | Delete a lease template | admin+ | ✅ Full access |
| `pm_lease_template` | `preview` | Preview lease from template | All staff | ✅ Full access |
| `pm_lease_template` | `generate` | Generate a lease document | All staff | ✅ Full access |
| **Leases** | | | | |
| `pm_lease` | `generate` | Generate lease document | All staff | ✅ Full access |
| `pm_lease` | `request_signatures` | Request e-signatures on lease | All staff | ✅ Full access |
| `pm_lease` | `read_status` | View signing status | All staff | ✅ Full access |
| `pm_lease` | `sign` | Sign a lease (token-based) | 🔓 Token auth | 🔓 Token auth |
| **Notifications** | | | | |
| `pm_notification` | `send` | Send rent reminders, lease warnings | manager+ | ✅ Full access |
| **Messaging** | | | | |
| `pm_messaging` | `read` | View conversations | All staff | ✅ Full access |
| `pm_messaging` | `send` | Send messages | All staff | ✅ Full access |
| **Audit** | | | | |
| `pm_audit` | `read` | View audit log, resource audit, summary | admin+ | ✅ Full access |
| **Portfolio** | | | | |
| `pm_portfolio` | `read` | View portfolio overview, value, composition, leases | All staff | ✅ Full access |
| **Vendors** | | | | |
| `pm_vendor` | `list` | List vendors | All staff | ✅ Full access |
| `pm_vendor` | `read` | View vendor details | All staff | ✅ Full access |
| `pm_vendor` | `create` | Add a vendor | All staff | ✅ Full access |
| `pm_vendor` | `update` | Update vendor | All staff | ✅ Full access |
| `pm_vendor` | `delete` | Delete vendor | admin+ | ✅ Full access |

---

#### CRM Service

**Mount:** `/api/v1/crm` · **Endpoints:** ~150+ · **Current `authorize()` Coverage:** 0%

CRM is the second largest service. Each sub-module gets its own resource type:

| Resource Type | Action | Description | Staff Default | Customer (Subscribed) |
|---------------|--------|-------------|---------------|----------------------|
| **Contacts** | | | | |
| `crm_contact` | `list` | List contacts, view stats, find duplicates | All staff | ✅ Full access |
| `crm_contact` | `read` | View contact details, lead score, deals, tasks, activities | All staff | ✅ Full access |
| `crm_contact` | `create` | Create a contact | All staff | ✅ Full access |
| `crm_contact` | `update` | Update a contact | All staff | ✅ Full access |
| `crm_contact` | `delete` | Delete a contact | admin+ | ✅ Full access |
| `crm_contact` | `merge` | Merge duplicate contacts | admin+ | ✅ Full access |
| `crm_contact` | `import` | Bulk import contacts | admin+ | ✅ Full access |
| **Companies** | | | | |
| `crm_company` | `list` | List companies, view stats | All staff | ✅ Full access |
| `crm_company` | `read` | View company details, contacts, deals | All staff | ✅ Full access |
| `crm_company` | `create` | Create a company | All staff | ✅ Full access |
| `crm_company` | `update` | Update a company | All staff | ✅ Full access |
| `crm_company` | `delete` | Delete a company | admin+ | ✅ Full access |
| **Agents** | | | | |
| `crm_agent` | `list` | List agents, view stats | All staff | ✅ Full access |
| `crm_agent` | `read` | View agent details, deals, contacts | All staff | ✅ Full access |
| `crm_agent` | `create` | Create an agent profile | admin+ | ✅ Full access |
| `crm_agent` | `update` | Update agent profile | All staff | ✅ Full access |
| `crm_agent` | `delete` | Delete an agent profile | admin+ | ✅ Full access |
| `crm_agent` | `calculate_probability` | Run deal probability calculation | All staff | ✅ Full access |
| **Deals** | | | | |
| `crm_deal` | `list` | List deals, kanban view, view metrics | All staff | ✅ Full access |
| `crm_deal` | `read` | View deal details, status history, activities, tasks, notes, documents | All staff | ✅ Full access |
| `crm_deal` | `create` | Create a deal | All staff | ✅ Full access |
| `crm_deal` | `update` | Update deal details | All staff | ✅ Full access |
| `crm_deal` | `delete` | Delete a deal | admin+ | ✅ Full access |
| `crm_deal` | `move_stage` | Move deal to another pipeline stage | All staff | ✅ Full access |
| `crm_deal` | `change_status` | Change deal status (won/lost/etc.) | All staff | ✅ Full access |
| `crm_deal` | `clone` | Clone a deal | All staff | ✅ Full access |
| **Pipelines** | | | | |
| `crm_pipeline` | `list` | List pipelines, get default | All staff | ✅ Full access |
| `crm_pipeline` | `read` | View pipeline details, metrics | All staff | ✅ Full access |
| `crm_pipeline` | `create` | Create a pipeline | admin+ | ✅ Full access |
| `crm_pipeline` | `update` | Update pipeline | admin+ | ✅ Full access |
| `crm_pipeline` | `delete` | Delete a pipeline | admin+ | ✅ Full access |
| `crm_pipeline` | `clone` | Clone a pipeline | admin+ | ✅ Full access |
| `crm_pipeline` | `manage_stages` | Add/update/delete/reorder stages | admin+ | ✅ Full access |
| **Tasks** | | | | |
| `crm_task` | `list` | List tasks, view overdue | All staff | ✅ Full access |
| `crm_task` | `read` | View task details | All staff | ✅ Full access |
| `crm_task` | `create` | Create a task | All staff | ✅ Full access |
| `crm_task` | `update` | Update a task | All staff | ✅ Full access |
| `crm_task` | `delete` | Delete a task | All staff | ✅ Full access |
| `crm_task` | `complete` | Mark task complete | All staff | ✅ Full access |
| **Commissions** | | | | |
| `crm_commission` | `read_plans` | View commission plans, tiers | All staff | ✅ Full access |
| `crm_commission` | `manage_plans` | Create/update/delete commission plans and tiers | admin+ | ✅ Full access |
| `crm_commission` | `read_records` | View commission records (list, pending, details) | All staff | ✅ Full access |
| `crm_commission` | `approve` | Approve a commission | manager+ | ✅ Full access |
| `crm_commission` | `pay` | Mark commission as paid | finance_manager+ | ✅ Full access |
| `crm_commission` | `clawback` | Claw back a commission | admin+ | ✅ Full access |
| `crm_commission` | `bulk_approve` | Bulk approve commissions | manager+ | ✅ Full access |
| `crm_commission` | `calculate` | Calculate commissions | All staff | ✅ Full access |
| `crm_commission` | `read_statements` | View commission statements | All staff | ✅ Full access |
| `crm_commission` | `generate_statement` | Generate a commission statement | finance_manager+ | ✅ Full access |
| `crm_commission` | `manage_splits` | Create/delete deal splits | manager+ | ✅ Full access |
| `crm_commission` | `manage_adjustments` | Create/approve adjustments | manager+ | ✅ Full access |
| **Drip Campaigns** | | | | |
| `crm_drip_campaign` | `list` | List drip campaigns | All staff | ✅ Full access |
| `crm_drip_campaign` | `read` | View campaign details, enrollments | All staff | ✅ Full access |
| `crm_drip_campaign` | `create` | Create a drip campaign | manager+ | ✅ Full access |
| `crm_drip_campaign` | `update` | Update a drip campaign | manager+ | ✅ Full access |
| `crm_drip_campaign` | `delete` | Delete a drip campaign | admin+ | ✅ Full access |
| `crm_drip_campaign` | `manage_steps` | Add/delete campaign steps | manager+ | ✅ Full access |
| `crm_drip_campaign` | `enroll` | Enroll contacts in campaign | All staff | ✅ Full access |
| **Additional CRM modules** | | | | |
| `crm_analytics` | `read` | View CRM analytics | All staff | ✅ Full access |
| `crm_document` | `list` | List deal/contact documents | All staff | ✅ Full access |
| `crm_document` | `create` | Upload a document | All staff | ✅ Full access |
| `crm_document` | `delete` | Delete a document | admin+ | ✅ Full access |
| `crm_note` | `list` | List notes | All staff | ✅ Full access |
| `crm_note` | `create` | Create a note | All staff | ✅ Full access |
| `crm_note` | `update` | Update a note | All staff | ✅ Full access |
| `crm_note` | `delete` | Delete a note | admin+ | ✅ Full access |
| `crm_email` | `send` | Send an email | All staff | ✅ Full access |
| `crm_email` | `list` | View email history | All staff | ✅ Full access |
| `crm_payment` | `read_accounts` | View payment accounts, banks | All staff | ✅ Full access |
| `crm_payment` | `manage_accounts` | Register accounts, crypto wallets | finance_manager+ | ✅ Full access |
| `crm_payment` | `initiate` | Initiate a payment | All staff | ✅ Full access |
| `crm_saved_view` | `list` | List saved views | All staff | ✅ Full access |
| `crm_saved_view` | `create` | Create a saved view | All staff | ✅ Full access |
| `crm_saved_view` | `update` | Update a saved view | All staff | ✅ Full access |
| `crm_saved_view` | `delete` | Delete a saved view | All staff | ✅ Full access |
| `crm_ai` | `use` | Use AI features (suggestions, insights) | All staff | ✅ Full access |

---

#### Projects Service (Construction/Development)

**Mount:** `/api/v1/projects` · **Endpoints:** ~150+ · **Current `authorize()` Coverage:** 0%

The largest service. Sub-resources get their own resource types:

| Resource Type | Action | Description | Staff Default | Customer (Subscribed) |
|---------------|--------|-------------|---------------|----------------------|
| **Project Core** | | | | |
| `project` | `list` | List projects | All staff | ✅ Full access |
| `project` | `read` | View project details | All staff | ✅ Full access |
| `project` | `create` | Create a project | All staff | ✅ Full access |
| `project` | `update` | Update project details | All staff | ✅ Full access |
| `project` | `delete` | Delete a project | admin+ | ✅ Full access |
| `project` | `change_status` | Change project status | manager+ | ✅ Full access |
| **Phases** | | | | |
| `project_phase` | `list` | List project phases | All staff | ✅ Full access |
| `project_phase` | `create` | Create a phase | manager+ | ✅ Full access |
| `project_phase` | `update` | Update a phase | manager+ | ✅ Full access |
| `project_phase` | `delete` | Delete a phase | admin+ | ✅ Full access |
| `project_phase` | `reorder` | Reorder phases | manager+ | ✅ Full access |
| `project_phase` | `change_status` | Change phase status | manager+ | ✅ Full access |
| **Milestones** | | | | |
| `project_milestone` | `list` | List milestones | All staff | ✅ Full access |
| `project_milestone` | `create` | Create a milestone | manager+ | ✅ Full access |
| `project_milestone` | `update` | Update a milestone | manager+ | ✅ Full access |
| `project_milestone` | `delete` | Delete a milestone | admin+ | ✅ Full access |
| `project_milestone` | `complete` | Mark milestone complete | manager+ | ✅ Full access |
| `project_milestone` | `reschedule` | Reschedule a milestone | manager+ | ✅ Full access |
| **Units (Sales)** | | | | |
| `project_unit` | `list` | List project units | All staff | ✅ Full access |
| `project_unit` | `read` | View unit details | All staff | ✅ Full access |
| `project_unit` | `create` | Create a unit | All staff | ✅ Full access |
| `project_unit` | `update` | Update unit details | All staff | ✅ Full access |
| `project_unit` | `reserve` | Reserve a unit | All staff | ✅ Full access |
| `project_unit` | `sell` | Mark unit as sold | manager+ | ✅ Full access |
| `project_unit` | `handover` | Handover unit to buyer | manager+ | ✅ Full access |
| `project_unit` | `cancel_reservation` | Cancel a reservation | manager+ | ✅ Full access |
| `project_unit` | `manage_payments` | Manage unit payment plans | finance_manager+ | ✅ Full access |
| `project_unit` | `link_deal` | Link unit to CRM deal | All staff | ✅ Full access |
| **Costs** | | | | |
| `project_cost` | `list` | List project costs | All staff | ✅ Full access |
| `project_cost` | `create` | Add a cost | All staff | ✅ Full access |
| `project_cost` | `update` | Update a cost | All staff | ✅ Full access |
| `project_cost` | `delete` | Delete a cost | admin+ | ✅ Full access |
| `project_cost` | `approve` | Approve a cost | manager+ | ✅ Full access |
| `project_cost` | `pay` | Mark cost as paid | finance_manager+ | ✅ Full access |
| `project_cost` | `bulk_approve` | Bulk approve costs | manager+ | ✅ Full access |
| **Contractors** | | | | |
| `project_contractor` | `list` | List contractors | All staff | ✅ Full access |
| `project_contractor` | `create` | Add a contractor | All staff | ✅ Full access |
| `project_contractor` | `update` | Update contractor | All staff | ✅ Full access |
| `project_contractor` | `delete` | Delete a contractor | admin+ | ✅ Full access |
| `project_contractor` | `approve` | Approve a contractor | manager+ | ✅ Full access |
| `project_contractor` | `suspend` | Suspend a contractor | admin+ | ✅ Full access |
| `project_contractor` | `rate` | Rate a contractor | All staff | ✅ Full access |
| `project_contractor` | `manage_assignments` | Assign/unassign contractors | manager+ | ✅ Full access |
| **Draw Requests** | | | | |
| `project_draw_request` | `list` | List draw requests | All staff | ✅ Full access |
| `project_draw_request` | `read` | View draw request details | All staff | ✅ Full access |
| `project_draw_request` | `create` | Create a draw request | All staff | ✅ Full access |
| `project_draw_request` | `submit` | Submit for approval | All staff | ✅ Full access |
| `project_draw_request` | `approve` | Approve a draw request | manager+ | ✅ Full access |
| `project_draw_request` | `reject` | Reject a draw request | manager+ | ✅ Full access |
| `project_draw_request` | `fund` | Fund (disburse) a draw request | finance_manager+ | ✅ Full access |
| **Daily Logs** | | | | |
| `project_daily_log` | `list` | List daily logs | All staff | ✅ Full access |
| `project_daily_log` | `create` | Create a daily log | All staff | ✅ Full access |
| `project_daily_log` | `update` | Update a daily log | All staff | ✅ Full access |
| `project_daily_log` | `delete` | Delete a daily log | admin+ | ✅ Full access |
| `project_daily_log` | `approve` | Approve a daily log | manager+ | ✅ Full access |
| **Punch Lists** | | | | |
| `project_punch_list` | `list` | List punch list items | All staff | ✅ Full access |
| `project_punch_list` | `create` | Create a punch list item | All staff | ✅ Full access |
| `project_punch_list` | `update` | Update a punch list item | All staff | ✅ Full access |
| `project_punch_list` | `assign` | Assign to contractor/team | manager+ | ✅ Full access |
| `project_punch_list` | `complete` | Mark as complete | All staff | ✅ Full access |
| `project_punch_list` | `verify` | Verify completion (QA) | manager+ | ✅ Full access |
| `project_punch_list` | `reject` | Reject completion | manager+ | ✅ Full access |
| **Dashboard & Gantt** | | | | |
| `project_dashboard` | `read` | View project dashboard, alerts | All staff | ✅ Full access |
| `project_gantt` | `read` | View Gantt chart, critical path | All staff | ✅ Full access |

---

#### E-Sign Service (SHARED — No RBAC)

**Mount:** `/api/v1/esign` · **Endpoints:** ~58 · **Type:** Shared utility

E-Sign is a **shared service** available to all authenticated users (staff and customer) regardless of subscription. No `authorize()` or `requireServiceAccess()` needed — just `authenticate`.

However, for **audit logging purposes**, define these actions:

| Resource Type | Action | Description | Access |
|---------------|--------|-------------|--------|
| `esign_request` | `create` | Create a signing request | Any authenticated user |
| `esign_request` | `list` | List signing requests | Any authenticated user (own org) |
| `esign_request` | `read` | View signing request details | Any authenticated user (own) |
| `esign_request` | `void` | Void a signing request | Creator or admin |
| `esign_signing` | `sign` | Sign a document (token-based) | 🔓 Token auth |
| `esign_signing` | `verify` | Verify a signature | 🔓 Public |
| `esign_template` | `list` | List e-sign templates | Any authenticated user (own org) |
| `esign_template` | `create` | Create a template | Any authenticated user |
| `esign_template` | `update` | Update a template | Creator or admin |
| `esign_template` | `delete` | Delete a template | Creator or admin |
| `esign_template` | `clone` | Clone a template | Any authenticated user |
| `esign_envelope` | `list` | List envelopes | Any authenticated user (own org) |
| `esign_envelope` | `create` | Create an envelope | Any authenticated user |
| `esign_envelope` | `void` | Void an envelope | Creator or admin |
| `esign_envelope` | `download` | Download signed documents | Participants |
| `esign_document` | `upload` | Upload a document for signing | Any authenticated user |
| `esign_report` | `read` | View e-sign reports | Any authenticated user (own org) |

---

#### Data Hub Service

**Mount:** `/api/v1/data-hub` · **Endpoints:** ~100+ · **Current `authorize()` Coverage:** 0%

| Resource Type | Action | Description | Staff Default | Customer (Subscribed) |
|---------------|--------|-------------|---------------|----------------------|
| `datahub_source` | `list` | List data sources | All staff | ✅ Full access |
| `datahub_source` | `read` | View data source details | All staff | ✅ Full access |
| `datahub_source` | `create` | Add a data source | admin+ | ✅ Full access |
| `datahub_source` | `update` | Update data source config | admin+ | ✅ Full access |
| `datahub_source` | `delete` | Delete a data source | admin+ | ✅ Full access |
| `datahub_source` | `sync` | Trigger data sync | admin+ | ✅ Full access |
| `datahub_job` | `list` | List sync jobs | All staff | ✅ Full access |
| `datahub_job` | `read` | View job details | All staff | ✅ Full access |
| `datahub_job` | `cancel` | Cancel a running job | admin+ | ✅ Full access |
| `datahub_contribution` | `list` | List data contributions | All staff | ✅ Full access |
| `datahub_contribution` | `create` | Submit a data contribution | All staff | ✅ Full access |
| `datahub_contribution` | `approve` | Approve a contribution | admin+ | ✅ Full access |
| `datahub_contribution` | `reject` | Reject a contribution | admin+ | ✅ Full access |
| `datahub_quality` | `read` | View data quality metrics | All staff | ✅ Full access |
| `datahub_geocoding` | `geocode` | Geocode an address | All staff | ✅ Full access |
| `datahub_geocoding` | `batch_geocode` | Batch geocode addresses | All staff | ✅ Full access |
| `datahub_economic` | `read` | View economic indicators | All staff | ✅ Full access |
| `datahub_economic` | `sync` | Sync economic data | admin+ | ❌ Staff only |
| `datahub_economic` | `seed` | Seed economic data | super_admin | ❌ Staff only |
| `datahub_scheduler` | `read` | View scheduler status | admin+ | ❌ Staff only |
| `datahub_scheduler` | `start` | Start scheduler | admin+ | ❌ Staff only |
| `datahub_scheduler` | `stop` | Stop scheduler | admin+ | ❌ Staff only |
| `datahub_scheduler` | `trigger` | Manually trigger sync | admin+ | ❌ Staff only |
| `datahub_monitoring` | `read` | View monitoring dashboard | admin+ | ❌ Staff only |
| `datahub_config` | `read` | View data hub configuration | admin+ | ❌ Staff only |
| `datahub_config` | `update` | Update configuration | super_admin | ❌ Staff only |
| `datahub_analytics` | `read` | View data hub analytics | All staff | ✅ Full access |
| `datahub_spider` | `list` | List web scrapers | admin+ | ❌ Staff only |
| `datahub_spider` | `start` | Start a scraper | admin+ | ❌ Staff only |
| `datahub_spider` | `stop` | Stop a scraper | admin+ | ❌ Staff only |

---

#### Budget / Finance Service

**Mount:** `/api/v1/budget` · **Endpoints:** ~36 · **Current `authorize()` Coverage:** 0%

| Resource Type | Action | Description | Staff Default | Customer (Subscribed) |
|---------------|--------|-------------|---------------|----------------------|
| `budget_analytics` | `read` | View budget analytics, conversions, variance, forecast, trends | All staff | ✅ Full access |
| `budget_rate_lock` | `create` | Create a rate lock | finance_manager+ | ✅ Full access |
| `budget_rate_lock` | `list` | List rate locks | All staff | ✅ Full access |
| `budget_rate_lock` | `delete` | Delete a rate lock | finance_manager+ | ✅ Full access |
| `budget_snapshot` | `create` | Create a budget snapshot | finance_manager+ | ✅ Full access |
| `budget_alert` | `list` | List budget alerts | All staff | ✅ Full access |
| `budget_alert` | `check` | Trigger alert check | admin+ | ✅ Full access |
| `budget_alert` | `acknowledge` | Acknowledge an alert | All staff | ✅ Full access |
| `budget_invoice` | `list` | List invoices | All staff | ✅ Full access |
| `budget_invoice` | `read` | View invoice details | All staff | ✅ Full access |
| `budget_invoice` | `create` | Create an invoice | All staff | ✅ Full access |
| `budget_invoice` | `update` | Update an invoice | All staff | ✅ Full access |
| `budget_invoice` | `delete` | Delete an invoice | admin+ | ✅ Full access |
| `budget_invoice` | `submit` | Submit invoice for approval | All staff | ✅ Full access |
| `budget_invoice` | `approve` | Approve an invoice | finance_manager+ | ✅ Full access |
| `budget_invoice` | `reject` | Reject an invoice | finance_manager+ | ✅ Full access |
| `budget_invoice` | `pay` | Mark invoice as paid | finance_manager+ | ✅ Full access |
| `budget_expense` | `list` | List expenses | All staff | ✅ Full access |
| `budget_expense` | `read` | View expense details | All staff | ✅ Full access |
| `budget_expense` | `create` | Create an expense (single or bulk) | All staff | ✅ Full access |
| `budget_expense` | `update` | Update an expense | All staff | ✅ Full access |
| `budget_expense` | `delete` | Delete an expense | admin+ | ✅ Full access |
| `budget_expense` | `approve` | Approve an expense | finance_manager+ | ✅ Full access |
| `budget_expense` | `reject` | Reject an expense | finance_manager+ | ✅ Full access |
| `budget_expense` | `bulk_approve` | Bulk approve expenses | finance_manager+ | ✅ Full access |

---

#### Construction Module (RFIs, Change Orders, Submittals, Procurement, Site Diaries)

**Mounts:** `/api/v1/rfis`, `/api/v1/change-orders`, `/api/v1/submittals`, `/api/v1/procurement`, `/api/v1/site-diaries` · **Endpoints:** ~72 · **Current `authorize()` Coverage:** 0%

| Resource Type | Action | Description | Staff Default | Customer (Subscribed) |
|---------------|--------|-------------|---------------|----------------------|
| **RFIs** | | | | |
| `rfi` | `list` | List RFIs | All staff | ✅ Full access |
| `rfi` | `read` | View RFI details | All staff | ✅ Full access |
| `rfi` | `create` | Create an RFI | All staff | ✅ Full access |
| `rfi` | `update` | Update an RFI | All staff | ✅ Full access |
| `rfi` | `submit` | Submit an RFI | All staff | ✅ Full access |
| `rfi` | `assign` | Assign an RFI for response | manager+ | ✅ Full access |
| `rfi` | `respond` | Respond to an RFI | All staff | ✅ Full access |
| `rfi` | `close` | Close an RFI | manager+ | ✅ Full access |
| `rfi` | `void` | Void an RFI | admin+ | ✅ Full access |
| `rfi` | `delete` | Delete an RFI | admin+ | ✅ Full access |
| **Change Orders** | | | | |
| `change_order` | `list` | List change orders | All staff | ✅ Full access |
| `change_order` | `read` | View change order details | All staff | ✅ Full access |
| `change_order` | `create` | Create a change order | All staff | ✅ Full access |
| `change_order` | `update` | Update a change order | All staff | ✅ Full access |
| `change_order` | `submit` | Submit for approval | All staff | ✅ Full access |
| `change_order` | `approve` | Approve a change order | manager+ | ✅ Full access |
| `change_order` | `reject` | Reject a change order | manager+ | ✅ Full access |
| `change_order` | `execute` | Execute (apply) a change order | admin+ | ✅ Full access |
| `change_order` | `void` | Void a change order | admin+ | ✅ Full access |
| `change_order` | `sign` | Sign a change order | All staff | ✅ Full access |
| **Submittals** | | | | |
| `submittal` | `list` | List submittals | All staff | ✅ Full access |
| `submittal` | `read` | View submittal details | All staff | ✅ Full access |
| `submittal` | `create` | Create a submittal | All staff | ✅ Full access |
| `submittal` | `update` | Update a submittal | All staff | ✅ Full access |
| `submittal` | `submit` | Submit for review | All staff | ✅ Full access |
| `submittal` | `assign` | Assign reviewer | manager+ | ✅ Full access |
| `submittal` | `review` | Review a submittal | All staff | ✅ Full access |
| `submittal` | `void` | Void a submittal | admin+ | ✅ Full access |
| `submittal` | `delete` | Delete a submittal | admin+ | ✅ Full access |
| **Procurement** | | | | |
| `procurement` | `list` | List procurement items | All staff | ✅ Full access |
| `procurement` | `read` | View procurement details | All staff | ✅ Full access |
| `procurement` | `create` | Create a procurement request | All staff | ✅ Full access |
| `procurement` | `update` | Update procurement request | All staff | ✅ Full access |
| `procurement` | `submit` | Submit for approval | All staff | ✅ Full access |
| `procurement` | `approve` | Approve procurement | manager+ | ✅ Full access |
| `procurement` | `reject` | Reject procurement | manager+ | ✅ Full access |
| `procurement` | `order` | Place order | finance_manager+ | ✅ Full access |
| `procurement` | `cancel` | Cancel procurement | admin+ | ✅ Full access |
| **Site Diaries** | | | | |
| `site_diary` | `list` | List site diaries | All staff | ✅ Full access |
| `site_diary` | `read` | View site diary | All staff | ✅ Full access |
| `site_diary` | `create` | Create a site diary entry | All staff | ✅ Full access |
| `site_diary` | `update` | Update a site diary entry | All staff | ✅ Full access |
| `site_diary` | `delete` | Delete a site diary entry | admin+ | ✅ Full access |

---

#### Admin Service (STAFF ONLY)

**Mount:** `/api/v1/admin` · **Endpoints:** ~37 · **Current `authorize()` Coverage:** 0%

> ⛔ **All admin routes require `requireStaffOnly()` + `requireAdmin` at minimum.** No customer can ever access admin APIs.

| Resource Type | Action | Description | Who Can |
|---------------|--------|-------------|---------|
| `admin_fees` | `list` | List fee configurations | admin+ |
| `admin_fees` | `update` | Update fee configurations | admin+ |
| `admin_fees` | `create` | Create fee configurations | admin+ |
| `admin_crypto` | `read_status` | View crypto system status | admin+ |
| `admin_crypto` | `manage_wallets` | Manage platform crypto wallets | super_admin |
| `admin_crypto` | `manage_tokens` | Manage accepted tokens | super_admin |
| `admin_crypto` | `read_transactions` | View crypto transactions | admin+ |
| `admin_crypto` | `read_metrics` | View crypto metrics | admin+ |
| `admin_crypto` | `manage_escrow` | Manage escrow settings | super_admin |
| `admin_crypto` | `manage_platform_config` | Manage platform-level crypto config | super_admin |
| `admin_users` | `list` | List all users | admin+ |
| `admin_users` | `read` | View user details | admin+ |
| `admin_users` | `update` | Update user (role, status) | admin+ |
| `admin_users` | `delete` | Delete/deactivate user | super_admin |
| `admin_integrations` | `read` | View integration configs | admin+ |
| `admin_integrations` | `manage` | Manage integration credentials | super_admin |
| `admin_api_keys` | `read` | View API keys | admin+ |
| `admin_api_keys` | `manage` | Create/rotate/delete API keys | super_admin |
| `admin_billing` | `read` | View billing/payment info | admin+ |
| `admin_billing` | `manage` | Manage billing settings | admin+ |
| `admin_platform` | `read_usage` | View platform usage metrics | admin+ |
| `admin_platform` | `read_customer_health` | View customer health scores | admin+ |
| `admin_platform` | `manage_onboarding` | Manage onboarding workflows | super_admin |

---

#### Analytics Service

**Mount:** `/api/v1/analytics` · **Endpoints:** ~9 · **Current `authorize()` Coverage:** 0%

| Resource Type | Action | Description | Staff Default | Customer (Subscribed) |
|---------------|--------|-------------|---------------|----------------------|
| `analytics` | `read_dashboard` | View analytics dashboard | All staff | ✅ Full access |
| `analytics` | `read_cohorts` | View cohort analysis | All staff | ✅ Full access |
| `analytics` | `read_win_loss` | View win/loss analysis | All staff | ✅ Full access |
| `analytics` | `read_funnel` | View funnel analytics | All staff | ✅ Full access |
| `analytics` | `read_velocity` | View deal velocity | All staff | ✅ Full access |
| `analytics` | `read_lead_sources` | View lead source analysis | All staff | ✅ Full access |
| `analytics` | `read_agent_performance` | View agent performance | All staff | ✅ Full access |
| `analytics` | `export` | Export analytics data | All staff | ✅ Full access |

---

#### Additional Services (Smaller)

| Resource Type | Action | Description | Staff Default | Customer (Subscribed) |
|---------------|--------|-------------|---------------|----------------------|
| **Workflows** | | | | |
| `workflow` | `list` | List workflows, stats | All staff | ✅ Full access |
| `workflow` | `read` | View workflow, templates, executions | All staff | ✅ Full access |
| `workflow` | `create` | Create a workflow | admin, manager | ✅ Full access |
| `workflow` | `update` | Update a workflow | admin, manager | ✅ Full access |
| `workflow` | `delete` | Delete a workflow | admin | ✅ Full access |
| `workflow` | `activate` | Activate/deactivate a workflow | admin, manager | ✅ Full access |
| `workflow` | `trigger` | Trigger/dry-run a workflow | admin, manager | ✅ Full access |
| `workflow` | `cancel_execution` | Cancel a running execution | admin, manager | ✅ Full access |
| **Governance** | | | | |
| `governance` | `list` | List frameworks | All staff | ✅ Full access |
| `governance` | `read` | View framework details | All staff | ✅ Full access |
| `governance` | `create` | Create a framework | admin+ | ✅ Full access |
| `governance` | `update` | Update a framework | admin+ | ✅ Full access |
| `governance` | `delete` | Delete a framework | admin+ | ✅ Full access |
| `governance` | `lock` | Lock a framework version | admin+ | ✅ Full access |
| `governance` | `manage_phases` | Manage framework phases | admin+ | ✅ Full access |
| **Publications** | | | | |
| `publication` | `list` | List publications | All staff | ✅ Full access |
| `publication` | `read` | View publication | All staff | ✅ Full access |
| `publication` | `create` | Create a publication | All staff | ✅ Full access |
| `publication` | `update` | Update a publication | All staff | ✅ Full access |
| `publication` | `delete` | Delete a publication | admin+ | ✅ Full access |
| `publication` | `publish` | Publish to public | admin+ | ✅ Full access |
| `publication_ai` | `use` | AI-generated content (sections, insights, SEO) | All staff | ✅ Full access |
| **Autopilot** | | | | |
| `autopilot` | `run` | Run autopilot tasks | admin+ | ❌ Staff only |
| `autopilot` | `read` | View schedules, runs, health, settings | admin+ | ❌ Staff only |
| `autopilot` | `update_settings` | Update autopilot settings | super_admin | ❌ Staff only |
| `autopilot` | `manage_deferred` | Manage/approve deferred actions | admin+ | ❌ Staff only |
| **Litigation** | | | | |
| `litigation` | `read` | View cases, hotspots, trends | All staff | ✅ Full access |
| `litigation` | `assess_risk` | Run risk assessment | All staff | ✅ Full access |
| `litigation` | `refresh` | Refresh litigation data | admin+ | ✅ Full access |
| **Portfolio** | | | | |
| `portfolio` | `read` | View summary, projects, metrics, activity, deadlines | All staff | ✅ Full access |
| **Workspace** | | | | |
| `workspace` | `list` | List workspaces | All staff | ✅ Full access |
| `workspace` | `read` | View workspace details | All staff | ✅ Full access |
| `workspace` | `create` | Create a workspace | All staff | ✅ Full access |
| `workspace` | `update` | Update a workspace | All staff | ✅ Full access |
| `workspace` | `delete` | Delete a workspace | admin+ | ✅ Full access |
| `workspace` | `manage_boards` | CRUD boards within workspace | All staff | ✅ Full access |
| `workspace` | `manage_documents` | CRUD documents in workspace | All staff | ✅ Full access |
| **Short Stay** | | | | |
| `short_stay` | `read` | View metrics, benchmarks, trends, competitive analysis, investment opportunities | All staff | ✅ Full access |
| `short_stay` | `refresh` | Refresh short stay data | admin+ | ✅ Full access |

---

#### Tenant Portal Service (Customer-Scoped)

**Mount:** `/api/v1/tenant-portal` · **Endpoints:** ~48 · **Auth:** `requireTenantAuth` (separate system)

> Tenant portal uses its own auth system (`requireTenantAuth`). These privileges are scoped to the **tenant's own data** — not organization-wide.

| Resource Type | Action | Description | Who Can |
|---------------|--------|-------------|---------|
| `tenant_profile` | `read` | View own profile | Tenant (self) |
| `tenant_profile` | `update` | Update own profile | Tenant (self) |
| `tenant_tenancy` | `list` | List own tenancies | Tenant (self) |
| `tenant_tenancy` | `read` | View tenancy details | Tenant (self) |
| `tenant_payment` | `read_summary` | View payment summary | Tenant (self) |
| `tenant_payment` | `read_history` | View payment history | Tenant (self) |
| `tenant_payment` | `initiate` | Make a payment | Tenant (self) |
| `tenant_payment` | `verify` | Verify payment status | Tenant (self) |
| `tenant_maintenance` | `list` | List maintenance requests | Tenant (self) |
| `tenant_maintenance` | `create` | Submit a maintenance request | Tenant (self) |
| `tenant_maintenance` | `read_status` | Check request status | Tenant (self) |
| `tenant_document` | `list` | View own documents | Tenant (self) |
| `tenant_document` | `upload` | Upload a document | Tenant (self) |
| `tenant_session` | `list` | View active sessions | Tenant (self) |
| `tenant_session` | `delete` | Terminate a session | Tenant (self) |
| `tenant_security` | `change_password` | Change own password | Tenant (self) |
| `tenant_security` | `manage_2fa` | Enable/disable 2FA | Tenant (self) |
| `tenant_notification` | `list` | View notifications | Tenant (self) |
| `tenant_notification` | `mark_read` | Mark notification as read | Tenant (self) |
| `tenant_conversation` | `list` | List conversations | Tenant (self) |
| `tenant_conversation` | `send_message` | Send a message | Tenant (self) |
| `tenant_utility` | `list` | View utility records | Tenant (self) |
| `tenant_utility` | `dispute` | Dispute a utility charge | Tenant (self) |

---

### 7.2 Authorization Coverage Summary

| Service | Total Endpoints | Current `authorize()` | Target Coverage | Priority |
|---------|----------------|----------------------|-----------------|----------|
| **Enterprise** | 17 | **17 (100%)** | 100% ✅ | Done |
| **Subscriptions** | 27 | 8 (30%) | 100% | P0 |
| **Valuation Org** | 14 | 4 (29%) | 100% | P1 |
| **Workflows** | 15 | 0 (uses requireRoles) | Migrate to authorize() | P2 |
| **Admin** | 37 | 0 | 100% | P0 |
| **Valuations** | 55 | 0 | 100% | P1 |
| **Reports** | 33 | 0 | 100% | P1 |
| **CRM** | 150+ | 0 | 100% | P1 |
| **Property Mgmt** | 123 | 0 | 100% | P1 |
| **Projects** | 150+ | 0 | 100% | P2 |
| **Data Hub** | 100+ | 0 | 100% | P2 |
| **Budget/Finance** | 36 | 0 | 100% | P1 |
| **E-Sign** | 58 | 0 (shared) | authenticate only | P0 |
| **Construction** | 72 | 0 | 100% | P2 |
| **Analytics** | 9 | 0 | 100% | P1 |
| **Autopilot** | 15 | 0 | 100% | P2 |
| **Others** | ~80 | 0 | 100% | P3 |
| **Tenant Portal** | 48 | 0 (own auth) | requireTenantAuth | P2 |
| **TOTAL** | **~700+** | **~29 (4%)** | **100%** | — |

> **Enterprise is the gold standard** — every endpoint uses `authorize()` with well-defined resource/action pairs. All other services should follow this exact pattern.

---

### 7.3 Per-Service Sub-Tab Role Scoping

Each service exposes sub-tabs (sections / modules) in the frontend. Not every role should see every sub-tab within a service. This section defines **which roles can access which sub-tabs** inside each service.

**How it works:**
1. Service-level access is gated by `FALLBACK_platformTabAccess` (§7) + service subscription (for customers).
2. Within a service, sub-tabs are further scoped by the user's **role**.
3. `super_admin` and `firm_principal` always see **all** sub-tabs.
4. Tier gating (§4) still applies on top — a role may have access to a sub-tab but their tier may lock advanced features within it.

> **Implementation:** `frontend/src/lib/rbac.ts` exports a `serviceSubTabAccess` map and a `canAccessServiceSubTab(role, serviceKey, subTabKey)` function. Each service layout filters its navigation items through this function.

---

#### 7.3.1 Valuations Sub-Tabs

Already implemented via `FALLBACK_valuationTabAccess` and `canAccessValuationTab()`.

| Sub-Tab | Key | Allowed Roles |
|---------|-----|---------------|
| Valuations | `valuations` | super_admin, firm_principal, admin, senior_valuer, manager, valuer, finance_manager, compliance_officer, agent, probationer, inspector, analyst |
| Team | `team` | super_admin, firm_principal, admin, senior_valuer, manager, valuer, finance_manager, compliance_officer, agent, probationer, inspector, analyst |
| Finance | `finance` | super_admin, firm_principal, admin, finance_manager, compliance_officer, manager |
| Clients | `clients` | super_admin, firm_principal, admin, senior_valuer, manager, valuer, finance_manager, agent |
| Calendar | `calendar` | super_admin, firm_principal, admin, senior_valuer, manager, valuer, agent, probationer, inspector |
| Analytics | `analytics` | super_admin, firm_principal, admin, senior_valuer, finance_manager, compliance_officer, manager, analyst |
| Settings | `settings` | super_admin, firm_principal, admin |

---

#### 7.3.2 Project Management Sub-Tabs

Project management uses grouped navigation (8 groups). Role scoping is per-group.

| Sub-Tab Group | Key | Allowed Roles | Rationale |
|---------------|-----|---------------|-----------|
| Overview | `pm-overview` | super_admin, firm_principal, admin, manager, project_manager, finance_manager, analyst, inspector, viewer | Universal project dashboard |
| Construction | `pm-construction` | super_admin, firm_principal, admin, manager, project_manager, inspector | Site-level construction management |
| Procurement | `pm-procurement` | super_admin, firm_principal, admin, manager, project_manager, finance_manager | Bidding, contracts, contractors |
| Financials | `pm-financials` | super_admin, firm_principal, admin, manager, finance_manager | Costs, budget, invoicing, reports |
| Documents | `pm-documents` | super_admin, firm_principal, admin, manager, project_manager, finance_manager, inspector, viewer | Files, meetings, closeout docs |
| Units | `pm-units` | super_admin, firm_principal, admin, manager, project_manager, agent | Unit tracking & sales |
| Analytics | `pm-analytics` | super_admin, firm_principal, admin, manager, analyst | Project analytics & audit log |
| Settings | `pm-settings` | super_admin, firm_principal, admin | Project configuration |

---

#### 7.3.3 Deal Management (CRM) Sub-Tabs

| Sub-Tab | Key | Allowed Roles | Rationale |
|---------|-----|---------------|-----------|
| Deals | `crm-deals` | super_admin, firm_principal, admin, manager, agent | Core deal pipeline |
| Properties | `crm-properties` | super_admin, firm_principal, admin, manager, agent | Property listings tied to deals |
| Contacts | `crm-contacts` | super_admin, firm_principal, admin, manager, agent | CRM contacts |
| Agents | `crm-agents` | super_admin, firm_principal, admin, manager | Agent management |
| Companies | `crm-companies` | super_admin, firm_principal, admin, manager, agent | Company profiles |
| Tasks | `crm-tasks` | super_admin, firm_principal, admin, manager, agent | Deal tasks & follow-ups |
| Documents | `crm-documents` | super_admin, firm_principal, admin, manager, agent | Deal documents |
| Financials | `crm-financials` | super_admin, firm_principal, admin, manager, finance_manager | Deal financials & commissions |
| Messaging | `crm-messaging` | super_admin, firm_principal, admin, manager, agent | Internal messaging |
| Calendar | `crm-calendar` | super_admin, firm_principal, admin, manager, agent | Appointments & showings |
| Analytics | `crm-analytics` | super_admin, firm_principal, admin, manager, analyst | CRM analytics & reports |
| Workflows | `crm-workflows` | super_admin, firm_principal, admin, manager | Automation workflows |
| Pipelines | `crm-pipelines` | super_admin, firm_principal, admin | Pipeline configuration |

---

#### 7.3.4 Property Management Sub-Tabs

| Sub-Tab | Key | Allowed Roles | Rationale |
|---------|-----|---------------|-----------|
| Overview | `propmgmt-overview` | super_admin, firm_principal, admin, manager, project_manager | Portfolio dashboard |
| Properties | `propmgmt-properties` | super_admin, firm_principal, admin, manager, project_manager | Property CRUD |
| Messages | `propmgmt-messages` | super_admin, firm_principal, admin, manager, project_manager | Tenant communications |
| Portfolios | `propmgmt-portfolios` | super_admin, firm_principal, admin, manager | Portfolio grouping |
| Applications | `propmgmt-applications` | super_admin, firm_principal, admin, manager, project_manager | Rental applications |
| Tenants | `propmgmt-tenants` | super_admin, firm_principal, admin, manager, project_manager | Tenant management |
| Maintenance | `propmgmt-maintenance` | super_admin, firm_principal, admin, manager, project_manager | Work orders & repairs |
| Documents | `propmgmt-documents` | super_admin, firm_principal, admin, manager, project_manager | Leases, contracts |
| Vendors | `propmgmt-vendors` | super_admin, firm_principal, admin, manager | Vendor directory |
| Financials | `propmgmt-financials` | super_admin, firm_principal, admin, manager, finance_manager | Rent collection, NOI, reports |
| Calendar | `propmgmt-calendar` | super_admin, firm_principal, admin, manager, project_manager | Inspections, renewals |

---

#### 7.3.5 Analytics Sub-Tabs

| Sub-Tab | Key | Allowed Roles | Rationale |
|---------|-----|---------------|-----------|
| Market | `analytics-market` | super_admin, firm_principal, admin, manager, project_manager, analyst | General market intelligence |
| Construction | `analytics-construction` | super_admin, firm_principal, admin, manager, project_manager, analyst | Construction cost analytics |
| Affordability | `analytics-affordability` | super_admin, firm_principal, admin, manager, analyst | Housing affordability analysis |
| Valuations | `analytics-valuations` | super_admin, firm_principal, admin, senior_valuer, manager, valuer, analyst | Valuation analytics |
| ML Models | `analytics-ml` | super_admin, firm_principal, admin, analyst | Machine learning models |
| Risk | `analytics-risk` | super_admin, firm_principal, admin, manager, analyst, compliance_officer | Risk assessment |
| Short-Stay | `analytics-short-stay` | super_admin, firm_principal, admin, manager, analyst | Short-stay/Airbnb analytics |
| Forecasting | `analytics-forecasting` | super_admin, firm_principal, admin, analyst | AI price forecasting |
| CRM | `analytics-crm` | super_admin, firm_principal, admin, manager, agent, analyst | CRM performance analytics |
| Geographic | `analytics-geographic` | super_admin, firm_principal, admin, manager, analyst | Spatial/map analytics |
| Management | `analytics-management` | super_admin, firm_principal, admin, manager | Management dashboards |
| Settings | `analytics-settings` | super_admin, firm_principal, admin | Analytics configuration |

---

export class KeycloakService {
  private static instance: KeycloakService;
  private adminToken: { token: string; expiresAt: number } | null = null;

  // Singleton
  static getInstance(): KeycloakService { ... }

  // ─── Core Operations ───────────────────────────────────────
  
  async getAdminToken(): Promise<string>
  // Single implementation replacing 3 duplicates. Caches token until expiry.
  
  async createUser(params: {
    email: string;
    firstName?: string;
    lastName?: string;
    requiredActions?: ('VERIFY_EMAIL' | 'UPDATE_PASSWORD')[];
    emailVerified?: boolean;
    attributes?: Record<string, string[]>;
  }): Promise<{ keycloakUserId: string; isNew: boolean }>
  // Finds existing user by email or creates new one.
  // Sets realm role and custom attributes (user_type, organization_id).
  
  async setPassword(userId: string, password: string, temporary?: boolean): Promise<void>
  // Resets password and clears requiredActions.
  
  async sendActions(userId: string, actions: string[], redirectUri?: string): Promise<void>
  // Triggers Keycloak execute-actions email (UPDATE_PASSWORD, VERIFY_EMAIL).
  
  async deleteUser(userId: string): Promise<void>
  
  async getUserByEmail(email: string): Promise<KeycloakUser | null>
  
  async assignRealmRole(userId: string, roleName: string): Promise<void>
  // Assigns a Keycloak realm role to the user for frontend RBAC.
  
  async revokeRealmRole(userId: string, roleName: string): Promise<void>

  // ─── Token Operations ──────────────────────────────────────
  
  async verifyToken(token: string, clientId: string): Promise<JWTPayload>
  // JWKS verification against the realm's certs endpoint.
  
  async exchangeAuthCode(code: string, redirectUri: string, clientId: string, clientSecret: string, codeVerifier?: string): Promise<TokenSet>
  
  async directGrant(email: string, password: string, clientId: string, clientSecret: string): Promise<TokenSet>
  
  // ─── User Management ──────────────────────────────────────
  
  async syncUserAttributes(userId: string, attrs: {
    userType?: string;
    organizationId?: string;
    role?: string;
    tier?: string;
  }): Promise<void>
  // Updates Keycloak user attributes to match local DB state.
}
```

### 8.3 Invite-Based Auth via Keycloak

When a user is invited (by any service), the flow should be:

```
Admin clicks "Invite" → Backend creates invitation
  │
  ├── 1. Create/find user in Keycloak
  │      - requiredActions: ['UPDATE_PASSWORD']
  │      - emailVerified: true (admin vouched)
  │      - attributes: { user_type, organization_id, role }
  │
  ├── 2. Create org_invitations row
  │      - token (32-byte hex)
  │      - role, organization_id
  │      - expires_at (7 days)
  │      - status: 'pending'
  │
  ├── 3. Send branded invitation email
  │      - Via UnifiedNotificationService (not inline HTML)
  │      - CTA: "Accept Invitation & Set Password"
  │      - Link: {frontendUrl}/accept-invite?token={token}
  │
  └── 4. (SYNC, not fire-and-forget)
         - If Keycloak provisioning fails → roll back invitation
         - Log failure for admin visibility
```

Invitee acceptance flow:

```
Invitee clicks link → /accept-invite?token={token}
  │
  ├── 1. Frontend fetches invitation details (GET /api/v1/invitations/{token})
  │      - Shows: inviter name, org name, role, expiry
  │
  ├── 2. Invitee sets password + optional name
  │      - POST /api/v1/invitations/{token}/accept
  │      - Password set in Keycloak (clears UPDATE_PASSWORD action)
  │      - Password hash stored locally (bcrypt, cost 12)
  │
  ├── 3. Local user created/updated
  │      - email, password_hash, role, organization_id
  │      - keycloak_id linked
  │      - status: 'active'
  │      - user_type: based on invite context
  │
  └── 4. Redirect to login
         - User logs in with email + password
         - Backend verifies against local DB (current) or Keycloak (target)
```

---

## 9. Centralized User Invite System

### 9.1 Current State

There are **two separate invite systems**:

| System | File | For | Token Store | Email Template |
|--------|------|-----|-------------|----------------|
| Org Team Invite | `orgTeamService.ts` | Staff members | `org_invitations` table | Inline HTML (not in unified service) |
| Tenant Portal Invite | `keycloakTenantOnboardingService.ts` | Tenants | `tenants.portal_access_status` | Via unified service (`sendPortalInvite()`) |

### 9.2 Proposed: Unified Invite Service

Merge both systems into a single `InviteService`:

```typescript
// backend/src/services/shared/inviteService.ts

export class InviteService {
  
  // ─── Create Invitation ─────────────────────────────────────
  
  async createInvitation(params: {
    email: string;
    role: OrgRole;
    userType: 'staff' | 'customer';
    organizationId: string;
    invitedById: string;
    message?: string;
    // Customer-specific
    propertyId?: string;
    leaseId?: string;
    // Staff-specific
    department?: string;
    teamId?: string;
    // Options
    expiryDays?: number;      // default: 7
    skipKeycloak?: boolean;   // default: false
  }): Promise<Invitation>
  
  // Flow:
  // 1. Validate role against INVITABLE_ROLES
  // 2. Check for duplicate pending invitations
  // 3. Provision Keycloak user (SYNCHRONOUS, with rollback)
  // 4. Create unified_invitations row
  // 5. Send branded email via UnifiedNotificationService
  // 6. Return invitation with token
  
  // ─── Accept Invitation ─────────────────────────────────────
  
  async acceptInvitation(params: {
    token: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }): Promise<{ userId: string; redirectUrl: string }>
  
  // Flow:
  // 1. Validate token (exists, pending, not expired)
  // 2. Set password in Keycloak
  // 3. Hash password locally (bcrypt)
  // 4. Create/update users row with role, org, user_type, keycloak_id
  // 5. Mark invitation as accepted
  // 6. Return userId and appropriate redirect URL
  // 7. Staff → /dashboard, Customer → /tenant-portal
  
  // ─── Management ────────────────────────────────────────────
  
  async getInvitationByToken(token: string): Promise<InvitationDetails | null>
  async listInvitations(organizationId: string, filters?: InvitationFilters): Promise<Invitation[]>
  async cancelInvitation(invitationId: string, cancelledById: string): Promise<void>
  async resendInvitation(invitationId: string, resentById: string): Promise<void>
  async expireStaleInvitations(): Promise<number>  // Cron job
  
  // ─── Bulk Operations ───────────────────────────────────────
  
  async bulkInvite(params: {
    invitations: Array<{ email: string; role: OrgRole }>;
    userType: 'staff' | 'customer';
    organizationId: string;
    invitedById: string;
  }): Promise<BulkInviteResult>
}
```

### 9.3 Unified Invitations Table

Replace overloaded `org_invitations` with a unified table:

```sql
CREATE TABLE unified_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Invitation target
  email VARCHAR(255) NOT NULL,
  role user_role_enum NOT NULL,
  user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('staff', 'customer')),
  
  -- Organization context
  organization_id UUID NOT NULL REFERENCES organizations(id),
  invited_by_id UUID NOT NULL REFERENCES users(id),
  
  -- Token & status
  token VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  
  -- Customer-specific fields
  property_id UUID REFERENCES properties(id),
  lease_id UUID REFERENCES leases(id),
  
  -- Staff-specific fields
  department VARCHAR(100),
  team_id UUID,
  
  -- Keycloak
  keycloak_user_id VARCHAR(255),
  keycloak_provisioned BOOLEAN DEFAULT FALSE,
  
  -- Messaging
  personal_message TEXT,
  
  -- Tracking
  email_sent_at TIMESTAMPTZ,
  email_resent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Prevent duplicate pending invites to same email+org
  UNIQUE(email, organization_id, status) WHERE (status = 'pending')
);

CREATE INDEX idx_unified_invitations_token ON unified_invitations(token);
CREATE INDEX idx_unified_invitations_email ON unified_invitations(email);
CREATE INDEX idx_unified_invitations_org ON unified_invitations(organization_id);
CREATE INDEX idx_unified_invitations_status ON unified_invitations(status);
CREATE INDEX idx_unified_invitations_expires ON unified_invitations(expires_at) WHERE status = 'pending';
```

### 9.4 Invite API Routes

```typescript
// backend/src/routes/invitations.ts

// ─── Admin/Manager routes (authenticated) ─────────────────

// Send an invitation
POST   /api/v1/invitations
  → authenticate, authorize('invitations', 'create')
  → body: { email, role, userType, message?, propertyId?, leaseId? }

// List org invitations  
GET    /api/v1/invitations
  → authenticate, authorize('invitations', 'read')
  → query: { status?, userType?, page?, limit? }

// Cancel an invitation
DELETE /api/v1/invitations/:id
  → authenticate, authorize('invitations', 'manage')

// Resend invitation email
POST   /api/v1/invitations/:id/resend
  → authenticate, authorize('invitations', 'manage')

// Bulk invite
POST   /api/v1/invitations/bulk
  → authenticate, authorize('invitations', 'create')
  → body: { invitations: [{ email, role }], userType }

// ─── Public routes (token-based) ──────────────────────────

// Get invitation details (for accept page)
GET    /api/v1/invitations/token/:token
  → No auth required (token is the auth)
  → Returns: inviterName, orgName, role, email, expiresAt, status

// Accept invitation and set password
POST   /api/v1/invitations/token/:token/accept
  → No auth required
  → body: { password, firstName?, lastName? }
  → Returns: { success, redirectUrl }
```

### 9.5 Email Templates

Move all invite email templates to the unified notification service:

```typescript
// In UnifiedNotificationService:

// Staff invitation
sendStaffInvitation(params: {
  to: string;
  inviterName: string;
  organizationName: string;
  role: string;
  personalMessage?: string;
  acceptUrl: string;
  expiresAt: Date;
})

// Customer/tenant invitation
sendCustomerInvitation(params: {
  to: string;
  inviterName: string;
  organizationName: string;
  propertyName?: string;
  acceptUrl: string;
  expiresAt: Date;
})

// Invitation reminder (re-send)
sendInvitationReminder(params: {
  to: string;
  organizationName: string;
  role: string;
  acceptUrl: string;
  expiresAt: Date;
})
```

---

## 10. Current State Audit & Findings

### 10.1 Critical Findings

| # | Severity | Finding | Impact | Remediation |
|---|----------|---------|--------|-------------|
| 1 | **CRITICAL** | Admin routes (`/api/v1/admin`) mounted without `authenticate` | Admin panel fully accessible without login | Add `authenticate` + `requireStaffOnly()` + `requireAdmin` at mount |
| 2 | **CRITICAL** | CRM routes (`/api/v1/crm`) mounted without `authenticate` | Customer data, deals, contacts exposed | Add `authenticate` + `requireServiceAccess('crm')` |
| 3 | **CRITICAL** | E-Sign routes (`/api/v1/esign`) mounted without `authenticate` | Legal documents accessible without login | Add `authenticate` only (shared service — no RBAC) |
| 4 | **HIGH** | Analytics routes (5 route sets) mounted without `authenticate` | Business intelligence data exposed | Add `authenticate` + `authorize('analytics', action)` |
| 5 | **HIGH** | `authorize()` loads ownership/assignment/org flags but **never enforces** them | Cross-org data leakage possible | Implement enforcement in `authorize.ts` |
| 6 | **HIGH** | `requireResourcePermission()` has unimplemented org-level access | Users can access resources outside their org | Implement org check with `require_same_org` |
| 7 | **HIGH** | Subscription tier **not enforced server-side** | Users can bypass tier gates by calling API directly | Add `requireTier()` middleware |
| 8 | **HIGH** | User profile routes (`/api/v1/user`) mounted without `authenticate` | Profile data accessible without login | Add `authenticate` at mount level |
| 9 | **MEDIUM** | `x-organization-id` header fallback allows org context injection | Potential org impersonation | Remove header fallback, use JWT org only |
| 10 | **MEDIUM** | `project_manager` role exists in frontend but NOT in backend `user_role_enum` | Role assignment will fail; users can't be invited with this role | Add to `user_role_enum` via migration |
| 11 | **MEDIUM** | Frontend RBAC is hardcoded, divergence risk from DB policies | Frontend may show/hide features incorrectly | Add API endpoint to fetch RBAC config |
| 12 | **MEDIUM** | Org team invite Keycloak provisioning is async fire-and-forget | Invite succeeds even if Keycloak user creation fails | Make synchronous with rollback |
| 13 | **MEDIUM** | `authorization_policies` table has no tracked seed migration | Policies may differ between environments | Create migration 152 with policy seed data |
| 14 | **MEDIUM** | Keycloak admin token logic duplicated in 3 files | Maintenance risk; inconsistency possible | Extract to centralized `KeycloakService` |
| 15 | **LOW** | Dev mode gives `super_admin` to all unauthenticated requests | Could mask auth bugs during development | Add config flag to disable dev bypass |
| 16 | **LOW** | Team invite email template is inline HTML, not in unified service | Inconsistent formatting; hard to maintain | Move to `UnifiedNotificationService` |
| 17 | **INFO** | Login always uses local DB, never Keycloak | Keycloak password changes don't take effect until local sync | Consider optional Keycloak auth in login flow |

### 10.2 Positive Findings (Gold Standard Examples)

| Service | Pattern | Why It's Good |
|---------|---------|---------------|
| **Workflows** | `authenticate` + `requireRoles('admin', 'manager')` + org-scoped queries | Proper layered security |
| **Enterprise** | `authenticate` (per-route) + `authorize()` policy-based | Database-driven, configurable |
| **Subscriptions** | `authorize()` + `requireSuperAdmin` | Multiple middleware layers |
| **Valuation Org** | `authorize('team', 'manage')` for invite actions | Resource-action policies |
| **Tenant Onboarding** | Full Keycloak lifecycle with PKCE, token verify, role resolution | Complete implementation |

---

## 11. Implementation Plan

### Phase 1: Critical Security Fixes (Week 1)

**Goal:** Close all CRITICAL and HIGH auth gaps. Add `authenticate` where missing.

| Task | Priority | Files | Effort |
|------|----------|-------|--------|
| Add `authenticate` + `requireStaffOnly()` + `requireAdmin` to admin routes | P0 | `backend/src/index.ts` | 1 line |
| Add `authenticate` to CRM routes mount | P0 | `backend/src/index.ts` | 1 line |
| Add `authenticate` to eSign routes mount (shared service — no role gating) | P0 | `backend/src/index.ts` | 1 line |
| Add `authenticate` to analytics routes mount (all 5) | P0 | `backend/src/index.ts` | 5 lines |
| Add `authenticate` to user profile routes mount | P0 | `backend/src/index.ts` | 1 line |
| Add `authenticate` to data-hub, litigation, reports, integrations, autopilot, workspace, notifications, messaging routes | P1 | `backend/src/index.ts` | 12 lines |
| Add `requireStaffOnly()` + `requireAdmin` to integrations and autopilot | P1 | `backend/src/index.ts` | 2 lines |
| Implement `require_same_org` enforcement in `authorize.ts` | P1 | `backend/src/middleware/authorize.ts` | ~30 lines |
| Implement `require_ownership` enforcement in `authorize.ts` | P1 | `backend/src/middleware/authorize.ts` | ~30 lines |
| Remove `x-organization-id` header fallback | P2 | `backend/src/middleware/auth.ts` | ~5 lines |

### Phase 2: Centralized Keycloak & Invite System (Week 2-3)

**Goal:** Eliminate code duplication and create a unified invite system.

| Task | Priority | Effort |
|------|----------|--------|
| Create `KeycloakService` singleton | P1 | ~200 lines |
| Refactor `orgTeamService.ts` to use `KeycloakService` | P1 | Refactor ~150 lines |
| Refactor `routes/auth.ts` to use `KeycloakService` | P1 | Refactor ~60 lines |
| Refactor `keycloakTenantOnboardingService.ts` to use `KeycloakService` | P2 | Refactor ~200 lines |
| Create `unified_invitations` table migration | P1 | SQL migration |
| Create `InviteService` | P1 | ~300 lines |
| Create `/api/v1/invitations` routes | P1 | ~150 lines |
| Move invite email templates to `UnifiedNotificationService` | P2 | ~100 lines |
| Migrate existing `org_invitations` data | P2 | SQL migration |

### Phase 3: User Type & Service Access (Week 3-4)

**Goal:** Implement user types, service subscriptions, and fix role mismatches.

| Task | Priority | Effort |
|------|----------|--------|
| Add `user_type` column to users table | P1 | SQL migration |
| Add `project_manager` to `user_role_enum` | P1 | SQL migration |
| Create `platform_services` and `user_service_subscriptions` tables | P1 | SQL migration |
| Create `requireStaffOnly()` middleware | P1 | ~15 lines |
| Create `requireServiceAccess(serviceKey)` middleware | P1 | ~40 lines |
| Create `requireTier()` middleware | P1 | ~40 lines |
| Add `userType` and `tier` to `AuthenticatedUser` interface | P1 | ~10 lines |
| Update `authenticate` to populate `userType` from DB | P1 | ~20 lines |
| Add `requireServiceAccess()` to service routes (for customer gating) | P2 | ~30 lines across route files |
| Create `authorization_policies` seed migration | P2 | SQL migration |

### Phase 4: Frontend-Backend RBAC Sync (Week 4-5)

**Goal:** Eliminate frontend/backend divergence.

| Task | Priority | Effort |
|------|----------|--------|
| Create `GET /api/v1/rbac/config` endpoint | P2 | ~50 lines |
| Update `frontend/src/lib/rbac.ts` to fetch from API | P2 | ~100 lines |
| Add Next.js middleware auth guard (redirect unauthenticated to /login) | P2 | ~30 lines |
| Create tenant portal `src/lib/api.ts` (currently missing) | P2 | ~200 lines |
| Add shared RBAC types package in `packages/` | P3 | ~100 lines |

### Phase 5: Advanced Authorization (Week 5-6)

**Goal:** Full policy enforcement with ownership and assignment checks.

| Task | Priority | Effort |
|------|----------|--------|
| Implement `require_assignment` enforcement in `authorize.ts` | P2 | ~40 lines |
| Add `requireResourcePermission()` org-level access check | P2 | ~30 lines |
| Add audit logging for authorization decisions | P3 | ~100 lines |
| Create RBAC admin UI (policy management) | P3 | Full feature |
| Implement Keycloak as primary auth (login against Keycloak, not local DB) | P3 | Refactor login flow |
| Implement token refresh via Keycloak (replace 30-day static JWT) | P3 | ~100 lines |

---

## Appendix A: Authorization Policies Seed Data

These policies should be created in the `authorization_policies` table. Each maps to the per-service privilege definitions in Section 7.1.

> **Important:** These policies apply to **staff roles only**. Customers bypass role checks — their access is controlled by `user_service_subscriptions`. The `authorize()` middleware should check: if `user_type = 'customer'` AND user has active subscription for this service → allow. If `user_type = 'staff'` → check role against `allowed_roles[]`.

```sql
INSERT INTO authorization_policies (policy_name, resource_type, action, allowed_roles, require_ownership, require_assignment, require_same_org) VALUES

-- ═══════════════════════════════════════════════════════════════
-- VALUATIONS SERVICE (~55 endpoints)
-- ═══════════════════════════════════════════════════════════════
('valuation_list',                 'valuation', 'list',                 '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer,finance_manager,compliance_officer,agent,probationer,inspector,analyst,viewer}', false, false, true),
('valuation_read',                 'valuation', 'read',                 '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer,finance_manager,compliance_officer,agent,probationer,inspector,analyst,viewer}', false, false, true),
('valuation_create',               'valuation', 'create',               '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer,agent}', false, false, true),
('valuation_update',               'valuation', 'update',               '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer}', false, true, true),
('valuation_delete',               'valuation', 'delete',               '{super_admin,firm_principal,admin}', false, false, true),
('valuation_run_engine',           'valuation', 'run_engine',           '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer}', false, true, true),
('valuation_search_comparables',   'valuation', 'search_comparables',   '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer,agent,analyst}', false, false, true),
('valuation_manage_floor_plans',   'valuation', 'manage_floor_plans',   '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer,inspector}', false, true, true),
('valuation_perform_hbu',          'valuation', 'perform_hbu',          '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer}', false, true, true),
('valuation_override',             'valuation', 'override',             '{super_admin,firm_principal,admin,senior_valuer,manager,valuer}', false, true, true),
('valuation_approve_override',     'valuation', 'approve_override',     '{super_admin,firm_principal,admin,senior_valuer,compliance_officer}', false, false, true),
('valuation_reject_override',      'valuation', 'reject_override',      '{super_admin,firm_principal,admin,senior_valuer,compliance_officer}', false, false, true),
('valuation_sensitivity_analysis', 'valuation', 'sensitivity_analysis', '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer,analyst}', false, false, true),
('valuation_reconcile',            'valuation', 'reconcile',            '{super_admin,firm_principal,admin,senior_valuer,manager,valuer}', false, true, true),
('valuation_approve_reconciliation','valuation', 'approve_reconciliation','{super_admin,firm_principal,admin,senior_valuer,compliance_officer}', false, false, true),
('valuation_lock_reconciliation',  'valuation', 'lock_reconciliation',  '{super_admin,firm_principal,admin}', false, false, true),
('valuation_manage_inspection',    'valuation', 'manage_inspection',    '{super_admin,firm_principal,admin,senior_valuer,manager,valuer,inspector}', false, true, true),
('valuation_manage_engagement',    'valuation', 'manage_engagement',    '{super_admin,firm_principal,admin,senior_valuer,manager,valuer}', false, false, true),
('valuation_generate_report',      'valuation', 'generate_report',      '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer}', false, true, true),

-- ═══════════════════════════════════════════════════════════════
-- VALUATION REPORTS SERVICE (~33 endpoints)
-- ═══════════════════════════════════════════════════════════════
('report_list',           'report', 'list',           '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer,agent,analyst,viewer}', false, false, true),
('report_read',           'report', 'read',           '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer,agent,analyst,viewer}', false, false, true),
('report_create',         'report', 'create',         '{super_admin,firm_principal,admin,senior_valuer,manager,valuer}', false, false, true),
('report_update',         'report', 'update',         '{super_admin,firm_principal,admin,senior_valuer,manager,valuer}', false, true, true),
('report_delete',         'report', 'delete',         '{super_admin,firm_principal,admin}', false, false, true),
('report_supersede',      'report', 'supersede',      '{super_admin,firm_principal,admin,senior_valuer}', false, false, true),
('report_manage_photos',  'report', 'manage_photos',  '{super_admin,firm_principal,admin,senior_valuer,manager,valuer,inspector}', false, true, true),
('report_submit_review',  'report', 'submit_review',  '{super_admin,firm_principal,admin,senior_valuer,manager,valuer}', false, true, true),
('report_approve',        'report', 'approve',        '{super_admin,firm_principal,admin,senior_valuer,compliance_officer}', false, false, true),
('report_reject',         'report', 'reject',         '{super_admin,firm_principal,admin,senior_valuer,compliance_officer}', false, false, true),
('report_generate_pdf',   'report', 'generate_pdf',   '{super_admin,firm_principal,admin,senior_valuer,manager,valuer}', false, true, true),
('report_download',       'report', 'download',       '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer,agent,analyst}', false, false, true),
('report_prepare_esign',  'report', 'prepare_esign',  '{super_admin,firm_principal,admin,senior_valuer,manager,valuer}', false, true, true),
-- report:verify is public (no policy needed)

-- ═══════════════════════════════════════════════════════════════
-- VALUATION ORG / TEAM (~14 endpoints)
-- ═══════════════════════════════════════════════════════════════
('valuation_org_read_invitations',      'valuation_org', 'read_invitations',      '{super_admin,firm_principal,admin,manager}', false, false, true),
('valuation_org_manage_invitations',    'valuation_org', 'manage_invitations',    '{super_admin,firm_principal,admin}', false, false, true),
('valuation_org_read_members',          'valuation_org', 'read_members',          '{super_admin,firm_principal,admin,senior_valuer,manager,project_manager,valuer,agent,analyst,viewer}', false, false, true),
('valuation_org_manage_members',        'valuation_org', 'manage_members',        '{super_admin,firm_principal,admin}', false, false, true),
('valuation_org_manage_valuation_team', 'valuation_org', 'manage_valuation_team', '{super_admin,firm_principal,admin,senior_valuer,manager}', false, false, true),

-- ═══════════════════════════════════════════════════════════════
-- VALUATION INVOICES (~25 endpoints)
-- ═══════════════════════════════════════════════════════════════
('val_invoice_list',                   'valuation_invoice', 'list',                   '{super_admin,firm_principal,admin,senior_valuer,manager,valuer,finance_manager,agent}', false, false, true),
('val_invoice_read',                   'valuation_invoice', 'read',                   '{super_admin,firm_principal,admin,senior_valuer,manager,valuer,finance_manager,agent}', false, false, true),
('val_invoice_create',                 'valuation_invoice', 'create',                 '{super_admin,firm_principal,admin,senior_valuer,manager,valuer}', false, false, true),
('val_invoice_update',                 'valuation_invoice', 'update',                 '{super_admin,firm_principal,admin,senior_valuer,manager,valuer,finance_manager}', false, true, true),
('val_invoice_delete',                 'valuation_invoice', 'delete',                 '{super_admin,firm_principal,admin}', false, false, true),
('val_invoice_send',                   'valuation_invoice', 'send',                   '{super_admin,firm_principal,admin,senior_valuer,manager,valuer}', false, true, true),
('val_invoice_mark_paid',              'valuation_invoice', 'mark_paid',              '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('val_invoice_cancel',                 'valuation_invoice', 'cancel',                 '{super_admin,firm_principal,admin,senior_valuer,manager,valuer,finance_manager}', false, true, true),
('val_invoice_calculate_fees',         'valuation_invoice', 'calculate_fees',         '{super_admin,firm_principal,admin,senior_valuer,manager,valuer,finance_manager,agent}', false, false, true),
('val_invoice_manage_payment_accounts','valuation_invoice', 'manage_payment_accounts','{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('val_invoice_crypto_payments',        'valuation_invoice', 'crypto_payments',        '{super_admin,firm_principal,admin,senior_valuer,manager,valuer,finance_manager}', false, false, true),

-- ═══════════════════════════════════════════════════════════════
-- VALUATION CLIENTS (~8 endpoints)
-- ═══════════════════════════════════════════════════════════════
('val_client_list',   'valuation_client', 'list',   '{super_admin,firm_principal,admin,senior_valuer,manager,valuer,agent}', false, false, true),
('val_client_read',   'valuation_client', 'read',   '{super_admin,firm_principal,admin,senior_valuer,manager,valuer,agent}', false, false, true),
('val_client_create', 'valuation_client', 'create', '{super_admin,firm_principal,admin,senior_valuer,manager,valuer,agent}', false, false, true),
('val_client_update', 'valuation_client', 'update', '{super_admin,firm_principal,admin,senior_valuer,manager,valuer}', false, false, true),
('val_client_delete', 'valuation_client', 'delete', '{super_admin,firm_principal,admin}', false, false, true),
('val_client_email',  'valuation_client', 'email',  '{super_admin,firm_principal,admin,senior_valuer,manager,valuer}', false, false, true),

-- ═══════════════════════════════════════════════════════════════
-- PROPERTY MANAGEMENT (~123 endpoints — sub-resource policies)
-- ═══════════════════════════════════════════════════════════════

-- Properties
('pm_property_list',   'pm_property', 'list',   '{super_admin,firm_principal,admin,manager,project_manager,valuer,agent,finance_manager,analyst,viewer}', false, false, true),
('pm_property_read',   'pm_property', 'read',   '{super_admin,firm_principal,admin,manager,project_manager,valuer,agent,finance_manager,analyst,viewer}', false, false, true),
('pm_property_create', 'pm_property', 'create', '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('pm_property_update', 'pm_property', 'update', '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('pm_property_delete', 'pm_property', 'delete', '{super_admin,firm_principal,admin}', false, false, true),

-- Tenants
('pm_tenant_list',   'pm_tenant', 'list',   '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('pm_tenant_read',   'pm_tenant', 'read',   '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('pm_tenant_create', 'pm_tenant', 'create', '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('pm_tenant_update', 'pm_tenant', 'update', '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('pm_tenant_delete', 'pm_tenant', 'delete', '{super_admin,firm_principal,admin}', false, false, true),
('pm_tenant_screen', 'pm_tenant', 'screen', '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('pm_tenant_verify', 'pm_tenant', 'verify', '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),

-- Tenancies
('pm_tenancy_list',      'pm_tenancy', 'list',      '{super_admin,firm_principal,admin,manager,project_manager,agent,finance_manager}', false, false, true),
('pm_tenancy_read',      'pm_tenancy', 'read',      '{super_admin,firm_principal,admin,manager,project_manager,agent,finance_manager}', false, false, true),
('pm_tenancy_create',    'pm_tenancy', 'create',    '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('pm_tenancy_update',    'pm_tenancy', 'update',    '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('pm_tenancy_activate',  'pm_tenancy', 'activate',  '{super_admin,firm_principal,admin,manager}', false, false, true),
('pm_tenancy_terminate', 'pm_tenancy', 'terminate', '{super_admin,firm_principal,admin,manager}', false, false, true),
('pm_tenancy_renew',     'pm_tenancy', 'renew',     '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),

-- Payments
('pm_payment_record',          'pm_payment', 'record',          '{super_admin,firm_principal,admin,manager,finance_manager}', false, false, true),
('pm_payment_read',            'pm_payment', 'read',            '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, false, true),
('pm_payment_initialize',      'pm_payment', 'initialize',      '{super_admin,firm_principal,admin,manager,finance_manager}', false, false, true),
('pm_payment_manage_accounts', 'pm_payment', 'manage_accounts', '{super_admin,firm_principal,admin,finance_manager}', false, false, true),

-- Work Orders
('pm_work_order_list',           'pm_work_order', 'list',           '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('pm_work_order_read',           'pm_work_order', 'read',           '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('pm_work_order_create',         'pm_work_order', 'create',         '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('pm_work_order_update',         'pm_work_order', 'update',         '{super_admin,firm_principal,admin,manager,project_manager}', false, true, true),
('pm_work_order_assign',         'pm_work_order', 'assign',         '{super_admin,firm_principal,admin,manager}', false, false, true),
('pm_work_order_complete',       'pm_work_order', 'complete',       '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, true, true),
('pm_work_order_approve_budget', 'pm_work_order', 'approve_budget', '{super_admin,firm_principal,admin,manager,finance_manager}', false, false, true),

-- PM Reports, Documents, Financials, Bulk, Applications, Leases
('pm_report_read',    'pm_report', 'read',    '{super_admin,firm_principal,admin,manager,project_manager,finance_manager,analyst}', false, false, true),
('pm_document_create','pm_document','create',  '{super_admin,firm_principal,admin,manager,project_manager,valuer,agent}', false, false, true),
('pm_document_list',  'pm_document','list',    '{super_admin,firm_principal,admin,manager,project_manager,valuer,agent,analyst}', false, false, true),
('pm_document_delete','pm_document','delete',  '{super_admin,firm_principal,admin}', false, false, true),
('pm_financials_create','pm_financials','create','{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('pm_financials_read', 'pm_financials','read',  '{super_admin,firm_principal,admin,manager,project_manager,finance_manager,analyst}', false, false, true),
('pm_bulk_rent_increase','pm_bulk','rent_increase','{super_admin,firm_principal,admin}', false, false, true),
('pm_bulk_import',     'pm_bulk','import',     '{super_admin,firm_principal,admin}', false, false, true),
('pm_bulk_export',     'pm_bulk','export',     '{super_admin,firm_principal,admin,manager,project_manager,analyst}', false, false, true),

-- Applications
('pm_application_list',    'pm_application', 'list',    '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('pm_application_read',    'pm_application', 'read',    '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('pm_application_create',  'pm_application', 'create',  '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('pm_application_update',  'pm_application', 'update',  '{super_admin,firm_principal,admin,manager,project_manager}', false, true, true),
('pm_application_delete',  'pm_application', 'delete',  '{super_admin,firm_principal,admin}', false, false, true),
('pm_application_review',  'pm_application', 'review',  '{super_admin,firm_principal,admin,manager}', false, false, true),
('pm_application_approve', 'pm_application', 'approve', '{super_admin,firm_principal,admin,manager}', false, false, true),
('pm_application_reject',  'pm_application', 'reject',  '{super_admin,firm_principal,admin,manager}', false, false, true),
('pm_application_convert', 'pm_application', 'convert', '{super_admin,firm_principal,admin,manager}', false, false, true),

-- Lease Templates
('pm_lease_template_list',   'pm_lease_template', 'list',   '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('pm_lease_template_create', 'pm_lease_template', 'create', '{super_admin,firm_principal,admin}', false, false, true),
('pm_lease_template_update', 'pm_lease_template', 'update', '{super_admin,firm_principal,admin}', false, false, true),
('pm_lease_template_delete', 'pm_lease_template', 'delete', '{super_admin,firm_principal,admin}', false, false, true),

-- PM Audit
('pm_audit_read', 'pm_audit', 'read', '{super_admin,firm_principal,admin}', false, false, true),

-- ═══════════════════════════════════════════════════════════════
-- CRM SERVICE (~150+ endpoints — sub-resource policies)
-- ═══════════════════════════════════════════════════════════════

-- Contacts
('crm_contact_list',   'crm_contact', 'list',   '{super_admin,firm_principal,admin,manager,project_manager,agent,analyst}', false, false, true),
('crm_contact_read',   'crm_contact', 'read',   '{super_admin,firm_principal,admin,manager,project_manager,agent,analyst}', false, false, true),
('crm_contact_create', 'crm_contact', 'create', '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('crm_contact_update', 'crm_contact', 'update', '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('crm_contact_delete', 'crm_contact', 'delete', '{super_admin,firm_principal,admin}', false, false, true),
('crm_contact_merge',  'crm_contact', 'merge',  '{super_admin,firm_principal,admin}', false, false, true),
('crm_contact_import', 'crm_contact', 'import', '{super_admin,firm_principal,admin}', false, false, true),

-- Companies
('crm_company_list',   'crm_company', 'list',   '{super_admin,firm_principal,admin,manager,project_manager,agent,analyst}', false, false, true),
('crm_company_read',   'crm_company', 'read',   '{super_admin,firm_principal,admin,manager,project_manager,agent,analyst}', false, false, true),
('crm_company_create', 'crm_company', 'create', '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('crm_company_update', 'crm_company', 'update', '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('crm_company_delete', 'crm_company', 'delete', '{super_admin,firm_principal,admin}', false, false, true),

-- Deals
('crm_deal_list',          'crm_deal', 'list',          '{super_admin,firm_principal,admin,manager,project_manager,agent,analyst}', false, false, true),
('crm_deal_read',          'crm_deal', 'read',          '{super_admin,firm_principal,admin,manager,project_manager,agent,analyst}', false, false, true),
('crm_deal_create',        'crm_deal', 'create',        '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('crm_deal_update',        'crm_deal', 'update',        '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, true, true),
('crm_deal_delete',        'crm_deal', 'delete',        '{super_admin,firm_principal,admin}', false, false, true),
('crm_deal_move_stage',    'crm_deal', 'move_stage',    '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, true, true),
('crm_deal_change_status', 'crm_deal', 'change_status', '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, true, true),
('crm_deal_clone',         'crm_deal', 'clone',         '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),

-- Pipelines
('crm_pipeline_list',          'crm_pipeline', 'list',          '{super_admin,firm_principal,admin,manager,project_manager,agent,analyst}', false, false, true),
('crm_pipeline_read',          'crm_pipeline', 'read',          '{super_admin,firm_principal,admin,manager,project_manager,agent,analyst}', false, false, true),
('crm_pipeline_create',        'crm_pipeline', 'create',        '{super_admin,firm_principal,admin}', false, false, true),
('crm_pipeline_update',        'crm_pipeline', 'update',        '{super_admin,firm_principal,admin}', false, false, true),
('crm_pipeline_delete',        'crm_pipeline', 'delete',        '{super_admin,firm_principal,admin}', false, false, true),
('crm_pipeline_clone',         'crm_pipeline', 'clone',         '{super_admin,firm_principal,admin}', false, false, true),
('crm_pipeline_manage_stages', 'crm_pipeline', 'manage_stages', '{super_admin,firm_principal,admin}', false, false, true),

-- Tasks
('crm_task_list',     'crm_task', 'list',     '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('crm_task_read',     'crm_task', 'read',     '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('crm_task_create',   'crm_task', 'create',   '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('crm_task_update',   'crm_task', 'update',   '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, true, true),
('crm_task_delete',   'crm_task', 'delete',   '{super_admin,firm_principal,admin,manager}', false, false, true),
('crm_task_complete', 'crm_task', 'complete', '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, true, true),

-- Commissions
('crm_commission_read_plans',        'crm_commission', 'read_plans',        '{super_admin,firm_principal,admin,manager,finance_manager,agent}', false, false, true),
('crm_commission_manage_plans',      'crm_commission', 'manage_plans',      '{super_admin,firm_principal,admin}', false, false, true),
('crm_commission_read_records',      'crm_commission', 'read_records',      '{super_admin,firm_principal,admin,manager,finance_manager,agent}', false, false, true),
('crm_commission_approve',           'crm_commission', 'approve',           '{super_admin,firm_principal,admin,manager}', false, false, true),
('crm_commission_pay',               'crm_commission', 'pay',               '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('crm_commission_clawback',          'crm_commission', 'clawback',          '{super_admin,firm_principal,admin}', false, false, true),
('crm_commission_bulk_approve',      'crm_commission', 'bulk_approve',      '{super_admin,firm_principal,admin,manager}', false, false, true),
('crm_commission_calculate',         'crm_commission', 'calculate',         '{super_admin,firm_principal,admin,manager,finance_manager}', false, false, true),
('crm_commission_manage_splits',     'crm_commission', 'manage_splits',     '{super_admin,firm_principal,admin,manager}', false, false, true),
('crm_commission_manage_adjustments','crm_commission', 'manage_adjustments','{super_admin,firm_principal,admin,manager}', false, false, true),

-- Drip Campaigns
('crm_drip_campaign_list',         'crm_drip_campaign', 'list',         '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('crm_drip_campaign_read',         'crm_drip_campaign', 'read',         '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('crm_drip_campaign_create',       'crm_drip_campaign', 'create',       '{super_admin,firm_principal,admin,manager}', false, false, true),
('crm_drip_campaign_update',       'crm_drip_campaign', 'update',       '{super_admin,firm_principal,admin,manager}', false, false, true),
('crm_drip_campaign_delete',       'crm_drip_campaign', 'delete',       '{super_admin,firm_principal,admin}', false, false, true),
('crm_drip_campaign_manage_steps', 'crm_drip_campaign', 'manage_steps', '{super_admin,firm_principal,admin,manager}', false, false, true),
('crm_drip_campaign_enroll',       'crm_drip_campaign', 'enroll',       '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),

-- ═══════════════════════════════════════════════════════════════
-- PROJECTS SERVICE (~150+ endpoints — sub-resource policies)
-- ═══════════════════════════════════════════════════════════════

-- Project Core
('project_list',          'project', 'list',          '{super_admin,firm_principal,admin,manager,project_manager,valuer,agent,analyst,viewer}', false, false, true),
('project_read',          'project', 'read',          '{super_admin,firm_principal,admin,manager,project_manager,valuer,agent,analyst,viewer}', false, false, true),
('project_create',        'project', 'create',        '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('project_update',        'project', 'update',        '{super_admin,firm_principal,admin,manager,project_manager}', false, true, true),
('project_delete',        'project', 'delete',        '{super_admin,firm_principal,admin}', false, false, true),
('project_change_status', 'project', 'change_status', '{super_admin,firm_principal,admin,manager}', false, false, true),

-- Phases, Milestones
('project_phase_list',          'project_phase', 'list',          '{super_admin,firm_principal,admin,manager,project_manager,valuer,agent,analyst}', false, false, true),
('project_phase_create',        'project_phase', 'create',        '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('project_phase_update',        'project_phase', 'update',        '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('project_phase_delete',        'project_phase', 'delete',        '{super_admin,firm_principal,admin}', false, false, true),
('project_milestone_list',      'project_milestone', 'list',      '{super_admin,firm_principal,admin,manager,project_manager,valuer,agent,analyst}', false, false, true),
('project_milestone_create',    'project_milestone', 'create',    '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('project_milestone_complete',  'project_milestone', 'complete',  '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('project_milestone_reschedule','project_milestone', 'reschedule','{super_admin,firm_principal,admin,manager}', false, false, true),

-- Units
('project_unit_list',     'project_unit', 'list',     '{super_admin,firm_principal,admin,manager,project_manager,agent,analyst}', false, false, true),
('project_unit_create',   'project_unit', 'create',   '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('project_unit_update',   'project_unit', 'update',   '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('project_unit_reserve',  'project_unit', 'reserve',  '{super_admin,firm_principal,admin,manager,project_manager,agent}', false, false, true),
('project_unit_sell',     'project_unit', 'sell',      '{super_admin,firm_principal,admin,manager}', false, false, true),
('project_unit_handover', 'project_unit', 'handover', '{super_admin,firm_principal,admin,manager}', false, false, true),

-- Costs
('project_cost_list',         'project_cost', 'list',         '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, false, true),
('project_cost_create',       'project_cost', 'create',       '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('project_cost_approve',      'project_cost', 'approve',      '{super_admin,firm_principal,admin,manager,finance_manager}', false, false, true),
('project_cost_pay',          'project_cost', 'pay',          '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('project_cost_bulk_approve', 'project_cost', 'bulk_approve', '{super_admin,firm_principal,admin,manager,finance_manager}', false, false, true),
('project_cost_delete',       'project_cost', 'delete',       '{super_admin,firm_principal,admin}', false, false, true),

-- Contractors
('project_contractor_list',               'project_contractor', 'list',               '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('project_contractor_create',             'project_contractor', 'create',             '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('project_contractor_approve',            'project_contractor', 'approve',            '{super_admin,firm_principal,admin,manager}', false, false, true),
('project_contractor_suspend',            'project_contractor', 'suspend',            '{super_admin,firm_principal,admin}', false, false, true),
('project_contractor_manage_assignments', 'project_contractor', 'manage_assignments', '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),

-- Draw Requests
('project_draw_request_list',    'project_draw_request', 'list',    '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, false, true),
('project_draw_request_create',  'project_draw_request', 'create',  '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('project_draw_request_approve', 'project_draw_request', 'approve', '{super_admin,firm_principal,admin,manager}', false, false, true),
('project_draw_request_reject',  'project_draw_request', 'reject',  '{super_admin,firm_principal,admin,manager}', false, false, true),
('project_draw_request_fund',    'project_draw_request', 'fund',    '{super_admin,firm_principal,admin,finance_manager}', false, false, true),

-- Daily Logs
('project_daily_log_list',    'project_daily_log', 'list',    '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('project_daily_log_create',  'project_daily_log', 'create',  '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('project_daily_log_approve', 'project_daily_log', 'approve', '{super_admin,firm_principal,admin,manager}', false, false, true),

-- Punch Lists
('project_punch_list_list',     'project_punch_list', 'list',     '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('project_punch_list_create',   'project_punch_list', 'create',   '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('project_punch_list_assign',   'project_punch_list', 'assign',   '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('project_punch_list_complete', 'project_punch_list', 'complete', '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, true, true),
('project_punch_list_verify',   'project_punch_list', 'verify',   '{super_admin,firm_principal,admin,manager}', false, false, true),
('project_punch_list_reject',   'project_punch_list', 'reject',   '{super_admin,firm_principal,admin,manager}', false, false, true),

-- ═══════════════════════════════════════════════════════════════
-- DATA HUB (~100+ endpoints)
-- ═══════════════════════════════════════════════════════════════
('datahub_source_list',          'datahub_source', 'list',   '{super_admin,firm_principal,admin,manager,analyst}', false, false, true),
('datahub_source_create',        'datahub_source', 'create', '{super_admin,firm_principal,admin}', false, false, true),
('datahub_source_sync',          'datahub_source', 'sync',   '{super_admin,firm_principal,admin}', false, false, true),
('datahub_source_delete',        'datahub_source', 'delete', '{super_admin,firm_principal,admin}', false, false, true),
('datahub_contribution_list',    'datahub_contribution', 'list',    '{super_admin,firm_principal,admin,manager,analyst}', false, false, true),
('datahub_contribution_create',  'datahub_contribution', 'create',  '{super_admin,firm_principal,admin,manager,valuer,agent}', false, false, true),
('datahub_contribution_approve', 'datahub_contribution', 'approve', '{super_admin,firm_principal,admin}', false, false, true),
('datahub_contribution_reject',  'datahub_contribution', 'reject',  '{super_admin,firm_principal,admin}', false, false, true),
('datahub_quality_read',         'datahub_quality', 'read',  '{super_admin,firm_principal,admin,manager,analyst}', false, false, true),
('datahub_geocoding_geocode',    'datahub_geocoding', 'geocode', '{super_admin,firm_principal,admin,manager,project_manager,valuer,agent}', false, false, true),
('datahub_economic_read',        'datahub_economic', 'read',  '{super_admin,firm_principal,admin,manager,analyst,valuer}', false, false, true),
('datahub_economic_sync',        'datahub_economic', 'sync',  '{super_admin,firm_principal,admin}', false, false, false),
('datahub_scheduler_read',       'datahub_scheduler', 'read',  '{super_admin,admin}', false, false, false),
('datahub_scheduler_start',      'datahub_scheduler', 'start', '{super_admin,admin}', false, false, false),
('datahub_scheduler_stop',       'datahub_scheduler', 'stop',  '{super_admin,admin}', false, false, false),
('datahub_config_read',          'datahub_config', 'read',   '{super_admin,admin}', false, false, false),
('datahub_config_update',        'datahub_config', 'update', '{super_admin}', false, false, false),
('datahub_spider_list',          'datahub_spider', 'list',  '{super_admin,admin}', false, false, false),
('datahub_spider_start',         'datahub_spider', 'start', '{super_admin,admin}', false, false, false),

-- ═══════════════════════════════════════════════════════════════
-- BUDGET / FINANCE (~36 endpoints)
-- ═══════════════════════════════════════════════════════════════
('budget_analytics_read',       'budget_analytics', 'read',     '{super_admin,firm_principal,admin,manager,project_manager,finance_manager,analyst}', false, false, true),
('budget_rate_lock_create',     'budget_rate_lock', 'create',   '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('budget_rate_lock_list',       'budget_rate_lock', 'list',     '{super_admin,firm_principal,admin,manager,finance_manager}', false, false, true),
('budget_rate_lock_delete',     'budget_rate_lock', 'delete',   '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('budget_snapshot_create',      'budget_snapshot', 'create',    '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('budget_alert_list',           'budget_alert', 'list',         '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, false, true),
('budget_alert_acknowledge',    'budget_alert', 'acknowledge',  '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, false, true),
('budget_invoice_list',         'budget_invoice', 'list',       '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, false, true),
('budget_invoice_read',         'budget_invoice', 'read',       '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, false, true),
('budget_invoice_create',       'budget_invoice', 'create',     '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, false, true),
('budget_invoice_update',       'budget_invoice', 'update',     '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, true, true),
('budget_invoice_delete',       'budget_invoice', 'delete',     '{super_admin,firm_principal,admin}', false, false, true),
('budget_invoice_submit',       'budget_invoice', 'submit',     '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, true, true),
('budget_invoice_approve',      'budget_invoice', 'approve',    '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('budget_invoice_reject',       'budget_invoice', 'reject',     '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('budget_invoice_pay',          'budget_invoice', 'pay',        '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('budget_expense_list',         'budget_expense', 'list',       '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, false, true),
('budget_expense_create',       'budget_expense', 'create',     '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, false, true),
('budget_expense_update',       'budget_expense', 'update',     '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, true, true),
('budget_expense_delete',       'budget_expense', 'delete',     '{super_admin,firm_principal,admin}', false, false, true),
('budget_expense_approve',      'budget_expense', 'approve',    '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('budget_expense_reject',       'budget_expense', 'reject',     '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('budget_expense_bulk_approve', 'budget_expense', 'bulk_approve','{super_admin,firm_principal,admin,finance_manager}', false, false, true),

-- ═══════════════════════════════════════════════════════════════
-- CONSTRUCTION MODULE (~72 endpoints)
-- ═══════════════════════════════════════════════════════════════
('rfi_list',    'rfi', 'list',    '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('rfi_read',    'rfi', 'read',    '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('rfi_create',  'rfi', 'create',  '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('rfi_assign',  'rfi', 'assign',  '{super_admin,firm_principal,admin,manager}', false, false, true),
('rfi_respond', 'rfi', 'respond', '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, true, true),
('rfi_close',   'rfi', 'close',   '{super_admin,firm_principal,admin,manager}', false, false, true),
('rfi_void',    'rfi', 'void',    '{super_admin,firm_principal,admin}', false, false, true),
('rfi_delete',  'rfi', 'delete',  '{super_admin,firm_principal,admin}', false, false, true),

('change_order_list',    'change_order', 'list',    '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, false, true),
('change_order_create',  'change_order', 'create',  '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('change_order_approve', 'change_order', 'approve', '{super_admin,firm_principal,admin,manager}', false, false, true),
('change_order_reject',  'change_order', 'reject',  '{super_admin,firm_principal,admin,manager}', false, false, true),
('change_order_execute', 'change_order', 'execute', '{super_admin,firm_principal,admin}', false, false, true),
('change_order_void',    'change_order', 'void',    '{super_admin,firm_principal,admin}', false, false, true),

('submittal_list',    'submittal', 'list',    '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('submittal_create',  'submittal', 'create',  '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('submittal_assign',  'submittal', 'assign',  '{super_admin,firm_principal,admin,manager}', false, false, true),
('submittal_review',  'submittal', 'review',  '{super_admin,firm_principal,admin,manager,project_manager}', false, true, true),
('submittal_void',    'submittal', 'void',    '{super_admin,firm_principal,admin}', false, false, true),

('procurement_list',    'procurement', 'list',    '{super_admin,firm_principal,admin,manager,project_manager,finance_manager}', false, false, true),
('procurement_create',  'procurement', 'create',  '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('procurement_approve', 'procurement', 'approve', '{super_admin,firm_principal,admin,manager}', false, false, true),
('procurement_order',   'procurement', 'order',   '{super_admin,firm_principal,admin,finance_manager}', false, false, true),
('procurement_cancel',  'procurement', 'cancel',  '{super_admin,firm_principal,admin}', false, false, true),

('site_diary_list',   'site_diary', 'list',   '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('site_diary_create', 'site_diary', 'create', '{super_admin,firm_principal,admin,manager,project_manager,inspector}', false, false, true),
('site_diary_delete', 'site_diary', 'delete', '{super_admin,firm_principal,admin}', false, false, true),

-- ═══════════════════════════════════════════════════════════════
-- ADMIN SERVICE (STAFF ONLY — ~37 endpoints)
-- NOTE: All routes require requireStaffOnly() + requireAdmin at mount.
-- ═══════════════════════════════════════════════════════════════
('admin_fees_list',              'admin_fees', 'list',              '{super_admin,admin}', false, false, false),
('admin_fees_update',            'admin_fees', 'update',            '{super_admin,admin}', false, false, false),
('admin_fees_create',            'admin_fees', 'create',            '{super_admin,admin}', false, false, false),
('admin_crypto_read_status',     'admin_crypto', 'read_status',     '{super_admin,admin}', false, false, false),
('admin_crypto_manage_wallets',  'admin_crypto', 'manage_wallets',  '{super_admin}', false, false, false),
('admin_crypto_manage_tokens',   'admin_crypto', 'manage_tokens',   '{super_admin}', false, false, false),
('admin_crypto_read_transactions','admin_crypto', 'read_transactions','{super_admin,admin}', false, false, false),
('admin_crypto_manage_escrow',   'admin_crypto', 'manage_escrow',   '{super_admin}', false, false, false),
('admin_users_list',             'admin_users', 'list',             '{super_admin,admin}', false, false, false),
('admin_users_update',           'admin_users', 'update',           '{super_admin,admin}', false, false, false),
('admin_users_delete',           'admin_users', 'delete',           '{super_admin}', false, false, false),
('admin_integrations_read',      'admin_integrations', 'read',      '{super_admin,admin}', false, false, false),
('admin_integrations_manage',    'admin_integrations', 'manage',    '{super_admin}', false, false, false),
('admin_billing_read',           'admin_billing', 'read',           '{super_admin,admin}', false, false, false),
('admin_billing_manage',         'admin_billing', 'manage',         '{super_admin,admin}', false, false, false),
('admin_platform_read_usage',    'admin_platform', 'read_usage',    '{super_admin,admin}', false, false, false),
('admin_platform_manage',        'admin_platform', 'manage',        '{super_admin}', false, false, false),

-- ═══════════════════════════════════════════════════════════════
-- ANALYTICS (~9 endpoints)
-- ═══════════════════════════════════════════════════════════════
('analytics_read_dashboard',        'analytics', 'read_dashboard',        '{super_admin,firm_principal,admin,manager,project_manager,analyst}', false, false, true),
('analytics_read_cohorts',          'analytics', 'read_cohorts',          '{super_admin,firm_principal,admin,manager,project_manager,analyst}', false, false, true),
('analytics_read_win_loss',         'analytics', 'read_win_loss',         '{super_admin,firm_principal,admin,manager,project_manager,agent,analyst}', false, false, true),
('analytics_read_funnel',           'analytics', 'read_funnel',           '{super_admin,firm_principal,admin,manager,project_manager,analyst}', false, false, true),
('analytics_read_agent_performance','analytics', 'read_agent_performance','{super_admin,firm_principal,admin,manager,project_manager,agent,analyst}', false, false, true),
('analytics_export',                'analytics', 'export',               '{super_admin,firm_principal,admin,manager,analyst}', false, false, true),

-- ═══════════════════════════════════════════════════════════════
-- SMALLER SERVICES
-- ═══════════════════════════════════════════════════════════════

-- Workflows
('workflow_list',             'workflow', 'list',             '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('workflow_read',             'workflow', 'read',             '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('workflow_create',           'workflow', 'create',           '{super_admin,firm_principal,admin,manager}', false, false, true),
('workflow_update',           'workflow', 'update',           '{super_admin,firm_principal,admin,manager}', false, false, true),
('workflow_delete',           'workflow', 'delete',           '{super_admin,firm_principal,admin}', false, false, true),
('workflow_activate',         'workflow', 'activate',         '{super_admin,firm_principal,admin,manager}', false, false, true),
('workflow_trigger',          'workflow', 'trigger',          '{super_admin,firm_principal,admin,manager}', false, false, true),
('workflow_cancel_execution', 'workflow', 'cancel_execution', '{super_admin,firm_principal,admin,manager}', false, false, true),

-- Governance
('governance_list',           'governance', 'list',           '{super_admin,firm_principal,admin,manager,project_manager,compliance_officer}', false, false, true),
('governance_read',           'governance', 'read',           '{super_admin,firm_principal,admin,manager,project_manager,compliance_officer}', false, false, true),
('governance_create',         'governance', 'create',         '{super_admin,firm_principal,admin}', false, false, true),
('governance_update',         'governance', 'update',         '{super_admin,firm_principal,admin}', false, false, true),
('governance_delete',         'governance', 'delete',         '{super_admin,firm_principal,admin}', false, false, true),
('governance_lock',           'governance', 'lock',           '{super_admin,firm_principal,admin}', false, false, true),

-- Publications
('publication_list',    'publication', 'list',    '{super_admin,firm_principal,admin,manager,analyst}', false, false, true),
('publication_read',    'publication', 'read',    '{super_admin,firm_principal,admin,manager,analyst}', false, false, true),
('publication_create',  'publication', 'create',  '{super_admin,firm_principal,admin,manager}', false, false, true),
('publication_update',  'publication', 'update',  '{super_admin,firm_principal,admin,manager}', false, true, true),
('publication_delete',  'publication', 'delete',  '{super_admin,firm_principal,admin}', false, false, true),
('publication_publish', 'publication', 'publish', '{super_admin,firm_principal,admin}', false, false, true),

-- Autopilot (STAFF ONLY)
('autopilot_run',             'autopilot', 'run',             '{super_admin,admin}', false, false, false),
('autopilot_read',            'autopilot', 'read',            '{super_admin,admin}', false, false, false),
('autopilot_update_settings', 'autopilot', 'update_settings', '{super_admin}', false, false, false),
('autopilot_manage_deferred', 'autopilot', 'manage_deferred', '{super_admin,admin}', false, false, false),

-- Litigation
('litigation_read',         'litigation', 'read',         '{super_admin,firm_principal,admin,senior_valuer,manager,compliance_officer}', false, false, true),
('litigation_assess_risk',  'litigation', 'assess_risk',  '{super_admin,firm_principal,admin,senior_valuer,compliance_officer}', false, false, true),
('litigation_refresh',      'litigation', 'refresh',      '{super_admin,firm_principal,admin}', false, false, true),

-- Portfolio
('portfolio_read', 'portfolio', 'read', '{super_admin,firm_principal,admin,manager,project_manager,analyst}', false, false, true),

-- Workspace
('workspace_list',             'workspace', 'list',             '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('workspace_read',             'workspace', 'read',             '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('workspace_create',           'workspace', 'create',           '{super_admin,firm_principal,admin,manager}', false, false, true),
('workspace_delete',           'workspace', 'delete',           '{super_admin,firm_principal,admin}', false, false, true),
('workspace_manage_boards',    'workspace', 'manage_boards',    '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('workspace_manage_documents', 'workspace', 'manage_documents', '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),

-- Short Stay
('short_stay_read',    'short_stay', 'read',    '{super_admin,firm_principal,admin,manager,analyst}', false, false, true),
('short_stay_refresh', 'short_stay', 'refresh', '{super_admin,firm_principal,admin}', false, false, true),

-- ═══════════════════════════════════════════════════════════════
-- E-SIGN — SHARED SERVICE (no authorization_policies needed)
-- Any authenticated user can use. Just authenticate middleware.
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- SHARED SERVICES (authenticate only, all roles)
-- ═══════════════════════════════════════════════════════════════
-- Notifications
('notifications_read', 'notifications', 'read', '{super_admin,firm_principal,admin,manager,project_manager,senior_valuer,valuer,finance_manager,compliance_officer,agent,probationer,inspector,analyst,viewer}', true, false, true),

-- Messaging
('messaging_read',   'messaging', 'read',   '{super_admin,firm_principal,admin,manager,project_manager,senior_valuer,valuer,finance_manager,compliance_officer,agent,probationer,inspector,analyst}', false, false, true),
('messaging_create', 'messaging', 'create', '{super_admin,firm_principal,admin,manager,project_manager,senior_valuer,valuer,finance_manager,compliance_officer,agent,probationer,inspector,analyst}', false, false, true),

-- User Profile (self-access only)
('user_profile_read',   'user_profile', 'read',   '{super_admin,firm_principal,admin,manager,project_manager,senior_valuer,valuer,finance_manager,compliance_officer,agent,probationer,inspector,analyst,viewer}', true, false, false),
('user_profile_update', 'user_profile', 'update', '{super_admin,firm_principal,admin,manager,project_manager,senior_valuer,valuer,finance_manager,compliance_officer,agent,probationer,inspector,analyst,viewer}', true, false, false),

-- Invitations
('invitations_read',   'invitations', 'read',   '{super_admin,firm_principal,admin,manager}', false, false, true),
('invitations_create', 'invitations', 'create', '{super_admin,firm_principal,admin,manager}', false, false, true),
('invitations_manage', 'invitations', 'manage', '{super_admin,firm_principal,admin}', false, false, true),

-- Team Management
('team_read',   'team', 'read',   '{super_admin,firm_principal,admin,manager,project_manager}', false, false, true),
('team_manage', 'team', 'manage', '{super_admin,firm_principal,admin}', false, false, true),
('team_invite', 'team', 'invite', '{super_admin,firm_principal,admin,manager}', false, false, true);
```

> **Total:** ~230 policies across ~50 resource types. This covers all 700+ endpoints.
> 
> **For customers:** The `authorize()` middleware should be enhanced to check: if `user_type = 'customer'` AND `user_service_subscriptions` has an active row for this service → bypass role check and allow. This means customers don't need entries in `allowed_roles[]` — their access is governed by their subscription, not by role.

---

## Appendix B: Middleware Application Pattern

### Recommended Route Setup Pattern

```typescript
// backend/src/routes/example.ts
import { authenticate, requireRoles, requireOrganization } from '../middleware/auth';
import { requireStaffOnly, requireServiceAccess } from '../middleware/userType';
import { requireTier } from '../middleware/tierGuard';

const router = Router();

// === SERVICE ROUTE (e.g., Valuations, PM, CRM) ===
// Staff: always allowed. Customer: must be subscribed.
router.get('/',
  authenticate,
  requireServiceAccess('valuations'),  // staff passes through, customer checked
  requireOrganization(),
  async (req, res) => {
    const { organizationId } = req.user!;
    // Query always filters by organizationId
  }
);

// === ADMIN ROUTE ===
// Staff only, admin role required. Customers never.
router.get('/admin/users',
  authenticate,
  requireStaffOnly(),
  requireRoles('admin', 'super_admin'),
  async (req, res) => { ... }
);

// === SHARED SERVICE ROUTE (e.g., E-Sign) ===
// Any authenticated user, no role or service check.
router.post('/esign/documents',
  authenticate,
  async (req, res) => { ... }
);

// === TIER-GATED FEATURE ===
router.get('/ai-forecasting',
  authenticate,
  requireServiceAccess('analytics'),
  requireTier('enterprise'),
  async (req, res) => { ... }
);
```

### Mount Pattern in index.ts

```typescript
// backend/src/index.ts

// ADMIN — staff only + admin role
app.use('/api/v1/admin',         authenticate, requireStaffOnly(), requireAdmin, adminRoutes);
app.use('/api/v1/integrations',  authenticate, requireStaffOnly(), requireAdmin, integrationsRoutes);
app.use('/api/v1/autopilot',     authenticate, requireStaffOnly(), requireAdmin, autopilotRoutes);

// SERVICE ROUTES — staff always, customer needs subscription
app.use('/api/v1/valuations',    optionalAuth, valuationRoutes);  // public read, auth write
app.use('/api/v1/crm',           authenticate, crmRoutes);
app.use('/api/v1/pm',            authenticate, propertyManagementRoutes);
app.use('/api/v1/projects',      authenticate, projectRoutes);
app.use('/api/v1/analytics',     authenticate, analyticsRoutes);
// Note: requireServiceAccess() applied per-route inside each router

// SHARED SERVICES — any authenticated user, no role/service gating
app.use('/api/v1/esign',         authenticate, eSignRoutes);
app.use('/api/v1/notifications', authenticate, notificationRoutes);
app.use('/api/v1/messaging',     authenticate, messagingRoutes);
app.use('/api/v1/user',          authenticate, userProfileRoutes);

// PUBLIC — no auth required
app.use('/health',               healthRoutes);
app.use('/api/v1/auth',          authRoutes);
app.use('/api/v1/marketplace',   marketplaceRoutes);
app.use('/api/v1/webhooks',      webhooksRoutes);
```

---

## Appendix C: Keycloak Realm Role Mapping

Map backend `user_role_enum` to Keycloak realm roles for consistency:

| Backend Role | Keycloak Realm Role | Description |
|-------------|---------------------|-------------|
| `super_admin` | `super_admin` | Platform super admin |
| `firm_principal` | `firm_principal` | Organization director |
| `admin` | `admin` | Organization admin |
| `senior_valuer` | `senior_valuer` | Lead valuer |
| `manager` | `manager` | Team manager |
| `project_manager` | `project_manager` | Project manager |
| `valuer` | `valuer` | Licensed valuer |
| `finance_manager` | `finance_manager` | Finance manager |
| `compliance_officer` | `compliance_officer` | Compliance officer |
| `agent` | `agent` | Real estate agent |
| `probationer` | `probationer` | Trainee |
| `inspector` | `inspector` | Field inspector |
| `analyst` | `analyst` | Data analyst |
| `viewer` | `viewer` | Read-only user |
| `tenant` | `tenant` | Customer (legacy — use user_type instead) |
| `property_owner` | `property_owner` | Customer (legacy — use user_type instead) |

> **Note:** Customers do not need Keycloak realm roles for per-service access. Their access is determined by `user_type = 'customer'` + `user_service_subscriptions` table. Keycloak roles are primarily for staff.

When inviting a user, the `InviteService` should:
1. Create the Keycloak user
2. Assign the matching realm role
3. Store `keycloak_id` in the local `users` table
4. On login, the JWT's `realm_access.roles` will carry the role for front-end display

---

## Appendix D: Glossary

| Term | Definition |
|------|-----------|
| **authenticate** | Middleware that verifies JWT token and attaches `req.user` |
| **authorize** | Policy-based middleware that checks `authorization_policies` table |
| **requireRoles** | Middleware factory that checks user has at least one of the specified roles |
| **requireOrganization** | Middleware that ensures user is bound to an organization |
| **requireTier** | (Proposed) Middleware that checks subscription tier |
| **requireUserType** | (Proposed) Middleware that checks user type (staff/customer) |
| **RBAC** | Role-Based Access Control |
| **ABAC** | Attribute-Based Access Control (future direction) |
| **JWKS** | JSON Web Key Set — Keycloak's public key endpoint for JWT verification |
| **PKCE** | Proof Key for Code Exchange — OAuth2 security extension |
| **Fail-open** | Allow access when no policy is defined (dev mode) |
| **Fail-closed** | Deny access when no policy is defined (production mode) |
