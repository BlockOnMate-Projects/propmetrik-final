import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.cedynhq.com:5434/propmetrik',
});

async function checkEnumAndMarkMigration() {
  const client = await pool.connect();
  try {
    // Check existing enum values
    const result = await client.query("SELECT enum_range(NULL::region_code_enum)");
    console.log('Existing enum values:', result.rows[0].enum_range);
    
    // Check if the values we need are already there
    const neededValues = [
      'ahafo', 'ashanti', 'bono', 'bono_east', 'central', 
      'north_east', 'northern', 'oti', 'savannah', 
      'upper_east', 'upper_west', 'volta', 'western', 'western_north'
    ];
    
    const existingValues = result.rows[0].enum_range.replace(/[{}]/g, '').split(',');
    console.log('Parsed values:', existingValues);
    
    const missing = neededValues.filter(v => !existingValues.includes(v));
    console.log('Missing values:', missing);
    
    if (missing.length === 0) {
      console.log('All required enum values exist! Marking migration as complete...');
      await client.query(`
        INSERT INTO migrations (name, executed_at) 
        VALUES ('040_expand_ghana_regions', NOW()) 
        ON CONFLICT (name) DO NOTHING
      `);
      console.log('Migration 040_expand_ghana_regions marked as complete');
    } else {
      console.log('Some enum values are missing. You need database superuser to add them.');
    }
    
  } finally {
    client.release();
    await pool.end();
  }
}

checkEnumAndMarkMigration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
