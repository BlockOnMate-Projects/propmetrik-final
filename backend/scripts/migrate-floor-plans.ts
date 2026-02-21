#!/usr/bin/env ts-node
/**
 * Floor Plan Migration Script
 * 
 * Batch migration of legacy Fabric.js floor plans to Blender-based geometry.
 * Processes all existing floor plans in the database, extracts room programs,
 * and generates new geometry versions.
 * 
 * Usage:
 *   npm run migrate:floor-plans
 *   npm run migrate:floor-plans -- --dry-run
 *   npm run migrate:floor-plans -- --valuation-id=<uuid>
 *   npm run migrate:floor-plans -- --batch-size=50
 * 
 * @module scripts/migrate-floor-plans
 * @version 1.0.0
 * @since Phase 5 - Week 15
 */

import { Pool } from 'pg';
import { 
  LegacyFloorPlanAnalyzer, 
  ExtractedRoomProgram,
  hashCanvas,
} from '../src/services/migration/analyzeLegacyFloorPlan';
import { getFloorPlanDesignIntentService } from '../src/services/ai/floorPlanDesignIntentService';
import { getBlenderGeometryService } from '../src/services/geometry/blenderGeometryService';
import { floorPlanService } from '../src/services/valuation-engine/floorPlanService';
import { logger } from '../src/utils/logger';

// ============================================================================
// TYPES
// ============================================================================

interface MigrationReport {
  total: number;
  migrated: number;
  failed: number;
  skipped: number;
  errors: MigrationError[];
  duration_ms: number;
  started_at: string;
  completed_at: string;
}

interface MigrationError {
  floor_plan_id: string;
  valuation_id: string;
  error: string;
  stage: 'analyze' | 'design_intent' | 'geometry' | 'store' | 'update';
}

interface MigrationOptions {
  dryRun: boolean;
  batchSize: number;
  valuationId?: string;
  skipFailed: boolean;
  forceRemigrate: boolean;
  concurrency: number;
}

interface LegacyFloorPlan {
  id: string;
  valuation_id: string;
  property_id: string;
  canvas_json: any;
  created_at: Date;
  migration_status: string | null;
  migration_error: string | null;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_OPTIONS: MigrationOptions = {
  dryRun: false,
  batchSize: 100,
  skipFailed: true,
  forceRemigrate: false,
  concurrency: 5,
};

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'pg.propmetrik.com',
  port: parseInt(process.env.DB_PORT || '5434', 10),
  database: process.env.DB_NAME || 'propmetrik',
  user: process.env.DB_USER || 'propmetrik_app',
  password: process.env.DB_PASSWORD,
});

// ============================================================================
// MIGRATION FUNCTIONS
// ============================================================================

/**
 * Get property features for design intent generation
 */
async function getPropertyFeatures(valuationId: string): Promise<any> {
  const result = await pool.query(`
    SELECT 
      v.id as valuation_id,
      p.property_type,
      p.bedrooms,
      p.bathrooms,
      p.total_area_sqm,
      p.land_size_sqm,
      p.year_built,
      p.floor_count,
      p.address,
      p.city,
      p.region
    FROM valuations v
    JOIN properties p ON v.property_id = p.id
    WHERE v.id = $1
  `, [valuationId]);

  if (result.rows.length === 0) {
    throw new Error(`Valuation not found: ${valuationId}`);
  }

  return result.rows[0];
}

/**
 * Migrate a single floor plan
 */
async function migrateFloorPlan(
  plan: LegacyFloorPlan,
  options: MigrationOptions
): Promise<{ success: boolean; error?: MigrationError }> {
  const stages = ['analyze', 'design_intent', 'geometry', 'store', 'update'] as const;
  let currentStage: typeof stages[number] = 'analyze';

  try {
    // Stage 1: Analyze legacy canvas
    currentStage = 'analyze';
    const analyzer = new LegacyFloorPlanAnalyzer();
    const analysisReport = await analyzer.analyze(plan.canvas_json);
    
    if (analysisReport.migration_feasibility === 'low') {
      logger.warn('Low migration feasibility', {
        floor_plan_id: plan.id,
        valuation_id: plan.valuation_id,
        notes: analysisReport.migration_notes,
      });
    }

    // Stage 2: Get property features and generate design intent
    currentStage = 'design_intent';
    const features = await getPropertyFeatures(plan.valuation_id);
    
    const designIntentService = getFloorPlanDesignIntentService();
    const designIntent = await designIntentService.createFromLegacy(
      analysisReport.room_program,
      features
    );

    if (options.dryRun) {
      logger.info('Dry run - would migrate', {
        floor_plan_id: plan.id,
        valuation_id: plan.valuation_id,
        rooms: analysisReport.room_program.rooms.length,
        total_area: analysisReport.room_program.total_area_sqm,
      });
      return { success: true };
    }

    // Stage 3: Generate Blender geometry
    currentStage = 'geometry';
    const blenderService = getBlenderGeometryService();
    const geometry = await blenderService.generate(designIntent);

    // Stage 4: Store new geometry version
    currentStage = 'store';
    await floorPlanService.storeGeometryVersion(plan.valuation_id, geometry, {
      migration_source: 'legacy_canvas',
      legacy_canvas_hash: hashCanvas(plan.canvas_json),
      analysis_report: analysisReport,
    });

    // Stage 5: Update migration status
    currentStage = 'update';
    await pool.query(`
      UPDATE valuation_floor_plans
      SET 
        migration_status = 'completed',
        legacy_canvas_json = canvas_json,
        migrated_at = NOW(),
        migration_metadata = $2
      WHERE id = $1
    `, [
      plan.id,
      JSON.stringify({
        migrated_at: new Date().toISOString(),
        canvas_hash: analysisReport.canvas_hash,
        room_count: analysisReport.room_program.room_count,
        confidence: analysisReport.room_program.extraction_confidence,
      }),
    ]);

    logger.info('Floor plan migrated successfully', {
      floor_plan_id: plan.id,
      valuation_id: plan.valuation_id,
      rooms: analysisReport.room_program.room_count,
    });

    return { success: true };

  } catch (error: any) {
    const migrationError: MigrationError = {
      floor_plan_id: plan.id,
      valuation_id: plan.valuation_id,
      error: error.message,
      stage: currentStage,
    };

    logger.error('Floor plan migration failed', {
      ...migrationError,
      stack: error.stack,
    });

    // Update migration status to failed
    if (!options.dryRun) {
      await pool.query(`
        UPDATE valuation_floor_plans
        SET 
          migration_status = 'failed',
          migration_error = $2
        WHERE id = $1
      `, [plan.id, error.message]);
    }

    return { success: false, error: migrationError };
  }
}

/**
 * Run batch migration
 */
async function migrateAllFloorPlans(options: MigrationOptions): Promise<MigrationReport> {
  const startTime = Date.now();
  const report: MigrationReport = {
    total: 0,
    migrated: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    duration_ms: 0,
    started_at: new Date().toISOString(),
    completed_at: '',
  };

  // Build query based on options
  let whereClause = 'WHERE canvas_json IS NOT NULL';
  const params: any[] = [];

  if (options.valuationId) {
    params.push(options.valuationId);
    whereClause += ` AND v.id = $${params.length}`;
  }

  if (!options.forceRemigrate) {
    whereClause += ` AND (vfp.migration_status IS NULL`;
    if (options.skipFailed) {
      whereClause += ` OR vfp.migration_status = 'pending')`;
    } else {
      whereClause += ` OR vfp.migration_status IN ('pending', 'failed'))`;
    }
  }

  // Get all floor plans to migrate
  const query = `
    SELECT 
      vfp.id,
      vfp.valuation_id,
      v.property_id,
      vfp.canvas_json,
      vfp.created_at,
      vfp.migration_status,
      vfp.migration_error
    FROM valuation_floor_plans vfp
    JOIN valuations v ON vfp.valuation_id = v.id
    ${whereClause}
    ORDER BY vfp.created_at DESC
    LIMIT $${params.length + 1}
  `;
  params.push(options.batchSize);

  const result = await pool.query(query, params);
  const plans: LegacyFloorPlan[] = result.rows;

  report.total = plans.length;
  console.log(`\n📋 Found ${report.total} floor plans to migrate\n`);

  if (report.total === 0) {
    console.log('No floor plans to migrate.');
    report.completed_at = new Date().toISOString();
    report.duration_ms = Date.now() - startTime;
    return report;
  }

  // Process in batches with concurrency
  const batchSize = options.concurrency;
  for (let i = 0; i < plans.length; i += batchSize) {
    const batch = plans.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(plans.length / batchSize);

    console.log(`Processing batch ${batchNumber}/${totalBatches}...`);

    const results = await Promise.all(
      batch.map(plan => migrateFloorPlan(plan, options))
    );

    for (const result of results) {
      if (result.success) {
        report.migrated++;
      } else if (result.error) {
        report.failed++;
        report.errors.push(result.error);
      }
    }

    // Progress update
    const progress = ((i + batch.length) / plans.length * 100).toFixed(1);
    console.log(`  Progress: ${progress}% | Migrated: ${report.migrated} | Failed: ${report.failed}`);
  }

  report.completed_at = new Date().toISOString();
  report.duration_ms = Date.now() - startTime;

  return report;
}

/**
 * Print migration report
 */
function printReport(report: MigrationReport): void {
  console.log('\n' + '='.repeat(60));
  console.log('MIGRATION REPORT');
  console.log('='.repeat(60));
  console.log(`Started:    ${report.started_at}`);
  console.log(`Completed:  ${report.completed_at}`);
  console.log(`Duration:   ${(report.duration_ms / 1000).toFixed(2)}s`);
  console.log('-'.repeat(60));
  console.log(`Total:      ${report.total}`);
  console.log(`Migrated:   ${report.migrated} (${(report.migrated / report.total * 100).toFixed(1)}%)`);
  console.log(`Failed:     ${report.failed} (${(report.failed / report.total * 100).toFixed(1)}%)`);
  console.log(`Skipped:    ${report.skipped}`);
  console.log('-'.repeat(60));

  if (report.errors.length > 0) {
    console.log('\nERRORS:');
    for (const error of report.errors.slice(0, 10)) {
      console.log(`  • ${error.floor_plan_id}: ${error.error} (stage: ${error.stage})`);
    }
    if (report.errors.length > 10) {
      console.log(`  ... and ${report.errors.length - 10} more errors`);
    }
  }

  console.log('='.repeat(60) + '\n');
}

// ============================================================================
// CLI
// ============================================================================

async function main(): Promise<void> {
  console.log('\n🏗️  PROPMETRIK Floor Plan Migration Tool\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  const options: MigrationOptions = { ...DEFAULT_OPTIONS };

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      console.log('🔍 Running in DRY RUN mode - no changes will be made\n');
    } else if (arg.startsWith('--valuation-id=')) {
      options.valuationId = arg.split('=')[1];
      console.log(`📍 Migrating single valuation: ${options.valuationId}\n`);
    } else if (arg.startsWith('--batch-size=')) {
      options.batchSize = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--include-failed') {
      options.skipFailed = false;
    } else if (arg === '--force') {
      options.forceRemigrate = true;
      console.log('⚠️  Force remigration enabled - will process already migrated plans\n');
    } else if (arg.startsWith('--concurrency=')) {
      options.concurrency = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--help') {
      console.log(`
Usage: npm run migrate:floor-plans [options]

Options:
  --dry-run              Run without making changes
  --valuation-id=<uuid>  Migrate specific valuation only
  --batch-size=<n>       Number of plans to process (default: 100)
  --include-failed       Also retry previously failed migrations
  --force                Re-migrate already completed plans
  --concurrency=<n>      Number of concurrent migrations (default: 5)
  --help                 Show this help message
`);
      process.exit(0);
    }
  }

  try {
    // Test database connection
    await pool.query('SELECT 1');
    console.log('✅ Database connection successful\n');

    // Run migration
    const report = await migrateAllFloorPlans(options);

    // Print report
    printReport(report);

    // Exit with appropriate code
    if (report.failed > 0 && report.migrated === 0) {
      process.exit(1);
    }

  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { migrateAllFloorPlans, migrateFloorPlan, MigrationReport, MigrationOptions };
