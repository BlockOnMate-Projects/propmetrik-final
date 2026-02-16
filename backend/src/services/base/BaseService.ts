/**
 * BaseService - Abstract Base Class for All Services
 * 
 * Phase 0.1: Foundation & Standards
 * 
 * This abstract class provides:
 * - Standardized database pool access
 * - Transaction wrapper (executeInTransaction)
 * - Consistent error handling with logging
 * - Query helper with error handling
 * - Abstract mapRow method for domain object mapping
 * - getByIdOrThrow helper for common pattern
 * 
 * All project-management services MUST extend this class.
 * 
 * @module services/base
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { pool } from '../../database';
import { logger } from '../../utils/logger';
import { 
  ServiceError, 
  NotFoundError, 
  ValidationError,
  DatabaseError 
} from '../project-management/errors';

export abstract class BaseService {
  protected pool: Pool = pool;
  protected logger = logger;
  protected serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  // ===========================================================================
  // TRANSACTION MANAGEMENT
  // ===========================================================================

  /**
   * Execute database operation within a transaction.
   * Automatically handles BEGIN, COMMIT, ROLLBACK, and client release.
   * 
   * @example
   * ```typescript
   * return this.executeInTransaction(async (client) => {
   *   await client.query('INSERT INTO projects...');
   *   await client.query('INSERT INTO phases...');
   *   return project;
   * });
   * ```
   */
  protected async executeInTransaction<T>(
    operation: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      this.logError('Transaction failed', error);
      throw this.wrapError(error);
    } finally {
      client.release();
    }
  }

  /**
   * Execute a transaction with a specific isolation level.
   * Use for operations requiring stronger consistency guarantees.
   */
  protected async executeInSerializableTransaction<T>(
    operation: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      this.logError('Serializable transaction failed', error);
      throw this.wrapError(error);
    } finally {
      client.release();
    }
  }

  // ===========================================================================
  // QUERY HELPERS
  // ===========================================================================

  /**
   * Execute a simple query with error handling and logging.
   */
  protected async query<T extends QueryResultRow = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    try {
      const result = await this.pool.query<T>(text, params);
      return result;
    } catch (error) {
      this.logError('Query failed', error, { query: text.substring(0, 100) });
      throw this.wrapError(error);
    }
  }

  /**
   * Execute a query using a transaction client.
   */
  protected async clientQuery<T extends QueryResultRow = any>(
    client: PoolClient,
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    try {
      return await client.query<T>(text, params);
    } catch (error) {
      this.logError('Client query failed', error, { query: text.substring(0, 100) });
      throw this.wrapError(error);
    }
  }

  // ===========================================================================
  // COMMON PATTERNS
  // ===========================================================================

  /**
   * Map database row to domain object.
   * Override this in each service to provide type-safe mapping.
   */
  protected abstract mapRow(row: any): any;

  /**
   * Map multiple rows using mapRow.
   */
  protected mapRows<T>(rows: any[]): T[] {
    return rows.map(row => this.mapRow(row) as T);
  }

  /**
   * Get entity by ID with automatic not-found handling.
   * Throws NotFoundError if entity doesn't exist.
   */
  protected async getByIdOrThrow<T>(
    table: string,
    id: string,
    entityName: string,
    additionalConditions?: string
  ): Promise<T> {
    const conditions = additionalConditions 
      ? `id = $1 AND deleted_at IS NULL AND ${additionalConditions}`
      : 'id = $1 AND deleted_at IS NULL';
    
    const result = await this.query(
      `SELECT * FROM ${table} WHERE ${conditions}`,
      [id]
    );
    
    if (result.rows.length === 0) {
      throw new NotFoundError(`${entityName} not found`, entityName.toLowerCase(), id);
    }
    
    return this.mapRow(result.rows[0]) as T;
  }

  /**
   * Get entity by ID, returning null if not found.
   */
  protected async getById<T>(
    table: string,
    id: string,
    additionalConditions?: string
  ): Promise<T | null> {
    const conditions = additionalConditions
      ? `id = $1 AND deleted_at IS NULL AND ${additionalConditions}`
      : 'id = $1 AND deleted_at IS NULL';
    
    const result = await this.query(
      `SELECT * FROM ${table} WHERE ${conditions}`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRow(result.rows[0]) as T;
  }

  /**
   * Check if an entity exists.
   */
  protected async exists(
    table: string,
    id: string,
    additionalConditions?: string
  ): Promise<boolean> {
    const conditions = additionalConditions
      ? `id = $1 AND deleted_at IS NULL AND ${additionalConditions}`
      : 'id = $1 AND deleted_at IS NULL';
    
    const result = await this.query(
      `SELECT 1 FROM ${table} WHERE ${conditions} LIMIT 1`,
      [id]
    );
    
    return result.rows.length > 0;
  }

  /**
   * Soft delete an entity.
   */
  protected async softDelete(
    table: string,
    id: string,
    deletedBy?: string
  ): Promise<boolean> {
    const result = await this.query(
      `UPDATE ${table} 
       SET deleted_at = NOW(), updated_at = NOW(), updated_by = $2
       WHERE id = $1 AND deleted_at IS NULL`,
      [id, deletedBy]
    );
    
    return (result.rowCount ?? 0) > 0;
  }

  // ===========================================================================
  // PAGINATION HELPERS
  // ===========================================================================

  /**
   * Calculate pagination values.
   */
  protected getPagination(page: number = 1, limit: number = 20): {
    offset: number;
    limit: number;
    page: number;
  } {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit)); // Max 100 items per page
    
    return {
      page: safePage,
      limit: safeLimit,
      offset: (safePage - 1) * safeLimit
    };
  }

  /**
   * Build pagination response.
   */
  protected buildPaginatedResponse<T>(
    data: T[],
    total: number,
    page: number,
    limit: number
  ): {
    data: T[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrevious: boolean;
    };
  } {
    const totalPages = Math.ceil(total / limit);
    
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1
      }
    };
  }

  // ===========================================================================
  // LOGGING HELPERS
  // ===========================================================================

  /**
   * Log info message with service context.
   */
  protected logInfo(message: string, data?: Record<string, any>): void {
    this.logger.info({ service: this.serviceName, ...data }, message);
  }

  /**
   * Log warning message with service context.
   */
  protected logWarn(message: string, data?: Record<string, any>): void {
    this.logger.warn({ service: this.serviceName, ...data }, message);
  }

  /**
   * Log error message with service context.
   */
  protected logError(message: string, error: any, data?: Record<string, any>): void {
    this.logger.error(
      { 
        service: this.serviceName, 
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        ...data 
      }, 
      message
    );
  }

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================

  /**
   * Wrap errors in appropriate ServiceError subclass.
   */
  protected wrapError(error: any): Error {
    // Already a ServiceError, return as-is
    if (error instanceof ServiceError) {
      return error;
    }

    // PostgreSQL unique violation
    if (error.code === '23505') {
      return new ValidationError(
        'A record with this value already exists',
        { constraint: error.constraint }
      );
    }

    // PostgreSQL foreign key violation
    if (error.code === '23503') {
      return new ValidationError(
        'Referenced record does not exist',
        { constraint: error.constraint }
      );
    }

    // PostgreSQL check constraint violation
    if (error.code === '23514') {
      return new ValidationError(
        'Value violates check constraint',
        { constraint: error.constraint }
      );
    }

    // PostgreSQL not null violation
    if (error.code === '23502') {
      return new ValidationError(
        `Required field is missing: ${error.column}`,
        { column: error.column }
      );
    }

    // PostgreSQL connection errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return new DatabaseError('Database connection failed');
    }

    // Generic database error
    if (error.code && typeof error.code === 'string' && error.code.startsWith('2')) {
      return new DatabaseError(
        error.message || 'Database operation failed',
        { originalCode: error.code }
      );
    }

    // Unknown error, wrap in ServiceError
    return new ServiceError(
      error.message || 'An unexpected error occurred',
      'INTERNAL_ERROR',
      500
    );
  }

  /**
   * Validate that a value is a valid UUID.
   */
  protected isValidUUID(value: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  /**
   * Validate UUID and throw if invalid.
   */
  protected validateUUID(value: string, fieldName: string): void {
    if (!this.isValidUUID(value)) {
      throw new ValidationError(`Invalid ${fieldName}: must be a valid UUID`);
    }
  }
}

export default BaseService;
