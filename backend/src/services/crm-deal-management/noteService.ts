/**
 * Note Service
 * Phase 5.2: CRM Service Layer
 * 
 * Handles notes with polymorphic associations (deals, contacts, properties, companies).
 * Supports mentions, privacy settings, and pinning.
 * 
 * @module services/crm-deal-management/noteService
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../../database';
import { buildCrmOrderBy } from './queryHelpers';
import { logger } from '../../utils/logger';
import { Note, CreateNoteInput, PaginatedResponse } from './types';
import { activityService } from './activityService';

// =============================================
// Types
// =============================================

export interface NoteFilters {
    entity_type?: string;
    entity_id?: string;
    created_by?: string;
    is_pinned?: boolean;
    search?: string;
    tags?: string[];
    page?: number;
    limit?: number;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
}

export interface UpdateNoteInput {
    content?: string;
    is_private?: boolean;
    is_pinned?: boolean;
    mentions?: string[];
    tags?: string[];
}

// =============================================
// Note Service Class
// =============================================

export class NoteService {
    /**
     * Create a new note
     */
    async createNote(
        organizationId: string,
        data: CreateNoteInput,
        userId: string
    ): Promise<Note> {
        const id = uuidv4();

        try {
            const result = await db.query<Note>(
                `INSERT INTO notes (
                    id, organization_id, content, entity_type, entity_id,
                    is_private, is_pinned, mentions, tags, created_by
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
                ) RETURNING *`,
                [
                    id,
                    organizationId,
                    data.content,
                    data.entity_type,
                    data.entity_id,
                    data.is_private || false,
                    data.is_pinned || false,
                    data.mentions || null,
                    data.tags || null,
                    userId,
                ]
            );

            const note = result.rows[0];
            logger.info('Note created', { noteId: id, entityType: data.entity_type, entityId: data.entity_id });

            // Log activity if the note is on a deal
            if (data.entity_type === 'deal') {
                try {
                    await activityService.createActivity({
                        deal_id: data.entity_id,
                        user_id: userId,
                        activity_type: 'note_added',
                        subject: 'Note added',
                        description: data.content.substring(0, 200) + (data.content.length > 200 ? '...' : ''),
                        new_value: { note_id: id },
                    });
                } catch (activityError) {
                    logger.error('Failed to log note activity', activityError);
                }
            }

            return note;
        } catch (error) {
            logger.error('Error creating note', { error, organizationId });
            throw error;
        }
    }

    /**
     * Get note by ID
     */
    async getNoteById(
        noteId: string,
        organizationId: string,
        userId?: string
    ): Promise<Note | null> {
        try {
            // If userId provided, check private note access
            const privateFilter = userId
                ? `AND (n.is_private = false OR n.created_by = '${userId}')`
                : 'AND n.is_private = false';

            const result = await db.query<Note>(
                `SELECT n.*,
                    u.first_name || ' ' || u.last_name as created_by_name,
                    u.email as created_by_email
                FROM notes n
                LEFT JOIN users u ON n.created_by = u.id
                WHERE n.id = $1 AND n.organization_id = $2 AND n.deleted_at IS NULL
                    ${privateFilter}`,
                [noteId, organizationId]
            );

            return result.rows[0] || null;
        } catch (error) {
            logger.error('Error fetching note', { error, noteId, organizationId });
            throw error;
        }
    }

    /**
     * List notes with filters and pagination
     */
    async listNotes(
        organizationId: string,
        filters: NoteFilters = {},
        userId?: string
    ): Promise<PaginatedResponse<Note>> {
        try {
            const page = filters.page || 1;
            const limit = filters.limit || 50;
            const offset = (page - 1) * limit;

            // Build WHERE conditions
            const conditions: string[] = ['n.organization_id = $1', 'n.deleted_at IS NULL'];
            const params: any[] = [organizationId];
            let paramIndex = 2;

            // Privacy filter
            if (userId) {
                conditions.push(`(n.is_private = false OR n.created_by = $${paramIndex})`);
                params.push(userId);
                paramIndex++;
            } else {
                conditions.push(`n.is_private = false`);
            }

            if (filters.entity_type) {
                conditions.push(`n.entity_type = $${paramIndex}`);
                params.push(filters.entity_type);
                paramIndex++;
            }

            if (filters.entity_id) {
                conditions.push(`n.entity_id = $${paramIndex}`);
                params.push(filters.entity_id);
                paramIndex++;
            }

            if (filters.created_by) {
                conditions.push(`n.created_by = $${paramIndex}`);
                params.push(filters.created_by);
                paramIndex++;
            }

            if (filters.is_pinned !== undefined) {
                conditions.push(`n.is_pinned = $${paramIndex}`);
                params.push(filters.is_pinned);
                paramIndex++;
            }

            if (filters.search) {
                conditions.push(`n.search_vector @@ plainto_tsquery('english', $${paramIndex})`);
                params.push(filters.search);
                paramIndex++;
            }

            if (filters.tags && filters.tags.length > 0) {
                conditions.push(`n.tags && $${paramIndex}`);
                params.push(filters.tags);
                paramIndex++;
            }

            const whereClause = conditions.join(' AND ');
            const orderBy = `n.is_pinned DESC, ${buildCrmOrderBy(
                'n',
                ['created_at', 'updated_at', 'title'],
                filters.sort_by,
                'created_at',
                filters.sort_order,
                'desc',
            )}`;

            // Get total count
            const countResult = await db.query(
                `SELECT COUNT(*) as total FROM notes n WHERE ${whereClause}`,
                params
            );
            const total = parseInt(countResult.rows[0].total, 10);

            // Get paginated data
            const dataParams = [...params, limit, offset];
            const result = await db.query<Note>(
                `SELECT n.*,
                    u.first_name || ' ' || u.last_name as created_by_name,
                    u.email as created_by_email
                FROM notes n
                LEFT JOIN users u ON n.created_by = u.id
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
            logger.error('Error listing notes', { error, organizationId });
            throw error;
        }
    }

    /**
     * Get notes for a specific entity
     */
    async getNotesByEntity(
        organizationId: string,
        entityType: string,
        entityId: string,
        userId?: string
    ): Promise<Note[]> {
        try {
            const params: any[] = [organizationId, entityType, entityId];
            let privateFilter = 'AND n.is_private = false';

            if (userId) {
                privateFilter = `AND (n.is_private = false OR n.created_by = $4)`;
                params.push(userId);
            }

            const result = await db.query<Note>(
                `SELECT n.*,
                    u.first_name || ' ' || u.last_name as created_by_name,
                    u.email as created_by_email
                FROM notes n
                LEFT JOIN users u ON n.created_by = u.id
                WHERE n.organization_id = $1 
                    AND n.entity_type = $2 
                    AND n.entity_id = $3 
                    AND n.deleted_at IS NULL
                    ${privateFilter}
                ORDER BY n.is_pinned DESC, n.created_at DESC`,
                params
            );

            return result.rows;
        } catch (error) {
            logger.error('Error fetching notes by entity', { error, entityType, entityId, organizationId });
            throw error;
        }
    }

    /**
     * Update note
     */
    async updateNote(
        noteId: string,
        organizationId: string,
        data: UpdateNoteInput,
        userId: string
    ): Promise<Note> {
        try {
            // Verify ownership or admin
            const noteCheck = await db.query(
                `SELECT created_by FROM notes 
                WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
                [noteId, organizationId]
            );

            if (noteCheck.rows.length === 0) {
                throw new Error('Note not found');
            }

            if (noteCheck.rows[0].created_by !== userId) {
                // TODO: Add admin check here
                throw new Error('Only note creator can edit');
            }

            const updates: string[] = [];
            const params: any[] = [];
            let paramIndex = 1;

            if (data.content !== undefined) {
                updates.push(`content = $${paramIndex}`);
                params.push(data.content);
                paramIndex++;
            }

            if (data.is_private !== undefined) {
                updates.push(`is_private = $${paramIndex}`);
                params.push(data.is_private);
                paramIndex++;
            }

            if (data.is_pinned !== undefined) {
                updates.push(`is_pinned = $${paramIndex}`);
                params.push(data.is_pinned);
                paramIndex++;
            }

            if (data.mentions !== undefined) {
                updates.push(`mentions = $${paramIndex}`);
                params.push(data.mentions);
                paramIndex++;
            }

            if (data.tags !== undefined) {
                updates.push(`tags = $${paramIndex}`);
                params.push(data.tags);
                paramIndex++;
            }

            updates.push(`updated_by = $${paramIndex}`);
            params.push(userId);
            paramIndex++;

            if (updates.length === 1) {
                throw new Error('No fields to update');
            }

            params.push(noteId, organizationId);

            const result = await db.query<Note>(
                `UPDATE notes
                SET ${updates.join(', ')}
                WHERE id = $${paramIndex} AND organization_id = $${paramIndex + 1} AND deleted_at IS NULL
                RETURNING *`,
                params
            );

            if (result.rows.length === 0) {
                throw new Error('Note not found or unauthorized');
            }

            logger.info('Note updated', { noteId, organizationId });
            return result.rows[0];
        } catch (error) {
            logger.error('Error updating note', { error, noteId, organizationId });
            throw error;
        }
    }

    /**
     * Toggle pin status
     */
    async togglePin(
        noteId: string,
        organizationId: string,
        userId: string
    ): Promise<Note> {
        try {
            const result = await db.query<Note>(
                `UPDATE notes
                SET is_pinned = NOT is_pinned, updated_by = $3
                WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
                RETURNING *`,
                [noteId, organizationId, userId]
            );

            if (result.rows.length === 0) {
                throw new Error('Note not found');
            }

            logger.info('Note pin toggled', { noteId, isPinned: result.rows[0].is_pinned });
            return result.rows[0];
        } catch (error) {
            logger.error('Error toggling note pin', { error, noteId, organizationId });
            throw error;
        }
    }

    /**
     * Soft delete note
     */
    async deleteNote(
        noteId: string,
        organizationId: string,
        userId: string
    ): Promise<void> {
        try {
            // Verify ownership or admin
            const noteCheck = await db.query(
                `SELECT created_by FROM notes 
                WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
                [noteId, organizationId]
            );

            if (noteCheck.rows.length === 0) {
                throw new Error('Note not found');
            }

            if (noteCheck.rows[0].created_by !== userId) {
                // TODO: Add admin check here
                throw new Error('Only note creator can delete');
            }

            await db.query(
                `UPDATE notes
                SET deleted_at = NOW()
                WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
                [noteId, organizationId]
            );

            logger.info('Note soft deleted', { noteId, organizationId });
        } catch (error) {
            logger.error('Error deleting note', { error, noteId, organizationId });
            throw error;
        }
    }

    /**
     * Get recent notes across all entities for a user
     */
    async getRecentNotes(
        organizationId: string,
        userId: string,
        limit: number = 20
    ): Promise<Note[]> {
        try {
            const result = await db.query<Note>(
                `SELECT n.*,
                    u.first_name || ' ' || u.last_name as created_by_name,
                    CASE 
                        WHEN n.entity_type = 'deal' THEN d.title
                        WHEN n.entity_type = 'contact' THEN c.first_name || ' ' || c.last_name
                        WHEN n.entity_type = 'company' THEN comp.company_name
                        ELSE NULL
                    END as entity_name
                FROM notes n
                LEFT JOIN users u ON n.created_by = u.id
                LEFT JOIN deals d ON n.entity_type = 'deal' AND n.entity_id = d.id
                LEFT JOIN contacts c ON n.entity_type = 'contact' AND n.entity_id = c.id
                LEFT JOIN companies comp ON n.entity_type = 'company' AND n.entity_id = comp.id
                WHERE n.organization_id = $1 
                    AND n.deleted_at IS NULL
                    AND (n.is_private = false OR n.created_by = $2)
                ORDER BY n.created_at DESC
                LIMIT $3`,
                [organizationId, userId, limit]
            );

            return result.rows;
        } catch (error) {
            logger.error('Error fetching recent notes', { error, organizationId });
            throw error;
        }
    }

    /**
     * Search notes
     */
    async searchNotes(
        organizationId: string,
        query: string,
        userId?: string,
        limit: number = 50
    ): Promise<Note[]> {
        try {
            const params: any[] = [organizationId, query, limit];
            let privateFilter = 'AND n.is_private = false';

            if (userId) {
                privateFilter = `AND (n.is_private = false OR n.created_by = $4)`;
                params.push(userId);
            }

            const result = await db.query<Note>(
                `SELECT n.*,
                    u.first_name || ' ' || u.last_name as created_by_name,
                    ts_rank(n.search_vector, plainto_tsquery('english', $2)) as rank
                FROM notes n
                LEFT JOIN users u ON n.created_by = u.id
                WHERE n.organization_id = $1 
                    AND n.search_vector @@ plainto_tsquery('english', $2)
                    AND n.deleted_at IS NULL
                    ${privateFilter}
                ORDER BY rank DESC, n.created_at DESC
                LIMIT $3`,
                params
            );

            return result.rows;
        } catch (error) {
            logger.error('Error searching notes', { error, organizationId, query });
            throw error;
        }
    }
}

export const noteService = new NoteService();
