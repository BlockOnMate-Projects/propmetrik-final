import db from '../../database';
import { v4 as uuidv4 } from 'uuid';

export interface ValuationClient {
    id: string;
    organizationId: string;
    name: string;
    type: 'individual' | 'corporate' | 'government';
    email: string | null;
    phone: string | null;
    address: string | null;
    companyName: string | null;
    tinNumber: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    lastActiveAt: Date | null;

    // Computed fields
    valuationsCount?: number;
    totalBilled?: number;
}

export class ValuationClientService {

    /**
     * Create a new client profile
     */
    async createClient(data: Partial<ValuationClient> & { organizationId: string; name: string }): Promise<ValuationClient> {
        const query = `
      INSERT INTO valuation_clients (
        organization_id, name, type, email, phone, address, 
        company_name, tin_number, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

        const values = [
            data.organizationId,
            data.name,
            data.type || 'individual',
            data.email || null,
            data.phone || null,
            data.address || null,
            data.companyName || null,
            data.tinNumber || null,
            data.notes || null
        ];

        const result = await db.query(query, values);
        return this.mapToClient(result.rows[0]);
    }

    /**
     * Update existing client
     */
    async updateClient(id: string, organizationId: string, data: Partial<ValuationClient>): Promise<ValuationClient> {
        const updates: string[] = [];
        const values: any[] = [];
        let idx = 1;

        const fields = ['name', 'type', 'email', 'phone', 'address', 'company_name', 'tin_number', 'notes'];

        // Map camelCase to snake_case for DB fields
        const fieldMap: Record<string, string> = {
            name: 'name', type: 'type', email: 'email', phone: 'phone',
            address: 'address', companyName: 'company_name', tinNumber: 'tin_number', notes: 'notes'
        };

        for (const [key, val] of Object.entries(data)) {
            if (fieldMap[key]) {
                updates.push(`${fieldMap[key]} = $${idx++}`);
                values.push(val);
            }
        }

        if (updates.length === 0) throw new Error('No valid fields to update');

        updates.push(`updated_at = NOW()`);
        values.push(id);
        values.push(organizationId);

        const query = `
      UPDATE valuation_clients 
      SET ${updates.join(', ')}
      WHERE id = $${idx++} AND organization_id = $${idx++}
      RETURNING *
    `;

        const result = await db.query(query, values);
        if (result.rows.length === 0) throw new Error('Client not found or access denied');

        return this.mapToClient(result.rows[0]);
    }

    /**
     * Get client details with stats
     */
    async getClientById(id: string, organizationId: string): Promise<ValuationClient> {
        // Determine stats from invoices/valuations
        const query = `
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM valuations v WHERE v.client_id = c.id) as valuations_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM valuation_invoices i WHERE i.client_id = c.id AND i.status != 'cancelled') as total_billed
      FROM valuation_clients c
      WHERE c.id = $1 AND c.organization_id = $2
    `;

        const result = await db.query(query, [id, organizationId]);
        if (result.rows.length === 0) throw new Error('Client not found');

        return this.mapToClient(result.rows[0]);
    }

    /**
     * List clients for an organization
     */
    async listClients(organizationId: string, limit = 50, offset = 0, search?: string): Promise<ValuationClient[]> {
        let query = `
      SELECT 
        c.*,
        (SELECT COUNT(*) FROM valuations v WHERE v.client_id = c.id) as valuations_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM valuation_invoices i WHERE i.client_id = c.id AND i.status != 'cancelled') as total_billed
      FROM valuation_clients c
      WHERE c.organization_id = $1
    `;

        const values: any[] = [organizationId];
        let idx = 2;

        if (search) {
            query += ` AND (c.name ILIKE $${idx} OR c.email ILIKE $${idx} OR c.company_name ILIKE $${idx})`;
            values.push(`%${search}%`);
            idx++;
        }

        query += ` ORDER BY c.updated_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
        values.push(limit, offset);

        const result = await db.query(query, values);
        return result.rows.map(this.mapToClient);
    }

    /**
     * Get client's invoices
     */
    async getClientInvoices(clientId: string, organizationId: string): Promise<any[]> {
        const result = await db.query(
            `SELECT id, invoice_number, status, total_amount, fee_model, 
                    invoice_date, due_date, paid_at, paid_amount, created_at
             FROM valuation_invoices 
             WHERE client_id = $1 AND organization_id = $2
             ORDER BY created_at DESC`,
            [clientId, organizationId]
        );
        return result.rows.map(r => ({
            id: r.id,
            invoiceNumber: r.invoice_number,
            status: r.status,
            totalAmount: parseFloat(r.total_amount),
            feeModel: r.fee_model,
            invoiceDate: r.invoice_date,
            dueDate: r.due_date,
            paidAt: r.paid_at,
            paidAmount: r.paid_amount ? parseFloat(r.paid_amount) : null,
            createdAt: r.created_at,
        }));
    }

    /**
     * Get client's valuations
     */
    async getClientValuations(clientId: string, organizationId: string): Promise<any[]> {
        const result = await db.query(
            `SELECT v.id, v.valuation_type, v.valuation_purpose, v.status, 
                    v.estimated_value, v.confidence_score, v.created_at,
                    CONCAT_WS(', ', p.address_street, p.address_city) as property_address, p.property_type
             FROM valuations v
             LEFT JOIN properties p ON v.property_id = p.id
             WHERE v.client_id = $1 AND v.valuer_organization_id = $2
             ORDER BY v.created_at DESC`,
            [clientId, organizationId]
        );
        return result.rows.map(r => ({
            id: r.id,
            valuationType: r.valuation_type,
            valuationPurpose: r.valuation_purpose,
            status: r.status,
            estimatedValue: r.estimated_value ? parseFloat(r.estimated_value) : null,
            confidenceScore: r.confidence_score ? parseFloat(r.confidence_score) : null,
            propertyAddress: r.property_address,
            propertyType: r.property_type,
            createdAt: r.created_at,
        }));
    }

    /**
     * Delete client (soft delete or hard delete depending on policy, safe hard delete here)
     */
    async deleteClient(id: string, organizationId: string): Promise<void> {
        // Check for dependencies
        const checkQuery = `SELECT COUNT(*) FROM valuation_invoices WHERE client_id = $1`;
        const checkRes = await db.query(checkQuery, [id]);

        if (parseInt(checkRes.rows[0].count) > 0) {
            throw new Error('Cannot delete client with existing invoices. Archive them instead.');
        }

        await db.query('DELETE FROM valuation_clients WHERE id = $1 AND organization_id = $2', [id, organizationId]);
    }

    // Helper to map DB row to TS object
    private mapToClient(row: any): ValuationClient {
        return {
            id: row.id,
            organizationId: row.organization_id,
            name: row.name,
            type: row.type,
            email: row.email,
            phone: row.phone,
            address: row.address,
            companyName: row.company_name,
            tinNumber: row.tin_number,
            notes: row.notes,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            lastActiveAt: row.last_active_at,
            valuationsCount: row.valuations_count ? parseInt(row.valuations_count) : 0,
            totalBilled: row.total_billed ? parseFloat(row.total_billed) : 0
        };
    }
}
