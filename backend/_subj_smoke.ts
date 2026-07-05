import 'dotenv/config';
import db, { pool } from './src/database';
import * as iv from './src/services/identity/identityVerificationService';
(async () => {
  const c = (await db.query("SELECT id, organization_id FROM contacts WHERE id='561a062b-4785-4a15-9e6b-1ea0985ad2b8'")).rows[0];
  let vid: string | undefined;
  try {
    const r = await iv.createSessionForSubject({ subjectType:'contact', subjectId:c.id, organizationId:c.organization_id, email:'kyc-smoke-test@example.com', name:'Smoke Test', category:'crm' });
    vid = r.verification_id;
    const row = (await db.query('SELECT status, provider_session_id, verification_url FROM identity_verifications WHERE id=$1',[vid])).rows[0];
    console.log('subject session status:', row?.status, '| Didit session_id set:', !!row?.provider_session_id, '| url set:', !!row?.verification_url, '| sent_to:', r.sent_to);
  } finally {
    await db.query("DELETE FROM identity_verifications WHERE subject_type='contact' AND subject_id='561a062b-4785-4a15-9e6b-1ea0985ad2b8'").catch(()=>{});
    console.log('cleanup done');
    await pool.end();
  }
})().catch(e=>{console.error('FAILED:',e.message);process.exit(1);});
