# PROPMETRIK Workspace & Kobby AI Blueprint

> **Status**: Planning  
> **Scope**: In-app real-time collaboration + project-wide AI agent  
> **Stack Alignment**: Extends existing TypeScript/Node.js backend, Next.js frontend, PostgreSQL, Redis SSE infra

---

## 1. Executive Summary

**Workspace** is a structured, entity-linked collaboration layer built into PROPMETRIK that allows teams to communicate, share files, and track decisions tied to specific valuations, projects, deals, and properties — without leaving the platform.

**Kobby AI** is PROPMETRIK's embedded AI co-pilot that lives inside every Workspace channel. It has read access to the entity's full data context and can answer questions, generate summaries, flag risks, and take light actions — all in natural language within the chat thread.

Together they turn PROPMETRIK from a *data platform* into a *collaborative intelligence platform*.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          PROPMETRIK Frontend (Next.js)                  │
│                                                                         │
│  ┌───────────────┐  ┌──────────────────────────────────────────────────┐│
│  │  Entity Pages │  │          Workspace Panel (Slide-over / Embedded) ││
│  │  (Valuations, │  │  ┌────────────┐  ┌──────────────┐  ┌──────────┐ ││
│  │   Projects,   │◄─┤  │WorkspaceSB │  │ MessageList  │  │KobbyAI   │ ││
│  │   Deals,      │  │  │ (channels) │  │ (virtualized)│  │ChatInput │ ││
│  │   Properties) │  │  └────────────┘  └──────────────┘  └──────────┘ ││
│  └───────────────┘  └──────────────────────────────────────────────────┘│
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ WebSocket / SSE
┌──────────────────────────────────▼──────────────────────────────────────┐
│                        PROPMETRIK Backend (Node.js/Express)             │
│                                                                         │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────┐│
│  │  Workspace API   │  │ WebSocket Server  │  │   Kobby AI Service     ││
│  │  /api/v1/        │  │ (ws.propmetrik)   │  │ /api/v1/ai/kobby       ││
│  │  workspace/*     │  │                   │  │ (wraps mlAnalytics     ││
│  └──────────────────┘  └──────────────────┘  │  assistant/query)      ││
│           │                    │              └────────────────────────┘│
│           ▼                    ▼                         │              │
│  ┌──────────────────────────────────────┐   ┌───────────▼────────────┐ │
│  │           PostgreSQL                 │   │   Redis Pub/Sub         │ │
│  │  workspaces, messages, members,      │   │  realtime channels,     │ │
│  │  message_reads, workspace_files      │   │  presence tracking      │ │
│  └──────────────────────────────────────┘   └────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Integration Points with Existing Code

| Existing System | How Workspace Builds On It |
|---|---|
| `realtime.ts` SSE + `realtimeEmitter` | Workspace uses **WebSocket upgrade** on the same server; SSE emitter used for notifications to offline users |
| `mlAnalytics.ts` `/assistant/query` | Kobby AI wraps this endpoint with entity context injection |
| `auth.ts` JWT middleware | Re-used for WebSocket handshake authentication |
| `messaging.ts` WhatsApp service | Workspace activity → WhatsApp PM notifications (existing `whatsappBotService`) |
| All module routes (projects, valuations, deals, PM) | Kobby AI reads entity data from these APIs to answer questions |
| PostgreSQL `pool` | New tables added via standard migration files |

---

## 3. Database Schema

All tables go into `backend/src/database/migrations/NNN_workspace.sql`.

```sql
-- ============================================================
-- WORKSPACES (one per entity)
-- ============================================================
CREATE TABLE workspaces (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type      TEXT NOT NULL CHECK (entity_type IN ('project','valuation','deal','property')),
  entity_id        UUID NOT NULL,
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT,        -- auto-populated: e.g. "Project Alpha Workspace"
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (entity_type, entity_id)   -- one workspace per entity
);

CREATE INDEX idx_workspaces_org ON workspaces(organization_id);
CREATE INDEX idx_workspaces_entity ON workspaces(entity_type, entity_id);

-- ============================================================
-- WORKSPACE MEMBERS
-- ============================================================
CREATE TABLE workspace_members (
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT DEFAULT 'member' CHECK (role IN ('admin','member','viewer')),
  joined_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY  (workspace_id, user_id)
);

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE TABLE workspace_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  sender_id    UUID REFERENCES users(id),  -- NULL = system/kobby
  sender_type  TEXT DEFAULT 'user' CHECK (sender_type IN ('user','system','kobby_ai')),
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text','file','system','ai_response')),
  content      TEXT,
  metadata     JSONB,                      -- file info, AI citations, etc.
  thread_id    UUID REFERENCES workspace_messages(id),  -- for threading
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  edited_at    TIMESTAMPTZ,
  deleted_at   TIMESTAMPTZ                -- soft delete (GDPR)
);

CREATE INDEX idx_wm_workspace_time ON workspace_messages(workspace_id, created_at DESC);
CREATE INDEX idx_wm_sender ON workspace_messages(sender_id);
CREATE INDEX idx_wm_thread ON workspace_messages(thread_id);

-- ============================================================
-- READ RECEIPTS
-- ============================================================
CREATE TABLE workspace_message_reads (
  message_id UUID REFERENCES workspace_messages(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  read_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

-- ============================================================
-- FILES
-- ============================================================
CREATE TABLE workspace_files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  message_id   UUID REFERENCES workspace_messages(id),
  uploaded_by  UUID REFERENCES users(id),
  file_name    TEXT NOT NULL,
  file_url     TEXT NOT NULL,       -- S3-compatible URL
  file_size    BIGINT,
  mime_type    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. Backend Implementation Plan

### 4.1 Stack Decision: Stay on Node.js/Express (NOT FastAPI)

The user prompt suggested FastAPI/Python but **PROPMETRIK backend is already TypeScript/Node.js** with 60+ existing routes. Building a separate Python service adds operational complexity without clear benefit.

**Decision**: Implement Workspace as a new Express module + native `ws` WebSocket server mounted alongside the existing HTTP server.

### 4.2 New Files to Create

```
backend/src/
├── routes/
│   ├── workspace.ts          ← REST API for workspaces/messages/members
│   └── kobbyAI.ts            ← Kobby AI chat endpoint
├── services/
│   └── workspace/
│       ├── WorkspaceService.ts       ← CRUD, membership, message persistence
│       ├── WorkspaceWebSocketServer.ts  ← WS channel management
│       └── KobbyAIService.ts         ← Context builder + AI query
└── database/migrations/
    └── NNN_workspace.sql
```

### 4.3 REST API Endpoints

```
# Workspace lifecycle
GET  /api/v1/workspace/:entityType/:entityId     → Get or create workspace
GET  /api/v1/workspace/:id/messages?cursor=      → Paginated messages (cursor-based)
POST /api/v1/workspace/:id/messages              → Send message (REST fallback)

# Members
GET    /api/v1/workspace/:id/members             → List members
POST   /api/v1/workspace/:id/members             → Add member
DELETE /api/v1/workspace/:id/members/:userId     → Remove member

# Files
POST /api/v1/workspace/:id/files                 → Upload file attachment
GET  /api/v1/workspace/:id/files                 → List files

# Kobby AI
POST /api/v1/ai/kobby                            → Send a query to Kobby AI
GET  /api/v1/ai/kobby/context/:entityType/:entityId  → Pre-fetch entity context
```

### 4.4 WebSocket Flow

```
Client                          Server
  │                               │
  │── WS connect (JWT in header) ──▶│ Verify JWT
  │                               │
  │── { type: "join", workspaceId } ─▶│ Validate membership
  │                               │ Subscribe to Redis channel
  │                               │
  │── { type: "message", content } ─▶│ 1. Persist to DB
  │                               │ 2. Publish to Redis
  │                               │ 3. Broadcast to all WS clients
  │◀── { type: "message", id, ... } │    in workspace
  │                               │
  │── { type: "ping" } ────────────▶│ 
  │◀── { type: "pong" }             │ (heartbeat, 30s interval)
  │                               │
  │── { type: "kobby_query", text } ─▶│ 1. Build entity context
  │                               │ 2. Call KobbyAIService
  │◀── { type: "kobby_response", ... }│ 3. Persist AI response msg
  │                               │ 4. Broadcast as sender_type='kobby_ai'
```

### 4.5 `WorkspaceService.ts` Key Methods

```typescript
class WorkspaceService {
  // Auto-create workspace when entity is created
  async ensureWorkspace(entityType: string, entityId: string, orgId: string): Promise<Workspace>
  
  // Message operations (cursor-based pagination)
  async getMessages(workspaceId: string, cursor?: string, limit = 50): Promise<MessagePage>
  async persistMessage(workspaceId: string, senderId: string, content: string, type?: MessageType): Promise<Message>
  
  // Read tracking
  async markRead(workspaceId: string, userId: string, messageId: string): Promise<void>
  async getUnreadCount(workspaceId: string, userId: string): Promise<number>
  
  // Membership with RBAC enforcement
  async isMember(workspaceId: string, userId: string): Promise<boolean>
  async canWrite(workspaceId: string, userId: string): Promise<boolean>
}
```

---

## 5. Kobby AI — Context & Capabilities

### 5.1 What Kobby AI Is

Kobby AI is a context-aware AI assistant embedded **inside each Workspace channel**. It is invoked by typing `@kobby` in the message input. It has access to the entity's full data, chat history, and PROPMETRIK's analytics APIs.

### 5.2 Kobby AI's Data Access (Per Entity Type)

Kobby AI can read and reason over the following — all via **internal API calls** at query time:

#### In a **Project Workspace**
| Capability | Data Source | Example Query |
|---|---|---|
| Phase status & timeline | `GET /projects/:id/gantt` | *"Which phases are behind schedule?"* |
| Budget vs actual spend | `GET /projects/:id/costs` | *"How much are we over budget?"* |
| Site diary entries | `GET /projects/:id/site-diary` | *"Summarize last week's site activity"* |
| RFIs & Submittals | `GET /projects/:id/rfis` | *"What RFIs are still open?"* |
| Contractor performance | `GET /projects/:id/contractors` | *"Which contractor has lowest progress?"* |
| Chat history summary | `workspace_messages` table | *"What did we decide about Phase 3?"* |

#### In a **Valuation Workspace**
| Capability | Data Source | Example Query |
|---|---|---|
| Valuation report data | `GET /valuations/:id` | *"What's the final market value?"* |
| Comparable properties | `GET /valuations/:id/comparables` | *"Show me the top comps used"* |
| Risk flags | `GET /valuations/:id/risk` | *"What risks were flagged?"* |
| Market intelligence | `/analytics/ml/market/*` | *"Is this area in an uptrend?"* |
| Construction cost index | `/analytics/ml/construction/index` | *"Are build costs rising in Accra?"* |

#### In a **Deal Workspace**
| Capability | Data Source | Example Query |
|---|---|---|
| Deal pipeline stage | `GET /crm/deals/:id` | *"Where is this deal in the pipeline?"* |
| Contact history | `GET /messaging/contacts/:id/messages` | *"What's been communicated to the client?"* |
| Document status | `GET /deals/:id/documents` | *"Is the sale agreement signed?"* |
| E-sign envelope | `GET /e-sign/envelopes/:id` | *"What's the e-sign status?"* |

#### In a **Property Workspace**
| Capability | Data Source | Example Query |
|---|---|---|
| Tenant information | `GET /property-management/:id/tenants` | *"Who's occupying unit 3B?"* |
| Maintenance requests | `GET /property-management/:id/maintenance` | *"What open maintenance? "*|
| Rental income vs target | `GET /property-management/:id/financials` | *"Is rent collection on track?"* |
| Market rental rates | `/analytics/ml/market/*` | *"Is our rent competitive?"* |

### 5.3 Kobby AI Capabilities Beyond Q&A

| Capability | Mechanism |
|---|---|
| **Summarization** | Summarize workspace chat history into a bullet-point decision log |
| **Status Reports** | Auto-generate a weekly project/deal/property summary in chat |
| **Risk Flagging** | Proactively post messages when the AI detects anomalies (budget overrun, overdue RFI) |
| **Document Drafting** | Generate draft RFI responses, change order summaries, or memo text |
| **Action Items** | Extract action items from chat and post a structured list |
| **Data Lookup** | Answer factual questions from live PROPMETRIK data |
| **Market Briefing** | Pull live analytics insights for the entity's region/type |

### 5.4 `KobbyAIService.ts` Architecture

```typescript
class KobbyAIService {
  /**
   * Build rich context object from the entity + workspace history
   */
  async buildContext(entityType: string, entityId: string, workspaceId: string): Promise<KobbyContext> {
    const [entityData, recentMessages, analyticsData] = await Promise.all([
      this.fetchEntityData(entityType, entityId),
      this.fetchRecentMessages(workspaceId, 20),      // last 20 messages
      this.fetchRelevantAnalytics(entityType, entityId)
    ]);
    return { entityType, entityId, entityData, recentMessages, analyticsData };
  }

  /**
   * Send a query to the AI assistant with entity context
   */
  async query(userQuery: string, context: KobbyContext): Promise<KobbyResponse> {
    const systemPrompt = this.buildSystemPrompt(context);
    // Calls POST /api/v1/analytics/ml/assistant/query internally
    // (or directly calls OpenAI/Anthropic if wired to LLM provider)
    return await mlAnalyticsService.assistantQuery({
      query: userQuery,
      system_context: systemPrompt,
      entity_context: context.entityData,
    });
  }

  /**
   * Proactive monitoring - called by a cron job / event trigger
   */
  async generateProactiveInsight(entityType: string, entityId: string, workspaceId: string): Promise<void> {
    const context = await this.buildContext(entityType, entityId, workspaceId);
    const insight = await this.detectAnomalies(context);
    if (insight) {
      await workspaceService.persistMessage(workspaceId, null, insight, 'kobby_ai');
      await websocketServer.broadcast(workspaceId, { type: 'kobby_proactive', content: insight });
    }
  }
}
```

### 5.5 Kobby AI System Prompt Template

```
You are Kobby AI, PROPMETRIK's embedded real estate intelligence assistant.
You are operating inside the Workspace for:
  Entity Type: {entity_type}
  Entity Name: {entity_name}
  Organization: {org_name}

Entity Data Summary:
{entity_data_summary}

Recent Workspace Chat Context:
{recent_messages}

Market Data Context:
{analytics_summary}

Rules:
- Respond in the context of real estate operations in Ghana/West Africa
- Always ground answers in the provided data; acknowledge if data is unavailable
- Be concise and actionable (bullet points, numbers, dates)
- When flagging risks, propose a specific next step
- Do NOT fabricate financial figures or legal opinions
```

---

## 6. Frontend Implementation Plan

### 6.1 New Components to Build

```
frontend/src/components/workspace/
├── WorkspacePanel.tsx          ← Main slide-over panel, entry point
├── WorkspaceSidebar.tsx        ← Channel/member list
├── MessageList.tsx             ← Virtualized message feed (react-virtual)
├── MessageInput.tsx            ← Rich text input with @kobby trigger
├── KobbyAIBubble.tsx           ← Distinct AI message rendering
├── FileUploadZone.tsx          ← Drag-and-drop file attachment
├── WorkspaceMemberList.tsx     ← Member panel with roles
├── UnreadBadge.tsx             ← Unread count badge
└── hooks/
    ├── useWorkspaceSocket.ts   ← WebSocket connection management
    ├── useMessages.ts          ← Infinite scroll + cursor pagination
    └── useKobbyAI.ts           ← @kobby mention detection + AI calls
```

### 6.2 Integration into Entity Pages

Each entity page gets a **floating Workspace button** (bottom-right, like Intercom) that opens `WorkspacePanel` as a slide-over. This requires zero layout changes to existing pages.

```tsx
// Add to: src/app/dashboard/projects/[id]/page.tsx
//         src/app/dashboard/valuations/[id]/page.tsx  
//         src/app/dashboard/deals/[id]/page.tsx
//         src/app/dashboard/property-management/[id]/page.tsx

<WorkspacePanel 
  entityType="project" 
  entityId={project.id}
  trigger={<WorkspaceFloatingButton unreadCount={unreadCount} />}
/>
```

### 6.3 Kobby AI UX in the Message Input

```
┌─────────────────────────────────────────────────────────┐
│  Type a message...          📎 files  😊 emoji  ➤ send  │
│                                                         │
│  💡 Type @kobby to ask Kobby AI a question              │
│  Example: @kobby summarize this week's site logs        │
└─────────────────────────────────────────────────────────┘
```

When `@kobby` is detected:
1. A **Kobby AI suggestion chip** appears above the input
2. On submit, the message is sent via WebSocket with `type: "kobby_query"`
3. A **"Kobby is thinking..."** typing indicator shows
4. Kobby's response appears as a distinctly styled AI bubble with:
   - A Kobby AI avatar/icon
   - The response text
   - Collapsible "Sources" section showing what data was used
   - Copy / thumbs up/down feedback buttons

### 6.4 WebSocket Client (`useWorkspaceSocket.ts`)

```typescript
const useWorkspaceSocket = (workspaceId: string) => {
  const wsRef = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/workspaces/${workspaceId}?token=${jwt}`);

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: 'join', workspaceId }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'message' || data.type === 'kobby_response') {
        setMessages(prev => [...prev, data.payload]);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Exponential backoff reconnect
      setTimeout(() => { /* reconnect */ }, 1000 * Math.pow(2, retryCount));
    };

    return () => ws.close();
  }, [workspaceId]);

  const sendMessage = (content: string) => {
    ws.send(JSON.stringify({ type: 'message', content }));
  };

  const queryKobby = (query: string) => {
    ws.send(JSON.stringify({ type: 'kobby_query', query }));
  };

  return { messages, connected, sendMessage, queryKobby };
};
```

---

## 7. Workspace Auto-Creation Hooks

To ensure every entity gets a workspace automatically, add hooks to existing service creation flows:

```typescript
// In: backend/src/routes/projects.ts → POST /
// In: backend/src/routes/valuations.ts → POST /
// In: backend/src/routes/crm.ts → POST /deals
// In: backend/src/routes/propertyManagement.ts → POST /properties

// After entity creation:
await workspaceService.ensureWorkspace(
  'project',        // or 'valuation', 'deal', 'property'
  newProject.id,
  req.user.organizationId
);
```

An activity log message is also posted automatically:
```
[System]: 🚀 "Alpha Tower" workspace created. Add team members to collaborate.
```

---

## 8. Kobby AI Proactive Monitoring

Beyond answering questions, Kobby AI runs scheduled jobs that post proactive insights:

| Trigger | What Kobby Posts |
|---|---|
| Phase end date T-7 days | *"⚠️ Phase 3 ends in 7 days (42% complete). Risk of delay."* |
| Budget > 85% consumed | *"💰 Budget alert: 87% spent with 40% of construction remaining."* |
| RFI overdue > 3 days | *"📋 3 RFIs are overdue. Oldest: Site Electrical (12 days)."* |
| Daily diary not submitted | *"📓 No site diary for today. @site_manager please submit."* |
| Valuation RICS compliance flag | *"🔴 RICS flag detected in draft report. Review required."* |
| Deal no activity > 7 days | *"❄️ Deal has been inactive for 7 days. Next step?"* |

These are implemented as cron jobs in `backend/src/jobs/kobbyAIMonitor.ts`.

---

## 9. Notifications Integration

### In-App (via existing SSE `realtimeEmitter`)
When a new Workspace message arrives and the user is **not** in the Workspace panel, the existing SSE infrastructure fires a notification dot.

### WhatsApp (via existing `whatsappBotService`)
For PMs and Site Managers: daily workspace summary delivered to WhatsApp at 6 PM.

### Email
Daily digest email via existing email service for unread threads.

---

## 10. Multi-Tenant Isolation

All Workspace queries are scoped by `organization_id`:

```sql
-- All message queries include org isolation via workspace join:
SELECT m.* FROM workspace_messages m
JOIN workspaces w ON w.id = m.workspace_id
WHERE w.organization_id = $1          -- always enforced
  AND w.id = $2
ORDER BY m.created_at DESC;
```

Redis pub/sub channels are namespaced: `workspace:{org_id}:{workspace_id}`

---

## 11. Implementation Phasing

### Phase 1 — Workspace MVP (Weeks 1–3)
- [ ] Database migration (workspaces, members, messages, reads, files)
- [ ] `WorkspaceService.ts` — CRUD, pagination
- [ ] `WorkspaceWebSocketServer.ts` — basic WS with Redis pub/sub
- [ ] REST API (`workspace.ts` route)
- [ ] `WorkspacePanel.tsx` + `MessageList.tsx` + `MessageInput.tsx`
- [ ] Auto-create workspace on entity creation
- [ ] Basic unread tracking + notification badge

### Phase 2 — Kobby AI Integration (Weeks 4–5)
- [ ] `KobbyAIService.ts` — context builder + query wrapper
- [ ] `kobbyAI.ts` REST route
- [ ] WS `kobby_query` message type handling
- [ ] `KobbyAIBubble.tsx` — AI response UI component
- [ ] @kobby trigger in `MessageInput.tsx`
- [ ] Per-entity context fetchers (project, valuation, deal, property)

### Phase 3 — Intelligence & Polish (Week 6+)
- [ ] Proactive monitoring cron jobs (`kobbyAIMonitor.ts`)
- [ ] File attachments (S3 upload + `workspace_files` table)
- [ ] Thread support (reply-to-message)
- [ ] Typing indicators
- [ ] WhatsApp daily digest integration
- [ ] Message search
- [ ] Workspace activity log export

---

## 12. Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Transport | WebSocket (`ws` npm) | Full-duplex needed; SSE is write-only |
| Pub/Sub | Redis (already in stack for SSE) | Zero new infra; same Redis instance |
| DB | Add tables to existing PostgreSQL | No separate persistence layer needed |
| Backend language | TypeScript/Node.js (not Python) | Already the app's language; keeps one codebase |
| AI backend | Wrap existing `/analytics/ml/assistant/query` | The LLM integration point is already built |
| File storage | S3-compatible (same as existing doc storage) | Consistent with `eSign.ts` / `photos.ts` patterns |
| Frontend state | Zustand (already used in app) | React Context insufficient for real-time + offline |
| Message pagination | Cursor-based (created_at + id) | More stable than offset for real-time feeds |

---

## 13. What Kobby AI Is NOT

- ❌ Not a general-purpose LLM chatbot (it's scoped to PROPMETRIK entity data)
- ❌ Not able to make writes/mutations (read-only access to entity data)
- ❌ Not able to send emails or WhatsApp messages on behalf of users (safety guardrail)
- ❌ Not trained on your data (uses retrieval — no fine-tuning required initially)
