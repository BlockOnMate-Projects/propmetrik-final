#!/usr/bin/env python3
"""
Script to create cedyn-esign Keycloak client
This sources credentials from root .env file
"""

import os
import sys
import json
import requests
from pathlib import Path
from dotenv import load_dotenv

def load_env():
    """Load environment variables from root .env"""
    env_path = Path(__file__).parent.parent / '.env'
    if not env_path.exists():
        print("❌ Error: Root .env file not found!")
        sys.exit(1)
    
    load_dotenv(env_path)
    print("✅ Loaded credentials from root .env")
    return env_path

def get_admin_token(keycloak_url, admin_user, admin_pass):
    """Get Keycloak admin access token"""
    print("🔑 Getting admin access token...")
    
    token_url = f"{keycloak_url}/realms/master/protocol/openid-connect/token"
    data = {
        'username': admin_user,
        'password': admin_pass,
        'grant_type': 'password',
        'client_id': 'admin-cli'
    }
    
    try:
        response = requests.post(token_url, data=data)
        response.raise_for_status()
        token = response.json().get('access_token')
        
        if not token:
            print("❌ Error: Failed to get access token")
            sys.exit(1)
        
        print("✅ Admin access token obtained")
        return token
    except requests.exceptions.RequestException as e:
        print(f"❌ Error: Failed to get access token: {e}")
        sys.exit(1)

def check_existing_client(keycloak_url, realm, token, client_id):
    """Check if client already exists"""
    print(f"🔍 Checking if client '{client_id}' already exists...")
    
    clients_url = f"{keycloak_url}/admin/realms/{realm}/clients"
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    
    try:
        response = requests.get(clients_url, headers=headers)
        response.raise_for_status()
        clients = response.json()
        
        for client in clients:
            if client.get('clientId') == client_id:
                return client.get('id')
        return None
    except requests.exceptions.RequestException as e:
        print(f"❌ Error: Failed to check existing clients: {e}")
        sys.exit(1)

def get_client_secret(keycloak_url, realm, token, internal_client_id):
    """Get client secret"""
    secret_url = f"{keycloak_url}/admin/realms/{realm}/clients/{internal_client_id}/client-secret"
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    
    try:
        response = requests.get(secret_url, headers=headers)
        response.raise_for_status()
        return response.json().get('value')
    except requests.exceptions.RequestException as e:
        print(f"❌ Error: Failed to get client secret: {e}")
        return None

def create_client(keycloak_url, realm, token, client_id):
    """Create new Keycloak client"""
    print(f"🔨 Creating new client '{client_id}'...")
    
    client_config = {
        "clientId": client_id,
        "name": "Cedyn E-Signature Platform",
        "description": "OAuth client for e-signature platform with Google Workspace integration",
        "enabled": True,
        "clientAuthenticatorType": "client-secret",
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
        "publicClient": False,
        "bearerOnly": False,
        "standardFlowEnabled": True,
        "implicitFlowEnabled": False,
        "directAccessGrantsEnabled": True,
        "serviceAccountsEnabled": True,
        "authorizationServicesEnabled": False,
        "fullScopeAllowed": True,
        "attributes": {
            "access.token.lifespan": "3600"
        },
        "protocolMappers": [
            {
                "name": "email",
                "protocol": "openid-connect",
                "protocolMapper": "oidc-usermodel-property-mapper",
                "consentRequired": False,
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
                "consentRequired": False,
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
                "consentRequired": False,
                "config": {
                    "full.path": "false",
                    "id.token.claim": "true",
                    "access.token.claim": "true",
                    "claim.name": "groups",
                    "userinfo.token.claim": "true"
                }
            }
        ]
    }
    
    clients_url = f"{keycloak_url}/admin/realms/{realm}/clients"
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    
    try:
        response = requests.post(clients_url, headers=headers, json=client_config)
        response.raise_for_status()
        print("✅ Client created successfully")
        return True
    except requests.exceptions.RequestException as e:
        print(f"❌ Error: Failed to create client: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"   Response: {e.response.text}")
        sys.exit(1)

def update_env_file(env_path, client_secret):
    """Update root .env file with client secret"""
    print("\n📝 Updating root .env file...")
    
    # Read the file
    with open(env_path, 'r') as f:
        content = f.read()
    
    # Create backup
    backup_path = env_path.parent / '.env.backup'
    with open(backup_path, 'w') as f:
        f.write(content)
    print(f"✅ Created backup: {backup_path}")
    
    # Replace the client secret
    new_content = content.replace(
        'ESIGN_KEYCLOAK_CLIENT_SECRET=YOUR_ESIGN_CLIENT_SECRET_HERE',
        f'ESIGN_KEYCLOAK_CLIENT_SECRET={client_secret}'
    )
    
    # Also replace if it already has a value
    import re
    new_content = re.sub(
        r'ESIGN_KEYCLOAK_CLIENT_SECRET=.*',
        f'ESIGN_KEYCLOAK_CLIENT_SECRET={client_secret}',
        new_content
    )
    
    # Write back
    with open(env_path, 'w') as f:
        f.write(new_content)
    
    print("✅ Updated root .env file with client secret")

def main():
    print("🔐 Creating Keycloak Client for E-Signature Platform")
    print("==================================================\n")
    
    # Load environment variables
    env_path = load_env()
    
    # Get configuration
    keycloak_url = os.getenv('KEYCLOAK_URL', 'http://localhost:8080')
    realm = os.getenv('KEYCLOAK_REALM', 'cedyn')
    admin_user = os.getenv('KEYCLOAK_ADMIN', 'admin')
    admin_pass = os.getenv('KEYCLOAK_ADMIN_PASSWORD')
    client_id = 'cedyn-esign'
    
    print(f"📊 Keycloak Configuration:")
    print(f"   URL: {keycloak_url}")
    print(f"   Realm: {realm}")
    print(f"   Admin User: {admin_user}\n")
    
    # Check if Keycloak is accessible
    print("🔍 Checking if Keycloak is accessible...")
    try:
        response = requests.get(f"{keycloak_url}/realms/{realm}")
        response.raise_for_status()
        print("✅ Keycloak is accessible\n")
    except requests.exceptions.RequestException:
        print("❌ Error: Keycloak is not accessible")
        print("   Please start Keycloak first")
        sys.exit(1)
    
    # Get admin token
    token = get_admin_token(keycloak_url, admin_user, admin_pass)
    
    # Check if client exists
    existing_client_id = check_existing_client(keycloak_url, realm, token, client_id)
    
    if existing_client_id:
        print(f"⚠️  Client '{client_id}' already exists (ID: {existing_client_id})")
        print("   Retrieving existing client secret...\n")
        client_secret = get_client_secret(keycloak_url, realm, token, existing_client_id)
    else:
        # Create new client
        create_client(keycloak_url, realm, token, client_id)
        
        # Get the created client ID
        internal_client_id = check_existing_client(keycloak_url, realm, token, client_id)
        if not internal_client_id:
            print("❌ Error: Could not find created client")
            sys.exit(1)
        
        # Get client secret
        client_secret = get_client_secret(keycloak_url, realm, token, internal_client_id)
    
    if not client_secret:
        print("❌ Error: Could not retrieve client secret")
        sys.exit(1)
    
    # Print success message
    print("\n==================================================")
    print("🎉 Keycloak Client Created Successfully!")
    print("==================================================\n")
    print("📋 Client Configuration:")
    print(f"   Client ID: {client_id}")
    print(f"   Client Secret: {client_secret}\n")
    print("🔗 Valid Redirect URIs:")
    print("   - http://localhost:3001/*")
    print("   - http://localhost:3001/oauth2callback")
    print("   - http://localhost:3001/auth/callback\n")
    print("🌐 Web Origins:")
    print("   - http://localhost:3001")
    print("   - http://localhost:3000\n")
    
    # Ask to update .env
    response = input("Would you like to automatically update the root .env file? (y/n): ")
    if response.lower() == 'y':
        update_env_file(env_path, client_secret)
        print("\n🎉 All done! You can now start the e-signature platform:")
        print("   cd phase12-esign")
        print("   docker-compose up -d")
    else:
        print("\n⚠️  Please manually update the root .env file:")
        print(f"   ESIGN_KEYCLOAK_CLIENT_SECRET={client_secret}")
    
    print("\n✅ Setup complete!")

if __name__ == '__main__':
    main()
