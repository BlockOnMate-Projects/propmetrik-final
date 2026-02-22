/**
 * Contact Merge & Deduplication Service
 *
 * - Finds potential duplicate contacts via fuzzy name + email/phone matching
 * - Merges two contacts: transfers deals, tasks, activities, notes to the survivor
 * - Supports manual field-level merge decisions from the frontend
 *
 * @module services/crm-deal-management/contactMergeService
 */

import db from '../../database';
import { logger } from '../../utils/logger';

export interface DuplicateGroup {
    contacts: DuplicateContact[];
    match_type: 'email' | 'phone' | 'name' | 'combo';
    confidence: number;
}

interface DuplicateContact {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    primary_phone: string | null;
    lead_status: string;
    lead_score: number;
    company_name: string | null;
    deal_count: number;
    created_at: string;
}

export interface MergeDecision {
    /** Contact to keep (survivor) */
    survivor_id: string;
    /** Contact to merge into the survivor (will be soft-deleted) */
    duplicate_id: string;
    /** Field-level overrides: use values from duplicate for these fields */
    use_duplicate_fields?: string[];
}

export interface MergeResult {
    survivor_id: string;
    merged_id: string;
    deals_transferred: number;
    tasks_transferred: number;
    activities_transferred: number;
    notes_transferred: number;
}

export class ContactMergeService {

    /**
     * Find potential duplicate contacts within an organization
     */
    async findDuplicates(
        organizationId: string,
        options: { limit?: number; minConfidence?: number } = {}
    ): Promise<DuplicateGroup[]> {
        const { limit = 50, minConfidence = 0.5 } = options;
        const groups: DuplicateGroup[] = [];

        // 1. Exact email match (highest confidence)
        const emailDups = await db.query(
            `SELECT c1.id as id1, c1.first_name as fn1, c1.last_name as ln1, c1.email as email1,
                    c1.primary_phone as phone1, c1.lead_status as ls1, c1.lead_score as score1,
                    c1.created_at as created1, co1.company_name as company1,
                    (SELECT COUNT(*) FROM deals WHERE primary_contact_id = c1.id AND deleted_at IS NULL) as deals1,
                    c2.id as id2, c2.first_name as fn2, c2.last_name as ln2, c2.email as email2,
                    c2.primary_phone as phone2, c2.lead_status as ls2, c2.lead_score as score2,
                    c2.created_at as created2, co2.company_name as company2,
                    (SELECT COUNT(*) FROM deals WHERE primary_contact_id = c2.id AND deleted_at IS NULL) as deals2
             FROM contacts c1
             JOIN contacts c2 ON LOWER(TRIM(c1.email)) = LOWER(TRIM(c2.email))
                                   AND c1.id < c2.id
                                   AND c2.organization_id = $1
                                   AND c2.deleted_at IS NULL
             LEFT JOIN companies co1 ON co1.id = c1.company_id
             LEFT JOIN companies co2 ON co2.id = c2.company_id
             WHERE c1.organization_id = $1 AND c1.deleted_at IS NULL
               AND c1.email IS NOT NULL AND c1.email != ''
             LIMIT $2`,
            [organizationId, limit]
        );

        for (const row of emailDups.rows) {
            groups.push({
                contacts: [
                    this.mapContact(row, '1'),
                    this.mapContact(row, '2'),
                ],
                match_type: 'email',
                confidence: 0.95,
            });
        }

        // 2. Exact phone match (after normalizing)
        const phoneDups = await db.query(
            `SELECT c1.id as id1, c1.first_name as fn1, c1.last_name as ln1, c1.email as email1,
                    c1.primary_phone as phone1, c1.lead_status as ls1, c1.lead_score as score1,
                    c1.created_at as created1, co1.company_name as company1,
                    (SELECT COUNT(*) FROM deals WHERE primary_contact_id = c1.id AND deleted_at IS NULL) as deals1,
                    c2.id as id2, c2.first_name as fn2, c2.last_name as ln2, c2.email as email2,
                    c2.primary_phone as phone2, c2.lead_status as ls2, c2.lead_score as score2,
                    c2.created_at as created2, co2.company_name as company2,
                    (SELECT COUNT(*) FROM deals WHERE primary_contact_id = c2.id AND deleted_at IS NULL) as deals2
             FROM contacts c1
             JOIN contacts c2 ON REGEXP_REPLACE(c1.primary_phone, '[^0-9]', '', 'g') =
                                     REGEXP_REPLACE(c2.primary_phone, '[^0-9]', '', 'g')
                                   AND c1.id < c2.id
                                   AND c2.organization_id = $1
                                   AND c2.deleted_at IS NULL
             LEFT JOIN companies co1 ON co1.id = c1.company_id
             LEFT JOIN companies co2 ON co2.id = c2.company_id
             WHERE c1.organization_id = $1 AND c1.deleted_at IS NULL
               AND c1.primary_phone IS NOT NULL AND c1.primary_phone != ''
               -- Skip pairs already found by email
               AND NOT (c1.email IS NOT NULL AND c2.email IS NOT NULL
                        AND LOWER(TRIM(c1.email)) = LOWER(TRIM(c2.email)))
             LIMIT $2`,
            [organizationId, limit]
        );

        for (const row of phoneDups.rows) {
            groups.push({
                contacts: [
                    this.mapContact(row, '1'),
                    this.mapContact(row, '2'),
                ],
                match_type: 'phone',
                confidence: 0.85,
            });
        }

        // 3. Fuzzy name match (same first + last name, case-insensitive)
        const nameDups = await db.query(
            `SELECT c1.id as id1, c1.first_name as fn1, c1.last_name as ln1, c1.email as email1,
                    c1.primary_phone as phone1, c1.lead_status as ls1, c1.lead_score as score1,
                    c1.created_at as created1, co1.company_name as company1,
                    (SELECT COUNT(*) FROM deals WHERE primary_contact_id = c1.id AND deleted_at IS NULL) as deals1,
                    c2.id as id2, c2.first_name as fn2, c2.last_name as ln2, c2.email as email2,
                    c2.primary_phone as phone2, c2.lead_status as ls2, c2.lead_score as score2,
                    c2.created_at as created2, co2.company_name as company2,
                    (SELECT COUNT(*) FROM deals WHERE primary_contact_id = c2.id AND deleted_at IS NULL) as deals2
             FROM contacts c1
             JOIN contacts c2 ON LOWER(TRIM(c1.first_name)) = LOWER(TRIM(c2.first_name))
                                   AND LOWER(TRIM(c1.last_name)) = LOWER(TRIM(c2.last_name))
                                   AND c1.id < c2.id
                                   AND c2.organization_id = $1
                                   AND c2.deleted_at IS NULL
             LEFT JOIN companies co1 ON co1.id = c1.company_id
             LEFT JOIN companies co2 ON co2.id = c2.company_id
             WHERE c1.organization_id = $1 AND c1.deleted_at IS NULL
               AND c1.first_name IS NOT NULL AND c1.last_name IS NOT NULL
               -- Skip pairs already found by email or phone
               AND NOT (c1.email IS NOT NULL AND c2.email IS NOT NULL
                        AND LOWER(TRIM(c1.email)) = LOWER(TRIM(c2.email)))
               AND NOT (c1.primary_phone IS NOT NULL AND c2.primary_phone IS NOT NULL
                        AND REGEXP_REPLACE(c1.primary_phone, '[^0-9]', '', 'g') =
                            REGEXP_REPLACE(c2.primary_phone, '[^0-9]', '', 'g'))
             LIMIT $2`,
            [organizationId, limit]
        );

        for (const row of nameDups.rows) {
            groups.push({
                contacts: [
                    this.mapContact(row, '1'),
                    this.mapContact(row, '2'),
                ],
                match_type: 'name',
                confidence: 0.60,
            });
        }

        // Filter by min confidence and sort
        return groups
            .filter(g => g.confidence >= minConfidence)
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, limit);
    }

    /**
     * Merge duplicate contact into the survivor
     * Transfers all relationships and soft-deletes the duplicate
     */
    async mergeContacts(
        organizationId: string,
        decision: MergeDecision
    ): Promise<MergeResult> {
        const { survivor_id, duplicate_id, use_duplicate_fields = [] } = decision;

        if (survivor_id === duplicate_id) {
            throw new Error('Cannot merge a contact with itself');
        }

        // Verify both contacts exist and belong to the org
        const verify = await db.query(
            `SELECT id FROM contacts
             WHERE id IN ($1, $2) AND organization_id = $3 AND deleted_at IS NULL`,
            [survivor_id, duplicate_id, organizationId]
        );
        if (verify.rows.length !== 2) {
            throw new Error('One or both contacts not found');
        }

        const client = await db.getClient();
        try {
            await client.query('BEGIN');

            // 1. Copy over selected fields from duplicate to survivor
            if (use_duplicate_fields.length > 0) {
                const allowedFields = [
                    'email', 'primary_phone', 'secondary_phone', 'address',
                    'budget_min', 'budget_max', 'preferred_locations', 'preferred_property_types',
                    'property_interests', 'lead_status', 'lead_score', 'notes',
                    'contact_type', 'buyer_type', 'tags', 'custom_fields',
                ];
                const safeFields = use_duplicate_fields.filter(f => allowedFields.includes(f));

                if (safeFields.length > 0) {
                    const setClauses = safeFields.map((f, i) => `${f} = dup.${f}`).join(', ');
                    await client.query(
                        `UPDATE contacts SET ${setClauses}, updated_at = NOW()
                         FROM (SELECT ${safeFields.join(', ')} FROM contacts WHERE id = $1) dup
                         WHERE contacts.id = $2`,
                        [duplicate_id, survivor_id]
                    );
                }
            }

            // 2. Transfer deals (primary_contact_id)
            const dealsTransferred = await client.query(
                `UPDATE deals SET primary_contact_id = $1, updated_at = NOW()
                 WHERE primary_contact_id = $2 AND organization_id = $3 AND deleted_at IS NULL`,
                [survivor_id, duplicate_id, organizationId]
            );

            // 3. Transfer deal_contacts junction (skip if already linked)
            await client.query(
                `INSERT INTO deal_contacts (deal_id, contact_id, role, created_at)
                 SELECT dc.deal_id, $1, dc.role, NOW()
                 FROM deal_contacts dc
                 WHERE dc.contact_id = $2
                   AND NOT EXISTS (SELECT 1 FROM deal_contacts WHERE deal_id = dc.deal_id AND contact_id = $1)
                 ON CONFLICT DO NOTHING`,
                [survivor_id, duplicate_id]
            );
            await client.query('DELETE FROM deal_contacts WHERE contact_id = $1', [duplicate_id]);

            // 4. Transfer tasks
            const tasksTransferred = await client.query(
                `UPDATE tasks SET contact_id = $1, updated_at = NOW()
                 WHERE contact_id = $2`,
                [survivor_id, duplicate_id]
            );

            // 5. Transfer activities
            const activitiesTransferred = await client.query(
                `UPDATE deal_activities SET contact_id = $1
                 WHERE contact_id = $2`,
                [survivor_id, duplicate_id]
            );

            // 6. Transfer notes
            const notesTransferred = await client.query(
                `UPDATE notes SET entity_id = $1
                 WHERE entity_id = $2 AND entity_type = 'contact'`,
                [survivor_id, duplicate_id]
            );

            // 7. Transfer documents
            await client.query(
                `UPDATE documents SET entity_id = $1::text
                 WHERE entity_id = $2::text AND entity_type = 'contact'`,
                [survivor_id, duplicate_id]
            );

            // 8. Merge tags (union)
            await client.query(
                `UPDATE contacts
                 SET tags = (
                   SELECT COALESCE(
                     array_agg(DISTINCT t),
                     '{}'
                   )
                   FROM (
                     SELECT unnest(COALESCE(s.tags, '{}')) as t
                     FROM contacts s WHERE s.id = $1
                     UNION
                     SELECT unnest(COALESCE(d.tags, '{}')) as t
                     FROM contacts d WHERE d.id = $2
                   ) combined
                 ), updated_at = NOW()
                 WHERE id = $1`,
                [survivor_id, duplicate_id]
            );

            // 9. Log the merge as an activity on the survivor
            await client.query(
                `INSERT INTO deal_activities (id, deal_id, activity_type, description, performed_by, contact_id, created_at)
                 SELECT gen_random_uuid(), d.id, 'system', 'Contact merged from duplicate record', $3, $1, NOW()
                 FROM deals d WHERE d.primary_contact_id = $1 AND d.deleted_at IS NULL
                 LIMIT 1`,
                [survivor_id, duplicate_id, survivor_id]
            );

            // 10. Soft-delete the duplicate
            await client.query(
                `UPDATE contacts SET deleted_at = NOW(), updated_at = NOW()
                 WHERE id = $1 AND organization_id = $2`,
                [duplicate_id, organizationId]
            );

            await client.query('COMMIT');

            const result: MergeResult = {
                survivor_id,
                merged_id: duplicate_id,
                deals_transferred: dealsTransferred.rowCount || 0,
                tasks_transferred: tasksTransferred.rowCount || 0,
                activities_transferred: activitiesTransferred.rowCount || 0,
                notes_transferred: notesTransferred.rowCount || 0,
            };

            logger.info('Contacts merged', { organizationId, ...result });
            return result;
        } catch (err) {
            await client.query('ROLLBACK');
            logger.error('Contact merge failed', { error: (err as Error).message });
            throw err;
        } finally {
            client.release();
        }
    }

    // ─── Helpers ──────────────────────────────────────

    private mapContact(row: any, suffix: string): DuplicateContact {
        return {
            id: row[`id${suffix}`],
            first_name: row[`fn${suffix}`],
            last_name: row[`ln${suffix}`],
            email: row[`email${suffix}`],
            primary_phone: row[`phone${suffix}`],
            lead_status: row[`ls${suffix}`],
            lead_score: row[`score${suffix}`] || 0,
            company_name: row[`company${suffix}`],
            deal_count: parseInt(row[`deals${suffix}`] || '0', 10),
            created_at: row[`created${suffix}`],
        };
    }
}

export const contactMergeService = new ContactMergeService();
