# Partner API Documentation - Data Ingestion

## Overview

The PROPMETRIK Partner API provides secure, industry-standard endpoints for Tier 1 (Government) and Tier 2 (Financial Institution) partners to submit data programmatically.

**Base URL**: `https://api.propmetrik.com/api/v1/ingestion`

## Authentication

### OAuth2 Client Credentials Flow

All Partner API requests require OAuth2 Client Credentials authentication using Keycloak.

#### 1. Obtain Access Token

```bash
POST https://auth.propmetrik.com/realms/propmetrik/protocol/openid_connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
client_id=your_partner_client_id
client_secret=your_partner_client_secret
scope=api:ingest
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "api:ingest"
}
```

#### 2. Use Access Token

Include the token in the `Authorization` header:

```bash
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
```

### Security Requirements

- **TLS 1.2+**: All requests must use HTTPS
- **Token Expiration**: Access tokens expire in 1 hour
- **Rate Limiting**: 1000 requests per hour per client
- **IP Allowlisting**: Tier 1 partners may require IP allowlisting

## Core Workflow

### 4-Step Submission Process

1. **Create Submission** - Initialize submission metadata
2. **Get Presigned URL** - Obtain secure upload URL
3. **Upload Content** - Upload file directly to secure storage
4. **Complete Submission** - Trigger validation and processing

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐
│   Create    │───▶│   Presign    │───▶│   Upload    │───▶│   Complete   │
│ Submission  │    │     URL      │    │   Content   │    │ Submission   │
└─────────────┘    └──────────────┘    └─────────────┘    └──────────────┘
       │                   │                   │                   │
       ▼                   ▼                   ▼                   ▼
  submission_id      upload_url          PUT to URL         validation
   received           expires 2h        (direct to S3)       starts
```

## API Endpoints

### 1. Create Submission

Create a new data submission with metadata.

```
POST /api/v1/ingestion/submissions
```

**Headers:**
- `Authorization: Bearer <token>` (required)
- `Content-Type: application/json` (required)  
- `Idempotency-Key: <uuid>` (recommended)

**Request Body:**
```json
{
  "source_id": "123e4567-e89b-12d3-a456-426614174000",
  "dataset_type": "land_title_record",
  "schema_version": "1.0.0",
  "content_type": "text/csv",
  "content_size_bytes": 1048576
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "submission_id": "987fcdeb-51a2-43d1-9c8e-123456789abc",
    "status": "received",
    "dataset_type": "land_title_record", 
    "schema_version": "1.0.0",
    "correlation_id": "abc123def-456-789",
    "received_at": "2026-01-07T10:30:00Z",
    "expires_at": "2026-01-07T12:30:00Z"
  },
  "meta": {
    "idempotency_key": "uuid-provided-in-header",
    "correlation_id": "abc123def-456-789"
  }
}
```

### 2. Get Presigned Upload URL

Obtain a secure, time-limited URL for uploading file content.

```
POST /api/v1/ingestion/submissions/{submission_id}/presign
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "upload_url": "https://storage.propmetrik.com/uploads/signed-url-with-params",
    "content_uri": "minio://uploads/partner-data/2026-01-07/987fcdeb...",
    "expires_at": "2026-01-07T12:30:00Z",
    "checksum_required": true
  },
  "meta": {
    "instructions": {
      "method": "PUT",
      "headers": {
        "Content-Type": "text/csv"
      },
      "checksum_header": "x-amz-checksum-sha256"
    }
  }
}
```

### 3. Upload Content

Upload your file directly to the presigned URL (not to PROPMETRIK API).

```bash
# Example with curl
curl -X PUT \
  -H "Content-Type: text/csv" \
  -H "x-amz-checksum-sha256: a1b2c3d4e5f6..." \
  --data-binary @your-file.csv \
  "https://storage.propmetrik.com/uploads/signed-url-with-params"
```

**Important:**
- Use `PUT` method (not POST)
- Include exact `Content-Type` from presign response
- Include SHA-256 checksum in header if required
- Upload directly to the presigned URL

### 4. Complete Submission

Notify PROPMETRIK that upload is complete and trigger validation.

```
POST /api/v1/ingestion/submissions/{submission_id}/complete
```

**Request Body:**
```json
{
  "checksum_sha256": "a1b2c3d4e5f6789...",
  "metadata": {
    "source_system": "LandRegistry-v2.1", 
    "extraction_date": "2026-01-07T08:00:00Z"
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "submission_id": "987fcdeb-51a2-43d1-9c8e-123456789abc",
    "validation_started": true,
    "estimated_validation_time": "30-120 seconds"
  }
}
```

### 5. Check Submission Status

Monitor submission progress and get validation results.

```
GET /api/v1/ingestion/submissions/{submission_id}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "submission_id": "987fcdeb-51a2-43d1-9c8e-123456789abc",
    "source": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "name": "Ghana Lands Commission",
      "tier": "tier1_government"
    },
    "dataset_type": "land_title_record",
    "schema_version": "1.0.0", 
    "status": "accepted",
    "channel": "api_push",
    "correlation_id": "abc123def-456-789",
    "timestamps": {
      "received_at": "2026-01-07T10:30:00Z",
      "validated_at": "2026-01-07T10:31:15Z",
      "processed_at": null,
      "completed_at": null
    },
    "content": {
      "type": "text/csv",
      "size_bytes": 1048576,
      "checksum_sha256": "a1b2c3d4e5f6789..."
    },
    "validation_report": {
      "is_valid": true,
      "schema_version_validated": "1.0.0",
      "errors": [],
      "warnings": ["Column 'owner_phone' has 15% missing values"],
      "record_count": 1250,
      "column_count": 18,
      "quality_score": 0.95
    },
    "processing_summary": null,
    "error_message": null,
    "etl_job": null
  }
}
```

### 6. List Submissions

Get a paginated list of your submissions with filtering.

```
GET /api/v1/ingestion/submissions?status=completed&page=1&limit=20
```

**Query Parameters:**
- `status` - Filter by status: `received`, `validating`, `accepted`, `rejected`, `processing`, `completed`, `failed`
- `dataset_type` - Filter by dataset type
- `page` - Page number (default: 1)  
- `limit` - Items per page (default: 20, max: 100)

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "submission_id": "987fcdeb-51a2-43d1-9c8e-123456789abc",
      "status": "completed",
      "dataset_type": "land_title_record",
      "received_at": "2026-01-07T10:30:00Z",
      "completed_at": "2026-01-07T10:45:30Z"
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 156,
      "pages": 8
    }
  }
}
```

## Status Lifecycle

```
received → validating → accepted/rejected → processing → completed/failed
```

**Status Descriptions:**
- `received` - Submission created, awaiting file upload
- `validating` - File uploaded, validation in progress
- `accepted` - Validation passed, ready for processing
- `rejected` - Validation failed, see error details
- `processing` - Data being imported into staging tables
- `completed` - Successfully processed and available in system  
- `failed` - Processing failed, see error details

## Idempotency

Use the `Idempotency-Key` header to prevent duplicate processing.

**Best Practices:**
- Use UUID v4 for idempotency keys
- Retry failed requests with same key
- Keys expire after 24 hours
- Same key + different request body = 409 Conflict

**Example:**
```bash
POST /api/v1/ingestion/submissions
Idempotency-Key: 123e4567-e89b-12d3-a456-426614174001
```

## Error Handling

### HTTP Status Codes

- `200 OK` - Success
- `201 Created` - Resource created
- `400 Bad Request` - Invalid request
- `401 Unauthorized` - Invalid/expired token
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Idempotency conflict
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error

### Error Response Format

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE", 
  "details": [
    {
      "field": "source_id",
      "message": "source_id must be a valid UUID"
    }
  ]
}
```

### Common Error Codes

- `VALIDATION_ERROR` - Request validation failed
- `INVALID_TOKEN` - JWT token invalid/expired
- `SOURCE_NOT_FOUND` - Data source not found
- `DATASET_NOT_ALLOWED` - Dataset type not allowed for source
- `SUBMISSION_NOT_FOUND` - Submission not found
- `CHECKSUM_VERIFICATION_FAILED` - File checksum mismatch
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `IDEMPOTENCY_CONFLICT` - Conflicting idempotent request

## Dataset Types

### Tier 1 (Government) Dataset Types

- `land_title_record` - Land title registrations and transfers
- `cadastral_boundary` - Property boundary surveys
- `tax_assessment` - Property tax assessments
- `building_permit` - Construction permits and approvals
- `zoning_plan` - Zoning and land use plans

### Tier 2 (Financial) Dataset Types

- `mortgage_transaction_stats` - Anonymized mortgage statistics  
- `collateral_valuation` - Anonymized property valuations

## Schema Versions

All datasets support semantic versioning (MAJOR.MINOR.PATCH):

- **PATCH** (1.0.1): Backwards compatible bug fixes
- **MINOR** (1.1.0): Backwards compatible new fields
- **MAJOR** (2.0.0): Breaking changes

**Default:** If not specified, latest stable version is used.

## Rate Limiting

**Limits:**
- 1000 requests per hour per client
- Burst allowance of 50 requests per minute

**Headers:**
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 987
X-RateLimit-Reset: 2026-01-07T11:30:00Z
```

**429 Response:**
```json
{
  "success": false,
  "error": "Rate limit exceeded. Try again later.",
  "code": "RATE_LIMIT_EXCEEDED", 
  "retry_after": 3600
}
```

## Security Best Practices

1. **Store client secrets securely** - Use environment variables or key management services
2. **Implement token refresh** - Refresh tokens before expiration
3. **Use HTTPS only** - Never send tokens over HTTP
4. **Validate certificates** - Don't disable SSL verification
5. **Log security events** - Monitor failed authentication attempts
6. **Use idempotency keys** - Prevent duplicate submissions
7. **Verify checksums** - Ensure data integrity during transfer
8. **Monitor rate limits** - Implement backoff strategies

## SDKs and Examples

### Python Example

```python
import requests
import hashlib
import uuid
from pathlib import Path

class PROPMETRIKPartnerAPI:
    def __init__(self, client_id, client_secret, base_url):
        self.client_id = client_id
        self.client_secret = client_secret
        self.base_url = base_url
        self.access_token = None
    
    def authenticate(self):
        """Obtain OAuth2 access token"""
        response = requests.post(
            "https://auth.propmetrik.com/realms/propmetrik/protocol/openid_connect/token",
            data={
                "grant_type": "client_credentials",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "scope": "api:ingest"
            }
        )
        response.raise_for_status()
        self.access_token = response.json()["access_token"]
    
    def submit_file(self, source_id, dataset_type, file_path):
        """Complete submission workflow"""
        if not self.access_token:
            self.authenticate()
            
        file_path = Path(file_path)
        file_size = file_path.stat().st_size
        
        # Calculate checksum
        with open(file_path, 'rb') as f:
            checksum = hashlib.sha256(f.read()).hexdigest()
        
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
            "Idempotency-Key": str(uuid.uuid4())
        }
        
        # Step 1: Create submission
        submission_data = {
            "source_id": source_id,
            "dataset_type": dataset_type,
            "schema_version": "1.0.0",
            "content_type": "text/csv",
            "content_size_bytes": file_size
        }
        
        response = requests.post(
            f"{self.base_url}/submissions",
            headers=headers,
            json=submission_data
        )
        response.raise_for_status()
        submission_id = response.json()["data"]["submission_id"]
        
        # Step 2: Get presigned URL
        response = requests.post(
            f"{self.base_url}/submissions/{submission_id}/presign",
            headers=headers
        )
        response.raise_for_status()
        upload_url = response.json()["data"]["upload_url"]
        
        # Step 3: Upload file
        with open(file_path, 'rb') as f:
            upload_response = requests.put(
                upload_url,
                headers={
                    "Content-Type": "text/csv",
                    "x-amz-checksum-sha256": checksum
                },
                data=f
            )
            upload_response.raise_for_status()
        
        # Step 4: Complete submission
        response = requests.post(
            f"{self.base_url}/submissions/{submission_id}/complete",
            headers=headers,
            json={"checksum_sha256": checksum}
        )
        response.raise_for_status()
        
        return submission_id
    
    def get_status(self, submission_id):
        """Check submission status"""
        headers = {"Authorization": f"Bearer {self.access_token}"}
        response = requests.get(
            f"{self.base_url}/submissions/{submission_id}",
            headers=headers
        )
        response.raise_for_status()
        return response.json()["data"]

# Usage
api = PROPMETRIKPartnerAPI(
    client_id="ghana-lands-commission-client",
    client_secret="your-secret-key",
    base_url="https://api.propmetrik.com/api/v1/ingestion"
)

submission_id = api.submit_file(
    source_id="123e4567-e89b-12d3-a456-426614174000",
    dataset_type="land_title_record", 
    file_path="./land_titles_january_2026.csv"
)

# Monitor progress
import time
while True:
    status = api.get_status(submission_id)
    print(f"Status: {status['status']}")
    
    if status["status"] in ["completed", "failed", "rejected"]:
        break
    
    time.sleep(30)  # Check every 30 seconds
```

## Support

**Technical Support:**
- Email: partner-api@propmetrik.com
- Documentation: https://docs.propmetrik.com/partner-api
- Status Page: https://status.propmetrik.com

**Business Inquiries:**
- Email: partnerships@propmetrik.com
- Phone: +233 (0) XXX XXX XXX