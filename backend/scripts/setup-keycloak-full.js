const https = require('https');
const querystring = require('querystring');

async function httpReq(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  console.log('=== Creating propmetrik-esign client ===\n');
  
  // Get token from propmetrik realm
  const tokenData = querystring.stringify({
    grant_type: 'client_credentials',
    client_id: 'propmetrik-api',
    client_secret: '4JP1ubsCOkaZAaoY8Ec6CkDflw7gP8AK'
  });
  
  let token;
  for (let i = 0; i < 3; i++) {
    const tokenRes = await httpReq({
      hostname: 'sso.cedynhq.com',
      path: '/realms/propmetrik/protocol/openid-connect/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': tokenData.length }
    }, tokenData);
    
    if (tokenRes.status === 200) {
      token = JSON.parse(tokenRes.data).access_token;
      console.log('1. Got access token');
      break;
    }
    console.log(`   Retry ${i + 1}/3 - Status: ${tokenRes.status}`);
    await new Promise(r => setTimeout(r, 2000));
  }
  
  if (!token) {
    console.log('ERROR: Could not get access token');
    return;
  }

  // Try to create the client directly
  const clientBody = JSON.stringify({
    clientId: 'propmetrik-esign',
    name: 'PropMetrik E-Sign (Documenso)',
    enabled: true,
    protocol: 'openid-connect',
    publicClient: false,
    clientAuthenticatorType: 'client-secret',
    standardFlowEnabled: true,
    directAccessGrantsEnabled: true,
    redirectUris: [
      'http://localhost:3005/*',
      'http://localhost:3005/api/auth/callback/oidc',
      'https://esign.propmetrik.com/*'
    ],
    webOrigins: [
      'http://localhost:3005',
      'https://esign.propmetrik.com'
    ]
  });
  
  const createRes = await httpReq({
    hostname: 'sso.cedynhq.com',
    path: '/admin/realms/propmetrik/clients',
    method: 'POST',
    headers: { 
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(clientBody)
    }
  }, clientBody);
  
  if (createRes.status === 201) {
    console.log('2. ✅ Client propmetrik-esign created');
  } else if (createRes.status === 409) {
    console.log('2. Client propmetrik-esign already exists');
  } else if (createRes.status === 403) {
    console.log('2. ❌ 403 Forbidden - Service account lacks manage-clients role');
    console.log('\n   The propmetrik-api service account needs the manage-clients role.');
    console.log('   Please add this role in Keycloak Admin Console:');
    console.log('   1. Go to Clients > propmetrik-api > Service Account Roles');
    console.log('   2. Select realm-management in Client Roles dropdown');
    console.log('   3. Add manage-clients role');
    console.log('\n   Or create the client manually:');
    console.log('   1. Go to Clients > Create Client');
    console.log('   2. Client ID: propmetrik-esign');
    console.log('   3. Client authentication: ON');
    console.log('   4. Valid redirect URIs: http://localhost:3005/*');
    return;
  } else {
    console.log('2. Create result:', createRes.status, createRes.data);
    return;
  }

  // Get client secret
  const esignClientRes = await httpReq({
    hostname: 'sso.cedynhq.com',
    path: '/admin/realms/propmetrik/clients?clientId=propmetrik-esign',
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  
  const esignClients = JSON.parse(esignClientRes.data);
  if (esignClients.length === 0) {
    console.log('ERROR: propmetrik-esign client not found after creation');
    return;
  }
  
  const esignClientId = esignClients[0].id;
  
  const secretRes = await httpReq({
    hostname: 'sso.cedynhq.com',
    path: `/admin/realms/propmetrik/clients/${esignClientId}/client-secret`,
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  
  const secret = JSON.parse(secretRes.data).value;
  console.log('3. ✅ Got client secret:', secret);

  // Update .env file
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '../shared-services/documenso/.env');
  
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf-8');
    envContent = envContent.replace(
      /NEXT_PRIVATE_OIDC_CLIENT_SECRET="[^"]*"/,
      `NEXT_PRIVATE_OIDC_CLIENT_SECRET="${secret}"`
    );
    fs.writeFileSync(envPath, envContent);
    console.log('4. ✅ Updated Documenso .env with client secret');
  }

  console.log('\n========================================');
  console.log('✅ COMPLETE! Documenso is ready to use Keycloak SSO');
  console.log('========================================');
  console.log(`Client ID: propmetrik-esign`);
  console.log(`Client Secret: ${secret}`);
  console.log('========================================\n');
}

main().catch(console.error);
