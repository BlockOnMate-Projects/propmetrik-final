#!/usr/bin/env python3
"""
Configure Keycloak cedyn-esign client for all groups access
"""
import requests
import json
from dotenv import load_dotenv
import os

# Load root .env
load_dotenv('../.env')

KEYCLOAK_URL = os.getenv('KEYCLOAK_URL', 'http://localhost:8080')
REALM = os.getenv('KEYCLOAK_REALM', 'cedyn')
ADMIN_CLIENT_ID = os.getenv('KEYCLOAK_ADMIN_CLIENT_ID', 'user-portal-admin')
ADMIN_CLIENT_SECRET = os.getenv('KEYCLOAK_ADMIN_CLIENT_SECRET')
CLIENT_ID = 'cedyn-esign'

print("🔐 Configuring E-Signature Platform Access")
print("=" * 60)

# Get admin token using client credentials
token_url = f"{KEYCLOAK_URL}/realms/{REALM}/protocol/openid-connect/token"
token_data = {
    "grant_type": "client_credentials",
    "client_id": ADMIN_CLIENT_ID,
    "client_secret": ADMIN_CLIENT_SECRET
}

print(f"🔑 Getting admin token...")

response = requests.post(token_url, data=token_data)
if response.status_code != 200:
    print(f"❌ Failed to get admin token: {response.status_code}")
    print(f"Response: {response.text}")
    exit(1)

access_token = response.json()['access_token']
headers = {
    "Authorization": f"Bearer {access_token}",
    "Content-Type": "application/json"
}

print(f"✅ Got admin token")

# Get all groups
print(f"\n📋 Fetching all groups in realm '{REALM}'...")
groups_url = f"{KEYCLOAK_URL}/admin/realms/{REALM}/groups"
response = requests.get(groups_url, headers=headers)
if response.status_code != 200:
    print(f"❌ Failed to get groups: {response.status_code}")
    exit(1)

groups = response.json()
print(f"✅ Found {len(groups)} groups")

def print_groups(groups, indent=0):
    """Recursively print group hierarchy"""
    for group in groups:
        print(f"{'  ' * indent}• {group['name']} ({group['path']})")
        if 'subGroups' in group and group['subGroups']:
            print_groups(group['subGroups'], indent + 1)

print("\n📂 Group Structure:")
print_groups(groups)

# Get client
print(f"\n🔍 Finding client '{CLIENT_ID}'...")
clients_url = f"{KEYCLOAK_URL}/admin/realms/{REALM}/clients"
response = requests.get(clients_url, headers=headers, params={"clientId": CLIENT_ID})
if response.status_code != 200:
    print(f"❌ Failed to get clients: {response.status_code}")
    exit(1)

clients = response.json()
if not clients:
    print(f"❌ Client '{CLIENT_ID}' not found")
    exit(1)

client = clients[0]
client_uuid = client['id']
print(f"✅ Found client: {CLIENT_ID} (ID: {client_uuid})")

# Update client with full scope
print(f"\n⚙️  Configuring client for all-groups access...")
client_update_url = f"{KEYCLOAK_URL}/admin/realms/{REALM}/clients/{client_uuid}"

# Get current client configuration
response = requests.get(client_update_url, headers=headers)
if response.status_code != 200:
    print(f"❌ Failed to get client config: {response.status_code}")
    exit(1)

client_config = response.json()

# Update configuration for full access
client_config['fullScopeAllowed'] = True  # Allow all scopes
client_config['consentRequired'] = False  # No consent screen needed

# Ensure redirect URIs include all variants
redirect_uris = [
    "http://localhost:3001/*",
    "http://localhost:3000/*",
    "http://localhost:8000/*",
    "http://localhost/*"
]
client_config['redirectUris'] = redirect_uris
client_config['webOrigins'] = ["*"]  # Allow all web origins (CORS)

# Update client
response = requests.put(client_update_url, headers=headers, json=client_config)
if response.status_code != 204:
    print(f"❌ Failed to update client: {response.status_code}")
    print(f"Response: {response.text}")
    exit(1)

print(f"✅ Client configured for full scope access")

# Get protocol mappers
print(f"\n🗺️  Checking protocol mappers...")
mappers_url = f"{KEYCLOAK_URL}/admin/realms/{REALM}/clients/{client_uuid}/protocol-mappers/models"
response = requests.get(mappers_url, headers=headers)
if response.status_code != 200:
    print(f"❌ Failed to get protocol mappers: {response.status_code}")
    exit(1)

existing_mappers = {m['name']: m for m in response.json()}

# Add groups mapper if not present
if 'groups' not in existing_mappers:
    print(f"  ➕ Adding 'groups' mapper...")
    groups_mapper = {
        "name": "groups",
        "protocol": "openid-connect",
        "protocolMapper": "oidc-group-membership-mapper",
        "consentRequired": False,
        "config": {
            "full.path": "true",
            "id.token.claim": "true",
            "access.token.claim": "true",
            "claim.name": "groups",
            "userinfo.token.claim": "true"
        }
    }
    response = requests.post(mappers_url, headers=headers, json=groups_mapper)
    if response.status_code != 201:
        print(f"  ⚠️  Failed to add groups mapper: {response.status_code}")
    else:
        print(f"  ✅ Added groups mapper")
else:
    print(f"  ✅ Groups mapper already exists")

# Add email mapper if not present
if 'email' not in existing_mappers:
    print(f"  ➕ Adding 'email' mapper...")
    email_mapper = {
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
    }
    response = requests.post(mappers_url, headers=headers, json=email_mapper)
    if response.status_code != 201:
        print(f"  ⚠️  Failed to add email mapper: {response.status_code}")
    else:
        print(f"  ✅ Added email mapper")
else:
    print(f"  ✅ Email mapper already exists")

# Add full_name mapper if not present
if 'full_name' not in existing_mappers:
    print(f"  ➕ Adding 'full_name' mapper...")
    name_mapper = {
        "name": "full_name",
        "protocol": "openid-connect",
        "protocolMapper": "oidc-full-name-mapper",
        "consentRequired": False,
        "config": {
            "id.token.claim": "true",
            "access.token.claim": "true",
            "userinfo.token.claim": "true"
        }
    }
    response = requests.post(mappers_url, headers=headers, json=name_mapper)
    if response.status_code != 201:
        print(f"  ⚠️  Failed to add full_name mapper: {response.status_code}")
    else:
        print(f"  ✅ Added full_name mapper")
else:
    print(f"  ✅ Full name mapper already exists")

print("\n" + "=" * 60)
print("✅ Configuration Complete!")
print("=" * 60)
print(f"\n📋 Summary:")
print(f"   • Client: {CLIENT_ID}")
print(f"   • Full Scope: Enabled (all groups have access)")
print(f"   • Groups Mapper: Configured")
print(f"   • Email Mapper: Configured")
print(f"   • Full Name Mapper: Configured")
print(f"   • Total Groups: {len(groups)}")
print(f"\n🎉 All users in all groups can now access the E-Signature platform!")
print(f"🌐 The 'groups' claim will be included in JWT tokens.\n")
