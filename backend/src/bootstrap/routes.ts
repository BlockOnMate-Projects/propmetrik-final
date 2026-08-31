import valuationClientsRouter from '../routes/valuation-clients';
import healthRoutes from '../routes/health';
import dataHubRoutes from '../routes/dataHub';
import engineProxyRoutes from '../routes/engineProxy';
import valuationRoutes from '../routes/valuations';
import propertyRoutes from '../routes/publicProperties';
import { ingestionRouter } from '../routes/ingestion';
import pullIntegrationRoutes from '../routes/pullIntegrations';
import reportRoutes from '../routes/reports';
import valuersRoutes from '../routes/valuers';
import propertyManagementRoutes, { propertyManagementPublicRouter } from '../routes/propertyManagement';
import pmInspectionRoutes from '../routes/pm-inspections';
import crmRoutes from '../routes/crm';
import marketplaceRoutes from '../routes/marketplace';
import webhooksRoutes from '../routes/webhooks';
import trackingRoutes from '../routes/tracking';
import authIntegrationsRoutes from '../routes/auth-integrations';
import authRoutes from '../routes/auth';
import messagingRoutes from '../routes/messaging';
import projectRoutes from '../routes/projects';
import workflowRoutes from '../routes/workflows';
import realtimeRoutes from '../routes/realtime';
import calendarRoutes from '../routes/calendar';
import analyticsRoutes from '../routes/analytics';
import mlAnalyticsRoutes from '../routes/mlAnalytics';
import analyticsFoundationRoutes from '../routes/analyticsFoundation';
import valuationAnalyticsRoutes from '../routes/valuationAnalytics';
import marketIntelligenceRoutes from '../routes/marketIntelligence';
import managementMetricsRoutes from '../routes/managementMetrics';
import tickerRoutes from '../routes/ticker';
import budgetRoutes from '../routes/budget';
import teamRoutes from '../routes/team';
import vendorRoutes from '../routes/vendors';
import integrationsRoutes from '../routes/integrations';
import constructionRoutes from '../routes/construction';
import rfiRoutes from '../routes/rfis';
import changeOrderRoutes from '../routes/changeOrders';
import submittalRoutes from '../routes/submittals';
import portfolioRoutes from '../routes/portfolio';
import whatsappRoutes from '../routes/whatsapp';
import photoRoutes from '../routes/photos';
import checklistRoutes from '../routes/checklists';
import procurementRoutes from '../routes/procurement';
import siteDiaryRoutes from '../routes/siteDiaries';
import governanceRoutes from '../routes/governance';
import docsRoutes from '../routes/docs';
import litigationRoutes from '../routes/litigation';
import shortStayRoutes from '../routes/shortStay';
import ricsComplianceRoutes from '../routes/ricsCompliance';
import floodRiskRoutes from '../routes/floodRisk';
import adminRoutes from '../routes/admin';
import tenantPortalRoutes from '../routes/tenantPortal';
import eSignRoutes from '../routes/eSign';
import valuationOrgRoutes from '../routes/valuation-org';
import valuationInvoiceRoutes from '../routes/valuation-invoices';
import enterpriseRoutes from '../routes/enterprise';
import brandingRoutes, { brandingPublicRouter } from '../routes/branding';
import organizationVerificationRoutes from '../routes/organizationVerification';
import identityVerificationRoutes from '../routes/identityVerification';
import listingMandateRoutes from '../routes/listingMandate';
import developerPortalRoutes from '../routes/developerPortal';
import subscriptionRoutes from '../routes/subscription';
import commercializationRoutes from '../routes/commercialization';
import userProfileRoutes from '../routes/user-profile';
import publicationsRoutes from '../routes/publications';
import chartsRoutes from '../routes/charts';
import autopilotRoutes from '../routes/autopilot';
import workspaceRoutes from '../routes/workspace';
import kobbyAIRoutes from '../routes/kobbyAI';
import issueRoutes from '../routes/issues';
import drawingRoutes from '../routes/drawings';
import meetingRoutes from '../routes/meetings';
import exportRoutes from '../routes/exports';
import pmReportRoutes from '../routes/pm-reports';
import safetyRoutes from '../routes/safety';
import timesheetRoutes from '../routes/timesheets';
import equipmentRoutes from '../routes/equipment';
import biddingRoutes from '../routes/bidding';
import bidManagementRoutes, { vendorRouter as bidVendorRouter } from '../routes/bid-management';
import closeoutRoutes from '../routes/closeout';
import auditLogRoutes from '../routes/audit-log';
import customFieldRoutes from '../routes/custom-fields';
import appIntegrationRoutes from '../routes/app-integrations';
import orgIntegrationsRoutes, { integrationsPublicRouter } from '../routes/orgIntegrations';
import xeroRoutes, { xeroPublicRouter } from '../routes/xero';
import transmittalRoutes from '../routes/transmittals';
import invitationRoutes from '../routes/invitations';
import rbacRoutes from '../routes/rbac';
import serviceTeamRoutes from '../routes/serviceTeam';
import { notificationRoutes } from '../../shared-services/notifications/in-mail';
import { Application } from 'express';
import { authenticate, optionalAuth, requireAdmin } from '../middleware/auth';
import { requirePMAccess } from '../middleware/pmAuth';
import { requireServiceAccess, requireAnyServiceAccess } from '../middleware/serviceAccess';
import { apiAccess } from '../middleware/analyticsApiAccess';
import { requireIngestionAuth } from '../middleware/ingestionAuth';
import {
  registerPublicPmInvoiceRoutes,
  registerGuideAssetsRoute,
  registerTransmittalPublicRoutes,
} from './publicRoutes';

export function registerRoutes(app: Application): void {
app.use('/health', healthRoutes);
// Secret-gated bridge: frontend server → Python valuation engine (different machines).
// Outside /api so no auth catch-all applies; the route itself enforces X-Engine-Secret.
app.use('/engine', engineProxyRoutes);
app.use('/api/docs', docsRoutes);  // OpenAPI documentation (PM + CRM)
app.use('/api/v1/data-hub', authenticate, requireServiceAccess('data_hub'), dataHubRoutes);
app.use('/api/v1/valuations', authenticate, requireServiceAccess('valuations'), valuationRoutes);
app.use('/api/valuations', authenticate, requireServiceAccess('valuations'), valuationRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/properties', propertyRoutes);
app.use('/api/public/properties', propertyRoutes);  // Also mount at public path for frontend compatibility
app.use('/api/v1/ingestion', requireIngestionAuth, ingestionRouter);
// NOTE: property contributions go through /api/data-hub/contributions (dataHub.ts).
// The legacy /api/v1/contributions pipeline (contributionWorkflowService) was retired
// 2026-07-12 — its property insert omitted `region` on the partitioned table.
app.use('/api/v1/pull-integrations', requireIngestionAuth, pullIntegrationRoutes);
app.use('/api/pull-integrations', requireIngestionAuth, pullIntegrationRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/reports', reportRoutes);
app.use('/api/reports', reportRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/valuers', authenticate, requireServiceAccess('valuations'), valuersRoutes);
app.use('/api/valuers', authenticate, requireServiceAccess('valuations'), valuersRoutes);  // Also mount for frontend compatibility
// Public, token-scoped tenant-application endpoints — MUST be mounted BEFORE the authed
// `/api/v1/pm` router so prospective tenants (no account) can validate links, apply, upload
// docs, and check status without auth. Otherwise they 401 in prod (dev masks it via bypass).
app.use('/api/v1/pm', propertyManagementPublicRouter);
app.use('/api/v1/pm', authenticate, requireServiceAccess('property_management'), propertyManagementRoutes);
app.use('/api/v1/pm', authenticate, requireServiceAccess('property_management'), pmInspectionRoutes);
app.use('/api/pm', authenticate, requireServiceAccess('property_management'), pmInspectionRoutes);  // frontend compat
app.use('/api/v1/crm', authenticate, requireServiceAccess('crm'), crmRoutes);
app.use('/api/crm', authenticate, requireServiceAccess('crm'), crmRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/marketplace', marketplaceRoutes);  // Public marketplace - no auth required
app.use('/api/track', trackingRoutes);   // Public email open/click tracking - no auth (hit by email clients)

  registerPublicPmInvoiceRoutes(app);
  registerGuideAssetsRoute(app);
app.use('/api/v1/webhooks', webhooksRoutes);
app.use('/api/v1/auth', authRoutes);  // User authentication routes
app.use('/api/v1/auth', authIntegrationsRoutes);  // OAuth integrations
app.use('/api/v1/messaging', authenticate, messagingRoutes);
app.use('/api/messaging', authenticate, messagingRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/projects', authenticate, requirePMAccess, requireServiceAccess('projects'), projectRoutes);
app.use('/api/projects', authenticate, requirePMAccess, requireServiceAccess('projects'), projectRoutes);  // Also mount for frontend compatibility
// The workflow engine is shared by Projects AND CRM — allow a customer subscribed
// to either. (Was projects-only, which 403'd CRM-only orgs on /dashboard/deals/workflows.)
app.use('/api/v1/workflows', authenticate, requireAnyServiceAccess(['projects', 'crm']), workflowRoutes);
app.use('/api/workflows', authenticate, requireAnyServiceAccess(['projects', 'crm']), workflowRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/realtime', authenticate, requirePMAccess, requireServiceAccess('projects'), realtimeRoutes);
app.use('/api/realtime', authenticate, requirePMAccess, requireServiceAccess('projects'), realtimeRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/calendar', authenticate, requirePMAccess, requireServiceAccess('projects'), calendarRoutes);
app.use('/api/calendar', authenticate, requirePMAccess, requireServiceAccess('projects'), calendarRoutes);  // Also mount for frontend compatibility
// Analytics API — dual auth: subscriber `pmk_` API keys OR internal Keycloak
// session. `apiAccess(serviceKey)` handles both (see middleware/analyticsApiAccess).
app.use('/api/v1/analytics', apiAccess('analytics'), analyticsRoutes);
app.use('/api/analytics', apiAccess('analytics'), analyticsRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/analytics/ml', apiAccess('analytics'), mlAnalyticsRoutes);  // ML Analytics (Sections 1-4, 8.1-8.7)
app.use('/api/analytics/ml', apiAccess('analytics'), mlAnalyticsRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/analytics/platform', apiAccess('analytics'), analyticsFoundationRoutes);  // Phase 1 Foundation (CCI, GHAI, Alerts)
app.use('/api/analytics/platform', apiAccess('analytics'), analyticsFoundationRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/analytics/valuations', apiAccess('analytics'), valuationAnalyticsRoutes);  // Phase 2 Valuation Analytics
app.use('/api/analytics/valuations', apiAccess('analytics'), valuationAnalyticsRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/analytics/market', apiAccess('market_intelligence'), marketIntelligenceRoutes);  // Phase 3 Market Intelligence
app.use('/api/analytics/market', apiAccess('market_intelligence'), marketIntelligenceRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/analytics/management', apiAccess('analytics'), managementMetricsRoutes);  // Property Management Metrics
app.use('/api/analytics/management', apiAccess('analytics'), managementMetricsRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/ticker', optionalAuth, tickerRoutes);
app.use('/api/ticker', optionalAuth, tickerRoutes);
app.use('/api/v1/budget', authenticate, requirePMAccess, requireServiceAccess('budget'), budgetRoutes);
app.use('/api/budget', authenticate, requirePMAccess, requireServiceAccess('budget'), budgetRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/team', authenticate, requirePMAccess, requireServiceAccess('projects'), teamRoutes);
app.use('/api/team', authenticate, requirePMAccess, requireServiceAccess('projects'), teamRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/vendors', authenticate, requirePMAccess, requireServiceAccess('projects'), vendorRoutes);
app.use('/api/vendors', authenticate, requirePMAccess, requireServiceAccess('projects'), vendorRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/integrations', authenticate, requireAdmin, integrationsRoutes);
app.use('/api/integrations', authenticate, requireAdmin, integrationsRoutes);  // Also mount for frontend compatibility

// Valuation Invoice Routes — mounted BEFORE catch-all /api/v1 auth routes so public endpoints work
app.use('/api/v1/valuation-invoices', valuationInvoiceRoutes);
app.use('/api/valuation-invoices', valuationInvoiceRoutes);  // Also mount for frontend compatibility

// ── Shared / Universal services ──────────────────────────────────────────────
// These MUST be mounted BEFORE any catch-all /api/v1 routers (construction,
// governance, issues, drawings, etc.) whose middleware would otherwise block
// requests from users without the relevant service subscription.
app.use('/api/v1/notifications', authenticate, notificationRoutes);
app.use('/api/notifications', authenticate, notificationRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/admin', authenticate, requireAdmin, adminRoutes);
app.use('/api/admin', authenticate, requireAdmin, adminRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/user', authenticate, userProfileRoutes);
app.use('/api/user', authenticate, userProfileRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/rbac', authenticate, rbacRoutes);
app.use('/api/rbac', authenticate, rbacRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/service-team', authenticate, serviceTeamRoutes);
app.use('/api/service-team', authenticate, serviceTeamRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/workspace', authenticate, workspaceRoutes);
app.use('/api/workspace', authenticate, workspaceRoutes);  // Also mount for frontend compatibility

// Subscription & Billing Routes (plans, subscriptions, invoices, usage).
// MUST be mounted BEFORE the broad `app.use('/api', authenticate, ...)` catch-alls below:
// the public pricing page hits GET /subscriptions/plans (optionalAuth) with no token, and the
// broad authenticate would otherwise 401 it in production (dev is masked by the auth dev-bypass).
// Per-route middleware inside subscriptionRoutes still protects the authenticated endpoints.
app.use('/api/v1/subscriptions', subscriptionRoutes);
app.use('/api/subscriptions', subscriptionRoutes);  // Also mount for frontend compatibility

// Short-Stay analytics API — MUST be mounted BEFORE the broad `/api/v1` authenticate
// catch-alls below, so API-key (pmk_) callers hit apiAccess('short_stay') first. When
// it was mounted after them, the broad authenticate 401'd the key before apiAccess ran
// (masked in dev by the auth bypass; a real 401 in production). Mirrors the analytics
// mounts, which are already above the catch-alls.
app.use('/api/v1/short-stay', apiAccess('short_stay'), shortStayRoutes);
app.use('/api/short-stay', apiAccess('short_stay'), shortStayRoutes);  // Also mount for frontend compatibility

// Tenant Portal — MUST be mounted BEFORE the broad `/api(/v1)` authenticate catch-alls below. Its
// public login routes (password-login, setup-password, otp, magic-link) carry NO bearer token, so
// the catch-all's `authenticate` otherwise 401s them in production ("No authentication token
// provided") — dev only "works" because AUTH_DEV_BYPASS injects a super-admin. Data routes
// self-protect via `requireTenantAuth`, so mounting early removes no protection.
app.use('/api/v1/tenant-portal', tenantPortalRoutes);
app.use('/api/tenant-portal', tenantPortalRoutes);  // frontend compat

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC / SELF-PROTECTING ROUTERS — MUST be mounted BEFORE the broad
// `app.use('/api(/v1)', authenticate, …)` catch-alls below. Those catch-alls run
// `authenticate` for EVERY `/api(/v1)/*` path that matches the prefix, so any
// anonymous / token / optionalAuth route mounted AFTER them 401s in production
// ("No authentication token provided") — dev only "works" because AUTH_DEV_BYPASS
// injects a super-admin. Each router here either takes no auth (public webhooks,
// OAuth callbacks, token email-links) or self-protects its privileged endpoints
// internally (optionalAuth / per-route authenticate), so mounting early removes no
// protection. Do NOT move these below the first `/api/v1` authenticate catch-all.
// ════════════════════════════════════════════════════════════════════════════

// WhatsApp Business webhook (Meta calls this with no Bearer token)
app.use('/api/v1/whatsapp', whatsappRoutes);
app.use('/api/whatsapp', whatsappRoutes);  // Also mount for frontend compatibility

// Public Vendor Bid Portal (token-based, no auth)
app.use('/api/v1', bidVendorRouter);
app.use('/api', bidVendorRouter);

// Shared Integrations Hub — public OAuth callback (providers redirect here without our Bearer token)
app.use('/api/v1/org-integrations', integrationsPublicRouter);
app.use('/api/org-integrations', integrationsPublicRouter);

// Xero OAuth2 — public callback (Xero redirects back without our Bearer token)
app.use('/api/v1', xeroPublicRouter);
app.use('/api', xeroPublicRouter);

// E-Sign — optionalAuth: external signer links are token-based (no Bearer); internal endpoints check req.user
app.use('/api/v1/esign', optionalAuth, eSignRoutes);
app.use('/api/esign', optionalAuth, eSignRoutes);  // Also mount for frontend compatibility

// Unified Invitations — public token endpoints + internally-authenticated management
app.use('/api/v1/invitations', invitationRoutes);
app.use('/api/invitations', invitationRoutes);  // Also mount for frontend compatibility

// Valuation Org — public invitation acceptance + internally-authenticated team management
app.use('/api/v1/valuation-org', valuationOrgRoutes);
app.use('/api/valuation-org', valuationOrgRoutes);  // Also mount for frontend compatibility

// Enterprise B2B — internally-authenticated (no app-level authenticate)
app.use('/api/v1/enterprise', enterpriseRoutes);
app.use('/api/enterprise', enterpriseRoutes);  // Also mount for frontend compatibility

// Per-service Company Branding — public logo serve (no auth: logos appear on client
// docs/emails) + self-protecting authed get/save/upload (router does its own authenticate).
app.use('/api/v1', brandingPublicRouter);
app.use('/api', brandingPublicRouter);
app.use('/api/v1/branding', brandingRoutes);
app.use('/api/branding', brandingRoutes);  // Also mount for frontend compatibility
// Organization verification (KYB) — org-facing; admin review lives under /admin
app.use('/api/v1/org-verification', authenticate, organizationVerificationRoutes);
app.use('/api/org-verification', authenticate, organizationVerificationRoutes);  // Also mount for frontend compatibility
// Identity verification (KYC) — user-facing; provider callback is /webhooks/didit (public)
app.use('/api/v1/identity', authenticate, identityVerificationRoutes);
app.use('/api/identity', authenticate, identityVerificationRoutes);  // Also mount for frontend compatibility
// Listing mandates (Gate C) — agent-facing; owner signs via the e-sign magic link
app.use('/api/v1/listing-mandate', authenticate, listingMandateRoutes);
app.use('/api/listing-mandate', authenticate, listingMandateRoutes);  // Also mount for frontend compatibility

  registerTransmittalPublicRoutes(app);
// ── Catch-all /api/v1 routers (construction, governance, etc.) ───────────────
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('construction'), constructionRoutes); // Construction Ops (Site Diaries, Petty Cash, Market Prices)
app.use('/api/v1/rfis', authenticate, requirePMAccess, requireServiceAccess('construction'), rfiRoutes);
app.use('/api/rfis', authenticate, requirePMAccess, requireServiceAccess('construction'), rfiRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/change-orders', authenticate, requirePMAccess, requireServiceAccess('construction'), changeOrderRoutes);
app.use('/api/change-orders', authenticate, requirePMAccess, requireServiceAccess('construction'), changeOrderRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/submittals', authenticate, requirePMAccess, requireServiceAccess('construction'), submittalRoutes);
app.use('/api/submittals', authenticate, requirePMAccess, requireServiceAccess('construction'), submittalRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/portfolio', authenticate, requirePMAccess, requireServiceAccess('portfolio'), portfolioRoutes);
app.use('/api/portfolio', authenticate, requirePMAccess, requireServiceAccess('portfolio'), portfolioRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/photos', authenticate, requirePMAccess, requireServiceAccess('construction'), photoRoutes);
app.use('/api/photos', authenticate, requirePMAccess, requireServiceAccess('construction'), photoRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/checklists', authenticate, requirePMAccess, requireServiceAccess('construction'), checklistRoutes);
app.use('/api/checklists', authenticate, requirePMAccess, requireServiceAccess('construction'), checklistRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/procurement', authenticate, requirePMAccess, requireServiceAccess('procurement'), procurementRoutes);
app.use('/api/procurement', authenticate, requirePMAccess, requireServiceAccess('procurement'), procurementRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/site-diaries', authenticate, requirePMAccess, requireServiceAccess('construction'), siteDiaryRoutes);
app.use('/api/site-diaries', authenticate, requirePMAccess, requireServiceAccess('construction'), siteDiaryRoutes);  // Also mount for frontend compatibility
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('projects'), governanceRoutes);  // Governance: milestone-frameworks, framework-phases, milestone-templates

// Critical Data Gap: Litigation Risk
app.use('/api/v1/litigation', authenticate, requireServiceAccess('litigation'), litigationRoutes);
app.use('/api/litigation', authenticate, requireServiceAccess('litigation'), litigationRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/rics-compliance', authenticate, requireServiceAccess('valuations'), ricsComplianceRoutes);
app.use('/api/rics-compliance', authenticate, requireServiceAccess('valuations'), ricsComplianceRoutes);  // Also mount for frontend compatibility
app.use('/api/v1/flood-risk', authenticate, requireServiceAccess('valuations'), floodRiskRoutes);
app.use('/api/flood-risk', authenticate, requireServiceAccess('valuations'), floodRiskRoutes);  // Also mount for frontend compatibility

// Issues & Risks Routes
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('projects'), issueRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('projects'), issueRoutes);  // frontend compat

// Drawing Management Routes
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('projects'), drawingRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('projects'), drawingRoutes);  // frontend compat

// Meeting Minutes Routes
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('projects'), meetingRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('projects'), meetingRoutes);  // frontend compat

// Data Export Routes
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('projects'), exportRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('projects'), exportRoutes);  // frontend compat

// PM PDF Report Routes
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('projects'), pmReportRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('projects'), pmReportRoutes);  // frontend compat

// Safety & Incident Management Routes
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('construction'), safetyRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('construction'), safetyRoutes);

// Time Tracking & Timesheets Routes
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('construction'), timesheetRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('construction'), timesheetRoutes);

// Equipment Tracking Routes
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('construction'), equipmentRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('construction'), equipmentRoutes);

// Bidding & Prequalification Routes
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('construction'), biddingRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('construction'), biddingRoutes);

// Bid Management Routes (authenticated)
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('construction'), bidManagementRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('construction'), bidManagementRoutes);

// (Public Vendor Bid Portal is mounted ABOVE, in the PUBLIC / SELF-PROTECTING block.)

// Closeout & Warranty Routes
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('construction'), closeoutRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('construction'), closeoutRoutes);

// Audit Log Routes (SOC 2)
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('projects'), auditLogRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('projects'), auditLogRoutes);

// Custom Fields Framework Routes
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('projects'), customFieldRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('projects'), customFieldRoutes);

// App Marketplace & Integration Framework Routes
app.use('/api/v1', authenticate, requirePMAccess, requireServiceAccess('projects'), appIntegrationRoutes);
app.use('/api', authenticate, requirePMAccess, requireServiceAccess('projects'), appIntegrationRoutes);

// Shared Integrations Hub (org-wide — reachable from every service's Integrations tab).
// Public OAuth callback is mounted ABOVE, in the PUBLIC / SELF-PROTECTING block.
// Authenticated catalog/connections/connect/disconnect (org-wide, NOT service-gated).
app.use('/api/v1/org-integrations', authenticate, requirePMAccess, orgIntegrationsRoutes);
app.use('/api/org-integrations', authenticate, requirePMAccess, orgIntegrationsRoutes);

// Xero OAuth2 + Cost Sync Routes
// Public callback is mounted ABOVE, in the PUBLIC / SELF-PROTECTING block.
// Protected Xero routes (auth + status + sync)
app.use('/api/v1', authenticate, requirePMAccess, xeroRoutes);
app.use('/api', authenticate, requirePMAccess, xeroRoutes);

// PM Transmittals Routes (document distribution & acknowledgement)
// Public token-based acknowledge/download endpoints are mounted ABOVE, in the
// PUBLIC / SELF-PROTECTING block. Authenticated transmittal routes:
app.use('/api/v1/transmittals', authenticate, requirePMAccess, requireServiceAccess('projects'), transmittalRoutes);
app.use('/api/transmittals', authenticate, requirePMAccess, requireServiceAccess('projects'), transmittalRoutes);

// Commercialization Routes (usage analytics, customer success, API catalog, onboarding)
app.use('/api/v1/admin/platform', authenticate, requireAdmin, commercializationRoutes);
app.use('/api/admin/platform', authenticate, requireAdmin, commercializationRoutes);

// (Tenant Portal routes are mounted ABOVE, before the broad auth catch-alls — see that block.)

// (E-Sign, Unified Invitations, Valuation-Org, and Enterprise B2B routes are all
// mounted ABOVE, in the PUBLIC / SELF-PROTECTING block, because each exposes public
// token/callback endpoints that the broad `/api/v1` authenticate catch-all would 401.)

// Developer Portal (subscriber /developers console: keys, usage, entitlements)
// Session-authenticated + org-scoped; requires an active analytics API product.
app.use('/api/v1/developers', authenticate, developerPortalRoutes);
app.use('/api/developers', authenticate, developerPortalRoutes);  // Also mount for frontend compatibility


// Valuation Clients Routes
app.use('/api/v1/valuation-clients', authenticate, valuationClientsRouter);
app.use('/api/valuation-clients', authenticate, valuationClientsRouter);  // Also mount for frontend compatibility



// Publications & Research CMS Routes
app.use('/api/v1/publications', authenticate, requireServiceAccess('valuations'), publicationsRoutes);
app.use('/api/publications', authenticate, requireServiceAccess('valuations'), publicationsRoutes);  // Also mount for frontend compatibility

// Charts API (catalog, preview, snapshots for publications)
app.use('/api/v1/charts', authenticate, requireServiceAccess('valuations'), chartsRoutes);
app.use('/api/charts', authenticate, requireServiceAccess('valuations'), chartsRoutes);  // Also mount for frontend compatibility

// Autopilot Pipeline Routes (autonomous publication scheduling & management)
app.use('/api/v1/autopilot', authenticate, requireAdmin, autopilotRoutes);
app.use('/api/autopilot', authenticate, requireAdmin, autopilotRoutes);  // Also mount for frontend compatibility

// Kobby AI Routes (workspace AI assistant)
app.use('/api/v1/ai/kobby', authenticate, kobbyAIRoutes);
app.use('/api/ai/kobby', authenticate, kobbyAIRoutes);  // Also mount for frontend compatibility


// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
});
}
