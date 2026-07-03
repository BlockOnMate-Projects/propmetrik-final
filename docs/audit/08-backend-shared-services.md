# Audit 08 — `backend/shared-services/`

Senior Staff Engineer file-by-file audit. Read-only; no source modified.
Date: 2026-07-02. Auditor: automated deep audit (5 parallel passes + manual WS/boundary review).

---

## 1. Scope, counts, LOC

**Scope:** every `.ts` file under `backend/shared-services/`, excluding `.venv/` and vendored Python.

| Metric | Value |
|---|---|
| `.ts` files audited | **79** |
| Total TS LOC | **35,453** |
| God files (>800 LOC) | **11** |
| Empty stub dirs | 2 (`api-gateway-kong/`, `auth-keycloak/` — 0 bytes) |
| Real `.py` files (outside venv) | ml-serving: 13 (~7,700 LOC) + e-sign: 5 (dead parallel impl) |
| **Vendored venv (git-tracked!)** | `ml-serving/.venv` = **328 MB**, `ml-serving/models` = **397 MB** — both in `git ls-files` |

### Vendored-venv finding (repo hygiene, HIGH)
`backend/shared-services/ml-serving/.venv` (328 MB) and `ml-serving/models` (397 MB) are **committed to git** (`git check-ignore` returns exit 0 only because a *later* ignore rule matches, yet `git ls-files` still tracks 15 files and the dirs are present). ~725 MB of Python virtualenv + model binaries in the TS monorepo. This bloats every clone/CI checkout. **Fix:** `git rm -r --cached ml-serving/.venv ml-serving/models`, add to `.gitignore`, rebuild venv from `requirements.txt` in the Docker image. The ml-serving Python service is a separate deployable — it should arguably be its own repo.

### God files (>800 LOC)
| File | LOC |
|---|---|
| publications/pdfGenerationService.ts | 1540 |
| payments/subscriptions/subscriptionService.ts | 1519 |
| calendar/calendarService.ts | 1307 |
| e-sign/pdfSigningService.ts | 1165 |
| workflow/workflowService.ts | 1124 |
| publications/autopilot/autopilotPipeline.ts | 1069 |
| notifications/unified/index.ts | 1005 |
| workspace/WorkspaceService.ts | 969 |
| publications/autopilot/chartSelectionEngine.ts | 933 |
| workflow/workflowExecutionEngine.ts | 907 |
| payments/crypto/nowPaymentsService.ts | 864 |
| (borderline) payments/crypto/cryptoPaymentService.ts | 807 · workspace/WorkspaceWebSocketServer.ts 835 |

---

## 2. Domain scores (1–10)

| Domain | Quality | Security | Notes |
|---|---|---|---|
| workspace (messenger + WS + KobbyAI) | 7 | 5 | Solid org-isolation in WS join/DB; but KobbyAI REST has cross-org IDOR + unbounded presence maps |
| e-sign | 6 | **3** | Live signing path hashes the URL not the PDF; XOR "encryption"; mock TSA. See top findings |
| payments (fiat + crypto + subs) | 6 | 5 | Webhook verify opt-in; float money math; hardcoded token addrs; dup Paystack client |
| notifications / ai | 7 | 6 | Clean `notify()` core; inline HTML templates; prompt-injection surface in llmClient |
| marketplace | 6 | 4 | `getPropertyByToken`/search miss org filter; SQL interval interpolation |
| publications / autopilot | 6 | 4 | SSRF in anomalyTrigger + webhook exec; prompt injection into Gemini; no puppeteer pool |
| workflow | 6 | 4 | Webhook-action SSRF (no URL allowlist); god files |
| calendar / analytics / risk / realtime | 6 | 6 | realtime SSE map leak risk; google OAuth tokens in memory only |
| **Overall** | **6** | **4.5** | Architecturally coherent, but multiple live crypto/authorization defects |

---

## 3. TOP FINDINGS (by priority)

### P0-1 — e-sign signs the URL string, not the document (CRITICAL, live path)
`e-sign/signingService.ts:39-41`:
```ts
// Calculate document hash (for now, we'll hash the URL as placeholder)
const documentHash = pdfSigningService.calculateDocumentHash(Buffer.from(dto.originalPdfUrl || ''));
```
The signed hash is `SHA-256("https://…/file.pdf")`, not the PDF bytes. A signature therefore attests to **nothing about content** — the PDF at that URL can be swapped after signing with zero detectability. **This path is wired** (`src/routes/eSign.ts:620/696/758` → `createSigningRequest`/`captureInternalSignature`/`captureExternalSignature`) and backs valuation + lease signing. **Fix:** fetch the object from MinIO and hash the actual bytes (accept a `Buffer`), store `documentHash` alongside the sealed artifact.

### P0-2 — e-sign private keys "encrypted" with XOR + hardcoded dev secret (CRITICAL, live path)
`e-sign/keyManagementService.ts:14,124-136`:
```ts
const KEY_ENCRYPTION_SECRET = process.env.ESIGN_KEY_SECRET || 'dev-secret-change-in-prod';
// Simple XOR-based obfuscation for dev - NOT for production!
encrypted[i] = buffer[i] ^ key[i % key.length];
```
Signing private keys are XOR-obfuscated (symmetric, deterministic, trivially reversible) under a fallback secret shipped in source. Anyone with DB read recovers every private key. Reached via `signingService` → `keyManagementService`. **Fix:** AES-256-GCM via `crypto.createCipheriv` or Vault transit; fail hard if `ESIGN_KEY_SECRET` unset. Same anti-pattern for the HMAC ID secret at `signatureIdService.ts:19` (`'propmetrik-esign-secret-2026'`).

### P0-3 — e-sign timestamps are a self-signed in-memory mock TSA (CRITICAL)
`e-sign/timestampService.ts:18-24` generates the TSA keypair in-process on first use and signs JSON (not RFC-3161 ASN.1) with system time. Non-repudiation is fake — any operator can regenerate keys and backdate. Wired via `signingService`. **Fix:** external RFC-3161 TSA, or stop presenting these as trustworthy timestamps in the audit trail.

### P0-4 — Cross-org IDOR in KobbyAI + e-sign integration + marketplace (HIGH)
- `src/routes/kobbyAI.ts:43-64, 91-117` call `kobbyAIService.buildContext(entityType, entityId, …)` using a caller-supplied `entityId` that is **never checked to belong to the caller's org**. `KobbyAIService` then reads the project/valuation/deal/property directly by id (`KobbyAIService.ts:61-253`) — any authenticated user can pull another org's project budget, deal pipeline, tenancy data through the assistant.
- `e-sign/integration/eSignIntegrationService.ts:169-203` `getEnvelopeStatus(envelopeId)` selects `WHERE e.id = $1` with no org filter → any envelope leaks to any caller.
- `marketplace/marketplaceService.ts` search + `opensearchMarketplaceService.getPropertyByToken` (~:231) lack an org filter; token/id enumeration crosses orgs.
**Fix:** thread `organizationId` into every lookup and add `AND organization_id = $n` (the WS layer already does this correctly — see §5).

### P1-5 — Payments: webhook signature verification is opt-in + float money math (HIGH)
`paystack/index.ts:298-305` `verifyWebhookSignature()` and `crypto/nowPaymentsService.ts:447-463` `verifyIpnSignature()` are public helpers the caller *may* forget — the latter returns `false` (not throw) when the IPN secret is unset, so a fire-and-forget caller accepts forged IPNs. Money flows as JS floats throughout (`subscriptionService.ts:82`, `feeEngine.ts:130`, `feeCollectionService.ts:73`) with rounding applied inconsistently. Plus token addresses hardcoded to Polygon mainnet (`paymentRoutingService.ts:427-432`) break on testnet. **Fix:** enforce verification in a shared webhook middleware; store/compute money in integer pesewas/subunits; move addresses to config.

### Runner-up findings
- **SSRF (HIGH):** `publications/autopilot/anomalyTrigger.ts:~140` fetches `${BASE_URL}${endpoint}` (BASE_URL fallback `http://localhost:4000`); `workflow/workflowExecutionEngine.ts:~448` fetches webhook URLs from `action_config` JSON with no scheme/allowlist check. Internal-metadata reachable.
- **Prompt injection (MED):** `ai/llmClient.ts:223` and autopilot pass unsanitized user/topic text into LLM prompts. Currently read-only outputs, so impact is bounded — but KobbyAI feeds live DB data into the prompt, so keep it read-only (no tool/action execution).
- **Memory leaks on long-lived servers (MED):** `WorkspaceWebSocketServer` `presenceMap`/`subscribedWorkspaces` never shrink the subscription set (Redis channels only ever subscribed, never unsubscribed — `:630`), and the server has **no `shutdown()`** (heartbeat interval never cleared; not called in `src/index.ts` graceful shutdown, unlike `analyticsStreamServer.shutdown()` at `index.ts:823`). `realtime/realtimeService.ts:~164` SSE client map relies on `close` firing.
- **Dup WhatsApp + geocoding services:** `messaging/whatsappService.ts` (453) vs `notifications/whatsapp/whatsapp.service.ts` (116); `marketplace/geocodingService.ts` (303) vs `shared/geocodingHelper.ts` (185) — overlapping Mapbox logic, caller must guess which to import.
- **In-memory OTP store:** `e-sign/magicLinkService.ts:18` OTPs in a `Map` — lost on restart, un-clustered, no rate limit; step-up OTP validation is a TODO that "accepts any code" (`signingService.ts:167,195`).

---

## 4. Duplicate analysis (vs `backend/src`)

| Concern | shared-services | backend/src | Verdict |
|---|---|---|---|
| Notification dispatch | `notifications/notify.ts` + `in-mail/notificationService.ts` + `unified/index.ts` | `src/services/property-management/notifications/notificationService.ts` (468, own templates + nodemailer), `src/services/email/welcomeEmail.ts` (delegates to shared `notify`) | **shared `notify()` is canonical** (imported by ~20 src routes/jobs/services). The PM `notificationService` is a legacy parallel dispatcher (own enum + templates + `sendEmail`); should be folded into `notify()`. |
| WS client-management | `workspace/WorkspaceWebSocketServer.ts` (835) | `src/services/analytics/analyticsStreamServer.ts` (376) | **Divergence, partly justified — see §5.** Analytics server is the newer, cleaner pattern; workspace server predates it and lacks its shutdown/backpressure discipline. Recommend a shared `BaseWsServer`. |
| E-sign helpers | `e-sign/*` (signing + envelope, two parallel backends) | `src/routes/eSign.ts` (3040-LOC route) delegates in; no embedded dup | Route correctly delegates. But **two e-sign engines coexist**: `signingService`(`signing_requests`) and `envelopeService`(`esign_envelopes`) — different tables, overlapping purpose. Consolidate long-term. |
| Paystack client | `payments/paystack/index.ts` (517) | `src/services/property-management/payment/paystackService.ts` (563) | **~95% copy-paste.** `subscriptionBillingService` imports the *src* one (only that copy has `chargeAuthorization`). The shared-services copy is effectively dead for billing. Delete one. |
| Geocoding | `marketplace/geocodingService.ts`, `shared/geocodingHelper.ts` | — | Two Mapbox impls; merge. |

---

## 5. BOUNDARY ANALYSIS — `shared-services/` vs `src/services/`

**Why it exists:** the barrel (`shared-services/index.ts`) frames these as "domain-agnostic cross-cutting infrastructure" consumed by all verticals (CRM, PM, valuation, projects). In practice the split is **not clean**.

**Imports crossing the boundary:**
- **shared-services → ../src (heavy):** ≥20 files reach back into `../../src/database` (`pool`), `../../src/utils/logger`, `../../src/config`, and even concrete domain services: `payments/subscriptions/subscriptionBillingService.ts:25` imports `src/.../paystackService`; `payments/crypto/exchangeRateService.ts:26` imports `src/services/data-hub/economicDataService`; `workspace/KobbyAIService.ts:19-25` imports five `src/services/analytics/*` services + `src/services/ai/aiService`. So "shared" services depend **upward** on `src` domain code.
- **src → shared-services (heavy):** **129 `src` files** import from `shared-services` (routes, jobs, workers, PM services).

**This is bidirectional coupling**, not a layered dependency. `shared-services` is not a lower infrastructure layer — it's a second peer services root that happens to live in a sibling folder, and the two import each other freely (e.g. `subscriptionBillingService` → src paystack → (src) → back into shared feeEngine). No import cycle *crashes* today because most edges resolve lazily / at leaf modules, but the graph is circular at the package level.

**Recommendation:** Treat the boundary as debt to collapse, not a boundary to defend.
1. Short term: stop new `shared-services → src/services/<domain>` edges; those belong in `src`. Pure infra (db/logger/config) dependencies are fine.
2. Move genuinely cross-cutting primitives (`base/BaseService`, `notify()`, e-sign, `realtime`, ws base) into a real `src/platform/` (or a published internal package) with a **one-way** rule: platform may not import domain services.
3. Relocate domain-flavored "shared" services (KobbyAIService, subscriptionBillingService, marketplace) back under `src/services/<domain>` — they are not domain-agnostic.
4. Adopt a shared `BaseWsServer` (auth + heartbeat + org-conn-cap + `shutdown()`) extracted from `analyticsStreamServer` and make `WorkspaceWebSocketServer` extend it.

### WS comparison (workspace vs analyticsStreamServer)
| Aspect | WorkspaceWebSocketServer | analyticsStreamServer | Take |
|---|---|---|---|
| Auth | JWT (local `jwt.verify` → Keycloak JWKS fallback) per-connection; JWKS is a module-level `createRemoteJWKSet` (`:40`, cached, good) | `pmk_` API key via `resolveApiKey`; header or subprotocol | Both sound. JWKS not re-fetched per conn (good). |
| Org isolation | Rejects token w/o org (`:184`); every DB path org-scoped (`WorkspaceService.getById`/`addMember` hard org guard) | per-org conn cap + per-product entitlement | Workspace org-isolation is genuinely strong |
| Heartbeat | 30 s ping/terminate (`:672`) | 30 s (`HEARTBEAT_MS`) | Equivalent |
| Backpressure/limits | msg length, 5 conn/user, sliding-window rate limit | `maxPayload`, control-rate limit, per-tier conn cap | Comparable |
| Shutdown | **none** — interval + Redis sub never torn down | `shutdown()` clears heartbeat, bus, sockets; **called in index.ts** | Workspace gap |
| Upgrade routing | attaches with `server` option (first) | `noServer` dispatcher preserves prior listeners (`:97-111`) | Analytics is the correct coexistence pattern; workspace relies on being attached first |
**Verdict:** accept the divergence *only* until a shared base lands; give workspace a `shutdown()` now (quick win) and unsubscribe Redis channels when a workspace empties.

---

## 6. FILE-BY-FILE

### workspace/ (4 files, 2,573 LOC) — manually reviewed
- **WorkspaceWebSocketServer.ts (835)** — WS messenger gateway. Good: org-required auth (`:184`), sanitizeContent XSS-escape (`:80`), rate limit, conn cap, offline in-mail fallback (`:400`). Issues: no `shutdown()` (heartbeat `:672` + subscriber never cleared); `subscribedWorkspaces`/`presenceMap` grow unboundedly, Redis channels never unsubscribed (`:630`); `broadcastToConversation` does a DB `getConversationMemberUserIds` on **every** message/typing event (`:591`) — per-message query in hot path; constants inline (`MAX_MESSAGE_LENGTH` etc `:35-38`) not config.
- **WorkspaceService.ts (969, god file)** — workspace/message/conversation persistence. Strong org isolation (`getById` `:208`, `addMember` cross-org guard `:228-240`). `persistMessage` does insert + a **second** `SELECT display_name` per message (`:658`, N+1 on every send). `searchMessages`/`exportMessages` used by routes with member checks (verified `src/routes/workspace.ts:646-695`). Split into repo + conversation-admin + read-tracking.
- **KobbyAIService.ts (706)** — AI context builder + query. **Cross-org IDOR via callers (see P0-4)** — fetch-by-id functions (`:57-299`) take raw entityId, no org guard. Platform cache TTL 5 min (`:322`, bounded, ok). Feeds live DB into prompt → keep read-only. Model/temp routed through shared `aiService` (`:589`, good — no hardcoded model here).
- **documentService.ts (64)** — MinIO presigned URL helper. Clean; region `'us-east-1'` placeholder is correct for MinIO. TTL params defaulted (15/60 min).

### e-sign/ (16 TS files, ~5,476 LOC) + 5 dead `.py`
- **pdfSigningService.ts (1165, god)** — PDF hash/stamp/certificate. Hardcoded `https://app.propmetrik.com/verify/…` (`:768`) + "PROPMETRIK Ghana Ltd." ×4; dead `addSignatureCertificatePage()` (`:111`) superseded by `generateCertificateOfCompletion()`; whole cert PDF+QR built in memory.
- **envelopeService.ts (736, god)** — DocuSign-style lifecycle. Org-scoped on writes (`:366/590/614`); `getEnvelopeByAccessToken` intentionally org-agnostic (external signers) but relies solely on 256-bit token; localhost:3000 fallback (`:230`); TODO resend (`:634`).
- **signingService.ts (677)** — **P0-1 URL-hash**, **step-up OTP is a no-op TODO** (`:167,195`), hardcoded system UUID `0000…` for external signers (`:278`). Wired via eSign route.
- **keyManagementService.ts (167)** — **P0-2 XOR + dev secret**. ECDSA P-256 gen + verify are otherwise correct.
- **timestampService.ts (129)** — **P0-3 mock TSA**.
- **magicLinkService.ts (225)** — in-memory OTP `Map` (`:18`), no rate limit, OTP email is a TODO (logs plaintext `:143`); token entropy 256-bit (good).
- **signatureIdService.ts (459)** — HMAC-checksummed IDs (solid) but fallback secret in source (`:19`); sequence derived from `MAX()` → race on concurrent issue.
- **integration/eSignIntegrationService.ts (341)** — **P0-4 missing org filter** on `getEnvelopeStatus` (`:169-203`); cert-of-completion TODO (`:247`).
- **auditLogService.ts (167)** — SHA-256 hash chain, but self-notes it can't verify across interleaved requests (`:86`).
- **templateService.ts (331)** — org-scoped; `JSON.parse` without try/catch (`:315-323`).
- **consentService.ts (86)**, **permanentSignerId.ts (115)** — clean; permanentSignerId has a mild insert race (ON CONFLICT partially mitigates).
- **types.ts (505), integration/types.ts (298), integration/index.ts (8), index.ts (60)** — definitions/barrels, clean. `integration/types.ts:122` webhook `callbackUrl` user-provided → SSRF risk at registration.
- **Dead `.py`:** `main.py`, `models.py`, `config.py`, `api/webhooks.py`, `api/programmatic.py` — a parallel Python e-sign impl, **not referenced by any TS**. Delete.

### payments/ (14 files, 4,825 LOC)
- **subscriptions/subscriptionService.ts (1519, god)** — plan/sub/invoice/Keycloak. Tax rate hardcoded 12.5% (`:1072`); float money (`:82`); createSubscription throws on existing (not idempotent, `:521`); Keycloak sync fire-and-forget no retry (`:621`).
- **subscriptions/subscriptionBillingService.ts (590)** — recurring billing. Imports **src** Paystack (`:25`, the only copy with `chargeAuthorization`); good atomic `WHERE current_period_end <= NOW()` guard (`:254`); retry backoff `[1,3,5,7]` hardcoded (`:37`).
- **paystack/index.ts (517)** — **dup of src client**, missing `chargeAuthorization`/`submitOTP`; `verifyWebhookSignature` opt-in (`:298`); baseURL hardcoded (`:172`).
- **feeEngine.ts (338)** — hardcoded fallback fee table (`:233`); unbounded per-org cache Map (`:66`); float math no NaN guard; per-entity override only for `rent`.
- **crypto/cryptoPaymentService.ts (807, god)** — ERC-20 init/verify; hardcoded token addrs; float on token amounts; non-atomic `isReferenceProcessed` race (`:183`); contract not validated at startup.
- **crypto/nowPaymentsService.ts (864, god)** — **IPN verify returns false when secret unset** (`:447`); hardcoded settleable-currency set (`:60`); `getPaymentHistory` can be unbounded (`:820`).
- **crypto/blockchainListener.ts (453)** — hardcoded 1000-block lookback + 2000 chunk; loads range into memory; listeners cleaned only if `stop()` called; orphaned comment block (`:410`).
- **crypto/escrowPayoutService.ts (484)** — 60 s poll (env); `clearInterval` in `stop()` but stop not guaranteed on exit; status map not exhaustive (`:319`).
- **crypto/paymentRoutingService.ts (613)** — **hardcoded Polygon-mainnet token addrs** (`:427`); sandbox mode drops outcome addr; min-amount check swallowed on API error.
- **crypto/attestationService.ts (499)** — hardcoded gas 200k / retries; per-ticker decimals map defaults to 8 (wrong for SHIB etc); dup CHAIN_NAMES map (also in listener + cryptoPaymentService + types).
- **crypto/feeCollectionService.ts (404)** — platform-fee-wallet env fallback silent; failed payouts not retried.
- **crypto/exchangeRateService.ts (275)** — **good:** no hardcoded FX fallback, throws if live rate invalid (`:97`); foreign-rate cache Map unbounded (3 currencies, ok).
- **crypto/types.ts (219)** — hardcoded chain-id map; no RPC-URL validation at startup. **crypto/index.ts (34)** — clean.
- **crypto/feeEngine / paystack barrels** — clean.

### notifications/ (6 files) + ai/ (3)
- **notifications/notify.ts (325)** — **canonical dispatch core.** Audience/recipient routing, parallel sends, de-dup, best-effort. Inline `defaultEmailHtml()` template + `propmetrik.com` hardcoded.
- **notifications/unified/index.ts (1005, god)** — MS Graph → SES → Google email + Twilio SMS. Creds from env (good); several inline HTML templates (`:669-781`); no cross-provider retry.
- **notifications/in-mail/notificationService.ts (567, god)** — inbox CRUD + templates; inline email HTML (`:217`).
- **in-mail/routes.ts (225)** — all routes behind `authenticate`; camel/snake serialization workaround.
- **in-mail/index.ts (25)**, **whatsapp/whatsapp.service.ts (116)** — barrel + WhatsApp client with `'mock-token'` fallback (feature-flag, warn on startup recommended).
- **ai/anthropicClient.ts (347)** — Claude wrapper; default model `'claude-sonnet-4-20250514'` (`:29`, env-overridable); key from env; last-1000 metrics ring (bounded).
- **ai/llmClient.ts (514)** — DeepSeek→Claude multi-provider; hardcoded per-M-token costs (`:101`, will drift); prompt-injection surface (`:223`).
- **ai/index.ts (36)** — barrel.

### marketplace/ (3) · messaging/ (1) · document-service/ (1)
- **marketplace/marketplaceService.ts (683, god)** — unified PM+CRM search; **SQL interval string-interpolated** (`:243`, parseInt-guarded but bad practice); **missing org-ownership check** (`:367`); N+1-ish image enrich.
- **marketplace/opensearchMarketplaceService.ts (364)** — OpenSearch w/ PG fallback (good); `getPropertyByToken` no org filter (`:231`).
- **marketplace/geocodingService.ts (303)** — Mapbox+Overpass; 10 s timeout no retry; **dup of shared/geocodingHelper**.
- **messaging/whatsappService.ts (453)** — CRM WhatsApp; inline message templates (`:389`); **dup surface vs notifications/whatsapp**.
- **document-service/index.ts (757)** — S3/MinIO + Handlebars + puppeteer/pdf-lib fallback; stores org_id/entity in metadata (good); WinAnsi accent-stripping may mangle intl names (`:677`).

### workflow/ (4) · publications/ (11) · calendar/ (3) · analytics/ (4) · risk/ (2) · compliance/ (1) · realtime/ (2) · base/ (2) · shared/ (1)
- **workflow/workflowService.ts (1124, god)** — CRUD+trigger-match+exec+templates; org-isolated trigger match (`:543`). **workflowExecutionEngine.ts (907, god)** — **webhook-action SSRF** (`:448`, no URL validation); step re-filter per iteration. **workflowEventEmitter.ts (461)** — emitters possibly unused (grep-verify). **index.ts (31)**.
- **publications/pdfGenerationService.ts (1540, god)** — puppeteer PDF; **new browser per PDF** (no pool); hardcoded brand colors/labels; page.pdf() no timeout. **autopilotPipeline.ts (1069, god)** — hardcoded 900-line system prompt; **prompt injection** (`:108,420`). **anomalyTrigger.ts (276)** — **SSRF** (`:140`, BASE_URL localhost fallback). **chartSelectionEngine.ts (933, god)** — unbounded candidate build; AI output not schema-validated. **qualityGateEngine.ts (511)** — gates defer/pass on AI-parse failure. **autopilotScheduler.ts (168)** — wired at startup (`src/index.ts`); TZ env unvalidated. **geminiService.ts (289)** — thin facade delegating to `src/services/ai/aiService` (proper, not dup). **publicationsService.ts (666)**, **templates.ts (174)**, **types.ts (365)**, **index.ts (32)**.
- **calendar/calendarService.ts (1307, god)** — CRUD+availability+booking+lease events; O(n²) slot overlap; TZ `Africa/Accra` hardcoded. **googleCalendarService.ts (575)** — OAuth **tokens in memory only** (lost on restart), not wired into calendarService sync. **index.ts (25)**.
- **analytics/advancedAnalyticsService.ts (646)**, **occupancyCalculator.ts (139)**, **shortStayMetricsService.ts (394)**, **index.ts (7)** — parameterized queries, minimal risk; distinct from `src/services/analytics/*`.
- **risk/floodRiskService.ts (262)** / **litigationRiskService.ts (408)** — PostGIS with graceful fallbacks; hardcoded score thresholds.
- **compliance/ricsComplianceService.ts (462)** — Azure Doc Intelligence; `ocr_confidence` hardcoded 85 (`:264`, placeholder bug).
- **realtime/realtimeService.ts (575)** — SSE emitter; client Map leak risk if `close` never fires (`:164`, mitigated by heartbeat); cleanup interval good; has `shutdown()` (called in index.ts). **realtime/index.ts (7)**.
- **base/BaseService.ts (431)** — abstract base, extended by ~118 src services; nothing in shared-services extends it. **base/index.ts (9)**.
- **shared/geocodingHelper.ts (185)** — Mapbox multi-strategy; **dup of marketplace/geocodingService**.
- **index.ts (96)** — root barrel; naming inconsistency (service class vs helper fn for geocoding).

### ml-serving/ (Python, quick pass)
13 real `.py` (~7,700 LOC: main 1139, ai_assistant 1137, model_monitoring 1217, document_intelligence 965, trend_extraction 879, sentiment 787, ner 721, routes 630, training 810, config/database/init). Separate FastAPI deployable (own Dockerfile/requirements). **Not TS-audited** per scope. Chief finding is the **725 MB tracked `.venv`+`models`** (see §1).

---

## 7. Coverage ledger

| Dir | Files | Audited | How |
|---|---|---|---|
| workspace/ | 4 | 4 | manual (full reads) |
| e-sign/ (TS) | 16 | 16 | agent A + manual verify of P0-1/2/3 & wiring |
| payments/ | 14 | 14 | agent B |
| publications/ workflow/ calendar/ analytics/ | 22 | 22 | agent C |
| notifications/ ai/ marketplace/ messaging/ document-service/ compliance/ risk/ shared/ base/ realtime/ + root index | 23 | 23 | agent D |
| **Total TS** | **79** | **79** | **100%** |
| e-sign/ (Python) | 5 | flagged dead | grep (0 TS refs) |
| ml-serving/ (Python) | 13 | quick pass | LOC + venv weight only (out of TS scope) |
| Boundary / WS-compare / cross-import graph | — | done | manual grep (129 src→shared, 20+ shared→src edges) |

Verified live-wiring for the critical e-sign path: `src/routes/eSign.ts` → `signingService.createSigningRequest/captureInternalSignature/captureExternalSignature` → `keyManagementService`(XOR) + `timestampService`(mock TSA). Not dead code.
