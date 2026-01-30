# Phase 12: Cedyn E-Signature Platform

Open-source e-signature platform that integrates Google Workspace via OAuth 2.0 and Keycloak SSO.

## 🚀 Quick Start

### Prerequisites

1. **Update Root `.env` File** (cedyn-sso/.env)
   
   The root `.env` file has been updated with Phase 12 credentials. You MUST fill in these values:

   ```bash
   # Go to https://console.cloud.google.com/apis/credentials
   # Create OAuth 2.0 Client ID for Web Application
   GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID_HERE
   GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET_HERE
   
   # Create in Keycloak admin console (http://localhost:8080)
   ESIGN_KEYCLOAK_CLIENT_SECRET=YOUR_ESIGN_CLIENT_SECRET_HERE
   
   # Set a secure password
   ESIGN_POSTGRES_PASSWORD=YOUR_SECURE_PASSWORD_HERE
   
   # Optional: S3-compatible storage for non-Google docs
   ESIGN_S3_ENDPOINT=YOUR_S3_ENDPOINT_HERE
   ESIGN_S3_ACCESS_KEY=YOUR_S3_ACCESS_KEY_HERE
   ESIGN_S3_SECRET_KEY=YOUR_S3_SECRET_KEY_HERE
   ```

2. **Create Keycloak Client**
   
   ```bash
   # Access Keycloak admin console
   http://localhost:8080
   
   # Login with credentials from root .env:
   Username: ${KEYCLOAK_ADMIN}
   Password: ${KEYCLOAK_ADMIN_PASSWORD}
   
   # Create new client:
   Client ID: cedyn-esign
   Client Protocol: openid-connect
   Access Type: confidential
   Valid Redirect URIs: http://localhost:3001/*
   Web Origins: http://localhost:3001
   
   # Copy the generated client secret to root .env:
   ESIGN_KEYCLOAK_CLIENT_SECRET=<paste-here>
   ```

3. **Configure Google OAuth**
   
   ```bash
   # 1. Go to Google Cloud Console
   https://console.cloud.google.com/apis/credentials
   
   # 2. Create OAuth 2.0 Client ID
   Application type: Web application
   Authorized redirect URIs: http://localhost:3001/oauth2callback
   
   # 3. Copy Client ID and Secret to root .env
   GOOGLE_CLIENT_ID=<paste-here>
   GOOGLE_CLIENT_SECRET=<paste-here>
   
   # 4. Enable required APIs:
   - Google Drive API
   - Google Docs API
   ```

### Start Services

```bash
# Navigate to phase12-esign directory
cd phase12-esign

# Start all services (sources root .env automatically)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## 📊 Architecture

```
┌─────────────┐
│  Keycloak   │──────┐
│   (8080)    │      │ OIDC Auth
└─────────────┘      │
                     ▼
┌─────────────┐   ┌──────────────┐   ┌─────────────┐
│   React     │──▶│   FastAPI    │──▶│  PostgreSQL │
│  Frontend   │   │   Backend    │   │   Database  │
│   (3001)    │   │    (8000)    │   │   (5433)    │
└─────────────┘   └──────────────┘   └─────────────┘
      │                  │
      │                  │ OAuth 2.0
      ▼                  ▼
┌─────────────────────────────┐
│     Google Workspace        │
│  (Drive API, Docs API)      │
└─────────────────────────────┘
```

## 🔐 Authentication Flow

1. **User Login** → Keycloak OIDC
2. **Connect Google** → OAuth 2.0 Authorization Code Flow
3. **Access Drive** → Google Drive API with user's access token
4. **Export Document** → Convert Google Doc to PDF
5. **E-Sign** → Apply signatures using canvas-based UI
6. **Upload Signed** → Upload back to Google Drive

## 🌐 API Endpoints

### Authentication
- `GET /auth/login` - Initiate Keycloak login
- `GET /auth/callback` - Keycloak callback
- `GET /auth/logout` - Logout user

### Google OAuth
- `GET /google/authorize` - Start Google OAuth flow
- `GET /google/callback` - Google OAuth callback
- `POST /google/refresh` - Refresh Google access token
- `GET /google/status` - Check Google connection status

### Drive Operations
- `GET /google/files` - List user's Drive files
- `GET /google/files/{fileId}` - Get file metadata
- `GET /google/files/{fileId}/export` - Export Google Doc as PDF
- `POST /google/upload` - Upload signed PDF to Drive

### E-Signature
- `POST /esign/request` - Create signature request
- `GET /esign/request/{requestId}` - Get request status
- `POST /esign/sign` - Apply signature
- `POST /esign/callback` - Signature completion webhook
- `GET /esign/audit/{fileId}` - Get audit trail

### Documents
- `GET /documents` - List user's documents
- `GET /documents/{docId}` - Get document details
- `POST /documents/upload` - Upload local document
- `DELETE /documents/{docId}` - Delete document

## 📁 Project Structure

```
phase12-esign/
├── docker-compose.yml          # Sources root ../. env
├── README.md                   # This file
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── init.sql               # Database schema
│   ├── main.py                # FastAPI app entry
│   ├── config.py              # Loads from root .env
│   ├── database.py            # SQLAlchemy setup
│   ├── models.py              # DB models
│   ├── schemas.py             # Pydantic schemas
│   │
│   ├── auth/
│   │   ├── keycloak.py        # Keycloak OIDC
│   │   └── google_oauth.py    # Google OAuth 2.0
│   │
│   ├── api/
│   │   ├── auth.py            # Auth endpoints
│   │   ├── google.py          # Google Drive API
│   │   ├── esign.py           # E-signature logic
│   │   └── documents.py       # Document management
│   │
│   └── utils/
│       ├── pdf.py             # PDF processing
│       ├── storage.py         # S3 fallback
│       └── encryption.py      # Token encryption
│
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── tsconfig.json
    │
    ├── public/
    │   └── index.html
    │
    └── src/
        ├── index.tsx
        ├── App.tsx
        ├── config.ts          # Loads from env vars
        │
        ├── auth/
        │   ├── KeycloakProvider.tsx
        │   └── GoogleOAuthButton.tsx
        │
        ├── components/
        │   ├── FilePicker.tsx      # Google Drive picker
        │   ├── SignatureCanvas.tsx # Drawing signature
        │   ├── DocumentViewer.tsx  # PDF display
        │   └── StatusTracker.tsx   # Request status
        │
        ├── pages/
        │   ├── Dashboard.tsx
        │   ├── Documents.tsx
        │   ├── SignRequest.tsx
        │   └── AuditLog.tsx
        │
        └── api/
            ├── auth.ts
            ├── google.ts
            └── esign.ts
```

## 🔧 Configuration

All configuration is sourced from the root `.env` file at `cedyn-sso/.env`.

### Environment Variables Used

```bash
# Keycloak (already in root .env)
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=cedyn
ESIGN_KEYCLOAK_CLIENT_ID=cedyn-esign
ESIGN_KEYCLOAK_CLIENT_SECRET=<fill-this>

# Google OAuth (add to root .env)
GOOGLE_CLIENT_ID=<fill-this>
GOOGLE_CLIENT_SECRET=<fill-this>
GOOGLE_REDIRECT_URI=http://localhost:3001/oauth2callback
GOOGLE_SCOPES=https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/documents.readonly https://www.googleapis.com/auth/userinfo.email

# Database
ESIGN_POSTGRES_USER=esign
ESIGN_POSTGRES_PASSWORD=<fill-this>
ESIGN_POSTGRES_DB=esign_db
ESIGN_POSTGRES_HOST=esign-db
ESIGN_POSTGRES_PORT=5432

# API
ESIGN_API_PORT=8000
ESIGN_API_BASE_URL=http://localhost:8000
ESIGN_FRONTEND_URL=http://localhost:3001
```

## 🧪 Testing

```bash
# Test Keycloak connection
curl http://localhost:8080/realms/cedyn/.well-known/openid-configuration

# Test backend health
curl http://localhost:8000/health

# Test frontend
open http://localhost:3001
```

## 🔒 Security Features

- **Token Encryption**: Google refresh tokens encrypted at rest
- **HTTPS Enforcement**: In production
- **CSRF Protection**: On all state-changing requests
- **Token Refresh**: Automatic refresh for expired tokens
- **Audit Logging**: All signature events logged with IP and timestamp
- **Access Control**: Per-document permissions

## 📝 Usage Flow

1. **Login** → Use Keycloak credentials
2. **Connect Google** → Click "Connect Google Workspace"
3. **Select Document** → Choose from Google Drive or upload local file
4. **Add Signers** → Enter email addresses and signature fields
5. **Send Request** → Recipients get email notification
6. **Sign** → Recipients sign via web interface
7. **Complete** → Signed PDF uploaded back to Google Drive

## 🐛 Troubleshooting

### OAuth Errors
```bash
# Check root .env has Google credentials
grep GOOGLE_CLIENT_ID ../. env

# Verify redirect URI matches Google Console
# Must be: http://localhost:3001/oauth2callback
```

### Database Connection
```bash
# Check database is running
docker-compose ps esign-db

# View database logs
docker-compose logs esign-db

# Connect to database
docker-compose exec esign-db psql -U esign -d esign_db
```

### Backend Issues
```bash
# View backend logs
docker-compose logs esign-backend

# Restart backend
docker-compose restart esign-backend

# Check environment variables are loaded
docker-compose exec esign-backend env | grep KEYCLOAK
```

## 📚 API Documentation

Once running, access interactive API docs:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## 🚀 Production Deployment

1. Update root `.env` with production values:
   ```bash
   ESIGN_API_BASE_URL=https://esign-api.cedynhq.com
   ESIGN_FRONTEND_URL=https://esign.cedynhq.com
   GOOGLE_REDIRECT_URI=https://esign.cedynhq.com/oauth2callback
   ```

2. Update Google OAuth redirect URI in Console

3. Update Keycloak client redirect URIs

4. Enable HTTPS in docker-compose.yml

5. Set up SSL certificates

6. Configure production database with backups

## 📄 License

Open Source - MIT License

## 🤝 Support

For issues or questions, contact: support@cedynhq.com
