#!/bin/bash

# Script to create cedyn-esign Keycloak client
# This sources credentials from root .env file

set -e

echo "🔐 Creating Keycloak Client for E-Signature Platform"
echo "=================================================="

# Source root .env to get Keycloak credentials
if [ -f "../.env" ]; then
    export $(grep -v '^#' ../.env | xargs)
    echo "✅ Loaded credentials from root .env"
else
    echo "❌ Error: Root .env file not found!"
    exit 1
fi

# Keycloak connection details
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
REALM="${KEYCLOAK_REALM:-cedyn}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD}"

echo ""
echo "📊 Keycloak Configuration:"
echo "   URL: $KEYCLOAK_URL"
echo "   Realm: $REALM"
echo "   Admin User: $ADMIN_USER"
echo ""

# Check if Keycloak is running
echo "🔍 Checking if Keycloak is accessible..."
if ! curl -f -s "$KEYCLOAK_URL/realms/$REALM" > /dev/null 2>&1; then
    echo "❌ Error: Keycloak is not accessible at $KEYCLOAK_URL"
    echo "   Please start Keycloak first with: docker-compose up -d keycloak"
    exit 1
fi
echo "✅ Keycloak is accessible"
echo ""

# Get admin access token
echo "🔑 Getting admin access token..."
TOKEN_RESPONSE=$(curl -s -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=$ADMIN_USER" \
  -d "password=$ADMIN_PASS" \
  -d "grant_type=password" \
  -d "client_id=admin-cli")

ACCESS_TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.access_token')

if [ "$ACCESS_TOKEN" == "null" ] || [ -z "$ACCESS_TOKEN" ]; then
    echo "❌ Error: Failed to get access token"
    echo "   Response: $TOKEN_RESPONSE"
    exit 1
fi
echo "✅ Admin access token obtained"
echo ""

# Check if client already exists
echo "🔍 Checking if client 'cedyn-esign' already exists..."
CLIENT_EXISTS=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/clients" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" | jq -r '.[] | select(.clientId=="cedyn-esign") | .id')

if [ ! -z "$CLIENT_EXISTS" ]; then
    echo "⚠️  Client 'cedyn-esign' already exists (ID: $CLIENT_EXISTS)"
    echo "   Retrieving existing client secret..."
    
    # Get the client secret
    CLIENT_SECRET=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/clients/$CLIENT_EXISTS/client-secret" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H "Content-Type: application/json" | jq -r '.value')
    
    echo ""
    echo "✅ Existing Client Configuration:"
    echo "   Client ID: cedyn-esign"
    echo "   Client Secret: $CLIENT_SECRET"
    echo ""
    echo "📝 Update your root .env file with:"
    echo "   ESIGN_KEYCLOAK_CLIENT_SECRET=$CLIENT_SECRET"
    echo ""
    exit 0
fi

# Create the client
echo "🔨 Creating new client 'cedyn-esign'..."

CLIENT_CONFIG='{
  "clientId": "cedyn-esign",
  "name": "Cedyn E-Signature Platform",
  "description": "OAuth client for e-signature platform with Google Workspace integration",
  "enabled": true,
  "clientAuthenticatorType": "client-secret",
  "secret": "",
  "redirectUris": [
    "http://localhost:3001/*",
    "http://localhost:3001/oauth2callback",
    "http://localhost:3001/auth/callback"
  ],
  "webOrigins": [
    "http://localhost:3001",
    "http://localhost:3000"
  ],
  "protocol": "openid-connect",
  "publicClient": false,
  "bearerOnly": false,
  "standardFlowEnabled": true,
  "implicitFlowEnabled": false,
  "directAccessGrantsEnabled": true,
  "serviceAccountsEnabled": true,
  "authorizationServicesEnabled": false,
  "fullScopeAllowed": true,
  "attributes": {
    "access.token.lifespan": "3600",
    "client.secret.creation.time": "'"$(date +%s)"'"
  },
  "protocolMappers": [
    {
      "name": "email",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-usermodel-property-mapper",
      "consentRequired": false,
      "config": {
        "userinfo.token.claim": "true",
        "user.attribute": "email",
        "id.token.claim": "true",
        "access.token.claim": "true",
        "claim.name": "email",
        "jsonType.label": "String"
      }
    },
    {
      "name": "full_name",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-full-name-mapper",
      "consentRequired": false,
      "config": {
        "id.token.claim": "true",
        "access.token.claim": "true",
        "userinfo.token.claim": "true"
      }
    },
    {
      "name": "groups",
      "protocol": "openid-connect",
      "protocolMapper": "oidc-group-membership-mapper",
      "consentRequired": false,
      "config": {
        "full.path": "false",
        "id.token.claim": "true",
        "access.token.claim": "true",
        "claim.name": "groups",
        "userinfo.token.claim": "true"
      }
    }
  ]
}'

CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$KEYCLOAK_URL/admin/realms/$REALM/clients" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$CLIENT_CONFIG")

HTTP_CODE=$(echo "$CREATE_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$CREATE_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" != "201" ]; then
    echo "❌ Error: Failed to create client (HTTP $HTTP_CODE)"
    echo "   Response: $RESPONSE_BODY"
    exit 1
fi

echo "✅ Client created successfully"
echo ""

# Get the created client ID
echo "🔍 Retrieving client details..."
CLIENT_ID=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/clients" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" | jq -r '.[] | select(.clientId=="cedyn-esign") | .id')

if [ -z "$CLIENT_ID" ]; then
    echo "❌ Error: Could not find created client"
    exit 1
fi

# Get the client secret
CLIENT_SECRET=$(curl -s -X GET "$KEYCLOAK_URL/admin/realms/$REALM/clients/$CLIENT_ID/client-secret" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" | jq -r '.value')

if [ -z "$CLIENT_SECRET" ] || [ "$CLIENT_SECRET" == "null" ]; then
    echo "❌ Error: Could not retrieve client secret"
    exit 1
fi

echo "✅ Client details retrieved"
echo ""
echo "=================================================="
echo "🎉 Keycloak Client Created Successfully!"
echo "=================================================="
echo ""
echo "📋 Client Configuration:"
echo "   Client ID: cedyn-esign"
echo "   Client Secret: $CLIENT_SECRET"
echo "   Internal ID: $CLIENT_ID"
echo ""
echo "🔗 Valid Redirect URIs:"
echo "   - http://localhost:3001/*"
echo "   - http://localhost:3001/oauth2callback"
echo "   - http://localhost:3001/auth/callback"
echo ""
echo "🌐 Web Origins:"
echo "   - http://localhost:3001"
echo "   - http://localhost:3000"
echo ""
echo "📝 IMPORTANT: Update your root .env file!"
echo "   Replace this line in /cedyn-sso/.env:"
echo ""
echo "   ESIGN_KEYCLOAK_CLIENT_SECRET=YOUR_ESIGN_CLIENT_SECRET_HERE"
echo ""
echo "   With:"
echo ""
echo "   ESIGN_KEYCLOAK_CLIENT_SECRET=$CLIENT_SECRET"
echo ""
echo "=================================================="

# Optionally auto-update .env file
read -p "Would you like to automatically update the root .env file? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -f "../.env" ]; then
        # Create backup
        cp ../.env ../.env.backup
        echo "✅ Created backup: ../.env.backup"
        
        # Update the .env file
        sed -i.tmp "s/ESIGN_KEYCLOAK_CLIENT_SECRET=.*/ESIGN_KEYCLOAK_CLIENT_SECRET=$CLIENT_SECRET/" ../.env
        rm ../.env.tmp
        
        echo "✅ Updated root .env file with client secret"
        echo ""
        echo "🎉 All done! You can now start the e-signature platform:"
        echo "   cd phase12-esign"
        echo "   docker-compose up -d"
    else
        echo "❌ Error: Could not find root .env file"
    fi
else
    echo "⚠️  Please manually update the root .env file with the client secret above"
fi

echo ""
echo "✅ Setup complete!"
