/**
 * Procurement Service
 * Handles purchase orders, deliveries, and vendor management for construction projects
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export type PurchaseOrderStatus = 
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'ordered'
  | 'partially_delivered'
  | 'delivered'
  | 'cancelled'
  | 'on_hold';

export type DeliveryStatus = 'pending' | 'in_transit' | 'delivered' | 'partial' | 'rejected';

export interface CreatePurchaseOrderDTO {
  organizationId: string;
  projectId?: string;
  vendorId?: string;
  vendorName: string;
  vendorContactName?: string;
  vendorContactPhone?: string;
  vendorContactEmail?: string;
  title?: string;
  description?: string;
  priority?: string;
  expectedDeliveryDate?: string;
  deliveryAddress?: string;
  deliveryInstructions?: string;
  paymentTerms?: string;
  notes?: string;
  items?: CreatePOItemDTO[];
  createdBy: string;
}

export interface CreatePOItemDTO {
  description: string;
  specification?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  discountPercent?: number;
  taxPercent?: number;
  costCode?: string;
  materialId?: string;
}

export interface CreateDeliveryDTO {
  purchaseOrderId: string;
  deliveryDate?: string;
  receivedBy: string;
  receivedByName?: string;
  deliveryNoteNumber?: string;
  invoiceNumber?: string;
  notes?: string;
  issues?: string;
  photoUrls?: string[];
  signatureData?: string;
  items: DeliveryItemDTO[];
}

export interface DeliveryItemDTO {
  poItemId: string;
  quantityExpected?: number;
  quantityReceived: number;
  quantityRejected?: number;
  qualityStatus?: string;
  rejectionReason?: string;
}

export interface PurchaseOrderFilters {
  organizationId?: string;
  projectId?: string;
  vendorId?: string;
  status?: PurchaseOrderStatus | PurchaseOrderStatus[];
  priority?: string;
  fromDate?: string;
  toDate?: string;
  overdue?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export class ProcurementService {
  constructor(private pool: Pool) {}

  // ============================================================================
  // PURCHASE ORDERS
  // ============================================================================

  async createPurchaseOrder(dto: CreatePurchaseOrderDTO): Promise<any> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const id = uuidv4();
      const result = await client.query(
        `INSERT INTO purchase_orders (
          id, organization_id, project_id, vendor_id, vendor_name,
          vendor_contact_name, vendor_contact_phone, vendor_contact_email,
          title, description, priority, expected_delivery_date,
          delivery_address, delivery_instructions, payment_terms,
          notes, created_by, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'draft')
        RETURNING *`,
        [
          id, dto.organizationId, dto.projectId || null, dto.vendorId || null, dto.vendorName,
          dto.vendorContactName || null, dto.vendorContactPhone || null, dto.vendorContactEmail || null,
          dto.title || null, dto.description || null, dto.priority || 'normal', dto.expectedDeliveryDate || null,
          dto.deliveryAddress || null, dto.deliveryInstructions || null, dto.paymentTerms || null,
          dto.notes || null, dto.createdBy
        ]
      );

      const po = result.rows[0];

      // Add items if provided
      if (dto.items && dto.items.length > 0) {
        for (let i = 0; i < dto.items.length; i++) {
          const item = dto.items[i];
          await client.query(
            `INSERT INTO purchase_order_items (
              purchase_order_id, item_number, description, specification,
              quantity, unit, unit_price, discount_percent, tax_percent,
              cost_code, material_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              id, i + 1, item.description, item.specification || null,
              item.quantity, item.unit || 'EA', item.unitPrice, item.discountPercent || 0, item.taxPercent || 0,
              item.costCode || null, item.materialId || null
            ]
          );
        }
      }

      await client.query('COMMIT');
      return this.getPurchaseOrderById(id);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getPurchaseOrderById(id: string): Promise<any> {
    const poResult = await this.pool.query(
      `SELECT po.*,
        dp.name AS project_name,
        v.business_name AS vendor_company_name,
        COALESCE(uc.display_name, uc.first_name || ' ' || uc.last_name) AS created_by_name,
        COALESCE(ua.display_name, ua.first_name || ' ' || ua.last_name) AS approved_by_name
      FROM purchase_orders po
      LEFT JOIN development_projects dp ON po.project_id = dp.id
      LEFT JOIN vendors v ON po.vendor_id = v.id
      LEFT JOIN users uc ON po.created_by = uc.id
      LEFT JOIN users ua ON po.approved_by = ua.id
      WHERE po.id = $1`,
      [id]
    );

    if (poResult.rows.length === 0) return null;

    const po = poResult.rows[0];

    // Get items
    const itemsResult = await this.pool.query(
      `SELECT * FROM purchase_order_items WHERE purchase_order_id = $1 ORDER BY item_number`,
      [id]
    );

    // Get deliveries
    const deliveriesResult = await this.pool.query(
      `SELECT * FROM deliveries WHERE purchase_order_id = $1 ORDER BY delivery_date DESC`,
      [id]
    );

    return {
      ...this.mapPurchaseOrder(po),
      items: itemsResult.rows.map(this.mapPOItem),
      deliveries: deliveriesResult.rows.map(this.mapDelivery)
    };
  }

  async getPurchaseOrders(filters: PurchaseOrderFilters): Promise<{ data: any[]; total: number; page: number; pageSize: number }> {
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;
    const offset = (page - 1) * pageSize;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.organizationId) {
      whereClause += ` AND po.organization_id = $${paramIndex++}`;
      params.push(filters.organizationId);
    }

    if (filters.projectId) {
      whereClause += ` AND po.project_id = $${paramIndex++}`;
      params.push(filters.projectId);
    }

    if (filters.vendorId) {
      whereClause += ` AND po.vendor_id = $${paramIndex++}`;
      params.push(filters.vendorId);
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        whereClause += ` AND po.status = ANY($${paramIndex++})`;
        params.push(filters.status);
      } else {
        whereClause += ` AND po.status = $${paramIndex++}`;
        params.push(filters.status);
      }
    }

    if (filters.priority) {
      whereClause += ` AND po.priority = $${paramIndex++}`;
      params.push(filters.priority);
    }

    if (filters.fromDate) {
      whereClause += ` AND po.created_at >= $${paramIndex++}`;
      params.push(filters.fromDate);
    }

    if (filters.toDate) {
      whereClause += ` AND po.created_at <= $${paramIndex++}`;
      params.push(filters.toDate);
    }

    if (filters.overdue) {
      whereClause += ` AND po.expected_delivery_date < CURRENT_DATE AND po.status NOT IN ('delivered', 'cancelled')`;
    }

    if (filters.search) {
      whereClause += ` AND (po.po_number ILIKE $${paramIndex} OR po.vendor_name ILIKE $${paramIndex} OR po.title ILIKE $${paramIndex++})`;
      params.push(`%${filters.search}%`);
    }

    // Count total
    const countResult = await this.pool.query(
      `SELECT COUNT(*) FROM purchase_orders po ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get data
    const dataResult = await this.pool.query(
      `SELECT po.*,
        dp.name AS project_name,
        (SELECT COUNT(*) FROM purchase_order_items WHERE purchase_order_id = po.id) AS item_count,
        (SELECT COUNT(*) FROM deliveries WHERE purchase_order_id = po.id) AS delivery_count,
        CASE 
          WHEN po.expected_delivery_date < CURRENT_DATE AND po.status NOT IN ('delivered', 'cancelled') 
          THEN TRUE ELSE FALSE 
        END AS is_overdue
      FROM purchase_orders po
      LEFT JOIN development_projects dp ON po.project_id = dp.id
      ${whereClause}
      ORDER BY po.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, pageSize, offset]
    );

    return {
      data: dataResult.rows.map(this.mapPurchaseOrder),
      total,
      page,
      pageSize
    };
  }

  async updatePurchaseOrder(id: string, updates: Partial<CreatePurchaseOrderDTO>, updatedBy: string): Promise<any> {
    const fields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    const allowedFields: Record<string, string> = {
      projectId: 'project_id',
      vendorId: 'vendor_id',
      vendorName: 'vendor_name',
      vendorContactName: 'vendor_contact_name',
      vendorContactPhone: 'vendor_contact_phone',
      vendorContactEmail: 'vendor_contact_email',
      title: 'title',
      description: 'description',
      priority: 'priority',
      expectedDeliveryDate: 'expected_delivery_date',
      deliveryAddress: 'delivery_address',
      deliveryInstructions: 'delivery_instructions',
      paymentTerms: 'payment_terms',
      notes: 'notes',
      taxAmount: 'tax_amount',
      shippingAmount: 'shipping_amount',
      discountAmount: 'discount_amount'
    };

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields[key] && value !== undefined) {
        fields.push(`${allowedFields[key]} = $${paramIndex++}`);
        params.push(value);
      }
    }

    if (fields.length === 0) return this.getPurchaseOrderById(id);

    fields.push(`updated_by = $${paramIndex++}`);
    params.push(updatedBy);
    fields.push(`updated_at = NOW()`);

    params.push(id);

    await this.pool.query(
      `UPDATE purchase_orders SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
      params
    );

    return this.getPurchaseOrderById(id);
  }

  async submitForApproval(id: string, submittedBy: string): Promise<any> {
    await this.pool.query(
      `UPDATE purchase_orders SET status = 'pending_approval', updated_by = $1, updated_at = NOW() WHERE id = $2 AND status = 'draft'`,
      [submittedBy, id]
    );

    await this.logApproval(id, 'submitted', 'draft', 'pending_approval', submittedBy);
    return this.getPurchaseOrderById(id);
  }

  async approvePurchaseOrder(id: string, approvedBy: string, notes?: string): Promise<any> {
    await this.pool.query(
      `UPDATE purchase_orders 
       SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_by = $1, updated_at = NOW()
       WHERE id = $2 AND status = 'pending_approval'`,
      [approvedBy, id]
    );

    await this.logApproval(id, 'approved', 'pending_approval', 'approved', approvedBy, notes);
    return this.getPurchaseOrderById(id);
  }

  async rejectPurchaseOrder(id: string, rejectedBy: string, reason: string): Promise<any> {
    await this.pool.query(
      `UPDATE purchase_orders 
       SET status = 'draft', rejection_reason = $1, updated_by = $2, updated_at = NOW()
       WHERE id = $3 AND status = 'pending_approval'`,
      [reason, rejectedBy, id]
    );

    await this.logApproval(id, 'rejected', 'pending_approval', 'draft', rejectedBy, reason);
    return this.getPurchaseOrderById(id);
  }

  async markAsOrdered(id: string, orderedBy: string, orderDate?: string): Promise<any> {
    await this.pool.query(
      `UPDATE purchase_orders 
       SET status = 'ordered', order_date = COALESCE($1, CURRENT_DATE), updated_by = $2, updated_at = NOW()
       WHERE id = $3 AND status = 'approved'`,
      [orderDate || null, orderedBy, id]
    );

    await this.logApproval(id, 'ordered', 'approved', 'ordered', orderedBy);
    return this.getPurchaseOrderById(id);
  }

  async cancelPurchaseOrder(id: string, cancelledBy: string, reason: string): Promise<any> {
    const po = await this.getPurchaseOrderById(id);
    if (!po) return null;

    await this.pool.query(
      `UPDATE purchase_orders 
       SET status = 'cancelled', notes = COALESCE(notes || E'\n', '') || $1, updated_by = $2, updated_at = NOW()
       WHERE id = $3`,
      [`Cancelled: ${reason}`, cancelledBy, id]
    );

    await this.logApproval(id, 'cancelled', po.status, 'cancelled', cancelledBy, reason);
    return this.getPurchaseOrderById(id);
  }

  // ============================================================================
  // PO ITEMS
  // ============================================================================

  async addPOItem(poId: string, item: CreatePOItemDTO): Promise<any> {
    // Get next item number
    const numResult = await this.pool.query(
      `SELECT COALESCE(MAX(item_number), 0) + 1 AS next_num FROM purchase_order_items WHERE purchase_order_id = $1`,
      [poId]
    );
    const nextNum = numResult.rows[0].next_num;

    const result = await this.pool.query(
      `INSERT INTO purchase_order_items (
        purchase_order_id, item_number, description, specification,
        quantity, unit, unit_price, discount_percent, tax_percent,
        cost_code, material_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        poId, nextNum, item.description, item.specification || null,
        item.quantity, item.unit || 'EA', item.unitPrice, item.discountPercent || 0, item.taxPercent || 0,
        item.costCode || null, item.materialId || null
      ]
    );

    return this.mapPOItem(result.rows[0]);
  }

  async updatePOItem(itemId: string, updates: Partial<CreatePOItemDTO>): Promise<any> {
    const fields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      params.push(updates.description);
    }
    if (updates.specification !== undefined) {
      fields.push(`specification = $${paramIndex++}`);
      params.push(updates.specification);
    }
    if (updates.quantity !== undefined) {
      fields.push(`quantity = $${paramIndex++}`);
      params.push(updates.quantity);
    }
    if (updates.unit !== undefined) {
      fields.push(`unit = $${paramIndex++}`);
      params.push(updates.unit);
    }
    if (updates.unitPrice !== undefined) {
      fields.push(`unit_price = $${paramIndex++}`);
      params.push(updates.unitPrice);
    }
    if (updates.discountPercent !== undefined) {
      fields.push(`discount_percent = $${paramIndex++}`);
      params.push(updates.discountPercent);
    }
    if (updates.taxPercent !== undefined) {
      fields.push(`tax_percent = $${paramIndex++}`);
      params.push(updates.taxPercent);
    }

    if (fields.length === 0) return null;

    fields.push(`updated_at = NOW()`);
    params.push(itemId);

    const result = await this.pool.query(
      `UPDATE purchase_order_items SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    return result.rows.length > 0 ? this.mapPOItem(result.rows[0]) : null;
  }

  async deletePOItem(itemId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM purchase_order_items WHERE id = $1`,
      [itemId]
    );
    return result.rowCount! > 0;
  }

  // ============================================================================
  // DELIVERIES
  // ============================================================================

  async recordDelivery(dto: CreateDeliveryDTO): Promise<any> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const id = uuidv4();
      const deliveryNumber = `DEL-${Date.now().toString(36).toUpperCase()}`;

      const result = await client.query(
        `INSERT INTO deliveries (
          id, purchase_order_id, delivery_number, delivery_date,
          received_by, received_by_name, status,
          delivery_note_number, invoice_number, notes, issues,
          photo_urls, signature_data
        ) VALUES ($1, $2, $3, $4, $5, $6, 'delivered', $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          id, dto.purchaseOrderId, deliveryNumber, dto.deliveryDate || new Date().toISOString().split('T')[0],
          dto.receivedBy, dto.receivedByName || null,
          dto.deliveryNoteNumber || null, dto.invoiceNumber || null, dto.notes || null, dto.issues || null,
          JSON.stringify(dto.photoUrls || []), dto.signatureData || null
        ]
      );

      // Add delivery items
      for (const item of dto.items) {
        await client.query(
          `INSERT INTO delivery_items (
            delivery_id, po_item_id, quantity_expected, quantity_received,
            quantity_rejected, quality_status, rejection_reason
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            id, item.poItemId, item.quantityExpected || null, item.quantityReceived,
            item.quantityRejected || 0, item.qualityStatus || 'accepted', item.rejectionReason || null
          ]
        );
      }

      // Check if all items are fully delivered
      const poId = dto.purchaseOrderId;
      const remainingResult = await client.query(
        `SELECT SUM(quantity_remaining) AS remaining FROM purchase_order_items WHERE purchase_order_id = $1`,
        [poId]
      );
      const remaining = parseFloat(remainingResult.rows[0].remaining || '0');

      // Update PO status
      if (remaining <= 0) {
        await client.query(
          `UPDATE purchase_orders SET status = 'delivered', actual_delivery_date = $1, updated_at = NOW() WHERE id = $2`,
          [dto.deliveryDate || new Date().toISOString().split('T')[0], poId]
        );
      } else {
        await client.query(
          `UPDATE purchase_orders SET status = 'partially_delivered', updated_at = NOW() WHERE id = $1 AND status = 'ordered'`,
          [poId]
        );
      }

      await client.query('COMMIT');
      return this.mapDelivery(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getDeliveries(poId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT d.*, 
        (SELECT json_agg(di.*) FROM delivery_items di WHERE di.delivery_id = d.id) AS items
      FROM deliveries d
      WHERE d.purchase_order_id = $1
      ORDER BY d.delivery_date DESC`,
      [poId]
    );

    return result.rows.map(row => ({
      ...this.mapDelivery(row),
      items: row.items || []
    }));
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  async getProjectStats(projectId: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT
        COUNT(*) AS total_orders,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft_orders,
        SUM(CASE WHEN status = 'pending_approval' THEN 1 ELSE 0 END) AS pending_orders,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved_orders,
        SUM(CASE WHEN status = 'ordered' THEN 1 ELSE 0 END) AS ordered_orders,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered_orders,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_orders,
        SUM(total_amount) AS total_value,
        COUNT(DISTINCT vendor_id) AS unique_vendors,
        SUM(CASE WHEN expected_delivery_date < CURRENT_DATE AND status NOT IN ('delivered', 'cancelled') THEN 1 ELSE 0 END) AS overdue_orders
      FROM purchase_orders
      WHERE project_id = $1`,
      [projectId]
    );

    return result.rows[0];
  }

  async getOrganizationStats(organizationId: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT
        COUNT(*) AS total_orders,
        SUM(CASE WHEN status = 'pending_approval' THEN 1 ELSE 0 END) AS pending_approval,
        SUM(total_amount) AS total_value,
        COUNT(DISTINCT vendor_id) AS active_vendors
      FROM purchase_orders
      WHERE organization_id = $1 AND status NOT IN ('cancelled')`,
      [organizationId]
    );

    return result.rows[0];
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async logApproval(
    poId: string,
    action: string,
    fromStatus: string,
    toStatus: string,
    performedBy: string,
    reason?: string
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO purchase_order_approvals (
        purchase_order_id, action, from_status, to_status, performed_by, reason
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [poId, action, fromStatus, toStatus, performedBy, reason || null]
    );
  }

  private mapPurchaseOrder(row: any): any {
    return {
      id: row.id,
      organizationId: row.organization_id,
      projectId: row.project_id,
      projectName: row.project_name,
      poNumber: row.po_number,
      title: row.title,
      description: row.description,
      vendorId: row.vendor_id,
      vendorName: row.vendor_name,
      vendorContactName: row.vendor_contact_name,
      vendorContactPhone: row.vendor_contact_phone,
      vendorContactEmail: row.vendor_contact_email,
      subtotal: parseFloat(row.subtotal || 0),
      taxAmount: parseFloat(row.tax_amount || 0),
      shippingAmount: parseFloat(row.shipping_amount || 0),
      discountAmount: parseFloat(row.discount_amount || 0),
      totalAmount: parseFloat(row.total_amount || 0),
      currency: row.currency,
      status: row.status,
      priority: row.priority,
      orderDate: row.order_date,
      expectedDeliveryDate: row.expected_delivery_date,
      actualDeliveryDate: row.actual_delivery_date,
      dueDate: row.due_date,
      deliveryAddress: row.delivery_address,
      deliveryInstructions: row.delivery_instructions,
      requestedBy: row.requested_by,
      approvedBy: row.approved_by,
      approvedByName: row.approved_by_name,
      approvedAt: row.approved_at,
      rejectionReason: row.rejection_reason,
      paymentTerms: row.payment_terms,
      attachmentUrls: row.attachment_urls,
      notes: row.notes,
      createdBy: row.created_by,
      createdByName: row.created_by_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      itemCount: parseInt(row.item_count || 0),
      deliveryCount: parseInt(row.delivery_count || 0),
      isOverdue: row.is_overdue
    };
  }

  private mapPOItem(row: any): any {
    return {
      id: row.id,
      purchaseOrderId: row.purchase_order_id,
      itemNumber: row.item_number,
      description: row.description,
      specification: row.specification,
      quantity: parseFloat(row.quantity),
      unit: row.unit,
      unitPrice: parseFloat(row.unit_price),
      discountPercent: parseFloat(row.discount_percent || 0),
      taxPercent: parseFloat(row.tax_percent || 0),
      lineTotal: parseFloat(row.line_total || 0),
      quantityDelivered: parseFloat(row.quantity_delivered || 0),
      quantityRemaining: parseFloat(row.quantity_remaining || 0),
      costCode: row.cost_code,
      budgetLineId: row.budget_line_id,
      materialId: row.material_id,
      createdAt: row.created_at
    };
  }

  private mapDelivery(row: any): any {
    return {
      id: row.id,
      purchaseOrderId: row.purchase_order_id,
      deliveryNumber: row.delivery_number,
      deliveryDate: row.delivery_date,
      receivedBy: row.received_by,
      receivedByName: row.received_by_name,
      status: row.status,
      deliveryNoteNumber: row.delivery_note_number,
      invoiceNumber: row.invoice_number,
      notes: row.notes,
      issues: row.issues,
      photoUrls: row.photo_urls,
      createdAt: row.created_at
    };
  }
}
