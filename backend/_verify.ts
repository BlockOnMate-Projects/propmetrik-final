import { pool } from './src/database';
import { applicationService } from './src/services/property-management/applications/applicationService';
(async () => {
  const app:any = await applicationService.getApplicationById('30d52d95-e674-4a30-8871-d72034897d87','00000000-0000-0000-0000-000000000001');
  console.log('VERIFY landlord derivation:', JSON.stringify({
    ownerName: app.propertyOwnerName, ownerId: app.propertyOwnerId,
    listedByName: app.propertyListedByName, listedById: app.propertyListedById, listedByEmail: app.propertyListedByEmail
  }));
  await pool.end();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
