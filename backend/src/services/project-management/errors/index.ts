/**
 * Custom Error Classes for Project Management Services
 * 
 * Phase 0.5: Foundation & Standards
 * 
 * Provides a hierarchy of typed errors for consistent error handling:
 * - ServiceError (base class)
 * - ValidationError (400)
 * - NotFoundError (404)
 * - AuthorizationError (403)
 * - ConflictError (409)
 * - GovernanceError (403)
 * - DatabaseError (500)
 * 
 * Each error includes:
 * - HTTP status code
 * - Error code for API responses
 * - Optional details for debugging
 * 
 * @module services/project-management/errors
 */

// =============================================================================
// ERROR CODES
// =============================================================================

export const ErrorCodes = {
  // Validation errors (400)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT: 'INVALID_FORMAT',
  
  // Authentication/Authorization errors (401/403)
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  
  // Not found errors (404)
  NOT_FOUND: 'NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  
  // Conflict errors (409)
  CONFLICT: 'CONFLICT',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  CONCURRENT_MODIFICATION: 'CONCURRENT_MODIFICATION',
  
  // Governance errors (403)
  GOVERNANCE_VIOLATION: 'GOVERNANCE_VIOLATION',
  PHASE_LOCKED: 'PHASE_LOCKED',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  FRAMEWORK_LOCKED: 'FRAMEWORK_LOCKED',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  
  // Database errors (500)
  DATABASE_ERROR: 'DATABASE_ERROR',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  TRANSACTION_ERROR: 'TRANSACTION_ERROR',
  
  // Internal errors (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNEXPECTED_ERROR: 'UNEXPECTED_ERROR',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

// =============================================================================
// BASE SERVICE ERROR
// =============================================================================

/**
 * Base error class for all service errors.
 * Provides consistent structure for error handling and API responses.
 */
export class ServiceError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, any>;
  public readonly timestamp: Date;

  constructor(
    message: string,
    code: ErrorCode = ErrorCodes.INTERNAL_ERROR,
    statusCode: number = 500,
    details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date();

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON for API response.
   */
  toJSON(): Record<string, any> {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        timestamp: this.timestamp.toISOString(),
      },
    };
  }

  /**
   * Create error from unknown catch block value.
   */
  static from(error: unknown): ServiceError {
    if (error instanceof ServiceError) {
      return error;
    }
    
    if (error instanceof Error) {
      return new ServiceError(
        error.message,
        ErrorCodes.INTERNAL_ERROR,
        500,
        { originalError: error.name }
      );
    }
    
    return new ServiceError(
      String(error),
      ErrorCodes.UNEXPECTED_ERROR,
      500
    );
  }
}

// =============================================================================
// VALIDATION ERROR (400)
// =============================================================================

/**
 * Error for invalid input, missing fields, or format errors.
 * HTTP Status: 400 Bad Request
 */
export class ValidationError extends ServiceError {
  public readonly field?: string;
  public readonly validationErrors?: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    details?: Record<string, any>,
    field?: string
  ) {
    super(message, ErrorCodes.VALIDATION_ERROR, 400, details);
    this.name = 'ValidationError';
    this.field = field;
    
    // Support multiple validation errors
    if (details?.errors && Array.isArray(details.errors)) {
      this.validationErrors = details.errors;
    }
  }

  /**
   * Create validation error for a specific field.
   */
  static forField(field: string, message: string): ValidationError {
    return new ValidationError(
      `${field}: ${message}`,
      { field },
      field
    );
  }

  /**
   * Create validation error for multiple fields.
   */
  static forFields(errors: Array<{ field: string; message: string }>): ValidationError {
    const message = errors.map(e => `${e.field}: ${e.message}`).join('; ');
    return new ValidationError(message, { errors });
  }

  /**
   * Create validation error for missing required field.
   */
  static missingField(field: string): ValidationError {
    return new ValidationError(
      `Missing required field: ${field}`,
      { field, code: ErrorCodes.MISSING_REQUIRED_FIELD },
      field
    );
  }
}

// =============================================================================
// NOT FOUND ERROR (404)
// =============================================================================

/**
 * Error for resources that don't exist.
 * HTTP Status: 404 Not Found
 */
export class NotFoundError extends ServiceError {
  public readonly resourceType: string;
  public readonly resourceId?: string;

  constructor(
    message: string,
    resourceType: string = 'Resource',
    resourceId?: string
  ) {
    super(
      message,
      ErrorCodes.NOT_FOUND,
      404,
      { resourceType, resourceId }
    );
    this.name = 'NotFoundError';
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }

  /**
   * Create not found error for a specific resource.
   */
  static forResource(resourceType: string, resourceId: string): NotFoundError {
    return new NotFoundError(
      `${resourceType} not found: ${resourceId}`,
      resourceType,
      resourceId
    );
  }
}

// =============================================================================
// AUTHORIZATION ERROR (403)
// =============================================================================

/**
 * Error for permission/access denied scenarios.
 * HTTP Status: 403 Forbidden
 */
export class AuthorizationError extends ServiceError {
  public readonly requiredPermission?: string;
  public readonly userRole?: string;

  constructor(
    message: string = 'You do not have permission to perform this action',
    details?: Record<string, any>
  ) {
    super(message, ErrorCodes.FORBIDDEN, 403, details);
    this.name = 'AuthorizationError';
    
    if (details?.requiredPermission) {
      this.requiredPermission = details.requiredPermission;
    }
    if (details?.userRole) {
      this.userRole = details.userRole;
    }
  }

  /**
   * Create authorization error for missing permission.
   */
  static missingPermission(permission: string, userRole?: string): AuthorizationError {
    return new AuthorizationError(
      `Permission denied: ${permission} required`,
      { requiredPermission: permission, userRole }
    );
  }

  /**
   * Create authorization error for role mismatch.
   */
  static roleRequired(requiredRole: string, actualRole?: string): AuthorizationError {
    return new AuthorizationError(
      `Access denied: ${requiredRole} role required`,
      { requiredRole, actualRole }
    );
  }
}

// =============================================================================
// CONFLICT ERROR (409)
// =============================================================================

/**
 * Error for conflicts like duplicate entries or concurrent modifications.
 * HTTP Status: 409 Conflict
 */
export class ConflictError extends ServiceError {
  public readonly conflictType: string;

  constructor(
    message: string,
    conflictType: string = 'conflict',
    details?: Record<string, any>
  ) {
    super(message, ErrorCodes.CONFLICT, 409, details);
    this.name = 'ConflictError';
    this.conflictType = conflictType;
  }

  /**
   * Create conflict error for duplicate entry.
   */
  static duplicate(resourceType: string, field: string, value: string): ConflictError {
    return new ConflictError(
      `A ${resourceType} with this ${field} already exists`,
      'duplicate',
      { resourceType, field, value }
    );
  }

  /**
   * Create conflict error for concurrent modification.
   */
  static concurrentModification(resourceType: string, resourceId: string): ConflictError {
    return new ConflictError(
      `${resourceType} was modified by another user. Please refresh and try again.`,
      'concurrent_modification',
      { resourceType, resourceId }
    );
  }

  /**
   * Create conflict error for invalid state transition.
   */
  static invalidStateTransition(
    currentState: string,
    targetState: string,
    resourceType: string
  ): ConflictError {
    return new ConflictError(
      `Cannot transition ${resourceType} from '${currentState}' to '${targetState}'`,
      'invalid_state_transition',
      { currentState, targetState, resourceType }
    );
  }
}

// =============================================================================
// GOVERNANCE ERROR (403)
// =============================================================================

/**
 * Error for governance violations in the enterprise workflow.
 * Used when structural rules are violated (e.g., trying to delete locked phase).
 * HTTP Status: 403 Forbidden
 */
export class GovernanceError extends ServiceError {
  public readonly violationType: string;
  public readonly entityType?: string;
  public readonly entityId?: string;
  public readonly requiredAction?: string;

  constructor(
    message: string,
    violationType: string = 'governance_violation',
    details?: Record<string, any>
  ) {
    super(message, ErrorCodes.GOVERNANCE_VIOLATION, 403, details);
    this.name = 'GovernanceError';
    this.violationType = violationType;
    
    if (details?.entityType) this.entityType = details.entityType;
    if (details?.entityId) this.entityId = details.entityId;
    if (details?.requiredAction) this.requiredAction = details.requiredAction;
  }

  /**
   * Create error for attempting to modify a locked phase.
   */
  static phaseLocked(phaseId: string, phaseName?: string): GovernanceError {
    return new GovernanceError(
      `Phase '${phaseName || phaseId}' is locked and cannot be modified. Admin approval required to unlock.`,
      'phase_locked',
      { entityType: 'phase', entityId: phaseId, requiredAction: 'request_unlock' }
    );
  }

  /**
   * Create error for attempting to modify a locked framework.
   */
  static frameworkLocked(frameworkId: string): GovernanceError {
    return new GovernanceError(
      'This framework is locked and cannot be modified. It is in use by active projects.',
      'framework_locked',
      { entityType: 'framework', entityId: frameworkId }
    );
  }

  /**
   * Create error when approval is required for an action.
   */
  static approvalRequired(
    action: string,
    entityType: string,
    entityId: string
  ): GovernanceError {
    return new GovernanceError(
      `Action '${action}' requires approval. Please submit an approval request.`,
      'approval_required',
      { entityType, entityId, action, requiredAction: 'submit_approval_request' }
    );
  }

  /**
   * Create error when PM tries to perform admin-only action.
   */
  static adminOnlyAction(action: string): GovernanceError {
    return new GovernanceError(
      `Action '${action}' can only be performed by an administrator.`,
      'admin_only',
      { action }
    );
  }

  /**
   * Create error when milestone type is not allowed in phase.
   */
  static milestoneTypeNotAllowed(
    milestoneType: string,
    phaseName: string,
    allowedTypes: string[]
  ): GovernanceError {
    return new GovernanceError(
      `Milestone type '${milestoneType}' is not allowed in phase '${phaseName}'. Allowed types: ${allowedTypes.join(', ')}`,
      'milestone_type_not_allowed',
      { milestoneType, phaseName, allowedTypes }
    );
  }
}

// =============================================================================
// DATABASE ERROR (500)
// =============================================================================

/**
 * Error for database connection or operation failures.
 * HTTP Status: 500 Internal Server Error
 */
export class DatabaseError extends ServiceError {
  public readonly originalCode?: string;

  constructor(
    message: string = 'A database error occurred',
    details?: Record<string, any>
  ) {
    super(message, ErrorCodes.DATABASE_ERROR, 500, details);
    this.name = 'DatabaseError';
    
    if (details?.originalCode) {
      this.originalCode = details.originalCode;
    }
  }

  /**
   * Create error for connection failure.
   */
  static connectionFailed(): DatabaseError {
    return new DatabaseError(
      'Unable to connect to the database. Please try again later.',
      { code: ErrorCodes.CONNECTION_ERROR }
    );
  }

  /**
   * Create error for transaction failure.
   */
  static transactionFailed(reason?: string): DatabaseError {
    return new DatabaseError(
      reason || 'Database transaction failed',
      { code: ErrorCodes.TRANSACTION_ERROR }
    );
  }
}

// =============================================================================
// ERROR HANDLER UTILITIES
// =============================================================================

/**
 * Check if an error is a ServiceError.
 */
export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}

/**
 * Get HTTP status code from any error.
 */
export function getErrorStatusCode(error: unknown): number {
  if (error instanceof ServiceError) {
    return error.statusCode;
  }
  return 500;
}

/**
 * Format error for API response.
 */
export function formatErrorResponse(error: unknown): {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    timestamp: string;
  };
} {
  if (error instanceof ServiceError) {
    return error.toJSON() as any;
  }
  
  const message = error instanceof Error ? error.message : 'An unexpected error occurred';
  
  return {
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message,
      timestamp: new Date().toISOString(),
    },
  };
}
