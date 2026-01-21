/**
 * Property Management Audit Trail Service
 * Phase 4.5: Activity Logging & Change Tracking
 * 
 * Provides comprehensive audit logging for all property management operations
 * 
 * @module services/property-management/audit
 */

import db from '../../../database';
import { logger } from '../../../utils/logger';

export enum AuditAction {
    CREATE = 'create',
    UPDATE = 'update',
    DELETE = 'delete',
    VIEW = 'view',
    EXPORT = 'export',
    IMPORT = 'import',
    ACTIVATE = 'activate',
    TERMINATE = 'terminate',
    RENEW = 'renew',
    ASSIGN = 'assign',
    COMPLETE = 'complete',
    APPROVE = 'approve',
    REJECT = 'reject',
    PAYMENT = 'payment',
    REFUND = 'refund',
    LOGIN = 'login',
    LOGOUT = 'logout'
}

export enum AuditResource {
    PROPERTY = 'property',
    TENANT = 'tenant',
    TENANCY = 'tenancy',
    PAYMENT = 'payment',
    WORK_ORDER = 'work_order',
    VENDOR = 'vendor',
    DOCUMENT = 'document',
    FINANCIAL_RECORD = 'financial_record',
    USER = 'user',
    REPORT = 'report'
}

export interface AuditLogEntry {
    id: string;
    organizationId: string;
    userId: string;
    userName?: string;
    action: AuditAction;
    resource: AuditResource;
    resourceId: string;
    resourceName?: string;
    previousData?: Record<string, any>;
    newData?: Record<string, any>;
    changedFields?: string[];
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
    createdAt: Date;
}

export interface AuditLogFilters {
    action?: AuditAction;
    resource?: AuditResource;
    resourceId?: string;
    userId?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
}

export class AuditTrailService {
    /**
     * Log an audit event
     */
    async log(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>): Promise<string> {
        try {
            // Calculate changed fields if both previous and new data exist
            let changedFields: string[] = [];
            if (entry.previousData && entry.newData) {
                changedFields = this.getChangedFields(entry.previousData, entry.newData);
            }

            const query = `
                INSERT INTO pm_audit_logs (
                    organization_id,
                    user_id,
                    user_name,
                    action,
                    resource,
                    resource_id,
                    resource_name,
                    previous_data,
                    new_data,
                    changed_fields,
                    ip_address,
                    user_agent,
                    metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING id
            `;

            const values = [
                entry.organizationId,
                entry.userId,
                entry.userName || null,
                entry.action,
                entry.resource,
                entry.resourceId,
                entry.resourceName || null,
                entry.previousData ? JSON.stringify(entry.previousData) : null,
                entry.newData ? JSON.stringify(entry.newData) : null,
                changedFields.length > 0 ? changedFields : null,
                entry.ipAddress || null,
                entry.userAgent || null,
                entry.metadata ? JSON.stringify(entry.metadata) : null
            ];

            const result = await db.query(query, values);
            const auditId = result.rows[0].id;

            logger.debug('Audit log created', {
                id: auditId,
                action: entry.action,
                resource: entry.resource,
                resourceId: entry.resourceId
            });

            return auditId;

        } catch (error: any) {
            // Log error but don't fail the main operation
            logger.error('Failed to create audit log', {
                error: error.message,
                entry: {
                    action: entry.action,
                    resource: entry.resource,
                    resourceId: entry.resourceId
                }
            });
            return '';
        }
    }

    /**
     * Get audit logs with filtering and pagination
     */
    async getLogs(
        organizationId: string,
        filters: AuditLogFilters = {},
        pagination: { page?: number; limit?: number } = {}
    ): Promise<{
        data: AuditLogEntry[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }> {
        const { page = 1, limit = 50 } = pagination;
        const offset = (page - 1) * limit;

        const conditions: string[] = ['organization_id = $1'];
        const params: any[] = [organizationId];
        let paramIndex = 2;

        if (filters.action) {
            conditions.push(`action = $${paramIndex}`);
            params.push(filters.action);
            paramIndex++;
        }

        if (filters.resource) {
            conditions.push(`resource = $${paramIndex}`);
            params.push(filters.resource);
            paramIndex++;
        }

        if (filters.resourceId) {
            conditions.push(`resource_id = $${paramIndex}`);
            params.push(filters.resourceId);
            paramIndex++;
        }

        if (filters.userId) {
            conditions.push(`user_id = $${paramIndex}`);
            params.push(filters.userId);
            paramIndex++;
        }

        if (filters.dateFrom) {
            conditions.push(`created_at >= $${paramIndex}`);
            params.push(filters.dateFrom);
            paramIndex++;
        }

        if (filters.dateTo) {
            conditions.push(`created_at <= $${paramIndex}`);
            params.push(filters.dateTo);
            paramIndex++;
        }

        if (filters.search) {
            conditions.push(`(resource_name ILIKE $${paramIndex} OR user_name ILIKE $${paramIndex})`);
            params.push(`%${filters.search}%`);
            paramIndex++;
        }

        const whereClause = conditions.join(' AND ');

        const countResult = await db.query(
            `SELECT COUNT(*) FROM pm_audit_logs WHERE ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        const dataQuery = `
            SELECT * FROM pm_audit_logs
            WHERE ${whereClause}
            ORDER BY created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        params.push(limit, offset);

        const dataResult = await db.query(dataQuery, params);

        const data: AuditLogEntry[] = dataResult.rows.map(row => ({
            id: row.id,
            organizationId: row.organization_id,
            userId: row.user_id,
            userName: row.user_name,
            action: row.action,
            resource: row.resource,
            resourceId: row.resource_id,
            resourceName: row.resource_name,
            previousData: row.previous_data,
            newData: row.new_data,
            changedFields: row.changed_fields,
            ipAddress: row.ip_address,
            userAgent: row.user_agent,
            metadata: row.metadata,
            createdAt: row.created_at
        }));

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    }

    /**
     * Get audit history for a specific resource
     */
    async getResourceHistory(
        organizationId: string,
        resource: AuditResource,
        resourceId: string
    ): Promise<AuditLogEntry[]> {
        const query = `
            SELECT * FROM pm_audit_logs
            WHERE organization_id = $1
            AND resource = $2
            AND resource_id = $3
            ORDER BY created_at DESC
            LIMIT 100
        `;

        const result = await db.query(query, [organizationId, resource, resourceId]);

        return result.rows.map(row => ({
            id: row.id,
            organizationId: row.organization_id,
            userId: row.user_id,
            userName: row.user_name,
            action: row.action,
            resource: row.resource,
            resourceId: row.resource_id,
            resourceName: row.resource_name,
            previousData: row.previous_data,
            newData: row.new_data,
            changedFields: row.changed_fields,
            ipAddress: row.ip_address,
            userAgent: row.user_agent,
            metadata: row.metadata,
            createdAt: row.created_at
        }));
    }

    /**
     * Get activity summary for dashboard
     */
    async getActivitySummary(
        organizationId: string,
        days: number = 7
    ): Promise<{
        totalActions: number;
        actionsByType: Record<string, number>;
        actionsByResource: Record<string, number>;
        recentActivity: AuditLogEntry[];
        topUsers: Array<{ userId: string; userName: string; actionCount: number }>;
    }> {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const summaryQuery = `
            SELECT 
                COUNT(*) as total,
                action,
                resource
            FROM pm_audit_logs
            WHERE organization_id = $1
            AND created_at >= $2
            GROUP BY action, resource
        `;

        const topUsersQuery = `
            SELECT 
                user_id,
                user_name,
                COUNT(*) as action_count
            FROM pm_audit_logs
            WHERE organization_id = $1
            AND created_at >= $2
            GROUP BY user_id, user_name
            ORDER BY action_count DESC
            LIMIT 10
        `;

        const recentQuery = `
            SELECT * FROM pm_audit_logs
            WHERE organization_id = $1
            AND created_at >= $2
            ORDER BY created_at DESC
            LIMIT 20
        `;

        const [summaryResult, topUsersResult, recentResult] = await Promise.all([
            db.query(summaryQuery, [organizationId, startDate]),
            db.query(topUsersQuery, [organizationId, startDate]),
            db.query(recentQuery, [organizationId, startDate])
        ]);

        const actionsByType: Record<string, number> = {};
        const actionsByResource: Record<string, number> = {};
        let totalActions = 0;

        summaryResult.rows.forEach(row => {
            const count = parseInt(row.total);
            totalActions += count;
            actionsByType[row.action] = (actionsByType[row.action] || 0) + count;
            actionsByResource[row.resource] = (actionsByResource[row.resource] || 0) + count;
        });

        return {
            totalActions,
            actionsByType,
            actionsByResource,
            recentActivity: recentResult.rows.map(row => ({
                id: row.id,
                organizationId: row.organization_id,
                userId: row.user_id,
                userName: row.user_name,
                action: row.action,
                resource: row.resource,
                resourceId: row.resource_id,
                resourceName: row.resource_name,
                previousData: row.previous_data,
                newData: row.new_data,
                changedFields: row.changed_fields,
                ipAddress: row.ip_address,
                userAgent: row.user_agent,
                metadata: row.metadata,
                createdAt: row.created_at
            })),
            topUsers: topUsersResult.rows.map(row => ({
                userId: row.user_id,
                userName: row.user_name || 'Unknown',
                actionCount: parseInt(row.action_count)
            }))
        };
    }

    /**
     * Calculate changed fields between two objects
     */
    private getChangedFields(previous: Record<string, any>, current: Record<string, any>): string[] {
        const changed: string[] = [];
        const allKeys = new Set([...Object.keys(previous), ...Object.keys(current)]);

        for (const key of allKeys) {
            if (JSON.stringify(previous[key]) !== JSON.stringify(current[key])) {
                changed.push(key);
            }
        }

        return changed;
    }
}

export const auditTrailService = new AuditTrailService();
