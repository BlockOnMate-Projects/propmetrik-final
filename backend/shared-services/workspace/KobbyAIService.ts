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
import { workspaceService } from './WorkspaceService';
import { logger } from '../../src/utils/logger';
import { config } from '../../src/config';
import axios from 'axios';

// ============================================================================
// TYPES
// ============================================================================

export type EntityType = 'project' | 'valuation' | 'deal' | 'property' | 'platform';

export interface KobbyContext {
    entityType: EntityType;
    entityId: string;
    entityName: string;
    organizationName: string;
    entityData: Record<string, any>;
    recentMessages: Array<{ sender: string; content: string; time: string }>;
    marketData?: Record<string, any>;
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
            `SELECT d.name, d.status, d.stage, d.value, d.currency, d.created_at,
              d.expected_close_date, d.probability, d.notes,
              c.first_name, c.last_name, c.email, c.phone
       FROM crm_deals d
       LEFT JOIN crm_contacts c ON c.id = d.contact_id
       WHERE d.id = $1`,
            [dealId]
        );

        const deal = result.rows[0] || {};
        return {
            deal: {
                name: deal.name,
                status: deal.status,
                stage: deal.stage,
                value: deal.value ? `${deal.currency || 'GHS'} ${parseFloat(deal.value).toLocaleString()}` : 'N/A',
                probability: deal.probability ? `${deal.probability}%` : 'N/A',
                expectedClose: deal.expected_close_date,
                daysSinceCreated: deal.created_at
                    ? Math.floor((Date.now() - new Date(deal.created_at).getTime()) / 86400000)
                    : null,
                notes: deal.notes,
                contact: `${deal.first_name || ''} ${deal.last_name || ''}`.trim() || 'Unknown',
                contactEmail: deal.email,
                contactPhone: deal.phone,
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
// SYSTEM PROMPT BUILDER
// ============================================================================

function buildSystemPrompt(ctx: KobbyContext): string {
    const entitySection = JSON.stringify(ctx.entityData, null, 2);
    const chatSection = ctx.recentMessages
        .slice(-10)
        .map((m) => `[${m.time}] ${m.sender}: ${m.content}`)
        .join('\n');

    return `You are Kobby AI, PropMetrik's embedded real estate intelligence assistant.
You are operating inside the Workspace for:
  Entity Type: ${ctx.entityType}
  Entity Name: ${ctx.entityName}
  Organization: ${ctx.organizationName}

LIVE ENTITY DATA:
${entitySection}

RECENT WORKSPACE CHAT (last 10 messages):
${chatSection || 'No recent messages'}

${ctx.marketData ? `MARKET CONTEXT:\n${JSON.stringify(ctx.marketData, null, 2)}` : ''}

RULES:
- Focus exclusively on PropMetrik data for ${ctx.entityType} "${ctx.entityName}"
- Ground every answer in the provided data. If data is missing, say so explicitly
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
  "sources": ["PropMetrik Database: Project", "Market Trend Report"],
  "followUpSuggestions": ["Tell me about the budget phase", "Show me comparable properties"],
  "dataPoints": [
    { "metric": "Total Spent", "value": "GHS 1,200,000", "source": "Project Expenses" }
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
        organizationName = 'PropMetrik Client'
    ): Promise<KobbyContext> {
        // Fetch entity data + recent chat in parallel
        const [entityData, messageHistory] = await Promise.allSettled([
            this.fetchEntityData(entityType, entityId),
            workspaceService.getMessages(workspaceId, undefined, 20),
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

        // Try to extract entity name
        const entityName = this.extractEntityName(entity, entityType) || entityId.substring(0, 8);

        return {
            entityType,
            entityId,
            entityName,
            organizationName,
            entityData: entity,
            recentMessages: messages,
        };
    }

    private async fetchEntityData(entityType: EntityType, entityId: string): Promise<Record<string, any>> {
        switch (entityType) {
            case 'project': return fetchProjectContext(entityId);
            case 'valuation': return fetchValuationContext(entityId);
            case 'deal': return fetchDealContext(entityId);
            case 'property': return fetchPropertyContext(entityId);
            case 'platform': return { platform: { id: entityId, type: 'platform-wide' } };
        }
    }

    private extractEntityName(data: Record<string, any>, entityType: EntityType): string {
        switch (entityType) {
            case 'project': return data?.project?.name || '';
            case 'valuation': return data?.valuation?.location || '';
            case 'deal': return data?.deal?.name || '';
            case 'property': return data?.property?.address || '';
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

        const geminiKey = config.gemini.apiKey;
        const geminiUrl = config.gemini.apiUrl;

        if (!geminiKey) {
            logger.warn('KobbyAI: GEMINI_API_KEY missing, using rule-based fallback');
            return this.buildFallbackResponseObj(userQuery, context);
        }

        try {
            const response = await axios.post(
                `${geminiUrl}?key=${geminiKey}`,
                {
                    system_instruction: {
                        parts: { text: systemPrompt }
                    },
                    contents: [
                        { parts: [{ text: userQuery }] }
                    ],
                    generationConfig: {
                        temperature: 0.2, // Low temp for factual responses
                        response_mime_type: "application/json",
                    }
                },
                { headers: { 'Content-Type': 'application/json' } }
            );

            let rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!rawText) throw new Error('Empty Gemini response');

            // Clean markdown wrappings if Gemini ignored instructions
            rawText = rawText.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');

            const parsed = JSON.parse(rawText);

            return {
                answer: parsed.answer || 'I could not generate a response for that query.',
                confidence: parsed.confidence || 0.8,
                sources: parsed.sources || ['PropMetrik Entity Data'],
                followUpSuggestions: parsed.followUpSuggestions || [],
                dataPoints: (parsed.dataPoints || []).slice(0, 5),
            };

        } catch (err: any) {
            logger.error('KobbyAI: Gemini API call failed', {
                error: err.response?.data || err.message,
                status: err.response?.status
            });
            // Fallback on failure
            return this.buildFallbackResponseObj(userQuery, context);
        }
    }

    private buildFallbackResponseObj(userQuery: string, context: KobbyContext): KobbyResponse {
        return {
            answer: this.buildFallbackResponse(userQuery, context),
            confidence: 0.5,
            sources: ['PropMetrik entity data (AI Offline)'],
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
        return `I'm analyzing the ${entityType} **${entityName}** based on live PropMetrik data.\n\n${JSON.stringify(entityData, null, 2)}\n\n*Note: The AI assistant is temporarily offline. Showing raw data instead.*`;
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
