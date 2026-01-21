
import { pool } from '../../database';
import { logger } from '../../utils/logger';

export type SourceContext = 'property_management' | 'valuation_workflow' | 'crm_deal_management' | 'crm';

export interface ContributionHookData {
    contributor_id: string | null;
    contribution_type: string;
    source_context: SourceContext;
    source_id: string;
    data: any;
    organization_id?: string;
}

/**
 * ServiceHooks Utility
 * Standardized way to create contributions from various system modules
 */
export const ServiceHooks = {
    /**
     * Create a contribution record in the Data Hub
     */
    async createContribution(hookData: ContributionHookData): Promise<string | null> {
        try {
            const {
                contributor_id,
                contribution_type,
                source_context,
                source_id,
                data,
                organization_id
            } = hookData;

            const query = `
        INSERT INTO contributions (
          contributor_id,
          contributor_type,
          contribution_type,
          data,
          validation_status,
          source_context,
          metadata
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7
        ) RETURNING id
      `;

            const values = [
                contributor_id,
                'system', // Automated hooks are system-originated
                contribution_type,
                JSON.stringify(data),
                'pending',
                source_context,
                JSON.stringify({
                    source_id,
                    organization_id,
                    automated: true,
                    hook_type: contribution_type
                })
            ];

            const result = await pool.query(query, values);

            logger.info('Automated contribution created via hook', {
                submission_id: result.rows[0].id,
                source_context,
                contribution_type
            });

            return result.rows[0].id;
        } catch (error) {
            logger.error('Failed to create contribution via hook', {
                error: error instanceof Error ? error.message : String(error),
                hookData
            });
            return null;
        }
    }
};
