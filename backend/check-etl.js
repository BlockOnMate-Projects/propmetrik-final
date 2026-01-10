#!/usr/bin/env node
const { Client } = require('pg');

async function checkETLJobs() {
  const client = new Client({
    connectionString: 'postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.cedynhq.com:5434/propmetrik'
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Check scrape jobs
    const result = await client.query(
      'SELECT id, job_type, status, created_at FROM etl_jobs WHERE job_type = $1 ORDER BY created_at DESC LIMIT 10',
      ['scrape']
    );

    console.log('\n📊 Current scrape jobs:');
    if (result.rows.length === 0) {
      console.log('No scrape jobs found');
    } else {
      result.rows.forEach(job => {
        console.log(`ID: ${job.id}, Status: ${job.status}, Created: ${job.created_at}`);
      });
    }

    // Check all job types
    const allTypes = await client.query(
      'SELECT job_type, status, COUNT(*) as count FROM etl_jobs GROUP BY job_type, status ORDER BY job_type, status'
    );

    console.log('\n📈 All job types summary:');
    allTypes.rows.forEach(row => {
      console.log(`${row.job_type}: ${row.status} (${row.count})`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

checkETLJobs().catch(console.error);