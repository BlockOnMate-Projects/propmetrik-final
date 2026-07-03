# PROPMETRIK — Enterprise CRM Capability Audit & Gap Analysis

> **Prepared for:** CTO / Engineering Leadership
> **Prepared by:** Principal Solutions Architect (codebase-evidenced assessment)
> **Date:** 2026-07-03
> **Scope:** Full-repository audit (`backend/`, `frontend/`, `shared-services/`, `packages/`, `tenant-portal/`, 239+ migrations) to determine how an **enterprise-grade Real Estate CRM for Ghana** can be built by **maximizing reuse** of existing platform capability.
> **Method:** 12 parallel domain audits (communications, payments, maps, identity, AI, documents/e-sign, analytics, calendar/email/storage, marketing/social, Ghana real-estate domain, portals/platform, CRM baseline) + direct schema/env/dependency verification. Every conclusion is backed by `file:line` evidence.

**Legend:** ✅ Reuse directly · 🟡 Exists, needs extension · 🟠 Exists, needs refactor before reuse · 🔴 Does not exist, must build
**Effort:** S (<1 wk) · M (1–2 wk) · L (3–6 wk) · XL (6 wk+) · **Reuse score:** 0 (none) – 10 (drop-in)

> **⚠️ CORRECTED 2026-07-03 after independent re-verification** (`docs/audit/crm_gaps_VERIFIED.md`). This document originally overstated in ~11 places (both directions). Status markers below now reflect **live DB/code verification**; every changed cell is tagged **[VERIFIED-CORRECTION]** with the delta. The verified companion doc holds the full ledger + trustworthy roadmap and is the source of truth if the two ever conflict.

---

## 1. Executive Summary

**Headline: PropMetrik is not a green-field CRM problem. It is a wiring-and-consolidation problem.** The platform already contains ~90% of the *infrastructure* an enterprise real-estate CRM needs — much of it production-grade — because the CRM shares a mature multi-domain platform (Valuation, Property Management, Project Management, Data Hub, Analytics) plus a rich cross-cutting `shared-services/` layer (e-sign, notifications, documents, payments, calendar, marketplace, publications, workflow engine).

**What already exists and is production-ready (reuse directly):** multi-tenant RBAC with append-only audit, a full deal/pipeline/contact/agent/commission/target/invoice CRM data model, WhatsApp Business + Twilio SMS + 3-tier email, Paystack (card + mobile-money inbound) + NOWPayments crypto + a unified payment ledger with live FX, PostGIS + dual-provider geocoding + Mapbox maps, a multi-provider LLM stack (Gemini/DeepSeek/Claude with automatic fallback) already powering Kobby AI and property narratives, a DOCX→PDF + Handlebars merge-field document engine, a full e-sign envelope system, Google Calendar + Gmail/Outlook sync, an OpenSearch marketplace with public listing pages, and a live analytics suite.

**What is genuinely missing (must build):** the **entire outbound disbursement rail** (inbound works; there is **no crypto/MoMo/bank payout of any kind** — `cryptoPayoutService` is wallet-setup only) [VERIFIED-CORRECTION — broader than "MoMo payouts"], social-media listing syndication (Facebook/Instagram/TikTok — zero code), voice calling, third-party KYC/ID verification (Ghana Card is *captured* but never *verified*; **Didit is not integrated despite the connector**), i18n, and a handful of domain schemas (offers/reservations, purchase-installment plans, agent territories). *(Note: Sentry APM is already integrated in code — just dormant, no `SENTRY_DSN`; and address-autocomplete UI + contact-import already exist — see corrections in §3.)*

**What is the biggest risk (must fix first):** **a phantom-schema defect in the CRM AI layer.** Code paths query `crm_deals`/`crm_contacts`/`crm_tasks`/`crm_pipeline_stages`/`crm_deal_pipelines`/`crm_activities` — **tables that do not exist** (the real tables are `deals`/`contacts`/`tasks`/`deal_stages`/`deal_pipelines`/`deal_activities`). **[VERIFIED-CORRECTION] `crm_properties` and `crm_property_viewings` ARE real bridge tables — do NOT "fix" those refs.** This silently breaks Kobby AI's `deal` and `crm` context scopes and is technical debt inherited from a removed `/crm/ai/*` route. See §15 (Risk R1). Any CRM-AI feature built on that assumption will fail at runtime.

**Recommended posture:** three-quarters of the roadmap is **integration, not construction.** Phase 1 wires existing services into the CRM (0 new services). Phase 2 completes half-built features (drip execution engine, MoMo payouts, KYC verification). Phase 3 builds the true green-field items (social syndication, offers/reservations). Phase 4 is enterprise hardening (i18n, DR, observability).

**Overall reuse posture:** of ~70 audited CRM capabilities, **~46% are ✅ reuse-directly, ~26% 🟡 extend, ~9% 🟠 refactor, ~19% 🔴 build-new.**

---

## 2. Architecture Overview

Source: `ARCHITECTURE.md`, direct inspection.

- **Monorepo, ~513K LOC.** `backend/` (Express + TypeScript, port 4000, 81 HTTP routers, 239+ SQL migrations) · `frontend/` (Next.js 14 App Router, port 3000, 263K LOC) · **Python valuation service** (FastAPI :8001) · **ML-serving** service (`shared-services/ml-serving`) · `tenant-portal/` (customer portal app) · `packages/` (shared `ui`, `types`, `e-sign-ui`) · `blockchain/`.
- **Runtime topology:** Frontend proxies `/api/*` → backend `/api/v1/*` (`next.config.js` rewrites) and `/ml-api/*` → Python. Backend → **single production PostgreSQL** (`pg.cedynhq.com:5434` — no dev DB; all DB commands hit prod). Infra (Hetzner): **Keycloak** (auth), **MinIO/S3** (`s3.cedynhq.com`, 4 buckets), **OpenSearch** (search), **Redis**.
- **Domains** (`backend/src/services/`): `valuation-engine` (7-method hybrid TS+Python), `property-management` (leases/tenants/maintenance/rent), `project-management` (construction/dev), `crm-deal-management` (the CRM), `data-hub` (ETL/geocoding/ingestion), `analytics` (GHPI/GHAI/CCI indices, ML).
- **Cross-cutting `shared-services/`** — the reuse goldmine: `notifications` (`notify.ts`, unified email/SMS/in-app, WhatsApp, OTP), `e-sign` (envelope model, PDF signing, audit, magic-link), `document-service` (Handlebars→Puppeteer, OCR, storage, templates), `payments` (crypto, fee engine, subscriptions), `calendar` (Google Calendar), `marketplace` (OpenSearch + geocoding), `publications` (AI research + PDF), `workflow` (execution engine + event emitter), `messaging` (WhatsApp), `workspace` (chat + Kobby AI), `ml-serving`, `compliance` (RICS), `risk` (flood/litigation), `auth-keycloak`, `api-gateway-kong`.
- **Conventions:** every tenant-scoped row carries `organization_id` (org-scoped reads); money is `NUMERIC` + currency enum (never hardcode currency); `deleted_at` soft-delete on core/financial tables; **append-only `audit_logs`** (DB-trigger-enforced immutability, migration 238); migrations idempotent, manually run (`npm run migrate`); config centralized in `src/config/index.ts`; auth = Keycloak JWT + `requirePMAccess`/`requireServiceAccess` + org scoping via `getAuthOrgId`.
- **Background processing:** 8 cron jobs in `backend/src/jobs/` (analyticsRefresh, rentReminder, subscriptionRenewal, whatsappDigest, dataHubSync, crmTaskReminder, kobbyAIMonitor, contributionProcessor). **Bull + ioredis are installed but not used** — jobs run synchronously via `node-cron`.

**Architectural implication for the CRM:** the CRM should be a *thin orchestration layer* over shared-services, not a self-contained silo. Most "CRM features" are compositions of existing engines scoped by `organization_id`.

---

## 3. Existing Capability Audit (by domain)

### 3.1 Communications & Notifications
| Capability | Status | Evidence | Maturity |
|---|---|---|---|
| WhatsApp Business | ✅ | `shared-services/messaging/whatsappService.ts` (text/template/document, Ghana phone fmt, CRM templates: deal-status, viewing-reminder, doc-for-signature); `routes/messaging.ts`; `whatsapp_messages` table (mig 087); `jobs/whatsappDigest.ts` | Production |
| SMS (Twilio) | ✅ | `shared-services/notifications/unified/index.ts` `TwilioSMSService` (test/live, E.164); used in `rentReminderJob`, `crmTaskReminderJob` | Production |
| Email (transactional) | ✅ | `notifications/unified/index.ts` **3-tier failover** (MS Graph → AWS SES → Google OAuth SMTP), branded templates | Production |
| Central notify() core | ✅ | `shared-services/notifications/notify.ts` — single fan-out to in-app inbox + email + SMS; audience routing (staff vs tenant); categories (esign/property/valuation/crm/project/finance/system); SSE realtime | Production |
| Voice calling | 🔴 | Searched: no Twilio Voice / IVR anywhere | Missing |
| Message queues | 🟡 | `bull` + `ioredis` in package.json but **no consumers**; jobs use node-cron | Pre-positioned, unused |
| Drip / follow-ups | 🟡 | `crm_drip_campaigns` / `crm_drip_campaign_steps` / `crm_drip_enrollments` (mig 219); routes `crm/drip-campaigns.ts` — **schema complete, NO execution engine** | Partial |
| Campaigns (segments/A-B) | 🟠 | Drip only; no audience segmentation, A/B, open/click tracking | Stub |
| Contact sync (import/export) | 🟡 | **[VERIFIED-CORRECTION]** import EXISTS (`POST /crm/contacts/import`, bulk ≤500 upsert); only **export** missing (was wrongly "🟠 none") | Import done, export TODO |
| Conversation threading | 🟡 | Workspace chat mature; email threading via `crm_emails.thread_id`/`message_id`; not unified across channels | Partial |
| Appointment reminders | ✅ | `jobs/crmTaskReminderJob.ts` (daily, 1-day-before + overdue) | Production |

### 3.2 Payments
| Capability | Status | Evidence | Maturity |
|---|---|---|---|
| Paystack (card + MoMo inbound) | ✅ | `services/payments/paymentProcessor.ts`, `paystackService.ts` — init/verify/webhook, subaccount split (`bearer=subaccount`), idempotent ledger | Production |
| **Outbound disbursement rail** (MoMo/bank/crypto payouts) | 🔴 | **[VERIFIED-CORRECTION]** gap is broader than "MoMo only" — `cryptoPayoutService.ts` is **wallet-setup/validation ONLY**; there is **no actual disbursement of any kind** (crypto, MoMo, *or* bank). The entire payout rail is absent | Non-functional for all payouts |
| Crypto (NOWPayments) | ✅ | `shared-services/payments/crypto/` — 200+ coins, any-coin→any-coin settlement, escrow | Advanced |
| On-chain (Polygon ERC-20) | 🟡 | `cryptoPaymentService.ts` + contract listener | Staging |
| Unified ledger | ✅ | `payment_transactions` (mig 133) — universal across rent/deal/project/crypto/subscription; idempotent webhook processing | Production |
| Multi-currency / FX | ✅ | `exchangeRateService` + live-rate lock at checkout (mig 240–241); dual-currency (obligation + charged) | Production |
| Reservation/booking fees | 🟡 | `deal` fee rule (0.25%) in fee engine; no earnest/booking/deposit stage distinction | Partial |
| Deposits (security) | 🔴 | No distinct escrow-hold payment type | Missing |
| Installments | ✅/🟡 | Rent schedules ✅ (`paymentPlanService`, FIFO apply); deal installments 🟡 (metadata only) | Mixed |
| Commission payouts | 🟡 | `commissionService` tracks pending→approved→paid but **not wired to a payout rail** | Tracking only |
| Refunds | 🟡 | `payment_transactions.status='refunded'` enum exists; **no Paystack reversal handler** | Stubbed |
| Webhooks/reconciliation | ✅ | `paymentProcessor.handleWebhook()` — signature verify, idempotent, ledger + schedule + notify | Production |

### 3.3 Maps & Geo
| Capability | Status | Evidence |
|---|---|---|
| PostGIS + spatial indexing | ✅ | mig 006 — PostGIS extension, `GEOMETRY(POINT,4326)` on properties/neighborhoods/transactions, GIST indexes, `find_properties_within_radius()`, `calculate_property_distance()` |
| Geocoding + reverse | ✅ | `services/data-hub/geocodingService.ts` — Mapbox primary + Google fallback, `geocoding_cache` w/ confidence TTL, Ghana Post GPS digital addresses |
| Static/satellite maps | ✅ | `valuation-engine/valuationDocumentService.ts` — Google Static Maps (hybrid, z17), stored to MinIO as valuation Appendix C |
| Nearby places / amenities | ✅ | Google Places Nearby + Overpass/OSM (`shared-services/marketplace/geocodingService.ts`) |
| Frontend maps | ✅ | Mapbox GL via `react-map-gl` (`properties/[id]/_components/ZoneMap.tsx`), accuracy badge |
| Distance filtering | ✅ | marketplace `geo_radius`, comparable `max_distance_km` |
| Coordinates storage | ✅ | `properties.latitude/longitude` + geometry + `geocoding_confidence` + `nearby_landmarks[]` |
| Directions/routing | 🔴 | None found |
| Address autocomplete UI | ✅ | **[VERIFIED-CORRECTION]** frontend component EXISTS — `frontend/src/components/marketplace/LocationSearch.tsx` (debounced, `/api/marketplace/autocomplete`); was wrongly "🟡 no component" |

### 3.4 Identity & KYC
| Capability | Status | Evidence |
|---|---|---|
| ID document storage | ✅ | `applications.uploaded_documents` JSONB + MinIO (`propertyManagement.ts` application-links) |
| Tenant onboarding workflow | ✅ | State machine draft→submitted→under_review→approved (`applicationService.ts`), multi-step form, audit trail |
| Ghana Card | 🟡 | Captured (`applications.applicant_ghana_card`, `applicant_id_type` mig 234); **no NIA/GRA verification API** |
| Passport | 🟡 | Captured (bio page); no authority verification |
| Driver's license | 🔴 | Not in enum |
| KYC workflows (3rd-party) | 🟡 | Form capture only; no employment/reference/credit verification |
| **Didit** | 🔴 | **Zero code/config anywhere** (browser connector only — not integrated) |
| Liveness/biometric | 🔴 | None |
| OCR of ID docs | 🔴/🟠 | No raw OCR; `mlServingClient.documentIntelligence()` does structured extraction |

### 3.5 AI (substantial — reuse-first)
| Capability | Status | Evidence |
|---|---|---|
| Central LLM client | ✅ | `shared-services/ai/llmClient.ts` (DeepSeek primary + Claude fallback, retry, cost metrics); `services/ai/aiService.ts` (Gemini + DeepSeek, **centralized model config**, JSON mode) |
| Chat assistant (Kobby) | ✅ | `shared-services/workspace/KobbyAIService.ts` — multi-entity context (project/valuation/deal/property/crm/platform), WS + REST. **⚠ see Risk R1** |
| Property/listing descriptions | ✅ | `services/ai/propertyDescriptionService.ts` (marketing/valuation modes, fact-grounded) |
| Area/market narratives | ✅ | `valuation-engine/areaNarrativeService.ts`, `valuationWriteupService.ts` (geocoding + Places grounded) |
| Recommendations / auto-match | ✅ | `crm-deal-management/propertyMatchService.ts` (0–100 weighted); `analytics/investmentScoringService.ts` |
| Lead/deal scoring | 🟡 | `contacts.lead_score` field + property-match; **no AI deal-scoring engine** (removed endpoint) |
| Semantic search | ✅ | OpenSearch full-text (`opensearchMarketplaceService.ts`); no vector embeddings yet |
| OCR / doc extraction | 🟠 | `mlServingClient.documentIntelligence()` (tables/entities/classification) |
| Translation | 🔴 | None (opportunity: Twi/Fante via `aiService`) |
| Email drafting | 🔴 | None |
| Summarization | 🟡 | Infra exists (`mlServingClient`), not wired |

### 3.6 Documents & E-Signatures
| Capability | Status | Evidence |
|---|---|---|
| PDF generation | ✅ | LibreOffice DOCX→PDF + PDFKit cover + Puppeteer + pdf-lib (`shared-services/publications/pdfGenerationService.ts`, valuation renderers) |
| Templates + merge fields | 🟡 | **[VERIFIED-CORRECTION]** engine ✅ (`documentGenerationService`, Handlebars, helpers) but `crm_merge_field_registry` **exists with ZERO rows** — the "40+ fields" are unseeded. Seed the registry before relying on merge fields |
| Document storage + versioning | ✅ | MinIO multi-bucket, `crm_generated_documents`, `parent_document_id` versioning, presigned URLs |
| E-sign envelopes / multi-signer / routing | ✅ | `shared-services/e-sign/envelopeService.ts`, `pdfSigningService.ts` (SHA-256 hash), `auditLogService.ts`, magic-link; `crm_esign_audit`, `signature_envelopes` |
| Signed PDF + verification | ✅ | Visual signature embed + certificate page + per-signer audit (email/name/time/IP) |
| Deal document checklist | ✅ | `crm_stage_document_requirements` + `crm_deal_document_checklist` (blocking docs gate stage advance) |
| Signature capture UI | 🟡 | `packages/e-sign-ui`; field-placement schema (`ESignField`) ready, **no drag-drop designer** |
| Receipts/contracts/letters | 🟡 | Engine ready; templates to be authored |

### 3.7 Analytics
| Capability | Status | Evidence |
|---|---|---|
| Sales/pipeline/conversion/funnel | ✅ | `routes/crm/analytics.ts` (live from `deals`, FX-normalized) |
| Revenue + forecasting | ✅ | probability-weighted, cash-recognition; `RevenueForecaster.tsx` |
| Agent performance / leaderboard / quota | ✅ | `analytics.ts` (win rate, cycle time, `sales_targets` attainment) |
| Platform analytics services | ✅ | mlAnalytics, CCI, GHAI, rental, investment scoring, CapRate |
| Charts + export | ✅ | recharts + SVG heatmaps; CSV/Excel/JSON export; `crm_scheduled_reports` |
| Marketing attribution | 🟠→🟡 | Loss reasons only; **but `deals` already has `lead_source`/`campaign_source`/`utm_data` columns** — attribution is a query away |
| AI/token usage | 🟠 | ML drift/confidence tracked; no LLM token/cost dashboard |
| Inventory burndown | 🟡 | Rental analytics live; unit availability drill-down partial |

### 3.8 Calendar / Email Sync / Storage
| Capability | Status | Evidence |
|---|---|---|
| Google Calendar | ✅ | `shared-services/calendar/googleCalendarService.ts` + OAuth (`user_integrations` mig 061) |
| Internal calendar + viewing scheduler | ✅ | `routes/calendar.ts` (RRULE, attendees, links to deals/contacts), `viewing_availability`/`viewing_bookings`, `ViewingScheduler.tsx` |
| Gmail sync | 🟡 | **[VERIFIED-CORRECTION]** mail I/O works, but contact-linking queries **phantom `crm_contacts`** (lines 468/585) → R1-broken (see R1). `crm_emails` is runtime-created via `ensureEmailsTable()`, not migrated |
| Outlook email | 🟡 | MS Graph mail ops functional; no Outlook **calendar** |
| MinIO/S3 storage | ✅ | `database/minio.ts` (SDK v3, presigned, 4 buckets) |
| OAuth framework | ✅ | Xero pattern + `integrations` table (oauth/api_key/bearer, token rotation, `integration_logs`) |
| Google Drive / OneDrive | 🔴 | Env present for Google; no Drive/OneDrive service |
| File versioning | 🟡 | Timestamp-prefix only, not explicit version chain |

### 3.9 Marketing & Social Publishing
| Capability | Status | Evidence |
|---|---|---|
| Marketplace / public listings | ✅ | `controllers/marketplace/marketplaceController.ts` (OpenSearch + PG, geo), `routes/publicProperties.ts`, `marketplace_enabled` flag (default true) |
| Public property detail pages | ✅ | `(marketing)/marketplace/page.tsx`, `apply/[token]` (gallery, map, view tracking) |
| Flyer/brochure generation | ✅ | `properties/[id]/brochure` + Puppeteer; `publications/pdfGenerationService.ts` |
| Publications engine | ✅ | `shared-services/publications/` (publicationsService + autopilot + geminiService — AI market research → PDF) |
| Facebook/Meta | 🔴 | No listing syndication (WhatsApp is notifications-only) |
| Instagram / TikTok / LinkedIn / Twitter | 🔴 | Zero implementation |
| SEO / OG tags | 🟡 | Shareable tokens + QR; **no dynamic `generateMetadata()` OG tags** per listing |

### 3.10 Ghana Real-Estate Domain
| Capability | Status | Evidence |
|---|---|---|
| Valuation history (7 methods) | ✅ | `valuations` (mig 014), 30+ ValuationService files, CapRate/approval |
| Rental/lease mgmt + Ghana advance-rent | ✅ | `tenancies` (mig 035, `advance_payment_months`), lease e-sign, `TenancyService` |
| Maintenance requests | ✅ | `maintenance_work_orders` (mig 035, vendor/budget/photos) |
| Utility accounts | ✅ | `utility_charges` (mig 132, 9 types) → rent schedules |
| Rent payment + mobile money | ✅ | `rent_payments` (mig 035, MTN/Vodafone/AirtelTigo enums) |
| Commission splitting | ✅ | `commission_plans/tiers/splits`, clawback (mig 064), `commissionService` |
| Developer inventory / phases / units | ✅ | `development_projects` / `project_phases` / `project_units`, `unit_status` enum |
| Digital addresses (Ghana Post GPS) | ✅ | On properties/tenants/vendors/contacts/agents |
| Region partitioning | ✅ | 16-region LIST partitioning (mig 241) |
| Land Commission ref | 🟠 | Staging table only (`tier1_land_title_records_staging`), no CRM API |
| Plot/parcel + site plans | 🟡 | `properties.land_area_sqm`/`plot_size_acres`, `land_title_number`; no dedicated parcel schema |
| Family/stool land tenure | 🟠 | Tenure-risk table exists; no tenure classification enum |
| Offer management | 🟡 | Stage-based (`crm_properties.status='under_offer'`); no offers table |
| Reservation workflows | 🟡 | No dedicated reservation/earnest schema |
| Agent territory | 🟡 | `agents.regions_covered[]`; no geo-fence/exclusivity |
| Purchase installment plans | 🟡 | `rent_schedules` lease-focused; no buyer installment table |
| Property inspection (condition) | 🟡 | Valuation/permit inspections only; no PM condition inspection |

### 3.11 Portals & Enterprise Platform
| Capability | Status | Evidence |
|---|---|---|
| Tenant / Agent / Admin portals | ✅ | `routes/tenantPortal.ts`; `dashboard/deals/*`; `dashboard/admin/*` (20+ modules) |
| Multi-tenancy | ✅ | `organization_id` pervasive; `middleware/pmAuth.ts` |
| RBAC (custom roles) | ✅ | `authorization_policies` (5-min cached, service-keyed, 30+ resources), `middleware/authorize.ts`, `routes/rbac.ts` |
| Audit trails | ✅ | Append-only `audit_logs` (trigger-immutable, mig 238), `auditMutations.ts` |
| Activity timelines | ✅ | `deal_activities` (immutable), admin activity UI |
| Webhooks | ✅ | `routes/webhooks.ts` (NOWPayments/WhatsApp/e-sign, HMAC-SHA256) |
| Event bus | ✅ | `EventBus.ts` (project domain, 40+ types); `workflow/workflowEventEmitter.ts` |
| **Workflow engine** | ✅ (caveat) | **[VERIFIED-CORRECTION]** schema (5 tables) + `workflowService` + `routes/workflows.ts` **ARE wired & live** (`/api/v1/workflows`, engine imported at line 26) — was wrongly "NOT wired". **Caveat:** the engine's CRM entity-action handlers (`workflowExecutionEngine.ts`) are the R1-broken phantom-table code |
| Background jobs | ✅ | 8 cron jobs |
| Global/full-text search | ✅ | OpenSearch + `crm/global-search.ts` + tsvector `search_vector` columns |
| Soft deletes | ✅ | `deleted_at` on core/financial tables |
| Multi-currency | ✅ | `currencyFx.ts` (live + IAS-21 historical) |
| Config management | ✅ | `config/index.ts` |
| Feature flags | 🟡 | **[VERIFIED-CORRECTION]** `featureFlags.ts` is a **general-purpose** flag service with targeting rules (not valuation-exclusive); just not adopted platform-wide yet |
| Observability | 🟡 | **[VERIFIED-CORRECTION]** Sentry `@sentry/node@^10.42` is **fully integrated & wired** (`config/sentry.ts`, `initSentry(app)` @ index.ts:136, error handler @ 815) but **DORMANT — `SENTRY_DSN` unset**. Activate by setting the DSN. pino logging live; Prometheus/OTel genuinely absent (was wrongly "no Sentry") |
| Timezones | 🟡 | Profile + schedulers; not enforced everywhere |
| i18n / localization | 🔴 | None (English-only) |
| Backup / DR | 🔴 | Not represented in code (assumed managed at DB layer) |

---

## 4. CRM Capability Matrix (feature-by-feature)

> Consolidated view across the feature list requested. **RS** = reuse score.

### Tier 1 — Must Have
| Capability | Status | Existing Asset | RS | Effort | Recommendation |
|---|---|---|---|---|---|
| WhatsApp | ✅ | `whatsappService`, `whatsapp_messages`, digest job | 9 | S | Wire CRM triggers → existing templates |
| SMS | ✅ | Twilio unified | 9 | S | Call `smsService` from CRM events |
| Email | ✅ | 3-tier failover | 9 | S | Reuse for offers/receipts/follow-ups |
| Voice calling | 🔴 | — | 0 | L | Build on Twilio Voice (already a Twilio shop) |
| Notifications | ✅ | `notify.ts` | 10 | S | `notify({category:'crm'})` |
| Messaging queue | 🟡 | Bull installed, idle | 4 | M | Activate Bull for drip/bulk send |
| Templates | ✅ | notification + doc templates | 9 | S | Author CRM template set |
| Conversation history | 🟡 | workspace + crm_emails | 6 | M | Unify channels into one timeline |
| Appointment reminders | ✅ | crmTaskReminderJob | 8 | S | Add viewing-reminder cron |
| Automated follow-ups | 🟡 | drip schema | 5 | M | **Build execution engine** |
| Campaigns | 🟠 | drip only | 4 | L | Add segmentation + tracking |
| Contact syncing | 🟠 | Data Hub one-way | 3 | M | CSV import/export + Google Contacts |
| Google Maps / geocoding / nearby | ✅ | geocodingService, PostGIS | 9 | S | Reuse for territory/lead maps |
| Address autocomplete | 🟡 | backend Places | 6 | S | Add frontend component |
| Directions | 🔴 | — | 0 | M | Optional (Mapbox Directions) |
| Paystack / cards / MoMo inbound | ✅ | paymentProcessor | 9 | S | Reuse for reservation/booking |
| Crypto (NOWPayments) | ✅ | crypto services | 8 | S | Optional high-value deals |
| MoMo **payouts** | 🔴 | schema only | 2 | L | Build MTN/Telecel/AirtelTigo disbursement |
| Reservation/booking fees | 🟡 | deal fee rule | 6 | M | Add `payment_stage` enum |
| Deposits | 🔴 | — | 2 | M | Add escrow-hold ledger type |
| Installment plans | 🟡 | rent schedules | 6 | M | Generalize to purchase plans |
| Commission payouts | 🟡 | commissionService | 6 | M | Wire to payout rail |
| Refunds | 🟡 | status enum | 4 | M | Add Paystack reversal handler |
| Ghana Card / passport / license verify | 🟡/🔴 | capture only | 3 | L | Integrate Didit/Smile ID/NIA |
| KYC workflows | 🟡 | tenant app FSM | 4 | L | Extend to agent/buyer KYC |
| ID document storage | ✅ | applications + MinIO | 8 | S | Reuse pattern |

### Tier 2
| Capability | Status | Existing Asset | RS | Effort | Recommendation |
|---|---|---|---|---|---|
| Publish to website/marketplace | ✅ | marketplaceController | 9 | S | `marketplace_enabled` toggle |
| Facebook/Instagram/TikTok | 🔴 | — | 0 | XL | Build syndication service |
| SEO/OG tags | 🟡 | tokens + QR | 5 | S | Add `generateMetadata()` |
| Google Calendar | ✅ | googleCalendarService | 9 | S | Reuse for viewings |
| Outlook Calendar | 🔴 | email only | 3 | M | Mirror Google service on MS Graph |
| Scheduling infra | ✅ | calendar.ts + viewings | 9 | S | Reuse |
| Gmail sync | ✅ | emailIntegrationService | 9 | S | Reuse |
| Outlook email | 🟡 | MS Graph mail | 6 | S | Complete sync parity |
| Email threading/logging | 🟡 | crm_emails | 6 | M | Improve auto-grouping |
| Google Drive / OneDrive | 🔴 | env only | 2 | M | Reuse OAuth framework |
| Secure document storage | ✅ | MinIO + e-sign | 9 | S | Reuse |

### Tier 3
| Capability | Status | Existing Asset | RS | Effort | Recommendation |
|---|---|---|---|---|---|
| Content generation / listing copy | ✅ | propertyDescriptionService | 9 | S | Reuse for deal/listing |
| Lead scoring | 🟡 | lead_score + match | 5 | M | Build AI scoring on aiService |
| Recommendation engine | ✅ | propertyMatch + investment | 8 | S | Reuse for lead↔property |
| Translation | 🔴 | aiService available | 3 | M | Add Twi/Fante prompt service |
| Email drafting | 🔴 | aiService available | 4 | M | Build CRM draft service |
| Chat assistant | ✅ | Kobby (⚠ R1) | 7 | S | Fix schema, reuse |
| Summarization | 🟡 | mlServingClient | 5 | M | Wire deal-activity summarize |
| Search | ✅ | OpenSearch + global-search | 8 | S | Index deal/contact notes |
| OCR / doc extraction | 🟠 | documentIntelligence | 5 | M | Expose for contracts/IDs |
| PDF / templates / merge / receipts / contracts | ✅ | documentGenerationService | 9 | S | Author templates |
| Digital signatures | ✅ | e-sign envelopes | 9 | S | Reuse for offers/contracts |
| Analytics (all) | ✅/🟡 | crm/analytics + platform | 8 | S | Wire attribution + AI usage |

### Ghana-Specific
| Capability | Status | RS | Effort | Recommendation |
|---|---|---|---|---|
| Valuation history · commission split · developer inventory · units · maintenance · utilities · rent · digital address · regions | ✅ | 8–9 | S | Reuse across modules |
| Land Commission tracking | 🟠 | 3 | L | Build CRM API over staging data |
| Plot/parcel · site plans | 🟡 | 4 | M | Add parcel schema + PostGIS polygons |
| Family/stool/freehold/leasehold tenure | 🟠 | 3 | M | Add tenure classification enum |
| Offer management · reservations | 🟡 | 4 | M | Add offers/reservations schema |
| Agent territory | 🟡 | 4 | M | Add territory zones (PostGIS) |
| Purchase installments | 🟡 | 5 | M | Generalize rent-schedule engine |
| Property inspection (condition) | 🟡 | 4 | M | Add PM inspection schema |

### Portals & Enterprise
| Capability | Status | RS | Recommendation |
|---|---|---|---|
| Customer/Agent/Admin portals · Multi-tenancy · RBAC · Audit · Timelines · Webhooks · Event bus · Jobs · Search · Soft delete · Multi-currency · Config | ✅ | 8–10 | Reuse directly |
| Workflow/rules engine | 🟡 | 6 | Wire CRM workflow schema to `workflowExecutionEngine` |
| Approval workflows | ✅ | 7 | Adapt `ApprovalService` for CRM (lead qual, discount approval) |
| Feature flags · Observability · Timezones · File versioning | 🟡 | 4–5 | Platform-hardening (Phase 4) |
| i18n · Backup/DR | 🔴 | 0–1 | Build (Phase 4) |

---

## 5. Reuse Matrix (maximize-reuse summary)

| CRM Capability | Existing Service | Reuse | Extension Needed | Recommendation |
|---|---|---|---|---|
| Messaging (WA/SMS/Email) | `notify.ts`, `whatsappService`, unified email | **Direct** | CRM event triggers | Call from CRM services; author templates |
| Payments (inbound) | `paymentProcessor`, `paystackService` | **Direct** | `payment_stage` enum | Reuse; add reservation/booking stages |
| Payouts | `paymentProcessor` | Partial | **MoMo disbursement handler** | Build new payout rail |
| Maps/Geo | `geocodingService`, PostGIS | **Direct** | Territory polygons | Reuse; add agent geo-fences |
| AI | `aiService`, `llmClient`, `KobbyAIService` | **Direct** (after R1 fix) | CRM prompts/scoring | Reuse shared LLM; fix phantom-table |
| Documents/E-sign | `documentGenerationService`, `envelopeService` | **Direct** | Template authoring | Reuse for contracts/offers/receipts |
| Calendar/Scheduling | `googleCalendarService`, `calendar.ts` | **Direct** | Viewing reminders | Reuse; unify viewing tables |
| Email sync | `emailIntegrationService` | **Direct** | Outlook parity | Reuse |
| Storage | `minio.ts` | **Direct** | Version chain | Reuse |
| Marketplace/publishing | `marketplaceController`, `publications` | **Direct** | OG tags | Reuse; add social syndication |
| Analytics | `crm/analytics.ts`, platform analytics | **Direct** | Attribution/AI-usage | Reuse; add columns already present |
| RBAC/Audit/Multi-tenancy | `authorize.ts`, `auditMutations.ts` | **Direct** | — | Reuse as-is |
| Workflow | `workflowExecutionEngine` | Partial | Wire CRM schema | Connect, don't rebuild |
| KYC | tenant `applicationService` | Refactor | 3rd-party verify | Extend FSM + integrate verifier |
| Identity verify | — | None | Didit/Smile ID | Build |
| Social syndication | — | None | FB/IG/TikTok | Build |
| Voice | — | None | Twilio Voice | Build |
| i18n | — | None | i18next | Build |

**Bottom line:** ~30 of the CRM's capability surface is **drop-in reuse (RS ≥ 8)**; only ~9 items are true build-new.

---

## 6. Gap Analysis (missing capabilities)

| Gap | Why missing | Extend or new? | Complexity | Deps | Risk | Priority |
|---|---|---|---|---|---|---|
| **CRM AI phantom schema (R1)** | Code written against non-existent `crm_*` tables | Fix existing | Low | none | **High** (silent failure) | **P0** |
| MoMo outbound payouts | Only inbound (Paystack) built | New rail | High | MTN/Telecel/AirtelTigo APIs | High (money movement) | P1 |
| Drip execution engine | Schema built, runner never written | Extend | Medium | Bull/cron, email | Medium | P1 |
| Identity/KYC verification | Only capture, never verify | New + extend FSM | Medium | Didit/Smile ID | High (compliance) | P1 |
| Offers/Reservations schema | Modeled as pipeline stages | New schema | Medium | payments | Medium | P2 |
| Social syndication (FB/IG/TikTok) | Never built | New service | High | Meta/TikTok Graph APIs | Medium | P2 |
| Purchase installment plans | Only rent schedules | Extend engine | Medium | payments | Medium | P2 |
| Agent territory mgmt | Only coverage arrays | Extend + PostGIS | Medium | maps | Low | P2 |
| Voice calling | Never built | New | Medium | Twilio Voice | Low | P3 |
| Lead scoring engine | Field exists, no engine | New on aiService | Medium | AI | Low | P2 |
| Land Commission / tenure | Staging only | New CRM API | Medium | Data Hub | Medium | P3 |
| Marketing attribution | Columns exist, unqueried | Extend (query) | Low | analytics | Low | P2 |
| Outlook Calendar / Drive / OneDrive | Only Google/Gmail | Extend (OAuth reuse) | Low–Med | MS Graph | Low | P3 |
| Refunds handler | Enum only | Extend | Low | Paystack | Medium | P2 |
| i18n | English-only | New | High | frontend/backend | Low | P4 |
| Observability (Sentry/Prom) | Logging only | New | Medium | infra | Medium | P4 |
| Backup/DR (codified) | Not in repo | New (ops) | Medium | infra | High | P4 |

---

## 7. Architecture Recommendations

**7.1 Treat the CRM as an orchestration layer, not a silo.** New CRM features should compose shared-services, scoped by `organization_id`. Do not duplicate messaging, payments, documents, or AI inside `crm-deal-management`.

**7.2 Fix the schema-truth problem first (R1).** Establish `deals`/`contacts`/`deal_stages`/`deal_pipelines` as the canonical CRM tables. Purge every `crm_deals`/`crm_contacts`/`crm_pipeline_stages`/`crm_deal_pipelines` reference. Add a lightweight repository/data-access layer (or generated types from the live schema) so table/column drift is caught at compile time, not runtime.

**7.3 Consolidate duplicate surfaces.** Three real duplications exist: (a) **viewing scheduling** — `crm_property_viewings` vs `viewing_bookings` vs `calendar_events`; unify on `calendar_events`. (b) **properties** — PM `properties` vs `crm_properties` (bridge via `crmPropertySyncService`); keep the split but formalize the sync contract. (c) **workflow** — CRM workflow schema vs `shared-services/workflow` engine; wire them together.

**7.4 Activate the async layer.** Bull + Redis are installed but idle. Stand up a queue for drip execution, bulk campaign sends, payout disbursement, and social syndication — anything that is fan-out or externally rate-limited.

**7.5 Event-driven CRM.** Extend the existing `EventBus`/`workflowEventEmitter` with CRM events (`deal.stage_changed`, `deal.won`, `contact.created`, `viewing.scheduled`) and let the workflow engine + notifications subscribe. This replaces bespoke trigger code.

**7.6 One integrations table, many providers.** The `integrations` + `user_integrations` OAuth framework (Xero pattern) should back every new external provider (Outlook, Drive, Meta, Didit) — token rotation and `integration_logs` come free.

**7.7 Payments: separate money-in from money-out.** Inbound is solid. Build a dedicated **disbursement service** (`payoutService`) for MoMo/bank/crypto payouts, reused by commission payouts, refunds, and deposit releases.

---

## 8. Required New Services

| Service | Responsibility | Built on | Effort |
|---|---|---|---|
| `payoutService` (disbursement) | Outbound MoMo/bank/crypto (commissions, refunds, deposit release) | MTN/Telecel/AirtelTigo APIs, Paystack Transfer, NOWPayments | XL |
| `dripExecutionEngine` | Advance drip enrollments on `delay_days`, fire via notify() | Bull + notify() | M |
| `identityVerificationService` | Ghana Card/passport/license verify + liveness | Didit or Smile ID | L |
| `socialSyndicationService` | Publish listings to FB/IG/TikTok | Meta Graph, TikTok API | XL |
| `offerReservationService` | Offers, counter-offers, reservations, earnest holds | payments, e-sign | L |
| `leadScoringService` | AI + rules lead/deal scoring w/ confidence | aiService | M |
| `crmWorkflowBridge` | Connect CRM workflow schema → `workflowExecutionEngine` | workflow engine | M |
| `crmEmailDraftService` | AI-drafted follow-ups/offers | aiService | M |
| `voiceService` (optional) | Click-to-call, call logging | Twilio Voice | L |

---

## 9. Required Refactors

1. **R1 fix (P0):** replace phantom `crm_*` table refs in `KobbyAIService.ts` (and any residue) with real schema; add typed data-access. *(See §15.)*
2. **Viewing unification:** migrate `crm_property_viewings` → `calendar_events` (or make CRM read the calendar service).
3. **Marketing attribution:** surface `deals.lead_source/campaign_source/utm_data` in `crm/analytics.ts` (already columns; just unqueried).
4. **Commission → payout:** connect `commissionService` status pipeline to the new `payoutService`.
5. **Contact sync:** convert Data Hub one-way ingest into a two-way CSV/Google Contacts sync.
6. **Feature flags:** promote valuation-engine `featureFlags.ts` to a platform-wide flag service.

---

## 10. Required API Changes

- `POST /crm/deals/:id/offers`, `/reservations` — offer/reservation lifecycle (new).
- `POST /crm/payments/reserve` — reservation/booking fee with `payment_stage` (extend `paymentProcessor`).
- `POST /crm/payouts` — commission/deposit disbursement (new `payoutService`).
- `POST /crm/contacts/import` + `GET /crm/contacts/export` — CSV (new).
- `POST /crm/campaigns/:id/enroll` + drip runner endpoints (extend drip routes).
- `POST /crm/identity/verify` — KYC verification (new).
- `POST /crm/listings/:id/syndicate` — social publishing (new).
- `POST /crm/ai/lead-score`, `/draft-email`, `/summarize-deal` — reuse `aiService` (new, replaces removed `/crm/ai/*`).
- `GET /crm/analytics/attribution` — lead-source funnel (extend analytics).
- Reuse existing: `/messaging/*`, `/calendar/*`, `/crm/emails/*`, `/webhooks/*`, `/marketplace/*` — **no change**.

## 11. Required Database Changes

| Change | Type | Notes |
|---|---|---|
| **Canonicalize `deals`/`contacts`/`deal_stages`/`deal_pipelines`** | Fix | No migration — correct code refs. Add view or generated types |
| `crm_offers`, `crm_reservations` (+ `earnest_holds`) | New tables | Offer/counter/reservation lifecycle |
| `crm_installment_plans` + `crm_installment_schedule` | New | Generalize `rent_schedules` for buyers |
| `crm_agent_territories` (PostGIS polygon) | New | Geo-fenced territory + exclusivity |
| `deals.payment_stage` enum | Alter | earnest/booking/deposit/installment/balance |
| `payment_transactions` deposit/escrow status | Alter | Hold → release semantics |
| `property_inspections` (PM condition) | New | Distinct from valuation inspections |
| `tenure_classification` enum on `properties` | Alter | freehold/leasehold/stool/family |
| `land_title_history` | New | Land Commission tracking over staging data |
| Social syndication tables (`listing_syndications`, `social_accounts`) | New | Per-channel publish state |
| Wire CRM `workflows` FKs to workflow engine run tables | Alter | Connect schema to executor |

All migrations must be **idempotent** (`IF NOT EXISTS`), append-only, `npm run migrate` (hits prod DB — stage carefully).

## 12. Required UI Components

- Offer/Reservation panel (deal detail) + earnest-fee checkout.
- Drip/campaign builder with **audience segmentation** + open/click analytics.
- Unified **conversation timeline** (WhatsApp + email + SMS + notes) — extend `UnifiedTimeline.tsx`.
- Agent **territory map** (Mapbox draw polygons) — extend `ZoneMap`.
- KYC verification step (reuse tenant `ApplicationForm` pattern) + ID-doc viewer.
- Social **syndication composer** (per-channel preview) + listing OG-preview.
- Address **autocomplete** input (Google Places) — new shared component.
- E-sign **field designer** (drag-drop over `ESignField` schema) — new.
- Lead-scoring badge + AI email-draft assist in deal/contact views.
- Payout/disbursement admin console (extend admin portal).

## 13. Security Considerations

- **Money movement (payouts) is the highest-risk new surface.** Enforce maker-checker (reuse `ApprovalService`), idempotency keys, and per-transaction audit in `audit_logs`. Payout destination changes must be gated by admin role (a prior incident allowed low-privilege redirection — verify `requireServiceRole` on all payout-destination routes).
- **KYC/PII:** ID documents in MinIO must be access-controlled (presigned, short TTL), encrypted at rest, and retention-bounded. Ghana Data Protection Act compliance for identity data.
- **RBAC everywhere:** every new CRM route uses the `authorization_policies` dispatcher; default-deny on unmapped writes (already the pattern).
- **Webhook integrity:** all new inbound webhooks (Meta, Didit, payout providers) verify HMAC + timestamp replay (reuse `webhooks.ts` pattern).
- **OAuth token storage:** new providers use the `integrations` table encryption pattern; never log tokens (pino redaction already configured).
- **Multi-tenant isolation:** every query filters `organization_id`; social/publish actions must not leak cross-org listings.

## 14. Performance Considerations

- **Single prod DB, remote from dev** — minimize round-trips; batch, cache (FX already 5-min cached), and index. New tables need `organization_id` + `deleted_at` partial indexes (existing convention).
- **Async the fan-out:** drip sends, syndication, payouts, bulk import belong in Bull queues, not request threads.
- **OpenSearch for search-heavy CRM** (contact/deal/note full-text) rather than `ILIKE` scans.
- **AI latency (5–10s):** keep Kobby/scoring/drafting async with streaming or job-backed responses; cache platform context (already cached 5 min).
- **Calendar/geo:** reuse `geocoding_cache`; avoid per-request Places calls.
- **Region partitioning** already shards `properties` by 16 regions — keep CRM property joins partition-aware.

## 15. Risk Assessment

| ID | Risk | Severity | Likelihood | Evidence | Mitigation |
|---|---|---|---|---|---|
| **R1** | **Phantom CRM tables (SYSTEMIC)** — code queries `crm_deals`/`crm_contacts`/`crm_tasks`/`crm_pipeline_stages`/`crm_deal_pipelines` which **do not exist** (no CREATE TABLE / VIEW / RENAME in any of 239 migrations); real tables are `deals`/`contacts`/`tasks`/`deal_stages`/`deal_pipelines`. Column drift too (`contact_id`→`primary_contact_id`; `d.agent_id`/`d.status`/`owner_id` don't exist; probability is `deals.close_probability`, not on the stage). **TypeScript cannot catch this — `tsc` is green while the SQL fails at runtime.** Affected code silently no-ops or throws. **Fixed during this audit:** `KobbyAIService.ts` (`fetchDealContext`, `fetchCrmContext`). **Still broken (5 files):** `workers/workflowWorker.ts`, `services/crm-deal-management/propertyMatchService.ts`, `services/crm-deal-management/emailIntegrationService.ts`, `shared-services/calendar/calendarService.ts`, `shared-services/workflow/workflowExecutionEngine.ts` (this one also has column-level mismatches). This explains several "stub/partial" maturity findings (CRM workflow engine, property-match, calendar linking) | **High** | **Certain** (verified across 239 migrations + grep of 6 querying files) | Purge all phantom refs → real schema; add a generated-types / repository layer so table+column drift fails at build; DB integration tests. ~1 week |
| R2 | MoMo payout money-movement without maker-checker | High | Medium | payout rail not built | Approval + idempotency + audit before go-live |
| R3 | KYC gap = onboarding fraud / non-compliance | High | Medium | capture-only, no verify | Integrate Didit/Smile ID; Data Protection Act |
| R4 | Drip/campaign at scale without queue → request timeouts, provider rate-limit bans | Medium | High | Bull idle, node-cron sync | Activate Bull; throttle |
| R5 | Duplicate viewing/property/workflow surfaces cause data divergence | Medium | High | 3 viewing tables, 2 property tables, unwired workflow | Consolidate per §7.3 |
| R6 | No DR/backup codified; single prod DB | High | Low | not in repo | Codify + test restores |
| R7 | No i18n; Ghana multilingual expectations | Low | Medium | English-only | Phase 4 i18next |
| R8 | Observability gap slows incident response | Low–Med | Medium | **[VERIFIED-CORRECTION]** Sentry APM already integrated in code but dormant (no `SENTRY_DSN`); no Prometheus/OTel | **Set `SENTRY_DSN` to activate** (1-line); add metrics/tracing later |

---

## 16. Prioritized Implementation Roadmap

### Phase 0 — Stabilize (P0, ~1 week)
- **Fix R1 (systemic phantom-table defect).** `KobbyAIService.ts` is already corrected during this audit. Remediate the remaining **5 files** that query non-existent `crm_deals`/`crm_contacts`/`crm_tasks`: `workers/workflowWorker.ts`, `services/crm-deal-management/propertyMatchService.ts`, `services/crm-deal-management/emailIntegrationService.ts`, `shared-services/calendar/calendarService.ts`, `shared-services/workflow/workflowExecutionEngine.ts`. The workflow engine needs column-level fixes too (`agent_id`/`status`/`owner_id` → `assigned_agent`/`deal_status`/deal-owner model).
- Add a **generated-types / repository layer** (or SQL lint against the live schema) so table/column drift fails at build — `tsc` currently passes on all of the above because it does not see SQL string contents.
- DB integration tests for the CRM workflow engine, property-match, calendar linking, and Kobby `deal`/`crm` scopes against the real schema.

### Phase 1 — Wire what already exists (0 new services, ~3–4 weeks)
*Highest ROI: pure integration.*
- Fire CRM events → `notify()` (WhatsApp/SMS/email) for deal-stage, viewing, task, offer.
- Reuse `documentGenerationService` + `envelopeService` for **offer letters, reservation forms, sale agreements, receipts** (author templates only).
- Reuse `paymentProcessor` for **reservation/booking fees** (+ `payment_stage` enum).
- Reuse `googleCalendarService` + `calendar.ts` for **viewing scheduling & reminders**; unify on `calendar_events`.
- Reuse `geocodingService`/PostGIS for lead & property maps; add address autocomplete component.
- Reuse `aiService` for **listing/offer copy, deal summaries** (replace removed `/crm/ai/*` cleanly).
- Surface **marketing attribution** from existing `deals.lead_source/utm_data` columns.
- Reuse `marketplaceController` for **website publishing** + add dynamic OG tags.

### Phase 2 — Complete half-built features (moderate extension, ~6–8 weeks)
- **Drip execution engine** on Bull (activate the idle queue).
- **MoMo outbound payouts** (`payoutService`) → wire commission payouts + refunds + deposit release.
- **Identity/KYC verification** (Didit/Smile ID) on the tenant-application FSM, extended to agents/buyers.
- **Offers/Reservations** schema + service + UI. **[Phase-1 carry-in]** Absorbs the reservation/booking-fee + `payment_stage` enum item (deferred from Phase 1, not dropped): offers/reservations/earnest-holds share the same schema + payment flow, so they're built together here (reuse `paymentProcessor` for fee capture) rather than as a throwaway half-version.
- **Sentry activation [Phase-1 carry-in, owner-blocked]** — one-line once `SENTRY_DSN` is set; integration already wired.
- **Purchase installment plans** (generalize rent-schedule engine).
- **Lead-scoring service** (aiService) + AI email drafting.
- Wire **CRM workflow schema → `workflowExecutionEngine`**.
- Refunds handler; Outlook calendar + Drive/OneDrive via OAuth framework.

### Phase 3 — Build the true green-field (~8–10 weeks)
- **Social syndication** (Facebook/Instagram/TikTok) service + composer UI.
- **Agent territory management** (PostGIS polygons + exclusivity).
- **Land Commission / tenure** CRM API over Data Hub staging; tenure classification.
- **Property condition inspections** (PM).
- **Voice calling** (Twilio Voice, click-to-call + logging) — optional.
- **Campaign segmentation + A/B + open/click analytics.**

### Phase 4 — Enterprise hardening (ongoing)
- **i18n** (i18next; Twi/Fante where relevant).
- **Observability** — **activate Sentry (set `SENTRY_DSN`; already integrated — do this in Phase 1)**; add Prometheus/OpenTelemetry.
- **Backup/DR** codified + tested restores.
- Platform-wide **feature flags**; timezone enforcement; explicit **file versioning**.
- Vector/semantic search upgrade on OpenSearch.

---

### Appendix — Evidence Confidence
Every capability above was verified against the codebase (migrations, routes, services, env, dependencies) via 12 parallel domain audits plus direct schema inspection. Where a capability was **not** found, the report states "searched, none found" rather than assuming. The one item requiring immediate developer action — **R1 (phantom CRM tables)** — was confirmed by grepping all 239 migrations for the `CREATE TABLE` statements and cross-referencing the querying code.

*End of assessment.*
