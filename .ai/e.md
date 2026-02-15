# Phase12 E-Sign Integration with PROPMETRIK

## 1. Executive Summary

| Aspect | Current State | Target State |
|--------|--------------|--------------|
| **E-Sign Platform** | `phase12-esign/` (standalone) | Integrated with PROPMETRIK |
| **Backend** | Python FastAPI on port 8000 | Keep as-is, disable Keycloak auth |
| **Frontend** | React + Vite on port 3001 | Keep as-is, accept PROPMETRIK JWT |
| **Database** | Separate esign_db | PROPMETRIK PostgreSQL (p12_* tables) |
| **Authentication** | Keycloak (RS256 JWT) | PROPMETRIK JWT (HS256) |

**Goal:** Integrate Phase12 E-Sign with PROPMETRIK by:
1. Disabling Keycloak authentication
2. Accepting PROPMETRIK JWT tokens for authentication
3. Using PROPMETRIK's PostgreSQL database with `p12_*` prefixed tables

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           PROPMETRIK                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────┐         ┌───────────────────────────────┐│
│  │  PROPMETRIK Frontend │         │     Phase12 E-Sign Frontend   ││
│  │   (Next.js :3000)    │         │     (React+Vite :3001)        ││
│  │                      │         │                               ││
│  │  - Dashboard         │         │  - Document Upload            ││
│  │  - Valuations        │  Link   │  - Field Placement            ││
│  │  - Property Mgmt     │ ──────► │  - Signature Capture          ││
│  │  - CRM               │         │  - Templates                  ││
│  │                      │         │  - Audit Logs                 ││
│  └──────────┬───────────┘         └──────────────┬────────────────┘│
│             │                                     │                 │
│             │ JWT Token                           │ Same JWT Token  │
│             ▼                                     ▼                 │
│  ┌──────────────────────┐         ┌───────────────────────────────┐│
│  │  PROPMETRIK Backend  │         │   Phase12 E-Sign Backend      ││
│  │   (Express :4000)    │         │   (FastAPI :8000)             ││
│  │                      │         │                               ││
│  │  - JWT Auth (HS256)  │         │  - PROPMETRIK JWT Auth        ││
│  │  - User Management   │         │  - Document Processing        ││
│  │  - All Modules       │         │  - Signature Workflow         ││
│  │                      │         │  - PDF Signing                ││
│  └──────────┬───────────┘         └──────────────┬────────────────┘│
│             │                                     │                 │
│             └─────────────┬───────────────────────┘                 │
│                           │                                         │
│                           ▼                                         │
│             ┌───────────────────────────────────────┐              │
│             │        PROPMETRIK PostgreSQL          │              │
│             │                                       │              │
│             │   Existing tables + p12_* tables     │              │
│             │                                       │              │
│             └───────────────────────────────────────┘              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Authentication Flow Changes

### 3.1 Current Flow (Keycloak)

```
User → PROPMETRIK Frontend → Keycloak Login → Keycloak JWT (RS256)
User → E-Sign Frontend → Keycloak Login → Keycloak JWT (RS256)
```

### 3.2 Target Flow (PROPMETRIK SSO Passthrough)

```
User → PROPMETRIK Frontend → PROPMETRIK Login → PROPMETRIK JWT (HS256)
User → E-Sign Frontend → Receives PROPMETRIK JWT → No separate login
```

### 3.3 JWT Token Comparison

| Property | PROPMETRIK JWT | Keycloak JWT (current) |
|----------|---------------|----------------------|
| Algorithm | HS256 | RS256 |
| Secret | `JWT_SECRET` env var | Public key from JWKS endpoint |
| Payload.userId | ✅ | ❌ (uses `sub`) |
| Payload.email | ✅ | ✅ |
| Payload.organizationId | ✅ | ✅ (custom claim) |
| Payload.role | ✅ | ✅ (realm_access.roles) |

### 3.4 PROPMETRIK JWT Payload Structure

```typescript
// PROPMETRIK JWT payload (from backend/src/routes/auth.ts)
{
  userId: "uuid-string",       // User ID
  email: "user@example.com",   // User email
  role: "admin|member|viewer", // User role
  organizationId: "uuid",      // Organization ID
  tier: "free|pro|enterprise", // Subscription tier
  iat: 1706500000,             // Issued at
  exp: 1707104800              // Expires
}
```

---

## 4. Backend Integration (phase12-esign/backend)

### 4.1 Modified auth.py

Replace the entire `auth.py` with PROPMETRIK JWT verification:

```python
"""
PROPMETRIK Authentication for E-Signature Platform
Replaces Keycloak authentication with PROPMETRIK JWT verification
"""
import jwt
from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, Dict, Any
from config import settings

security = HTTPBearer()


def verify_propmetrik_token(token: str) -> Dict[str, Any]:
    """
    Verify and decode PROPMETRIK JWT token (HS256)
    """
    try:
        print(f"🔐 Verifying PROPMETRIK token...")
        
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=["HS256"],
            options={
                "verify_exp": True,
                "require": ["userId", "email"]
            }
        )
        
        print(f"✅ Token verified for user: {payload.get('email')}")
        return payload
        
    except jwt.ExpiredSignatureError:
        print(f"❌ Token expired")
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as e:
        print(f"❌ Invalid token: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    except Exception as e:
        print(f"❌ Token verification error: {e}")
        raise HTTPException(status_code=401, detail="Token verification failed")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> Dict[str, Any]:
    """
    FastAPI dependency to get current authenticated user from PROPMETRIK JWT
    
    Usage:
        @app.get("/protected")
        async def protected_route(user: Dict = Depends(get_current_user)):
            return {"user": user}
    """
    token = credentials.credentials
    payload = verify_propmetrik_token(token)
    
    return {
        "sub": payload.get("userId"),  # Map userId to sub for compatibility
        "id": payload.get("userId"),
        "email": payload.get("email"),
        "name": payload.get("email"),  # Fallback to email if no name
        "role": payload.get("role", "member"),
        "organization_id": payload.get("organizationId"),
        "tier": payload.get("tier", "free"),
    }


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))
) -> Optional[Dict[str, Any]]:
    """
    Optional authentication - returns None if no token provided
    Used for public endpoints that benefit from user context if available
    """
    if not credentials:
        return None
    
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None


def check_role_access(user: Dict[str, Any], allowed_roles: list[str]) -> bool:
    """
    Check if user has any of the allowed roles
    """
    user_role = user.get("role", "")
    return user_role in allowed_roles


def require_role(allowed_roles: list[str]):
    """
    Dependency to require specific roles
    
    Usage:
        @app.get("/admin-only")
        async def admin_route(
            user: Dict = Depends(get_current_user),
            _: bool = Depends(require_role(["admin"]))
        ):
            return {"admin": True}
    """
    async def role_checker(user: Dict = Depends(get_current_user)):
        if not check_role_access(user, allowed_roles):
            raise HTTPException(
                status_code=403, 
                detail=f"Access denied. Required roles: {allowed_roles}"
            )
        return True
    return role_checker
```

### 4.2 Modified config.py

Add PROPMETRIK JWT secret configuration:

```python
# Add to Settings class in config.py

class Settings(BaseSettings):
    # ... existing settings ...
    
    # PROPMETRIK JWT Configuration
    # This must match JWT_SECRET in PROPMETRIK backend
    JWT_SECRET: str = os.getenv("JWT_SECRET", "propmetrik-jwt-secret-change-in-production")
    
    # PROPMETRIK API URL (for callbacks)
    PROPMETRIK_API_URL: str = os.getenv("PROPMETRIK_API_URL", "http://localhost:4000")
    
    # Database - Use PROPMETRIK PostgreSQL
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "dev_password_123")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "propmetrik")  # Main PROPMETRIK DB
    POSTGRES_HOST: str = os.getenv("POSTGRES_HOST", "localhost")
    POSTGRES_PORT: int = int(os.getenv("POSTGRES_PORT", "5432"))
    
    @property
    def DATABASE_URL(self) -> str:
        """PROPMETRIK database URL"""
        return f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
    
    # Disable Keycloak
    KEYCLOAK_ENABLED: bool = False
```

### 4.3 Model Name Updates

Update all SQLAlchemy models to use `p12_` prefix for table names:

```python
# Example changes in models.py

class User(Base):
    __tablename__ = "p12_esign_users"  # Was: "users"

class Document(Base):
    __tablename__ = "p12_documents"  # Was: "documents"

class SignatureRequest(Base):
    __tablename__ = "p12_signature_requests"  # Was: "signature_requests"

class Signer(Base):
    __tablename__ = "p12_signers"  # Was: "signers"

class SignatureField(Base):
    __tablename__ = "p12_signature_fields"  # Was: "signature_fields"

class Signature(Base):
    __tablename__ = "p12_signatures"  # Was: "signatures"

class AuditLog(Base):
    __tablename__ = "p12_audit_log"  # Was: "audit_logs"

class Template(Base):
    __tablename__ = "p12_templates"  # Was: "templates"

class Envelope(Base):
    __tablename__ = "p12_envelopes"  # Was: "envelopes"

class EnvelopeRecipient(Base):
    __tablename__ = "p12_envelope_recipients"  # Was: "envelope_recipients"

class EnvelopeDocument(Base):
    __tablename__ = "p12_envelope_documents"  # Was: "envelope_documents"

class EnvelopeField(Base):
    __tablename__ = "p12_envelope_fields"  # Was: "envelope_fields"
```

---

## 5. Frontend Integration (phase12-esign/frontend)

### 5.1 Remove Keycloak Dependency

Delete or disable:
- `src/keycloak.ts` - Keycloak initialization
- All `keycloak.init()` calls in `App.tsx`
- Keycloak login/logout buttons

### 5.2 New PROPMETRIK Token Handler

Create `src/propmetrik-auth.ts`:

```typescript
/**
 * PROPMETRIK Authentication for E-Sign Frontend
 * Receives JWT token from PROPMETRIK and stores it for API calls
 */

// Token storage key
const TOKEN_KEY = 'propmetrik_token';
const USER_KEY = 'propmetrik_user';

// Check for token in URL params (passed from PROPMETRIK)
export function checkForTokenInUrl(): boolean {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    // Remove token from URL
    const newUrl = window.location.pathname;
    window.history.replaceState({}, '', newUrl);
    return true;
  }
  return false;
}

// Get stored token
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

// Set token (for programmatic access)
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

// Clear token (logout)
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// Check if authenticated
export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  
  try {
    // Decode JWT to check expiration (don't verify signature client-side)
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

// Get user info from token
export function getUserFromToken(): {
  userId: string;
  email: string;
  role: string;
  organizationId?: string;
} | null {
  const token = getToken();
  if (!token) return null;
  
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      organizationId: payload.organizationId,
    };
  } catch {
    return null;
  }
}

// Get Authorization header
export function getAuthHeader(): { Authorization: string } | {} {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Redirect to PROPMETRIK login if not authenticated
export function redirectToLogin(): void {
  const returnUrl = encodeURIComponent(window.location.href);
  window.location.href = `${import.meta.env.VITE_PROPMETRIK_URL || 'http://localhost:3000'}/login?returnTo=${returnUrl}`;
}
```

### 5.3 Updated api.ts

```typescript
/**
 * API client with PROPMETRIK authentication
 */
import axios from 'axios';
import { getAuthHeader, isAuthenticated, redirectToLogin } from './propmetrik-auth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to every request
api.interceptors.request.use((config) => {
  const authHeader = getAuthHeader();
  config.headers = { ...config.headers, ...authHeader };
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to PROPMETRIK login
      redirectToLogin();
    }
    return Promise.reject(error);
  }
);

export default api;
```

### 5.4 Updated App.tsx

```tsx
/**
 * Main App component with PROPMETRIK authentication
 */
import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { checkForTokenInUrl, isAuthenticated, redirectToLogin } from './propmetrik-auth';

// Components
import Dashboard from './pages/Dashboard';
import Agreements from './pages/Agreements';
import Templates from './pages/Templates';
import SignaturePage from './pages/SignaturePage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    redirectToLogin();
    return null;
  }
  return <>{children}</>;
}

function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Check for token in URL (passed from PROPMETRIK)
    checkForTokenInUrl();
    setIsReady(true);
  }, []);

  if (!isReady) {
    return <div>Loading...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public signing page (accessed via magic link) */}
        <Route path="/sign/:token" element={<SignaturePage />} />
        
        {/* Protected routes */}
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/agreements"
          element={
            <PrivateRoute>
              <Agreements />
            </PrivateRoute>
          }
        />
        <Route
          path="/templates"
          element={
            <PrivateRoute>
              <Templates />
            </PrivateRoute>
          }
        />
        
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

---

## 6. PROPMETRIK Frontend Integration

### 6.1 Add E-Sign Navigation Link

Add to PROPMETRIK sidebar/navigation:

```tsx
// frontend/src/components/Sidebar.tsx

const menuItems = [
  // ... existing items
  {
    name: 'E-Sign',
    href: getEsignUrl(),
    icon: PenSquare,
    description: 'Electronic signatures',
  },
];

function getEsignUrl(): string {
  // Get current token
  const token = localStorage.getItem('token');
  const baseUrl = process.env.NEXT_PUBLIC_ESIGN_URL || 'http://localhost:3001';
  
  // Pass token to E-Sign frontend
  return token ? `${baseUrl}?token=${token}` : baseUrl;
}
```

### 6.2 E-Sign API Service

Create service for PROPMETRIK to interact with E-Sign:

```typescript
// frontend/src/services/esign-api.ts

const ESIGN_API_URL = process.env.NEXT_PUBLIC_ESIGN_API_URL || 'http://localhost:8000';

/**
 * Create a signature envelope
 */
export async function createEnvelope(data: {
  subject: string;
  message?: string;
  contextType: 'lease' | 'valuation_report' | 'change_order' | 'sow' | 'contract';
  contextEntityId: string;
  contextEntityName?: string;
  recipients: Array<{
    name: string;
    email: string;
    role: 'signer' | 'cc' | 'viewer';
    signingOrder?: number;
  }>;
  documents: Array<{
    name: string;
    filePath: string;
  }>;
  fields?: Array<{
    type: 'signature' | 'initial' | 'date_signed' | 'name' | 'text';
    recipientEmail: string;
    documentIndex: number;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}) {
  const token = localStorage.getItem('token');
  
  const response = await fetch(`${ESIGN_API_URL}/api/envelopes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      subject: data.subject,
      message: data.message,
      context_type: data.contextType,
      context_entity_id: data.contextEntityId,
      context_entity_name: data.contextEntityName,
      recipients: data.recipients.map(r => ({
        name: r.name,
        email: r.email,
        role: r.role,
        signing_order: r.signingOrder || 1,
      })),
      documents: data.documents.map(d => ({
        name: d.name,
        file_path: d.filePath,
      })),
      fields: data.fields?.map(f => ({
        type: f.type,
        recipient_email: f.recipientEmail,
        document_index: f.documentIndex,
        page: f.page,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
      })),
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create envelope: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Get envelope status
 */
export async function getEnvelopeStatus(envelopeId: string) {
  const token = localStorage.getItem('token');
  
  const response = await fetch(`${ESIGN_API_URL}/api/envelopes/${envelopeId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get envelope: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Send envelope for signing
 */
export async function sendEnvelope(envelopeId: string) {
  const token = localStorage.getItem('token');
  
  const response = await fetch(`${ESIGN_API_URL}/api/envelopes/${envelopeId}/send`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to send envelope: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Void an envelope
 */
export async function voidEnvelope(envelopeId: string, reason: string) {
  const token = localStorage.getItem('token');
  
  const response = await fetch(`${ESIGN_API_URL}/api/envelopes/${envelopeId}/void`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ reason }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to void envelope: ${response.statusText}`);
  }
  
  return response.json();
}
```

---

## 7. Database Configuration

### 7.1 Migration File

The migration file `126_phase12_esign_migration.sql` handles:

1. **Dropping legacy tables:**
   - `esign_reminders`, `esign_certificates`, `esign_signatures`, `esign_templates` (051)
   - `esign_audit_log`, `esign_fields`, `esign_signers`, `esign_envelopes` (050)
   - `consent_statement_versions`, `esign_audit_logs`, `signature_evidences`, etc. (037)

2. **Creating new `p12_*` prefixed tables:**
   - `p12_esign_users` - User mapping table
   - `p12_google_tokens` - Google OAuth tokens
   - `p12_documents` - Source documents
   - `p12_signature_requests` - Signature workflows
   - `p12_signers` - Signers in requests
   - `p12_signature_fields` - Field positions
   - `p12_signatures` - Captured signatures
   - `p12_audit_log` - Audit trail
   - `p12_templates` - Reusable templates
   - `p12_envelopes` - DocuSign-style envelopes
   - `p12_envelope_recipients` - Envelope signers
   - `p12_envelope_documents` - Documents in envelopes
   - `p12_envelope_fields` - Fields on envelope docs
   - `p12_certificates` - Completion certificates

### 7.2 Run Migration

```bash
# From PROPMETRIK backend directory
cd backend
psql -U postgres -d propmetrik -f database/migrations/126_phase12_esign_migration.sql
```

---

## 8. Environment Variables

### 8.1 Phase12 E-Sign Backend (.env)

```env
# Database (PROPMETRIK's PostgreSQL)
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DB=propmetrik
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# PROPMETRIK JWT Secret (MUST MATCH PROPMETRIK backend)
JWT_SECRET=propmetrik-jwt-secret-change-in-production

# PROPMETRIK API URL
PROPMETRIK_API_URL=http://localhost:4000

# Frontend URL
FRONTEND_URL=http://localhost:3001

# API Base URL
API_BASE_URL=http://localhost:8000

# Disable Keycloak
KEYCLOAK_ENABLED=false

# Google OAuth (for Drive integration - optional)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/google/callback
```

### 8.2 Phase12 E-Sign Frontend (.env)

```env
# API URL
VITE_API_URL=http://localhost:8000

# PROPMETRIK URL (for login redirect)
VITE_PROPMETRIK_URL=http://localhost:3000

# Enable PROPMETRIK auth (disable Keycloak)
VITE_AUTH_MODE=propmetrik
```

---

## 9. Service Integration Examples

### 9.1 Property Management (Leases)

```typescript
// backend/src/routes/propertyManagement.ts

import { createEnvelope, sendEnvelope } from '../services/esign-client';

router.post('/applications/:id/generate-lease', async (req, res) => {
  const application = await getApplication(req.params.id);
  const leasePdf = await generateLeasePdf(application);
  
  // Create E-Sign envelope
  const envelope = await createEnvelope({
    subject: `Lease Agreement - ${application.property.title}`,
    contextType: 'lease',
    contextEntityId: application.id,
    contextEntityName: `Lease for ${application.tenant.name}`,
    recipients: [
      { name: application.landlord.name, email: application.landlord.email, role: 'signer', signingOrder: 1 },
      { name: application.tenant.name, email: application.tenant.email, role: 'signer', signingOrder: 2 },
    ],
    documents: [{ name: 'Lease Agreement', filePath: leasePdf.path }],
    token: req.headers.authorization,
  });
  
  // Send for signing
  await sendEnvelope(envelope.id, req.headers.authorization);
  
  res.json({ success: true, envelopeId: envelope.id });
});
```

### 9.2 Valuation Reports

```typescript
// backend/src/services/valuation-engine/reportSigningService.ts

export async function sendReportForSignature(reportId: string, token: string) {
  const report = await getReportWithPdf(reportId);
  const valuer = await getValuer(report.valuerId);
  
  const envelope = await createEnvelope({
    subject: `Valuation Report - ${report.propertyAddress}`,
    contextType: 'valuation_report',
    contextEntityId: reportId,
    recipients: [
      { name: valuer.name, email: valuer.email, role: 'signer' },
    ],
    documents: [{ name: 'Valuation Report', filePath: report.pdfPath }],
    token,
  });
  
  await sendEnvelope(envelope.id, token);
  return envelope.id;
}
```

---

## 10. Webhook Callbacks

### 10.1 E-Sign to PROPMETRIK Callbacks

Configure Phase12 E-Sign to notify PROPMETRIK when events occur:

```python
# phase12-esign/backend/callbacks.py

import httpx
from config import settings

async def notify_propmetrik(event_type: str, data: dict):
    """Send webhook to PROPMETRIK when e-sign events occur"""
    if not settings.PROPMETRIK_API_URL:
        return
    
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{settings.PROPMETRIK_API_URL}/api/v1/webhooks/esign",
                json={
                    "event": event_type,
                    "data": data,
                },
                timeout=10.0,
            )
    except Exception as e:
        print(f"Failed to notify PROPMETRIK: {e}")


# Usage in envelope completion
async def on_envelope_completed(envelope_id: str, envelope_data: dict):
    await notify_propmetrik("envelope.completed", {
        "envelope_id": envelope_id,
        "context_type": envelope_data["context_type"],
        "context_entity_id": envelope_data["context_entity_id"],
        "completed_at": envelope_data["completed_at"],
        "certificate_url": envelope_data.get("certificate_url"),
    })
```

### 10.2 PROPMETRIK Webhook Handler

```typescript
// backend/src/routes/webhooks.ts

router.post('/webhooks/esign', async (req, res) => {
  const { event, data } = req.body;
  
  switch (event) {
    case 'envelope.completed':
      await handleEnvelopeCompleted(data);
      break;
    case 'envelope.voided':
      await handleEnvelopeVoided(data);
      break;
    case 'signer.signed':
      await handleSignerSigned(data);
      break;
  }
  
  res.json({ received: true });
});

async function handleEnvelopeCompleted(data: any) {
  const { context_type, context_entity_id } = data;
  
  switch (context_type) {
    case 'lease':
      await updateLeaseStatus(context_entity_id, 'signed');
      break;
    case 'valuation_report':
      await updateReportStatus(context_entity_id, 'approved');
      break;
    // ... handle other context types
  }
}
```

---

## 11. Deployment

### 11.1 Docker Compose

```yaml
# docker-compose.yml

services:
  # PROPMETRIK services
  propmetrik-backend:
    # ... existing config
    environment:
      - ESIGN_API_URL=http://esign-backend:8000
  
  propmetrik-frontend:
    # ... existing config
    environment:
      - NEXT_PUBLIC_ESIGN_URL=http://localhost:3001
  
  # Phase12 E-Sign services
  esign-backend:
    build: ./phase12-esign/backend
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/propmetrik
      - JWT_SECRET=${JWT_SECRET}
      - PROPMETRIK_API_URL=http://propmetrik-backend:4000
      - KEYCLOAK_ENABLED=false
    depends_on:
      - postgres
  
  esign-frontend:
    build: ./phase12-esign/frontend
    ports:
      - "3001:3001"
    environment:
      - VITE_API_URL=http://localhost:8000
      - VITE_PROPMETRIK_URL=http://localhost:3000
      - VITE_AUTH_MODE=propmetrik
```

---

## 12. Summary

### What We're Doing

1. ✅ Keep Phase12 E-Sign backend (FastAPI) as-is on port 8000
2. ✅ Keep Phase12 E-Sign frontend (React+Vite) as-is on port 3001
3. ✅ Disable Keycloak authentication
4. ✅ Accept PROPMETRIK JWT tokens (HS256) for authentication
5. ✅ Use PROPMETRIK's PostgreSQL database with `p12_*` prefixed tables
6. ✅ Pass token via URL when navigating from PROPMETRIK to E-Sign
7. ✅ Add webhook callbacks for envelope completion

### What We're NOT Doing

- ❌ Rebuilding the E-Sign frontend in Next.js
- ❌ Embedding E-Sign as an iframe
- ❌ Creating a separate database
- ❌ Keeping Keycloak authentication
- ❌ Changing the core E-Sign functionality

### Files Changed

| File | Change |
|------|--------|
| `phase12-esign/backend/auth.py` | Replace Keycloak with PROPMETRIK JWT |
| `phase12-esign/backend/config.py` | Add JWT_SECRET, disable Keycloak |
| `phase12-esign/backend/models.py` | Update table names to p12_* prefix |
| `phase12-esign/frontend/src/keycloak.ts` | Delete (not needed) |
| `phase12-esign/frontend/src/propmetrik-auth.ts` | New file for PROPMETRIK auth |
| `phase12-esign/frontend/src/api.ts` | Use PROPMETRIK auth |
| `phase12-esign/frontend/src/App.tsx` | Remove Keycloak, use PROPMETRIK auth |
| `backend/database/migrations/126_*.sql` | Drop old tables, create p12_* tables |
| `frontend/src/services/esign-api.ts` | E-Sign API client |
