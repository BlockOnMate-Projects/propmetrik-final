const path = require('path');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const KEYCLOAK_URL = (process.env.KEYCLOAK_URL || '').replace(/\/$/, '');
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'propmetrik';
const ADMIN_CLIENT_ID = process.env.KEYCLOAK_ADMIN_CLIENT_ID || process.env.KEYCLOAK_CLIENT_ID;
const ADMIN_CLIENT_SECRET = process.env.KEYCLOAK_ADMIN_SECRET || process.env.KEYCLOAK_CLIENT_SECRET;
const ADMIN_REALM = process.env.KEYCLOAK_ADMIN_REALM || 'master';
const ADMIN_USERNAME = process.env.KEYCLOAK_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD;

async function requestToken(realm, params) {
  const tokenRes = await axios.post(
    `${KEYCLOAK_URL}/realms/${realm}/protocol/openid-connect/token`,
    new URLSearchParams(params).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return tokenRes.data.access_token;
}

async function getAdminToken() {
  const attempts = [];

  if (ADMIN_CLIENT_ID && ADMIN_CLIENT_SECRET) {
    attempts.push(async () => ({
      token: await requestToken(KEYCLOAK_REALM, {
        grant_type: 'client_credentials',
        client_id: ADMIN_CLIENT_ID,
        client_secret: ADMIN_CLIENT_SECRET,
      }),
      method: `client_credentials@${KEYCLOAK_REALM}`,
    }));

    if (ADMIN_REALM !== KEYCLOAK_REALM) {
      attempts.push(async () => ({
        token: await requestToken(ADMIN_REALM, {
          grant_type: 'client_credentials',
          client_id: ADMIN_CLIENT_ID,
          client_secret: ADMIN_CLIENT_SECRET,
        }),
        method: `client_credentials@${ADMIN_REALM}`,
      }));
    }
  }

  if (ADMIN_USERNAME && ADMIN_PASSWORD) {
    attempts.push(async () => ({
      token: await requestToken(ADMIN_REALM, {
        grant_type: 'password',
        client_id: ADMIN_CLIENT_ID || 'admin-cli',
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD,
      }),
      method: `password@${ADMIN_REALM}`,
    }));
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

async function main() {
  if (!KEYCLOAK_URL || !KEYCLOAK_REALM) {
    console.error('Missing KEYCLOAK_URL / KEYCLOAK_REALM.');
    console.error('Set either KEYCLOAK_ADMIN_CLIENT_ID + KEYCLOAK_ADMIN_SECRET, or KEYCLOAK_ADMIN_USERNAME + KEYCLOAK_ADMIN_PASSWORD.');
    process.exit(1);
  }

  const token = await getAdminToken();
  const clientsRes = await axios.get(
    `${KEYCLOAK_URL}/admin/realms/${KEYCLOAK_REALM}/clients`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  console.log(`All clients in realm '${KEYCLOAK_REALM}':`);
  clientsRes.data
    .sort((a, b) => String(a.clientId).localeCompare(String(b.clientId)))
    .forEach((client) => {
      console.log(` - ${client.clientId} (${client.id})`);
    });
}

main().catch((error) => {
  const message = error?.response?.data
    ? JSON.stringify(error.response.data)
    : error.message;
  console.error('Failed to list clients:', message);
  process.exit(1);
});
