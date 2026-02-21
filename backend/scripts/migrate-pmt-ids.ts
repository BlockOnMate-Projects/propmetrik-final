/**
 * Migration: Add user_id column to esign_signer_identities
 * and seed Eric Danso's persistent PMT ID (PMT-ED4A-50D7)
 */
import { pool } from '../src/database';

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Add user_id column
    await client.query(`
      ALTER TABLE esign_signer_identities 
      ADD COLUMN IF NOT EXISTS user_id UUID
    `);
    console.log('✅ Added user_id column');

    // 2. Create index on user_id
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_esign_signer_identities_user_id 
      ON esign_signer_identities(user_id)
    `);
    console.log('✅ Created user_id index');

    // 3. Drop unique constraint on permanent_id so multiple emails can share same PMT ID
    // (same user with different emails)
    try {
      await client.query(`
        ALTER TABLE esign_signer_identities 
        DROP CONSTRAINT IF EXISTS esign_signer_identities_permanent_id_key
      `);
      console.log('✅ Dropped unique constraint on permanent_id');
    } catch (e: any) {
      console.log('⚠️ No unique constraint to drop:', e.message);
    }

    // Eric Danso's identity
    const ericUserId = 'ed4a50d7-a1b2-4c3d-8e5f-6a7b8c9d0e1f';
    const ericPmtId = 'PMT-ED4A-50D7';

    // 4. Upsert eric@propmetrik.com
    const existing1 = await client.query(
      'SELECT id FROM esign_signer_identities WHERE email = $1',
      ['eric@propmetrik.com']
    );
    if (existing1.rows.length > 0) {
      await client.query(
        'UPDATE esign_signer_identities SET permanent_id = $1, user_id = $2, display_name = $3 WHERE email = $4',
        [ericPmtId, ericUserId, 'Eric Danso', 'eric@propmetrik.com']
      );
      console.log('✅ Updated eric@propmetrik.com -> PMT-ED4A-50D7');
    } else {
      await client.query(
        `INSERT INTO esign_signer_identities 
         (id, email, permanent_id, user_id, display_name, total_signatures, first_signed_at, last_signed_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, NOW(), NOW())`,
        ['eric@propmetrik.com', ericPmtId, ericUserId, 'Eric Danso']
      );
      console.log('✅ Inserted eric@propmetrik.com -> PMT-ED4A-50D7');
    }

    // 5. Upsert eric@realteum.com (same user, different email)
    const existing2 = await client.query(
      'SELECT id FROM esign_signer_identities WHERE email = $1',
      ['eric@realteum.com']
    );
    if (existing2.rows.length > 0) {
      await client.query(
        'UPDATE esign_signer_identities SET permanent_id = $1, user_id = $2, display_name = $3 WHERE email = $4',
        [ericPmtId, ericUserId, 'Eric Danso', 'eric@realteum.com']
      );
      console.log('✅ Updated eric@realteum.com -> PMT-ED4A-50D7');
    } else {
      await client.query(
        `INSERT INTO esign_signer_identities 
         (id, email, permanent_id, user_id, display_name, total_signatures, first_signed_at, last_signed_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, NOW(), NOW())`,
        ['eric@realteum.com', ericPmtId, ericUserId, 'Eric Danso']
      );
      console.log('✅ Inserted eric@realteum.com -> PMT-ED4A-50D7');
    }

    await client.query('COMMIT');
    console.log('\n✅ Migration committed successfully');

    // Verify
    const verify = await pool.query(
      'SELECT email, permanent_id, user_id, display_name FROM esign_signer_identities ORDER BY created_at'
    );
    console.log('\nAll records:');
    for (const row of verify.rows) {
      console.log(`  ${row.email} -> ${row.permanent_id} (user: ${row.user_id || 'none'})`);
    }
  } catch (e: any) {
    await client.query('ROLLBACK');
    console.error('❌ ROLLBACK:', e.message);
  } finally {
    client.release();
    process.exit(0);
  }
}

migrate();
