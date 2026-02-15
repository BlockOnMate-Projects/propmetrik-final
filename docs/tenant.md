# PROPMETRIK Tenant Architecture

> Internal architecture document for the tenant-facing experience.  
> Version: 1.0  
> Status: Implementation Ready  
> Last Updated: 2026-01-19

---

## Table of Contents

1. [Architectural Principles](#architectural-principles)
2. [High-Level Architecture](#high-level-architecture)
3. [User Worlds](#user-worlds)
4. [Frontend Routing](#frontend-routing)
5. [Authentication and Authorization](#authentication-and-authorization)
6. [Backend API Design](#backend-api-design)
7. [Workflow: Tenant Application Flow](#workflow-tenant-application-flow)
8. [Domain and DNS Strategy](#domain-and-dns-strategy)
9. [Environment Strategy](#environment-strategy)
10. [Testing Strategy](#testing-strategy)
11. [Phased Implementation Plan](#phased-implementation-plan)
12. [Dev Testing: Preview as Tenant Mode](#dev-testing-preview-as-tenant-mode)
13. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
14. [Why This Architecture Works](#why-this-architecture-works)

---

## Architectural Principles

This document enforces the following non-negotiable principles:

1. **Separation of Concerns**: Client-facing and tenant-facing experiences are distinct applications, not role-gated views within a single app.

2. **Single Source of Truth**: One API serves all frontends. Business logic lives in the backend, never duplicated across clients.

3. **Backend-Enforced Security**: Frontend routing provides UX convenience only. All authorization decisions are made and enforced by the backend.

4. **Stateless Authentication**: Short-lived JWTs with explicit scopes. No shared sessions across subdomains.

5. **Mobile-First Backend Design**: API contracts must support future native mobile apps without architectural changes.

---

## High-Level Architecture

```
                          api.propmetrik.com
                                  |
                    ┌─────────────┼─────────────┐
                    │             │             │
            management.     tenants.      public.
           propmetrik.com  propmetrik.com propmetrik.com
                    │             │             │
              ┌─────┴─────┐ ┌─────┴─────┐ ┌─────┴─────┐
              │  Client   │ │  Tenant   │ │  Public   │
              │ Dashboard │ │   Portal  │ │  Website  │
              └───────────┘ └───────────┘ └───────────┘
                    │             │             │
                    └─────────────┼─────────────┘
                                  │
                         auth.propmetrik.com
                         (Central Auth Service)
```

### Components

| Component | Domain | Purpose |
|-----------|--------|---------|
| API Gateway | api.propmetrik.com | Single backend serving all clients |
| Auth Service | auth.propmetrik.com | Centralized authentication and token issuance |
| Client Dashboard | management.propmetrik.com | Manager/Owner workflows |
| Tenant Portal | tenants.propmetrik.com | Tenant-facing experience |
| Public Website | public.propmetrik.com | Marketing, property listings |

### Data Flow

1. All frontends communicate exclusively with `api.propmetrik.com`
2. Authentication flows through `auth.propmetrik.com`
3. Frontends receive scoped JWTs based on user role
4. Backend validates every request against token claims

---

## User Worlds

There are two fundamentally different user experiences. These must remain architecturally separated.

### Client Side (Managers / Owners)

| Attribute | Description |
|-----------|-------------|
| Users | Property managers, landlords, organization admins |
| Access Pattern | Fully authenticated, session-based |
| Complexity | High — dense workflows, bulk operations, analytics |
| Scope | Organization-wide, multi-property |
| Trust Level | Internal users, verified identities |

### Tenant Side

| Attribute | Description |
|-----------|-------------|
| Users | Prospective and current tenants |
| Access Pattern | Task-based, often single-purpose visits |
| Complexity | Low — apply, sign, pay, report |
| Scope | Single tenancy, single property |
| Trust Level | External users, varying verification levels |

### Why Separation Matters

Combining these into a single application with role-based conditionals leads to:

- Bloated bundle sizes for tenant-facing pages
- Security surface area expansion
- UX confusion from shared navigation patterns
- Testing complexity explosion
- Deployment coupling

**Decision**: Separate frontends. No exceptions.

---

## Frontend Routing

### Client Dashboard (management.propmetrik.com)

Already implemented. Full SPA with authenticated access.

```
/dashboard
/properties
/properties/:id
/properties/:id/tenants
/applications
/applications/:id
/leases
/leases/:id
/maintenance
/payments
/settings
```

All routes require authentication with `manager` or `owner` role.

### Tenant Portal (tenants.propmetrik.com)

Clean, task-focused routes. No `/tenant` prefix required — the subdomain provides context.

```
# Public Routes (no auth required)
/apply/:propertyId              # Application form
/apply/:propertyId/success      # Submission confirmation

# Email-Verified Routes (magic link or token)
/application/:id/status         # Track application status
/lease/:id/preview              # View lease before signing

# Authenticated Routes (full tenant auth)
/dashboard                      # Tenant home
/lease/:id/sign                 # E-sign lease
/payments                       # Payment history and upcoming
/payments/:id                   # Payment details
/maintenance                    # Maintenance requests
/maintenance/new                # Submit new request
/maintenance/:id                # Request details
/profile                        # Tenant profile settings
```

### Route Access Levels

| Level | Description | Example |
|-------|-------------|---------|
| Public | No authentication | `/apply/:propertyId` |
| Email-Verified | Token from email link | `/application/:id/status` |
| Authenticated | Full tenant session | `/payments`, `/lease/:id/sign` |

---

## Authentication and Authorization

### Core Requirements

1. **No Shared Sessions**: Cookies are scoped to their subdomain. A session on `management.propmetrik.com` has no effect on `tenants.propmetrik.com`.

2. **Central Auth Service**: All authentication flows through `auth.propmetrik.com`.

3. **Short-Lived JWTs**: Access tokens expire in 15 minutes. Refresh tokens expire in 7 days.

4. **Role-Based Scopes**: Tokens contain explicit role and permission claims.

### Token Structure

```json
{
  "sub": "user_abc123",
  "iss": "auth.propmetrik.com",
  "aud": "api.propmetrik.com",
  "exp": 1737331200,
  "iat": 1737330300,
  "role": "tenant",
  "scopes": [
    "tenant:read",
    "tenant:applications:read",
    "tenant:leases:sign",
    "tenant:payments:read",
    "tenant:payments:create",
    "tenant:maintenance:create"
  ],
  "tenancy_id": "tenancy_xyz789",
  "property_id": "prop_456",
  "organization_id": "org_123"
}
```

### Authentication Flow

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend  │────▶│ auth.propmetrik  │────▶│ api.propmetrik  │
│             │     │      .com        │     │     .com        │
└─────────────┘     └──────────────────┘     └─────────────────┘
       │                    │                        │
       │  1. Redirect       │                        │
       │────────────────────▶                        │
       │                    │                        │
       │  2. User authenticates                      │
       │                    │                        │
       │  3. JWT issued     │                        │
       │◀────────────────────                        │
       │                    │                        │
       │  4. API request with Bearer token           │
       │─────────────────────────────────────────────▶
       │                    │                        │
       │  5. Token validated, scopes checked         │
       │                    │                        │
       │  6. Response       │                        │
       │◀─────────────────────────────────────────────
```

### Tenant Authentication Methods

| Method | Use Case | Flow |
|--------|----------|------|
| Magic Link | Application status, lease preview | Email contains signed token |
| Password | Returning tenants | Standard login flow |
| OAuth | Optional | Google, Apple for convenience |

### Authorization Enforcement

**Frontend**: Controls UI visibility only. Never trusted for security.

**Backend**: Enforces all authorization via middleware:

```typescript
// Middleware chain for tenant endpoints
app.use('/api/v1/tenant/*', [
  validateJWT,           // Token valid and not expired
  requireRole('tenant'), // Role matches
  validateScopes,        // Required scopes present
  validateOwnership      // User owns the resource
]);
```

---

## Backend API Design

Single API at `api.propmetrik.com`. Endpoints are role-aware but not role-prefixed.

### Endpoint Design Principles

1. RESTful resource naming
2. Role enforcement via middleware, not URL paths
3. Consistent response formats
4. Idempotency keys for mutations

### Application Endpoints

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| POST | /applications | tenant | Submit new application |
| GET | /applications/:id | tenant, manager | View application |
| PATCH | /applications/:id | tenant | Update draft application |
| POST | /applications/:id/submit | tenant | Submit for review |
| POST | /applications/:id/approve | manager | Approve application |
| POST | /applications/:id/reject | manager | Reject with reason |
| GET | /applications | manager | List applications (filtered) |

### Lease Endpoints

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| POST | /leases/generate | manager | Generate lease from template |
| GET | /leases/:id | tenant, manager | View lease |
| POST | /leases/:id/sign | tenant | Sign lease (with e-sign token) |
| POST | /leases/:id/countersign | manager | Manager countersignature |
| GET | /leases/:id/document | tenant, manager | Download signed PDF |

### Payment Endpoints

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | /payments | tenant, manager | List payments |
| GET | /payments/:id | tenant, manager | Payment details |
| POST | /payments | tenant | Initiate payment |
| POST | /payments/:id/confirm | system | Payment gateway callback |

### Maintenance Endpoints

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| POST | /maintenance-requests | tenant | Create request |
| GET | /maintenance-requests/:id | tenant, manager | View request |
| PATCH | /maintenance-requests/:id | tenant | Update request (if open) |
| POST | /maintenance-requests/:id/assign | manager | Assign to vendor |
| POST | /maintenance-requests/:id/complete | manager | Mark complete |

### State Machine Enforcement

Backend enforces valid state transitions. Invalid transitions return `409 Conflict`.

```
Application States:
  draft → submitted → under_review → approved → lease_generated
                   ↘ rejected

Lease States:
  generated → sent_to_tenant → tenant_signed → countersigned → active
                            ↘ expired (TTL)

Maintenance States:
  open → assigned → in_progress → pending_approval → completed
      ↘ cancelled
```

---

## Workflow: Tenant Application Flow

This example demonstrates how the same data flows through both frontends without duplication.

### Step 1: Manager Generates Application Link

**Frontend**: `management.propmetrik.com/properties/:id/applications`

**Action**: Click "Generate Application Link"

**API Call**:
```http
POST /api/v1/properties/:id/application-links
Authorization: Bearer <manager_token>
Content-Type: application/json

{
  "expires_in_days": 7,
  "application_type": "standard"
}
```

**Response**:
```json
{
  "link": "https://tenants.propmetrik.com/apply/prop_456?token=abc123",
  "expires_at": "2026-01-26T00:00:00Z"
}
```

### Step 2: Tenant Submits Application

**Frontend**: `tenants.propmetrik.com/apply/prop_456?token=abc123`

**Action**: Fill form and submit

**API Call**:
```http
POST /api/v1/applications
Content-Type: application/json

{
  "property_id": "prop_456",
  "application_token": "abc123",
  "applicant": {
    "full_name": "Kwame Mensah",
    "email": "kwame@example.com",
    "phone": "+233201234567",
    "employment": { ... },
    "references": [ ... ]
  }
}
```

**Response**:
```json
{
  "id": "app_789",
  "status": "submitted",
  "status_url": "https://tenants.propmetrik.com/application/app_789/status"
}
```

### Step 3: Manager Reviews Application

**Frontend**: `management.propmetrik.com/applications/app_789`

**View**: Full application details, background check results, references.

**API Call** (approve):
```http
POST /api/v1/applications/app_789/approve
Authorization: Bearer <manager_token>
Content-Type: application/json

{
  "lease_template_id": "tpl_standard_1yr",
  "move_in_date": "2026-02-01",
  "monthly_rent": 2500,
  "currency": "GHS"
}
```

### Step 4: Lease Generated and Sent

**Backend**: Automatically generates lease document from template.

**Email**: Sent to tenant with magic link.

```
Subject: Your Lease is Ready to Sign

Dear Kwame,

Your application for 311 Lehigh Dr has been approved.

Please review and sign your lease:
https://tenants.propmetrik.com/lease/lease_abc/sign?token=xyz789

This link expires in 72 hours.
```

### Step 5: Tenant Signs Lease

**Frontend**: `tenants.propmetrik.com/lease/lease_abc/sign`

**Action**: Review terms, draw signature, confirm

**API Call**:
```http
POST /api/v1/leases/lease_abc/sign
Authorization: Bearer <tenant_token>
Content-Type: application/json

{
  "signature_data": "base64_signature_image",
  "signature_timestamp": "2026-01-20T14:30:00Z",
  "ip_address": "41.215.xxx.xxx",
  "user_agent": "Mozilla/5.0...",
  "consent_acknowledged": true
}
```

### Step 6: Manager Sees Update

**Frontend**: `management.propmetrik.com/leases/lease_abc`

**View**: Status updated to "Tenant Signed", awaiting countersignature.

**Same record. Different views. No duplication.**

---

## Domain and DNS Strategy

### Production DNS Records

| Subdomain | Type | Value | Purpose |
|-----------|------|-------|---------|
| management.propmetrik.com | A/CNAME | CDN/Load Balancer | Client Dashboard |
| tenants.propmetrik.com | A/CNAME | CDN/Load Balancer | Tenant Portal |
| api.propmetrik.com | A/CNAME | API Gateway | Backend API |
| auth.propmetrik.com | A/CNAME | Auth Service | Authentication |
| public.propmetrik.com | A/CNAME | CDN | Marketing Site |

### Security Headers

All subdomains must enforce:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; ...
```

### Cookie Configuration

```
# Management Dashboard
Set-Cookie: session=xxx; Domain=management.propmetrik.com; Secure; HttpOnly; SameSite=Strict

# Tenant Portal
Set-Cookie: session=xxx; Domain=tenants.propmetrik.com; Secure; HttpOnly; SameSite=Strict
```

**No cross-subdomain cookies.** Each subdomain maintains isolated session state.

### CORS Configuration

```typescript
// API CORS settings
const corsOptions = {
  origin: [
    'https://management.propmetrik.com',
    'https://tenants.propmetrik.com',
    'https://public.propmetrik.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
};
```

---

## Environment Strategy

| Environment | Domain Pattern | Purpose |
|-------------|----------------|---------|
| Development | *.dev.propmetrik.com | Local/CI development |
| Staging | *.staging.propmetrik.com | Pre-production testing |
| Production | *.propmetrik.com | Live environment |

### Environment-Specific Domains

| Environment | Management | Tenants | API | Auth |
|-------------|------------|---------|-----|------|
| Dev | management.dev.propmetrik.com | tenants.dev.propmetrik.com | api.dev.propmetrik.com | auth.dev.propmetrik.com |
| Staging | management.staging.propmetrik.com | tenants.staging.propmetrik.com | api.staging.propmetrik.com | auth.staging.propmetrik.com |
| Prod | management.propmetrik.com | tenants.propmetrik.com | api.propmetrik.com | auth.propmetrik.com |

### Local Development

Option A: Hosts file + local certificates

```
# /etc/hosts
127.0.0.1 management.local.propmetrik.com
127.0.0.1 tenants.local.propmetrik.com
127.0.0.1 api.local.propmetrik.com
127.0.0.1 auth.local.propmetrik.com
```

Option B: Docker Compose with Traefik/Nginx reverse proxy

```yaml
# docker-compose.yml
services:
  proxy:
    image: traefik:v2.10
    ports:
      - "80:80"
      - "443:443"
    labels:
      - "traefik.enable=true"
      
  management:
    build: ./dashboard
    labels:
      - "traefik.http.routers.management.rule=Host(`management.local.propmetrik.com`)"
      
  tenants:
    build: ./tenant-portal
    labels:
      - "traefik.http.routers.tenants.rule=Host(`tenants.local.propmetrik.com`)"
      
  api:
    build: ./backend
    labels:
      - "traefik.http.routers.api.rule=Host(`api.local.propmetrik.com`)"
```

---

## Testing Strategy

### Unit Tests

Backend service-level tests with mocked dependencies.

```typescript
describe('ApplicationService', () => {
  it('should reject application if property not available', async () => {
    // ...
  });
  
  it('should transition state correctly on approval', async () => {
    // ...
  });
  
  it('should enforce ownership on read', async () => {
    // ...
  });
});
```

### Integration Tests

API-level tests against real database (test container).

```typescript
describe('POST /applications/:id/approve', () => {
  it('should return 403 for tenant role', async () => {
    const res = await request(app)
      .post('/api/v1/applications/app_123/approve')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({ lease_template_id: 'tpl_1' });
      
    expect(res.status).toBe(403);
  });
  
  it('should return 404 for non-existent application', async () => {
    // ...
  });
  
  it('should return 409 for already approved application', async () => {
    // ...
  });
});
```

### End-to-End Tests

Full workflow tests spanning both frontends.

```typescript
describe('Tenant Application Workflow', () => {
  it('should complete full application to lease signing flow', async () => {
    // 1. Manager generates application link
    const linkRes = await managerClient.post('/properties/prop_1/application-links');
    const applicationUrl = linkRes.body.link;
    
    // 2. Tenant submits application
    const appRes = await publicClient.post('/applications', {
      property_id: 'prop_1',
      application_token: extractToken(applicationUrl),
      applicant: mockApplicant
    });
    const applicationId = appRes.body.id;
    
    // 3. Manager approves
    await managerClient.post(`/applications/${applicationId}/approve`, {
      lease_template_id: 'tpl_standard'
    });
    
    // 4. Tenant signs lease
    const leaseId = await getLeaseForApplication(applicationId);
    await tenantClient.post(`/leases/${leaseId}/sign`, {
      signature_data: mockSignature
    });
    
    // 5. Verify final state
    const lease = await managerClient.get(`/leases/${leaseId}`);
    expect(lease.body.status).toBe('tenant_signed');
  });
});
```

### Security Tests

Explicit tests for security boundaries.

```typescript
describe('Security Boundaries', () => {
  describe('Cross-Role Access', () => {
    it('tenant cannot access manager endpoints', async () => {
      const res = await tenantClient.get('/applications');
      expect(res.status).toBe(403);
    });
    
    it('tenant cannot approve applications', async () => {
      const res = await tenantClient.post('/applications/app_1/approve');
      expect(res.status).toBe(403);
    });
    
    it('manager cannot sign lease as tenant', async () => {
      const res = await managerClient.post('/leases/lease_1/sign');
      expect(res.status).toBe(403);
    });
  });
  
  describe('Cross-Tenant Access', () => {
    it('tenant A cannot view tenant B application', async () => {
      const res = await tenantAClient.get('/applications/app_belonging_to_B');
      expect(res.status).toBe(404); // 404 not 403 to prevent enumeration
    });
  });
  
  describe('Token Security', () => {
    it('expired tokens are rejected', async () => {
      const expiredToken = generateExpiredToken();
      const res = await request(app)
        .get('/applications/app_1')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(res.status).toBe(401);
    });
    
    it('signature tokens cannot be replayed', async () => {
      // Sign once successfully
      await tenantClient.post('/leases/lease_1/sign', { signature_data: 'sig' });
      
      // Replay should fail
      const res = await tenantClient.post('/leases/lease_1/sign', { signature_data: 'sig' });
      expect(res.status).toBe(409);
    });
  });
  
  describe('Cross-Subdomain Cookie Isolation', () => {
    it('management cookie not sent to tenant subdomain', async () => {
      // Set cookie on management
      await managementBrowser.login();
      
      // Navigate to tenant subdomain
      await managementBrowser.goto('https://tenants.local.propmetrik.com');
      
      // Should not be authenticated
      expect(await managementBrowser.isAuthenticated()).toBe(false);
    });
  });
});
```

---

## Phased Implementation Plan

### Phase 1: Contracts and State Machines

**Duration**: 1 week

**Deliverables**:

1. Database schema for:
   - `applications` table with status enum
   - `leases` table with status enum and document storage
   - `signatures` table for audit trail

2. State machine definitions:
   ```typescript
   const applicationStateMachine = {
     initial: 'draft',
     states: {
       draft: { on: { SUBMIT: 'submitted' } },
       submitted: { on: { REVIEW: 'under_review' } },
       under_review: { 
         on: { 
           APPROVE: 'approved',
           REJECT: 'rejected'
         } 
       },
       approved: { on: { GENERATE_LEASE: 'lease_generated' } },
       lease_generated: { type: 'final' },
       rejected: { type: 'final' }
     }
   };
   ```

3. Backend service layer with state transition enforcement

4. Manager dashboard integration points (view-only)

**Exit Criteria**: Manager can view application/lease entities with correct states.

---

### Phase 2: Stub Tenant Endpoints

**Duration**: 1 week

**Deliverables**:

1. API endpoints for tenant operations:
   - `POST /applications`
   - `GET /applications/:id`
   - `POST /leases/:id/sign`

2. Token-based access for public application submission

3. Magic link generation for application status viewing

4. Mock/minimal responses for testing

**Exit Criteria**: API contracts finalized. Manager dashboard can generate working application links.

---

### Phase 3: Client Dashboard Integration

**Duration**: 2 weeks

**Deliverables**:

1. Application management UI:
   - List view with filters (status, property, date)
   - Detail view with applicant information
   - Approve/Reject actions with confirmation

2. Lease management UI:
   - Generate lease from template
   - View lease status and document
   - Send/resend signing link

3. Application link generation:
   - Property-scoped link creation
   - Expiration configuration
   - Copy-to-clipboard functionality

4. Real-time status updates (webhooks or polling)

**Exit Criteria**: Manager can complete full workflow from application link generation to lease countersigning.

---

### Phase 4: Tenant Portal (Iterative)

**Duration**: 3-4 weeks

**Iteration 4.1**: Application Form (Week 1)
- Property details display
- Multi-step application form
- Document upload
- Submission confirmation

**Iteration 4.2**: Status Tracking (Week 1)
- Magic link authentication
- Application status display
- Timeline/history view

**Iteration 4.3**: Lease Signing (Week 2)
- Lease document preview
- Signature capture (canvas-based)
- Consent acknowledgment
- Confirmation and document download

**Iteration 4.4**: Tenant Dashboard (Week 2)
- Full authentication flow
- Payment history (view-only initially)
- Maintenance request submission

**Exit Criteria**: Tenant can complete entire journey from application to lease signing.

---

## Dev Testing: Preview as Tenant Mode

### Purpose

Enable developers and QA to test tenant workflows without creating real tenant accounts or switching browsers.

### Implementation

Available in `dev` and `staging` environments only.

```typescript
// Feature flag
const ENABLE_TENANT_PREVIEW = process.env.NODE_ENV !== 'production';
```

### Manager Dashboard UI

Button in property detail or application list:

```
┌─────────────────────────────────────────────────┐
│  Applications for 311 Lehigh Dr                 │
│                                                 │
│  [+ New Application Link]  [Preview as Tenant]  │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ Application #1234 - Submitted           │   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### Flow

1. Manager clicks "Preview as Tenant"
2. Backend generates short-lived preview token:
   ```json
   {
     "type": "preview",
     "role": "tenant",
     "expires_in": 3600,
     "mock_tenant_id": "preview_tenant_xxx",
     "property_id": "prop_456"
   }
   ```
3. Frontend opens new tab to tenant subdomain:
   ```
   https://tenants.dev.propmetrik.com/preview?token=xxx
   ```
4. Tenant portal auto-authenticates with preview token
5. All actions are logged as preview/test (not real tenant activity)

### Backend Enforcement

```typescript
// Middleware to handle preview tokens
function handlePreviewToken(req, res, next) {
  if (req.token.type === 'preview') {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Preview mode disabled in production' });
    }
    
    req.isPreview = true;
    req.previewBy = req.token.original_user_id;
  }
  next();
}
```

### Audit Trail

All preview actions are logged:

```json
{
  "action": "lease_sign_preview",
  "lease_id": "lease_abc",
  "previewed_by": "user_manager_123",
  "timestamp": "2026-01-19T10:00:00Z",
  "environment": "staging"
}
```

### Production Safeguard

```typescript
// Startup check
if (process.env.NODE_ENV === 'production' && ENABLE_TENANT_PREVIEW) {
  console.error('FATAL: Tenant preview mode cannot be enabled in production');
  process.exit(1);
}
```

---

## Anti-Patterns to Avoid

### 1. Role-Based Conditionals in Shared UI

**Wrong**:
```tsx
function Dashboard() {
  const { role } = useAuth();
  
  if (role === 'manager') {
    return <ManagerDashboard />;
  } else if (role === 'tenant') {
    return <TenantDashboard />;
  }
}
```

**Right**: Separate applications with dedicated codebases.

### 2. Frontend-Only Authorization

**Wrong**:
```tsx
// Hiding button but not enforcing on backend
{user.role === 'manager' && <ApproveButton />}
```

**Right**: Backend middleware enforces all authorization. Frontend hiding is UX only.

### 3. Shared Session Cookies

**Wrong**:
```
Set-Cookie: session=xxx; Domain=.propmetrik.com
```

**Right**: Subdomain-scoped cookies with no cross-domain leakage.

### 4. URL-Based Role Prefixes

**Wrong**:
```
/tenant/payments
/manager/payments
```

**Right**: Subdomain separation. Routes are role-agnostic within each app.

### 5. Duplicated Business Logic

**Wrong**: Validation logic in both frontend and backend that can drift.

**Right**: Backend is source of truth. Frontend validation is UX convenience only.

### 6. Testing in Production First

**Wrong**: "Just test the tenant flow quickly in prod"

**Right**: Full workflow testing in staging with preview mode before any production deployment.

---

## Why This Architecture Works

### Security

- **Isolation**: Separate subdomains prevent cookie leakage and session confusion
- **Defense in Depth**: Backend enforces all authorization regardless of frontend behavior
- **Minimal Attack Surface**: Tenant portal has only tenant-relevant endpoints exposed
- **Audit Trail**: All signature and state transitions are logged with timestamps and IP addresses

### Scalability

- **Independent Deployment**: Tenant portal can be deployed/scaled independently from management dashboard
- **CDN-Friendly**: Static frontends can be globally distributed
- **Stateless Backend**: JWT-based auth enables horizontal API scaling
- **Database Efficiency**: Single source of truth eliminates sync issues

### Maintainability

- **Clear Boundaries**: Teams can work on tenant vs. manager experiences independently
- **Focused Codebases**: Each frontend has a single responsibility
- **Testable Contracts**: API contracts are well-defined and tested independently
- **No Role Spaghetti**: No conditional logic based on user role scattered throughout codebase

### Mobile Readiness

- **API-First**: Same backend serves web and future mobile apps
- **Token-Based Auth**: Works identically for web and native clients
- **Stateless Design**: No server-side session dependencies
- **Consistent Contracts**: Mobile team can develop against same API specification

---

## Appendix: File Structure

```
propmetrik/
├── backend/                    # Single API (api.propmetrik.com)
│   ├── src/
│   │   ├── modules/
│   │   │   ├── applications/
│   │   │   ├── leases/
│   │   │   ├── payments/
│   │   │   └── maintenance/
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   ├── roles.ts
│   │   │   └── ownership.ts
│   │   └── services/
│   └── tests/
│
├── dashboard/                  # management.propmetrik.com
│   ├── src/
│   │   ├── app/
│   │   │   ├── applications/
│   │   │   ├── leases/
│   │   │   └── properties/
│   │   └── components/
│   └── tests/
│
├── tenant-portal/              # tenants.propmetrik.com (NEW)
│   ├── src/
│   │   ├── app/
│   │   │   ├── apply/
│   │   │   ├── application/
│   │   │   ├── lease/
│   │   │   ├── payments/
│   │   │   └── maintenance/
│   │   └── components/
│   └── tests/
│
├── auth-service/               # auth.propmetrik.com
│   ├── src/
│   │   ├── strategies/
│   │   ├── tokens/
│   │   └── sessions/
│   └── tests/
│
└── docs/
    ├── tenant.md               # This document
    ├── api-spec.yaml
    └── security.md
```

---

*Document maintained by: Platform Architecture Team*  
*Review cycle: Quarterly or on major feature additions*
