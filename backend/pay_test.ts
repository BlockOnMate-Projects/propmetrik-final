import 'dotenv/config';
import { pool } from './src/database';
import { invoiceService } from './src/services/project-management/invoiceService';

(async () => {
  const org = '00000000-0000-0000-0000-000000000001';
  const proj = '45049527-5b67-463a-9af6-0190982684e2';
  const num = 'TEST-INV-' + Math.floor(Math.random() * 1e6);
  // Minimal sent invoice
  const ins = await pool.query(
    `INSERT INTO project_invoices (organization_id, project_id, invoice_number, amount, total_amount, currency, status, invoice_date, due_date, platform_fee)
     VALUES ($1,$2,$3,$4,$5,'GHS','sent',NOW(),NOW() + interval '14 days',$6) RETURNING id`,
    [org, proj, num, 10000, 10500, 200]
  );
  const id = ins.rows[0].id;
  const ref = 'PM-INV-TEST-' + Date.now();
  console.log('created invoice', num, id);

  // First confirm
  const r1 = await invoiceService.confirmPayment(id, ref, { method: 'card', channel: 'card', provider: 'paystack', isPaystack: true });
  console.log('confirm #1 → alreadyPaid:', r1.alreadyPaid, '| status:', r1.invoice.status);

  // Second confirm (idempotent)
  const r2 = await invoiceService.confirmPayment(id, ref, { method: 'card', channel: 'card', provider: 'paystack', isPaystack: true });
  console.log('confirm #2 → alreadyPaid:', r2.alreadyPaid, '| status:', r2.invoice.status);

  // Assert ledger
  const led = await pool.query(
    `SELECT reference, payment_type::text, domain_record_type, domain_record_id, status::text, gross_amount, principal_amount, service_fee, currency, provider
       FROM payment_transactions WHERE domain_record_id = $1`, [id]);
  console.log('ledger rows:', led.rows.length);
  led.rows.forEach(l => console.log('  ', JSON.stringify(l)));

  const inv = await pool.query(`SELECT status, payment_reference, payment_method, paid_date FROM project_invoices WHERE id=$1`, [id]);
  console.log('invoice final:', JSON.stringify(inv.rows[0]));

  // Cleanup
  await pool.query(`DELETE FROM payment_transactions WHERE domain_record_id = $1`, [id]);
  await pool.query(`DELETE FROM project_invoices WHERE id = $1`, [id]);
  console.log('cleaned up');
  await pool.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
