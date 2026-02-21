import { pool } from "../src/database";

/**
 * Migration: Add user_id column to esign_signer_identities
 * and seed Eric Danso's permanent PMT ID.
 * 
 * PMT IDs are now derived from the user UUID first section and persisted
 * permanently. They follow the user across all signing contexts.
 */
(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Add user_id column if it doesn't exist
    const colCheck = await client.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'esign_signer_identities' AND column_name = 'user_id'"
    );
    if (colCheck.rows.length === 0) {
      await client.query(
        'ALTER TABLE esign_signer_identities ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL'
      );
      console.log('✅ Added user_id column to esign_signer_identities');
    } else {
      console.log('ℹ️  user_id column already exists');
    }

    // 2. Create index on user_id for fast lookups
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_esign_signer_identities_user_id ON esign_signer_identities(user_id)'
    );
    console.log('✅ Created index on user_id');

    // 3. Seed Eric Danso's PMT ID (derived from UUID first section: ed4a50d7 → PMT-ED4A-50D7)
    const ericUserId = 'ed4a50d7-a1b2-4c3d-8e5f-6a7b8c9d0e1f';
    const ericPmtId = 'PMT-ED4A-50D7';
    const ericEmail = 'eric@propmetrik.com';

    // Check if Eric already has an identity record
    const existing = await client.query(
      'SELECT id, permanent_id FROM esign_signer_identities WHERE email = $1',
      [ericEmail]
    );

    if (existing.rows.length > 0) {
      // Update existing record with correct PMT format and user_id
      await client.query(
        `UPDATE esign_signer_identities 
         SET permanent_id = $1, user_id = $2, display_name = 'Eric Danso'
         WHERE email = $3`,
        [ericPmtId, ericUserId, ericEmail]
      );
      console.log(`✅ Updated Eric's identity: ${existing.rows[0].permanent_id} → ${ericPmtId}`);
    } else {
      // Insert new record
      await client.query(
        `INSERT INTO esign_signer_identities (id, email, user_id, permanent_id, display_name, total_signatures, first_signed_at, last_signed_at, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'Eric Danso', 0, NOW(), NOW(), NOW())`,
        [ericEmail, ericUserId, ericPmtId]
      );
      console.log(`✅ Created Eric's identity: ${ericPmtId}`);
    }

    // Also add identity for eric@realteum.com (alternative email) pointing to same user
    const altEmail = 'eric@realteum.com';
    const altExisting = await client.query(
      'SELECT id FROM esign_signer_identities WHERE email = $1',
      [altEmail]
    );
    if (altExisting.rows.length > 0) {
      await client.query(
        `UPDATE esign_signer_identities 
         SET permanent_id = $1, user_id = $2, display_name = 'Eric Danso'
         WHERE email = $3`,
        [ericPmtId, ericUserId, altEmail]
      );
      console.log(`✅ Updated alt email identity: ${altEmail} → ${ericPmtId}`);
    } else {
      await client.query(
        `INSERT INTO esign_signer_identities (id, email, user_id, permanent_id, display_name, total_signatures, first_signed_at, last_signed_at, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'Eric Danso', 0, NOW(), NOW(), NOW())`,
        [altEmail, ericUserId, ericPmtId]
      );
      console.log(`✅ Created alt email identity: ${altEmail} → ${ericPmtId}`);
    }

    await client.query('COMMIT');

    // Verify
    const verify = await pool.query(
      'SELECT email, user_id, permanent_id, display_name FROM esign_signer_identities WHERE user_id = $1',
      [ericUserId]
    );
    console.log('\n📋 Eric\'s signer identities:');
    for (const row of verify.rows) {
      console.log(`   ${row.email} → ${row.permanent_id} (${row.display_name})`);
    }

    console.log('\n✅ Migration complete');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
  } finally {
    client.release();
    process.exit(0);
  }
})();
