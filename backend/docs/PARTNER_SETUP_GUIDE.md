# Partner Setup Guide - Keycloak Configuration

This guide explains how to configure Tier 1/2 partners for secure API access using Keycloak OAuth2 Client Credentials flow.

## Overview

Each partner organization (e.g., Ghana Lands Commission, Agricultural Development Bank) gets:
- A dedicated Keycloak **client** for API authentication
- **Service account roles** for API authorization
- **Data source mappings** for access control
- **Custom claims** for partner context

## Prerequisites

- Keycloak admin access
- Database access for data source configuration
- Understanding of OAuth2 Client Credentials flow

## Step 1: Create Partner Client in Keycloak

### 1.1 Create New Client

1. Login to Keycloak Admin Console: `https://auth.propmetrik.com/admin`
2. Select **Propmetrik** realm
3. Navigate to **Clients** → **Create Client**

**Client Settings:**
```
Client ID: ghana-lands-commission-api
Name: Ghana Lands Commission API Client
Description: API access for Ghana Lands Commission data submissions
Protocol: openid-connect
Client Type: Confidential
```

### 1.2 Configure Client Settings

**General Settings:**
- Client ID: `ghana-lands-commission-api`
- Name: `Ghana Lands Commission API Client`
- Enabled: `ON`

**Access Settings:**
- Root URL: *(leave empty)*
- Home URL: *(leave empty)*
- Valid Redirect URIs: *(leave empty - not needed for client credentials)*
- Valid Post Logout Redirect URIs: *(leave empty)*
- Web Origins: *(leave empty)*

**Capability Config:**
- Client Authentication: `ON` ✅
- Authorization: `OFF`
- Authentication Flow Overrides:
  - Standard Flow: `DISABLED`
  - Direct Access Grants: `DISABLED`
  - Implicit Flow: `DISABLED`
  - Service Account Roles: `ENABLED` ✅
  - OAuth 2.0 Device Authorization Grant: `DISABLED`
  - OIDC CIBA Grant: `DISABLED`

### 1.3 Generate Client Secret

1. Go to **Credentials** tab
2. Copy the **Client Secret** (you'll need this for partner configuration)
3. Store securely - this acts as the partner's password

**Example:**
```
Client ID: ghana-lands-commission-api
Client Secret: a1b2c3d4-5678-90ef-ghij-klmnopqrstuv
```

## Step 2: Configure Service Account

### 2.1 Create Custom Scope

1. Navigate to **Client Scopes** → **Create Client Scope**

**Scope Settings:**
```
Name: api-ingest
Description: API Data Ingestion Access
Protocol: openid-connect
Include in Token Scope: ON
Display on Consent Screen: OFF
```

### 2.2 Add Custom Claims Mapper

In the `api-ingest` scope:

1. Go to **Mappers** → **Configure a new mapper**
2. Choose **Mapper Type**: `Hardcoded claim`

**Mapper Configuration:**
```
Name: partner-tier-claim
Token Claim Name: partner_tier
Claim value: tier1_government
Claim JSON Type: String
Add to ID Token: OFF
Add to Access Token: ON
Add to Userinfo: OFF
Multivalued: OFF
```

### 2.3 Assign Scope to Client

1. Go back to your client: **Clients** → `ghana-lands-commission-api`
2. **Client Scopes** tab → **Add Client Scope**
3. Select `api-ingest` scope
4. Set as **Default** scope

### 2.4 Configure Service Account Roles

1. In client settings, go to **Service Account Roles** tab
2. The service account user should be auto-created: `service-account-ghana-lands-commission-api`
3. We'll assign roles in the next step

## Step 3: Create Partner-Specific Roles

### 3.1 Create Realm Role

1. Navigate to **Realm Roles** → **Create Role**

**Role Settings:**
```
Role Name: partner-data-provider
Description: Allows partners to submit data via API
```

### 3.2 Create Client-Specific Role

1. Navigate to **Clients** → `ghana-lands-commission-api` → **Roles** → **Create Role**

**Role Settings:**
```
Role Name: ghana-lands-commission-data-access
Description: Ghana Lands Commission specific data access
```

### 3.3 Assign Roles to Service Account

1. Go to **Clients** → `ghana-lands-commission-api` → **Service Account Roles**
2. Assign **Realm Roles**: `partner-data-provider`
3. Assign **Client Roles** → Select `ghana-lands-commission-api` → `ghana-lands-commission-data-access`

## Step 4: Database Configuration

### 4.1 Create/Update Data Source

Connect to your PostgreSQL database and configure the data source:

```sql
-- Create or update data source for Ghana Lands Commission
INSERT INTO data_sources (
    id,
    name,
    slug,
    tier,
    is_active,
    partner_client_id,
    delivery_channels,
    allowed_datasets,
    data_classification,
    created_at,
    updated_at
) VALUES (
    uuid_generate_v4(),
    'Ghana Lands Commission',
    'ghana-lands-commission',
    'tier1_government',
    true,
    'ghana-lands-commission-api',  -- Must match Keycloak client ID
    ARRAY['portal_file', 'api_push', 'api_pull'],
    ARRAY['land_title_record', 'cadastral_boundary', 'building_permit'],
    'confidential',
    NOW(),
    NOW()
) ON CONFLICT (slug) DO UPDATE SET
    partner_client_id = EXCLUDED.partner_client_id,
    delivery_channels = EXCLUDED.delivery_channels,
    allowed_datasets = EXCLUDED.allowed_datasets,
    data_classification = EXCLUDED.data_classification,
    updated_at = NOW();
```

### 4.2 Verify Configuration

```sql
-- Verify the data source configuration
SELECT 
    id,
    name,
    tier,
    partner_client_id,
    delivery_channels,
    allowed_datasets,
    data_classification
FROM data_sources 
WHERE partner_client_id = 'ghana-lands-commission-api';
```

## Step 5: Test Partner Authentication

### 5.1 Test Token Request

```bash
curl -X POST https://auth.propmetrik.com/realms/propmetrik/protocol/openid_connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=ghana-lands-commission-api" \
  -d "client_secret=a1b2c3d4-5678-90ef-ghij-klmnopqrstuv" \
  -d "scope=api:ingest"
```

**Expected Response:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "api:ingest"
}
```

### 5.2 Test API Access

```bash
# Get the access token from above response
ACCESS_TOKEN="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."

# Test API endpoint
curl -X GET https://api.propmetrik.com/api/v1/ingestion/submissions \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "success": true,
  "data": [],
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 0,
      "pages": 0
    }
  }
}
```

## Step 6: Additional Partner Configuration

### 6.1 IP Allowlisting (Tier 1 Only)

For enhanced security, configure IP allowlisting:

1. **Keycloak Client** → **Advanced** tab
2. **Access Token Lifespan**: Set to reasonable value (1-4 hours)
3. **Client Session Max Lifespan**: Set policy as needed

**Note**: IP filtering would be implemented at the API Gateway/load balancer level.

### 6.2 Webhook Configuration (Optional)

If partners want status callbacks:

```sql
-- Add webhook URL to data source
ALTER TABLE data_sources 
ADD COLUMN IF NOT EXISTS webhook_url TEXT,
ADD COLUMN IF NOT EXISTS webhook_secret VARCHAR(64);

UPDATE data_sources 
SET 
    webhook_url = 'https://partner-api.landscommission.gov.gh/propmetrik/webhook',
    webhook_secret = 'shared-secret-for-hmac-verification'
WHERE partner_client_id = 'ghana-lands-commission-api';
```

## Partner Onboarding Checklist

### For Each New Partner:

- [ ] **Business Agreement** signed
- [ ] **Technical Contact** identified  
- [ ] **Data Classification** determined
- [ ] **Dataset Types** approved
- [ ] **Keycloak Client** created with appropriate settings
- [ ] **Client Credentials** generated and shared securely
- [ ] **Service Account Roles** configured
- [ ] **Database Source** configured with client mapping
- [ ] **API Access** tested end-to-end
- [ ] **Documentation** provided to partner
- [ ] **Monitoring** alerts configured
- [ ] **Support Channels** established

### Security Validation:

- [ ] Client credentials stored securely by partner
- [ ] Token expiration appropriate for use case
- [ ] Rate limits tested and documented
- [ ] Error handling tested
- [ ] IP allowlisting configured (Tier 1)
- [ ] Webhook security configured (if applicable)
- [ ] Access logs monitored

## Troubleshooting

### Common Issues

**1. "Invalid client credentials"**
- Verify client ID and secret are correct
- Check client is enabled in Keycloak
- Ensure Service Account Roles are enabled

**2. "Insufficient scope"**
- Verify `api:ingest` scope is assigned to client
- Check service account has correct roles
- Confirm custom claims are properly mapped

**3. "No authorized data sources"**
- Verify `partner_client_id` in database matches Keycloak client ID exactly
- Check data source is active and has `api_push` in delivery channels
- Confirm partner roles are assigned

**4. Rate limiting issues**
- Check rate limit headers in responses
- Implement exponential backoff in partner systems
- Monitor usage patterns

### Logs to Check

**Keycloak Logs:**
```bash
# Check authentication logs
grep "ghana-lands-commission-api" /opt/keycloak/logs/keycloak.log
```

**Application Logs:**
```bash
# Check partner authentication
grep "Partner authenticated" /var/log/propmetrik/app.log
grep "clientId.*ghana-lands-commission-api" /var/log/propmetrik/app.log
```

**Database Queries:**
```sql
-- Check recent submissions from partner
SELECT 
    id, status, dataset_type, received_at, client_id
FROM ingestion_submissions 
WHERE client_id = 'ghana-lands-commission-api'
ORDER BY received_at DESC 
LIMIT 10;
```

## Security Best Practices

1. **Rotate Client Secrets** regularly (quarterly)
2. **Monitor Token Usage** for anomalies  
3. **Review Access Logs** monthly
4. **Update Partner Documentation** as API evolves
5. **Test Partner Integration** before releases
6. **Maintain Emergency Contacts** for each partner
7. **Document All Configuration Changes**
8. **Use Principle of Least Privilege** for roles/scopes

## Partner Templates

### Template: Tier 1 Government Agency

```sql
INSERT INTO data_sources (
    id,
    name,
    slug,
    tier,
    is_active,
    partner_client_id,
    delivery_channels,
    allowed_datasets,
    data_classification,
    created_at,
    updated_at
) VALUES (
    uuid_generate_v4(),
    '[AGENCY_NAME]',
    '[agency-slug]',
    'tier1_government',
    true,
    '[agency-client-id]',
    ARRAY['portal_file', 'api_push', 'api_pull'],
    ARRAY['land_title_record', 'cadastral_boundary', 'tax_assessment', 'building_permit'],
    'confidential',
    NOW(),
    NOW()
);
```

### Template: Tier 2 Financial Institution

```sql
INSERT INTO data_sources (
    id,
    name,
    slug,
    tier,
    is_active,
    partner_client_id,
    delivery_channels,
    allowed_datasets,
    data_classification,
    created_at,
    updated_at
) VALUES (
    uuid_generate_v4(),
    '[BANK_NAME]',
    '[bank-slug]',
    'tier2_financial',
    true,
    '[bank-client-id]',
    ARRAY['portal_file', 'api_push'],
    ARRAY['mortgage_transaction_stats', 'collateral_valuation'],
    'confidential',
    NOW(),
    NOW()
);
```