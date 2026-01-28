# Error Handling Guide

This document describes the error types, handling patterns, and client responses used throughout the PropMetrik service layer.

---

## Error Hierarchy

```
ServiceError (base)
├── ValidationError    - Invalid input data
├── NotFoundError      - Resource not found
├── AuthorizationError - Permission denied
├── GovernanceError    - Governance rule violation
├── DatabaseError      - Database operation failed
└── ExternalApiError   - External service failed
```

---

## Error Classes

### ServiceError (Base Class)

All custom errors extend this base class:

```typescript
class ServiceError extends Error {
  code: string;
  statusCode: number;
  details?: Record<string, any>;
  timestamp: Date;
  requestId?: string;

  constructor(message: string, code: string, statusCode: number, details?: Record<string, any>) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date();
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        timestamp: this.timestamp.toISOString(),
        requestId: this.requestId
      }
    };
  }
}
```

---

### ValidationError

**When to use:** Invalid input data, constraint violations, business rule violations

```typescript
throw new ValidationError(
  'Unit number already exists in this project',
  { field: 'unitNumber', value: 'A101', constraint: 'unique' }
);
```

**HTTP Status:** 400 Bad Request

**Response Format:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Unit number already exists in this project",
    "details": {
      "field": "unitNumber",
      "value": "A101",
      "constraint": "unique"
    }
  }
}
```

---

### NotFoundError

**When to use:** Resource not found by ID or other identifier

```typescript
throw new NotFoundError(
  'Phase not found',
  'Phase',
  'phase-123'
);
```

**HTTP Status:** 404 Not Found

**Response Format:**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Phase not found",
    "details": {
      "entityType": "Phase",
      "entityId": "phase-123"
    }
  }
}
```

---

### AuthorizationError

**When to use:** User lacks permission for the operation

```typescript
throw new AuthorizationError(
  'Only admins can force-complete a phase with blockers'
);
```

**HTTP Status:** 403 Forbidden

**Response Format:**
```json
{
  "error": {
    "code": "AUTHORIZATION_ERROR",
    "message": "Only admins can force-complete a phase with blockers"
  }
}
```

---

### GovernanceError

**When to use:** Governance rules prevent the operation

```typescript
// Factory methods for common governance errors:
throw GovernanceError.phaseLocked('phase-123', 'Foundation');
throw GovernanceError.approvalRequired('date_change');
throw GovernanceError.adminOnlyAction('modify_phase_structure');
throw GovernanceError.checkpointNotPassed('EPA Permit');
```

**HTTP Status:** 403 Forbidden

**Response Format:**
```json
{
  "error": {
    "code": "GOVERNANCE_PHASE_LOCKED",
    "message": "Phase 'Foundation' is locked and cannot be modified",
    "details": {
      "phaseId": "phase-123",
      "phaseName": "Foundation",
      "action": "Request unlock approval from administrator"
    }
  }
}
```

**Governance Error Codes:**
- `GOVERNANCE_PHASE_LOCKED` - Phase is locked
- `GOVERNANCE_APPROVAL_REQUIRED` - Change requires approval
- `GOVERNANCE_ADMIN_ONLY` - Admin-only action
- `GOVERNANCE_CHECKPOINT_BLOCKING` - Compliance checkpoint blocks operation

---

### DatabaseError

**When to use:** Database operations fail (wrapped automatically by BaseService)

```typescript
throw new DatabaseError(
  'Failed to insert record',
  originalError,
  { table: 'project_phases', operation: 'INSERT' }
);
```

**HTTP Status:** 500 Internal Server Error

**Response Format (Production):**
```json
{
  "error": {
    "code": "DATABASE_ERROR",
    "message": "An internal error occurred. Please try again."
  }
}
```

**Note:** Original error details are logged but not exposed to clients.

---

## Error Handling Patterns

### In Services

```typescript
class PhaseService extends BaseService {
  async update(id: string, input: UpdatePhaseInput): Promise<Phase> {
    // Validate input
    if (input.progress !== undefined && (input.progress < 0 || input.progress > 100)) {
      throw new ValidationError(
        'Progress must be between 0 and 100',
        { field: 'progress', value: input.progress, min: 0, max: 100 }
      );
    }

    // Check existence
    const phase = await this.getById('project_phases', id);
    if (!phase) {
      throw new NotFoundError('Phase not found', 'Phase', id);
    }

    // Check governance
    if (phase.isLocked && userRole !== 'admin') {
      throw GovernanceError.phaseLocked(id, phase.name);
    }

    // Proceed with update...
  }
}
```

### In API Routes

```typescript
router.put('/phases/:id', async (req, res, next) => {
  try {
    const result = await phaseService.update(req.params.id, req.body);
    res.json(result);
  } catch (error) {
    next(error); // Let error middleware handle it
  }
});
```

### Error Middleware

```typescript
function errorMiddleware(err: Error, req: Request, res: Response, next: NextFunction) {
  // Add request ID for tracking
  const requestId = req.headers['x-request-id'] || uuid();
  
  if (err instanceof ServiceError) {
    err.requestId = requestId;
    
    // Log with context
    logger.error({
      code: err.code,
      message: err.message,
      details: err.details,
      requestId,
      path: req.path,
      method: req.method,
      userId: req.user?.id
    });
    
    return res.status(err.statusCode).json(err.toJSON());
  }
  
  // Unknown errors
  logger.error({
    message: err.message,
    stack: err.stack,
    requestId,
    path: req.path
  });
  
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId
    }
  });
}
```

---

## Error Responses by HTTP Status

| Status | Error Type | When |
|--------|------------|------|
| 400 | ValidationError | Invalid input, constraint violation |
| 401 | AuthenticationError | Not authenticated |
| 403 | AuthorizationError, GovernanceError | Permission denied, governance block |
| 404 | NotFoundError | Resource not found |
| 409 | ConflictError | State conflict (e.g., already approved) |
| 422 | ValidationError | Semantic validation failure |
| 500 | DatabaseError, ServiceError | Internal error |
| 503 | ExternalApiError | External service unavailable |

---

## Logging Patterns

### Log Levels

| Level | Usage |
|-------|-------|
| `error` | Unexpected failures, database errors |
| `warn` | Governance blocks, validation failures |
| `info` | Successful operations, state changes |
| `debug` | Query execution, method entry/exit |

### Structured Logging

```typescript
logger.error({
  service: 'PhaseService',
  method: 'completePhase',
  phaseId: 'phase-123',
  userId: 'user-456',
  error: {
    code: 'GOVERNANCE_CHECKPOINT_BLOCKING',
    blockers: ['EPA Permit pending']
  }
}, 'Phase completion blocked by compliance checkpoint');
```

---

## Client-Side Handling

### Error Response Structure

All error responses follow this structure:

```typescript
interface ErrorResponse {
  error: {
    code: string;      // Machine-readable error code
    message: string;   // Human-readable message
    details?: {        // Additional context (optional)
      field?: string;
      value?: any;
      [key: string]: any;
    };
    timestamp: string; // ISO 8601
    requestId: string; // For support reference
  };
}
```

### Recommended Client Handling

```typescript
async function updatePhase(id: string, data: UpdatePhaseInput) {
  try {
    const response = await api.put(`/phases/${id}`, data);
    return response.data;
  } catch (error) {
    if (error.response?.data?.error) {
      const { code, message, details } = error.response.data.error;
      
      switch (code) {
        case 'VALIDATION_ERROR':
          showFieldError(details.field, message);
          break;
        case 'GOVERNANCE_PHASE_LOCKED':
          showGovernanceModal(message, details.action);
          break;
        case 'GOVERNANCE_APPROVAL_REQUIRED':
          showApprovalRequestDialog(details);
          break;
        default:
          showToast(message, 'error');
      }
    }
    throw error;
  }
}
```

---

## Error Codes Reference

### Validation Errors
- `VALIDATION_ERROR` - General validation failure
- `VALIDATION_REQUIRED_FIELD` - Required field missing
- `VALIDATION_INVALID_FORMAT` - Invalid format (email, date, etc.)
- `VALIDATION_OUT_OF_RANGE` - Value outside allowed range
- `VALIDATION_UNIQUE_CONSTRAINT` - Unique constraint violation

### Not Found Errors
- `NOT_FOUND` - General resource not found
- `NOT_FOUND_PROJECT` - Project not found
- `NOT_FOUND_PHASE` - Phase not found
- `NOT_FOUND_UNIT` - Unit not found
- `NOT_FOUND_DOCUMENT` - Document not found

### Authorization Errors
- `AUTHORIZATION_ERROR` - General permission denied
- `AUTHORIZATION_INVALID_ROLE` - Invalid role for operation
- `AUTHORIZATION_ORG_MISMATCH` - Organization access denied

### Governance Errors
- `GOVERNANCE_PHASE_LOCKED` - Phase is locked
- `GOVERNANCE_APPROVAL_REQUIRED` - Change requires approval
- `GOVERNANCE_ADMIN_ONLY` - Admin-only action
- `GOVERNANCE_CHECKPOINT_BLOCKING` - Compliance checkpoint blocks

### Database Errors
- `DATABASE_ERROR` - General database error
- `DATABASE_CONNECTION_ERROR` - Connection failed
- `DATABASE_CONSTRAINT_ERROR` - Database constraint violation
