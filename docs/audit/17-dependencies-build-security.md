# Audit 17 — Dependencies, Build Config, Security & Repo Hygiene

**Scope:** monorepo root `/Users/kobby/github/Cedyn Group/propmetrik` (npm workspaces + Turbo). `backend/` (Express+TS), `frontend/` (Next.js 15), Python valuation engine + ml-serving + scrapy.
**Method:** read-only. `package.json` (root/backend/frontend), `next.config.js`, both `tsconfig.json`, Dockerfiles, `.gitignore`, `git ls-files`, `git grep`. No files modified, no installs/builds run.

## Scores (1–10)

| Area | Score | Rationale |
|---|---|---|
| Dependency health | 6/10 | Some real duplication (bcrypt+bcryptjs, openai+@anthropic, docx stack); most versions `^`-ranged (normal); heavy client libs mostly NOT dynamically imported |
| Build config | 6/10 | Rewrite contract correct; but `eslint.ignoreDuringBuilds: true`; inconsistent Node engines (18 vs 20 vs 22); no CSP/security headers |
| Secrets hygiene | 9/10 | No production secrets committed; only `.example`/`.marketplace` placeholder envs tracked; `.gitignore` covers env/venv/keys/models |
| Test coverage | 4/10 | 47 test files, all backend; **zero** frontend tests; no coverage gate in CI |
| Repo hygiene | 5/10 | 95M of PDFs/PNGs under `docs/how-to-guide` + 49M duplicated into `frontend/public/guides`; 86 TODO/FIXME; 167 backend console.* lines despite pino logger |

---

## Top Findings by Priority

### CRITICAL
_None._ No committed production secrets, no tracked private keys, no tracked `.venv`/model binaries.

### HIGH

**H1 — ESLint disabled during builds.** `frontend/next.config.js:17-19` sets `eslint.ignoreDuringBuilds: true`, so lint errors never block a production build. (Note: TypeScript `ignoreBuildErrors` is NOT set — type errors still fail the build, which is good.)
*Fix:* remove `ignoreDuringBuilds` and fix outstanding lint errors, or scope it to warnings only. At minimum keep `next lint` green in CI (there is no frontend CI job today — see H4).

**H2 — Duplicate crypto/hashing libraries: `bcrypt` + `bcryptjs`.** `backend/package.json:46-47` ships both `bcrypt@^6.0.0` (native) and `bcryptjs@^2.4.3` (pure-JS), plus both `@types`. Two hashing impls risk inconsistent cost factors / hash formats across code paths.
*Fix:* pick one (`bcrypt` native for perf, or `bcryptjs` for portability), migrate call sites, drop the other + its `@types`.

**H3 — No CSP / security headers in Next config.** `frontend/next.config.js:70-104` only sets caching + content-type headers — no `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`, `X-Content-Type-Options`, or `Referrer-Policy`. Backend uses `helmet` but the Next-served frontend origin is unprotected.
*Fix:* add a `headers()` block with a baseline CSP (allow `s3.cedynhq.com`, mapbox, self) + HSTS + frame/nosniff.

**H4 — No frontend CI, no test/coverage gate.** Only `.github/workflows/backend-ci.yml` and `python-images.yml` exist. Frontend has no build/lint/type-check pipeline, and there is no coverage threshold anywhere. Combined with H1, frontend regressions can ship unchecked.
*Fix:* add a frontend workflow (`next build` + `tsc --noEmit` + `next lint`); add `--coverage` gate to backend job.

### MEDIUM

**M1 — Heavy client libraries statically imported (bundle bloat).**
- `framer-motion` imported in **63** `frontend/src` files — large, mostly static.
- `recharts` in **14** files, static.
- `konva`/`react-konva` in 5 floor-plan components; only the *page* wrapper `.../floor-plan/page.tsx:28` is `dynamic()` — the Konva components themselves aren't independently lazy.
- `mapbox-gl` + `react-map-gl` imported statically in `frontend/src/app/properties/[id]/_components/ZoneMap.tsx:4-5` and `admin/integrations/page.tsx` — no `dynamic(..., { ssr:false })`.
- `pdfjs-dist`, `jspdf`, `html2canvas` present in deps but 0 direct `from` imports found — verify they're actually used or drop them.
Only **3** files use `next/dynamic` total.
*Fix:* lazy-load Konva/mapbox/recharts-heavy routes with `dynamic(..., { ssr:false })`; run `@next/bundle-analyzer` to confirm; prune unused pdf libs.

**M2 — Inconsistent Node engine targets.** Root `package.json` `engines.node: ">=18"`; `backend/package.json:135` `">=20"`; `backend/Dockerfile` `node:20-alpine`; `frontend/Dockerfile` `node:22-alpine`. Three different majors. No `.nvmrc`/`.node-version`.
*Fix:* standardize on one LTS (20 or 22), align all `engines`, both Dockerfiles, and add `.nvmrc`.

**M3 — AI / PDF / DOCX SDK stacking.** Backend carries both `openai@^6` and `@anthropic-ai/sdk@^0.32` (dual LLM — likely intentional but confirm both are wired). PDF: `pdf-lib` + `pdf2json` + `pdfkit` + `puppeteer` (4 PDF-ish tools). DOCX: `docx` + `docxtemplater` + `docxtemplater-image-module-free` + `pizzip`. Each has a legitimate niche but the surface is large.
*Fix:* document which library owns which job; drop any that a single tool can cover.

**M4 — Large binary docs committed & duplicated.** `docs/how-to-guide` = **95M** of tracked PDFs/PNGs (e.g. `docs/how-to-guide/pdf/01-authentication.pdf` ~14.8M), and the screenshot set is **duplicated** into `frontend/public/guides` (**49M**) — same PNGs tracked twice. Bloats every clone.
*Fix:* serve guide assets from S3/MinIO (already the pattern per project notes) and git-ignore the local copies, or move to Git LFS; de-duplicate the two screenshot trees.

### LOW

**L1 — `console.*` in backend despite pino logger.** 167 `console.*` lines (74 `console.log`) across `backend/src`. Should route through the pino logger for structured/leveled output.

**L2 — TODO/FIXME/HACK density.** 86 markers across `backend/src` + `frontend/src`. Triage into issues.

**L3 — `@types/*` runtime placement.** `backend/package.json:41-43` lists `@types/bcrypt`, `@types/markdown-it`, `@types/ws` under `dependencies` (should be `devDependencies`). Cosmetic — doesn't ship at runtime for a compiled TS server, but inflates the prod dependency set.

**L4 — `caniuse-lite` pinned as a direct dep.** `frontend/package.json:62` — normally a transitive dep of browserslist; pinning it directly can drift from the resolved version.

---

## Dependency Duplication Table

| Job | Libraries present | Location | Verdict |
|---|---|---|---|
| Password hashing | `bcrypt` + `bcryptjs` (+ both @types) | backend:46-47,99 | **Consolidate (H2)** |
| LLM SDK | `openai` + `@anthropic-ai/sdk` | backend:34,79 | Dual-provider — confirm both used |
| PDF generation/parse | `pdf-lib`, `pdf2json`, `pdfkit`, `puppeteer` | backend:80-82,88 | Large surface; distinct niches |
| DOCX | `docx`, `docxtemplater`, `docxtemplater-image-module-free`, `pizzip` | backend:52-54,87 | Template vs generate — OK, document |
| PDF (frontend) | `pdf-lib`, `pdfjs-dist`, `jspdf` | frontend:81-82,72 | jspdf/pdfjs show 0 `from` imports — verify/drop (M1) |
| Date | `date-fns` only (no moment/dayjs) | frontend:66 | **Clean** — single date lib |
| HTTP client | `axios`(+retry) backend; native fetch frontend | backend:44-45 | Clean |
| Charts | `recharts` only | frontend:94 | Clean (single) |
| Signature | `react-signature-canvas` + `signature_pad` | frontend:93,96 | Related (wrapper+core) — OK |

## Secrets / Env Findings (masked)

| Item | File:line | Assessment |
|---|---|---|
| Tracked env files | `git ls-files | grep env` → `backend/.env.example`, `backend/.env.marketplace`, `frontend/.env.marketplace`, `blockchain/.env.example`, scrapy/python `.env.example` | **All placeholders** — values are `your_..._here`, `admin`, `smtp.gmail.com`. No real secrets. |
| CI DB URL | `.github/workflows/backend-ci.yml:139,146` | `postgresql://propmetrik_test:test_****@localhost` — ephemeral CI test creds, acceptable |
| Deploy template | `backend/scripts/deploy/oracle-cloud-setup.sh:349` | `...:CHANGE_ME@...` placeholder — fine |
| Python dev default | `backend/src/services/valuation-engine/python/app/config.py:31` | `postgresql://propmetrik:pro****@localhost` local dev fallback — acceptable but prefer env-only |
| JWT literal | `frontend/.../PullIntegrationsPanel.tsx:276` | `eyJ...` is an input **placeholder** string, not a real token |
| Real committed secret count | — | **0** |

`.gitignore` correctly covers `.env*`, `venv/.venv/__pycache__`, `node_modules`, `*.pem/*.key/*.p12`, `models/`, `*.pkl/*.joblib/*.h5`. No tracked `.venv`, `site-packages`, or model binaries (ml-serving is source-only).

## Build-Config Findings

- **Rewrite contract intact:** `next.config.js:42-68` — `/api/auth/*` excluded, `/ml-api/*`→Python, `/api/public/*` and `/api/guides/*` special-cased, catch-all `/api/*`→`${INTERNAL_API_URL}/api/v1/*`. Matches documented contract.
- **Images:** only `s3.cedynhq.com` (+ localhost in dev) allowlisted — tight, good.
- **`output: 'standalone'`** + webpack aliases for pdfjs/porto/wagmi optional deps — reasonable.
- **`eslint.ignoreDuringBuilds: true`** (H1). TS errors NOT ignored (good).
- **tsconfig:** both `strict: true`. Backend has rich path aliases + decorators; frontend `moduleResolution: bundler`, `target ES2017`. Solid.
- **Dockerfiles:** 7 tracked (backend, frontend, ml-serving, scrapy, python engine, e-sign-ui). Multi-stage backend (node:20-alpine), frontend node:22-alpine — **version drift** (M2). No CSP headers (H3).

## Test-Coverage Summary

- **47** `*.test.*` / `*.spec.*` files, **all under `backend/tests`** (unit + integration + e2e).
- **0** frontend tests. `frontend/tsconfig.json` even excludes an `e2e` dir and a `__tests__` dir but no tests found there.
- Root has `@playwright/test` devDep but no discovered specs run in CI.
- Backend jest configured (`test:coverage` script exists); **no coverage threshold enforced** in `backend-ci.yml`.

## Cross-Cutting Hygiene Notes

- **Turbo monorepo** with npm workspaces; `packageManager: npm@10`. Clean structure.
- Root/backend `engines` disagree (M2).
- 95M docs + 49M duplicated guide screenshots dominate repo weight (M4).
- `node_modules`: backend 93M, frontend **707M** (heavy client dep set — consistent with M1).
- 167 backend `console.*`, 86 TODO/FIXME — track down over time.
