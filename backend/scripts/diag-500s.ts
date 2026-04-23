/**
 * Diagnostic script - captures 500 error details from all failing create endpoints
 */
import axios from 'axios';

const BASE = 'http://localhost:4000';
const ORG = '00000000-0000-0000-0000-000000000001';

async function main() {
  // Login
  const loginRes = await axios.post(`${BASE}/api/v1/auth/login`, {
    email: 'eric@cedynhq.com',
    password: 'Delta0246@'
  }, { validateStatus: () => true });
  
  const token = loginRes.data?.data?.token || loginRes.data?.token;
  if (!token) {
    console.error('LOGIN FAILED:', JSON.stringify(loginRes.data));
    return;
  }
  console.log('Login OK, token obtained');

  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Organization-Id': ORG,
    'Content-Type': 'application/json'
  };

  function api(method: string, url: string, data?: any) {
    return axios({ method, url: `${BASE}${url}`, headers, data, validateStatus: () => true })
      .then(r => ({ url, status: r.status, body: r.data }));
  }

  // Create test project
  const proj = await api('post', '/api/v1/projects', {
    name: 'DiagProject',
    project_type: 'residential_single',
    location: { address: '1 Test St', city: 'Accra', region: 'Greater Accra', country: 'Ghana' },
    total_budget: 500000,
    currency: 'GHS',
    start_date: '2025-01-01',
    end_date: '2026-12-31'
  });
  console.log('\n=== CREATE PROJECT:', proj.status);
  console.log(JSON.stringify(proj.body).slice(0, 300));
  
  const PID = proj.body?.data?.id || proj.body?.id;
  if (!PID) { console.error('No project ID!'); return; }
  console.log('PROJECT_ID:', PID);

  // Test all 8 failing creates
  const tests: Array<[string, string, any]> = [
    ['post', `/api/v1/projects/${PID}/units`, {
      unit_number: 'A101', unit_type: 'apartment', bedrooms: 3, bathrooms: 2,
      floor_area_sqm: 120, price: 350000, currency: 'GHS', floor_number: 1, status: 'available'
    }],
    ['post', `/api/v1/projects/${PID}/costs`, {
      name: 'Foundation Work', cost_type: 'materials', amount: 50000, currency: 'GHS', description: 'Cement'
    }],
    ['post', `/api/v1/projects/${PID}/draws`, {
      title: 'Draw 1', requested_amount: 50000, currency: 'GHS',
      period_start: '2025-01-01', period_end: '2025-01-31'
    }],
    ['post', `/api/v1/projects/${PID}/logs`, {
      log_date: '2025-01-15', weather: 'sunny', temperature: 28, workers_count: 25,
      work_description: 'Foundation excavation', progress_percentage: 10, safety_incidents: 0
    }],
    ['post', `/api/v1/projects/${PID}/permits`, {
      permit_type: 'building_permit', permit_number: 'BP-TEST-1',
      issuing_authority: 'AMA', issue_date: '2025-01-01', expiry_date: '2026-01-01'
    }],
    ['post', '/api/v1/calendar/events', {
      title: 'Project Meeting', event_type: 'meeting',
      start: '2025-02-01T10:00:00Z', end: '2025-02-01T11:00:00Z'
    }],
    ['post', '/api/v1/budget/expenses', {
      project_id: PID, description: 'Survey equipment rental', amount: 1500,
      currency: 'GHS', expense_date: '2025-01-15', category: 'equipment'
    }],
    ['post', '/api/v1/vendors', {
      name: 'Test Vendor Co', vendor_type: 'supplier', category: 'materials',
      contact_name: 'John', email: 'vendor@test.com', phone: '+233200000001',
      address: '1 Industrial Ave'
    }],
  ];

  for (const [method, url, data] of tests) {
    const r = await api(method, url, data);
    console.log(`\n=== ${method.toUpperCase()} ${url}`);
    console.log(`STATUS: ${r.status}`);
    console.log(JSON.stringify(r.body).slice(0, 600));
  }

  // Cleanup
  await api('delete', `/api/v1/projects/${PID}`);
  console.log('\nDiagnostic complete.');
}

main().catch(e => console.error('FATAL:', e.message, e.stack));
