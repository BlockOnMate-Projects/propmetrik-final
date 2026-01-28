# Architecture Decision Records

## ADR-001: BaseService Abstract Class Pattern

**Status:** Accepted  
**Date:** 2024-12-20

### Context
The project-management services layer had inconsistent patterns for database access, transaction handling, and error management. Some services used raw `pool.query()`, others had manual transaction handling with varying error recovery.

### Decision
Implement a `BaseService` abstract class that all project-management services extend. This provides:

1. **Standardized Transaction Handling**: `executeInTransaction()` wrapper that handles BEGIN/COMMIT/ROLLBACK and client release automatically.
2. **Query Helpers**: `query()` and `clientQuery()` methods with built-in error wrapping and logging.
3. **Common Patterns**: `getById()`, `getByIdOrThrow()`, `mapRows()` for repetitive operations.
4. **Typed Errors**: Integration with custom error classes (NotFoundError, ValidationError, etc.)

### Consequences

**Positive:**
- Consistent error handling across all services
- Reduced boilerplate in service implementations
- Automatic transaction cleanup prevents connection leaks
- Easier testing through mockable base methods

**Negative:**
- All services must extend BaseService (migration overhead)
- Function-based services need wrapper classes
- Abstract `mapRow()` method must be implemented

---

## ADR-002: Enterprise Governance Model

**Status:** Accepted  
**Date:** 2024-12-20

### Context
PropMetrik serves Ghana's real estate development market where projects require strict governance:
- Regulatory compliance (EPA, Fire, Land Title)
- Multi-stakeholder approval workflows
- Role-based access control

### Decision
Implement a three-tier governance model:

1. **Admin**: Defines project structure (frameworks, phases, compliance checkpoints)
2. **Project Manager**: Executes within defined structure (cannot modify locked phases)
3. **Client**: Approves key milestones and changes

Key components:
- `ProjectFrameworkService`: Templates for project types
- `ApprovalService`: Multi-level approval workflows
- `ComplianceCheckpointService`: Blocking/non-blocking compliance gates
- Phase locking with unlock approval flow

### Consequences

**Positive:**
- Clear separation of concerns between roles
- Audit trail for all governance actions
- Ghana-specific compliance built into framework
- Prevents unauthorized project modifications

**Negative:**
- Increased complexity in phase/milestone operations
- Requires approval workflow for routine changes
- Additional database tables for governance tracking

---

## ADR-003: God File Modularization Strategy

**Status:** Accepted  
**Date:** 2024-12-20

### Context
Multiple service files exceeded 1,000 lines, violating single responsibility principle:
- documentService.ts: 1,847 lines
- projectService.ts: 1,623 lines
- changeOrderService.ts: 1,456 lines
- And 10 more "god files"

### Decision
Split each god file into a module directory with focused services:

```
service-name/
├── types.ts          # Type definitions, interfaces, status enums
├── ServiceA.ts       # Focused on one responsibility
├── ServiceB.ts       # Another responsibility
├── ServiceC.ts       # Third responsibility
└── index.ts          # Barrel exports + facade
```

Pattern applied:
- **CRUD operations** → Dedicated CRUD service
- **Workflow/status transitions** → Workflow service
- **Statistics/analytics** → Stats service
- **Type definitions** → types.ts with mapRow functions

### Consequences

**Positive:**
- Each service under 400 lines
- Clear single responsibility
- Easier testing and maintenance
- Facade pattern maintains backward compatibility

**Negative:**
- More files to navigate
- Need deprecation strategy for old exports
- Cross-service dependencies require careful management

---

## ADR-004: Ghana-Specific Compliance Integration

**Status:** Accepted  
**Date:** 2024-12-20

### Context
Ghana construction projects have unique compliance requirements not addressed by generic project management tools:
- EPA permits required for all construction
- Ghana Fire Service certification for occupancy
- Lands Commission integration for land titles
- Mobile Money payment processing (MTN MoMo, Vodafone Cash)
- Ghana Plus Codes for addressing

### Decision
Create dedicated Ghana services that integrate with government agencies and local payment systems:

1. **GhanaComplianceService**: EPA, Fire, Land Title, GSA standards
2. **MobileMoneyService**: MTN MoMo, Vodafone Cash, AirtelTigo
3. **LocationValidationService**: Plus Codes, 16 regions, district validation
4. **CurrencyService**: GHS formatting, Bank of Ghana exchange rates
5. **GhanaHolidayService**: National holidays, regional festivals, rainy season

### Consequences

**Positive:**
- First-class support for Ghana market
- Automated compliance tracking
- Local payment methods supported
- Region-aware scheduling

**Negative:**
- Services are Ghana-specific (not reusable for other markets)
- External API dependencies (MoMo, Lands Commission)
- Maintenance required for regulatory changes

---

## ADR-005: Event-Driven Architecture

**Status:** Accepted  
**Date:** 2024-12-20

### Context
Services needed to communicate state changes without tight coupling. Real-time updates required for dashboard and notifications.

### Decision
Implement typed EventBus with ProjectEventType enum:

```typescript
eventBus.emit(ProjectEventType.PHASE_COMPLETED, {
  entityType: 'phase',
  entityId: phaseId,
  projectId: project.id,
  organizationId: org.id,
  userId: actor,
  data: { name: phase.name }
});
```

Event categories:
- Phase lifecycle: created, updated, locked, completed
- Approval workflow: requested, approved, rejected
- Compliance: passed, failed, waived
- Payment: received, confirmed, failed

### Consequences

**Positive:**
- Loose coupling between services
- Easy to add new event subscribers
- Supports real-time dashboard updates
- Audit trail through event logging

**Negative:**
- Eventual consistency (not immediate)
- Event ordering not guaranteed
- Need to handle failed event handlers

---

## ADR-006: Database Index Strategy

**Status:** Accepted  
**Date:** 2024-12-20

### Context
Query performance issues identified during architecture review. Missing indexes on foreign keys and common query patterns.

### Decision
Implement comprehensive indexing strategy:

1. **Foreign Key Indexes**: All `_id` columns (project_id, phase_id, organization_id, created_by)
2. **Composite Indexes**: Common query patterns like (project_id, status), (organization_id, created_at)
3. **JSONB GiST Indexes**: For metadata, documents, milestones columns
4. **Partial Indexes**: For active records (deleted_at IS NULL)

All indexes documented with:
- Usage patterns
- Maintenance notes
- Size estimates

### Consequences

**Positive:**
- Dramatically improved query performance
- Supports common access patterns
- JSONB querying now performant

**Negative:**
- Increased storage requirements
- Slower write operations (index updates)
- Need periodic index maintenance (REINDEX)

---

## ADR-007: Singleton vs Named Export Pattern

**Status:** Accepted  
**Date:** 2024-12-20

### Context
Inconsistent service instantiation patterns:
- Some used singleton with `getInstance()`
- Others used direct `new Service()` export
- Some used default exports only

### Decision
Standardize on named export singleton pattern:

```typescript
class ServiceName extends BaseService {
  constructor() {
    super('ServiceName');
  }
  // ... methods
}

export const serviceName = new ServiceName();
export default serviceName;
```

This provides:
- Named export for ES6 imports: `import { serviceName } from './serviceName'`
- Default export for compatibility: `import serviceName from './serviceName'`
- Single instance guaranteed

### Consequences

**Positive:**
- Consistent across all services
- Tree-shaking support (named exports)
- Easy mocking in tests
- Backward compatible with default imports

**Negative:**
- Slight migration effort for existing imports
- Cannot have multiple instances (by design)
