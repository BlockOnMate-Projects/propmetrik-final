
import { pool } from '../src/database';
import { logger } from '../src/utils/logger';

async function getTestId() {
  try {
    const result = await pool.query('SELECT id, title, region FROM properties LIMIT 1');
    if (result.rows.length > 0) {
      console.log('\n✅ FOUND TEST PROPERTY:');
      console.log(`ID: ${result.rows[0].id}`);
      console.log(`Title: ${result.rows[0].title}`);
      console.log(`Region: ${result.rows[0].region}`);
      console.log('\nUse this ID to test the API and Frontend.\n');
    } else {
      console.log('\n⚠️ No properties found in database. You need to seed data first.\n');
    }
  } catch (error) {
    console.error('Error querying database:', error);
  } finally {
    await pool.end();
  }
}

getTestId();
