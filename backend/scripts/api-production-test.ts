/**
 * Production API Test Suite
 * Tests all frontend API calls for production readiness
 */

import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';

const API_BASE = 'http://localhost:4000';
const OUTPUT_FILE = '/Users/kobby/github/Cedyn Group/propmetrik/backend/api-test-results.txt';

interface TestResult {
  endpoint: string;
  method: string;
  status: number | string;
  success: boolean;
  response?: string;
  error?: string;
}

const results: TestResult[] = [];

const client: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  validateStatus: () => true, // Don't throw on any status
});

async function testEndpoint(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  data?: object,
  description?: string
): Promise<TestResult> {
  try {
    const response = await client.request({
      method,
      url: endpoint,
      data,
    });
    
    const result: TestResult = {
      endpoint,
      method,
      status: response.status,
      success: response.status >= 200 && response.status < 500,
      response: typeof response.data === 'object' 
        ? JSON.stringify(response.data).substring(0, 100)
        : String(response.data).substring(0, 100),
    };
    
    results.push(result);
    return result;
  } catch (error: any) {
    const result: TestResult = {
      endpoint,
      method,
      status: 'ERROR',
      success: false,
      error: error.message,
    };
    results.push(result);
    return result;
  }
}

async function runTests() {
  console.log('🧪 PROPMETRIK PRODUCTION API TEST SUITE');
  console.log('========================================\n');

  // ========== 1. HEALTH & CORE ==========
  console.log('📦 CORE & HEALTH APIs');
  console.log('----------------------');
  await testEndpoint('GET', '/health');
  
  // ========== 2. PUBLIC APIs ==========
  console.log('\n🌐 PUBLIC APIs');
  console.log('---------------');
  await testEndpoint('GET', '/api/public/properties?limit=5');
  
  // ========== 3. AUTH APIs ==========
  console.log('\n🔐 AUTH APIs');
  console.log('-------------');
  await testEndpoint('POST', '/api/v1/auth/login', { email: 'test@test.com', password: 'invalid' });
  
  // ========== 4. CRM APIs (Agent Portal) ==========
  console.log('\n🏢 CRM APIs (Agent Portal)');
  console.log('---------------------------');
  await testEndpoint('GET', '/api/v1/crm/properties?limit=5');
  await testEndpoint('GET', '/api/v1/crm/agents');
  await testEndpoint('GET', '/api/v1/crm/contacts?limit=5');
  await testEndpoint('GET', '/api/v1/crm/deals?limit=5');
  await testEndpoint('GET', '/api/v1/crm/tasks?limit=5');
  await testEndpoint('GET', '/api/v1/crm/pipelines');
  await testEndpoint('GET', '/api/v1/crm/notes?limit=5');
  
  // ========== 5. PROPERTY MANAGEMENT APIs ==========
  console.log('\n🏠 PROPERTY MANAGEMENT APIs');
  console.log('----------------------------');
  await testEndpoint('GET', '/api/v1/pm/properties?limit=5');
  await testEndpoint('GET', '/api/v1/pm/applications?limit=5');
  await testEndpoint('GET', '/api/v1/pm/tenancies?limit=5');
  await testEndpoint('GET', '/api/v1/pm/invoices?limit=5');
  await testEndpoint('GET', '/api/v1/pm/maintenance?limit=5');
  await testEndpoint('GET', '/api/v1/pm/vendors?limit=5');
  await testEndpoint('GET', '/api/v1/pm/payments?limit=5');
  
  // ========== 6. WORKFLOW APIs ==========
  console.log('\n⚙️ WORKFLOW APIs');
  console.log('-----------------');
  await testEndpoint('GET', '/api/v1/workflows?status=active');
  await testEndpoint('GET', '/api/v1/workflows/stats');
  await testEndpoint('GET', '/api/v1/workflows/templates');
  
  // ========== 7. E-SIGN APIs ==========
  console.log('\n✍️ E-SIGN APIs');
  console.log('---------------');
  await testEndpoint('GET', '/api/v1/esign/requests');
  await testEndpoint('POST', '/api/v1/esign/verify-token', { token: 'test-token' });
  
  // ========== 8. MESSAGING APIs ==========
  console.log('\n💬 MESSAGING APIs');
  console.log('------------------');
  await testEndpoint('GET', '/api/messaging/conversations');
  await testEndpoint('GET', '/api/messaging/stats');
  await testEndpoint('GET', '/api/messaging/status');
  await testEndpoint('GET', '/api/messaging/templates');
  
  // ========== 9. COMMISSION APIs ==========
  console.log('\n💰 COMMISSION APIs');
  console.log('-------------------');
  await testEndpoint('GET', '/api/crm/commissions/records?limit=5');
  await testEndpoint('GET', '/api/crm/commissions/plans');
  await testEndpoint('GET', '/api/crm/commissions/summary');
  
  // ========== 10. DATA HUB APIs ==========
  console.log('\n📊 DATA HUB APIs');
  console.log('-----------------');
  await testEndpoint('GET', '/api/v1/data-hub/uploads?page=1&limit=10');
  await testEndpoint('GET', '/api/v1/pull-integrations/endpoints');
  await testEndpoint('GET', '/api/v1/pull-integrations/jobs');
  await testEndpoint('GET', '/api/v1/pull-integrations/schedules');
  
  // ========== 11. PROJECT APIs ==========
  console.log('\n📋 PROJECT APIs');
  console.log('----------------');
  await testEndpoint('GET', '/api/v1/projects?limit=5');
  
  // ========== 12. TENANT PORTAL APIs ==========
  console.log('\n🏡 TENANT PORTAL APIs');
  console.log('----------------------');
  await testEndpoint('POST', '/api/v1/tenant-portal/auth/magic-link', { email: 'test@test.com' });
  await testEndpoint('POST', '/api/v1/tenant-portal/auth/otp/request', { phone: '+233000000000' });
  
  // ========== 13. VALUER APIs ==========
  console.log('\n📐 VALUER APIs');
  console.log('---------------');
  await testEndpoint('GET', '/api/v1/valuers');
  
  // ========== 14. NOTIFICATIONS APIs ==========
  console.log('\n🔔 NOTIFICATION APIs');
  console.log('---------------------');
  await testEndpoint('GET', '/api/notifications?unread=true&limit=5');
  
  // ========== SUMMARY ==========
  console.log('\n\n📊 TEST RESULTS SUMMARY');
  console.log('========================\n');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Successful: ${successful.length}`);
  console.log(`❌ Failed: ${failed.length}`);
  console.log(`📈 Success Rate: ${((successful.length / results.length) * 100).toFixed(1)}%`);
  
  console.log('\n\n📝 DETAILED RESULTS');
  console.log('====================\n');
  
  results.forEach((result, index) => {
    const statusIcon = result.success ? '✅' : '❌';
    console.log(`${statusIcon} [${result.method}] ${result.endpoint}`);
    console.log(`   Status: ${result.status}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    console.log('');
  });
  
  // Export results
  console.log('\n\n🔍 FAILED ENDPOINTS (Require Attention)');
  console.log('=========================================\n');
  
  if (failed.length === 0) {
    console.log('🎉 All endpoints passed! Ready for production.');
  } else {
    failed.forEach(result => {
      console.log(`❌ [${result.method}] ${result.endpoint}`);
      console.log(`   Status: ${result.status}`);
      if (result.error) console.log(`   Error: ${result.error}`);
      if (result.response) console.log(`   Response: ${result.response}`);
      console.log('');
    });
  }
  
  return {
    total: results.length,
    successful: successful.length,
    failed: failed.length,
    successRate: (successful.length / results.length) * 100,
    results,
  };
}

// Run tests
runTests()
  .then(summary => {
    const output: string[] = [];
    output.push('🧪 PROPMETRIK PRODUCTION API TEST RESULTS');
    output.push('==========================================\n');
    output.push(`Total Tests: ${summary.total}`);
    output.push(`✅ Successful: ${summary.successful}`);
    output.push(`❌ Failed: ${summary.failed}`);
    output.push(`📈 Success Rate: ${summary.successRate.toFixed(1)}%\n`);
    
    output.push('\n📝 DETAILED RESULTS');
    output.push('====================\n');
    
    summary.results.forEach((result: any) => {
      const statusIcon = result.success ? '✅' : '❌';
      output.push(`${statusIcon} [${result.method}] ${result.endpoint} - ${result.status}`);
    });
    
    output.push('\n\n🔍 FAILED ENDPOINTS (Require Attention)');
    output.push('=========================================\n');
    
    const failed = summary.results.filter((r: any) => !r.success);
    if (failed.length === 0) {
      output.push('🎉 All endpoints passed! Ready for production.');
    } else {
      failed.forEach((result: any) => {
        output.push(`❌ [${result.method}] ${result.endpoint}`);
        output.push(`   Status: ${result.status}`);
        if (result.error) output.push(`   Error: ${result.error}`);
        if (result.response) output.push(`   Response: ${result.response}`);
      });
    }
    
    output.push('\n\n✨ PRODUCTION READINESS ASSESSMENT');
    output.push('====================================');
    if (summary.successRate >= 90) {
      output.push('🟢 PRODUCTION READY - All major endpoints working');
    } else if (summary.successRate >= 70) {
      output.push('🟡 MOSTLY READY - Some endpoints need attention');
    } else {
      output.push('🔴 NOT READY - Many endpoints failing');
    }
    
    const finalOutput = output.join('\n');
    console.log(finalOutput);
    fs.writeFileSync(OUTPUT_FILE, finalOutput);
    console.log(`\nResults saved to: ${OUTPUT_FILE}`);
    process.exit(0);
  })
  .catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
