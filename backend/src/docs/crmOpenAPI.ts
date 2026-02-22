/**
 * CRM API — OpenAPI 3.0 Specification
 *
 * Documents all CRM endpoints grouped by tag:
 *   - Contacts, Deals, Companies, Agents, Pipelines
 *   - Tasks, Notes, Documents, Signatures
 *   - AI Assistant, Email Integration
 *   - Property Matching, Stacking Plans
 *   - Analytics, Commissions, Payments
 *
 * This is a hand-written spec (not generated from Zod) because
 * CRM routes use raw SQL + Express — no Zod schemas in the route layer.
 */

export function getCrmOpenAPISpec(): Record<string, any> {
    return {
        tags: [
            { name: 'CRM Contacts', description: 'Contact management, deduplication, and merge' },
            { name: 'CRM Deals', description: 'Deal pipeline management' },
            { name: 'CRM Companies', description: 'Company management' },
            { name: 'CRM Properties', description: 'CRM property listings' },
            { name: 'CRM Tasks', description: 'Task management for deals and contacts' },
            { name: 'CRM AI', description: 'Kobby AI CRM intelligence assistant' },
            { name: 'CRM Email', description: 'Gmail/Outlook email integration' },
            { name: 'CRM Property Match', description: 'Auto-match contacts ↔ properties' },
            { name: 'CRM Stacking Plans', description: 'Building floor/unit visualization' },
            { name: 'CRM Analytics', description: 'Pipeline analytics and reporting' },
            { name: 'CRM Pipelines', description: 'Pipeline and stage configuration' },
        ],
        paths: {
            // ═══════════════════════════════════════════════
            // CONTACTS
            // ═══════════════════════════════════════════════
            '/api/v1/crm/contacts': {
                get: {
                    tags: ['CRM Contacts'],
                    summary: 'List contacts',
                    description: 'Get paginated list of contacts with optional filters',
                    security: [{ bearerAuth: [], organizationId: [] }],
                    parameters: [
                        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
                        { name: 'search', in: 'query', schema: { type: 'string' } },
                        { name: 'status', in: 'query', schema: { type: 'string', enum: ['new', 'contacted', 'qualified', 'unqualified', 'nurturing'] } },
                        { name: 'type', in: 'query', schema: { type: 'string' } },
                        { name: 'sortBy', in: 'query', schema: { type: 'string', default: 'created_at' } },
                    ],
                    responses: {
                        200: { description: 'Paginated contact list', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaginatedContacts' } } } },
                    },
                },
                post: {
                    tags: ['CRM Contacts'],
                    summary: 'Create contact',
                    security: [{ bearerAuth: [], organizationId: [] }],
                    requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ContactInput' } } } },
                    responses: { 201: { description: 'Created contact' } },
                },
            },
            '/api/v1/crm/contacts/{id}': {
                get: { tags: ['CRM Contacts'], summary: 'Get contact by ID', security: [{ bearerAuth: [], organizationId: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Contact details' }, 404: { description: 'Not found' } } },
                put: { tags: ['CRM Contacts'], summary: 'Update contact', security: [{ bearerAuth: [], organizationId: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Updated contact' } } },
                delete: { tags: ['CRM Contacts'], summary: 'Delete contact', security: [{ bearerAuth: [], organizationId: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 204: { description: 'Deleted' } } },
            },
            '/api/v1/crm/contacts/duplicates': {
                get: { tags: ['CRM Contacts'], summary: 'Find duplicate contacts', description: 'Finds potential duplicate contacts by email, phone, or name match', security: [{ bearerAuth: [], organizationId: [] }], parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } }, { name: 'min_confidence', in: 'query', schema: { type: 'number', default: 0.5 } }], responses: { 200: { description: 'Duplicate groups' } } },
            },
            '/api/v1/crm/contacts/merge': {
                post: { tags: ['CRM Contacts'], summary: 'Merge two contacts', description: 'Merge duplicate contact into survivor, transferring all relationships', security: [{ bearerAuth: [], organizationId: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['survivor_id', 'duplicate_id'], properties: { survivor_id: { type: 'string', format: 'uuid' }, duplicate_id: { type: 'string', format: 'uuid' }, use_duplicate_fields: { type: 'array', items: { type: 'string' } } } } } } }, responses: { 200: { description: 'Merge result with transfer counts' } } },
            },

            // ═══════════════════════════════════════════════
            // DEALS
            // ═══════════════════════════════════════════════
            '/api/v1/crm/deals': {
                get: { tags: ['CRM Deals'], summary: 'List deals', security: [{ bearerAuth: [], organizationId: [] }], responses: { 200: { description: 'Deal list' } } },
                post: { tags: ['CRM Deals'], summary: 'Create deal', security: [{ bearerAuth: [], organizationId: [] }], responses: { 201: { description: 'Created deal' } } },
            },
            '/api/v1/crm/deals/{id}': {
                get: { tags: ['CRM Deals'], summary: 'Get deal by ID', security: [{ bearerAuth: [], organizationId: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Deal details' } } },
                put: { tags: ['CRM Deals'], summary: 'Update deal', security: [{ bearerAuth: [], organizationId: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Updated deal' } } },
            },

            // ═══════════════════════════════════════════════
            // PROPERTIES
            // ═══════════════════════════════════════════════
            '/api/v1/crm/properties': {
                get: { tags: ['CRM Properties'], summary: 'List CRM properties', security: [{ bearerAuth: [], organizationId: [] }], responses: { 200: { description: 'Property list' } } },
                post: { tags: ['CRM Properties'], summary: 'Create CRM property', security: [{ bearerAuth: [], organizationId: [] }], responses: { 201: { description: 'Created property' } } },
            },

            // ═══════════════════════════════════════════════
            // AI ASSISTANT
            // ═══════════════════════════════════════════════
            '/api/v1/crm/ai/ask': {
                post: {
                    tags: ['CRM AI'],
                    summary: 'Ask Kobby AI a CRM question',
                    description: 'Natural language query about pipeline, deals, contacts, agents, or performance. Powered by Google Gemini with rule-based fallback.',
                    security: [{ bearerAuth: [], organizationId: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['query'],
                                    properties: {
                                        query: { type: 'string', description: 'Natural language query', example: "What's my total pipeline value?" },
                                        entity_type: { type: 'string', enum: ['deal', 'contact'], description: 'Optional entity context' },
                                        entity_id: { type: 'string', format: 'uuid' },
                                    },
                                },
                            },
                        },
                    },
                    responses: {
                        200: {
                            description: 'AI response',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            answer: { type: 'string' },
                                            confidence: { type: 'number' },
                                            sources: { type: 'array', items: { type: 'string' } },
                                            suggestions: { type: 'array', items: { type: 'string' } },
                                            data_points: { type: 'array', items: { type: 'object', properties: { metric: { type: 'string' }, value: { type: 'string' } } } },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            '/api/v1/crm/ai/suggestions': {
                get: { tags: ['CRM AI'], summary: 'Get AI suggestion prompts', security: [{ bearerAuth: [], organizationId: [] }], responses: { 200: { description: 'Categorized suggestion prompts' } } },
            },
            '/api/v1/crm/ai/next-actions/{dealId}': {
                get: { tags: ['CRM AI'], summary: 'Get next best actions for a deal', security: [{ bearerAuth: [], organizationId: [] }], parameters: [{ name: 'dealId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Prioritized action list' } } },
            },
            '/api/v1/crm/ai/deal-score/{dealId}': {
                get: { tags: ['CRM AI'], summary: 'Get AI-enhanced deal score', description: 'Multi-factor scoring: stage probability, agent win rate, engagement, time factor, document completeness', security: [{ bearerAuth: [], organizationId: [] }], parameters: [{ name: 'dealId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Deal score with factor breakdown' } } },
            },

            // ═══════════════════════════════════════════════
            // EMAIL INTEGRATION
            // ═══════════════════════════════════════════════
            '/api/v1/crm/emails/auth/{provider}': {
                get: { tags: ['CRM Email'], summary: 'Get OAuth URL for email provider', parameters: [{ name: 'provider', in: 'path', required: true, schema: { type: 'string', enum: ['gmail', 'outlook'] } }], security: [{ bearerAuth: [], organizationId: [] }], responses: { 200: { description: 'OAuth consent URL' } } },
            },
            '/api/v1/crm/emails/status': {
                get: { tags: ['CRM Email'], summary: 'Get email connection status', security: [{ bearerAuth: [], organizationId: [] }], responses: { 200: { description: 'Connection status per provider' } } },
            },
            '/api/v1/crm/emails/sync': {
                post: { tags: ['CRM Email'], summary: 'Trigger email sync', security: [{ bearerAuth: [], organizationId: [] }], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { provider: { type: 'string', enum: ['gmail', 'outlook'] }, maxResults: { type: 'integer', default: 50 } } } } } }, responses: { 200: { description: 'Sync result' } } },
            },
            '/api/v1/crm/emails': {
                get: { tags: ['CRM Email'], summary: 'List synced emails', security: [{ bearerAuth: [], organizationId: [] }], parameters: [{ name: 'deal_id', in: 'query', schema: { type: 'string' } }, { name: 'contact_id', in: 'query', schema: { type: 'string' } }, { name: 'direction', in: 'query', schema: { type: 'string', enum: ['inbound', 'outbound'] } }], responses: { 200: { description: 'Email list' } } },
            },
            '/api/v1/crm/emails/send': {
                post: { tags: ['CRM Email'], summary: 'Send email', security: [{ bearerAuth: [], organizationId: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['provider', 'to', 'subject', 'body_html'], properties: { provider: { type: 'string', enum: ['gmail', 'outlook'] }, to: { type: 'array', items: { type: 'string' } }, cc: { type: 'array', items: { type: 'string' } }, subject: { type: 'string' }, body_html: { type: 'string' }, deal_id: { type: 'string' }, contact_id: { type: 'string' } } } } } }, responses: { 200: { description: 'Sent email record' } } },
            },

            // ═══════════════════════════════════════════════
            // PROPERTY MATCHING
            // ═══════════════════════════════════════════════
            '/api/v1/crm/contacts/{id}/match-properties': {
                get: { tags: ['CRM Property Match'], summary: 'Find matching properties for a contact', description: 'Scores properties against contact budget, location, type, and specification preferences', security: [{ bearerAuth: [], organizationId: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }, { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }, { name: 'min_score', in: 'query', schema: { type: 'integer', default: 20 } }], responses: { 200: { description: 'Scored property matches' } } },
            },
            '/api/v1/crm/properties/{id}/match-contacts': {
                get: { tags: ['CRM Property Match'], summary: 'Find matching contacts for a property', security: [{ bearerAuth: [], organizationId: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Scored contact matches' } } },
            },

            // ═══════════════════════════════════════════════
            // STACKING PLANS
            // ═══════════════════════════════════════════════
            '/api/v1/crm/properties/{propertyId}/stacking-plan': {
                get: { tags: ['CRM Stacking Plans'], summary: 'Get stacking plan for a property', description: 'Returns floor-by-floor building data with units, occupancy, and revenue', security: [{ bearerAuth: [], organizationId: [] }], parameters: [{ name: 'propertyId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Full stacking plan with summary' } } },
            },
            '/api/v1/crm/properties/{propertyId}/stacking-plan/floors': {
                post: { tags: ['CRM Stacking Plans'], summary: 'Add or update a floor', security: [{ bearerAuth: [], organizationId: [] }], responses: { 201: { description: 'Floor record' } } },
            },
            '/api/v1/crm/properties/{propertyId}/stacking-plan/units': {
                post: { tags: ['CRM Stacking Plans'], summary: 'Add or update a unit', security: [{ bearerAuth: [], organizationId: [] }], responses: { 201: { description: 'Unit record' } } },
            },

            // ═══════════════════════════════════════════════
            // PIPELINES
            // ═══════════════════════════════════════════════
            '/api/v1/crm/pipelines': {
                get: { tags: ['CRM Pipelines'], summary: 'List pipelines', security: [{ bearerAuth: [], organizationId: [] }], responses: { 200: { description: 'Pipeline list with stages' } } },
                post: { tags: ['CRM Pipelines'], summary: 'Create pipeline', security: [{ bearerAuth: [], organizationId: [] }], responses: { 201: { description: 'Created pipeline' } } },
            },

            // ═══════════════════════════════════════════════
            // ANALYTICS
            // ═══════════════════════════════════════════════
            '/api/v1/crm/analytics/overview': {
                get: { tags: ['CRM Analytics'], summary: 'Get CRM analytics overview', security: [{ bearerAuth: [], organizationId: [] }], responses: { 200: { description: 'Dashboard metrics' } } },
            },
            '/api/v1/crm/analytics/pipeline': {
                get: { tags: ['CRM Analytics'], summary: 'Pipeline funnel analytics', security: [{ bearerAuth: [], organizationId: [] }], responses: { 200: { description: 'Pipeline stage metrics' } } },
            },
            '/api/v1/crm/analytics/agent-performance': {
                get: { tags: ['CRM Analytics'], summary: 'Agent performance metrics', security: [{ bearerAuth: [], organizationId: [] }], responses: { 200: { description: 'Agent leaderboard data' } } },
            },
        },
        components: {
            schemas: {
                ContactInput: {
                    type: 'object',
                    required: ['first_name', 'last_name'],
                    properties: {
                        first_name: { type: 'string' },
                        last_name: { type: 'string' },
                        email: { type: 'string', format: 'email' },
                        primary_phone: { type: 'string' },
                        contact_type: { type: 'string', enum: ['first_time_buyer', 'repeat_buyer', 'investor', 'developer', 'diaspora_buyer', 'tenant', 'landlord'] },
                        lead_status: { type: 'string', enum: ['new', 'contacted', 'qualified', 'unqualified', 'nurturing'] },
                        budget_min: { type: 'number' },
                        budget_max: { type: 'number' },
                        preferred_locations: { type: 'array', items: { type: 'string' } },
                        preferred_property_types: { type: 'array', items: { type: 'string' } },
                        tags: { type: 'array', items: { type: 'string' } },
                    },
                },
                PaginatedContacts: {
                    type: 'object',
                    properties: {
                        contacts: { type: 'array', items: { $ref: '#/components/schemas/ContactInput' } },
                        total: { type: 'integer' },
                        page: { type: 'integer' },
                        limit: { type: 'integer' },
                    },
                },
            },
        },
    };
}
