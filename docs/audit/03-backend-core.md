# Audit 03 — Backend Core (middleware / database / config / utils / jobs / types / bootstrap)

**Auditor scope:** `backend/src/middleware/` (22 files + 2 schema files), `backend/src/database/` (5), `backend/src/config/` (2), `backend/src/utils/` (8), `backend/src/jobs/` (8), `backend/src/types/` (2), `backend/src/index.ts` (bootstrap/global middleware/shutdown only — route mounts covered by another auditor), backend root config (`tsconfig.json`, `package.json` scripts, `.env.example`, `.env.marketplace`, `Dockerfile`, `docker-compose.yml`, `dev.sh`).
**Files reviewed:** 52. **Date:** 2026-07-02. All paths relative to `backend/` unless noted.

---

## Domain Scores (1–10)

| Dimension | Score | Rationale |
|---|---|---|
| Readability | **7** | Consistently well-commented, intent-documented middleware; clear file headers. index.ts is overloaded with inline route logic. |
| Maintainability | **5** | Heavy duplication (4 user-type resolvers, 3 subscription caches, 2 rate-limit systems + 1 dead, 2 compression impls, name-colliding `requireResourcePermission`), ~800 lines of confirmed dead middleware. |
| Performance | **4** | Middleware chain issues 2–4 sequential uncached queries per request against a **remote** DB; blocking audit INSERTs inside `authorize()`; double audit writes; pool max 10 for the whole monolith. |
| Security | **5** | Good layering (helmet, org-scoping, redaction, magic-byte scan), but the entire auth stack fails **open** when `NODE_ENV` ≠ `'production'` (including *unset*), JWT secret has a known-constant fallback, token revocation is dead code, partner OAuth is misconfigured-broken. |
| Complexity | **6** | Individual files are reasonable; the authorization *system* (7 overlapping guard families) is the complexity hotspot. |

---

## TOP FINDINGS (by priority)

### P0-1 · BUG (root cause confirmed): `Object.setPrototypeOf(this, AppError.prototype)` in the base constructor breaks `instanceof` for EVERY AppError subclass

- **Evidence:** `src/middleware/errorHandler.ts:25` — inside `AppError`'s constructor:
  ```ts
  Error.captureStackTrace(this, this.constructor);
  Object.setPrototypeOf(this, AppError.prototype);   // ← line 25
  ```
  Subclass construction order: `new UnauthorizedError()` → object created with `UnauthorizedError.prototype` → `super()` runs → **base constructor forcibly rewrites the prototype to `AppError.prototype`**. Verified with a live Node repro of the exact class shape:
  ```
  instanceof UnauthorizedError: false
  instanceof AppError:          true
  constructor.name:             AppError
  ```
- **Why it exists:** the `setPrototypeOf` pattern is the ES5-target workaround for `extends Error`. `tsconfig.json:3` sets `"target": "ES2022"` (native classes), so the workaround is (a) unnecessary and (b) actively harmful — the correct pre-ES2015 form is `Object.setPrototypeOf(this, new.target.prototype)`, which the code got wrong by hardcoding `AppError.prototype`. It is **not** tsx/transpilation or dual-module identity — `tsx` and `tsc` both preserve class identity here; there is exactly one definition of these classes in scope (grep confirmed: only `errorHandler.ts` defines `AppError`/`UnauthorizedError`/`ForbiddenError`; the separate `ValidationError`/`NotFoundError` in `src/services/project-management/errors/index.ts:145,203` extend a different `ServiceError` base).
- **Blast radius:**
  - `src/middleware/auth.ts:340` — `if (error instanceof UnauthorizedError) return next(error);` **never matches**. Every `UnauthorizedError` thrown inside `authenticate()` (e.g. line 312 `'No authentication token provided'`, line 325 `'Token has been revoked'`) falls through into the generic catch, where in dev the fallback logs the caller in as the super_admin dev user (auth.ts:388–395). **This is exactly why the `pmk_` rejection had to be a direct `res.status(401)`** (auth.ts:285–294 — the comment "thrown AppError subclasses don't reliably satisfy instanceof under this transpilation" describes the symptom; the cause is line 25 of errorHandler, not transpilation).
  - `src/middleware/authorize.ts:427,622` — `error instanceof ForbiddenError || error instanceof UnauthorizedError` in catch blocks: never matches, so subclass errors thrown by helpers are re-wrapped (and in dev, authorize.ts:627–630 **fail-open allows the request**).
  - `src/middleware/errorHandler.ts:112` — `err instanceof AppError` still works (the rewrite lands on `AppError.prototype`), which is why status codes still come out right and the bug stayed invisible.
- **Systemic fix (one line):** delete `errorHandler.ts:25` entirely (ES2022 target needs nothing), or replace with `Object.setPrototypeOf(this, new.target.prototype);` if ES5 output must ever be supported. Then remove the workaround comment + direct-401 rationale in `auth.ts:283–287` (the direct 401 response itself can stay — it's a fine short-circuit — but the misleading comment should be corrected). Add a regression test: `expect(new UnauthorizedError('x')).toBeInstanceOf(UnauthorizedError)`.

### P0-2 · SECURITY: dev auth bypass is keyed on `NODE_ENV`, and the default is `'development'` — a single missing env var in prod = total takeover as super_admin

- **Evidence chain:**
  - `src/config/index.ts:34` — `env: process.env.NODE_ENV || 'development'` → **unset NODE_ENV means dev mode**.
  - `src/middleware/auth.ts:297–309` — no token + dev → `getDevModeUser()` loads **the first active `super_admin` from the production DB** (auth.ts:148–182) and attaches it as `req.user`.
  - `src/middleware/auth.ts:362–371, 374–384, 388–395` — expired token, invalid token, **and any other auth error** all fall back to the same super_admin user in dev. So in a misconfigured prod: any request, with or without any token, garbage or expired, becomes super_admin.
  - Compounding dev-mode fail-opens that trip simultaneously: `rateLimiter.ts:137–140` (rate limiting fully disabled), `authorize.ts:552–560` (missing policy → allow), `authorize.ts:626–630` (authorize error → allow), `authorize.ts:180–187` (**role taken from the client-supplied `x-user-role` header** in dev), `serviceAccess.ts:60–63` (subscription lookup failure → empty-but-cached pass-through), `virusScan.ts:26` (`SKIP_SCAN_IN_DEV = NODE_ENV !== 'production'` — note this is *"not production"*, so `NODE_ENV=staging` also skips).
- **Current mitigation:** `Dockerfile` production stage sets `ENV NODE_ENV=production` and `docker-compose.yml:24` defaults `NODE_ENV=${NODE_ENV:-production}` — good, but every safety net hangs off one variable, and local dev intentionally points at the **production database** (single prod DB), so "dev mode" already operates on prod data with super_admin powers and no rate limits.
- **Fix:** invert the default (`env: process.env.NODE_ENV || 'production'`), and gate the bypass on an explicit opt-in (`AUTH_DEV_BYPASS=true`) that `config` refuses to honour when `env === 'production'`. Log a loud startup banner when the bypass is armed. Consider making `getDevModeUser` use a dedicated low-privilege dev account rather than the first super_admin.

### P0-3 · SECURITY: `JWT_SECRET` falls back to the published constant `'change-this-in-production'`

- **Evidence:** `src/config/index.ts:151` — `secret: process.env.JWT_SECRET || 'change-this-in-production'`. `src/middleware/auth.ts:223,229–260` — `tryDecodeLocalJwt` verifies **any** bearer token against this secret and mints a fully-trusted `AuthenticatedUser` (including `realmRoles: [payload.role]` — attacker-chosen, e.g. `super_admin`; and `userType: payload.userType || 'staff'` — **defaults to staff**, auth.ts:255). The local-JWT path is tried whenever Keycloak verification fails (auth.ts:344–359), i.e. it is reachable on every authenticated route.
- **Impact:** if `JWT_SECRET` is ever unset/typo'd in prod, anyone can sign `{userId:<any-uuid>, role:'super_admin'}` offline and own the platform. The "required env" check (`config/index.ts:17–28`) only `console.warn`s and doesn't even include `JWT_SECRET`.
- **Fix:** in production, **throw at startup** when `JWT_SECRET` (and `DATABASE_URL`) is missing; remove the string fallback. Also change `tryDecodeLocalJwt`'s `userType` default to `'customer'` to match the least-privilege rule already applied in `enrichUserFromDb` (auth.ts:207–209).

### P1-4 · PERFORMANCE: the auth/authz middleware chain does 2–4 sequential, uncached round-trips to a remote, high-latency DB on every request

- **Per-request queries:**
  - `auth.ts:189–218` `enrichUserFromDb` — `users JOIN organizations` query on **every** authenticated request (Keycloak *and* local JWT paths; auth.ts:337,356). No cache of any kind; on the remote DB this is a fixed ~latency tax on every API call.
  - `serviceAccess.ts:162–174` — `SELECT category FROM platform_services WHERE service_key=$1` runs **uncached, per customer request**, *before* the 60s-cached subscription check. `platform_services` is near-static reference data.
  - `authorize.ts:190–203` `getUserDbInfo` — another per-request `users` query (uncached), duplicating what `enrichUserFromDb` already fetched.
  - `authorize.ts:500,538,619` — `await logAuthDecision(...)` **blocks the request** on an `audit_logs` INSERT for every allowed write action. Meanwhile `auditMutations` (mounted globally, `index.ts:199`) *also* inserts an `audit_logs` row for the same mutation on `finish` → **two audit rows + one blocking insert per write**.
  - `pmAuth.ts:241–283` `getProjectMembership` — one more query per project-scoped request (justified, but it stacks: PM route = authenticate + requireServiceAccess + project guard = 3+ sequential round-trips before the handler runs).
- **Pool sizing:** `src/database/index.ts:6–12` + `config/index.ts:62–65` — pool max **10** (default) for the entire monolith (HTTP + 8 cron jobs + schedulers + WS servers). With per-request middleware queries and a remote DB, 10 connections will queue under modest concurrency; `checkHealth` exposes `waitingCount` but nothing alerts on it.
- **Fixes (ordered by leverage):**
  1. Cache the `enrichUserFromDb` result (userId → {userType, tier}) in Redis or an in-memory TTL map (30–60s, mirroring `serviceAccess`), and reuse it from `authorize.getUserDbInfo` / `serviceAccess.resolveUserType` instead of re-querying.
  2. Load `platform_services` (key → category) once at startup with a 5-min refresh; drop the per-request query in `serviceAccess.ts:162`.
  3. Make `logAuthDecision` fire-and-forget (`void`, like `auditMutations` does at `auditMutations.ts:72`), and pick ONE audit writer per mutation.
  4. Raise `DB_POOL_MAX` (env already supported) to ~20–25 and monitor `waitingCount`.

### P1-5 · BROKEN (high confidence): partner OAuth (`partnerAuth.ts`) can never verify a token — JWKS URI and issuer are built from the realm *name*, not the realm URL

- **Evidence:** `src/middleware/partnerAuth.ts:55–61`:
  ```ts
  jwksUri: `${config.keycloak.realm}/protocol/openid_connect/certs`,
  ```
  `config.keycloak.realm` is the bare realm name (e.g. `propmetrik`), not a URL — compare the correct construction in `auth.ts:61–63` (`${keycloakConfig.authServerUrl}/realms/${config.keycloak.realm}/protocol/openid-connect/certs`). It also uses `openid_connect` (underscore) instead of `openid-connect`. And `partnerAuth.ts:105` verifies `issuer: config.keycloak.realm`, which will never equal Keycloak's issuer (`https://…/realms/<realm>`).
- **Impact:** `src/routes/ingestion.ts:33–34` applies `authenticatePartner()` + `partnerRateLimit()` router-wide, and `index.ts:209` additionally fronts the mount with `requireIngestionAuth`. Since `authenticatePartner` cannot succeed, **every `/api/v1/ingestion` request 401s even with a valid `INGESTION_API_KEY`** (the key only satisfies the outer guard). Either the ingestion API is entirely unused (dead product surface) or it has been broken silently.
- **Also:** `partnerAuth.ts:273` — `rateLimitStore` is an unbounded in-memory `Map` keyed by `req.ip` fallback (leak + not cluster-safe).
- **Fix:** rebuild the JWKS/issuer strings from `keycloakConfig.authServerUrl` exactly as `auth.ts` does — or delete the file and reuse the `jose` JWKS from `auth.ts`; replace the Map limiter with `createCustomRateLimiter` from `rateLimiter.ts` (Redis-backed, already exists).

### P1-6 · STALE VALIDATION: `ghanaRegionSchema` still lists the legacy 5 metro/cluster regions; the platform moved to 16 real regions (migration 241)

- **Evidence:** `src/middleware/validation.ts:110–116` — enum is `['greater_accra','kumasi_metro','eastern','western_cluster','northern_cluster']`. `src/config/index.ts:304–326` (`config.regions`) and the `properties` LIST partitions have 16 real regions (`ashanti`, `volta`, `bono`, …). Consumers: `pmValidation.ts:58` (`createPropertySchema.addressRegion`), `:79` (property query), `:336`.
- **Impact:** creating/filtering a PM property in `ashanti`, `volta`, etc. fails Zod validation with a 400 even though the DB supports it.
- **Fix:** derive the enum from `config.regions` (single source of truth): `z.enum(Object.values(config.regions) as [string, ...string[]])`.

### P1-7 · DEAD CODE (~800 lines, high confidence — 0 imports outside their own file, verified by grep)

| File / export | Lines | Evidence |
|---|---|---|
| `src/middleware/compression.ts` (whole file) | 313 | 0 references; `index.ts:159` uses the npm `compression` package instead. Duplicate implementation. |
| `src/middleware/requireSubscription.ts` (whole file) | 208 | 0 references to any of its 4 exports. Note all 4 **fail open** on error (`:58–61,93–96,141–144,202–205`) — do not resurrect without fixing. |
| `src/middleware/userType.ts` (whole file) | 96 | `requireUserType`/`requireStaffOnly`: 0 references (staff gating happens via `requirePlatformRoles` in auth.ts:516–540). |
| `src/middleware/tierGuard.ts` `requireTier` | 92 | 0 references — despite `serviceAccess.ts:180–182` setting `req.currentServiceTier` "for downstream `requireTier()`". Tier gating is therefore **not enforced anywhere** in this layer. |
| `auth.ts:109–117` `blacklistToken` | — | 0 callers ⇒ **token revocation is dead**: `isTokenBlacklisted` (auth.ts:324) always misses because nothing ever writes the blacklist. Logout does not revoke. (Also: cap `TOKEN_BLACKLIST_TTL=3600` at auth.ts:67 is shorter than the 7d local-JWT lifetime, config:152.) |
| `idempotency.ts:194–216` `cleanupExpiredIdempotencyRecords` | — | Comment says "run via cron/scheduler"; no job schedules it. Idempotency rows only age out via the 24h query window. |
| `compression.ts` `compressGeometryResponse`, `getCompressionStats`, `resetCompressionStats` | — | 0 callers (subsumed by whole-file deadness). |
| `authorize.ts:264–267` `getUserDbRole` | — | Marked `@deprecated`, unused. |

Recommend deleting all of the above (or wiring `requireTier` in, since the plumbing for it exists).

### P2-8 · DUPLICATION: four user-type/role resolvers, three subscription caches, two UUID regexes, two pagination schemas, and a middleware name collision

- **user_type/role resolution (all query `users` independently):** `auth.ts:189` `enrichUserFromDb`; `serviceAccess.ts:74` `resolveUserType` + `serviceAccess.ts:216` `resolveUserRoleAndType`; `userType.ts:25` `resolveUserType` (dead); `authorize.ts:178` `getUserDbInfo`. Consolidate into one cached resolver.
- **Customer-subscription caches:** `serviceAccess.ts:21` `subscriptionCache` (60s TTL, checks `expires_at`, serviceAccess.ts:46–47) vs `authorize.ts:23` `customerSubCache` (60s TTL, **does NOT check `expires_at`** — authorize.ts:239–243, so an expired subscription still authorizes actions for up to a minute *and* forever after via re-query) vs `serviceAccess.ts:332` `orgServiceCache`. Behavioural inconsistency, duplicated invalidation helpers (`clearServiceAccessCache`, `clearCustomerSubCache`, `clearOrgServiceCache`). TTLs (60s) are otherwise sensible for the remote-DB tradeoff; Maps are unbounded but keyed on active users — acceptable, add a max-size sweep if user count grows.
- **Name collision:** `requireResourcePermission` is exported by BOTH `auth.ts:470` (owner-based) and `authorize.ts:394` (org-based) with different semantics. An import from the wrong module silently changes the security model.
- **Two JWKS stacks:** `jose`/`createRemoteJWKSet` (auth.ts:61 — cached, correct) and `jwks-rsa` (partnerAuth.ts:55 — broken). Two JWT libs (`jose` + `jsonwebtoken`) where one would do.
- **Misc:** UUID regex duplicated at `pmAuth.ts:16` and `auditMutations.ts:22` (plus `uuidSchema` in validation.ts:88); pagination schema duplicated (`validation.ts:91` `paginationSchema` vs `pmAuth.ts:115` `pmPaginationQuery`); `getAuthUserId`/`getAuthOrgId` live in `pmAuth.ts:78–96` but are used platform-wide — misplaced, should be in an auth util.

### P2-9 · CORRECTNESS: `database/index.ts` `getClient()` force-releases a checked-out client after 30s — poisons long transactions

- **Evidence:** `src/database/index.ts:75–78` — a `setTimeout(…, 30000)` calls `client.release()` while the caller may still be mid-transaction; the caller's own `finally { client.release() }` (`:107`) then double-releases. A >30s migration or bulk sweep gets its connection yanked (possibly returned to the pool **with an open transaction**, corrupting the next borrower's session state).
- **Fix:** log-only on timeout (don't release), or use `pg`'s `idle_in_transaction_session_timeout` / `statement_timeout` server-side. Note `migrate.ts:107` runs whole migration files through this `transaction()` helper — big migrations are the most likely victims.

### P2-10 · SECURITY (grab-bag, ordered)

1. **Token in query string** — `auth.ts:84–88` accepts `?token=` on *every* route (justified only for SSE). Tokens leak into access logs, proxies, and Referer headers. Scope the fallback to `/realtime` paths.
2. **`X-User-Id` / `X-Organization-Id` in CORS allow-list** — `index.ts:154`. `pmAuth.ts:77` explicitly documents that header fallbacks are "a security hole", yet the headers are still invited through CORS. Also `authorize.ts:183` trusts client `x-user-role` in dev. Remove from `allowedHeaders` unless something still needs them.
3. **OpenSearch TLS verification disabled unconditionally** — `src/database/opensearch.ts:12–14` `rejectUnauthorized: false` ("for self-signed certs in development") applies in production too.
4. **ClamAV fail-open in production** — `virusScan.ts:214–225`: daemon unreachable ⇒ upload passes with only a warning. Deliberate availability tradeoff, but should be an explicit env choice (`VIRUS_SCAN_REQUIRED=true`). Also `SKIP_SCAN_IN_DEV` is `NODE_ENV !== 'production'` (`virusScan.ts:26`), and `readFileHead` uses sync fs in the request path (`virusScan.ts:63–69`, minor).
5. **`ingestionAuth.ts:19`** — API-key comparison is `===` (not `crypto.timingSafeEqual`); low practical risk, cheap fix.
6. **No timeout guards on the HTTP server** — `index.ts:999–1000` sets `headersTimeout = 0` and `requestTimeout = 0` **globally** to keep SSE alive, removing slowloris protection for every route. Prefer per-route socket handling or a high-but-finite value with `server.on('connection')` exemptions for realtime paths.
7. **Tracked env file** — `.env.marketplace` is committed (git ls-files). Contents are placeholders (plus default `admin`/`admin` OpenSearch creds), so severity is low, but it violates the `*.env` ignore intent; `.env`/`.env.production` with real secrets are present locally but correctly gitignored.
8. **`requestId.ts:21`** accepts arbitrary client-supplied `X-Request-ID` (log-injection/correlation-spoof vector; validate/regenerate if non-UUID).
9. **Global rate limiter is IP-keyed only** — `rateLimiter.ts:69–83`'s user-ID branch can never fire because the limiter is mounted (`index.ts:194`) *before* any authentication runs; all authed traffic behind a shared NAT shares one bucket. Also `selectRateLimiter` matches by `path.includes()` substrings (`rateLimiter.ts:88–108`), so `/api/v1/anything/search-history` gets search limits.

### P2-11 · CONFIG: good central config, undermined by non-fatal validation and a few stragglers

- `config/index.ts:17–28` — "required" env validation only `console.warn`s. `DATABASE_URL!`, `DB_PASSWORD!`, `OPENSEARCH_PASSWORD!`, `CLICKHOUSE_URL!` (`:55,60,89,133`) assert non-null over values that may be undefined → runtime `undefined` propagates instead of failing fast.
- Stragglers reading `process.env` directly instead of config: `index.ts:360` (`FRONTEND_URL`), `:368` (`API_URL`), and **`index.ts:1065`** `buildTransmittalAckPage` uses `process.env.APP_URL || 'http://localhost:4000'` — if `APP_URL` is unset in prod, transmittal acknowledgement pages render **download links pointing at localhost** (real bug; `config.app.url` already exists and defaults correctly). Others: `virusScan.ts:23–25`, `ingestionAuth.ts:17`, `sentry.ts:19–22`, `errorHandler.ts:164` (uses `process.env.NODE_ENV` directly while the rest of the file's siblings use `config.env` — cosmetic inconsistency).
- `config/index.ts:186` — prod CORS default still includes the dead `https://app.propmetrik.com` origin (harmless, stale).
- `config/index.ts:209` — `WHATSAPP_WEBHOOK_VERIFY_TOKEN` hardcoded default `'propmetrik_webhook_2024'` (a guessable webhook verify token if env unset).

### P3-12 · Bootstrap / shutdown / index.ts (non-mount concerns)

- **Middleware order is correct**: Sentry init (`:136`) → `trust proxy` (`:139`) → helmet (`:144`) → CORS (`:150`) → compression with SSE exclusion (`:159–165`) → body parsing 10 MB (`:168–169`) → requestId (`:172`) → pino-http (`:175`) → rate limiter (`:194`) → auditMutations (`:199`) → routes → 404 (`:803`) → Sentry error handler (`:813`) → errorHandler (`:816`). Two nits: requestId comes *after* CORS/compression so early rejections lack an ID; the global rate limiter runs pre-auth (see P2-10.9).
- **~260 lines of inline route handlers in the bootstrap file** — PM-invoice public endpoints (`index.ts:227–489`) and transmittal public endpoints (`:696–742`) plus a 40-line HTML template helper (`:1056–1093`) belong in routers. They also swallow errors into generic 500s without logging in two places (`:282–284`, `:711–713`).
- **Graceful shutdown** (`index.ts:819–863`): closes analytics WS → HTTP (3s force-resolve `:834`) → realtime → Data Hub queues → PG pool → Redis → Sentry flush. Gaps: node-cron tasks, `scrapyScheduler`, `economicDataScheduler`, `autopilotScheduler`, `analyticsScheduler`, and `workspaceWebSocketServer` are never stopped; `file-upload.ts:186`'s `setInterval` is unref'less. Mostly harmless at `process.exit(0)`, but in-flight cron DB work can die mid-write after `pool.end()`.
- **`uncaughtException` handler exits without flushing Sentry or draining the pool** (`index.ts:973–976`); `unhandledRejection` (`:979`) logs but does **not** exit — inconsistent policy.
- **EADDRINUSE retry** (`index.ts:1035–1051`) — reasonable; note `bootstrap()` intentionally never kills the process on dependency failure (`:959–964`, "stays alive for diagnostics") — fine given the startup report, but `/health/ready` should reflect `overallStatus` (startupReport supports this via `getStartupReport`).

### P3-13 · Jobs (`src/jobs/`) — generally clean; small items

- Overlap guards (`running` flag) present in `analyticsRefreshJob.ts:41`, `contributionProcessorJob.ts:19`, `dataHubSyncJob.ts:24` — good pattern; **absent** in `rentReminderJob`, `crmTaskReminderJob`, `subscriptionRenewalJob`, `kobbyAIMonitor`, `whatsappDigest` (daily cadence → low risk, but a hung DB call could stack).
- No `timezone` option on any `cron.schedule` — schedules are server-TZ-dependent (matters if hosts differ: Oracle vs Hetzner).
- `whatsappDigest.ts:30–50` — unbounded 4-way join over all workspace messages (no `LIMIT`, no created_at window); will get slow as messages grow.
- `rentReminderJob.ts:22–27` / `crmTaskReminderJob.ts:21–24` — reminder ladders hardcoded (fine as defaults; constructors accept overrides that nothing passes).
- All jobs correctly funnel through `logger`; CLI runner blocks (`require.main === module`) are a nice touch.

---

## FILE-BY-FILE

### middleware/ (22 + 2 schemas)

| File | Purpose | Issues | Priority |
|---|---|---|---|
| `analyticsApiAccess.ts` (246) | Dual-auth gate (pmk_ API keys OR session) for analytics/short-stay | Well designed (path-derived product, no-op re-entry flag `:129`, metering on finish `:238`). Rate limit fails open on Redis outage `:113–116` (deliberate, documented). Two `expire` round-trips per request `:103–104` (use `SET NX EX` or pipeline). `orgHasService` adds up to 3 queries on cache miss. | P3 |
| `auditMutations.ts` (97) | Global mutation → `audit_logs` writer | Fire-and-forget (good). JSON stringify twice per body (`:29`,`:38`). Duplicates `authorize.logAuthDecision` writes (P1-4). UUID regex duplicate `:22`. | P2 |
| `auth.ts` (543) | Keycloak + local JWT authentication, role guards | **P0-1 victim** (`:340`), **P0-2 dev bypass** (`:297,362,376,388`), **P0-3 local-JWT** (`:229`), dead `blacklistToken` (`:109`), revocation TTL cap < token life (`:67`), query-param token (`:84`), `enrichUserFromDb` per-request query (`:198`), staff-default in `tryDecodeLocalJwt` (`:255`). JWKS via `jose` is cached & correct (`:61`). | **P0** |
| `authorize.ts` (643) | DB-policy-driven RBAC + customer service roles | Blocking `await logAuthDecision` (`:500,538,619`); per-request `getUserDbInfo` query (`:191`); dev fail-opens (`:124,181,553,627`); duplicate sub cache w/o `expires_at` (`:239`); `instanceof` victims (`:427,622`); name-collides `requireResourcePermission` (`:394`) with auth.ts:470; dynamic table interpolation in `checkAssignment`/`checkOwnership` is allow-listed via `RESOURCE_TABLE_MAP` (safe) but fails **open** on query error (`:307,326`). Policy cache 5 min TTL (`:20`) reasonable. | **P1** |
| `compression.ts` (313) | Custom gzip/brotli middleware | **DEAD** — npm `compression` used instead (index.ts:159). Buggy anyway (`res.json` override drops status-code chaining, stats object never updated). Delete. | P1 (delete) |
| `errorHandler.ts` (181) | AppError hierarchy + global handler | **P0-1 root cause `:25`**. Handler itself is solid (Zod/JWT/SyntaxError mapping `:117–134`, detail gating `:164`). `process.env.NODE_ENV` direct read `:164`. | **P0** |
| `file-upload.ts` (186) | Multer config for CSV/Excel/PDF | Module-load side effects: mkdir (`:17`) + un-unref'd hourly `setInterval` (`:186`). `UPLOAD_DIR` under `__dirname` → lands in `dist/` in Docker (`:16`); 50 MB limit here vs 10 MB `config.upload.maxFileSize` — two sources of truth (`:39` vs config:165). | P3 |
| `idempotency.ts` (215) | Idempotency-Key support for ingestion | Sound design; `requestHash` computed but never persisted/compared (`:84–87` — conflict detection actually uses a size heuristic `:117`, hash is dead weight); cleanup fn never scheduled (`:194`). Behind the broken partner auth (P1-5) so currently unreachable. | P2 |
| `index.ts` (5) | Barrel | Re-exports only 5 of 22 modules — misleadingly partial. | P3 |
| `ingestionAuth.ts` (30) | x-api-key OR session guard | `===` compare (`:19`); direct `process.env` read (`:17`). Fine otherwise. | P3 |
| `partnerAuth.ts` (332) | OAuth2 client-credentials partner auth | **P1-5 broken JWKS/issuer (`:56,105`)**; in-memory unbounded rate limiter (`:273`); duplicate JWKS stack. | **P1** |
| `pmAuth.ts` (500) | PM auth helpers + project-scoped access | The best-engineered file in the domain (allow-listed child tables `:377`, org-scoped membership `:246`, explicit no-header-fallback policy `:77`). Issues: platform-wide `getAuthUserId`/`getAuthOrgId` live here (`:78–96`, misplaced); `requireProjectAccess` silently defers when no project id resolvable (`:304–307` — documented, but a fail-open-by-omission pattern); membership query per request (necessary). | P3 |
| `pmProjectValidation.ts` (581) | Zod schemas for PM/projects | Schemas only; consistent. Dual date format union (`:38–39`) repeated many times — extract helper. | P3 |
| `pmValidation.ts` (647) | Zod schemas for property management | **Uses stale 5-region `ghanaRegionSchema` (`:58,79,336`) — P1-6.** Otherwise consistent. | **P1** |
| `rateLimiter.ts` (198) | Redis rate limiting (rate-limiter-flexible) | Disabled wholesale in dev (`:137`); user-key branch unreachable at global mount (`:71`); substring path matching (`:91–103`); Redis error fails open (`:163–166`, deliberate). Configs hardcoded (`:15–46`) while `config.rateLimit` (config:157–161) exists and is **unused** — two config sources, one dead. | P2 |
| `requestId.ts` (27) | X-Request-ID | Trusts client header (`:21`). | P3 |
| `requireSubscription.ts` (208) | Plan/module/usage gating | **DEAD** (0 refs) and every guard fails open on error. Delete or fix+wire. | P1 (delete) |
| `serviceAccess.ts` (418) | Per-service customer gating + org entitlement | 60s caches OK; **uncached `platform_services` category query per request (`:162`)**; `resolveUserType` defaults to `'staff'` on missing user/error (`:83,94` — privilege-UP default, inconsistent with auth.ts's least-privilege fix); `ROLE_SERVICE_ACCESS` map rebuilt per call (`:123–145`, move to module scope); dev fail-open caches an empty entry (`:60–67` — a transient DB error denies a customer for 60s in prod: empty set cached). | P2 |
| `tierGuard.ts` (92) | Minimum-tier gate | **DEAD** (0 refs) — tier gating unenforced; `getOrganizationTier` uncached. Wire in or delete. | P1 |
| `userType.ts` (96) | staff/customer gate | **DEAD** (0 refs); WeakMap-per-request cache was a nice idea. Delete. | P1 (delete) |
| `validation.ts` (565) | Zod validate() + shared schemas | **Stale `ghanaRegionSchema` (`:110`) — P1-6.** `validate()`/`validateRequest()` are clean; common schemas good. | **P1** |
| `virusScan.ts` (302) | Magic-byte + ClamAV scan | Fail-open when daemon down incl. prod (`:214`); `SKIP_SCAN_IN_DEV` = `!production` (`:26`); sync fs head-read (`:63`); `.svg` passes with no signature check (`:47` — SVG can carry scripts; consider content sniffing). Solid magic-byte + dangerous-signature lists otherwise. | P2 |
| `schemas/crm.schemas.ts`, `schemas/propertyManagement.schemas.ts` | Zod schemas for CRM/PM routes | Used by `src/routes/crm/*` (verified). Not deeply audited (schema content); no middleware logic. | P3 |

### database/ (5)

| File | Purpose | Issues | Priority |
|---|---|---|---|
| `index.ts` (173) | pg Pool + query/transaction helpers | **30s force-release timeout in `getClient` (`:75–78`) — P2-9**; pool max 10 default; slow-query threshold 100 ms hardcoded (`:17`, sane for remote DB); good error logging with pg codes (`:53–62`). | P2 |
| `migrate.ts` (217) | SQL-file migration runner | **Checksum validation commented out (`:89–98`)** — "re-enable in production" never happened; drift after edit goes undetected (relevant given the memory-documented 28-behind incident). Rollback is record-delete only (`:145–150`, documented). | P2 |
| `minio.ts` (352) | S3/MinIO client + buckets | Null-cast client when unconfigured (`:34` `null as unknown as S3Client` — downstream calls crash with confusing TypeErrors instead of a clear guard); CORS rules reuse `config.cors.origins` (good). | P3 |
| `opensearch.ts` (440) | OpenSearch client + index mappings | **`rejectUnauthorized: false` unconditionally (`:12–14`)**; `OPENSEARCH_PASSWORD!` non-null assertion (config:89) on an optional var. | P2 |
| `redis.ts` (295) | 4 ioredis clients + cache/session/pubsub helpers | `cache.delPattern` uses blocking `KEYS` (`:121`) and would double-prefix on `del` due to ioredis `keyPrefix` (`:16`) — **currently 0 callers**, so latent only; `pubsub.subscribe` duplicates a connection per call with no unsubscribe (`:218–226` — leak if used repeatedly); all 4 "databases" are DB 0 by design (documented, config:75–82); graceful degradation on cache ops is good. | P2 |

### config/ (2)

| File | Purpose | Issues | Priority |
|---|---|---|---|
| `index.ts` (341) | Central env config | **Warn-only required-env check (`:24–28`); `JWT_SECRET` constant fallback (`:151`) — P0-3; dev-default env (`:34`) — P0-2**; non-null assertions on optional envs (`:55,60,89,133`); hardcoded WhatsApp verify-token default (`:209`); stale prod CORS origin (`:186`); otherwise a model of centralization (envSelect/financeSelect helpers, per-integration blocks). | **P0** |
| `sentry.ts` (133) | Sentry APM init | Clean; header scrubbing (`:63–70`), PII off (`:60`). `setUser` exported but `authenticate` never calls it (`:120` — dead-ish, or missed wiring). | P3 |

### utils/ (8)

| File | Purpose | Issues | Priority |
|---|---|---|---|
| `logger.ts` (162) | pino setup + helpers | Redaction paths only cover top-level keys (`:35–45` — nested `body.password` etc. not redacted; auditMutations does its own deep redact, but pino-http request logging relies on these); `createRequestLogger` (`:62`) appears unused (index.ts builds pinoHttp with the main logger). | P3 |
| `startupReport.ts` (96) | Bootstrap step diagnostics | Clean, no issues. Exposed via `/health/startup`. | — |
| `dateFormat.ts` (47) | Ghana dd/mm/yyyy formatting | Clean. | — |
| `pdfReportKit.ts` (500) | Shared PDFKit building blocks | Brand colors hardcoded by design; no hot-path/sync-fs issues (grep-verified: zero sync fs in utils/). | — |
| `invoicePdfGenerator.ts` (260) | Invoice PDF | Fine; buffer-based. | — |
| `changeOrderPdfGenerator.ts` (201) | Change-order PDF | Fine. | — |
| `pmDocumentPdfGenerators.ts` (184) | PM doc PDFs | Fine. | — |
| `propertyMapper.ts` (435) | Property format conversions | Pure mapping; no issues found at audit depth. | — |

### jobs/ (8)

| File | Purpose | Issues | Priority |
|---|---|---|---|
| `analyticsRefreshJob.ts` (102) | Daily analytics recompute (02:30 + startup) | Overlap guard ✓; hardcoded region/type matrices (`:33–34`, acceptable); no cron timezone. | P3 |
| `contributionProcessorJob.ts` (58) | Hourly contribution drain | Clean; overlap guard ✓. | — |
| `crmTaskReminderJob.ts` (160) | Daily CRM task reminders | No overlap guard; hardcoded ladder (`:21`). | P3 |
| `dataHubSyncJob.ts` (64) | 30-min CRM→properties sync | Clean; overlap guard ✓. | — |
| `kobbyAIMonitor.ts` (94) | Daily workspace anomaly sweep | Sequential per-workspace AI calls — slow at scale but daily; `catch(console.error)` bypasses logger (`:90`). | P3 |
| `rentReminderJob.ts` (348) | Daily rent reminders + late fees | No overlap guard; hardcoded ladders (`:22–27`). | P3 |
| `subscriptionRenewalJob.ts` (40) | Daily renewal sweep | Clean; no overlap guard (daily, low risk). | — |
| `whatsappDigest.ts` (98) | Daily unread digests | Unbounded message join (`:30–50`); no overlap guard. | P3 |

### types/ (2)

| File | Purpose | Issues | Priority |
|---|---|---|---|
| `floorPlanDesign.ts` (711) | Floor-plan/LLM design types | Type-only; no issues at audit depth. Note `tsconfig` `typeRoots` includes `./src/types` (`tsconfig:30`) — these aren't ambient declaration packages, so that entry is a no-op/misconfiguration (harmless). | P3 |
| `property-management.types.ts` (886) | PM domain types | Type-only; fine. | — |

### index.ts (bootstrap scope) + root config

| File | Purpose | Issues | Priority |
|---|---|---|---|
| `src/index.ts` (1093) | App bootstrap, global middleware, shutdown | See P3-12: inline public route handlers (`:227–489,696–742`), `APP_URL` localhost fallback in prod HTML (`:1065`), global `requestTimeout=0` (`:999–1000`), shutdown doesn't stop cron/schedulers/WS, `uncaughtException` policy inconsistent (`:973–984`). Order of global middleware otherwise correct. | P2 |
| `tsconfig.json` | TS config | ES2022 target (makes P0-1's workaround harmful); strict ✓; `paths` aliases defined but code uses relative imports (unused feature); `typeRoots` oddity above. | P3 |
| `package.json` (scripts) | Scripts | Sane; `dev` → `dev.sh` (tsx watch), `migrate` via ts-node ✓; both `bcrypt` and `bcryptjs` in deps and `@types/*` in prod dependencies (`:41–43` — hygiene, out of scope for full dep audit). | P3 |
| `.env.example` | Env template | Placeholders only ✓; documents the required vars well. | — |
| `.env.marketplace` | Tracked env file | Committed to git; placeholder-only + default `admin/admin` OpenSearch creds. Untrack for hygiene (P2-10.7). | P3 |
| `Dockerfile` | Multi-stage build | Good: non-root user, dumb-init, healthcheck, Alpine-chromium note, NODE_ENV=production pinned. Nit: `EXPOSE 3000`/`PORT=3000` vs app default 4000 (config:37) — relies on env override; healthcheck hits `:3000` consistent with ENV. | P3 |
| `docker-compose.yml` | Service stack | `NODE_ENV:-production` default ✓; `coolify` external network documented (matches the Traefik-504 incident learning). | — |
| `dev.sh` | Dev launcher | `pkill -9`/`kill -9` by port — blunt but dev-only; fine. | — |

---

## CROSS-FILE PATTERNS

1. **`NODE_ENV === 'development'` as a security switch** (8+ sites across auth, authorize, serviceAccess, rateLimiter, virusScan, migrate) — one env var toggles authentication, authorization, rate limiting, virus scanning, and migration checksum integrity simultaneously. Combined with the `'development'` default and the shared prod DB, this is the domain's defining risk. Centralize into explicit, individually-named feature flags validated at startup.
2. **Fail-open vs fail-closed is inconsistent and undocumented per guard.** Fail-open: requireSubscription (all), authorize dev paths, checkAssignment/checkOwnership on error, apiAccess rate limit, ClamAV. Fail-closed: orgHasService, checkCustomerSubscription, enrichUserFromDb (`customer` default). `serviceAccess.resolveUserType` fails open **to `'staff'`** (`serviceAccess.ts:83,94`) — the single worst default in the set.
3. **Per-request DB lookups instead of a per-user cache** — the same `users` row is fetched up to 3× per request by different middleware (auth → authorize → serviceAccess). One cached resolver would eliminate the majority of middleware DB traffic (remote-DB tax).
4. **Parallel guard families with overlapping mandates:** `requireRoles`/`requirePlatformRoles` (auth), `authorize()` (policy DB), `requireServiceAccess`/`requireServiceRole` (serviceAccess), `requirePMAccess`/`requireProjectAccess` (pmAuth), plus three dead ones (tierGuard, userType, requireSubscription). Seven active systems; a new route author cannot know which to use. Needs an authz decision doc + deletion of the dead three.
5. **Dead "enterprise" middleware suggests abandoned initiatives** — custom compression, subscription gating, tier gating, partner OAuth (broken), idempotency cleanup — all fully built, none wired (or wired but non-functional). Delete or finish; half-present security machinery is worse than absent.
6. **Config discipline is good but not enforced** — `config/index.ts` centralizes ~95% of env access; the remaining direct reads (`APP_URL` in index.ts:1065 especially) are where the bugs are.

---

## COVERAGE LEDGER

| Area | Files | Status |
|---|---|---|
| `src/middleware/` | analyticsApiAccess, auditMutations, auth, authorize, compression, errorHandler, file-upload, idempotency, index, ingestionAuth, partnerAuth, pmAuth, pmProjectValidation, pmValidation, rateLimiter, requestId, requireSubscription, serviceAccess, tierGuard, userType, validation, virusScan | **22/22 read in full** (pmValidation/pmProjectValidation: headers + schema spot-checks + grep sweep) |
| `src/middleware/schemas/` | crm.schemas.ts, propertyManagement.schemas.ts | Usage verified (routes/crm/*); content not line-audited (schema-only) |
| `src/database/` | index, migrate, minio, opensearch, redis | **5/5** (minio/opensearch: head + targeted greps; index/migrate/redis full) — `seeds/` dir out of scope |
| `src/config/` | index, sentry | **2/2 full** |
| `src/utils/` | changeOrderPdfGenerator, dateFormat, invoicePdfGenerator, logger, pdfReportKit, pmDocumentPdfGenerators, propertyMapper, startupReport | **8/8** (logger/startupReport/dateFormat full; 4 PDF generators + propertyMapper: heads + sync-fs/env grep sweep — pure generators, no middleware/hot-path exposure) |
| `src/jobs/` | analyticsRefreshJob, contributionProcessorJob, crmTaskReminderJob, dataHubSyncJob, kobbyAIMonitor, rentReminderJob, subscriptionRenewalJob, whatsappDigest | **8/8** (rentReminder/crmTaskReminder: first ~80 lines + structure; rest full) |
| `src/types/` | floorPlanDesign, property-management.types | Presence + nature verified (type-only); not line-audited |
| `src/index.ts` | bootstrap, global middleware order, error handling, shutdown, inline public routes | **Full read** (route-mount list itself deferred to auditor 02) |
| Root config | tsconfig.json, package.json, .env.example (redacted scan), .env.marketplace (redacted scan), Dockerfile, docker-compose.yml (key sections), dev.sh | **All reviewed**; `.env`/`.env.production` checked for git tracking only (properly ignored), contents not read |
| Dynamic verification | `instanceof` repro executed in Node against the exact class shape; git tracking of env files verified; dead-code claims verified by project-wide grep of every export | Done |

*Not modified: zero source files touched; this report is the only artifact.*
