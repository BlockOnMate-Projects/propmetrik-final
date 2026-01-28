# Migration Guide: Deprecated Services

This guide helps you transition from deprecated service files to the new modular architecture.

## Overview

The following services have been split into focused modules. The original files are marked as `@deprecated` but remain functional for backward compatibility.

---

## Phase 3 Splits: God Files → Modules

### documentService.ts → documents/

**Old Import:**
```typescript
import { documentService } from './documentService';
```

**New Import:**
```typescript
import { documentsFacade } from './documents';
// OR individual services:
import { 
  folderService,
  documentCrudService,
  documentVersionService,
  documentSharingService,
  documentTemplateService 
} from './documents';
```

**Method Mapping:**
| Old Method | New Service | New Method |
|------------|-------------|------------|
| `createDocument()` | `documentCrudService` | `create()` |
| `getDocumentById()` | `documentCrudService` | `getById()` |
| `uploadVersion()` | `documentVersionService` | `uploadVersion()` |
| `shareDocument()` | `documentSharingService` | `share()` |
| `createFromTemplate()` | `documentTemplateService` | `createFromTemplate()` |

---

### projectService.ts → projects/

**Old Import:**
```typescript
import { projectService } from './projectService';
```

**New Import:**
```typescript
import { projectsFacade } from './projects';
// OR individual services:
import { 
  projectCoreService,
  projectStatusService,
  projectStatsService 
} from './projects';
```

**Method Mapping:**
| Old Method | New Service | New Method |
|------------|-------------|------------|
| `create()` | `projectCoreService` | `create()` |
| `getById()` | `projectCoreService` | `getById()` |
| `updateStatus()` | `projectStatusService` | `updateStatus()` |
| `getProjectStats()` | `projectStatsService` | `getStats()` |

---

### unitService.ts → units/

**Old Import:**
```typescript
import { unitService } from './unitService';
```

**New Import:**
```typescript
import { unitsFacade } from './units';
// OR individual services:
import { 
  unitCrudService,
  unitSalesService,
  unitUpgradeService,
  unitStatsService 
} from './units';
```

**Method Mapping:**
| Old Method | New Service | New Method |
|------------|-------------|------------|
| `create()` | `unitCrudService` | `create()` |
| `reserveUnit()` | `unitSalesService` | `reserve()` |
| `markAsSold()` | `unitSalesService` | `markAsSold()` |
| `addUpgrade()` | `unitUpgradeService` | `addUpgrade()` |
| `getUnitStats()` | `unitStatsService` | `getStats()` |

---

### rfiService.ts → rfis/

**Old Import:**
```typescript
import { rfiService } from './rfiService';
```

**New Import:**
```typescript
import { rfisFacade } from './rfis';
// OR individual services:
import { 
  rfiCrudService,
  rfiWorkflowService,
  rfiCollaborationService,
  rfiStatsService 
} from './rfis';
```

**Method Mapping:**
| Old Method | New Service | New Method |
|------------|-------------|------------|
| `create()` | `rfiCrudService` | `create()` |
| `submitRfi()` | `rfiWorkflowService` | `submit()` |
| `assignRfi()` | `rfiWorkflowService` | `assign()` |
| `addComment()` | `rfiCollaborationService` | `addComment()` |
| `getRfiStats()` | `rfiStatsService` | `getStats()` |

---

### changeOrderService.ts → change-orders/

**Old Import:**
```typescript
import { changeOrderService } from './changeOrderService';
```

**New Import:**
```typescript
import { 
  changeRequestService,
  changeApprovalService,
  changeImpactService 
} from './change-orders';
```

---

### scheduleService.ts → scheduling/

**Old Import:**
```typescript
import { scheduleService } from './scheduleService';
```

**New Import:**
```typescript
import { 
  ganttDataService,
  dependencyService,
  baselineService 
} from './scheduling';
```

---

### budgetService.ts → financial/

**Old Import:**
```typescript
import { budgetService } from './budgetService';
```

**New Import:**
```typescript
import { 
  budgetCoreService,
  costTrackingService,
  financialReportService 
} from './financial';
```

---

### inspectionService.ts → quality/

**Old Import:**
```typescript
import { inspectionService } from './inspectionService';
```

**New Import:**
```typescript
import { 
  checklistTemplateService,
  checklistInspectionService,
  checklistResponseService 
} from './quality';
```

---

### photoService.ts → photos/

**Old Import:**
```typescript
import { photoService } from './photoService';
```

**New Import:**
```typescript
import { 
  photoUploadService,
  photoOrganizationService,
  photoAnnotationService 
} from './photos';
```

---

## Phase 6 Refactoring: BaseService Extension

The following services have been refactored to extend `BaseService`:

### Updated Pattern

**Before (Manual Transaction):**
```typescript
async function createSomething(input) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // ... operations
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

**After (BaseService):**
```typescript
class SomethingService extends BaseService {
  async create(input) {
    return this.executeInTransaction(async (client) => {
      // ... operations
      return result;
    });
  }
}
```

### Services Refactored

| Service | Changes |
|---------|---------|
| `phaseService` | Now extends `BaseService`, uses `executeInTransaction` |
| `milestoneService` | Added class wrapper for function-based service |
| `projectCostService` | Extended `BaseService`, added constructor |
| `drawService` | Converted from singleton to `BaseService` pattern |
| `paymentPlanService` | Converted from singleton to `BaseService` pattern |
| `contractorService` | Extended `BaseService`, added `mapRow` |
| `punchListService` | Converted from singleton to `BaseService` pattern |
| `projectWizardService` | Extended `BaseService`, added constructor |

---

## Function-Based to Class-Based Migration

### milestoneService Example

**Old Usage (functions):**
```typescript
import { 
  createMilestone, 
  getMilestoneById,
  completeMilestone 
} from './milestoneService';

await createMilestone(input);
await completeMilestone(id, orgId);
```

**New Usage (class):**
```typescript
import { milestoneService } from './milestoneService';

await milestoneService.create(input);
await milestoneService.complete(id, orgId);
```

**Backward Compatibility:**
The old function exports still work but are deprecated:
```typescript
// Still works but deprecated
import { milestoneFunctions } from './milestoneService';
await milestoneFunctions.createMilestone(input);
```

---

## Singleton Pattern Migration

### drawService Example

**Old Usage (singleton getInstance):**
```typescript
import DrawService from './drawService';
const service = DrawService; // getInstance() was called

await service.create(input);
```

**New Usage (named export):**
```typescript
import { drawService } from './drawService';

await drawService.create(input);
```

---

## Type Changes

### Snake Case to Camel Case

New module types use camelCase (TypeScript convention):

**Old:**
```typescript
interface Unit {
  project_id: string;
  unit_number: string;
  floor_number: number;
  // ...
}
```

**New:**
```typescript
interface ProjectUnit {
  projectId: string;
  unitNumber: string;
  floorNumber: number;
  // ...
}
```

### Row Mappers

Each module includes `mapRowToEntity` functions that handle the conversion:

```typescript
import { mapRowToUnit } from './units/types';

const dbRow = await pool.query('SELECT * FROM project_units WHERE id = $1', [id]);
const unit: ProjectUnit = mapRowToUnit(dbRow.rows[0]);
```

---

## Testing Updates

### Mock Pattern Change

**Before:**
```typescript
jest.mock('../drawService', () => ({
  default: {
    create: jest.fn()
  }
}));
```

**After:**
```typescript
jest.mock('../drawService', () => ({
  drawService: {
    create: jest.fn()
  }
}));
```

---

## Deprecation Timeline

| Phase | Target Date | Action |
|-------|------------|--------|
| Phase 1 | Immediate | New code uses new modules |
| Phase 2 | +3 months | Console warnings on deprecated imports |
| Phase 3 | +6 months | Remove deprecated files |

---

## Questions?

Contact the architecture team for migration assistance.
