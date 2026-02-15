#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const dotenv = require('dotenv');
const { URL } = require('url');

dotenv.config({ path: path.join(__dirname, '../.env') });

const KEYCLOAK_URL = (process.env.KEYCLOAK_URL || '').replace(/\/$/, '');
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'propmetrik';
const ADMIN_CLIENT_ID = process.env.KEYCLOAK_ADMIN_CLIENT_ID || process.env.KEYCLOAK_CLIENT_ID;
const ADMIN_CLIENT_SECRET = process.env.KEYCLOAK_ADMIN_SECRET || process.env.KEYCLOAK_CLIENT_SECRET;
const ADMIN_REALM = process.env.KEYCLOAK_ADMIN_REALM || 'master';
const ADMIN_USERNAME = process.env.KEYCLOAK_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD;

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
const TENANT_PORTAL_URL = (process.env.TENANT_PORTAL_URL || 'http://localhost:3001').replace(/\/$/, '');
const ESIGN_APP_URL = (process.env.ESIGN_APP_URL || 'http://localhost:3005').replace(/\/$/, '');

function csv(value) {
  return (value || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function toOrigin(urlValue) {
  try {
    return new URL(urlValue).origin;
  } catch {
    return null;
  }
}

function withWildcard(baseUrl) {
  return `${baseUrl}/*`;
}

function dedupe(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function maskSecret(secret) {
  if (!secret) return '(none)';
  if (secret.length <= 8) return '********';
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

async function requestToken(realm, params) {
  const tokenUrl = `${KEYCLOAK_URL}/realms/${realm}/protocol/openid-connect/token`;
  const response = await axios.post(tokenUrl, new URLSearchParams(params).toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 20000,
  });
  return response.data.access_token;
}

async function getAdminToken() {
  const attempts = [];

  if (ADMIN_CLIENT_ID && ADMIN_CLIENT_SECRET) {
    attempts.push(async () => {
      const token = await requestToken(KEYCLOAK_REALM, {
        grant_type: 'client_credentials',
        client_id: ADMIN_CLIENT_ID,
        client_secret: ADMIN_CLIENT_SECRET,
      });
      return { token, method: `client_credentials@${KEYCLOAK_REALM}` };
    });

    if (ADMIN_REALM !== KEYCLOAK_REALM) {
      attempts.push(async () => {
        const token = await requestToken(ADMIN_REALM, {
          grant_type: 'client_credentials',
          client_id: ADMIN_CLIENT_ID,
          client_secret: ADMIN_CLIENT_SECRET,
        });
        return { token, method: `client_credentials@${ADMIN_REALM}` };
      });
    }
  }

  if (ADMIN_USERNAME && ADMIN_PASSWORD) {
    attempts.push(async () => {
      const token = await requestToken(ADMIN_REALM, {
        grant_type: 'password',
        client_id: ADMIN_CLIENT_ID || 'admin-cli',
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
      });
      return { token, method: `password@${ADMIN_REALM}` };
    });
  }

  const errors = [];
  for (const attempt of attempts) {
    try {
      const result = await attempt();
      console.log(`Admin auth method: ${result.method}`);
      return result.token;
    } catch (error) {
      const msg = error?.response?.data ? JSON.stringify(error.response.data) : error.message;
      errors.push(msg);
    }
  }

  throw new Error(`Unable to obtain Keycloak admin token. Attempts failed: ${errors.join(' | ')}`);
}

async function findClient(token, clientId) {
  const res = await axios.get(
    `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients`,
    {
      params: { clientId },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 20000,
    }
  );
  return res.data?.[0] || null;
}

async function createClient(token, spec) {
  await axios.post(
    `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients`,
    spec,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    }
  );
}

async function updateClient(token, id, spec) {
  await axios.put(
    `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients/${id}`,
    spec,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    }
  );
}

async function getClientSecret(token, id) {
  const res = await axios.get(
    `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients/${id}/client-secret`,
    {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 20000,
    }
  );
  return res.data?.value || null;
}

function buildClientSpecs() {
  const tenantRedirects = dedupe([
    withWildcard(TENANT_PORTAL_URL),
    ...csv(process.env.KEYCLOAK_TENANT_REDIRECT_URIS),
  ]);

  const tenantOrigins = dedupe([
    toOrigin(TENANT_PORTAL_URL),
    ...csv(process.env.KEYCLOAK_TENANT_WEB_ORIGINS),
  ]);

  const webRedirects = dedupe([
    withWildcard(FRONTEND_URL),
    ...csv(process.env.KEYCLOAK_WEB_REDIRECT_URIS),
  ]);

  const webOrigins = dedupe([
    toOrigin(FRONTEND_URL),
    ...csv(process.env.KEYCLOAK_WEB_ORIGINS),
  ]);

  const esignRedirects = dedupe([
    withWildcard(ESIGN_APP_URL),
    ...csv(process.env.KEYCLOAK_ESIGN_REDIRECT_URIS),
  ]);

  const esignOrigins = dedupe([
    toOrigin(ESIGN_APP_URL),
    ...csv(process.env.KEYCLOAK_ESIGN_WEB_ORIGINS),
  ]);

  return [
    {
      clientId: process.env.KEYCLOAK_CLIENT_ID || 'propmetrik-api',
      name: 'PROPMETRIK API Backend',
      protocol: 'openid-connect',
      enabled: true,
      publicClient: false,
      bearerOnly: true,
      standardFlowEnabled: false,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: true,
      authorizationServicesEnabled: true,
      clientAuthenticatorType: 'client-secret',
      attributes: {
        'oauth2.device.authorization.grant.enabled': 'false',
      },
      _expectSecret: false,
    },
    {
      clientId: process.env.KEYCLOAK_WEB_CLIENT_ID || 'propmetrik-web',
      name: 'PROPMETRIK Web Application',
      protocol: 'openid-connect',
      enabled: true,
      publicClient: true,
      bearerOnly: false,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: false,
      redirectUris: webRedirects,
      webOrigins: webOrigins,
      attributes: {
        'pkce.code.challenge.method': 'S256',
        'oauth2.device.authorization.grant.enabled': 'false',
      },
      _expectSecret: false,
    },
    {
      clientId: process.env.KEYCLOAK_TENANT_CLIENT_ID || 'propmetrik-tenant-portal',
      name: 'PROPMETRIK Tenant Portal',
      protocol: 'openid-connect',
      enabled: true,
      publicClient: false,
      bearerOnly: false,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: true,
      serviceAccountsEnabled: false,
      clientAuthenticatorType: 'client-secret',
      redirectUris: tenantRedirects,
      webOrigins: tenantOrigins,
      attributes: {
        'pkce.code.challenge.method': 'S256',
        'oauth2.device.authorization.grant.enabled': 'false',
      },
      _expectSecret: true,
    },
    {
      clientId: process.env.KEYCLOAK_ESIGN_CLIENT_ID || 'propmetrik-esign',
      name: 'PROPMETRIK E-Sign',
      protocol: 'openid-connect',
      enabled: true,
      publicClient: false,
      bearerOnly: false,
      standardFlowEnabled: true,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: false,
      clientAuthenticatorType: 'client-secret',
      redirectUris: esignRedirects,
      webOrigins: esignOrigins,
      attributes: {
        'pkce.code.challenge.method': 'S256',
        'oauth2.device.authorization.grant.enabled': 'false',
      },
      _expectSecret: true,
    },
  ];
}

async function upsertClient(token, spec) {
  const existing = await findClient(token, spec.clientId);
  const payload = { ...spec };
  delete payload._expectSecret;

  if (!existing) {
    await createClient(token, payload);
    const created = await findClient(token, spec.clientId);
    return { action: 'created', client: created };
  }

  await updateClient(token, existing.id, {
    ...existing,
    ...payload,
  });

  const updated = await findClient(token, spec.clientId);
  return { action: 'updated', client: updated };
}

async function main() {
  if (!KEYCLOAK_URL || !KEYCLOAK_REALM) {
    console.error('Missing required Keycloak env values.');
    console.error('Required: KEYCLOAK_URL and KEYCLOAK_REALM.');
    console.error('Auth options: KEYCLOAK_ADMIN_CLIENT_ID/KEYCLOAK_ADMIN_SECRET, or KEYCLOAK_ADMIN_USERNAME/KEYCLOAK_ADMIN_PASSWORD.');
    process.exit(1);
  }

  console.log('=== Keycloak Client Provisioning ===');
  console.log(`Realm: ${KEYCLOAK_REALM}`);
  console.log(`Admin client: ${ADMIN_CLIENT_ID}`);

  try {
    const token = await getAdminToken();
    const specs = buildClientSpecs();
    const secretReport = [];

    for (const spec of specs) {
      const result = await upsertClient(token, spec);
      console.log(`- ${spec.clientId}: ${result.action}`);

      if (spec._expectSecret && result.client?.id) {
        const secret = await getClientSecret(token, result.client.id);
        secretReport.push({ clientId: spec.clientId, secret: maskSecret(secret) });
      }
    }

    if (secretReport.length > 0) {
      console.log('\nClient secrets (masked):');
      secretReport.forEach((entry) => {
        console.log(`  ${entry.clientId}: ${entry.secret}`);
      });
    }

    console.log('\n✅ Keycloak clients are provisioned for production defaults.');
  } catch (error) {
    const message = error?.response?.data
      ? JSON.stringify(error.response.data)
      : error.message;
    console.error('❌ Provisioning failed:', message);
    process.exit(1);
  }
}

main();
