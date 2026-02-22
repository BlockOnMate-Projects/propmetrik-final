/**
 * CRM Global Search Route
 *
 * Searches across deals, contacts, companies, and properties
 * using ILIKE for broad matching.
 *
 * GET /api/v1/crm/search?q=term&types=deals,contacts,companies,properties&limit=10
 */

import { Router, Request, Response } from 'express';
import { getOrganizationId, asyncHandler } from './helpers';
import db from '../../database';

const router = Router();

interface SearchResult {
    id: string;
    type: 'deal' | 'contact' | 'company' | 'property';
    title: string;
    subtitle: string;
    meta?: Record<string, any>;
}

router.get('/search', asyncHandler(async (req: Request, res: Response) => {
    const organizationId = await getOrganizationId(req);
    if (!organizationId || organizationId === '00000000-0000-0000-0000-000000000000') {
        return res.status(401).json({ error: 'Organization not found' });
    }

    const q = (req.query.q as string || '').trim();
    if (!q || q.length < 2) {
        return res.json({ results: [], total: 0 });
    }

    const typesParam = (req.query.types as string || 'deals,contacts,companies,properties').split(',');
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const pattern = `%${q}%`;

    const results: SearchResult[] = [];

    // Deals
    if (typesParam.includes('deals')) {
        try {
            const deals = await db.query(
                `SELECT id, title, deal_type, deal_status, deal_value, currency
                 FROM deals
                 WHERE organization_id = $1 AND deleted_at IS NULL
                   AND (title ILIKE $2 OR description ILIKE $2 OR lead_source ILIKE $2)
                 ORDER BY updated_at DESC LIMIT $3`,
                [organizationId, pattern, limit]
            );
            for (const d of deals.rows) {
                results.push({
                    id: d.id,
                    type: 'deal',
                    title: d.title,
                    subtitle: `${d.deal_type} • ${d.deal_status}`,
                    meta: { deal_value: d.deal_value, currency: d.currency },
                });
            }
        } catch { /* table may not exist */ }
    }

    // Contacts
    if (typesParam.includes('contacts')) {
        try {
            const contacts = await db.query(
                `SELECT id, first_name, last_name, email, phone_primary, contact_type
                 FROM contacts
                 WHERE organization_id = $1 AND deleted_at IS NULL
                   AND (first_name ILIKE $2 OR last_name ILIKE $2 OR email ILIKE $2 OR phone_primary ILIKE $2
                        OR CONCAT(first_name, ' ', last_name) ILIKE $2)
                 ORDER BY updated_at DESC LIMIT $3`,
                [organizationId, pattern, limit]
            );
            for (const c of contacts.rows) {
                results.push({
                    id: c.id,
                    type: 'contact',
                    title: `${c.first_name} ${c.last_name}`.trim(),
                    subtitle: c.email || c.phone_primary || c.contact_type || '',
                });
            }
        } catch { /* table may not exist */ }
    }

    // Companies
    if (typesParam.includes('companies')) {
        try {
            const companies = await db.query(
                `SELECT id, company_name, industry, website
                 FROM companies
                 WHERE organization_id = $1 AND deleted_at IS NULL
                   AND (company_name ILIKE $2 OR industry ILIKE $2 OR website ILIKE $2)
                 ORDER BY updated_at DESC LIMIT $3`,
                [organizationId, pattern, limit]
            );
            for (const co of companies.rows) {
                results.push({
                    id: co.id,
                    type: 'company',
                    title: co.company_name,
                    subtitle: co.industry || co.website || '',
                });
            }
        } catch { /* table may not exist */ }
    }

    // Properties
    if (typesParam.includes('properties')) {
        try {
            const properties = await db.query(
                `SELECT id, property_name, address, city, property_type, price, currency
                 FROM properties
                 WHERE organization_id = $1 AND deleted_at IS NULL
                   AND (property_name ILIKE $2 OR address ILIKE $2 OR city ILIKE $2)
                 ORDER BY updated_at DESC LIMIT $3`,
                [organizationId, pattern, limit]
            );
            for (const p of properties.rows) {
                results.push({
                    id: p.id,
                    type: 'property',
                    title: p.property_name,
                    subtitle: `${p.city || ''} • ${p.property_type || ''}`,
                    meta: { price: p.price, currency: p.currency },
                });
            }
        } catch { /* table may not exist */ }
    }

    res.json({ results: results.slice(0, limit * 2), total: results.length });
}));

export default router;
