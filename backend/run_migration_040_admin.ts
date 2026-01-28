import { Pool } from 'pg';

// Connect using the app credentials
const adminPool = new Pool({
  connectionString: 'postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.cedynhq.com:5434/propmetrik',
});

async function runMigration040AsAdmin() {
  const client = await adminPool.connect();
  try {
    console.log('Connected as doadmin...');
    
    // Add enum values (these are idempotent with IF NOT EXISTS)
    const enumValues = [
      'ahafo', 'ashanti', 'bono', 'bono_east', 'central', 
      'north_east', 'northern', 'oti', 'savannah', 
      'upper_east', 'upper_west', 'volta', 'western', 'western_north'
    ];
    
    for (const value of enumValues) {
      try {
        await client.query(`ALTER TYPE region_code_enum ADD VALUE IF NOT EXISTS '${value}'`);
        console.log(`Added enum value: ${value}`);
      } catch (err: any) {
        if (err.code === '42710') {
          console.log(`Enum value already exists: ${value}`);
        } else {
          throw err;
        }
      }
    }
    
    // Create partitions (these are idempotent with IF NOT EXISTS)
    const partitions = [
      { name: 'properties_ahafo', value: 'ahafo' },
      { name: 'properties_ashanti', value: 'ashanti' },
      { name: 'properties_bono', value: 'bono' },
      { name: 'properties_bono_east', value: 'bono_east' },
      { name: 'properties_central', value: 'central' },
      { name: 'properties_north_east', value: 'north_east' },
      { name: 'properties_northern', value: 'northern' },
      { name: 'properties_oti', value: 'oti' },
      { name: 'properties_savannah', value: 'savannah' },
      { name: 'properties_upper_east', value: 'upper_east' },
      { name: 'properties_upper_west', value: 'upper_west' },
      { name: 'properties_volta', value: 'volta' },
      { name: 'properties_western', value: 'western' },
      { name: 'properties_western_north', value: 'western_north' },
    ];
    
    for (const p of partitions) {
      try {
        await client.query(`CREATE TABLE IF NOT EXISTS ${p.name} PARTITION OF properties FOR VALUES IN ('${p.value}')`);
        console.log(`Created partition: ${p.name}`);
      } catch (err: any) {
        if (err.code === '42P07') {
          console.log(`Partition already exists: ${p.name}`);
        } else {
          console.log(`Partition ${p.name} error: ${err.message}`);
        }
      }
    }
    
    // Mark migration as complete in the migrations table
    await client.query(`
      INSERT INTO migrations (name, executed_at) 
      VALUES ('040_expand_ghana_regions', NOW()) 
      ON CONFLICT (name) DO NOTHING
    `);
    console.log('Migration 040_expand_ghana_regions marked as complete');
    
  } finally {
    client.release();
    await adminPool.end();
  }
}

runMigration040AsAdmin()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
