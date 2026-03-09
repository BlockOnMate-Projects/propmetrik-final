/**
 * CRM AI Assistant Routes
 *
 * Extends the existing Kobby AI with CRM-specific intelligence:
 *   - Natural language queries about pipeline, contacts, deals
 *   - Smart deal scoring recommendations
 *   - Property auto-match suggestions
 *   - Activity suggestions (next best action)
 *
 * Leverages the existing KobbyAIService + LLM infrastructure (Gemini primary,
 * DeepSeek/Anthropic fallback via llmClient).
 *
 * Base path: /api/v1/crm/ai
 *
 * @module routes/crm/ai
 */

import { Router, Request, Response } from 'express';
import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import axios from 'axios';

const router = Router();

function getUserId(req: Request): string {
    return (req as any).user?.id || (req as any).userId;
}
function getOrganizationId(req: Request): string {
    return (req as any).organizationId || req.headers['x-organization-id'] as string;
}

// =====================================================
// CRM CONTEXT BUILDER
// =====================================================

async function buildCRMContext(organizationId: string): Promise<string> {
    try {
        const [deals, stages, contacts, agents] = await Promise.allSettled([
            pool.query(
                `SELECT deal_status, deal_type, COUNT(*) as count,
                        SUM(deal_value) as total_value,
                        AVG(deal_value) as avg_value,
                        AVG(days_in_pipeline) as avg_days
                 FROM crm_deals
                 WHERE organization_id = $1 AND deleted_at IS NULL
                 GROUP BY deal_status, deal_type`,
                [organizationId]
            ),
            pool.query(
                `SELECT ps.stage_name, ps.probability, COUNT(d.id) as deal_count,
                        SUM(d.deal_value) as total_value
                 FROM crm_pipeline_stages ps
                 LEFT JOIN crm_deals d ON d.stage_id = ps.id AND d.deal_status = 'active' AND d.deleted_at IS NULL
                 JOIN crm_deal_pipelines p ON p.id = ps.pipeline_id AND p.organization_id = $1
                 WHERE ps.is_active = true
                 GROUP BY ps.stage_name, ps.probability, ps.stage_order
                 ORDER BY ps.stage_order`,
                [organizationId]
            ),
            pool.query(
                `SELECT lead_status, COUNT(*) as count
                 FROM crm_contacts
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
                 JOIN crm_deals d ON d.assigned_agent = u.id AND d.organization_id = $1 AND d.deleted_at IS NULL
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

        return `
CRM LIVE DATA SUMMARY:
- Total deals: ${totalDeals}
- Deal breakdown: ${dealStats.map((d: any) => `${d.deal_status}/${d.deal_type}: ${d.count} deals, GHS ${parseFloat(d.total_value || 0).toLocaleString()}`).join('; ')}
- Pipeline value: GHS ${totalPipeline.toLocaleString()}
- Pipeline stages: ${stageData.map((s: any) => `${s.stage_name} (${s.probability}% prob): ${s.deal_count} deals, GHS ${parseFloat(s.total_value || 0).toLocaleString()}`).join('; ')}
- Total contacts: ${totalContacts}
- Contact status: ${contactStats.map((c: any) => `${c.lead_status}: ${c.count}`).join(', ')}
- Top agents: ${agentStats.map((a: any) => `${a.name}: ${a.won_deals} won (GHS ${parseFloat(a.won_value || 0).toLocaleString()}), ${a.active_deals} active`).join('; ')}
`.trim();
    } catch (err) {
        logger.warn('CRM AI: Could not build CRM context', { error: (err as Error).message });
        return 'CRM data temporarily unavailable';
    }
}

// =====================================================
// SINGLE-ENTITY CONTEXT FETCHER
// =====================================================

async function fetchEntityDetail(entityType: string, entityId: string, organizationId: string): Promise<string> {
    try {
        if (entityType === 'deal') {
            const result = await pool.query(
                `SELECT d.*, ps.stage_name, ps.probability as stage_probability,
                        p.pipeline_name,
                        c.first_name || ' ' || c.last_name as contact_name, c.email as contact_email,
                        c.primary_phone as contact_phone,
                        u.first_name || ' ' || u.last_name as agent_name,
                        (SELECT COUNT(*) FROM deal_activities WHERE deal_id = d.id) as activity_count,
                        (SELECT COUNT(*) FROM crm_tasks WHERE deal_id = d.id AND status != 'completed') as open_tasks
                 FROM crm_deals d
                 LEFT JOIN crm_pipeline_stages ps ON ps.id = d.stage_id
                 LEFT JOIN crm_deal_pipelines p ON p.id = d.pipeline_id
                 LEFT JOIN crm_contacts c ON c.id = d.primary_contact_id
                 LEFT JOIN users u ON u.id = d.assigned_agent
                 WHERE d.id = $1 AND d.organization_id = $2`,
                [entityId, organizationId]
            );
            const d = result.rows[0];
            if (!d) return 'Deal not found';
            return `Deal: "${d.title}" | Value: GHS ${parseFloat(d.deal_value || 0).toLocaleString()} | Type: ${d.deal_type} | Status: ${d.deal_status} | Stage: ${d.stage_name} (${d.stage_probability}%) | Pipeline: ${d.pipeline_name} | Contact: ${d.contact_name || 'None'} (${d.contact_email || ''}) | Agent: ${d.agent_name || 'Unassigned'} | Days in pipeline: ${d.days_in_pipeline || 0} | Activities: ${d.activity_count} | Open tasks: ${d.open_tasks} | Expected close: ${d.estimated_close_date || 'Not set'}`;
        }
        if (entityType === 'contact') {
            const result = await pool.query(
                `SELECT c.*,
                        co.company_name,
                        (SELECT COUNT(*) FROM crm_deals WHERE primary_contact_id = c.id AND deleted_at IS NULL) as deal_count,
                        (SELECT SUM(deal_value) FROM crm_deals WHERE primary_contact_id = c.id AND deal_status = 'won' AND deleted_at IS NULL) as won_value
                 FROM crm_contacts c
                 LEFT JOIN crm_companies co ON co.id = c.company_id
                 WHERE c.id = $1 AND c.organization_id = $2`,
                [entityId, organizationId]
            );
            const c = result.rows[0];
            if (!c) return 'Contact not found';
            return `Contact: ${c.first_name} ${c.last_name} | Email: ${c.email || 'N/A'} | Phone: ${c.primary_phone} | Status: ${c.lead_status} | Score: ${c.lead_score}/100 | Company: ${c.company_name || 'N/A'} | Budget: GHS ${parseFloat(c.budget_min || 0).toLocaleString()}-${parseFloat(c.budget_max || 0).toLocaleString()} | Preferred: ${(c.preferred_property_types || []).join(', ')} in ${(c.preferred_locations || []).join(', ')} | Deals: ${c.deal_count} | Won value: GHS ${parseFloat(c.won_value || 0).toLocaleString()}`;
        }
        return '';
    } catch (err) {
        return `Could not fetch ${entityType} details`;
    }
}

// =====================================================
// AI QUERY ENDPOINT
// =====================================================

const CRM_AI_SYSTEM_PROMPT = `You are Kobby AI, the CRM intelligence assistant for PROPMETRIK - Ghana's premier real estate platform.

RULES:
- Answer questions about CRM data: deals, contacts, pipeline, agents, revenue
- Ground every answer in the provided CRM data. If data is missing, say so explicitly
- Use GHS currency, Ghana/West Africa real estate context
- Be concise and actionable: bullet points, numbers, clear recommendations
- Do NOT fabricate financial figures or deal data
- When asked about specific deals or contacts, use the provided entity data
- When asked analytical questions, compute from the summary data provided
- Suggest actionable next steps when appropriate
- Format responses in clean markdown

You MUST respond with a valid JSON object:
{
  "answer": "Your markdown response",
  "confidence": 0.85,
  "sources": ["CRM Database"],
  "suggestions": ["Follow-up suggestion 1", "Follow-up suggestion 2"],
  "data_points": [{ "metric": "Pipeline Value", "value": "GHS 2.4M" }],
  "actions": []
}
Return JUST the raw JSON. No markdown code blocks.`;

/**
 * POST /ai/ask
 * Natural language CRM query
 */
router.post('/ai/ask', async (req: Request, res: Response) => {
    try {
        const userId = getUserId(req);
        const organizationId = getOrganizationId(req);
        if (!userId || !organizationId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const { query, entity_type, entity_id } = req.body;
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'query is required' });
        }

        // Build context
        const crmContext = await buildCRMContext(organizationId);
        let entityContext = '';
        if (entity_type && entity_id) {
            entityContext = await fetchEntityDetail(entity_type, entity_id, organizationId);
        }

        const fullContext = `${CRM_AI_SYSTEM_PROMPT}\n\n${crmContext}${entityContext ? `\n\nFOCUSED ENTITY:\n${entityContext}` : ''}`;

        // Try Gemini (primary)
        const geminiKey = config.gemini?.apiKey;
        const geminiUrl = config.gemini?.apiUrl;

        let response: any;

        if (geminiKey && geminiUrl) {
            try {
                const geminiResp = await axios.post(
                    `${geminiUrl}?key=${geminiKey}`,
                    {
                        system_instruction: { parts: { text: fullContext } },
                        contents: [{ parts: [{ text: query }] }],
                        generationConfig: { temperature: 0.2, response_mime_type: 'application/json' },
                    },
                    { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
                );

                let rawText = geminiResp.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (rawText) {
                    rawText = rawText.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
                    response = JSON.parse(rawText);
                }
            } catch (err: any) {
                logger.warn('CRM AI: Gemini failed, using fallback', { error: err.message });
            }
        }

        // Fallback: rule-based
        if (!response) {
            response = buildRuleBasedResponse(query, crmContext, entityContext);
        }

        res.json({
            answer: response.answer || 'I could not process that query.',
            confidence: response.confidence || 0.5,
            sources: response.sources || ['CRM Database'],
            suggestions: response.suggestions || response.followUpSuggestions || [],
            data_points: response.data_points || response.dataPoints || [],
            actions: response.actions || [],
        });
    } catch (error: any) {
        logger.error('CRM AI query error', { error: error.message });
        res.status(500).json({ error: 'AI query failed' });
    }
});

function buildRuleBasedResponse(query: string, crmContext: string, entityContext: string): any {
    const q = query.toLowerCase();

    // Extract data points from context for simple questions
    if (q.includes('pipeline') && (q.includes('value') || q.includes('worth'))) {
        const match = crmContext.match(/Pipeline value: GHS ([\d,]+)/);
        return {
            answer: `Based on current data, your total pipeline value is **GHS ${match?.[1] || 'N/A'}**.\n\n${crmContext.split('\n').filter(l => l.includes('Pipeline stages')).join('\n')}`,
            confidence: 0.7,
            sources: ['CRM Database'],
            suggestions: ['Show me deals closing this month', 'Who are the top agents?'],
        };
    }

    if (q.includes('agent') || q.includes('top performer') || q.includes('leaderboard')) {
        const agentLine = crmContext.split('\n').find(l => l.includes('Top agents'));
        return {
            answer: `**Agent Performance:**\n\n${agentLine || 'No agent data available'}`,
            confidence: 0.7,
            sources: ['CRM Database'],
            suggestions: ['Show pipeline by stage', 'What deals are at risk?'],
        };
    }

    if (entityContext) {
        return {
            answer: `Here's what I know:\n\n${entityContext}\n\n*AI service is in offline mode. Showing raw data.*`,
            confidence: 0.5,
            sources: ['CRM Database (AI Offline)'],
            suggestions: ['Tell me about the pipeline', 'Show recent activity'],
        };
    }

    return {
        answer: `I'm analyzing your CRM data. Here's a summary:\n\n${crmContext}\n\n*Note: Full AI analysis requires the AI service to be online.*`,
        confidence: 0.4,
        sources: ['CRM Database (AI Offline)'],
        suggestions: ['What is my pipeline value?', 'Show top agents', 'Show deals at risk'],
    };
}

// =====================================================
// SUGGESTIONS
// =====================================================

/**
 * GET /ai/suggestions
 * Pre-built CRM-specific prompt suggestions
 */
router.get('/ai/suggestions', (_req: Request, res: Response) => {
    res.json({
        categories: [
            {
                label: 'Pipeline',
                prompts: [
                    "What's my total pipeline value?",
                    'Show me deals closing this week',
                    'Which pipeline stage has the most deals?',
                    'What is the average deal size?',
                ],
            },
            {
                label: 'Performance',
                prompts: [
                    'Who are the top performing agents?',
                    "What's our win rate this month?",
                    'How does this month compare to last month?',
                    'Which deal type has the highest conversion?',
                ],
            },
            {
                label: 'Contacts',
                prompts: [
                    'How many qualified leads do we have?',
                    'Show me contacts that need follow-up',
                    'Which contacts have the highest lead scores?',
                    'How many new contacts this month?',
                ],
            },
            {
                label: 'Analysis',
                prompts: [
                    "What are the top reasons we're losing deals?",
                    'Which deals are at risk of stalling?',
                    'What is our average days to close?',
                    'Show me revenue forecast for next quarter',
                ],
            },
        ],
    });
});

// =====================================================
// NEXT BEST ACTION
// =====================================================

/**
 * GET /ai/next-actions/:dealId
 * Returns AI-suggested next actions for a deal
 */
router.get('/ai/next-actions/:dealId', async (req: Request, res: Response) => {
    try {
        const organizationId = getOrganizationId(req);
        if (!organizationId) return res.status(401).json({ error: 'Organization required' });

        const { dealId } = req.params;

        // Fetch deal with stage + last activity
        const dealResult = await pool.query(
            `SELECT d.*, ps.stage_name, ps.probability, ps.sla_days,
                    c.first_name || ' ' || c.last_name as contact_name,
                    c.email as contact_email, c.primary_phone as contact_phone,
                    (SELECT MAX(created_at) FROM deal_activities WHERE deal_id = d.id) as last_activity_at,
                    (SELECT COUNT(*) FROM crm_tasks WHERE deal_id = d.id AND status = 'pending') as pending_tasks,
                    (SELECT COUNT(*) FROM crm_documents WHERE entity_id = d.id::text) as doc_count
             FROM crm_deals d
             LEFT JOIN crm_pipeline_stages ps ON ps.id = d.stage_id
             LEFT JOIN crm_contacts c ON c.id = d.primary_contact_id
             WHERE d.id = $1 AND d.organization_id = $2`,
            [dealId, organizationId]
        );

        const deal = dealResult.rows[0];
        if (!deal) return res.status(404).json({ error: 'Deal not found' });

        const actions: Array<{ type: string; priority: 'high' | 'medium' | 'low'; title: string; description: string }> = [];

        const daysSinceActivity = deal.last_activity_at
            ? Math.floor((Date.now() - new Date(deal.last_activity_at).getTime()) / 86400000)
            : 999;

        // SLA breach
        if (deal.sla_days && deal.stage_duration && deal.stage_duration > deal.sla_days) {
            actions.push({
                type: 'escalate',
                priority: 'high',
                title: 'Stage SLA breached',
                description: `Deal has been in "${deal.stage_name}" for ${deal.stage_duration} days (SLA: ${deal.sla_days} days). Consider escalating or moving forward.`,
            });
        }

        // Stale deal
        if (daysSinceActivity > 7) {
            actions.push({
                type: 'follow_up',
                priority: daysSinceActivity > 14 ? 'high' : 'medium',
                title: 'Follow up needed',
                description: `No activity in ${daysSinceActivity} days. Reach out to ${deal.contact_name || 'contact'}${deal.contact_phone ? ` at ${deal.contact_phone}` : ''}.`,
            });
        }

        // Pending tasks
        if (deal.pending_tasks > 0) {
            actions.push({
                type: 'task',
                priority: 'medium',
                title: `Complete ${deal.pending_tasks} pending task(s)`,
                description: `There are ${deal.pending_tasks} tasks that need attention before this deal can progress.`,
            });
        }

        // Missing documents at later stages
        if (deal.probability && deal.probability >= 50 && deal.doc_count < 2) {
            actions.push({
                type: 'document',
                priority: 'medium',
                title: 'Prepare documents',
                description: `Deal is at ${deal.probability}% probability but only has ${deal.doc_count} documents. Consider preparing contract/agreement.`,
            });
        }

        // Close date approaching
        if (deal.estimated_close_date) {
            const daysUntilClose = Math.floor((new Date(deal.estimated_close_date).getTime() - Date.now()) / 86400000);
            if (daysUntilClose <= 7 && daysUntilClose >= 0) {
                actions.push({
                    type: 'close',
                    priority: 'high',
                    title: 'Expected close date approaching',
                    description: `Deal is expected to close in ${daysUntilClose} days. Ensure all requirements are met.`,
                });
            } else if (daysUntilClose < 0) {
                actions.push({
                    type: 'overdue',
                    priority: 'high',
                    title: 'Past expected close date',
                    description: `Deal was expected to close ${Math.abs(daysUntilClose)} days ago. Update close date or reassess.`,
                });
            }
        }

        // No contact info
        if (!deal.contact_email && !deal.contact_phone) {
            actions.push({
                type: 'contact',
                priority: 'low',
                title: 'Add contact information',
                description: 'No direct contact method available. Consider adding email or phone number.',
            });
        }

        // Sort by priority
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

        res.json({ deal_id: dealId, stage: deal.stage_name, actions });
    } catch (error: any) {
        logger.error('Next actions error', { error: error.message });
        res.status(500).json({ error: 'Failed to compute next actions' });
    }
});

// =====================================================
// SMART DEAL SCORING
// =====================================================

/**
 * GET /ai/deal-score/:dealId
 * Returns enhanced AI-computed deal score
 */
router.get('/ai/deal-score/:dealId', async (req: Request, res: Response) => {
    try {
        const organizationId = getOrganizationId(req);
        if (!organizationId) return res.status(401).json({ error: 'Organization required' });

        const { dealId } = req.params;

        const result = await pool.query(
            `SELECT d.*,
                    ps.probability as stage_probability,
                    (SELECT COUNT(*) FROM deal_activities WHERE deal_id = d.id AND created_at > NOW() - INTERVAL '14 days') as recent_activities,
                    (SELECT COUNT(*) FROM crm_documents WHERE entity_id = d.id::text) as doc_count,
                    (SELECT AVG(days_in_pipeline) FROM crm_deals WHERE organization_id = $2 AND deal_status = 'won' AND deal_type = d.deal_type) as avg_won_days,
                    (SELECT
                       CASE WHEN COUNT(*) > 0
                         THEN COUNT(*) FILTER (WHERE deal_status = 'won')::float / COUNT(*)
                         ELSE 0
                       END
                     FROM crm_deals
                     WHERE assigned_agent = d.assigned_agent AND organization_id = $2 AND deal_status IN ('won', 'lost')
                    ) as agent_win_rate
             FROM crm_deals d
             LEFT JOIN crm_pipeline_stages ps ON ps.id = d.stage_id
             WHERE d.id = $1 AND d.organization_id = $2`,
            [dealId, organizationId]
        );

        const deal = result.rows[0];
        if (!deal) return res.status(404).json({ error: 'Deal not found' });

        // Enhanced scoring formula
        const w1 = 0.30; // Stage probability
        const w2 = 0.20; // Agent win rate
        const w3 = 0.20; // Engagement (recent activities)
        const w4 = 0.15; // Time factor (penalize overdue)
        const w5 = 0.15; // Document completeness

        const stageProbScore = (deal.stage_probability || 0) / 100;

        const agentWinScore = Math.min(deal.agent_win_rate || 0, 1);

        const engagementScore = Math.min((deal.recent_activities || 0) / 5, 1); // 5+ activities in 14d = 100%

        // Time factor: penalize if taking much longer than average
        let timeFactor = 1;
        if (deal.avg_won_days && deal.days_in_pipeline) {
            const ratio = deal.days_in_pipeline / deal.avg_won_days;
            timeFactor = ratio <= 1 ? 1 : Math.max(0.3, 1 - (ratio - 1) * 0.3);
        }

        const docScore = Math.min((deal.doc_count || 0) / 3, 1); // 3+ docs = 100%

        const totalScore = Math.round(
            (w1 * stageProbScore + w2 * agentWinScore + w3 * engagementScore + w4 * timeFactor + w5 * docScore) * 100
        );

        const factors = [
            { factor: 'Stage Probability', weight: w1, score: Math.round(stageProbScore * 100), detail: `${deal.stage_probability || 0}%` },
            { factor: 'Agent Win Rate', weight: w2, score: Math.round(agentWinScore * 100), detail: `${((deal.agent_win_rate || 0) * 100).toFixed(1)}%` },
            { factor: 'Engagement', weight: w3, score: Math.round(engagementScore * 100), detail: `${deal.recent_activities || 0} activities in 14d` },
            { factor: 'Time Factor', weight: w4, score: Math.round(timeFactor * 100), detail: `${deal.days_in_pipeline || 0}d / avg ${Math.round(deal.avg_won_days || 0)}d` },
            { factor: 'Documents', weight: w5, score: Math.round(docScore * 100), detail: `${deal.doc_count || 0} docs` },
        ];

        const health = totalScore >= 70 ? 'healthy' : totalScore >= 40 ? 'at_risk' : 'critical';

        res.json({ deal_id: dealId, score: totalScore, health, factors });
    } catch (error: any) {
        logger.error('Deal score error', { error: error.message });
        res.status(500).json({ error: 'Failed to compute deal score' });
    }
});

export default router;
