# PropMetrik API Setup Guide

## 1. Meta WhatsApp Business Cloud API (FREE - 1,000 conversations/month)

### Step 1: Create Meta Developer Account
1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Log in with your Facebook account or create one
3. Accept the Developer Terms

### Step 2: Create a Meta Business App
1. Click **"Create App"** → Select **"Business"** type
2. Enter app name: `PropMetrik CRM`
3. Enter contact email
4. Select your Business Account (or create one)

### Step 3: Add WhatsApp Product
1. In your App Dashboard, click **"Add Product"**
2. Find **"WhatsApp"** and click **"Set Up"**
3. You'll be taken to WhatsApp Setup

### Step 4: Get API Credentials
From the WhatsApp Dashboard, you'll need:

```env
# WhatsApp Business API
WHATSAPP_API_VERSION=v18.0
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_BUSINESS_ACCOUNT_ID=your_business_account_id
WHATSAPP_ACCESS_TOKEN=your_permanent_access_token
WHATSAPP_WEBHOOK_VERIFY_TOKEN=propmetrik_webhook_2024
```

### Step 5: Get Permanent Access Token
1. In App Dashboard → **Settings** → **Basic**
2. Note your **App ID** and **App Secret**
3. Go to [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
4. Select your app
5. Generate a **System User Token** with these permissions:
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
6. Click "Generate Access Token"

### Step 6: Configure Webhook (for receiving messages)
1. In WhatsApp Dashboard → **Configuration**
2. Webhook URL: `https://api.propmetrik.com/api/v1/webhooks/whatsapp`
3. Verify Token: `propmetrik_webhook_2024` (same as .env)
4. Subscribe to: `messages`, `message_status`, `message_template_status_update`

### Step 7: Add a Phone Number
1. Click **"Add Phone Number"**
2. You can use a test number (free) or add your business number
3. Verify with SMS or Voice code
4. Note the **Phone Number ID**

### WhatsApp Pricing (Ghana)
| Conversation Type | Price (USD) |
|-------------------|-------------|
| Marketing | $0.0625 |
| Utility | $0.0200 |
| Authentication | $0.0200 |
| Service (user-initiated) | FREE |

**Free Tier:** 1,000 service conversations/month FREE

---

## 2. Google Calendar API (FREE - Generous limits)

### Step 1: Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project: `PropMetrik CRM`
3. Select the project

### Step 2: Enable Calendar API
1. Go to **APIs & Services** → **Library**
2. Search for "Google Calendar API"
3. Click **Enable**

### Step 3: Create Credentials
1. Go to **APIs & Services** → **Credentials**
2. Click **"Create Credentials"** → **"OAuth client ID"**
3. If prompted, configure OAuth Consent Screen first:
   - User Type: External
   - App name: PropMetrik CRM
   - Support email: your@email.com
   - Scopes: `calendar.events`, `calendar.readonly`

4. Create OAuth Client ID:
   - Application type: **Web application**
   - Name: `PropMetrik Backend`
   - Authorized redirect URIs:
     - `http://localhost:4000/api/v1/auth/google/callback`
     - `https://api.propmetrik.com/api/v1/auth/google/callback`

5. Download the JSON credentials

### Step 4: Get API Key (for public calendar reads)
1. **Create Credentials** → **API Key**
2. Restrict the key:
   - Application restrictions: HTTP referrers
   - API restrictions: Google Calendar API only

### Environment Variables
```env
# Google Calendar API
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_CALENDAR_API_KEY=your_api_key
GOOGLE_REDIRECT_URI=http://localhost:4000/api/v1/auth/google/callback
```

### Google Calendar API Limits (FREE)
| Quota | Limit |
|-------|-------|
| Queries per day | 1,000,000 |
| Queries per 100 seconds per user | 500 |
| Calendar events | Unlimited |

---

## 3. Updated .env Template

Add these to your `/backend/.env`:

```env
# ===========================================
# EXISTING - Mapbox (Valuation Comps)
# ===========================================
MAPBOX_ACCESS_TOKEN=pk.eyJ1I...your_existing_token

# ===========================================
# NEW - WhatsApp Business API
# ===========================================
WHATSAPP_API_VERSION=v18.0
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=propmetrik_webhook_2024

# ===========================================
# NEW - Google Calendar API
# ===========================================
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALENDAR_API_KEY=
GOOGLE_REDIRECT_URI=http://localhost:4000/api/v1/auth/google/callback

# ===========================================
# EXISTING - Other APIs
# ===========================================
# Ghana Post GPS - Self-hosted (FREE)
GHANA_POST_GPS_API_URL=http://localhost:8585
GHANA_POST_GPS_FALLBACK_URL=https://ghanapostgps.sperixlabs.org/api

# Paystack - Transaction-based only
PAYSTACK_SECRET_KEY=
PAYSTACK_PUBLIC_KEY=
```

---

## 4. Quick Start Checklist

### WhatsApp API Setup ✅
- [ ] Create Meta Developer account
- [ ] Create Business App
- [ ] Add WhatsApp product
- [ ] Get Phone Number ID
- [ ] Get Business Account ID
- [ ] Generate permanent access token
- [ ] Configure webhook URL
- [ ] Add to .env

### Google Calendar API Setup ✅
- [ ] Create Google Cloud project
- [ ] Enable Calendar API
- [ ] Configure OAuth consent screen
- [ ] Create OAuth client credentials
- [ ] Create API key
- [ ] Add to .env

---

## 5. Verification Commands

After adding to .env, test the APIs:

```bash
# Test WhatsApp API connection
curl -X GET "https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_NUMBER_ID}" \
  -H "Authorization: Bearer ${WHATSAPP_ACCESS_TOKEN}"

# Test Google Calendar API
curl -X GET "https://www.googleapis.com/calendar/v3/users/me/calendarList" \
  -H "Authorization: Bearer ${GOOGLE_ACCESS_TOKEN}"
```

---

## 6. Cost Summary

| API | Monthly Cost | Notes |
|-----|--------------|-------|
| WhatsApp Cloud API | $0 | 1,000 free conversations |
| Google Calendar | $0 | 1M queries/day free |
| Mapbox | $0-50 | 100K tiles free, 50K geocodes free |
| Ghana Post GPS | $0 | Self-hosted |
| Paystack | 1.5% per transaction | Only on payouts |

**Total Fixed Monthly Cost: $0**

---

## Next Steps After Setup

1. **WhatsApp Service**: Create `/backend/src/services/messaging/whatsappService.ts`
2. **Calendar Service**: Create `/backend/src/services/calendar/googleCalendarService.ts`
3. **Webhook Handler**: Create `/backend/src/routes/webhooks.ts`
4. **OAuth Flow**: Add Google OAuth for calendar access

Would you like me to create the service files after you've obtained the API credentials?
