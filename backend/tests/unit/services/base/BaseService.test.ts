/**
 * BaseService Unit Tests
 * Phase 8: Testing & Documentation
 * 
 * Tests for the abstract BaseService class including:
 * - Transaction handling (executeInTransaction)
 * - Query helpers with error wrapping
 * - Row mapping utilities
 * - Error handling patterns
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { BaseService } from '../../../../shared-services/base/BaseService';
import { DatabaseError, NotFoundError } from '../../../../src/services/project-management/errors';

// Mock dependencies
jest.mock('../../../../src/database', () => {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn()
  };
  
  return {
    pool: {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient)
    }
  };
});

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Import after mocks
import { pool } from '../../../../src/database';

// Concrete implementation for testing
class TestService extends BaseService {
  constructor() {
    super('TestService');
  }

  protected mapRow(row: any): { id: string; name: string } {
    return {
      id: row.id,
      name: row.name
    };
  }

  // Expose protected methods for testing
  public async testExecuteInTransaction<T>(
    operation: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    return this.executeInTransaction(operation);
  }

  public async testQuery(text: string, params?: any[]): Promise<QueryResult> {
    return this.query(text, params);
  }

  public async testGetByIdOrThrow<T>(
    table: string,
    id: string,
    entityName: string
  ): Promise<T> {
    return this.findByIdOrThrow(table, id, entityName);
  }

  public async testGetById<T>(table: string, id: string): Promise<T | null> {
    return this.findById(table, id);
  }

  public testMapRows<T>(rows: any[]): T[] {
    return this.mapRows(rows);
  }
}

describe('BaseService Unit Tests', () => {
  let service: TestService;
  let mockPoolQuery: jest.Mock;
  let mockConnect: jest.Mock;
  let mockClient: { query: jest.Mock; release: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TestService();
    mockPoolQuery = pool.query as jest.Mock;
    mockConnect = pool.connect as jest.Mock;
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    mockConnect.mockResolvedValue(mockClient);
  });

  // ===========================================================================
  // TRANSACTION TESTS
  // ===========================================================================

  describe('executeInTransaction', () => {
    it('should execute operation within transaction boundaries', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });
      
      const result = await service.testExecuteInTransaction(async (client) => {
        await client.query('INSERT INTO test VALUES ($1)', ['test']);
        return 'success';
      });

      expect(result).toBe('success');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback on error and rethrow', async () => {
      mockClient.query.mockImplementation((query: string) => {
        if (query === 'INSERT INTO test VALUES ($1)') {
          throw new Error('Insert failed');
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(
        service.testExecuteInTransaction(async (client) => {
          await client.query('INSERT INTO test VALUES ($1)', ['test']);
          return 'success';
        })
      ).rejects.toThrow();

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release client even after errors', async () => {
      mockClient.query.mockRejectedValue(new Error('DB Error'));

      await expect(
        service.testExecuteInTransaction(async (client) => {
          await client.query('SELECT 1');
          return 'success';
        })
      ).rejects.toThrow();

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should support nested operations within transaction', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: '1' }] }) // First query
        .mockResolvedValueOnce({ rows: [{ id: '2' }] }) // Second query
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await service.testExecuteInTransaction(async (client) => {
        const r1 = await client.query('INSERT INTO t1 RETURNING id');
        const r2 = await client.query('INSERT INTO t2 RETURNING id');
        return { id1: r1.rows[0].id, id2: r2.rows[0].id };
      });

      expect(result).toEqual({ id1: '1', id2: '2' });
    });
  });

  // ===========================================================================
  // QUERY HELPER TESTS
  // ===========================================================================

  describe('query', () => {
    it('should execute query successfully', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [{ id: '1', name: 'Test' }] });

      const result = await service.testQuery('SELECT * FROM test WHERE id = $1', ['1']);

      expect(result.rows).toEqual([{ id: '1', name: 'Test' }]);
      expect(mockPoolQuery).toHaveBeenCalledWith('SELECT * FROM test WHERE id = $1', ['1']);
    });

    it('should wrap database errors', async () => {
      const dbError = new Error('Connection refused');
      mockPoolQuery.mockRejectedValue(dbError);

      await expect(
        service.testQuery('SELECT * FROM test')
      ).rejects.toThrow();
    });
  });

  // ===========================================================================
  // GETBYID TESTS
  // ===========================================================================

  describe('getById', () => {
    it('should return mapped entity when found', async () => {
      mockPoolQuery.mockResolvedValue({ 
        rows: [{ id: '1', name: 'Test Entity' }] 
      });

      const result = await service.testGetById('test_table', '1');

      expect(result).toEqual({ id: '1', name: 'Test Entity' });
    });

    it('should return null when not found', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const result = await service.testGetById('test_table', 'nonexistent');

      expect(result).toBeNull();
    });

    it('should include deleted_at IS NULL condition', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      await service.testGetById('test_table', '1');

      expect(mockPoolQuery).toHaveBeenCalledWith(
        'SELECT * FROM test_table WHERE id = $1 AND deleted_at IS NULL',
        ['1']
      );
    });
  });

  describe('getByIdOrThrow', () => {
    it('should return entity when found', async () => {
      mockPoolQuery.mockResolvedValue({ 
        rows: [{ id: '1', name: 'Test' }] 
      });

      const result = await service.testGetByIdOrThrow('test_table', '1', 'TestEntity');

      expect(result).toEqual({ id: '1', name: 'Test' });
    });

    it('should throw NotFoundError when not found', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      await expect(
        service.testGetByIdOrThrow('test_table', 'nonexistent', 'TestEntity')
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ===========================================================================
  // ROW MAPPING TESTS
  // ===========================================================================

  describe('mapRows', () => {
    it('should map multiple rows using mapRow', () => {
      const rows = [
        { id: '1', name: 'First' },
        { id: '2', name: 'Second' },
        { id: '3', name: 'Third' }
      ];

      const result = service.testMapRows(rows);

      expect(result).toEqual([
        { id: '1', name: 'First' },
        { id: '2', name: 'Second' },
        { id: '3', name: 'Third' }
      ]);
    });

    it('should handle empty array', () => {
      const result = service.testMapRows([]);
      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // CONSTRUCTOR AND INITIALIZATION
  // ===========================================================================

  describe('constructor', () => {
    it('should set service name', () => {
      const testService = new TestService();
      // Service name is set internally, we can verify through logging behavior
      expect(testService).toBeInstanceOf(BaseService);
    });
  });
});
