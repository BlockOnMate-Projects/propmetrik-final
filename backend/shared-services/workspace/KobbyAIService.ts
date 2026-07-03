/**
 * KobbyAIService
 *
 * The intelligence engine for the Workspace Kobby AI assistant.
 *
 * Architecture:
 *   1. EntityContextFetcher — pulls live data from each entity domain
 *   2. SystemPromptBuilder — assembles the full context into a Kobby system prompt
 *   3. query() — sends to mlAnalyticsService.assistantQuery with full context
 *
 * Invoked from:
 *   - WorkspaceWebSocketServer (kobby_query WS message)
 *   - kobbyAI.ts REST route (fallback + async report generation)
 *
 * @module services/workspace/KobbyAIService
 */

import { pool } from '../../src/database';
import { mlAnalyticsService } from '../../src/services/analytics/mlAnalyticsService';
import { rentalAnalyticsService } from '../../src/services/analytics/rentalAnalyticsService';
import { ghaiService } from '../../src/services/analytics/ghaiService';
import { constructionCostIndexService } from '../../src/services/analytics/constructionCostIndexService';
import { workspaceService } from './WorkspaceService';
import { logger } from '../../src/utils/logger';
import { aiService } from '../../src/services/ai/aiService';

// ============================================================================
// TYPES
// ============================================================================

// NOTE: 'crm' is a context-only scope, NOT a real workspace entity. When the
// Workspace panel is opened inside the deals/CRM section, the Kobby tab sends
// kobby queries with entityType='crm' (entityId = organizationId) so answers are
// scoped to pipeline/deal/contact/agent intelligence. The chat + members still
// live on the org's 'platform' workspace — see WorkspaceWebSocketServer, which
// persists/broadcasts to the connection's workspace, not to the query's entity.
export type EntityType = 'project' | 'valuation' | 'deal' | 'property' | 'platform' | 'crm';

export interface KobbyContext {
    entityType: EntityType;
    entityId: string;
    entityName: string;
    organizationName: string;
    entityData: Record<string, any>;
    recentMessages: Array<{ sender: string; content: string; time: string }>;
    marketData?: Record<string, any>;
    platformData?: Record<string, any>;
    portfolioData?: Record<string, any>;
}

export interface KobbyResponse {
    answer: string;
    confidence: number;
    sources: string[];
    followUpSuggestions: string[];
    dataPoints: Array<{ metric: string; value: any; source?: string }>;
}

// ============================================================================
// ENTITY CONTEXT FETCHERS
// ============================================================================

async function fetchProjectContext(projectId: string): Promise<Record<string, any>> {
    try {
        // Fetch core project info + phases + budget summary in parallel
        const [projectResult, phasesResult, budgetResult, assignmentsResult] = await Promise.allSettled([
            pool.query(
                `SELECT id, project_name, status, location, start_date, expected_completion,
                total_budget, total_units, project_type, description
         FROM development_projects WHERE id = $1`,
                [projectId]
            ),
            pool.query(
                `SELECT phase_name, status, planned_start_date, planned_end_date,
                progress_percentage, actual_cost, planned_cost
         FROM project_phases WHERE project_id = $1 ORDER BY planned_start_date ASC`,
                [projectId]
            ),
            pool.query(
                `SELECT SUM(actual_amount) as total_spent, SUM(budget_amount) as total_budget,
                COUNT(*) as expense_count
         FROM project_expenses WHERE project_id = $1`,
                [projectId]
            ),
            pool.query(
                `SELECT ca.role, v.company_name, ca.progress_percentage, ca.contract_value
         FROM contractor_assignments ca
         LEFT JOIN vendors v ON v.id = ca.contractor_id
         WHERE ca.project_id = $1`,
                [projectId]
            ),
        ]);

        const project = projectResult.status === 'fulfilled' ? projectResult.value.rows[0] || {} : {};
        const phases = phasesResult.status === 'fulfilled' ? phasesResult.value.rows : [];
        const budget = budgetResult.status === 'fulfilled' ? budgetResult.value.rows[0] || {} : {};
        const contractors = assignmentsResult.status === 'fulfilled' ? assignmentsResult.value.rows : [];

        // Compute derived metrics
        const totalSpent = parseFloat(budget.total_spent) || 0;
        const totalBudget = parseFloat(budget.total_budget) || parseFloat(project.total_budget) || 0;
        const budgetUtilisation = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : null;
        const behindSchedule = phases.filter(
            (p: any) => p.progress_percentage < 50 && p.planned_end_date && new Date(p.planned_end_date) < new Date()
        );

        return {
            project: {
                name: project.project_name,
                status: project.status,
                location: project.location,
                type: project.project_type,
                totalUnits: project.total_units,
                startDate: project.start_date,
                expectedCompletion: project.expected_completion,
            },
            phases: phases.map((p: any) => ({
                name: p.phase_name,
                status: p.status,
                progress: `${p.progress_percentage}%`,
                plannedStart: p.planned_start_date,
                plannedEnd: p.planned_end_date,
                costVariance: p.actual_cost && p.planned_cost
                    ? `${Math.round(((p.actual_cost - p.planned_cost) / p.planned_cost) * 100)}% over/under`
                    : 'N/A',
            })),
            budget: {
                totalBudget: totalBudget ? `GHS ${totalBudget.toLocaleString()}` : 'N/A',
                totalSpent: totalSpent ? `GHS ${totalSpent.toLocaleString()}` : 'N/A',
                utilisation: budgetUtilisation !== null ? `${budgetUtilisation}%` : 'N/A',
                alert: budgetUtilisation && budgetUtilisation > 85 ? '⚠️ Over 85% of budget consumed' : null,
            },
            contractors: contractors.map((c: any) => ({
                company: c.company_name,
                role: c.role,
                progress: `${c.progress_percentage}%`,
                contractValue: c.contract_value ? `GHS ${c.contract_value}` : 'N/A',
            })),
            riskFlags: behindSchedule.length > 0
                ? `${behindSchedule.length} phase(s) behind schedule: ${behindSchedule.map((p: any) => p.phase_name).join(', ')}`
                : 'No schedule delays detected',
        };
    } catch (err) {
        logger.warn('KobbyAI: Could not fetch project context', { error: (err as Error).message });
        return { error: 'Project data temporarily unavailable' };
    }
}

async function fetchValuationContext(valuationId: string): Promise<Record<string, any>> {
    try {
        const [valResult, compResult] = await Promise.allSettled([
            pool.query(
                `SELECT v.id, v.status, v.valuation_date, v.market_value, v.methodology,
                v.property_type, v.location_name, v.area_sqm, v.notes,
                p.address, p.region
         FROM valuations v
         LEFT JOIN properties p ON p.id = v.property_id
         WHERE v.id = $1`,
                [valuationId]
            ),
            pool.query(
                `SELECT address, sale_price, sale_date, area_sqm, price_per_sqm
         FROM comparable_properties WHERE valuation_id = $1
         ORDER BY relevance_score DESC LIMIT 5`,
                [valuationId]
            ),
        ]);

        const val = valResult.status === 'fulfilled' ? valResult.value.rows[0] || {} : {};
        const comps = compResult.status === 'fulfilled' ? compResult.value.rows : [];

        return {
            valuation: {
                status: val.status,
                date: val.valuation_date,
                marketValue: val.market_value ? `GHS ${parseFloat(val.market_value).toLocaleString()}` : 'Pending',
                methodology: val.methodology,
                propertyType: val.property_type,
                location: val.location_name || val.address,
                region: val.region,
                areaSqm: val.area_sqm ? `${val.area_sqm} m²` : 'N/A',
                notes: val.notes,
            },
            comparables: {
                count: comps.length,
                topComps: comps.slice(0, 3).map((c: any) => ({
                    address: c.address,
                    salePrice: c.sale_price ? `GHS ${parseFloat(c.sale_price).toLocaleString()}` : 'N/A',
                    pricePerSqm: c.price_per_sqm ? `GHS ${parseFloat(c.price_per_sqm).toFixed(0)}/m²` : 'N/A',
                    saleDate: c.sale_date,
                })),
            },
        };
    } catch (err) {
        logger.warn('KobbyAI: Could not fetch valuation context', { error: (err as Error).message });
        return { error: 'Valuation data temporarily unavailable' };
    }
}

async function fetchDealContext(dealId: string): Promise<Record<string, any>> {
    try {
        const result = await pool.query(
            `SELECT d.title, d.deal_status, ds.stage_name, d.deal_value, d.currency, d.created_at,
              d.estimated_close_date, d.close_probability, d.notes,
              c.first_name, c.last_name, c.email, c.primary_phone
       FROM deals d
       LEFT JOIN deal_stages ds ON ds.id = d.stage_id
       LEFT JOIN contacts c ON c.id = d.primary_contact_id
       WHERE d.id = $1 AND d.deleted_at IS NULL`,
            [dealId]
        );

        const deal = result.rows[0] || {};
        return {
            deal: {
                name: deal.title,
                status: deal.deal_status,
                stage: deal.stage_name,
                value: deal.deal_value ? `${deal.currency || 'GHS'} ${parseFloat(deal.deal_value).toLocaleString()}` : 'N/A',
                probability: deal.close_probability != null ? `${deal.close_probability}%` : 'N/A',
                expectedClose: deal.estimated_close_date,
                daysSinceCreated: deal.created_at
                    ? Math.floor((Date.now() - new Date(deal.created_at).getTime()) / 86400000)
                    : null,
                notes: deal.notes,
                contact: `${deal.first_name || ''} ${deal.last_name || ''}`.trim() || 'Unknown',
                contactEmail: deal.email,
                contactPhone: deal.primary_phone,
            },
        };
    } catch (err) {
        logger.warn('KobbyAI: Could not fetch deal context', { error: (err as Error).message });
        return { error: 'Deal data temporarily unavailable' };
    }
}

async function fetchPropertyContext(propertyId: string): Promise<Record<string, any>> {
    try {
        const [propResult, tenantsResult, maintenanceResult] = await Promise.allSettled([
            pool.query(
                `SELECT address, property_type, status, total_units, region,
                size_sqm, year_built, description
         FROM properties WHERE id = $1`,
                [propertyId]
            ),
            pool.query(
                `SELECT COUNT(*) as active_tenants,
                SUM(monthly_rent) as total_monthly_rent,
                MIN(lease_start_date) as earliest_lease,
                MAX(lease_end_date) as latest_lease_end
         FROM tenancies WHERE property_id = $1 AND status = 'active'`,
                [propertyId]
            ),
            pool.query(
                `SELECT status, COUNT(*) as count
         FROM maintenance_requests WHERE property_id = $1
         GROUP BY status`,
                [propertyId]
            ),
        ]);

        const prop = propResult.status === 'fulfilled' ? propResult.value.rows[0] || {} : {};
        const tenants = tenantsResult.status === 'fulfilled' ? tenantsResult.value.rows[0] || {} : {};
        const maintenance = maintenanceResult.status === 'fulfilled' ? maintenanceResult.value.rows : [];

        const maintenanceSummary = maintenance.reduce((acc: any, m: any) => {
            acc[m.status] = parseInt(m.count, 10);
            return acc;
        }, {});

        return {
            property: {
                address: prop.address,
                type: prop.property_type,
                status: prop.status,
                totalUnits: prop.total_units,
                region: prop.region,
                sizeSqm: prop.size_sqm ? `${prop.size_sqm} m²` : 'N/A',
                yearBuilt: prop.year_built,
            },
            tenancy: {
                activeTenants: parseInt(tenants.active_tenants, 10) || 0,
                totalMonthlyRent: tenants.total_monthly_rent
                    ? `GHS ${parseFloat(tenants.total_monthly_rent).toLocaleString()}`
                    : 'N/A',
                earliestLeaseStart: tenants.earliest_lease,
                latestLeaseEnd: tenants.latest_lease_end,
                occupancyRate: prop.total_units && tenants.active_tenants
                    ? `${Math.round((parseInt(tenants.active_tenants, 10) / prop.total_units) * 100)}%`
                    : 'N/A',
            },
            maintenance: {
                open: maintenanceSummary.open || 0,
                inProgress: maintenanceSummary.in_progress || 0,
                completed: maintenanceSummary.completed || 0,
                urgent: maintenanceSummary.urgent || 0,
                alert: (maintenanceSummary.open || 0) + (maintenanceSummary.urgent || 0) > 3
                    ? `⚠️ ${maintenanceSummary.open || 0} open + ${maintenanceSummary.urgent || 0} urgent maintenance requests`
                    : null,
            },
        };
    } catch (err) {
        logger.warn('KobbyAI: Could not fetch property context', { error: (err as Error).message });
        return { error: 'Property data temporarily unavailable' };
    }
}

// ============================================================================
// CRM PIPELINE CONTEXT (org-wide sales intelligence)
// ============================================================================

/**
 * Build org-wide CRM pipeline context — deals, pipeline stages, contacts, top
 * agents. Mirrors the aggregate queries behind the /crm/ai/ask endpoint so the
 * Workspace Kobby tab gives the same CRM-scoped intelligence the standalone CRM
 * assistant popup used to. `organizationId` is passed in as the entity id.
 */
async function fetchCrmContext(organizationId: string): Promise<Record<string, any>> {
    try {
        const [deals, stages, contacts, agents] = await Promise.allSettled([
            pool.query(
                `SELECT deal_status, deal_type, COUNT(*) as count,
                        SUM(deal_value) as total_value,
                        AVG(deal_value) as avg_value,
                        AVG(days_in_pipeline) as avg_days
                 FROM deals
                 WHERE organization_id = $1 AND deleted_at IS NULL
                 GROUP BY deal_status, deal_type`,
                [organizationId]
            ),
            pool.query(
                // deal_stages has no probability column — the forecast probability lives
                // on the deal (close_probability), so average it per stage.
                `SELECT ps.stage_name, AVG(d.close_probability) as probability,
                        COUNT(d.id) as deal_count, SUM(d.deal_value) as total_value
                 FROM deal_stages ps
                 LEFT JOIN deals d ON d.stage_id = ps.id AND d.deal_status = 'active' AND d.deleted_at IS NULL
                 JOIN deal_pipelines p ON p.id = ps.pipeline_id AND p.organization_id = $1 AND p.deleted_at IS NULL
                 WHERE ps.is_active = true
                 GROUP BY ps.stage_name, ps.stage_order
                 ORDER BY ps.stage_order`,
                [organizationId]
            ),
            pool.query(
                `SELECT lead_status, COUNT(*) as count
                 FROM contacts
                 WHERE organization_id = $1 AND deleted_at IS NULL
                 GROUP BY lead_status`,
                [organizationId]
            ),
            pool.query(
                `SELECT u.first_name || ' ' || u.last_name as name,
                        COUNT(d.id) FILTER (WHERE d.deal_status = 'active') as active_deals,
                        COUNT(d.id) FILTER (WHERE d.deal_status = 'won') as won_deals,
                        SUM(d.deal_value) FILTER (WHERE d.deal_status = 'won') as won_value
                 FROM users u
                 JOIN deals d ON d.assigned_agent = u.id AND d.organization_id = $1 AND d.deleted_at IS NULL
                 GROUP BY u.id, u.first_name, u.last_name
                 ORDER BY won_value DESC NULLS LAST
                 LIMIT 10`,
                [organizationId]
            ),
        ]);

        const dealStats = deals.status === 'fulfilled' ? deals.value.rows : [];
        const stageData = stages.status === 'fulfilled' ? stages.value.rows : [];
        const contactStats = contacts.status === 'fulfilled' ? contacts.value.rows : [];
        const agentStats = agents.status === 'fulfilled' ? agents.value.rows : [];

        const totalPipeline = stageData.reduce((s: number, r: any) => s + parseFloat(r.total_value || 0), 0);
        const totalDeals = dealStats.reduce((s: number, r: any) => s + parseInt(r.count, 10), 0);
        const totalContacts = contactStats.reduce((s: number, r: any) => s + parseInt(r.count, 10), 0);

        return {
            crm: {
                totalDeals,
                pipelineValue: `GHS ${totalPipeline.toLocaleString()}`,
                totalContacts,
                dealBreakdown: dealStats.map((d: any) => ({
                    status: d.deal_status,
                    type: d.deal_type,
                    count: parseInt(d.count, 10),
                    totalValue: `GHS ${parseFloat(d.total_value || 0).toLocaleString()}`,
                    avgDaysInPipeline: Math.round(parseFloat(d.avg_days || 0)),
                })),
                pipelineStages: stageData.map((s: any) => ({
                    stage: s.stage_name,
                    probability: s.probability != null ? `${Math.round(parseFloat(s.probability))}%` : 'n/a',
                    deals: parseInt(s.deal_count, 10),
                    value: `GHS ${parseFloat(s.total_value || 0).toLocaleString()}`,
                })),
                contactsByStatus: contactStats.map((c: any) => ({
                    status: c.lead_status,
                    count: parseInt(c.count, 10),
                })),
                topAgents: agentStats.map((a: any) => ({
                    name: a.name,
                    wonDeals: parseInt(a.won_deals, 10) || 0,
                    wonValue: `GHS ${parseFloat(a.won_value || 0).toLocaleString()}`,
                    activeDeals: parseInt(a.active_deals, 10) || 0,
                })),
            },
        };
    } catch (err) {
        logger.warn('KobbyAI: Could not fetch CRM context', { error: (err as Error).message });
        return { error: 'CRM data temporarily unavailable' };
    }
}

// ============================================================================
// MARKET CONTEXT (optional, entity-agnostic)
// ============================================================================

async function fetchMarketContext(region?: string): Promise<Record<string, any>> {
    try {
        const data = await mlAnalyticsService.getMarketPriceIndex(region, undefined);
        return {
            marketPriceIndex: data,
            region: region || 'greater_accra',
        };
    } catch {
        return { note: 'Market data unavailable' };
    }
}

// ============================================================================
// PLATFORM-WIDE CONTEXT (cached, global market intelligence)
// ============================================================================

let platformCache: { data: Record<string, any>; expiresAt: number } | null = null;
const PLATFORM_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchPlatformContext(): Promise<Record<string, any>> {
    if (platformCache && Date.now() < platformCache.expiresAt) {
        return platformCache.data;
    }

    const [priceIndex, cci, ghai, rental, capRates] = await Promise.allSettled([
        mlAnalyticsService.getMarketPriceIndex(undefined, undefined),
        constructionCostIndexService.getNationalSummary(),
        ghaiService.getCurrent(),
        rentalAnalyticsService.getRentalSummary({}),
        pool.query(
            `SELECT region, property_type, benchmark_cap_rate, vacancy_rate_market
             FROM market_cap_rate_benchmarks
             WHERE valid_until IS NULL OR valid_until >= CURRENT_DATE
             ORDER BY region, property_type`
        ),
    ]);

    // Log any failures for debugging
    [priceIndex, cci, ghai, rental, capRates].forEach((r, i) => {
        if (r.status === 'rejected') {
            const names = ['priceIndex', 'cci', 'ghai', 'rental', 'capRates'];
            logger.warn(`KobbyAI: Platform fetch failed for ${names[i]}`, { error: r.reason?.message });
        }
    });

    const result: Record<string, any> = {
        priceIndex: priceIndex.status === 'fulfilled' ? priceIndex.value : null,
        constructionCostIndex: cci.status === 'fulfilled' ? cci.value : null,
        housingAffordabilityIndex: ghai.status === 'fulfilled' ? ghai.value : null,
        rentalMarket: rental.status === 'fulfilled' ? rental.value : null,
        capRateBenchmarks: capRates.status === 'fulfilled' ? (capRates.value as any).rows : null,
    };

    // Only cache if at least some data was fetched successfully
    const hasData = Object.values(result).some(v => v !== null);
    if (hasData) {
        platformCache = { data: result, expiresAt: Date.now() + PLATFORM_CACHE_TTL };
    }
    return result;
}

// ============================================================================
// USER PORTFOLIO CONTEXT (org-level entity summaries)
// ============================================================================

async function fetchUserPortfolioContext(organizationId: string): Promise<Record<string, any>> {
    try {
        const [projects, properties, deals, valuations] = await Promise.allSettled([
            pool.query(
                `SELECT status, COUNT(*)::int as count, COALESCE(SUM(total_budget), 0) as total_budget
                 FROM development_projects WHERE organization_id = $1
                 GROUP BY status`,
                [organizationId]
            ),
            pool.query(
                `SELECT status, COUNT(*)::int as count
                 FROM properties WHERE organization_id = $1
                 GROUP BY status`,
                [organizationId]
            ),
            pool.query(
                `SELECT deal_status as status, COUNT(*)::int as count, COALESCE(SUM(deal_value), 0) as total_value
                 FROM deals WHERE organization_id = $1 AND deleted_at IS NULL
                 GROUP BY deal_status`,
                [organizationId]
            ),
            pool.query(
                `SELECT COUNT(*)::int as total,
                        COUNT(*) FILTER (WHERE status = 'completed')::int as completed,
                        ROUND(COALESCE(AVG(estimated_value), 0)::numeric, 2) as avg_value
                 FROM valuations WHERE valuer_organization_id = $1`,
                [organizationId]
            ),
        ]);

        const projectRows = projects.status === 'fulfilled' ? projects.value.rows : [];
        const propertyRows = properties.status === 'fulfilled' ? properties.value.rows : [];
        const dealRows = deals.status === 'fulfilled' ? deals.value.rows : [];
        const valRow = valuations.status === 'fulfilled' ? valuations.value.rows[0] || {} : {};

        return {
            projects: {
                byStatus: projectRows,
                total: projectRows.reduce((s: number, r: any) => s + r.count, 0),
                totalBudget: projectRows.reduce((s: number, r: any) => s + parseFloat(r.total_budget || 0), 0),
            },
            properties: {
                byStatus: propertyRows,
                total: propertyRows.reduce((s: number, r: any) => s + r.count, 0),
            },
            deals: {
                byStatus: dealRows,
                total: dealRows.reduce((s: number, r: any) => s + r.count, 0),
                totalPipelineValue: dealRows.reduce((s: number, r: any) => s + parseFloat(r.total_value || 0), 0),
            },
            valuations: {
                total: valRow.total || 0,
                completed: valRow.completed || 0,
                avgValue: valRow.avg_value ? parseFloat(valRow.avg_value) : 0,
            },
        };
    } catch (err) {
        logger.warn('KobbyAI: Could not fetch portfolio context', { error: (err as Error).message });
        return {};
    }
}

// ============================================================================
// SYSTEM PROMPT BUILDER
// ============================================================================

function buildSystemPrompt(ctx: KobbyContext): string {
    const chatSection = ctx.recentMessages
        .slice(-10)
        .map((m) => `[${m.time}] ${m.sender}: ${m.content}`)
        .join('\n');

    // Entity-specific section (only when focused on a specific entity, not platform-wide).
    // 'crm' gets a dedicated sales-intelligence label rather than "entity focus".
    const entitySection =
        ctx.entityType === 'crm'
            ? `\nCRM PIPELINE INTELLIGENCE (live sales data — deals, pipeline stages, contacts, agents):\n${JSON.stringify(ctx.entityData, null, 2)}`
            : ctx.entityType !== 'platform'
                ? `\nCURRENT ENTITY FOCUS (${ctx.entityType}: "${ctx.entityName}"):\n${JSON.stringify(ctx.entityData, null, 2)}`
                : '';

    // Platform-wide data (always included)
    const platformSection = ctx.platformData
        ? `\nPLATFORM-WIDE MARKET INTELLIGENCE:\n${JSON.stringify(ctx.platformData, null, 2)}`
        : '';

    // User's portfolio summary (always included)
    const portfolioSection = ctx.portfolioData
        ? `\nORGANIZATION PORTFOLIO SUMMARY:\n${JSON.stringify(ctx.portfolioData, null, 2)}`
        : '';

    return `You are Kobby AI, PROPMETRIK's embedded real estate intelligence assistant for the Ghanaian market.
You serve the organization: ${ctx.organizationName}
Current workspace context: ${ctx.entityType}${ctx.entityType !== 'platform' ? ` — "${ctx.entityName}"` : ' (platform-wide)'}
${platformSection}
${portfolioSection}
${entitySection}

${ctx.marketData ? `MARKET PRICE INDEX:\n${JSON.stringify(ctx.marketData, null, 2)}` : ''}

RECENT WORKSPACE CHAT (last 10 messages):
${chatSection || 'No recent messages'}

RULES:
- You have FULL platform-wide knowledge: market indices, CAP rates, construction costs, affordability data, rental yields, and the user's entire portfolio
- You CAN and SHOULD answer questions about any PROPMETRIK data — market analytics, CAP rates, property indices, construction costs, affordability — even if the user does not have direct access to the Analytics dashboard
- When inside a specific entity (project/valuation/deal/property), prioritize that entity's data but freely reference platform data and the user's other entities for comparisons and insights
- When on the platform view, answer questions about any of the user's projects, properties, deals, or valuations using the portfolio data
- Ground every answer in the provided data. If specific data is truly not available in the context, say so explicitly
- Be concise and actionable: use bullet points, numbers, GHS currency, dates
- Ghana/West Africa real estate context applies to all market reasoning
- Do NOT fabricate financial figures, valuations, or legal opinions
- Proactively flag risks when you see budget overruns, schedule delays, or compliance gaps
- Suggest a concrete next step when flagging any risk
- Format responses in clean markdown

You MUST respond with a valid JSON object matching this exact schema:
{
  "answer": "Your detailed markdown response here",
  "confidence": 0.95,
  "sources": ["PROPMETRIK Market Intelligence", "Organization Portfolio Data"],
  "followUpSuggestions": ["What are the CAP rates by region?", "Show me my project budgets"],
  "dataPoints": [
    { "metric": "CAP Rate (Greater Accra)", "value": "9.43%", "source": "Market Benchmarks" }
  ]
}
Do NOT wrap the response in markdown code blocks like \`\`\`json. Return JUST the raw JSON string.`;
}

// ============================================================================
// KOBBY AI SERVICE
// ============================================================================

class KobbyAIServiceImpl {

    /**
     * Build full context for a given entity + workspace.
     * Used by both REST (pre-fetch) and WS (on-demand at query time).
     */
    async buildContext(
        entityType: EntityType,
        entityId: string,
        workspaceId: string,
        organizationId: string,
        organizationName = 'PROPMETRIK Client'
    ): Promise<KobbyContext> {
        // Fetch entity data, recent chat, market, platform, and portfolio context in parallel
        const [entityData, messageHistory, marketData, platformData, portfolioData] = await Promise.allSettled([
            this.fetchEntityData(entityType, entityId),
            workspaceService.getMessages(workspaceId, undefined, 20),
            fetchMarketContext(),
            fetchPlatformContext(),
            organizationId ? fetchUserPortfolioContext(organizationId) : Promise.resolve({}),
        ]);

        const entity = entityData.status === 'fulfilled' ? entityData.value : {};
        const messages = messageHistory.status === 'fulfilled'
            ? messageHistory.value.messages
                .filter((m) => m.deleted_at === null && m.sender_type !== 'system')
                .map((m) => ({
                    sender: m.sender_type === 'kobby_ai' ? 'Kobby AI' : (m.sender_name || 'Team Member'),
                    content: m.content.substring(0, 200), // truncate for prompt
                    time: new Date(m.created_at).toLocaleTimeString(),
                }))
            : [];
        const market = marketData.status === 'fulfilled' ? marketData.value : undefined;
        const platform = platformData.status === 'fulfilled' ? platformData.value : undefined;
        const portfolio = portfolioData.status === 'fulfilled' ? portfolioData.value : undefined;

        // Try to extract entity name
        const entityName = this.extractEntityName(entity, entityType) || entityId.substring(0, 8);

        return {
            entityType,
            entityId,
            entityName,
            organizationName,
            entityData: entity,
            recentMessages: messages,
            marketData: market,
            platformData: platform,
            portfolioData: portfolio,
        };
    }

    private async fetchEntityData(entityType: EntityType, entityId: string): Promise<Record<string, any>> {
        switch (entityType) {
            case 'project': return fetchProjectContext(entityId);
            case 'valuation': return fetchValuationContext(entityId);
            case 'deal': return fetchDealContext(entityId);
            case 'property': return fetchPropertyContext(entityId);
            case 'crm': return fetchCrmContext(entityId); // entityId = organizationId
            case 'platform': return { platform: { id: entityId, type: 'platform-wide' } };
        }
    }

    private extractEntityName(data: Record<string, any>, entityType: EntityType): string {
        switch (entityType) {
            case 'project': return data?.project?.name || '';
            case 'valuation': return data?.valuation?.location || '';
            case 'deal': return data?.deal?.name || '';
            case 'property': return data?.property?.address || '';
            case 'crm': return 'CRM Pipeline';
            case 'platform': return 'Platform';
        }
    }

    /**
     * Process a user's Kobby AI query with full entity context.
     * Returns a structured response.
     */
    async query(
        userQuery: string,
        context: KobbyContext,
        sessionId?: string
    ): Promise<KobbyResponse> {
        const systemPrompt = buildSystemPrompt(context);

        if (!aiService.isAvailable()) {
            logger.warn('KobbyAI: no AI provider configured, using rule-based fallback');
            return this.buildFallbackResponseObj(userQuery, context);
        }

        try {
            // Shared aiService: Gemini → DeepSeek fallback, centralized model, JSON mode.
            const { data: parsed } = await aiService.generateJson<any>({
                system: systemPrompt,
                prompt: userQuery,
                temperature: 0.2, // Low temp for factual responses
                feature: 'kobby-ai',
            });

            return {
                answer: parsed.answer || 'I could not generate a response for that query.',
                confidence: parsed.confidence || 0.8,
                sources: parsed.sources || ['PROPMETRIK Entity Data'],
                followUpSuggestions: parsed.followUpSuggestions || [],
                dataPoints: (parsed.dataPoints || []).slice(0, 5),
            };

        } catch (err: any) {
            logger.error('KobbyAI: AI call failed', { error: err.message });
            // Fallback on failure
            return this.buildFallbackResponseObj(userQuery, context);
        }
    }

    private buildFallbackResponseObj(userQuery: string, context: KobbyContext): KobbyResponse {
        return {
            answer: this.buildFallbackResponse(userQuery, context),
            confidence: 0.5,
            sources: ['PROPMETRIK entity data (AI Offline)'],
            followUpSuggestions: ['Check the entity dashboard for more details'],
            dataPoints: [],
        };
    }

    /**
     * Rule-based fallback response builder when ML service is unavailable.
     * Uses entity data to produce a useful canned response.
     */
    private buildFallbackResponse(query: string, context: KobbyContext): string {
        const { entityType, entityName, entityData } = context;
        const q = query.toLowerCase();

        // Project-specific fallbacks
        if (entityType === 'project') {
            if (q.includes('budget') || q.includes('spend') || q.includes('cost')) {
                const b = entityData?.budget;
                return b
                    ? `**Budget Summary for ${entityName}**\n- Total Budget: ${b.totalBudget}\n- Spent: ${b.totalSpent}\n- Utilisation: ${b.utilisation}\n${b.alert ? `\n${b.alert}` : ''}`
                    : 'Budget data is not available for this project.';
            }
            if (q.includes('phase') || q.includes('schedule') || q.includes('progress')) {
                const phases = entityData?.phases as any[];
                if (phases && phases.length > 0) {
                    return `**Phase Status for ${entityName}**\n${phases.map((p: any) => `- **${p.name}**: ${p.progress} complete (${p.status})`).join('\n')}`;
                }
            }
        }

        // Property-specific fallbacks
        if (entityType === 'property') {
            if (q.includes('tenant') || q.includes('occupancy') || q.includes('rent')) {
                const t = entityData?.tenancy;
                return t
                    ? `**Tenancy Summary**\n- Active Tenants: ${t.activeTenants}\n- Monthly Rent: ${t.totalMonthlyRent}\n- Occupancy Rate: ${t.occupancyRate}`
                    : 'Tenancy data is not available.';
            }
        }

        // Generic fallback
        return `I'm analyzing the ${entityType} **${entityName}** based on live PROPMETRIK data.\n\n${JSON.stringify(entityData, null, 2)}\n\n*Note: The AI assistant is temporarily offline. Showing raw data instead.*`;
    }

    /**
     * Detect anomalies in entity data for proactive monitoring.
     * Called by the cron job in kobbyAIMonitor.ts (Phase 3).
     */
    async detectAnomalies(context: KobbyContext): Promise<string | null> {
        const { entityType, entityName, entityData } = context;

        if (entityType === 'project') {
            const b = entityData?.budget;
            const phases = entityData?.phases as any[];

            const alerts: string[] = [];

            // Budget overrun alert
            const utilPct = parseFloat((b?.utilisation || '0').replace('%', ''));
            if (utilPct > 85) {
                alerts.push(`💰 Budget alert: ${utilPct}% of budget consumed for **${entityName}**`);
            }

            // Phase delay alert
            const delayed = phases?.filter((p: any) => {
                const endDate = p.plannedEnd ? new Date(p.plannedEnd) : null;
                const progress = parseFloat(p.progress?.replace('%', '') || '0');
                return endDate && endDate < new Date() && progress < 80;
            }) || [];

            if (delayed.length > 0) {
                alerts.push(`⚠️ ${delayed.length} phase(s) may be delayed: ${delayed.map((p: any) => p.name).join(', ')}`);
            }

            if (alerts.length > 0) {
                return alerts.join('\n\n');
            }
        }

        if (entityType === 'property') {
            const m = entityData?.maintenance;
            const openUrgent = (m?.open || 0) + (m?.urgent || 0);
            if (openUrgent > 5) {
                return `🔴 ${openUrgent} open/urgent maintenance requests for **${entityName}** require attention.`;
            }
        }

        return null;
    }
}

export const kobbyAIService = new KobbyAIServiceImpl();
