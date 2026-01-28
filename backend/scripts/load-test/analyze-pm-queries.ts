/**
 * Property Management Query Performance Analyzer
 * 
 * Identifies slow queries and suggests optimizations.
 * Creates necessary database indexes for PM operations.
 * 
 * Usage:
 *   npx ts-node backend/scripts/load-test/analyze-pm-queries.ts
 */

import { pool } from '../../src/database';
import { logger } from '../../src/utils/logger';

interface SlowQuery {
  query: string;
  calls: number;
  totalTime: number;
  meanTime: number;
  rows: number;
}

interface IndexSuggestion {
  table: string;
  columns: string[];
  reason: string;
  createStatement: string;
}

// ============================================================================
// QUERY ANALYSIS
// ============================================================================

async function getSlowQueries(minTime = 50): Promise<SlowQuery[]> {
  try {
    const result = await pool.query(`
      SELECT 
        query,
        calls,
        total_exec_time as total_time,
        mean_exec_time as mean_time,
        rows
      FROM pg_stat_statements
      WHERE 
        query NOT LIKE '%pg_stat%'
        AND mean_exec_time > $1
        AND query LIKE '%pm_%'
      ORDER BY mean_exec_time DESC
      LIMIT 20
    `, [minTime]);

    return result.rows;
  } catch (error: any) {
    if (error.code === '42P01') {
      logger.warn('pg_stat_statements extension not enabled. Enable with: CREATE EXTENSION pg_stat_statements');
      return [];
    }
    throw error;
  }
}

// ============================================================================
// INDEX RECOMMENDATIONS
// ============================================================================

const PM_INDEXES: IndexSuggestion[] = [
  // Properties
  {
    table: 'pm_properties',
    columns: ['organization_id', 'operational_status'],
    reason: 'Filter properties by organization and status',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_properties_org_status ON pm_properties(organization_id, operational_status);',
  },
  {
    table: 'pm_properties',
    columns: ['created_at'],
    reason: 'Order properties by creation date',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_properties_created ON pm_properties(created_at DESC);',
  },

  // Units
  {
    table: 'pm_units',
    columns: ['property_id', 'current_status'],
    reason: 'Filter units by property and occupancy status',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_units_property_status ON pm_units(property_id, current_status);',
  },
  {
    table: 'pm_units',
    columns: ['organization_id', 'unit_type'],
    reason: 'Filter units by organization and type',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_units_org_type ON pm_units(organization_id, unit_type);',
  },

  // Tenants
  {
    table: 'pm_tenants',
    columns: ['organization_id', 'status'],
    reason: 'Filter tenants by organization and status',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_tenants_org_status ON pm_tenants(organization_id, status);',
  },
  {
    table: 'pm_tenants',
    columns: ['first_name', 'last_name'],
    reason: 'Search tenants by name',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_tenants_name ON pm_tenants(first_name, last_name);',
  },
  {
    table: 'pm_tenants',
    columns: ['email'],
    reason: 'Lookup tenant by email',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_tenants_email ON pm_tenants(email);',
  },
  {
    table: 'pm_tenants',
    columns: ['phone'],
    reason: 'Lookup tenant by phone',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_tenants_phone ON pm_tenants(phone);',
  },

  // Tenancies
  {
    table: 'pm_tenancies',
    columns: ['unit_id', 'status'],
    reason: 'Get active tenancy for unit',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_tenancies_unit_status ON pm_tenancies(unit_id, status);',
  },
  {
    table: 'pm_tenancies',
    columns: ['tenant_id', 'status'],
    reason: 'Get tenant leases',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_tenancies_tenant_status ON pm_tenancies(tenant_id, status);',
  },
  {
    table: 'pm_tenancies',
    columns: ['end_date'],
    reason: 'Find expiring leases',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_tenancies_end_date ON pm_tenancies(end_date) WHERE status = \'active\';',
  },
  {
    table: 'pm_tenancies',
    columns: ['organization_id', 'status', 'start_date'],
    reason: 'Organization lease reports',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_tenancies_org_status_start ON pm_tenancies(organization_id, status, start_date);',
  },

  // Payments
  {
    table: 'pm_payments',
    columns: ['tenancy_id', 'payment_date'],
    reason: 'Get payments for tenancy',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_payments_tenancy_date ON pm_payments(tenancy_id, payment_date DESC);',
  },
  {
    table: 'pm_payments',
    columns: ['organization_id', 'payment_status', 'payment_date'],
    reason: 'Organization payment reports',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_payments_org_status_date ON pm_payments(organization_id, payment_status, payment_date);',
  },
  {
    table: 'pm_payments',
    columns: ['payment_period_start', 'payment_period_end'],
    reason: 'Find payments by period',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_payments_period ON pm_payments(payment_period_start, payment_period_end);',
  },
  {
    table: 'pm_payments',
    columns: ['payment_reference'],
    reason: 'Lookup payment by reference',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_payments_reference ON pm_payments(payment_reference);',
  },

  // Maintenance Requests
  {
    table: 'pm_maintenance_requests',
    columns: ['organization_id', 'status', 'priority'],
    reason: 'Filter maintenance by status and priority',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_maintenance_org_status_priority ON pm_maintenance_requests(organization_id, status, priority);',
  },
  {
    table: 'pm_maintenance_requests',
    columns: ['unit_id', 'status'],
    reason: 'Get maintenance for unit',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_maintenance_unit_status ON pm_maintenance_requests(unit_id, status);',
  },
  {
    table: 'pm_maintenance_requests',
    columns: ['created_at'],
    reason: 'Order by creation date',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_maintenance_created ON pm_maintenance_requests(created_at DESC);',
  },

  // Work Orders
  {
    table: 'pm_work_orders',
    columns: ['vendor_id', 'status'],
    reason: 'Get work orders for vendor',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_work_orders_vendor_status ON pm_work_orders(vendor_id, status);',
  },
  {
    table: 'pm_work_orders',
    columns: ['maintenance_request_id'],
    reason: 'Get work orders for request',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_work_orders_request ON pm_work_orders(maintenance_request_id);',
  },
  {
    table: 'pm_work_orders',
    columns: ['scheduled_date'],
    reason: 'Get scheduled work orders',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_work_orders_scheduled ON pm_work_orders(scheduled_date) WHERE status IN (\'pending\', \'assigned\', \'in_progress\');',
  },

  // Vendors
  {
    table: 'pm_vendors',
    columns: ['organization_id', 'status', 'category'],
    reason: 'Filter vendors by category',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_vendors_org_status_category ON pm_vendors(organization_id, status, category);',
  },
  {
    table: 'pm_vendors',
    columns: ['average_rating'],
    reason: 'Sort vendors by rating',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_vendors_rating ON pm_vendors(average_rating DESC NULLS LAST);',
  },

  // Applications
  {
    table: 'pm_applications',
    columns: ['organization_id', 'status', 'created_at'],
    reason: 'Filter applications by status',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_applications_org_status_date ON pm_applications(organization_id, status, created_at DESC);',
  },
  {
    table: 'pm_applications',
    columns: ['unit_id', 'status'],
    reason: 'Get applications for unit',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_applications_unit_status ON pm_applications(unit_id, status);',
  },

  // Expenses
  {
    table: 'pm_expenses',
    columns: ['property_id', 'expense_date'],
    reason: 'Get property expenses for financial reports',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_expenses_property_date ON pm_expenses(property_id, expense_date);',
  },
  {
    table: 'pm_expenses',
    columns: ['organization_id', 'expense_category', 'expense_date'],
    reason: 'Expense reports by category',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_expenses_org_category_date ON pm_expenses(organization_id, expense_category, expense_date);',
  },

  // Invoices
  {
    table: 'pm_invoices',
    columns: ['tenancy_id', 'status'],
    reason: 'Get invoices for tenancy',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_invoices_tenancy_status ON pm_invoices(tenancy_id, status);',
  },
  {
    table: 'pm_invoices',
    columns: ['due_date', 'status'],
    reason: 'Find overdue invoices',
    createStatement: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pm_invoices_due_status ON pm_invoices(due_date, status) WHERE status IN (\'unpaid\', \'partial\');',
  },
];

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

async function analyzeTableStats(): Promise<void> {
  logger.info('Analyzing PM table statistics...');

  const tables = [
    'pm_properties',
    'pm_units',
    'pm_tenants',
    'pm_tenancies',
    'pm_payments',
    'pm_maintenance_requests',
    'pm_work_orders',
    'pm_vendors',
    'pm_applications',
    'pm_expenses',
    'pm_invoices',
  ];

  for (const table of tables) {
    try {
      const countResult = await pool.query(`SELECT COUNT(*) FROM ${table}`);
      const sizeResult = await pool.query(`
        SELECT pg_size_pretty(pg_total_relation_size($1)) as size
      `, [table]);

      logger.info(`Table ${table}: ${countResult.rows[0].count} rows, ${sizeResult.rows[0].size}`);
    } catch (error: any) {
      if (error.code === '42P01') {
        logger.warn(`Table ${table} does not exist`);
      }
    }
  }
}

async function checkExistingIndexes(): Promise<string[]> {
  logger.info('Checking existing indexes...');

  const result = await pool.query(`
    SELECT indexname, tablename
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename LIKE 'pm_%'
    ORDER BY tablename, indexname
  `);

  return result.rows.map(r => r.indexname);
}

async function suggestMissingIndexes(existingIndexes: string[]): Promise<IndexSuggestion[]> {
  const missing: IndexSuggestion[] = [];

  for (const suggestion of PM_INDEXES) {
    // Check if index already exists (approximate match)
    const indexName = suggestion.createStatement.match(/idx_\w+/)?.[0];
    if (indexName && !existingIndexes.includes(indexName)) {
      missing.push(suggestion);
    }
  }

  return missing;
}

async function createMissingIndexes(suggestions: IndexSuggestion[]): Promise<void> {
  logger.info(`Creating ${suggestions.length} missing indexes...`);

  for (const suggestion of suggestions) {
    try {
      logger.info(`Creating index: ${suggestion.createStatement}`);
      await pool.query(suggestion.createStatement);
      logger.info(`✓ Created index for ${suggestion.table} (${suggestion.columns.join(', ')})`);
    } catch (error: any) {
      if (error.code === '42P07') {
        logger.info(`Index already exists for ${suggestion.table}`);
      } else if (error.code === '42P01') {
        logger.warn(`Table ${suggestion.table} does not exist`);
      } else {
        logger.error(`Failed to create index for ${suggestion.table}: ${error.message}`);
      }
    }
  }
}

async function analyzeQueryPlans(): Promise<void> {
  logger.info('Analyzing query plans for common PM operations...');

  const queries = [
    {
      name: 'List properties with filters',
      sql: `EXPLAIN (ANALYZE, COSTS, BUFFERS, FORMAT JSON)
            SELECT * FROM pm_properties 
            WHERE organization_id = '00000000-0000-0000-0000-000000000001'
            AND operational_status = 'operational'
            ORDER BY created_at DESC
            LIMIT 20`,
    },
    {
      name: 'Get active tenancies for unit',
      sql: `EXPLAIN (ANALYZE, COSTS, BUFFERS, FORMAT JSON)
            SELECT * FROM pm_tenancies
            WHERE unit_id = '00000000-0000-0000-0000-000000000001'
            AND status = 'active'`,
    },
    {
      name: 'Payment summary by month',
      sql: `EXPLAIN (ANALYZE, COSTS, BUFFERS, FORMAT JSON)
            SELECT DATE_TRUNC('month', payment_date) as month,
                   SUM(amount_paid) as total
            FROM pm_payments
            WHERE organization_id = '00000000-0000-0000-0000-000000000001'
            AND payment_date >= '2024-01-01'
            GROUP BY DATE_TRUNC('month', payment_date)
            ORDER BY month`,
    },
    {
      name: 'Open maintenance by priority',
      sql: `EXPLAIN (ANALYZE, COSTS, BUFFERS, FORMAT JSON)
            SELECT * FROM pm_maintenance_requests
            WHERE organization_id = '00000000-0000-0000-0000-000000000001'
            AND status = 'open'
            ORDER BY priority DESC, created_at ASC
            LIMIT 50`,
    },
  ];

  for (const query of queries) {
    try {
      const result = await pool.query(query.sql);
      const plan = result.rows[0]['QUERY PLAN'][0];
      
      logger.info(`Query: ${query.name}`);
      logger.info(`  Execution time: ${plan['Execution Time']}ms`);
      logger.info(`  Planning time: ${plan['Planning Time']}ms`);
      logger.info(`  Total cost: ${plan.Plan['Total Cost']}`);
      
      // Check for sequential scans on large tables
      if (JSON.stringify(plan).includes('Seq Scan')) {
        logger.warn(`  ⚠️ Sequential scan detected - consider adding index`);
      }
    } catch (error: any) {
      if (error.code === '42P01') {
        logger.debug(`Skipping query analysis: ${query.name} (table not found)`);
      } else {
        logger.error(`Error analyzing query ${query.name}: ${error.message}`);
      }
    }
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main(): Promise<void> {
  logger.info('='.repeat(60));
  logger.info('Property Management Query Performance Analyzer');
  logger.info('='.repeat(60));

  try {
    // 1. Analyze table statistics
    await analyzeTableStats();

    // 2. Check existing indexes
    const existingIndexes = await checkExistingIndexes();
    logger.info(`Found ${existingIndexes.length} existing PM indexes`);

    // 3. Get missing index suggestions
    const missing = await suggestMissingIndexes(existingIndexes);
    
    if (missing.length > 0) {
      logger.info(`\nMissing indexes (${missing.length}):`);
      for (const suggestion of missing) {
        logger.info(`  - ${suggestion.table} (${suggestion.columns.join(', ')}): ${suggestion.reason}`);
      }

      // 4. Create missing indexes if --create flag is passed
      if (process.argv.includes('--create')) {
        await createMissingIndexes(missing);
      } else {
        logger.info('\nRun with --create flag to create missing indexes');
      }
    } else {
      logger.info('All recommended indexes are present');
    }

    // 5. Analyze slow queries (if pg_stat_statements is enabled)
    const slowQueries = await getSlowQueries();
    if (slowQueries.length > 0) {
      logger.info(`\nSlow queries (mean time > 50ms):`);
      for (const q of slowQueries) {
        logger.info(`  - Mean: ${q.meanTime.toFixed(2)}ms, Calls: ${q.calls}`);
        logger.info(`    ${q.query.substring(0, 100)}...`);
      }
    }

    // 6. Analyze query plans
    await analyzeQueryPlans();

    logger.info('\n' + '='.repeat(60));
    logger.info('Analysis complete');
    logger.info('='.repeat(60));

  } catch (error) {
    logger.error('Analysis failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
