# PROPMETRIK Keycloak Configuration
# Realm: propmetrik

## Realm Settings

The propmetrik realm should be configured with the following settings:

### General Settings
- **Realm name**: `propmetrik`
- **Display name**: `PROPMETRIK - Ghana Property Platform`
- **Enabled**: Yes
- **User registration**: Enabled
- **Email as username**: Yes
- **Login with email**: Yes
- **Verify email**: Yes
- **Forgot password**: Enabled

### Login Settings
- **Remember Me**: Enabled
- **Login timeout**: 30 minutes
- **Login action timeout**: 5 minutes

### Token Settings
- **Access Token Lifespan**: 15 minutes
- **Refresh Token Lifespan**: 30 days
- **SSO Session Idle**: 30 minutes
- **SSO Session Max**: 10 hours

---

## Clients Configuration

### 1. propmetrik-api (Backend Service)
```json
{
  "clientId": "propmetrik-api",
  "name": "PROPMETRIK API Backend",
  "description": "Backend API service for PROPMETRIK platform",
  "enabled": true,
  "clientAuthenticatorType": "client-secret",
  "protocol": "openid-connect",
  "publicClient": false,
  "bearerOnly": true,
  "standardFlowEnabled": false,
  "directAccessGrantsEnabled": false,
  "serviceAccountsEnabled": true,
  "authorizationServicesEnabled": true
}
```

### 2. propmetrik-web (Web Frontend)
```json
{
  "clientId": "propmetrik-web",
  "name": "PROPMETRIK Web Application",
  "description": "Web frontend for PROPMETRIK platform",
  "enabled": true,
  "protocol": "openid-connect",
  "publicClient": true,
  "standardFlowEnabled": true,
  "directAccessGrantsEnabled": false,
  "redirectUris": [
    "https://app.propmetrik.com/*",
    "http://localhost:3000/*",
    "http://localhost:5173/*"
  ],
  "webOrigins": [
    "https://app.propmetrik.com",
    "http://localhost:3000",
    "http://localhost:5173"
  ],
  "attributes": {
    "pkce.code.challenge.method": "S256"
  }
}
```

### 3. propmetrik-mobile (Mobile App)
```json
{
  "clientId": "propmetrik-mobile",
  "name": "PROPMETRIK Mobile Application",
  "description": "Mobile app for PROPMETRIK platform",
  "enabled": true,
  "protocol": "openid-connect",
  "publicClient": true,
  "standardFlowEnabled": true,
  "directAccessGrantsEnabled": false,
  "redirectUris": [
    "propmetrik://callback",
    "com.propmetrik.app://callback"
  ],
  "attributes": {
    "pkce.code.challenge.method": "S256"
  }
}
```

### 4. propmetrik-tenant-portal (Tenant Portal)
```json
{
  "clientId": "propmetrik-tenant-portal",
  "name": "PROPMETRIK Tenant Portal",
  "enabled": true,
  "protocol": "openid-connect",
  "publicClient": false,
  "clientAuthenticatorType": "client-secret",
  "standardFlowEnabled": true,
  "directAccessGrantsEnabled": false,
  "redirectUris": [
    "https://tenant.propmetrik.com/*",
    "http://localhost:3001/*"
  ],
  "webOrigins": [
    "https://tenant.propmetrik.com",
    "http://localhost:3001"
  ],
  "attributes": {
    "pkce.code.challenge.method": "S256"
  }
}
```

---

## Automated Client Provisioning

Use backend automation to create/update required clients with production-safe defaults:

```bash
cd backend
npm run keycloak:provision
```

Script file: `scripts/provision-keycloak-clients.js`

### Required env vars
- `KEYCLOAK_URL`
- `KEYCLOAK_REALM`
- Admin auth (choose one)
  - `KEYCLOAK_ADMIN_CLIENT_ID` + `KEYCLOAK_ADMIN_SECRET`
    - fallback: `KEYCLOAK_CLIENT_ID` + `KEYCLOAK_CLIENT_SECRET`
  - or `KEYCLOAK_ADMIN_USERNAME` + `KEYCLOAK_ADMIN_PASSWORD`
    - default admin realm: `master` (override with `KEYCLOAK_ADMIN_REALM`)

### Optional env vars
- `KEYCLOAK_WEB_CLIENT_ID`
- `KEYCLOAK_TENANT_CLIENT_ID`
- `KEYCLOAK_TENANT_CLIENT_SECRET`
- `KEYCLOAK_ESIGN_CLIENT_ID`
- `KEYCLOAK_ADMIN_REALM` (default: `master`)
- `TENANT_PORTAL_URL` (used for default login redirect URI)
- `KEYCLOAK_WEB_REDIRECT_URIS` (CSV)
- `KEYCLOAK_WEB_ORIGINS` (CSV)
- `KEYCLOAK_TENANT_REDIRECT_URIS` (CSV)
- `KEYCLOAK_TENANT_WEB_ORIGINS` (CSV)
- `KEYCLOAK_ESIGN_REDIRECT_URIS` (CSV)
- `KEYCLOAK_ESIGN_WEB_ORIGINS` (CSV)

---

## Realm Roles

### Application Roles
| Role | Description |
|------|-------------|
| `super_admin` | Full system access - platform administrators |
| `admin` | Organization admin - manages organization settings and users |
| `agent` | Real estate agent - can list and manage properties |
| `valuer` | Property valuer - can perform valuations |
| `analyst` | Market analyst - can access analytics and reports |
| `user` | Regular user - can search, save, and inquire about properties |
| `developer` | Property developer - can manage development projects |
| `property_manager` | Manages rental properties and tenants |
| `api_consumer` | External API access for partners |

### Client Roles (propmetrik-api)
| Role | Description |
|------|-------------|
| `property:read` | Can read property listings |
| `property:write` | Can create/update property listings |
| `property:delete` | Can delete property listings |
| `property:verify` | Can verify property data |
| `transaction:read` | Can view transaction history |
| `transaction:write` | Can record transactions |
| `analytics:view` | Can view analytics dashboards |
| `analytics:export` | Can export analytics data |
| `user:manage` | Can manage users within organization |
| `organization:manage` | Can manage organization settings |
| `valuation:create` | Can create property valuations |
| `valuation:approve` | Can approve valuations |
| `document:upload` | Can upload documents |
| `document:verify` | Can verify documents |

---

## Groups

### Organization-based Groups
Groups should be created dynamically when organizations are created:
- `/organizations/{organization_id}`
  - Members inherit organization-specific roles
  - Used for row-level security

### Role-based Groups
- `/roles/super_admins` - Platform super administrators
- `/roles/agents` - All agents across organizations
- `/roles/valuers` - All valuers across organizations
- `/roles/analysts` - All analysts across organizations

---

## Custom User Attributes

Add these custom attributes to the user schema:

| Attribute | Type | Description |
|-----------|------|-------------|
| `organization_id` | String | UUID of user's organization |
| `region` | String | Preferred Ghana region |
| `phone_verified` | Boolean | Whether phone is verified |
| `subscription_tier` | String | User's subscription level |
| `license_number` | String | Professional license (for agents/valuers) |

---

## Identity Providers (Optional)

### Google OAuth
- Client ID: `<google-client-id>`
- Client Secret: `<google-client-secret>`
- Default Identity Provider: false
- Trust Email: true

### Facebook OAuth
- Client ID: `<facebook-app-id>`
- Client Secret: `<facebook-app-secret>`
- Default Identity Provider: false
- Trust Email: false (require verification)

---

## Authentication Flows

### Browser Flow (default with OTP)
1. Cookie
2. Kerberos (disabled)
3. Identity Provider Redirector
4. Forms
   - Username Password Form
   - OTP Form (conditional)

### Registration Flow
1. Registration Form
2. reCAPTCHA
3. Profile Validation
4. Password Validation
5. Email Verification

---

## Required Actions

| Action | Default | Enabled |
|--------|---------|---------|
| Verify Email | true | true |
| Update Password | false | true |
| Configure OTP | false | true |
| Update Profile | false | true |
| Terms and Conditions | true | true |

---

## Password Policy

- Minimum length: 8
- Uppercase characters: 1
- Lowercase characters: 1
- Digits: 1
- Special characters: 1
- Not username
- Not email
- Password history: 3
- Expire password: 90 days (optional)

---

## Brute Force Detection

- Enabled: true
- Permanent Lockout: false
- Max Login Failures: 5
- Wait Increment: 60 seconds
- Quick Login Check Milli Seconds: 1000
- Min Quick Login Wait: 60 seconds
- Max Wait: 900 seconds (15 minutes)
- Failure Reset Time: 12 hours

---

## Events Configuration

### Login Events
Store for: 90 days
Events to capture:
- LOGIN
- LOGIN_ERROR
- LOGOUT
- REGISTER
- UPDATE_PASSWORD
- RESET_PASSWORD
- SEND_RESET_PASSWORD

### Admin Events
Store for: 90 days
Include representation: true

---

## SMTP Configuration

```
Host: smtp.sendgrid.net
Port: 587
From: noreply@propmetrik.com
From Display Name: PROPMETRIK
Enable SSL: false
Enable StartTLS: true
Auth: true
User: apikey
Password: <sendgrid-api-key>
```

---

## Terraform/Keycloak CLI Commands

To set up programmatically, use the Keycloak Admin CLI:

```bash
# Create realm
kcadm.sh create realms -s realm=propmetrik -s enabled=true

# Create client
kcadm.sh create clients -r propmetrik \
  -s clientId=propmetrik-api \
  -s enabled=true \
  -s bearerOnly=true \
  -s serviceAccountsEnabled=true

# Create realm role
kcadm.sh create roles -r propmetrik -s name=agent -s description="Real estate agent"

# Create user
kcadm.sh create users -r propmetrik \
  -s username=admin@propmetrik.com \
  -s email=admin@propmetrik.com \
  -s enabled=true \
  -s emailVerified=true

# Assign role to user
kcadm.sh add-roles -r propmetrik \
  --uusername admin@propmetrik.com \
  --rolename super_admin
```
