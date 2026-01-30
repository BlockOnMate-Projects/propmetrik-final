# PropMetrik E-Signature Service

E-signature service integrated with PropMetrik authentication. This service provides document signing capabilities within the PropMetrik platform.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     PropMetrik Platform                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌───────────────┐    ┌───────────────┐    ┌───────────────┐    │
│  │ Main Frontend │    │   Backend API  │    │   Database    │    │
│  │  (Next.js)    │    │   (Express)    │    │  (PostgreSQL) │    │
│  │  Port: 3000   │    │   Port: 4000   │    │  Port: 5432   │    │
│  └───────────────┘    └───────────────┘    └───────────────┘    │
│         │                    │                    │              │
│         │               JWT Token                 │              │
│         ▼                    │                    │              │
│  ┌───────────────┐          │                    │              │
│  │  E-Sign UI    │──────────┘              ┌─────┴─────┐        │
│  │  (React+Vite) │                         │  esign    │        │
│  │  Port: 3001   │                         │  schema   │        │
│  └───────────────┘                         └───────────┘        │
│         │                                        ▲              │
│         │                                        │              │
│         ▼                                        │              │
│  ┌───────────────┐                              │              │
│  │  E-Sign API   │──────────────────────────────┘              │
│  │  (FastAPI)    │                                              │
│  │  Port: 8002   │                                              │
│  └───────────────┘                                              │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Development (Local)

1. **Start the E-Sign Backend:**
   ```bash
   cd backend/shared-services/e-sign
   chmod +x start.sh
   ./start.sh
   ```

2. **Start the E-Sign Frontend:**
   ```bash
   cd packages/e-sign-ui
   npm install
   npm run dev
   ```

### With Docker

```bash
cd backend/shared-services/e-sign
docker-compose up -d
```

## Ports

| Service | Port | Description |
|---------|------|-------------|
| PropMetrik Frontend | 3000 | Main Next.js application |
| E-Sign UI | 3001 | E-signature React frontend |
| PropMetrik API | 4000 | Express.js backend |
| Valuation Service | 8001 | Python valuation engine |
| **E-Sign API** | **8002** | **Python FastAPI e-sign service** |

## Authentication

E-Sign uses **PropMetrik JWT tokens** (HS256) for authentication. Keycloak is **disabled**.

### Token Flow

1. User logs into PropMetrik (gets JWT token)
2. PropMetrik frontend opens E-Sign UI (passes token via URL or postMessage)
3. E-Sign UI stores token and includes in API requests
4. E-Sign API validates token using shared `JWT_SECRET`

### JWT Payload Structure

```json
{
  "userId": "uuid-string",
  "email": "user@example.com",
  "role": "admin|member|viewer",
  "organizationId": "uuid",
  "tier": "free|pro|enterprise",
  "iat": 1706500000,
  "exp": 1707104800
}
```

## Database

E-Sign uses the **same PostgreSQL database** as PropMetrik, with tables in the `esign` schema.

### Schema

All E-Sign tables are in the `esign` schema:
- `esign.users` - E-sign users (links to PropMetrik users)
- `esign.documents` - Uploaded documents
- `esign.signature_requests` - Signing workflows
- `esign.signers` - Recipients for signing
- `esign.signatures` - Captured signatures
- `esign.envelopes` - DocuSign-style envelope groupings
- `esign.templates` - Reusable document templates
- `esign.audit_logs` - Comprehensive audit trail

### Migration

Ensure migration `127_esign_schema_tables.sql` is applied:

```bash
cd backend
npm run migrate
# Or manually:
# psql -d propmetrik -f database/migrations/127_esign_schema_tables.sql
```

## Environment Variables

Required in `.env`:

```env
# PropMetrik Integration (REQUIRED)
JWT_SECRET=your-shared-jwt-secret-with-propmetrik

# Database (uses PropMetrik database)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=propmetrik
POSTGRES_USER=propmetrik_app
POSTGRES_PASSWORD=your-password

# E-Sign Service
PROPMETRIK_API_URL=http://localhost:4000
KEYCLOAK_ENABLED=false

# Optional: Google Drive Integration
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Optional: Email Notifications
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
```

## API Documentation

Once running, access:
- **Swagger UI:** http://localhost:8002/docs
- **ReDoc:** http://localhost:8002/redoc

## Integration with PropMetrik Frontend

### Embed E-Sign UI

```tsx
// In PropMetrik frontend
import { getAuthToken } from '@/lib/auth';

const ESignModal = () => {
  const token = getAuthToken();
  const esignUrl = `http://localhost:3001?token=${token}`;
  
  return (
    <iframe 
      src={esignUrl} 
      style={{ width: '100%', height: '600px', border: 'none' }}
    />
  );
};
```

### Direct API Integration

```typescript
// Call E-Sign API from PropMetrik backend
import axios from 'axios';

const esignApi = axios.create({
  baseURL: process.env.ESIGN_API_URL || 'http://localhost:8002',
});

// Create envelope
const createEnvelope = async (token: string, data: EnvelopeData) => {
  return esignApi.post('/envelopes', data, {
    headers: { Authorization: `Bearer ${token}` }
  });
};
```

## Files Modified for PropMetrik Integration

| File | Changes |
|------|---------|
| `auth.py` | Replaced Keycloak with PropMetrik JWT (HS256) |
| `config.py` | Added JWT_SECRET, PROPMETRIK_API_URL, changed DB to propmetrik |
| `models.py` | Added esign schema to all tables |
| `main.py` | Updated to port 8002, PropMetrik CORS |
| `docker-compose.yml` | Created for standalone deployment |
| `start.sh` | Updated for PropMetrik environment |

## Troubleshooting

### Token Validation Fails
- Ensure `JWT_SECRET` matches PropMetrik backend
- Check token expiration

### Database Connection Fails
- Verify `esign` schema exists: `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'esign';`
- Run migration 127 if schema missing

### CORS Errors
- Add your frontend origin to `CORS_ORIGINS` in `main.py`
