import { pool } from './src/database/index';

async function cleanup() {
  try {
    const tables = [
        'valuation_floor_plans',
        'valuation_floor_plan_rooms',
        'valuation_hbu_analyses',
        'valuation_user_overrides',
        'valuation_comparable_baskets',
        'valuation_basket_comparables',
        'valuation_sensitivity_analyses',
        'valuation_reconciliations',
        'ghana_building_code_standards'
    ];

    for (const table of tables) {
        console.log(`Dropping ${table}...`);
        await pool.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    }
    
    // Also delete the migration record if it exists
    console.log('Deleting migration record...');
    await pool.query(`DELETE FROM migrations WHERE name = '016_valuation_gaps'`);

    console.log('Cleanup complete');
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

cleanup();
