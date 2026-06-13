/**
 * PM E-Sign Configuration Service
 *
 * Reads/writes the per-organization e-sign config for the three PM document
 * types. These are opt-in: until an org enables a type, its documents skip the
 * auto-trigger (the manual "Request E-Signature" button always works regardless).
 */
import { pool } from '../../database';

export type PmEsignDocType = 'change_order' | 'draw_request' | 'contractor_contract';

const TABLE: Record<PmEsignDocType, string> = {
  change_order: 'change_order_esign_config',
  draw_request: 'draw_request_esign_config',
  contractor_contract: 'contractor_contract_esign_config',
};

// The "trigger on approval/assignment" flag is named differently per table.
const TRIGGER_COL: Record<PmEsignDocType, string> = {
  change_order: 'trigger_on_approval',
  draw_request: 'trigger_on_approval',
  contractor_contract: 'auto_trigger_on_assignment',
};

// The "auto-action after completion" flag (CO auto-executes, draw auto-funds; contractor has none).
const AUTO_COL: Partial<Record<PmEsignDocType, string>> = {
  change_order: 'auto_execute_on_complete',
  draw_request: 'auto_fund_on_complete',
};

const DEFAULT_ROLES: Record<PmEsignDocType, string[]> = {
  change_order: ['project_manager', 'owner_representative', 'contractor'],
  draw_request: ['project_owner', 'general_contractor', 'lender_representative'],
  contractor_contract: ['project_owner', 'contractor_representative'],
};

export interface PmEsignConfig {
  doc_type: PmEsignDocType;
  enabled: boolean;            // trigger on approval/assignment
  min_amount_threshold: number;
  signer_roles: string[];
  auto_action: boolean;        // auto-execute / auto-fund (n/a for contractor)
  configured: boolean;         // whether a row exists
}

class EsignConfigService {
  async getAll(organizationId: string): Promise<PmEsignConfig[]> {
    const out: PmEsignConfig[] = [];
    for (const type of Object.keys(TABLE) as PmEsignDocType[]) {
      const res = await pool.query(`SELECT * FROM ${TABLE[type]} WHERE organization_id = $1`, [organizationId]);
      const row = res.rows[0];
      const autoCol = AUTO_COL[type];
      out.push({
        doc_type: type,
        enabled: row ? !!row[TRIGGER_COL[type]] : false,
        min_amount_threshold: row && row.min_amount_threshold != null ? Number(row.min_amount_threshold) : 0,
        signer_roles: row?.signer_roles || DEFAULT_ROLES[type],
        auto_action: row && autoCol ? !!row[autoCol] : false,
        configured: !!row,
      });
    }
    return out;
  }

  async upsert(
    organizationId: string,
    type: PmEsignDocType,
    settings: { enabled?: boolean; min_amount_threshold?: number; signer_roles?: string[]; auto_action?: boolean }
  ): Promise<PmEsignConfig> {
    const triggerCol = TRIGGER_COL[type];
    const autoCol = AUTO_COL[type];
    const hasAmount = type !== 'contractor_contract'; // contractor table has no min_amount_threshold

    const cols: string[] = ['organization_id', triggerCol, 'signer_roles'];
    const vals: any[] = [organizationId, settings.enabled ?? false, JSON.stringify(settings.signer_roles ?? DEFAULT_ROLES[type])];
    const updates: string[] = [`${triggerCol} = EXCLUDED.${triggerCol}`, `signer_roles = EXCLUDED.signer_roles`, `updated_at = NOW()`];

    if (hasAmount) {
      cols.push('min_amount_threshold');
      vals.push(settings.min_amount_threshold ?? 0);
      updates.push('min_amount_threshold = EXCLUDED.min_amount_threshold');
    }
    if (autoCol) {
      cols.push(autoCol);
      vals.push(settings.auto_action ?? false);
      updates.push(`${autoCol} = EXCLUDED.${autoCol}`);
    }

    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
    await pool.query(
      `INSERT INTO ${TABLE[type]} (${cols.join(', ')})
       VALUES (${placeholders})
       ON CONFLICT (organization_id) DO UPDATE SET ${updates.join(', ')}`,
      vals
    );

    const all = await this.getAll(organizationId);
    return all.find((c) => c.doc_type === type)!;
  }
}

export const esignConfigService = new EsignConfigService();
export default esignConfigService;
