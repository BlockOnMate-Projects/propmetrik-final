#!/usr/bin/env python3
"""
Test Google OAuth credentials and Drive API access
"""
import os
import requests
from urllib.parse import urlencode

# Test credentials from .env
GOOGLE_CLIENT_ID = "577958931135-6t5gdcb4mqvdbsls7tcjr2596bdko7s7.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET = "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"
GOOGLE_REDIRECT_URI = "https://neuroseo.io/api/oauth/google/callback"
GOOGLE_SCOPES = "https://www.googleapis.com/auth/drive.readonly"

def test_oauth_url_generation():
    """Test that we can generate a valid OAuth URL"""
    print("=" * 60)
    print("TEST 1: OAuth URL Generation")
    print("=" * 60)
    
    params = {
        'client_id': GOOGLE_CLIENT_ID,
        'redirect_uri': GOOGLE_REDIRECT_URI,
        'response_type': 'code',
        'scope': GOOGLE_SCOPES,
        'access_type': 'offline',
        'prompt': 'consent',
        'state': 'test_state_123'
    }
    
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    
    print(f"✅ Generated OAuth URL:")
    print(f"\n{auth_url}\n")
    print(f"Client ID: {GOOGLE_CLIENT_ID}")
    print(f"Redirect URI: {GOOGLE_REDIRECT_URI}")
    print(f"Scopes: {GOOGLE_SCOPES}")
    print()
    
    return auth_url

def test_client_credentials():
    """Test that client credentials are valid format"""
    print("=" * 60)
    print("TEST 2: Client Credentials Validation")
    print("=" * 60)
    
    checks = {
        "Client ID format": GOOGLE_CLIENT_ID.endswith(".apps.googleusercontent.com"),
        "Client Secret format": GOOGLE_CLIENT_SECRET.startswith("GOCSPX-"),
        "Redirect URI format": GOOGLE_REDIRECT_URI.startswith("https://"),
        "Scopes defined": len(GOOGLE_SCOPES) > 0
    }
    
    all_passed = True
    for check, result in checks.items():
        status = "✅" if result else "❌"
        print(f"{status} {check}: {'PASS' if result else 'FAIL'}")
        if not result:
            all_passed = False
    
    print()
    return all_passed

def test_google_api_endpoints():
    """Test that Google API endpoints are accessible"""
    print("=" * 60)
    print("TEST 3: Google API Endpoint Accessibility")
    print("=" * 60)
    
    endpoints = {
        "OAuth Authorization": "https://accounts.google.com/o/oauth2/v2/auth",
        "OAuth Token": "https://oauth2.googleapis.com/token",
        "Drive API": "https://www.googleapis.com/drive/v3/about",
        "OAuth Userinfo": "https://www.googleapis.com/oauth2/v2/userinfo"
    }
    
    for name, url in endpoints.items():
        try:
            # Just test that the endpoint exists (will return 401/403 without auth)
            response = requests.get(url, timeout=5)
            # Any response (even 401) means endpoint is reachable
            status = "✅" if response.status_code in [200, 401, 403, 404] else "❌"
            print(f"{status} {name}: Reachable (HTTP {response.status_code})")
        except requests.exceptions.RequestException as e:
            print(f"❌ {name}: Not reachable - {str(e)}")
    
    print()

def test_redirect_uri_configuration():
    """Test redirect URI configuration"""
    print("=" * 60)
    print("TEST 4: Redirect URI Configuration")
    print("=" * 60)
    
    print(f"Configured Redirect URI: {GOOGLE_REDIRECT_URI}")
    print()
    print("⚠️  IMPORTANT:")
    print("   This redirect URI must be registered in your Google Cloud Console")
    print("   at: https://console.cloud.google.com/apis/credentials")
    print()
    print("   For testing with Phase 12 E-Sign, you'll need to either:")
    print("   1. Add http://localhost:8000/google/auth/google/callback")
    print("   2. Or use the NeuroSEO callback and proxy to localhost")
    print()

def main():
    print("\n" + "=" * 60)
    print("Google OAuth Credentials Test Suite")
    print("Phase 12 E-Sign Platform - Google Drive Integration")
    print("=" * 60 + "\n")
    
    # Run all tests
    auth_url = test_oauth_url_generation()
    credentials_valid = test_client_credentials()
    test_google_api_endpoints()
    test_redirect_uri_configuration()
    
    # Summary
    print("=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    if credentials_valid:
        print("✅ Credentials format is valid")
        print("✅ OAuth URL can be generated")
        print()
        print("NEXT STEPS:")
        print("1. Verify redirect URI is registered in Google Cloud Console")
        print("2. Open the OAuth URL in a browser to test the flow:")
        print(f"\n   {auth_url}\n")
        print("3. After authorization, copy the 'code' parameter from redirect URL")
        print("4. Use the code to exchange for access token")
    else:
        print("❌ Some credential checks failed")
        print("Please verify the credentials in root .env file")
    
    print("=" * 60 + "\n")

if __name__ == "__main__":
    main()
