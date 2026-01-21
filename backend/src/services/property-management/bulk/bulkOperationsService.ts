/**
 * Property Management Bulk Operations Service
 * Phase 4.5: Batch Processing & Data Import/Export
 * 
 * Provides bulk operations for enterprise property management workflows
 * 
 * @module services/property-management/bulk
 */

import db from '../../../database';
import { logger } from '../../../utils/logger';
import { auditTrailService, AuditAction, AuditResource } from '../audit/auditTrailService';

export interface BulkOperationResult {
    success: boolean;
    totalProcessed: number;
    successCount: number;
    failedCount: number;
    errors: Array<{ index: number; id?: string; error: string }>;
    results: Array<{ id: string; status: 'success' | 'failed'; message?: string }>;
}

export interface RentIncreaseParams {
    tenancyIds?: string[];
    propertyIds?: string[];
    increaseType: 'percentage' | 'fixed';
    increaseValue: number;
    effectiveDate: string;
    notifyTenants: boolean;
    reason?: string;
}

export interface BulkWorkOrderParams {
    propertyId?: string;
    unitIds?: string[];
    category: string;
    priority: string;
    title: string;
    description: string;
    vendorId?: string;
    scheduledDate?: string;
}

export interface CSVImportParams {
    type: 'properties' | 'tenants' | 'units';
    data: Record<string, any>[];
    validateOnly?: boolean;
}

export class BulkOperationsService {
    /**
     * Bulk rent increase
     */
    async bulkRentIncrease(
        organizationId: string,
        userId: string,
        params: RentIncreaseParams
    ): Promise<BulkOperationResult> {
        const results: BulkOperationResult = {
            success: true,
            totalProcessed: 0,
            successCount: 0,
            failedCount: 0,
            errors: [],
            results: []
        };

        try {
            // Get tenancies to update
            let tenancyQuery: string;
            let queryParams: any[];

            if (params.tenancyIds && params.tenancyIds.length > 0) {
                tenancyQuery = `
                    SELECT t.id, t.monthly_rent, t.tenant_id, t.property_id, t.unit_id,
                           ten.first_name, ten.last_name, ten.email, ten.phone
                    FROM tenancies t
                    JOIN tenants ten ON t.tenant_id = ten.id
                    WHERE t.organization_id = $1
                    AND t.id = ANY($2)
                    AND t.status = 'active'
                `;
                queryParams = [organizationId, params.tenancyIds];
            } else if (params.propertyIds && params.propertyIds.length > 0) {
                tenancyQuery = `
                    SELECT t.id, t.monthly_rent, t.tenant_id, t.property_id, t.unit_id,
                           ten.first_name, ten.last_name, ten.email, ten.phone
                    FROM tenancies t
                    JOIN tenants ten ON t.tenant_id = ten.id
                    WHERE t.organization_id = $1
                    AND t.property_id = ANY($2)
                    AND t.status = 'active'
                `;
                queryParams = [organizationId, params.propertyIds];
            } else {
                // All active tenancies
                tenancyQuery = `
                    SELECT t.id, t.monthly_rent, t.tenant_id, t.property_id, t.unit_id,
                           ten.first_name, ten.last_name, ten.email, ten.phone
                    FROM tenancies t
                    JOIN tenants ten ON t.tenant_id = ten.id
                    WHERE t.organization_id = $1
                    AND t.status = 'active'
                `;
                queryParams = [organizationId];
            }

            const tenancies = await db.query(tenancyQuery, queryParams);
            results.totalProcessed = tenancies.rows.length;

            if (tenancies.rows.length === 0) {
                results.success = true;
                return results;
            }

            // Begin transaction
            await db.query('BEGIN');

            for (let i = 0; i < tenancies.rows.length; i++) {
                const tenancy = tenancies.rows[i];

                try {
                    const currentRent = parseFloat(tenancy.monthly_rent);
                    let newRent: number;

                    if (params.increaseType === 'percentage') {
                        newRent = currentRent * (1 + params.increaseValue / 100);
                    } else {
                        newRent = currentRent + params.increaseValue;
                    }

                    // Round to 2 decimal places
                    newRent = Math.round(newRent * 100) / 100;

                    // Update rent
                    await db.query(`
                        UPDATE tenancies
                        SET monthly_rent = $1,
                            rent_increase_effective_date = $2,
                            rent_increase_reason = $3,
                            previous_rent = $4,
                            updated_at = NOW()
                        WHERE id = $5
                    `, [newRent, params.effectiveDate, params.reason, currentRent, tenancy.id]);

                    // Log audit
                    await auditTrailService.log({
                        organizationId,
                        userId,
                        action: AuditAction.UPDATE,
                        resource: AuditResource.TENANCY,
                        resourceId: tenancy.id,
                        resourceName: `Tenancy for ${tenancy.first_name} ${tenancy.last_name}`,
                        previousData: { monthly_rent: currentRent },
                        newData: { monthly_rent: newRent, increase_reason: params.reason },
                        metadata: {
                            bulkOperation: 'rent_increase',
                            increaseType: params.increaseType,
                            increaseValue: params.increaseValue,
                            effectiveDate: params.effectiveDate
                        }
                    });

                    results.successCount++;
                    results.results.push({
                        id: tenancy.id,
                        status: 'success',
                        message: `Rent updated from ${currentRent} to ${newRent}`
                    });

                } catch (error: any) {
                    results.failedCount++;
                    results.errors.push({
                        index: i,
                        id: tenancy.id,
                        error: error.message
                    });
                    results.results.push({
                        id: tenancy.id,
                        status: 'failed',
                        message: error.message
                    });
                }
            }

            await db.query('COMMIT');
            results.success = results.failedCount === 0;

            logger.info('Bulk rent increase completed', {
                organizationId,
                totalProcessed: results.totalProcessed,
                successCount: results.successCount,
                failedCount: results.failedCount
            });

            return results;

        } catch (error: any) {
            await db.query('ROLLBACK');
            logger.error('Bulk rent increase failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Bulk create work orders
     */
    async bulkCreateWorkOrders(
        organizationId: string,
        userId: string,
        params: BulkWorkOrderParams
    ): Promise<BulkOperationResult> {
        const results: BulkOperationResult = {
            success: true,
            totalProcessed: 0,
            successCount: 0,
            failedCount: 0,
            errors: [],
            results: []
        };

        try {
            let units: any[] = [];

            if (params.unitIds && params.unitIds.length > 0) {
                // Specific units
                const unitResult = await db.query(`
                    SELECT u.id, u.unit_number, u.property_id, p.name as property_name
                    FROM units u
                    JOIN properties p ON u.property_id = p.id
                    WHERE u.organization_id = $1
                    AND u.id = ANY($2)
                `, [organizationId, params.unitIds]);
                units = unitResult.rows;
            } else if (params.propertyId) {
                // All units in a property
                const unitResult = await db.query(`
                    SELECT u.id, u.unit_number, u.property_id, p.name as property_name
                    FROM units u
                    JOIN properties p ON u.property_id = p.id
                    WHERE u.organization_id = $1
                    AND u.property_id = $2
                `, [organizationId, params.propertyId]);
                units = unitResult.rows;
            }

            results.totalProcessed = units.length;

            if (units.length === 0) {
                results.success = true;
                return results;
            }

            await db.query('BEGIN');

            for (let i = 0; i < units.length; i++) {
                const unit = units[i];

                try {
                    const insertResult = await db.query(`
                        INSERT INTO maintenance_work_orders (
                            organization_id,
                            property_id,
                            unit_id,
                            category,
                            priority,
                            title,
                            description,
                            status,
                            vendor_id,
                            scheduled_date,
                            created_by
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10)
                        RETURNING id
                    `, [
                        organizationId,
                        unit.property_id,
                        unit.id,
                        params.category,
                        params.priority,
                        `${params.title} - ${unit.unit_number}`,
                        params.description,
                        params.vendorId || null,
                        params.scheduledDate || null,
                        userId
                    ]);

                    const workOrderId = insertResult.rows[0].id;

                    // Log audit
                    await auditTrailService.log({
                        organizationId,
                        userId,
                        action: AuditAction.CREATE,
                        resource: AuditResource.WORK_ORDER,
                        resourceId: workOrderId,
                        resourceName: `${params.title} - ${unit.unit_number}`,
                        newData: {
                            category: params.category,
                            priority: params.priority,
                            unit: unit.unit_number,
                            property: unit.property_name
                        },
                        metadata: {
                            bulkOperation: 'create_work_orders'
                        }
                    });

                    results.successCount++;
                    results.results.push({
                        id: workOrderId,
                        status: 'success',
                        message: `Work order created for unit ${unit.unit_number}`
                    });

                } catch (error: any) {
                    results.failedCount++;
                    results.errors.push({
                        index: i,
                        id: unit.id,
                        error: error.message
                    });
                    results.results.push({
                        id: unit.id,
                        status: 'failed',
                        message: error.message
                    });
                }
            }

            await db.query('COMMIT');
            results.success = results.failedCount === 0;

            logger.info('Bulk work order creation completed', {
                organizationId,
                totalProcessed: results.totalProcessed,
                successCount: results.successCount,
                failedCount: results.failedCount
            });

            return results;

        } catch (error: any) {
            await db.query('ROLLBACK');
            logger.error('Bulk work order creation failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Import data from CSV/JSON
     */
    async importData(
        organizationId: string,
        userId: string,
        params: CSVImportParams
    ): Promise<BulkOperationResult> {
        const results: BulkOperationResult = {
            success: true,
            totalProcessed: params.data.length,
            successCount: 0,
            failedCount: 0,
            errors: [],
            results: []
        };

        try {
            // Validate data structure
            const validationErrors = this.validateImportData(params.type, params.data);
            if (validationErrors.length > 0) {
                results.errors = validationErrors;
                results.failedCount = validationErrors.length;
                results.success = false;
                return results;
            }

            if (params.validateOnly) {
                results.successCount = params.data.length;
                return results;
            }

            await db.query('BEGIN');

            for (let i = 0; i < params.data.length; i++) {
                const row = params.data[i];

                try {
                    let insertedId: string;

                    switch (params.type) {
                        case 'properties':
                            insertedId = await this.importProperty(organizationId, userId, row);
                            break;
                        case 'tenants':
                            insertedId = await this.importTenant(organizationId, userId, row);
                            break;
                        case 'units':
                            insertedId = await this.importUnit(organizationId, userId, row);
                            break;
                        default:
                            throw new Error(`Unknown import type: ${params.type}`);
                    }

                    results.successCount++;
                    results.results.push({
                        id: insertedId,
                        status: 'success',
                        message: `${params.type} imported successfully`
                    });

                } catch (error: any) {
                    results.failedCount++;
                    results.errors.push({
                        index: i,
                        error: error.message
                    });
                    results.results.push({
                        id: `row-${i}`,
                        status: 'failed',
                        message: error.message
                    });
                }
            }

            await db.query('COMMIT');
            results.success = results.failedCount === 0;

            // Log audit
            await auditTrailService.log({
                organizationId,
                userId,
                action: AuditAction.IMPORT,
                resource: params.type === 'properties' ? AuditResource.PROPERTY :
                          params.type === 'tenants' ? AuditResource.TENANT :
                          AuditResource.PROPERTY,
                resourceId: 'bulk-import',
                resourceName: `Bulk ${params.type} import`,
                metadata: {
                    totalProcessed: results.totalProcessed,
                    successCount: results.successCount,
                    failedCount: results.failedCount
                }
            });

            logger.info('Bulk import completed', {
                organizationId,
                type: params.type,
                totalProcessed: results.totalProcessed,
                successCount: results.successCount,
                failedCount: results.failedCount
            });

            return results;

        } catch (error: any) {
            await db.query('ROLLBACK');
            logger.error('Bulk import failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Export data to CSV format
     */
    async exportData(
        organizationId: string,
        userId: string,
        type: 'properties' | 'tenants' | 'tenancies' | 'payments' | 'work-orders'
    ): Promise<{ data: Record<string, any>[]; columns: string[] }> {
        let query: string;
        let columns: string[];

        switch (type) {
            case 'properties':
                query = `
                    SELECT 
                        p.id,
                        p.title as name,
                        p.property_type,
                        COALESCE(p.address_street, '') as address_line_1,
                        '' as address_line_2,
                        COALESCE(p.address_city, '') as city,
                        p.region::text,
                        'Ghana' as country,
                        COALESCE(p.address_postal_code, '') as postal_code,
                        p.status::text,
                        0 as unit_count,
                        p.created_at
                    FROM properties p
                    WHERE p.organization_id = $1
                    ORDER BY p.title
                `;
                columns = ['id', 'name', 'property_type', 'address_line_1', 'address_line_2', 
                           'city', 'region', 'country', 'postal_code', 'status', 'unit_count', 'created_at'];
                break;

            case 'tenants':
                query = `
                    SELECT 
                        t.id,
                        COALESCE(t.first_name, split_part(t.full_name, ' ', 1)) as first_name,
                        COALESCE(t.last_name, split_part(t.full_name, ' ', 2)) as last_name,
                        t.email,
                        COALESCE(t.phone, t.phone_primary) as phone,
                        t.id_type,
                        t.id_number,
                        t.status,
                        t.created_at
                    FROM tenants t
                    WHERE t.organization_id = $1
                    ORDER BY t.full_name
                `;
                columns = ['id', 'first_name', 'last_name', 'email', 'phone', 
                           'id_type', 'id_number', 'status', 'created_at'];
                break;

            case 'tenancies':
                query = `
                    SELECT 
                        t.id,
                        p.title as property_name,
                        '' as unit_number,
                        ten.full_name as tenant_name,
                        t.lease_start_date as start_date,
                        t.lease_end_date as end_date,
                        t.monthly_rent,
                        t.security_deposit,
                        t.status,
                        t.created_at
                    FROM tenancies t
                    JOIN properties p ON t.property_id = p.id
                    JOIN tenants ten ON t.tenant_id = ten.id
                    WHERE t.organization_id = $1
                    ORDER BY p.title
                `;
                columns = ['id', 'property_name', 'unit_number', 'tenant_name', 'start_date',
                           'end_date', 'monthly_rent', 'security_deposit', 'status', 'created_at'];
                break;

            case 'payments':
                query = `
                    SELECT 
                        rp.id,
                        p.title as property_name,
                        '' as unit_number,
                        ten.full_name as tenant_name,
                        rp.amount_due,
                        rp.payment_amount as amount_paid,
                        rp.payment_date,
                        rp.payment_method,
                        rp.status,
                        rp.due_date,
                        rp.created_at
                    FROM rent_payments rp
                    JOIN tenancies t ON rp.tenancy_id = t.id
                    JOIN properties p ON t.property_id = p.id
                    JOIN tenants ten ON t.tenant_id = ten.id
                    WHERE rp.organization_id = $1
                    ORDER BY rc.due_date DESC
                `;
                columns = ['id', 'property_name', 'unit_number', 'tenant_name', 'amount_due',
                           'amount_paid', 'payment_date', 'payment_method', 'status', 'due_date', 'created_at'];
                break;

            case 'work-orders':
                // Work orders table may not exist yet, return empty
                query = `
                    SELECT 
                        NULL as id,
                        NULL as property_name,
                        NULL as unit_number,
                        NULL as category,
                        NULL as priority,
                        NULL as title,
                        NULL as status,
                        NULL as estimated_cost,
                        NULL as actual_cost,
                        NULL as vendor_name,
                        NULL as created_at,
                        NULL as completed_at
                    WHERE false
                `;
                columns = ['id', 'property_name', 'unit_number', 'category', 'priority', 'title',
                           'status', 'estimated_cost', 'actual_cost', 'vendor_name', 'created_at', 'completed_at'];
                break;

            default:
                throw new Error(`Unknown export type: ${type}`);
        }

        const result = await db.query(query, [organizationId]);

        // Log audit
        await auditTrailService.log({
            organizationId,
            userId,
            action: AuditAction.EXPORT,
            resource: AuditResource.REPORT,
            resourceId: 'bulk-export',
            resourceName: `${type} data export`,
            metadata: {
                recordCount: result.rows.length
            }
        });

        return {
            data: result.rows,
            columns
        };
    }

    /**
     * Bulk status update
     */
    async bulkStatusUpdate(
        organizationId: string,
        userId: string,
        params: {
            resource: 'properties' | 'tenants' | 'work-orders';
            ids: string[];
            status: string;
        }
    ): Promise<BulkOperationResult> {
        const results: BulkOperationResult = {
            success: true,
            totalProcessed: params.ids.length,
            successCount: 0,
            failedCount: 0,
            errors: [],
            results: []
        };

        const tableMap = {
            'properties': 'properties',
            'tenants': 'tenants',
            'work-orders': 'maintenance_work_orders'
        };

        const resourceMap = {
            'properties': AuditResource.PROPERTY,
            'tenants': AuditResource.TENANT,
            'work-orders': AuditResource.WORK_ORDER
        };

        const table = tableMap[params.resource];
        const auditResource = resourceMap[params.resource];

        try {
            await db.query('BEGIN');

            for (const id of params.ids) {
                try {
                    // Get previous status
                    const prevResult = await db.query(
                        `SELECT status FROM ${table} WHERE id = $1 AND organization_id = $2`,
                        [id, organizationId]
                    );

                    if (prevResult.rows.length === 0) {
                        throw new Error('Record not found');
                    }

                    const previousStatus = prevResult.rows[0].status;

                    // Update status
                    await db.query(
                        `UPDATE ${table} SET status = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3`,
                        [params.status, id, organizationId]
                    );

                    // Log audit
                    await auditTrailService.log({
                        organizationId,
                        userId,
                        action: AuditAction.UPDATE,
                        resource: auditResource,
                        resourceId: id,
                        previousData: { status: previousStatus },
                        newData: { status: params.status },
                        metadata: {
                            bulkOperation: 'status_update'
                        }
                    });

                    results.successCount++;
                    results.results.push({
                        id,
                        status: 'success',
                        message: `Status updated from ${previousStatus} to ${params.status}`
                    });

                } catch (error: any) {
                    results.failedCount++;
                    results.errors.push({
                        index: params.ids.indexOf(id),
                        id,
                        error: error.message
                    });
                    results.results.push({
                        id,
                        status: 'failed',
                        message: error.message
                    });
                }
            }

            await db.query('COMMIT');
            results.success = results.failedCount === 0;

            return results;

        } catch (error: any) {
            await db.query('ROLLBACK');
            logger.error('Bulk status update failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Validate import data structure
     */
    private validateImportData(type: string, data: Record<string, any>[]): Array<{ index: number; error: string }> {
        const errors: Array<{ index: number; error: string }> = [];
        const requiredFields: Record<string, string[]> = {
            properties: ['name', 'property_type', 'address_line_1', 'city', 'country'],
            tenants: ['first_name', 'last_name', 'email', 'phone'],
            units: ['property_id', 'unit_number']
        };

        const required = requiredFields[type] || [];

        data.forEach((row, index) => {
            for (const field of required) {
                if (!row[field]) {
                    errors.push({
                        index,
                        error: `Missing required field: ${field}`
                    });
                }
            }
        });

        return errors;
    }

    /**
     * Import a single property
     */
    private async importProperty(organizationId: string, userId: string, data: Record<string, any>): Promise<string> {
        const result = await db.query(`
            INSERT INTO properties (
                organization_id,
                name,
                property_type,
                address_line_1,
                address_line_2,
                city,
                region,
                country,
                postal_code,
                status,
                created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10)
            RETURNING id
        `, [
            organizationId,
            data.name,
            data.property_type,
            data.address_line_1,
            data.address_line_2 || null,
            data.city,
            data.region || null,
            data.country,
            data.postal_code || null,
            userId
        ]);

        return result.rows[0].id;
    }

    /**
     * Import a single tenant
     */
    private async importTenant(organizationId: string, userId: string, data: Record<string, any>): Promise<string> {
        const result = await db.query(`
            INSERT INTO tenants (
                organization_id,
                first_name,
                last_name,
                email,
                phone,
                id_type,
                id_number,
                status,
                created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)
            RETURNING id
        `, [
            organizationId,
            data.first_name,
            data.last_name,
            data.email,
            data.phone,
            data.id_type || null,
            data.id_number || null,
            userId
        ]);

        return result.rows[0].id;
    }

    /**
     * Import a single unit
     */
    private async importUnit(organizationId: string, userId: string, data: Record<string, any>): Promise<string> {
        const result = await db.query(`
            INSERT INTO units (
                organization_id,
                property_id,
                unit_number,
                floor,
                bedrooms,
                bathrooms,
                square_meters,
                monthly_rent,
                status,
                created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'vacant', $9)
            RETURNING id
        `, [
            organizationId,
            data.property_id,
            data.unit_number,
            data.floor || null,
            data.bedrooms || null,
            data.bathrooms || null,
            data.square_meters || null,
            data.monthly_rent || null,
            userId
        ]);

        return result.rows[0].id;
    }
}

export const bulkOperationsService = new BulkOperationsService();
