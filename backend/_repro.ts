import { pool } from './src/database';
import { applicationService } from './src/services/property-management/applications/applicationService';
(async () => {
  const appId = '30d52d95-e674-4a30-8871-d72034897d87';
  const orgId = '00000000-0000-0000-0000-000000000001';
  const u = await pool.query(`SELECT id FROM users WHERE email ILIKE 'eric@cedynhq.com' LIMIT 1`);
  const userId = u.rows[0]?.id;
  console.log('userId:', userId);
  try {
    const res: any = await (applicationService as any).generateLeaseDocument(appId, orgId, userId, {
      startDate: '2026-06-28', endDate: '2027-06-27', monthlyRent: 5000, currency: 'GHS',
      securityDeposit: 5000, advanceMonths: 1, noticePeriodDays: 30, autoRenew: false,
      landlordName: 'Eric Danso', landlordEmail: 'eric@cedynhq.com', isUserLandlord: true, landlordWillSign: true,
      tenantUtilities: ['electricity','water'], landlordUtilities: [],
      signers: [{role:'landlord',name:'Eric Danso',email:'eric@cedynhq.com',order:1},{role:'tenant',name:'FY',email:'eric@aequoros.com',order:2}],
    });
    console.log('SUCCESS:', JSON.stringify({tenancyId: res.tenancyId, documentId: res.documentId, filename: res.filename}));
  } catch (e:any) {
    console.log('CAUGHT ERROR MESSAGE:', e.message);
    console.log('STACK:\n', e.stack);
  }
  await pool.end();
})().catch(e=>{console.error('FATAL', e.message);process.exit(1)});
