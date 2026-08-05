/**
 * Contact Service
 * Phase 5.2: CRM Service Layer
 * 
 * Handles all contact-related operations with organization scoping and soft deletes
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../../database';
import { buildCrmOrderBy } from './queryHelpers';
import { logger } from '../../utils/logger';
import {
    Contact,
    CreateContactInput,
    UpdateContactInput,
    ContactFilters,
    PaginatedResponse,
} from './types';

export class ContactService {
    /**
     * Create a new contact
     */
    async createContact(
        organizationId: string,
        data: CreateContactInput,
        userId?: string
    ): Promise<Contact> {
        const id = uuidv4();

        try {
            const result = await db.query<Contact>(
                `INSERT INTO contacts (
          id, organization_id, first_name, last_name, other_names,
          primary_phone, email, whatsapp_number, contact_type, lead_source,
          region, city, digital_address, occupation, budget_min, budget_max,
          preferred_locations, assigned_to, notes, tags, lead_status,
          qualification_level, lead_score, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
        ) RETURNING *`,
                [
                    id,
                    organizationId,
                    data.first_name,
                    data.last_name,
                    data.other_names || null,
                    data.primary_phone,
                    data.email || null,
                    data.whatsapp_number || null,
                    data.contact_type,
                    data.lead_source || null,
                    data.region || null,
                    data.city || null,
                    data.digital_address || null,
                    data.occupation || null,
                    data.budget_min || null,
                    data.budget_max || null,
                    data.preferred_locations || null,
                    data.assigned_to || null,
                    data.notes || null,
                    data.tags || null,
                    'new', // Default lead_status
                    'unqualified', // Default qualification
                    0, // Default lead_score
                    userId || null,
                ]
            );

            const contact = result.rows[0];
            logger.info('Contact created', { contactId: id, organizationId });

            // Track contribution for Data Hub
            try {
                const { ServiceHooks } = await import('../data-hub/serviceHooks');
                await ServiceHooks.createContribution({
                    contributor_id: userId || null,
                    organization_id: organizationId,
                    contribution_type: 'crm_contact',
                    source_context: 'crm',
                    source_id: id,
                    data: {
                        contact_id: id,
                        contact_name: `${data.first_name} ${data.last_name}`,
                        contact_type: data.contact_type,
                        action: 'contact_creation',
                    },
                });
            } catch (hookError) {
                logger.error('Failed to create contact contribution hook', hookError);
            }

            return contact;
        } catch (error) {
            logger.error('Error creating contact', { error, organizationId });
            throw error;
        }
    }

    /**
     * Get contact by ID with organization scoping
     */
    async getContactById(contactId: string, organizationId: string): Promise<Contact | null> {
        try {
            const result = await db.query<Contact>(
                `SELECT c.*, comp.company_name
         FROM contacts c
         LEFT JOIN companies comp ON c.company_id = comp.id
         WHERE c.id = $1 AND c.organization_id = $2 AND c.deleted_at IS NULL`,
                [contactId, organizationId]
            );

            return result.rows[0] || null;
        } catch (error) {
            logger.error('Error fetching contact', { error, contactId, organizationId });
            throw error;
        }
    }

    /**
     * List contacts with filters and pagination
     */
    async listContacts(
        organizationId: string,
        filters: ContactFilters = {}
    ): Promise<PaginatedResponse<Contact>> {
        try {
            const page = filters.page || 1;
            const limit = filters.limit || 50;
            const offset = (page - 1) * limit;

            // Build WHERE conditions
            const conditions: string[] = ['c.organization_id = $1', 'c.deleted_at IS NULL'];
            const params: any[] = [organizationId];
            let paramIndex = 2;

            if (filters.search) {
                conditions.push(`(
          c.search_vector @@ plainto_tsquery('english', $${paramIndex})
          OR c.primary_phone LIKE $${paramIndex + 1}
          OR c.email ILIKE $${paramIndex + 2}
        )`);
                params.push(filters.search, `%${filters.search}%`, `%${filters.search}%`);
                paramIndex += 3;
            }

            if (filters.contact_type) {
                conditions.push(`c.contact_type = $${paramIndex}`);
                params.push(filters.contact_type);
                paramIndex++;
            }

            if (filters.lead_status) {
                conditions.push(`c.lead_status = $${paramIndex}`);
                params.push(filters.lead_status);
                paramIndex++;
            }

            if (filters.assigned_to) {
                conditions.push(`c.assigned_to = $${paramIndex}`);
                params.push(filters.assigned_to);
                paramIndex++;
            }

            if (filters.region) {
                conditions.push(`c.region = $${paramIndex}`);
                params.push(filters.region);
                paramIndex++;
            }

            if (filters.lead_score_min !== undefined) {
                conditions.push(`c.lead_score >= $${paramIndex}`);
                params.push(filters.lead_score_min);
                paramIndex++;
            }

            if (filters.lead_score_max !== undefined) {
                conditions.push(`c.lead_score <= $${paramIndex}`);
                params.push(filters.lead_score_max);
                paramIndex++;
            }

            if (filters.tags && filters.tags.length > 0) {
                conditions.push(`c.tags && $${paramIndex}`);
                params.push(filters.tags);
                paramIndex++;
            }

            const whereClause = conditions.join(' AND ');

            // Order by
            const orderBy = buildCrmOrderBy(
                'c',
                ['created_at', 'updated_at', 'first_name', 'last_name', 'email', 'lead_score'],
                filters.sort_by,
                'created_at',
                filters.sort_order,
                'desc',
            );

            // Get total count
            const countResult = await db.query(
                `SELECT COUNT(*) as total FROM contacts c WHERE ${whereClause}`,
                params
            );
            const total = parseInt(countResult.rows[0].total, 10);

            // Get paginated data
            const dataParams = [...params, limit, offset];
            const result = await db.query<Contact>(
                `SELECT c.*, comp.company_name
         FROM contacts c
         LEFT JOIN companies comp ON c.company_id = comp.id
         WHERE ${whereClause}
         ORDER BY ${orderBy}
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
                dataParams
            );

            return {
                data: result.rows,
                pagination: {
                    total,
                    page,
                    limit,
                    total_pages: Math.ceil(total / limit),
                },
            };
        } catch (error) {
            logger.error('Error listing contacts', { error, organizationId });
            throw error;
        }
    }

    /**
     * Update contact
     */
    async updateContact(
        contactId: string,
        organizationId: string,
        data: UpdateContactInput,
        userId?: string
    ): Promise<Contact> {
        try {
            // Build SET clause dynamically
            const updates: string[] = [];
            const params: any[] = [];
            let paramIndex = 1;

            if (data.first_name !== undefined) {
                updates.push(`first_name = $${paramIndex}`);
                params.push(data.first_name);
                paramIndex++;
            }

            if (data.last_name !== undefined) {
                updates.push(`last_name = $${paramIndex}`);
                params.push(data.last_name);
                paramIndex++;
            }

            if (data.other_names !== undefined) {
                updates.push(`other_names = $${paramIndex}`);
                params.push(data.other_names);
                paramIndex++;
            }

            if (data.primary_phone !== undefined) {
                updates.push(`primary_phone = $${paramIndex}`);
                params.push(data.primary_phone);
                paramIndex++;
            }

            if (data.email !== undefined) {
                updates.push(`email = $${paramIndex}`);
                params.push(data.email);
                paramIndex++;
            }

            if (data.whatsapp_number !== undefined) {
                updates.push(`whatsapp_number = $${paramIndex}`);
                params.push(data.whatsapp_number);
                paramIndex++;
            }

            if (data.lead_status !== undefined) {
                updates.push(`lead_status = $${paramIndex}`);
                params.push(data.lead_status);
                paramIndex++;
            }

            if (data.lead_score !== undefined) {
                updates.push(`lead_score = $${paramIndex}`);
                params.push(data.lead_score);
                paramIndex++;
            }

            if (data.qualification_level !== undefined) {
                updates.push(`qualification_level = $${paramIndex}`);
                params.push(data.qualification_level);
                paramIndex++;
            }

            if (data.assigned_to !== undefined) {
                updates.push(`assigned_to = $${paramIndex}`);
                params.push(data.assigned_to);
                paramIndex++;
            }

            if (data.notes !== undefined) {
                updates.push(`notes = $${paramIndex}`);
                params.push(data.notes);
                paramIndex++;
            }

            if (data.tags !== undefined) {
                updates.push(`tags = $${paramIndex}`);
                params.push(data.tags);
                paramIndex++;
            }

            if (data.custom_fields !== undefined) {
                updates.push(`custom_fields = $${paramIndex}`);
                params.push(JSON.stringify(data.custom_fields));
                paramIndex++;
            }

            if (userId) {
                updates.push(`updated_by = $${paramIndex}`);
                params.push(userId);
                paramIndex++;
            }

            // Always update last_contact_at when contact is updated
            updates.push(`last_contact_at = NOW()`);

            if (updates.length === 0) {
                throw new Error('No fields to update');
            }

            params.push(contactId, organizationId);

            const result = await db.query<Contact>(
                `UPDATE contacts
         SET ${updates.join(', ')}
         WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1} AND deleted_at IS NULL
         RETURNING *`,
                params
            );

            if (result.rows.length === 0) {
                throw new Error('Contact not found or unauthorized');
            }

            logger.info('Contact updated', { contactId, organizationId });
            return result.rows[0];
        } catch (error) {
            logger.error('Error updating contact', { error, contactId, organizationId });
            throw error;
        }
    }

    /**
     * Soft delete contact
     */
    async deleteContact(contactId: string, organizationId: string): Promise<void> {
        try {
            const result = await db.query(
                `UPDATE contacts
         SET deleted_at = NOW()
         WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
         RETURNING id`,
                [contactId, organizationId]
            );

            if (result.rows.length === 0) {
                throw new Error('Contact not found or already deleted');
            }

            logger.info('Contact soft deleted', { contactId, organizationId });
        } catch (error) {
            logger.error('Error deleting contact', { error, contactId, organizationId });
            throw error;
        }
    }

    /**
     * Update lead score based on engagement
     */
    async updateLeadScore(
        contactId: string,
        organizationId: string,
        scoreAdjustment: number
    ): Promise<Contact> {
        try {
            const result = await db.query<Contact>(
                `UPDATE contacts
         SET lead_score = GREATEST(0, LEAST(100, lead_score + $1)),
             updated_at = NOW()
         WHERE id = $2 AND organization_id = $3 AND deleted_at IS NULL
         RETURNING *`,
                [scoreAdjustment, contactId, organizationId]
            );

            if (result.rows.length === 0) {
                throw new Error('Contact not found');
            }

            return result.rows[0];
        } catch (error) {
            logger.error('Error updating lead score', { error, contactId, organizationId });
            throw error;
        }
    }

    /**
     * Get contact statistics for dashboard
     */
    async getContactStats(organizationId: string): Promise<{
        total: number;
        by_status: Record<string, number>;
        by_type: Record<string, number>;
        avg_lead_score: number;
        hot_leads: number;
    }> {
        try {
            const result = await db.query(
                `SELECT 
          COUNT(*) as total,
          COALESCE(AVG(lead_score), 0) as avg_lead_score,
          COUNT(*) FILTER (WHERE qualification_level = 'hot') as hot_leads
         FROM contacts
         WHERE organization_id = $1 AND deleted_at IS NULL`,
                [organizationId]
            );

            // Get status counts separately to avoid enum issues
            const statusResult = await db.query(
                `SELECT 
                    COALESCE(lead_status::text, 'new') as status,
                    COUNT(*) as count
                 FROM contacts
                 WHERE organization_id = $1 AND deleted_at IS NULL
                 GROUP BY lead_status`,
                [organizationId]
            );

            // Get type counts separately
            const typeResult = await db.query(
                `SELECT 
                    COALESCE(contact_type::text, 'individual') as type,
                    COUNT(*) as count
                 FROM contacts
                 WHERE organization_id = $1 AND deleted_at IS NULL
                 GROUP BY contact_type`,
                [organizationId]
            );

            const by_status: Record<string, number> = {};
            statusResult.rows.forEach((row: any) => {
                by_status[row.status] = parseInt(row.count, 10);
            });

            const by_type: Record<string, number> = {};
            typeResult.rows.forEach((row: any) => {
                by_type[row.type] = parseInt(row.count, 10);
            });

            const row = result.rows[0];
            return {
                total: parseInt(row?.total || '0', 10),
                by_status,
                by_type,
                avg_lead_score: parseFloat(row?.avg_lead_score) || 0,
                hot_leads: parseInt(row?.hot_leads || '0', 10),
            };
        } catch (error) {
            logger.error('Error fetching contact stats', { error, organizationId });
            throw error;
        }
    }
}

export const contactService = new ContactService();
