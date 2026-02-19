/**
 * PROPMETRIK UNIFIED USER & ORG MIGRATION
 * 
 * Consolidates all users/orgs to:
 * - User: Eric Danso (super_admin), ID: ED4A50D7-A1B2-4C3D-8E5F-6A7B8C9D0E1F
 * - Org: PROPMETRIK GROUP, ID: 00000000-0000-0000-0000-000000000001
 * - Valuer: Eric Danso, License: 1234567
 * - E-Sign ID: ED4A50D7 (first UUID segment)
 */

const { Pool } = require('pg');
const pool = new Pool({ 
  connectionString: 'postgresql://propmetrik_app:3Ut1ypZBhTDLeG02VBOMZ50eBfKmtWPn@pg.cedynhq.com:5434/propmetrik' 
});

const NEW_USER_ID = 'ed4a50d7-a1b2-4c3d-8e5f-6a7b8c9d0e1f';
const ORG_ID = '00000000-0000-0000-0000-000000000001';

// Old IDs to replace
const OLD_USER_IDS = [
  '00000000-0000-0000-0000-000000000002', // Eric Danso (super_admin)
  '22222222-2222-2222-2222-222222222222', // Sarah Mensah
  '33333333-3333-3333-3333-333333333333', // Eric Ofori
  '1e1e8fe8-592b-4773-8dac-eecfad16c20d', // Eric Danso (manager)
  '575438e9-a0a2-461d-8011-e9e54c30acd3', // Test E2E User
  '00000000-0000-0000-0000-000000000001', // Misused as user ID in some places
];

const OLD_ORG_IDS = [
  '11111111-1111-1111-1111-111111111111', // Realteum Properties
  '00000000-0000-0000-0000-000000000010', // Propmetrik Brokerage
  '00000000-0000-0000-0000-000000000011', // Propmetrik Development
  '00000000-0000-0000-0000-000000000012', // Propmetrik Finance
  '00000000-0000-0000-0000-000000000013', // Propmetrik Government
  '00000000-0000-0000-0000-000000000014', // Propmetrik PM
  '00000000-0000-0000-0000-000000000015', // Propmetrik Valuations
];

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('=== PROPMETRIK UNIFIED MIGRATION ===\n');

    // ========================================================================
    // STEP 1: Rename org to PROPMETRIK GROUP
    // ========================================================================
    console.log('STEP 1: Rename primary org to PROPMETRIK GROUP');
    await client.query(`
      UPDATE organizations 
      SET name = 'PROPMETRIK GROUP', slug = 'propmetrik-group', updated_at = NOW()
      WHERE id = $1
    `, [ORG_ID]);
    console.log('  ✓ Organization renamed\n');

    // ========================================================================
    // STEP 2: Create the new unified user (or update existing)
    // ========================================================================
    console.log('STEP 2: Create/update unified user Eric Danso');
    
    // First check if the new UUID already exists
    const existingUser = await client.query('SELECT id FROM users WHERE id = $1', [NEW_USER_ID]);
    
    if (existingUser.rows.length === 0) {
      // Get password hash from existing Eric Danso record
      const oldUser = await client.query(
        "SELECT password_hash FROM users WHERE email = 'eric@cedynhq.com' LIMIT 1"
      );
      const pwHash = oldUser.rows.length > 0 ? oldUser.rows[0].password_hash : null;
      
      // Delete ALL old users first (to avoid email uniqueness conflicts)
      for (const oldId of OLD_USER_IDS) {
        try {
          await client.query('DELETE FROM users WHERE id = $1', [oldId]);
        } catch (e) { /* FK constraint - will be handled after ref updates */ }
      }
      // Also clear any user with the same email
      await client.query("DELETE FROM users WHERE email = 'eric@cedynhq.com'");
      await client.query("DELETE FROM users WHERE email = 'admin@realteum.com'");
      await client.query("DELETE FROM users WHERE email = 'eric@realteum.com'");
      await client.query("DELETE FROM users WHERE email = 'eric.danso@cedynhq.com'");
      await client.query("DELETE FROM users WHERE email = 'test-user@propmetrik.com'");

      const insertCols = pwHash 
        ? `(id, email, first_name, last_name, role, organization_id, display_name, status, email_verified, is_active, created_at, updated_at, password_hash)`
        : `(id, email, first_name, last_name, role, organization_id, display_name, status, email_verified, is_active, created_at, updated_at)`;
      
      const insertVals = pwHash
        ? `($1, 'eric@cedynhq.com', 'Eric', 'Danso', 'super_admin', $2, 'Eric Danso', 'active', true, true, NOW(), NOW(), $3)`
        : `($1, 'eric@cedynhq.com', 'Eric', 'Danso', 'super_admin', $2, 'Eric Danso', 'active', true, true, NOW(), NOW())`;
      
      const insertParams = pwHash ? [NEW_USER_ID, ORG_ID, pwHash] : [NEW_USER_ID, ORG_ID];
      
      await client.query(`INSERT INTO users ${insertCols} VALUES ${insertVals}`, insertParams);
      console.log('  ✓ New user created: ' + NEW_USER_ID);
    } else {
      console.log('  ✓ User already exists: ' + NEW_USER_ID);
    }

    // ========================================================================
    // STEP 3: Create/update valuer record
    // ========================================================================
    console.log('\nSTEP 3: Create/update valuer record');
    
    // Delete old valuer records
    await client.query('DELETE FROM valuers');
    
    await client.query(`
      INSERT INTO valuers (id, user_id, name, title, qualifications, license_number, license_issuer,
        license_status, company_name, contact_email, specializations, regions_covered, is_active, created_at, updated_at)
      VALUES ($1, $1, 'Eric Danso', 'Valuation & Estate Surveyor', 'BSc. Land Economy, MGhIS',
        '1234567', 'Ghana Institution of Surveyors', 'active',
        'PROPMETRIK GROUP', 'eric@cedynhq.com',
        ARRAY['residential', 'commercial', 'industrial', 'land'], ARRAY['GR', 'AR', 'WR', 'CR', 'ER'], 
        true, NOW(), NOW())
    `, [NEW_USER_ID]);
    console.log('  ✓ Valuer created with license 1234567\n');

    // ========================================================================
    // STEP 4: Update ALL user references across tables
    // ========================================================================
    console.log('STEP 4: Migrate user references to new ID');
    
    // Get all columns that reference users
    const userCols = await client.query(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND data_type = 'uuid'
      AND (column_name IN ('user_id', 'created_by', 'updated_by', 'approved_by', 'reviewed_by', 
           'assigned_to', 'assigned_by', 'owner_id', 'signer_id', 'valuer_id', 'manager_id',
           'submitted_by', 'requested_by', 'completed_by', 'cancelled_by', 'rejected_by',
           'creator_id', 'assignee_id', 'reporter_id', 'inspector_id', 'supervisor_id',
           'portal_invited_by', 'resolved_by'))
      AND table_name NOT IN ('users')
      ORDER BY table_name, column_name
    `);

    let totalUpdated = 0;
    for (const col of userCols.rows) {
      for (const oldId of OLD_USER_IDS) {
        try {
          const result = await client.query(
            `UPDATE "${col.table_name}" SET "${col.column_name}" = $1 WHERE "${col.column_name}" = $2`,
            [NEW_USER_ID, oldId]
          );
          if (result.rowCount > 0) {
            console.log(`  ✓ ${col.table_name}.${col.column_name}: ${result.rowCount} rows (${oldId.substring(0, 8)}... → ${NEW_USER_ID.substring(0, 8)}...)`);
            totalUpdated += result.rowCount;
          }
        } catch (err) {
          // Some tables may have constraints; log and continue
          console.log(`  ⚠ ${col.table_name}.${col.column_name}: ${err.message.substring(0, 80)}`);
        }
      }
    }
    console.log(`  Total user refs updated: ${totalUpdated}\n`);

    // ========================================================================
    // STEP 5: Update ALL organization references
    // ========================================================================
    console.log('STEP 5: Migrate org references to PROPMETRIK GROUP');
    
    const orgCols = await client.query(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND data_type = 'uuid'
      AND column_name LIKE '%organization%'
      AND table_name != 'organizations'
      ORDER BY table_name
    `);

    let orgUpdated = 0;
    for (const col of orgCols.rows) {
      for (const oldOrgId of OLD_ORG_IDS) {
        try {
          const result = await client.query(
            `UPDATE "${col.table_name}" SET "${col.column_name}" = $1 WHERE "${col.column_name}" = $2`,
            [ORG_ID, oldOrgId]
          );
          if (result.rowCount > 0) {
            console.log(`  ✓ ${col.table_name}.${col.column_name}: ${result.rowCount} rows`);
            orgUpdated += result.rowCount;
          }
        } catch (err) {
          console.log(`  ⚠ ${col.table_name}.${col.column_name}: ${err.message.substring(0, 80)}`);
        }
      }
    }
    
    // Also update users table org references
    for (const oldOrgId of OLD_ORG_IDS) {
      const r = await client.query(
        `UPDATE users SET organization_id = $1 WHERE organization_id = $2`,
        [ORG_ID, oldOrgId]
      );
      if (r.rowCount > 0) {
        console.log(`  ✓ users.organization_id: ${r.rowCount} rows`);
        orgUpdated += r.rowCount;
      }
    }
    console.log(`  Total org refs updated: ${orgUpdated}\n`);

    // ========================================================================
    // STEP 6: Remove old organizations (except primary)
    // ========================================================================
    console.log('STEP 6: Remove old organizations');
    for (const oldOrgId of OLD_ORG_IDS) {
      try {
        const r = await client.query('DELETE FROM organizations WHERE id = $1', [oldOrgId]);
        if (r.rowCount > 0) console.log(`  ✓ Deleted org ${oldOrgId.substring(0, 8)}...`);
      } catch (err) {
        console.log(`  ⚠ Cannot delete org ${oldOrgId.substring(0, 8)}...: ${err.message.substring(0, 60)}`);
      }
    }

    // ========================================================================
    // STEP 7: Any remaining old users (already handled in Step 2)
    // ========================================================================
    console.log('\nSTEP 7: Verify no stale users remain');
    const remainingOld = await client.query(
      `SELECT id, email FROM users WHERE id != $1`, [NEW_USER_ID]
    );
    if (remainingOld.rows.length > 0) {
      for (const u of remainingOld.rows) {
        try {
          await client.query('DELETE FROM users WHERE id = $1', [u.id]);
          console.log(`  ✓ Deleted stale user ${u.email}`);
        } catch (err) {
          console.log(`  ⚠ Cannot delete ${u.email}: ${err.message.substring(0, 60)}`);
        }
      }
    } else {
      console.log('  ✓ Only Eric Danso remains');
    }

    // ========================================================================
    // STEP 8: Ensure valuation is properly linked
    // ========================================================================
    console.log('\nSTEP 8: Fix valuation linkage');
    await client.query(`
      UPDATE valuations 
      SET valuer_id = $1, created_by = $1, valuer_license_number = '1234567', 
          valuer_organization_id = $2, status = 'completed'
      WHERE id = 'c1c7a44d-17bf-4da5-baff-138d7e14f649'
    `, [NEW_USER_ID, ORG_ID]);
    console.log('  ✓ Valuation linked to Eric Danso\n');

    // Reset report to draft for testing
    await client.query(`
      UPDATE valuation_reports 
      SET status = 'draft', approved_at = null, approved_by = null, digital_seal_hash = null
      WHERE id = '2dd37218-f5e7-4d59-babc-42ecf63bad1c'
    `);
    console.log('  ✓ Report reset to draft\n');

    // ========================================================================
    // VERIFY
    // ========================================================================
    console.log('=== VERIFICATION ===');
    
    const users = await client.query('SELECT id, email, full_name, role, organization_id FROM users');
    console.log('\nUsers:', JSON.stringify(users.rows, null, 2));
    
    const orgs = await client.query('SELECT id, name, type, slug FROM organizations');
    console.log('\nOrganizations:', JSON.stringify(orgs.rows, null, 2));
    
    const valuers = await client.query('SELECT id, user_id, name, license_number, company_name FROM valuers');
    console.log('\nValuers:', JSON.stringify(valuers.rows, null, 2));
    
    const val = await client.query(
      "SELECT id, status, valuer_id, created_by, valuer_organization_id FROM valuations WHERE id = 'c1c7a44d-17bf-4da5-baff-138d7e14f649'"
    );
    console.log('\nValuation:', JSON.stringify(val.rows[0], null, 2));

    await client.query('COMMIT');
    console.log('\n✅ MIGRATION COMPLETE');
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ MIGRATION FAILED - ROLLED BACK:', err.message);
    console.error(err.stack);
  } finally {
    client.release();
    await pool.end();
  }
})();
