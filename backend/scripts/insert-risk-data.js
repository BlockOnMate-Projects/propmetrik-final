const { pool } = require('../src/database');

async function insertRiskData() {
  try {
    // Get property ID
    const propResult = await pool.query("SELECT id FROM properties WHERE address_street LIKE '%tomlin%' LIMIT 1");
    if (propResult.rows.length === 0) {
      console.log('No property found');
      return;
    }
    const propertyId = propResult.rows[0].id;
    console.log('Property ID:', propertyId);

    // Insert risk assessment
    await pool.query(`
      INSERT INTO property_risk_assessments (
        property_id, 
        employment_stability, convenience_employment, convenience_shopping,
        convenience_school, public_transportation, utilities_adequacy,
        recreation_facilities, police_fire_protection, accessibility,
        overall_risk_level
      ) VALUES ($1, 'good', 'good', 'average', 'average', 'good', 'good', 'average', 'good', 'good', 'low')
    `, [propertyId]);
    
    console.log('Risk assessment data inserted');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

insertRiskData();
