import db, { pool } from './src/database';
import { marketplaceService } from './shared-services/marketplace/marketplaceService';
import * as mod from './src/services/marketplace/listingModerationService';

const TOKEN = '3a668bce3296eee0842ee5a976548038a0e28bde57e94b372a03956d128cc1d4';
(async () => {
  try {
    const before = await marketplaceService.getPropertyByToken(TOKEN);
    console.log('PG before:', before ? 'visible' : 'null');
    const e0 = await fetch(`http://localhost:3000/api/marketplace/properties/${TOKEN}`);
    console.log('endpoint before: HTTP', e0.status);

    await mod.submitReport(TOKEN, { reason: 'scam', reporter_ip: '10.0.0.1' });
    await mod.submitReport(TOKEN, { reason: 'not_owner', reporter_ip: '10.0.0.2' });
    const s = await mod.submitReport(TOKEN, { reason: 'already_sold_rented', reporter_ip: '10.0.0.3' });
    console.log('3rd report → suspended:', s.suspended, '(expect true at threshold 3)');

    const after = await marketplaceService.getPropertyByToken(TOKEN);
    console.log('PG after suspend:', after ? 'STILL VISIBLE — gate bypassed!' : 'null — hidden ✓');
    const e1 = await fetch(`http://localhost:3000/api/marketplace/properties/${TOKEN}`);
    console.log('endpoint after suspend: HTTP', e1.status, '(404 = hidden ✓)');
  } finally {
    const t = await db.query(`SELECT id FROM crm_properties WHERE permanent_link_token=$1 UNION ALL SELECT id FROM properties WHERE permanent_link_token=$1 LIMIT 1`, [TOKEN]);
    const pid = t.rows[0]?.id;
    if (pid) {
      await db.query(`DELETE FROM listing_reports WHERE property_id=$1`, [pid]);
      await db.query(`DELETE FROM listing_moderation WHERE property_id=$1`, [pid]);
    }
    const restored = await marketplaceService.getPropertyByToken(TOKEN);
    console.log('cleanup done. PG after cleanup:', restored ? 'visible ✓' : 'null');
    await pool.end();
  }
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
