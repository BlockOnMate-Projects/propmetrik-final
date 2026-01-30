# Manual Keycloak Client Creation Guide

Since the automated script had authentication issues, here's how to create the `cedyn-esign` client manually:

## Step 1: Access Keycloak Admin Console

Open your browser and go to: **http://localhost:8080**

## Step 2: Login

Use the credentials from your root `.env` file:
- Username: `cedyn`
- Password: `N9gAuG+p5P50npLxoCLC4PtKBMjZXQiQ`

## Step 3: Select the Cedyn Realm

1. In the top-left corner, click the dropdown that says "Keycloak" or "master"
2. Select **"cedyn"** realm

## Step 4: Create New Client

1. Click **"Clients"** in the left sidebar
2. Click **"Create client"** button
3. Fill in the form:

### General Settings:
- **Client type**: OpenID Connect
- **Client ID**: `cedyn-esign`
- Click **"Next"**

### Capability config:
- **Client authentication**: ON (toggle to enabled)
- **Authorization**: OFF
- **Authentication flow**:
  - ✅ Standard flow
  - ✅ Direct access grants
  - ✅ Service accounts roles
- Click **"Next"**

### Login settings:
- **Root URL**: `http://localhost:3001`
- **Home URL**: `http://localhost:3001`
- **Valid redirect URIs**: 
  ```
  http://localhost:3001/*
  http://localhost:3001/oauth2callback
  http://localhost:3001/auth/callback
  ```
- **Valid post logout redirect URIs**: `http://localhost:3001/*`
- **Web origins**: 
  ```
  http://localhost:3001
  http://localhost:3000
  ```
- Click **"Save"**

## Step 5: Get the Client Secret

1. After saving, you'll see the client details page
2. Click on the **"Credentials"** tab at the top
3. You'll see the **Client secret** field
4. Click the "Copy to clipboard" icon next to the secret
5. **IMPORTANT**: Save this secret immediately!

## Step 6: Update Root .env File

1. Open `/cedyn-sso/.env` in your editor
2. Find the line: `ESIGN_KEYCLOAK_CLIENT_SECRET=YOUR_ESIGN_CLIENT_SECRET_HERE`
3. Replace `YOUR_ESIGN_CLIENT_SECRET_HERE` with the client secret you copied
4. Save the file

Example:
```bash
ESIGN_KEYCLOAK_CLIENT_SECRET=abc123def456ghi789...
```

## Step 7: Configure Mappers (Optional but Recommended)

1. Still in the client settings, click the **"Client scopes"** tab
2. Click on **"cedyn-esign-dedicated"**
3. Click **"Add mapper"** → **"By configuration"**
4. Add these mappers:

### Email Mapper:
- **Name**: email
- **Mapper Type**: User Property
- **Property**: email
- **Token Claim Name**: email
- **Claim JSON Type**: String
- **Add to ID token**: ON
- **Add to access token**: ON
- **Add to userinfo**: ON

### Groups Mapper:
- **Name**: groups
- **Mapper Type**: Group Membership
- **Token Claim Name**: groups
- **Full group path**: OFF
- **Add to ID token**: ON
- **Add to access token**: ON
- **Add to userinfo**: ON

## Step 8: Verify Configuration

Run this command to test:
```bash
curl -X POST "http://localhost:8080/realms/cedyn/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=cedyn-esign" \
  -d "client_secret=YOUR_CLIENT_SECRET_HERE" \
  -d "grant_type=client_credentials"
```

You should get a JSON response with an `access_token`.

## Done! ✅

Your `cedyn-esign` Keycloak client is now configured and the secret is saved in your root `.env` file.

Next steps:
1. Fill in Google OAuth credentials in `.env` (later)
2. Start the e-signature platform: `cd phase12-esign && docker-compose up -d`
