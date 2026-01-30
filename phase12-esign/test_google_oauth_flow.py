#!/usr/bin/env python3
"""
Interactive Google OAuth flow tester
Tests the complete OAuth flow with manual authorization
"""
import requests
from urllib.parse import urlencode

GOOGLE_CLIENT_ID = "577958931135-6t5gdcb4mqvdbsls7tcjr2596bdko7s7.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET = "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"
GOOGLE_REDIRECT_URI = "https://neuroseo.io/api/oauth/google/callback"
GOOGLE_SCOPES = "https://www.googleapis.com/auth/drive.readonly"

print("\n" + "="*70)
print("GOOGLE OAUTH FLOW - MANUAL TEST")
print("="*70)
print("\n✅ Credentials loaded successfully!")
print(f"   Client ID: {GOOGLE_CLIENT_ID[:40]}...")
print(f"   Redirect URI: {GOOGLE_REDIRECT_URI}")
print(f"   Scopes: {GOOGLE_SCOPES}")

# Generate OAuth URL
params = {
    'client_id': GOOGLE_CLIENT_ID,
    'redirect_uri': GOOGLE_REDIRECT_URI,
    'response_type': 'code',
    'scope': GOOGLE_SCOPES,
    'access_type': 'offline',
    'prompt': 'consent'
}

auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"

print("\n" + "="*70)
print("STEP 1: AUTHORIZE ACCESS")
print("="*70)
print("\n📋 Open this URL in your browser:\n")
print(auth_url)
print("\n" + "="*70)
print("\nAfter authorizing, you'll be redirected to:")
print(f"{GOOGLE_REDIRECT_URI}?code=YOUR_AUTH_CODE")
print("\n📝 Copy the entire URL from your browser after authorization")
print("   and we'll extract the authorization code to test token exchange.")
print("\n" + "="*70)
