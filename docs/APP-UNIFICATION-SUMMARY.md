# PROPMETRIK App Unification - Summary

## Architecture Changes

This document summarizes the app unification work completed to integrate previously disconnected applications into a cohesive monorepo structure.

## Before

The codebase had 5 disconnected frontend/backend apps:
1. **Main Dashboard** (Next.js 15, port 3000)
2. **Tenant Portal** (Next.js 14.1, port 3001) - Standalone app
3. **E-Sign UI** (Vite/React, port 3001) - Port conflict with tenant portal
4. **Express Backend** (TypeScript, port 4000)
5. **Python FastAPI E-Sign** (port 8002) - Separate service

## After

Unified monorepo with:
- Single Turborepo configuration for all packages
- Tenant portal merged into main frontend at `/tenant/*` routes
- E-Sign consolidated as TypeScript services in Express backend
- Shared UI component library at `packages/ui`

---

## Changes Made

### P0: Critical Route Mounting (Completed)
- [backend/src/index.ts](backend/src/index.ts): Added imports and route mounts for eSign and tenantPortal routes
- eSign routes mounted at `/api/v1/esign`
- tenantPortal routes mounted at `/api/v1/tenant-portal`

### P1: E-Sign Service Integration (Completed)
- **[packages/e-sign-ui/src/config.ts](packages/e-sign-ui/src/config.ts)**: Changed `apiBaseUrl` from `http://localhost:8002` to `http://localhost:4000/api/v1/esign`

- **Created TypeScript services in [backend/shared-services/e-sign/](backend/shared-services/e-sign/)**:
  - [types.ts](backend/shared-services/e-sign/types.ts): Comprehensive type definitions
  - [templateService.ts](backend/shared-services/e-sign/templateService.ts): Template management
  - [envelopeService.ts](backend/shared-services/e-sign/envelopeService.ts): Envelope CRUD operations
  - [index.ts](backend/shared-services/e-sign/index.ts): Barrel exports

- **[backend/src/services/e-sign/eSignIntegrationService.ts](backend/src/services/e-sign/eSignIntegrationService.ts)**: Refactored from HTTP client to use local TypeScript services

- **[backend/.env.example](backend/.env.example)**: Removed `ESIGN_SERVICE_URL`, added `ESIGN_MAGIC_LINK_BASE_URL`

### P2: Monorepo Setup (Completed)
- **[package.json](package.json)**: Configured workspaces (backend, frontend, tenant-portal, packages/*)
- **[turbo.json](turbo.json)**: Turborepo task definitions for build, dev, lint, test, clean

- **Package name standardization**:
  - frontend → `@propmetrik/frontend`
  - backend → `@propmetrik/backend`
  - tenant-portal → `@propmetrik/tenant-portal`
  - e-sign-ui → `@propmetrik/e-sign-ui`

- **Created shared UI package** [packages/ui/](packages/ui/):
  - Copied all UI components from frontend
  - Created barrel exports in [src/index.ts](packages/ui/src/index.ts)
  - Added [package.json](packages/ui/package.json) with proper exports

### P3: Tenant Portal Integration (Completed)
- **Merged tenant portal routes** into [frontend/src/app/tenant/](frontend/src/app/tenant/):
  - /tenant/apply
  - /tenant/application
  - /tenant/dashboard
  - /tenant/lease
  - /tenant/login
  - /tenant/maintenance

- **Updated all API calls** from `http://localhost:4000/api/v1/` to `/api/v1/` (using frontend proxy)
- **Updated all route links** to include `/tenant/` prefix

### P3: E-Sign Frontend Integration (Completed)
- **Created [frontend/src/app/esign/page.tsx](frontend/src/app/esign/page.tsx)**: E-sign dashboard page
- **Created [frontend/src/app/sign/[token]/page.tsx](frontend/src/app/sign/[token]/page.tsx)**: External signing page with signature canvas

---

## Running the Unified App

### Development
```bash
# Install dependencies (from root)
npm install

# Run all apps in parallel
npm run dev

# Or run specific apps
npm run dev:backend    # Backend only
npm run dev:frontend   # Frontend only
npm run dev:tenant     # Tenant portal (still available standalone)
```

### URLs
- **Main Frontend**: http://localhost:3000
- **Tenant Portal**: http://localhost:3000/tenant (merged into frontend)
- **E-Sign Dashboard**: http://localhost:3000/esign
- **Signing Page**: http://localhost:3000/sign/:token
- **Backend API**: http://localhost:4000/api/v1

---

## Deprecated

The following are now deprecated and can be removed:
- `phase12-esign/` - Already deleted
- Python files in `backend/shared-services/e-sign/` - Removed
- `ESIGN_SERVICE_URL` environment variable - No longer needed

---

## Database Requirements

The e-sign functionality requires the following tables in the `esign` schema:
- `esign.templates`
- `esign.envelopes`
- `esign.envelope_signers`
- `esign.envelope_fields`
- `esign.audit_log`
- `esign.webhook_registrations`

Run the migration at [backend/shared-services/e-sign/init.sql/01_schema.sql](backend/shared-services/e-sign/init.sql/01_schema.sql) if these don't exist.
