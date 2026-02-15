# Event Catalog

This document catalogs all event types, their payloads, and typical subscribers in the PROPMETRIK service layer.

---

## EventBus Architecture

```typescript
// Event emission
eventBus.emit(ProjectEventType.PHASE_COMPLETED, {
  entityType: 'phase',
  entityId: phaseId,
  projectId: project.id,
  organizationId: org.id,
  userId: actor,
  data: { name: phase.name }
});

// Event subscription
eventBus.on(ProjectEventType.PHASE_COMPLETED, async (event) => {
  await notificationService.notifyStakeholders(event);
});
```

---

## Base Event Payload

All events include these base properties:

```typescript
interface BaseEventPayload {
  entityType: string;       // Type of entity (phase, unit, rfi, etc.)
  entityId: string;         // ID of the affected entity
  projectId?: string;       // Associated project (if applicable)
  organizationId: string;   // Organization scope
  userId?: string;          // User who triggered the event
  timestamp?: Date;         // Event timestamp (auto-set if not provided)
  data?: Record<string, any>; // Event-specific data
}
```

---

## Event Categories

### Phase Events

#### PHASE_CREATED
**When:** New phase is created for a project

```typescript
{
  entityType: 'phase',
  entityId: 'phase-uuid',
  projectId: 'project-uuid',
  organizationId: 'org-uuid',
  userId: 'user-uuid',
  data: {
    name: 'Foundation',
    phaseNumber: 1,
    plannedStartDate: '2024-01-15',
    plannedEndDate: '2024-03-15'
  }
}
```

**Subscribers:**
- Dashboard service (update project overview)
- Notification service (alert PM of new phase)
- Analytics service (track phase creation)

---

#### PHASE_UPDATED
**When:** Phase details are modified

```typescript
{
  entityType: 'phase',
  entityId: 'phase-uuid',
  projectId: 'project-uuid',
  organizationId: 'org-uuid',
  userId: 'user-uuid',
  data: {
    name: 'Foundation',
    status: 'in_progress',
    progress: 45,
    changedFields: ['progress', 'status']
  }
}
```

**Subscribers:**
- Real-time update service
- Gantt chart refresh
- Progress tracking

---

#### PHASE_RESCHEDULED
**When:** Phase dates are changed

```typescript
{
  entityType: 'phase',
  entityId: 'phase-uuid',
  projectId: 'project-uuid',
  organizationId: 'org-uuid',
  userId: 'user-uuid',
  data: {
    name: 'Foundation',
    oldStartDate: '2024-01-15',
    newStartDate: '2024-01-22',
    oldEndDate: '2024-03-15',
    newEndDate: '2024-03-22',
    reason: 'Permit delay'
  }
}
```

**Subscribers:**
- Schedule service (cascade to dependent phases)
- Notification service (alert stakeholders)
- Audit log

---

#### PHASE_LOCKED
**When:** Admin locks a phase

```typescript
{
  entityType: 'phase',
  entityId: 'phase-uuid',
  projectId: 'project-uuid',
  organizationId: 'org-uuid',
  userId: 'admin-uuid',
  data: {
    name: 'Foundation',
    reason: 'Approved by client - no modifications allowed'
  }
}
```

**Subscribers:**
- Audit log (governance tracking)
- Notification service (alert PM)

---

#### PHASE_UNLOCKED
**When:** Phase is unlocked (by admin or approved request)

```typescript
{
  entityType: 'phase',
  entityId: 'phase-uuid',
  projectId: 'project-uuid',
  organizationId: 'org-uuid',
  userId: 'admin-uuid',
  data: {
    name: 'Foundation',
    reason: 'Approved modification request',
    approvalRequestId: 'approval-uuid'
  }
}
```

---

#### PHASE_COMPLETED
**When:** Phase is marked as complete

```typescript
{
  entityType: 'phase',
  entityId: 'phase-uuid',
  projectId: 'project-uuid',
  organizationId: 'org-uuid',
  userId: 'user-uuid',
  data: {
    name: 'Foundation',
    actualEndDate: '2024-03-10',
    daysAheadOfSchedule: 5,
    forced: false
  }
}
```

**Subscribers:**
- Next phase activation service
- Project progress recalculation
- Notification service (celebrate milestone!)
- Analytics service

---

### Approval Events

#### APPROVAL_REQUESTED
**When:** User requests approval for a change

```typescript
{
  entityType: 'approval',
  entityId: 'approval-uuid',
  projectId: 'project-uuid',
  organizationId: 'org-uuid',
  userId: 'pm-uuid',
  data: {
    approvalType: 'date_change',
    targetEntityType: 'phase',
    targetEntityId: 'phase-uuid',
    requestedChanges: {
      plannedEndDate: { from: '2024-03-15', to: '2024-03-30' }
    },
    justification: 'Weather delays'
  }
}
```

**Subscribers:**
- Notification service (alert approvers)
- Dashboard service (pending approvals count)

---

#### APPROVAL_APPROVED
**When:** Approver approves a request

```typescript
{
  entityType: 'approval',
  entityId: 'approval-uuid',
  projectId: 'project-uuid',
  organizationId: 'org-uuid',
  userId: 'admin-uuid',
  data: {
    approvalType: 'date_change',
    targetEntityId: 'phase-uuid',
    approverRole: 'admin',
    approverName: 'John Admin'
  }
}
```

**Subscribers:**
- Apply change service (execute the approved change)
- Notification service (alert requester)
- Audit log

---

#### APPROVAL_REJECTED
**When:** Approver rejects a request

```typescript
{
  entityType: 'approval',
  entityId: 'approval-uuid',
  projectId: 'project-uuid',
  organizationId: 'org-uuid',
  userId: 'admin-uuid',
  data: {
    approvalType: 'date_change',
    targetEntityId: 'phase-uuid',
    rejectionReason: 'Budget constraints do not allow timeline extension'
  }
}
```

---

### Compliance Events

#### CHECKPOINT_PASSED
**When:** Compliance checkpoint is passed

```typescript
{
  entityType: 'checkpoint',
  entityId: 'checkpoint-uuid',
  projectId: 'project-uuid',
  organizationId: 'org-uuid',
  userId: 'user-uuid',
  data: {
    checkpointType: 'epa_permit',
    name: 'EPA Environmental Assessment',
    phaseId: 'phase-uuid',
    evidenceDocuments: ['doc-1', 'doc-2'],
    passedDate: '2024-02-01'
  }
}
```

**Subscribers:**
- Phase completion check (unblock if was blocking)
- Notification service
- Compliance report service

---

#### CHECKPOINT_FAILED
**When:** Compliance checkpoint fails

```typescript
{
  entityType: 'checkpoint',
  entityId: 'checkpoint-uuid',
  projectId: 'project-uuid',
  organizationId: 'org-uuid',
  userId: 'user-uuid',
  data: {
    checkpointType: 'fire_certificate',
    name: 'Ghana Fire Service Inspection',
    phaseId: 'phase-uuid',
    failureReason: 'Fire exits not properly marked',
    remediation: 'Install fire exit signage'
  }
}
```

---

#### CHECKPOINT_WAIVED
**When:** Admin waives a checkpoint requirement

```typescript
{
  entityType: 'checkpoint',
  entityId: 'checkpoint-uuid',
  projectId: 'project-uuid',
  organizationId: 'org-uuid',
  userId: 'admin-uuid',
  data: {
    checkpointType: 'epa_permit',
    name: 'EPA Environmental Assessment',
    waiveReason: 'Not applicable - renovation project under 500sqm'
  }
}
```

---

### Unit Events

#### UNIT_CREATED
**When:** New unit is added to project

```typescript
{
  entityType: 'unit',
  entityId: 'unit-uuid',
  projectId: 'project-uuid',
  organizationId: 'org-uuid',
  userId: 'user-uuid',
  data: {
    unitNumber: 'A101',
    unitType: '2_bedroom',
    floorNumber: 1,
    basePrice: 250000,
    currency: 'GHS'
  }
}
```

---

#### UNIT_RESERVED
**When:** Unit is reserved by a buyer

```typescript
{
  entityType: 'unit',
  entityId: 'unit-uuid',
  projectId: 'project-uuid',
  organizationId: 'org-uuid',
  userId: 'agent-uuid',
  data: {
    unitNumber: 'A101',
    buyerContactId: 'contact-uuid',
    buyerName: 'Kofi Mensah',
    reservationAmount: 5000,
    expiresAt: '2024-02-15'
  }
}
```

**Subscribers:**
- Sales dashboard update
- Notification service (sales team)
- CRM integration

---

#### UNIT_SOLD
**When:** Unit sale is completed

```typescript
{
  entityType: 'unit',
  entityId: 'unit-uuid',
  projectId: 'project-uuid',
  organizationId: 'org-uuid',
  userId: 'agent-uuid',
  data: {
    unitNumber: 'A101',
    buyerContactId: 'contact-uuid',
    buyerName: 'Kofi Mensah',
    salePrice: 275000,
    currency: 'GHS',
    paymentPlanId: 'plan-uuid'
  }
}
```

---

#### UNIT_HANDED_OVER
**When:** Unit is handed over to buyer

```typescript
{
  entityType: 'unit',
  entityId: 'unit-uuid',
  projectId: 'project-uuid',
  organizationId: 'org-uuid',
  userId: 'pm-uuid',
  data: {
    unitNumber: 'A101',
    buyerName: 'Kofi Mensah',
    handoverDate: '2024-06-01',
    punchListComplete: true,
    documentsHandedOver: ['title_deed', 'warranty', 'keys']
  }
}
```

---

### Payment Events

#### PAYMENT_RECEIVED
**When:** Payment is received for a unit

```typescript
{
  entityType: 'payment',
  entityId: 'payment-uuid',
  projectId: 'project-uuid',
  organizationId: 'org-uuid',
  userId: 'accountant-uuid',
  data: {
    unitId: 'unit-uuid',
    paymentPlanId: 'plan-uuid',
    amount: 15000,
    currency: 'GHS',
    paymentMethod: 'momo_mtn',
    transactionRef: 'MTN-TXN-12345',
    isDownPayment: false,
    installmentNumber: 3
  }
}
```

**Subscribers:**
- Payment plan update service
- Receipt generation service
- Notification service (buyer confirmation)
- Accounting integration

---

#### PAYMENT_CONFIRMED
**When:** Mobile money payment is confirmed

```typescript
{
  entityType: 'payment',
  entityId: 'payment-uuid',
  projectId: 'project-uuid',
  organizationId: 'org-uuid',
  data: {
    transactionRef: 'MTN-TXN-12345',
    momoProvider: 'MTN',
    confirmationCode: 'CONF-XYZ',
    confirmedAt: '2024-02-15T10:30:00Z'
  }
}
```

---

### RFI Events

#### RFI_SUBMITTED
**When:** RFI is submitted for review

```typescript
{
  entityType: 'rfi',
  entityId: 'rfi-uuid',
  projectId: 'project-uuid',
  organizationId: 'org-uuid',
  userId: 'pm-uuid',
  data: {
    rfiNumber: 'RFI-2024-001',
    subject: 'Foundation rebar specification',
    priority: 'high',
    dueDate: '2024-02-20'
  }
}
```

---

#### RFI_ASSIGNED
**When:** RFI is assigned to respondent

```typescript
{
  entityType: 'rfi',
  entityId: 'rfi-uuid',
  projectId: 'project-uuid',
  organizationId: 'org-uuid',
  userId: 'pm-uuid',
  data: {
    rfiNumber: 'RFI-2024-001',
    assignedToId: 'engineer-uuid',
    assignedToName: 'Kwame Engineer',
    assignedToRole: 'structural_engineer'
  }
}
```

**Subscribers:**
- Notification service (email/WhatsApp to assignee)
- RFI dashboard update

---

#### RFI_RESPONDED
**When:** RFI receives a response

```typescript
{
  entityType: 'rfi',
  entityId: 'rfi-uuid',
  projectId: 'project-uuid',
  organizationId: 'org-uuid',
  userId: 'engineer-uuid',
  data: {
    rfiNumber: 'RFI-2024-001',
    responseText: 'Use 16mm rebar at 200mm spacing...',
    hasAttachments: true,
    responseDays: 3
  }
}
```

---

#### RFI_CLOSED
**When:** RFI is closed

```typescript
{
  entityType: 'rfi',
  entityId: 'rfi-uuid',
  projectId: 'project-uuid',
  organizationId: 'org-uuid',
  userId: 'pm-uuid',
  data: {
    rfiNumber: 'RFI-2024-001',
    closedDate: '2024-02-18',
    totalDaysOpen: 5,
    costImpact: 0,
    scheduleImpact: 0
  }
}
```

---

## Event Subscribers

### Dashboard Service
Subscribes to: Most events
Purpose: Real-time dashboard updates via WebSocket

### Notification Service
Subscribes to: All state change events
Purpose: Send emails, WhatsApp, push notifications

### Analytics Service
Subscribes to: COMPLETED, SOLD, PAYMENT events
Purpose: Update metrics and KPIs

### Audit Log Service
Subscribes to: All governance events
Purpose: Maintain compliance audit trail

### CRM Integration
Subscribes to: Unit and payment events
Purpose: Sync with external CRM systems

---

## Event Subscription Example

```typescript
// In notification service initialization
import { eventBus, ProjectEventType } from '../events';

class NotificationService {
  initialize() {
    eventBus.on(ProjectEventType.PHASE_COMPLETED, this.handlePhaseCompleted);
    eventBus.on(ProjectEventType.APPROVAL_REQUESTED, this.handleApprovalRequested);
    eventBus.on(ProjectEventType.UNIT_RESERVED, this.handleUnitReserved);
    eventBus.on(ProjectEventType.PAYMENT_RECEIVED, this.handlePaymentReceived);
  }

  private handlePhaseCompleted = async (event: ProjectEvent) => {
    const { projectId, data } = event;
    
    // Get project stakeholders
    const stakeholders = await getProjectStakeholders(projectId);
    
    // Send notifications
    for (const stakeholder of stakeholders) {
      await this.sendNotification({
        userId: stakeholder.id,
        type: 'phase_complete',
        title: `Phase "${data.name}" Completed!`,
        message: `Great news! The ${data.name} phase has been completed.`,
        channel: stakeholder.preferredChannel // email, sms, whatsapp
      });
    }
  };
}
```
