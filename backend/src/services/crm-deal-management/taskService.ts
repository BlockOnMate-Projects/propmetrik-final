/**
 * Task Service
 * Phase 5.2: CRM Service Layer
 * 
 * Handles task management with polymorphic associations (deals, contacts, properties).
 * Supports task assignment, due dates, priorities, and recurring tasks.
 * 
 * @module services/crm-deal-management/taskService
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../../database';
import { logger } from '../../utils/logger';
import { Task, CreateTaskInput, UpdateTaskInput, PaginatedResponse } from './types';
import { activityService } from './activityService';
import { notify, resolveStaffUser } from '../../../shared-services/notifications/in-mail';

// =============================================
// Types
// =============================================

export interface TaskFilters {
    deal_id?: string;
    contact_id?: string;
    property_id?: string;
    assigned_to?: string;
    task_status?: string;
    priority?: string;
    due_date_from?: Date;
    due_date_to?: Date;
    overdue_only?: boolean;
    page?: number;
    limit?: number;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
}

// =============================================
// Task Service Class
// =============================================

export class TaskService {
    /**
     * Create a new task
     */
    async createTask(
        organizationId: string,
        data: CreateTaskInput,
        userId?: string
    ): Promise<Task> {
        const id = uuidv4();

        try {
            const result = await db.query<Task>(
                `INSERT INTO tasks (
                    id, organization_id, title, description, task_type, priority,
                    deal_id, contact_id, property_id, assigned_to, assigned_by,
                    due_date, start_date, reminder_date, is_recurring,
                    recurrence_pattern, tags, created_by
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
                ) RETURNING *`,
                [
                    id,
                    organizationId,
                    data.title,
                    data.description || null,
                    data.task_type || null,
                    data.priority || 'medium',
                    data.deal_id || null,
                    data.contact_id || null,
                    data.property_id || null,
                    data.assigned_to,
                    userId || null,
                    data.due_date || null,
                    data.start_date || null,
                    data.reminder_date || null,
                    data.is_recurring || false,
                    data.recurrence_pattern ? JSON.stringify(data.recurrence_pattern) : null,
                    data.tags || null,
                    userId || null,
                ]
            );

            const task = result.rows[0];
            logger.info('Task created', { taskId: id, organizationId });

            // Log activity if associated with a deal
            if (data.deal_id && userId) {
                try {
                    await activityService.createActivity({
                        deal_id: data.deal_id,
                        user_id: userId,
                        activity_type: 'task_created',
                        subject: `Task created: ${data.title}`,
                        description: data.description,
                        new_value: {
                            task_id: id,
                            title: data.title,
                            due_date: data.due_date,
                            assigned_to: data.assigned_to,
                        },
                    });
                } catch (activityError) {
                    logger.error('Failed to log task creation activity', activityError);
                }
            }

            // Notify the assignee (skip self-assignment)
            if (data.assigned_to && data.assigned_to !== userId) {
                try {
                    const recipient = await resolveStaffUser(data.assigned_to);
                    if (recipient) {
                        await notify({
                            recipients: recipient,
                            category: 'crm',
                            type: 'task.assigned',
                            title: 'New task assigned to you',
                            body: `You have been assigned the task "${data.title}"${data.due_date ? `, due ${new Date(data.due_date).toLocaleDateString('en-GB')}` : ''}.`,
                            priority: data.priority === 'high' || data.priority === 'urgent' ? 'high' : 'normal',
                            organizationId,
                            sourceType: 'task',
                            sourceId: id,
                            sourceUrl: data.deal_id ? `/dashboard/deals/${data.deal_id}` : '/dashboard/deals/tasks',
                            channels: { inApp: true, email: true },
                        });
                    }
                } catch (notifyError: any) {
                    logger.warn('Failed to notify task assignee', { taskId: id, error: notifyError.message });
                }
            }

            return task;
        } catch (error) {
            logger.error('Error creating task', { error, organizationId });
            throw error;
        }
    }

    /**
     * Get task by ID
     */
    async getTaskById(taskId: string, organizationId: string): Promise<Task | null> {
        try {
            const result = await db.query<Task>(
                `SELECT t.*,
                    u.email as assigned_to_email,
                    u.first_name || ' ' || u.last_name as assigned_to_name,
                    d.deal_number, d.title as deal_title,
                    c.first_name || ' ' || c.last_name as contact_name
                FROM tasks t
                LEFT JOIN users u ON t.assigned_to = u.id
                LEFT JOIN deals d ON t.deal_id = d.id
                LEFT JOIN contacts c ON t.contact_id = c.id
                WHERE t.id = $1 AND t.organization_id = $2 AND t.deleted_at IS NULL`,
                [taskId, organizationId]
            );

            return result.rows[0] || null;
        } catch (error) {
            logger.error('Error fetching task', { error, taskId, organizationId });
            throw error;
        }
    }

    /**
     * List tasks with filters and pagination
     */
    async listTasks(
        organizationId: string,
        filters: TaskFilters = {}
    ): Promise<PaginatedResponse<Task>> {
        try {
            const page = filters.page || 1;
            const limit = filters.limit || 50;
            const offset = (page - 1) * limit;

            // Build WHERE conditions
            const conditions: string[] = ['t.organization_id = $1', 't.deleted_at IS NULL'];
            const params: any[] = [organizationId];
            let paramIndex = 2;

            if (filters.deal_id) {
                conditions.push(`t.deal_id = $${paramIndex}`);
                params.push(filters.deal_id);
                paramIndex++;
            }

            if (filters.contact_id) {
                conditions.push(`t.contact_id = $${paramIndex}`);
                params.push(filters.contact_id);
                paramIndex++;
            }

            if (filters.property_id) {
                conditions.push(`t.property_id = $${paramIndex}`);
                params.push(filters.property_id);
                paramIndex++;
            }

            if (filters.assigned_to) {
                conditions.push(`t.assigned_to = $${paramIndex}`);
                params.push(filters.assigned_to);
                paramIndex++;
            }

            if (filters.task_status) {
                conditions.push(`t.task_status = $${paramIndex}`);
                params.push(filters.task_status);
                paramIndex++;
            }

            if (filters.priority) {
                conditions.push(`t.priority = $${paramIndex}`);
                params.push(filters.priority);
                paramIndex++;
            }

            if (filters.due_date_from) {
                conditions.push(`t.due_date >= $${paramIndex}`);
                params.push(filters.due_date_from);
                paramIndex++;
            }

            if (filters.due_date_to) {
                conditions.push(`t.due_date <= $${paramIndex}`);
                params.push(filters.due_date_to);
                paramIndex++;
            }

            if (filters.overdue_only) {
                conditions.push(`t.due_date < NOW() AND t.task_status IN ('pending', 'in_progress')`);
            }

            const whereClause = conditions.join(' AND ');
            const sortBy = filters.sort_by || 'due_date';
            const sortOrder = filters.sort_order || 'asc';
            const orderBy = `t.${sortBy} ${sortOrder.toUpperCase()} NULLS LAST`;

            // Get total count
            const countResult = await db.query(
                `SELECT COUNT(*) as total FROM tasks t WHERE ${whereClause}`,
                params
            );
            const total = parseInt(countResult.rows[0].total, 10);

            // Get paginated data
            const dataParams = [...params, limit, offset];
            const result = await db.query<Task>(
                `SELECT t.*,
                    u.email as assigned_to_email,
                    u.first_name || ' ' || u.last_name as assigned_to_name,
                    d.deal_number, d.title as deal_title,
                    c.first_name || ' ' || c.last_name as contact_name
                FROM tasks t
                LEFT JOIN users u ON t.assigned_to = u.id
                LEFT JOIN deals d ON t.deal_id = d.id
                LEFT JOIN contacts c ON t.contact_id = c.id
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
            logger.error('Error listing tasks', { error, organizationId });
            throw error;
        }
    }

    /**
     * Get tasks for a specific entity (deal, contact, property)
     */
    async getTasksByEntity(
        organizationId: string,
        entityType: 'deal' | 'contact' | 'property',
        entityId: string
    ): Promise<Task[]> {
        try {
            const fieldMap = {
                deal: 'deal_id',
                contact: 'contact_id',
                property: 'property_id',
            };

            const result = await db.query<Task>(
                `SELECT t.*,
                    u.first_name || ' ' || u.last_name as assigned_to_name
                FROM tasks t
                LEFT JOIN users u ON t.assigned_to = u.id
                WHERE t.organization_id = $1 
                    AND t.${fieldMap[entityType]} = $2 
                    AND t.deleted_at IS NULL
                ORDER BY 
                    CASE WHEN t.task_status IN ('pending', 'in_progress') THEN 0 ELSE 1 END,
                    t.due_date NULLS LAST`,
                [organizationId, entityId]
            );

            return result.rows;
        } catch (error) {
            logger.error('Error fetching tasks by entity', { error, entityType, entityId, organizationId });
            throw error;
        }
    }

    /**
     * Update task
     */
    async updateTask(
        taskId: string,
        organizationId: string,
        data: UpdateTaskInput,
        userId?: string
    ): Promise<Task> {
        try {
            // Get current task for activity logging
            const currentTask = await this.getTaskById(taskId, organizationId);
            if (!currentTask) {
                throw new Error('Task not found');
            }

            const updates: string[] = [];
            const params: any[] = [];
            let paramIndex = 1;

            if (data.title !== undefined) {
                updates.push(`title = $${paramIndex}`);
                params.push(data.title);
                paramIndex++;
            }

            if (data.description !== undefined) {
                updates.push(`description = $${paramIndex}`);
                params.push(data.description);
                paramIndex++;
            }

            if (data.priority !== undefined) {
                updates.push(`priority = $${paramIndex}`);
                params.push(data.priority);
                paramIndex++;
            }

            if (data.task_status !== undefined) {
                updates.push(`task_status = $${paramIndex}`);
                params.push(data.task_status);
                paramIndex++;

                // Set completed_at when marking as completed
                if (data.task_status === 'completed' && !data.completed_at) {
                    updates.push(`completed_at = NOW()`);
                }
            }

            if (data.assigned_to !== undefined) {
                updates.push(`assigned_to = $${paramIndex}`);
                params.push(data.assigned_to);
                paramIndex++;
            }

            if (data.due_date !== undefined) {
                updates.push(`due_date = $${paramIndex}`);
                params.push(data.due_date);
                paramIndex++;
            }

            if (data.completed_at !== undefined) {
                updates.push(`completed_at = $${paramIndex}`);
                params.push(data.completed_at);
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

            if (updates.length === 0) {
                throw new Error('No fields to update');
            }

            params.push(taskId, organizationId);

            const result = await db.query<Task>(
                `UPDATE tasks
                SET ${updates.join(', ')}
                WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1} AND deleted_at IS NULL
                RETURNING *`,
                params
            );

            if (result.rows.length === 0) {
                throw new Error('Task not found or unauthorized');
            }

            const updatedTask = result.rows[0];
            logger.info('Task updated', { taskId, organizationId });

            // Log activity if task is associated with a deal and was completed
            if (currentTask.deal_id && data.task_status === 'completed' && userId) {
                try {
                    await activityService.createActivity({
                        deal_id: currentTask.deal_id,
                        user_id: userId,
                        activity_type: 'task_completed',
                        subject: `Task completed: ${currentTask.title}`,
                        outcome: 'completed',
                        old_value: { task_status: currentTask.task_status },
                        new_value: { task_status: 'completed' },
                    });
                } catch (activityError) {
                    logger.error('Failed to log task completion activity', activityError);
                }
            }

            return updatedTask;
        } catch (error) {
            logger.error('Error updating task', { error, taskId, organizationId });
            throw error;
        }
    }

    /**
     * Complete a task
     */
    async completeTask(
        taskId: string,
        organizationId: string,
        userId?: string
    ): Promise<Task> {
        return this.updateTask(taskId, organizationId, {
            task_status: 'completed',
            completed_at: new Date(),
        }, userId);
    }

    /**
     * Soft delete task
     */
    async deleteTask(taskId: string, organizationId: string): Promise<void> {
        try {
            const result = await db.query(
                `UPDATE tasks
                SET deleted_at = NOW()
                WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
                RETURNING id`,
                [taskId, organizationId]
            );

            if (result.rows.length === 0) {
                throw new Error('Task not found or already deleted');
            }

            logger.info('Task soft deleted', { taskId, organizationId });
        } catch (error) {
            logger.error('Error deleting task', { error, taskId, organizationId });
            throw error;
        }
    }

    /**
     * Get overdue tasks
     */
    async getOverdueTasks(
        organizationId: string,
        userId?: string
    ): Promise<Task[]> {
        try {
            const params: any[] = [organizationId];
            let userFilter = '';

            if (userId) {
                userFilter = 'AND t.assigned_to = $2';
                params.push(userId);
            }

            const result = await db.query<Task>(
                `SELECT t.*,
                    d.deal_number, d.title as deal_title,
                    c.first_name || ' ' || c.last_name as contact_name
                FROM tasks t
                LEFT JOIN deals d ON t.deal_id = d.id
                LEFT JOIN contacts c ON t.contact_id = c.id
                WHERE t.organization_id = $1 
                    AND t.due_date < NOW() 
                    AND t.task_status IN ('pending', 'in_progress')
                    AND t.deleted_at IS NULL
                    ${userFilter}
                ORDER BY t.due_date`,
                params
            );

            return result.rows;
        } catch (error) {
            logger.error('Error fetching overdue tasks', { error, organizationId });
            throw error;
        }
    }

    /**
     * Get upcoming tasks (due within X days)
     */
    async getUpcomingTasks(
        organizationId: string,
        daysAhead: number = 7,
        userId?: string
    ): Promise<Task[]> {
        try {
            const params: any[] = [organizationId, daysAhead];
            let userFilter = '';

            if (userId) {
                userFilter = 'AND t.assigned_to = $3';
                params.push(userId);
            }

            const result = await db.query<Task>(
                `SELECT t.*,
                    d.deal_number, d.title as deal_title,
                    c.first_name || ' ' || c.last_name as contact_name
                FROM tasks t
                LEFT JOIN deals d ON t.deal_id = d.id
                LEFT JOIN contacts c ON t.contact_id = c.id
                WHERE t.organization_id = $1 
                    AND t.due_date BETWEEN NOW() AND NOW() + INTERVAL '$2 days'
                    AND t.task_status IN ('pending', 'in_progress')
                    AND t.deleted_at IS NULL
                    ${userFilter}
                ORDER BY t.due_date`,
                params
            );

            return result.rows;
        } catch (error) {
            logger.error('Error fetching upcoming tasks', { error, organizationId });
            throw error;
        }
    }

    /**
     * Get task statistics
     */
    async getTaskStats(
        organizationId: string,
        userId?: string
    ): Promise<{
        total: number;
        pending: number;
        in_progress: number;
        completed: number;
        overdue: number;
        by_priority: Record<string, number>;
    }> {
        try {
            const params: any[] = [organizationId];
            let userFilter = '';

            if (userId) {
                userFilter = 'AND assigned_to = $2';
                params.push(userId);
            }

            const result = await db.query(
                `SELECT 
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE task_status = 'pending') as pending,
                    COUNT(*) FILTER (WHERE task_status = 'in_progress') as in_progress,
                    COUNT(*) FILTER (WHERE task_status = 'completed') as completed,
                    COUNT(*) FILTER (
                        WHERE due_date < NOW() 
                        AND task_status IN ('pending', 'in_progress')
                    ) as overdue,
                    COUNT(*) FILTER (WHERE priority = 'low') as priority_low,
                    COUNT(*) FILTER (WHERE priority = 'medium') as priority_medium,
                    COUNT(*) FILTER (WHERE priority = 'high') as priority_high,
                    COUNT(*) FILTER (WHERE priority = 'urgent') as priority_urgent
                FROM tasks
                WHERE organization_id = $1 AND deleted_at IS NULL ${userFilter}`,
                params
            );

            const row = result.rows[0];
            return {
                total: parseInt(row.total, 10),
                pending: parseInt(row.pending, 10),
                in_progress: parseInt(row.in_progress, 10),
                completed: parseInt(row.completed, 10),
                overdue: parseInt(row.overdue, 10),
                by_priority: {
                    low: parseInt(row.priority_low, 10),
                    medium: parseInt(row.priority_medium, 10),
                    high: parseInt(row.priority_high, 10),
                    urgent: parseInt(row.priority_urgent, 10),
                },
            };
        } catch (error) {
            logger.error('Error fetching task stats', { error, organizationId });
            throw error;
        }
    }

    /**
     * Bulk assign tasks
     */
    async bulkAssignTasks(
        organizationId: string,
        taskIds: string[],
        assignTo: string,
        userId?: string
    ): Promise<number> {
        try {
            const result = await db.query(
                `UPDATE tasks
                SET assigned_to = $1, updated_at = NOW()
                WHERE id = ANY($2) AND organization_id = $3 AND deleted_at IS NULL
                RETURNING id`,
                [assignTo, taskIds, organizationId]
            );

            logger.info('Tasks bulk assigned', {
                count: result.rows.length,
                assignTo,
                organizationId,
            });

            return result.rows.length;
        } catch (error) {
            logger.error('Error bulk assigning tasks', { error, organizationId });
            throw error;
        }
    }
}

export const taskService = new TaskService();
