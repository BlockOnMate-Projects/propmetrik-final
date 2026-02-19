/**
 * PROPMETRIK UNIFIED USER & ORG MIGRATION v2
 * 
 * Consolidates to:
 * - User: Eric Danso (super_admin), ID: ed4a50d7-a1b2-4c3d-8e5f-6a7b8c9d0e1f
 * - Org: PROPMETRIK GROUP, ID: 00000000-0000-0000-0000-000000000001
 * - Valuer: Eric Danso, License: 1234567
 * - E-Sign ID: ED4A50D7 (first UUID segment)
 * 
 * Strategy: No single transaction (too many cascading FKs). 
 * Steps run sequentially, each step is self-contained.
 */

const { Pool } = require('pg');
const pool = new Pool({ 
  connectionString: 'postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.cedynhq.com:5434/propmetrik' 
});

const NEW_USER_ID = 'ed4a50d7-a1b2-4c3d-8e5f-6a7b8c9d0e1f';
const ORG_ID = '00000000-0000-0000-0000-000000000001';

const OLD_USER_IDS = [
  '00000000-0000-0000-0000-000000000002',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '1e1e8fe8-592b-4773-8dac-eecfad16c20d',
  '575438e9-a0a2-461d-8011-e9e54c30acd3',
  '00000000-0000-0000-0000-000000000001', // misused as user in some places
];

const OLD_ORG_IDS = [
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000012',
  '00000000-0000-0000-0000-000000000013',
  '00000000-0000-0000-0000-000000000014',
  '00000000-0000-0000-0000-000000000015',
];

async function run() {
  console.log('=== PROPMETRIK UNIFIED MIGRATION v2 ===\n');

  // STEP 1: Rename org
  console.log('STEP 1: Rename org to PROPMETRIK GROUP');
  await pool.query(`UPDATE organizations SET name = 'PROPMETRIK GROUP', slug = 'propmetrik-group', updated_at = NOW() WHERE id = $1`, [ORG_ID]);
  console.log('  ✓ Done\n');

  // STEP 2: Create new user FIRST (before updating refs)
  console.log('STEP 2: Create new user');
  const existing = await pool.query('SELECT id FROM users WHERE id = $1', [NEW_USER_ID]);
  if (existing.rows.length === 0) {
    // Get password hash from existing Eric Danso
    const old = await pool.query("SELECT password_hash FROM users WHERE email = 'eric@cedynhq.com' LIMIT 1");
    const pwHash = old.rows[0]?.password_hash;
    
    if (pwHash) {
      await pool.query(`
        INSERT INTO users (id, email, first_name, last_name, role, organization_id, display_name, status, email_verified, is_active, created_at, updated_at, password_hash)
        VALUES ($1, 'eric-new@cedynhq.com', 'Eric', 'Danso', 'super_admin', $2, 'Eric Danso', 'active', true, true, NOW(), NOW(), $3)
      `, [NEW_USER_ID, ORG_ID, pwHash]);
    } else {
      await pool.query(`
        INSERT INTO users (id, email, first_name, last_name, role, organization_id, display_name, status, email_verified, is_active, created_at, updated_at)
        VALUES ($1, 'eric-new@cedynhq.com', 'Eric', 'Danso', 'super_admin', $2, 'Eric Danso', 'active', true, true, NOW(), NOW())
      `, [NEW_USER_ID, ORG_ID]);
    }
    console.log('  ✓ Created with temp email\n');
  } else {
    console.log('  ✓ Already exists\n');
  }

  // STEP 3: Update ALL user references across ALL tables
  console.log('STEP 3: Migrate user references');
  const userCols = await pool.query(`
    SELECT c.table_name, c.column_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.data_type = 'uuid' AND t.table_type = 'BASE TABLE'
    AND c.column_name IN ('user_id', 'created_by', 'updated_by', 'approved_by', 'reviewed_by', 
         'assigned_to', 'assigned_by', 'owner_id', 'signer_id', 'valuer_id', 'manager_id',
         'submitted_by', 'requested_by', 'completed_by', 'cancelled_by', 'rejected_by',
         'creator_id', 'assignee_id', 'reporter_id', 'inspector_id', 'supervisor_id',
         'portal_invited_by', 'resolved_by', 'propmetrik_user_id', 'keycloak_id')
    ORDER BY c.table_name, c.column_name
  `);

  let totalUpdated = 0;
  for (const col of userCols.rows) {
    for (const oldId of OLD_USER_IDS) {
      try {
        const r = await pool.query(
          `UPDATE "${col.table_name}" SET "${col.column_name}" = $1 WHERE "${col.column_name}" = $2`,
          [NEW_USER_ID, oldId]
        );
        if (r.rowCount > 0) {
          console.log(`  ✓ ${col.table_name}.${col.column_name}: ${r.rowCount} rows`);
          totalUpdated += r.rowCount;
        }
      } catch (err) {
        // Only log non-trivial errors
        if (!err.message.includes('does not exist')) {
          console.log(`  ⚠ ${col.table_name}.${col.column_name}: ${err.message.substring(0, 60)}`);
        }
      }
    }
  }
  console.log(`  Total: ${totalUpdated} refs updated\n`);

  // STEP 4: Update ALL organization references
  console.log('STEP 4: Migrate org references');
  const orgCols = await pool.query(`
    SELECT c.table_name, c.column_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.data_type = 'uuid' AND t.table_type = 'BASE TABLE'
    AND c.column_name LIKE '%organization%'
    AND c.table_name != 'organizations' ORDER BY c.table_name
  `);
  
  let orgUpdated = 0;
  for (const col of orgCols.rows) {
    for (const oldOrgId of OLD_ORG_IDS) {
      try {
        const r = await pool.query(
          `UPDATE "${col.table_name}" SET "${col.column_name}" = $1 WHERE "${col.column_name}" = $2`,
          [ORG_ID, oldOrgId]
        );
        if (r.rowCount > 0) {
          console.log(`  ✓ ${col.table_name}.${col.column_name}: ${r.rowCount} rows`);
          orgUpdated += r.rowCount;
        }
      } catch (err) {
        if (!err.message.includes('does not exist')) {
          console.log(`  ⚠ ${col.table_name}.${col.column_name}: ${err.message.substring(0, 60)}`);
        }
      }
    }
  }
  console.log(`  Total: ${orgUpdated} refs updated\n`);

  // STEP 5: Delete old valuers, create new one
  console.log('STEP 5: Reset valuers table');
  await pool.query('DELETE FROM valuers');
  await pool.query(`
    INSERT INTO valuers (id, user_id, name, title, qualifications, license_number, license_issuer,
      license_status, company_name, contact_email, specializations, regions_covered, is_active, created_at, updated_at)
    VALUES ($1, $1, 'Eric Danso', 'Valuation & Estate Surveyor', 'BSc. Land Economy, MGhIS',
      '1234567', 'Ghana Institution of Surveyors', 'active', 'PROPMETRIK GROUP', 'eric@cedynhq.com',
      ARRAY['residential', 'commercial', 'industrial', 'land'], ARRAY['GR', 'AR', 'WR', 'CR', 'ER'], 
      true, NOW(), NOW())
  `, [NEW_USER_ID]);
  console.log('  ✓ Valuer created: Eric Danso (License: 1234567)\n');

  // STEP 6: Fix valuation linkage
  console.log('STEP 6: Fix valuation linkage');
  await pool.query(`
    UPDATE valuations SET valuer_id = $1, created_by = $1, valuer_license_number = '1234567',
      valuer_organization_id = $2, status = 'completed'
    WHERE id = 'c1c7a44d-17bf-4da5-baff-138d7e14f649'
  `, [NEW_USER_ID, ORG_ID]);
  await pool.query(`
    UPDATE valuation_reports SET status = 'draft', approved_at = null, approved_by = null, digital_seal_hash = null
    WHERE id = '2dd37218-f5e7-4d59-babc-42ecf63bad1c'
  `);
  console.log('  ✓ Valuation & report updated\n');

  // STEP 7: Delete old users (all refs should point to new ID now)
  console.log('STEP 7: Delete old users');
  for (const oldId of OLD_USER_IDS) {
    if (oldId === ORG_ID) continue; // This is an org ID, not a user
    if (oldId === NEW_USER_ID) continue;
    try {
      const r = await pool.query('DELETE FROM users WHERE id = $1', [oldId]);
      if (r.rowCount > 0) console.log(`  ✓ Deleted ${oldId}`);
    } catch (err) {
      console.log(`  ⚠ ${oldId}: ${err.message.substring(0, 80)}`);
    }
  }
  // Update the new user's email to the final one
  await pool.query("UPDATE users SET email = 'eric@cedynhq.com' WHERE id = $1", [NEW_USER_ID]);
  console.log('  ✓ Email set to eric@cedynhq.com\n');

  // STEP 8: Delete old organizations
  console.log('STEP 8: Remove old organizations');
  for (const oldOrgId of OLD_ORG_IDS) {
    try {
      const r = await pool.query('DELETE FROM organizations WHERE id = $1', [oldOrgId]);
      if (r.rowCount > 0) console.log(`  ✓ Deleted ${oldOrgId}`);
    } catch (err) {
      console.log(`  ⚠ ${oldOrgId}: ${err.message.substring(0, 60)}`);
    }
  }

  // VERIFICATION
  console.log('\n=== VERIFICATION ===');
  const users = await pool.query('SELECT id, email, full_name, role, organization_id FROM users');
  console.log('\nUsers:', JSON.stringify(users.rows, null, 2));
  
  const orgs = await pool.query('SELECT id, name, type, slug FROM organizations');
  console.log('\nOrgs:', JSON.stringify(orgs.rows, null, 2));
  
  const valuers = await pool.query('SELECT id, user_id, name, license_number, company_name FROM valuers');
  console.log('\nValuers:', JSON.stringify(valuers.rows, null, 2));
  
  const val = await pool.query("SELECT id, status, valuer_id, created_by, valuer_organization_id FROM valuations WHERE id = 'c1c7a44d-17bf-4da5-baff-138d7e14f649'");
  console.log('\nValuation:', JSON.stringify(val.rows[0], null, 2));

  console.log('\n✅ MIGRATION COMPLETE');
  await pool.end();
}

run().catch(err => {
  console.error('❌ FATAL:', err.message);
  pool.end();
  process.exit(1);
});
