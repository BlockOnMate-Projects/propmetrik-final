/**
 * WorkOrderService
 * Phase 4.3: Maintenance Work Order Service
 * 
 * Handles work order creation, assignment, tracking, and completion
 * 
 * @module services/property-management/maintenance
 */

import { Pool } from 'pg';
import { pool } from '../../../database';
import { notify, resolveOrgStaff, resolveTenantByTenancy } from '../../../../shared-services/notifications/in-mail';
import { logger } from '../../../utils/logger';
import {
    WorkOrder,
    CreateWorkOrderDto,
    UpdateWorkOrderDto,
    WorkOrderStatus,
    MaintenanceCategory,
    Priority,
    WorkOrderFilters,
    PaginationParams,
    PaginatedResponse
} from '../../../types/property-management.types';

/**
 * Service for managing maintenance work orders
 */
export class WorkOrderService {
    private db: Pool;

    constructor(database?: Pool) {
        this.db = database || pool;
    }

    /**
     * Create a new work order
     */
    async createWorkOrder(
        organizationId: string,
        data: CreateWorkOrderDto,
        userId?: string
    ): Promise<WorkOrder> {
        const query = `
      INSERT INTO maintenance_work_orders (
        property_id,
        tenancy_id,
        organization_id,
        title,
        description,
        category,
        priority,
        urgency,
        specific_location,
        access_instructions,
        safety_considerations,
        scheduled_date,
        scheduled_time_start,
        scheduled_time_end,
        estimated_cost,
        photos_before,
        status,
        reported_by,
        created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19
      )
      RETURNING *
    `;

        const values = [
            data.propertyId,
            data.tenancyId || null,
            organizationId,
            data.title,
            data.description || null,
            data.category,
            data.priority || Priority.MEDIUM,
            data.urgency || 'normal',
            data.specificLocation || null,
            data.accessInstructions || null,
            data.safetyConsiderations || [],
            data.scheduledDate ? new Date(data.scheduledDate) : null,
            data.scheduledTimeStart || null,
            data.scheduledTimeEnd || null,
            data.estimatedCost || null,
            data.photosBefore || [],
            WorkOrderStatus.OPEN,
            userId || null,
            userId || null
        ];

        const result = await this.db.query(query, values);
        const workOrder = this.mapRowToWorkOrder(result.rows[0]);

        // Track contribution for Data Hub
        try {
            const { ServiceHooks } = await import('../../data-hub/serviceHooks');
            await ServiceHooks.createContribution({
                contributor_id: userId || null,
                organization_id: organizationId,
                contribution_type: 'enrichment',
                source_context: 'property_management',
                source_id: workOrder.id,
                data: {
                    work_order_id: workOrder.id,
                    property_id: workOrder.propertyId,
                    title: workOrder.title,
                    category: workOrder.category,
                    priority: workOrder.priority,
                    estimated_cost: workOrder.estimatedCost,
                    action: 'work_order_creation'
                }
            });
        } catch (hookError) {
            console.error('Failed to create work order contribution hook', hookError);
        }

        // Notify landlord staff (new request) + tenant (request logged).
        try {
            const staff = await resolveOrgStaff(organizationId);
            if (staff.length) {
                await notify({
                    recipients: staff,
                    category: 'property',
                    type: 'work_order.created',
                    title: 'New maintenance request',
                    body: `A maintenance request "${workOrder.title}" (${workOrder.priority}) was logged.`,
                    summary: workOrder.title,
                    priority: workOrder.priority === Priority.URGENT ? 'high' : 'normal',
                    sourceType: 'work_order',
                    sourceId: workOrder.id,
                    sourceUrl: `/dashboard/property-management/maintenance/${workOrder.id}`,
                    organizationId,
                    channels: { inApp: true },
                });
            }
            if (workOrder.tenancyId) {
                const tenant = await resolveTenantByTenancy(workOrder.tenancyId);
                if (tenant) {
                    await notify({
                        recipients: tenant,
                        category: 'property',
                        type: 'work_order.created',
                        title: 'Maintenance request received',
                        body: `Your maintenance request "${workOrder.title}" has been logged. We'll keep you updated.`,
                        summary: `Logged: ${workOrder.title}`,
                        priority: 'normal',
                        sourceType: 'work_order',
                        sourceId: workOrder.id,
                        tenantActionUrl: '/dashboard/tenant/maintenance',
                        organizationId,
                        channels: { inApp: true, email: true },
                    });
                }
            }
        } catch (err: any) {
            logger.warn('notify(work_order.created) failed', { workOrderId: workOrder.id, error: err.message });
        }

        return workOrder;
    }

    /**
     * Get work order by ID
     */
    async getWorkOrderById(
        workOrderId: string,
        organizationId: string
    ): Promise<WorkOrder | null> {
        const query = `
      SELECT 
        wo.*,
        v.business_name as vendor_name,
        v.contact_person as vendor_contact,
        v.phone_primary as vendor_phone,
        p.title as property_title,
        p.address_street as property_address
      FROM maintenance_work_orders wo
      LEFT JOIN vendors v ON wo.assigned_vendor_id = v.id
      LEFT JOIN properties p ON wo.property_id = p.id
      WHERE wo.id = $1 AND wo.organization_id = $2
    `;

        const result = await this.db.query(query, [workOrderId, organizationId]);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapRowToWorkOrder(result.rows[0], true);
    }

    /**
     * Get work orders with pagination and filtering
     */
    async getWorkOrders(
        organizationId: string,
        filters: WorkOrderFilters = {},
        pagination: PaginationParams = {}
    ): Promise<PaginatedResponse<WorkOrder>> {
        const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = pagination;
        const offset = (page - 1) * limit;

        const conditions: string[] = ['wo.organization_id = $1'];
        const params: (string | number)[] = [organizationId];
        let paramIndex = 2;

        if (filters.status) {
            conditions.push(`wo.status = $${paramIndex}`);
            params.push(filters.status);
            paramIndex++;
        }

        if (filters.category) {
            conditions.push(`wo.category = $${paramIndex}`);
            params.push(filters.category);
            paramIndex++;
        }

        if (filters.priority) {
            conditions.push(`wo.priority = $${paramIndex}`);
            params.push(filters.priority);
            paramIndex++;
        }

        if (filters.propertyId) {
            conditions.push(`wo.property_id = $${paramIndex}`);
            params.push(filters.propertyId);
            paramIndex++;
        }

        if (filters.vendorId) {
            conditions.push(`wo.assigned_vendor_id = $${paramIndex}`);
            params.push(filters.vendorId);
            paramIndex++;
        }

        if (filters.dateFrom) {
            conditions.push(`wo.created_at >= $${paramIndex}`);
            params.push(filters.dateFrom);
            paramIndex++;
        }

        if (filters.dateTo) {
            conditions.push(`wo.created_at <= $${paramIndex}`);
            params.push(filters.dateTo);
            paramIndex++;
        }

        const whereClause = conditions.join(' AND ');

        const allowedSortFields = ['created_at', 'priority', 'status', 'scheduled_date', 'category'];
        const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
        const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

        const countResult = await this.db.query(
            `SELECT COUNT(*) FROM maintenance_work_orders wo WHERE ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count, 10);

        const dataQuery = `
      SELECT 
        wo.*,
        v.business_name as vendor_name,
        p.title as property_title
      FROM maintenance_work_orders wo
      LEFT JOIN vendors v ON wo.assigned_vendor_id = v.id
      LEFT JOIN properties p ON wo.property_id = p.id
      WHERE ${whereClause}
      ORDER BY wo.${safeSortBy} ${safeSortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
        params.push(limit, offset);

        const dataResult = await this.db.query(dataQuery, params);
        const workOrders = dataResult.rows.map(row => this.mapRowToWorkOrder(row, true));

        const totalPages = Math.ceil(total / limit);

        return {
            data: workOrders,
            total,
            page,
            limit,
            totalPages,
            hasNext: page < totalPages,
            hasPrevious: page > 1
        };
    }

    /**
     * Update work order
     */
    async updateWorkOrder(
        workOrderId: string,
        organizationId: string,
        data: UpdateWorkOrderDto
    ): Promise<WorkOrder | null> {
        const updates: string[] = [];
        const params: (string | number | boolean | Date | string[] | null)[] = [];
        let paramIndex = 1;

        const fieldMappings: Record<string, string> = {
            title: 'title',
            description: 'description',
            category: 'category',
            priority: 'priority',
            urgency: 'urgency',
            specificLocation: 'specific_location',
            accessInstructions: 'access_instructions',
            safetyConsiderations: 'safety_considerations',
            scheduledDate: 'scheduled_date',
            scheduledTimeStart: 'scheduled_time_start',
            scheduledTimeEnd: 'scheduled_time_end',
            status: 'status',
            assignedVendorId: 'assigned_vendor_id',
            estimatedCost: 'estimated_cost',
            actualCost: 'actual_cost',
            completionNotes: 'completion_notes',
            photosAfter: 'photos_after'
        };

        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined && key in fieldMappings) {
                const dbField = fieldMappings[key];
                updates.push(`${dbField} = $${paramIndex}`);

                if (key === 'scheduledDate' && value) {
                    params.push(new Date(value as string));
                } else {
                    params.push(value as string | number | boolean | string[] | null);
                }
                paramIndex++;
            }
        }

        // Handle status transitions
        if (data.status === WorkOrderStatus.COMPLETED) {
            updates.push(`completed_at = CURRENT_TIMESTAMP`);
        }

        if (data.status === WorkOrderStatus.ASSIGNED && data.assignedVendorId) {
            // Already handled above
        }

        if (updates.length === 0) {
            return this.getWorkOrderById(workOrderId, organizationId);
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);

        const query = `
      UPDATE maintenance_work_orders
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1}
      RETURNING *
    `;
        params.push(workOrderId, organizationId);

        const result = await this.db.query(query, params);
        if (result.rows.length === 0) {
            return null;
        }

        // Create financial record if completing with costs
        if (data.status === WorkOrderStatus.COMPLETED && data.actualCost) {
            await this.createExpenseRecord(result.rows[0]);
        }

        const workOrder = this.mapRowToWorkOrder(result.rows[0]);

        // A reschedule (schedule changed outside the initial assign) notifies the
        // already-assigned vendor + tenant. The assign flow sets status=ASSIGNED
        // and handles its own notification, so it's excluded here to avoid dupes.
        if (
            data.scheduledDate !== undefined &&
            data.status !== WorkOrderStatus.ASSIGNED &&
            workOrder.assignedVendorId
        ) {
            await this.notifyVendorAndTenant(workOrder, organizationId, 'rescheduled');
        }

        return workOrder;
    }

    /**
     * Assign work order to vendor (optionally scheduling the visit at the same
     * time) and notify both the vendor and the tenant.
     */
    async assignWorkOrder(
        workOrderId: string,
        vendorId: string,
        organizationId: string,
        schedule?: { scheduledDate?: string; scheduledTimeStart?: string; scheduledTimeEnd?: string }
    ): Promise<WorkOrder | null> {
        // Verify vendor belongs to organization
        const vendorCheck = await this.db.query(
            `SELECT id FROM vendors WHERE id = $1 AND organization_id = $2`,
            [vendorId, organizationId]
        );

        if (vendorCheck.rows.length === 0) {
            throw new Error('Vendor not found');
        }

        const workOrder = await this.updateWorkOrder(workOrderId, organizationId, {
            assignedVendorId: vendorId,
            status: WorkOrderStatus.ASSIGNED,
            scheduledDate: schedule?.scheduledDate,
            scheduledTimeStart: schedule?.scheduledTimeStart,
            scheduledTimeEnd: schedule?.scheduledTimeEnd,
        });

        if (workOrder) {
            await this.notifyVendorAndTenant(workOrder, organizationId, 'assigned');
        }

        return workOrder;
    }

    /**
     * Notify the assigned vendor (email + SMS — vendors have no login account)
     * and the tenant (in-app + email) that a vendor has been assigned or the
     * visit rescheduled. Best-effort: never throws into the calling action.
     */
    private async notifyVendorAndTenant(
        workOrder: WorkOrder,
        organizationId: string,
        kind: 'assigned' | 'rescheduled'
    ): Promise<void> {
        try {
            if (!workOrder.assignedVendorId) return;

            const vendorRes = await this.db.query(
                `SELECT v.business_name, v.contact_person, v.email, v.phone_primary,
                        p.title AS property_title, p.address_street AS property_address
                   FROM vendors v
                   LEFT JOIN properties p ON p.id = $2
                  WHERE v.id = $1`,
                [workOrder.assignedVendorId, workOrder.propertyId]
            );
            const v = vendorRes.rows[0];
            if (!v) return;

            const propertyName = (v.property_title as string) || 'the property';
            const propertyAddress = (v.property_address as string) || '';
            const visit = this.formatVisitWindow(workOrder);

            // ---- Vendor (email + SMS) ----------------------------------------
            if (v.email || v.phone_primary) {
                const intro = kind === 'assigned'
                    ? `You have been assigned a maintenance job: "${workOrder.title}".`
                    : `The visit for maintenance job "${workOrder.title}" has been rescheduled.`;
                const lines = [
                    intro,
                    `Property: ${propertyName}${propertyAddress ? `, ${propertyAddress}` : ''}`,
                    workOrder.specificLocation ? `Location: ${workOrder.specificLocation}` : '',
                    `Category: ${workOrder.category}  •  Priority: ${workOrder.priority}`,
                    visit ? `Scheduled: ${visit}` : 'Scheduled: to be confirmed',
                    workOrder.accessInstructions ? `Access: ${workOrder.accessInstructions}` : '',
                    workOrder.description ? `Details: ${workOrder.description}` : '',
                ].filter(Boolean);
                const body = lines.join('\n');

                await notify({
                    recipients: {
                        audience: 'staff',
                        userId: '',
                        email: v.email,
                        phone: v.phone_primary,
                        name: v.business_name,
                    },
                    category: 'property',
                    type: kind === 'assigned' ? 'work_order.vendor_assigned' : 'work_order.vendor_rescheduled',
                    title: kind === 'assigned' ? `New job assigned: ${workOrder.title}` : `Job rescheduled: ${workOrder.title}`,
                    body,
                    summary: `${workOrder.title} — ${propertyName}`,
                    priority: workOrder.priority === Priority.URGENT ? 'high' : 'normal',
                    sourceType: 'work_order',
                    sourceId: workOrder.id,
                    organizationId,
                    channels: { email: !!v.email, sms: !!v.phone_primary },
                    smsBody: `PropMetrik: ${kind === 'assigned' ? 'New job' : 'Rescheduled'} "${workOrder.title}" at ${propertyName}.${visit ? ` Visit: ${visit}.` : ''}`,
                });
            }

            // ---- Tenant (in-app + email) -------------------------------------
            if (workOrder.tenancyId) {
                const tenant = await resolveTenantByTenancy(workOrder.tenancyId);
                if (tenant) {
                    const tenantBody = kind === 'assigned'
                        ? `${v.business_name} has been assigned to your maintenance request "${workOrder.title}".${visit ? ` They are scheduled to visit ${visit}.` : ' We will confirm a visit time shortly.'}`
                        : `Your maintenance visit for "${workOrder.title}" with ${v.business_name} has been rescheduled${visit ? ` to ${visit}.` : '.'}`;
                    await notify({
                        recipients: tenant,
                        category: 'property',
                        type: kind === 'assigned' ? 'work_order.vendor_assigned' : 'work_order.vendor_rescheduled',
                        title: kind === 'assigned' ? 'A vendor has been assigned' : 'Your maintenance visit was rescheduled',
                        body: tenantBody,
                        summary: `${workOrder.title}: ${v.business_name}${visit ? ` — ${visit}` : ''}`,
                        priority: 'normal',
                        sourceType: 'work_order',
                        sourceId: workOrder.id,
                        tenantActionUrl: `/dashboard/tenant/maintenance/${workOrder.id}`,
                        organizationId,
                        channels: { inApp: true, email: true },
                    });
                }
            }
        } catch (err: any) {
            logger.warn(`notify(work_order.${kind}) failed`, { workOrderId: workOrder.id, error: err.message });
        }
    }

    /** Human-readable visit window, e.g. "12 Jun 2026, 09:00–11:00". Empty if unscheduled. */
    private formatVisitWindow(workOrder: WorkOrder): string {
        if (!workOrder.scheduledDate) return '';
        const date = new Date(workOrder.scheduledDate).toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
        });
        const start = workOrder.scheduledTimeStart?.slice(0, 5);
        const end = workOrder.scheduledTimeEnd?.slice(0, 5);
        if (start && end) return `${date}, ${start}–${end}`;
        if (start) return `${date}, ${start}`;
        return date;
    }

    /**
     * Complete work order
     */
    async completeWorkOrder(
        workOrderId: string,
        organizationId: string,
        completionData: {
            actualCost: number;
            completionNotes: string;
            photosAfter?: string[];
        }
    ): Promise<WorkOrder | null> {
        const workOrder = await this.updateWorkOrder(workOrderId, organizationId, {
            status: WorkOrderStatus.COMPLETED,
            actualCost: completionData.actualCost,
            completionNotes: completionData.completionNotes,
            photosAfter: completionData.photosAfter
        });

        // Notify the tenant their maintenance request is complete.
        try {
            if (workOrder?.tenancyId) {
                const tenant = await resolveTenantByTenancy(workOrder.tenancyId);
                if (tenant) {
                    await notify({
                        recipients: tenant,
                        category: 'property',
                        type: 'work_order.completed',
                        title: 'Maintenance request completed',
                        body: `Your maintenance request "${workOrder.title}" has been completed.`,
                        summary: `Completed: ${workOrder.title}`,
                        priority: 'normal',
                        sourceType: 'work_order',
                        sourceId: workOrder.id,
                        tenantActionUrl: '/dashboard/tenant/maintenance',
                        organizationId,
                        channels: { inApp: true, email: true },
                    });
                }
            }
        } catch (err: any) {
            logger.warn('notify(work_order.completed) failed', { workOrderId, error: err.message });
        }

        return workOrder;
    }

    /**
     * Approve work order budget
     */
    async approveWorkOrderBudget(
        workOrderId: string,
        organizationId: string,
        userId: string
    ): Promise<WorkOrder | null> {
        const query = `
      UPDATE maintenance_work_orders
      SET budget_approved = TRUE, approved_by = $1, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND organization_id = $3
      RETURNING *
    `;

        const result = await this.db.query(query, [userId, workOrderId, organizationId]);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapRowToWorkOrder(result.rows[0]);
    }

    /**
     * Get work order statistics
     */
    async getWorkOrderStats(organizationId: string): Promise<WorkOrderStats> {
        const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open_count,
        COUNT(CASE WHEN status = 'assigned' THEN 1 END) as assigned_count,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_count,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count,
        COUNT(CASE WHEN priority = 'urgent' AND status NOT IN ('completed', 'cancelled') THEN 1 END) as urgent_pending,
        COUNT(CASE WHEN priority IN ('urgent', 'high') AND status NOT IN ('completed', 'cancelled') THEN 1 END) as critical_high,
        COALESCE(SUM(actual_cost), 0) as total_costs,
        COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 86400), 0) as avg_resolution_days
      FROM maintenance_work_orders
      WHERE organization_id = $1
    `;

        const result = await this.db.query(query, [organizationId]);
        const row = result.rows[0];

        // Solve rate = completed / (all work orders that needed solving, i.e. excluding cancelled).
        const total = parseInt(row.total, 10);
        const completed = parseInt(row.completed_count, 10);
        const cancelled = parseInt(row.cancelled_count, 10);
        const solvable = total - cancelled;
        const solveRate = solvable > 0 ? Math.round((completed / solvable) * 100) : 0;

        // Get by category breakdown
        const categoryQuery = `
      SELECT category, COUNT(*) as count
      FROM maintenance_work_orders
      WHERE organization_id = $1
      GROUP BY category
      ORDER BY count DESC
    `;
        const categoryResult = await this.db.query(categoryQuery, [organizationId]);

        return {
            total,
            byStatus: {
                open: parseInt(row.open_count, 10),
                assigned: parseInt(row.assigned_count, 10),
                inProgress: parseInt(row.in_progress_count, 10),
                completed,
                cancelled
            },
            urgentPending: parseInt(row.urgent_pending, 10),
            criticalHigh: parseInt(row.critical_high, 10),
            solveRate,
            totalCosts: parseFloat(row.total_costs),
            avgResolutionDays: parseFloat(row.avg_resolution_days),
            byCategory: categoryResult.rows.reduce((acc, row) => {
                acc[row.category] = parseInt(row.count, 10);
                return acc;
            }, {} as Record<string, number>)
        };
    }

    // =====================================================
    // PRIVATE HELPER METHODS
    // =====================================================

    private mapRowToWorkOrder(row: Record<string, unknown>, includeRelations = false): WorkOrder {
        const workOrder: WorkOrder = {
            id: row.id as string,
            referenceNumber: row.reference_number as string,
            propertyId: row.property_id as string,
            tenancyId: row.tenancy_id as string | undefined,
            organizationId: row.organization_id as string,
            assignedVendorId: row.assigned_vendor_id as string | undefined,
            title: row.title as string,
            description: row.description as string | undefined,
            category: row.category as MaintenanceCategory,
            priority: row.priority as Priority,
            urgency: row.urgency as any,
            specificLocation: row.specific_location as string | undefined,
            accessInstructions: row.access_instructions as string | undefined,
            safetyConsiderations: (row.safety_considerations as string[]) || [],
            status: row.status as WorkOrderStatus,
            scheduledDate: row.scheduled_date as Date | undefined,
            scheduledTimeStart: row.scheduled_time_start as string | undefined,
            scheduledTimeEnd: row.scheduled_time_end as string | undefined,
            completedAt: row.completed_at as Date | undefined,
            estimatedCost: row.estimated_cost ? parseFloat(row.estimated_cost as string) : undefined,
            actualCost: row.actual_cost ? parseFloat(row.actual_cost as string) : undefined,
            budgetApproved: row.budget_approved as boolean,
            approvedBy: row.approved_by as string | undefined,
            approvedAt: row.approved_at as Date | undefined,
            photosBefore: (row.photos_before as string[]) || [],
            photosAfter: (row.photos_after as string[]) || [],
            documents: (row.documents as string[]) || [],
            completionNotes: row.completion_notes as string | undefined,
            reportedBy: row.reported_by as string | undefined,
            reportedAt: row.reported_at as Date,
            createdBy: row.created_by as string | undefined,
            createdAt: row.created_at as Date,
            updatedAt: row.updated_at as Date
        };

        if (includeRelations) {
            if (row.vendor_name) {
                workOrder.vendor = {
                    id: workOrder.assignedVendorId!,
                    organizationId: workOrder.organizationId,
                    businessName: row.vendor_name as string,
                    contactPerson: row.vendor_contact as string,
                    phonePrimary: row.vendor_phone as string,
                    serviceCategories: [],
                    totalJobsCompleted: 0,
                    averageRating: 0,
                    totalRatings: 0,
                    status: VendorStatus.ACTIVE,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
            }
            if (row.property_title) {
                workOrder.property = {
                    id: workOrder.propertyId,
                    title: row.property_title as string,
                    address: row.property_address as string
                };
            }
        }

        return workOrder;
    }

    private async createExpenseRecord(workOrder: Record<string, unknown>): Promise<void> {
        if (!workOrder.actual_cost) return;

        await this.db.query(
            `INSERT INTO property_financial_records (
        property_id, work_order_id, organization_id, record_type,
        expense_category, amount, currency, transaction_date,
        description, recorded_by
      ) VALUES ($1, $2, $3, 'expense', 'maintenance_repairs', $4, 'GHS', CURRENT_DATE, $5, $6)`,
            [
                workOrder.property_id,
                workOrder.id,
                workOrder.organization_id,
                workOrder.actual_cost,
                `Maintenance - ${workOrder.title} (${workOrder.reference_number})`,
                workOrder.approved_by
            ]
        );
    }
}

// Additional interfaces
import { Vendor, VendorStatus } from '../../../types/property-management.types';

interface WorkOrderStats {
    total: number;
    byStatus: {
        open: number;
        assigned: number;
        inProgress: number;
        completed: number;
        cancelled: number;
    };
    urgentPending: number;
    criticalHigh: number;
    solveRate: number; // % of non-cancelled work orders that are completed (0-100)
    totalCosts: number;
    avgResolutionDays: number;
    byCategory: Record<string, number>;
}

// Export singleton instance
export const workOrderService = new WorkOrderService();
