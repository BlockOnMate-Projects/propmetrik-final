# Floor Plan Feature — Endpoint & Integration Map

> Generated 2026-07-09; updated same day after cleanup AND after the **Floor Plan Studio integration**.
> The floor plan feature lives inside the **Valuation Engine**. Plans are stored as `canvas_json`
> (JSONB) + rasterized PNG in Postgres (`valuation_floor_plans`) + MinIO and embedded into DOCX/PDF
> reports. The abandoned LLM/Blender track was fully removed on 2026-07-09 (§8).

## 0. Floor Plan Studio (current editor, integrated 2026-07-09)

The editor at `dashboard/valuations/[id]/floor-plan` is now the **Floor Plan Studio**
(`frontend/src/components/valuation/floorplan-studio/` — Konva 10 2D + three.js 3D + Zustand),
replacing `professional-floor-plan/`. Key contract points:

- **canvas_json v2**: `{version:'2', studio:true, floor:{walls,openings,stairs,furniture,rooms,dims,blocks,bg,locked}, roof, projectMeta (floor 0), rooms:[{id,name,type,area,perimeter,polygon,fillColor}], measurements:{grossArea,netUsableArea,efficiencyRatio}}`.
  One row per floor; `POST /:id/floor-plans` is an **UPSERT** on `(valuation_id, floor_number)`.
- `rooms[]` (backend-normalized types) is **required** — backend `extractRoomsFromCanvas` populates
  `valuation_floor_plan_rooms` + measurement columns from it. `floorPlanService.providedMeasurements()`
  (new) prefers the studio's exact engine measurements over the sum-of-rooms fallback.
- Per-floor report PNGs rendered from vector SVG on Save & Continue → existing `PUT .../image` → Appendix B.
- **3D snapshots** upload via `POST /:id/documents {dataUrl, docType:'photo'}` → **Appendix D** automatically.
- New route: `POST /floor-plans/:planId/unlock` (auth-required, mirrors lock).
- **Legacy editor fully retired (2026-07-09)**: `professional-floor-plan/` components deleted (zero
  importers), the 2 remaining legacy-format rows (canvas_version 5.3.0) purged from
  `valuation_floor_plans`, and the legacy write-protection mechanism (`writeBlocked`/`legacyRows`/
  redraw banner) removed entirely. Non-studio rows, if any ever appear, are simply ignored on load
  and overwritten by the floor-number upsert on save.
- Tests: `cd frontend && npm run test:floorplan` (20 geometry-engine tests).

---

## 1. Backend Endpoints

### Mounting (`backend/src/index.ts:220-221`)

```ts
app.use('/api/v1/valuations', optionalAuth, valuationRoutes);
app.use('/api/valuations',    optionalAuth, valuationRoutes);  // frontend compat
```

Auth = `optionalAuth` (routes read `req.user?.id` when present; only `/lock` hard-requires a user).

### Core CRUD — `backend/src/routes/valuations.ts`

| Line | Method | Path (under `/api(/v1)/valuations`) | Purpose |
|---|---|---|---|
| 4556 | POST | `/:id/floor-plans` | Create plan; body `{canvas_json, scale_pixels_per_meter, floor_number, floor_label, calibration_reference}` |
| 4585 | GET | `/:id/floor-plans` | List all plans for a valuation |
| 4599 | GET | `/:id/floor-plans/summary` | Summary with room counts + Ghana building-code validation |
| 4613 | PUT | `/floor-plans/:planId` | Update canvas/scale/label |
| 4639 | PUT | `/floor-plans/:planId/image` | Upload rasterized PNG (`imageDataUrl`) → MinIO |
| 4678 | GET | `/floor-plans/:planId/image` | Presigned MinIO URL (1h expiry) |
| 4698 | GET | `/floor-plans/:planId/image-stream` | Stream PNG bytes from MinIO (non-expiring proxy; used by report editor) |
| 4788 | POST | `/floor-plans/:planId/recalculate` | Recompute rooms/areas from stored canvas |
| 4807 | POST | `/floor-plans/:planId/lock` | Lock plan (requires auth; 401 otherwise) |
| 4830 | DELETE | `/floor-plans/:planId` | Delete plan |

> The design-intent (LLM/Blender) routes that used to be mounted here were removed 2026-07-09.
> `backend/src/types/floorPlanDesign.ts` remains — it holds `RoomType` and validation types used by
> the live geometry validators and `propertyMapper.ts`.

### Analytics — `backend/src/routes/valuationAnalytics.ts`

Mounted at `/api(/v1)/analytics/valuations` with `apiAccess('analytics')` (`index.ts:562-563`).

| Line | Method | Path (relative to mount) | Purpose |
|---|---|---|---|
| 198 | GET | `/floor-plans/summary` | Platform-wide floor plan stats |
| 216 | GET | `/floor-plans/by-region` | Regional breakdown |
| 232 | GET | `/floor-plans/rooms` | Room-type distribution |
| 250 | GET | `/floor-plans/distribution` | GFA buckets |
| 271 | GET | `/floor-plans/compliance` | Ghana building-code violations |

Backed by `backend/src/services/analytics/floorPlanAnalyticsService.ts`.

---

## 2. Service Layer

**`backend/src/services/valuation-engine/floorPlanService.ts`** — `floorPlanService` (exported line 1152).

- CRUD: `create` (168), `getById` (233), `getByValuationId` (244), `update` (257), `recalculate` (325), `delete` (372), `lock`/`unlock` (387/405)
- Validation: `getGhanaBuildingStandards` (790), `validateAgainstBuildingCode` (821), `getSummary` (862)
- Rooms: `insertRooms` (965), `deleteRooms` (997)
- Images: `saveImage` (1013), `getImageUrl` (1097), `getImagesForValuation` (1128)

Geometry validators: `backend/src/services/valuation-engine/geometry/` — `ghanaBuildingCode.ts`,
`roomSizeValidator.ts`, `accessibilityValidator.ts`, `index.ts`.

---

## 3. Database

Dedicated tables (NOT `properties.metadata`). Canvas state is JSONB; the rendered image is a MinIO reference.

### Live tables

- **`valuation_floor_plans`** — `backend/database/migrations/016_valuation_gaps.sql:11`
  Key columns: `valuation_id` (FK CASCADE), `property_id` + `property_region` (composite FK → partitioned `properties`),
  `canvas_json JSONB NOT NULL`, `scale_pixels_per_meter`, `calibration_reference`, cached measurements
  (`gross_building_area_sqm`, `net_usable_area_sqm`, `site_boundary_sqm`, `site_coverage_ratio`,
  `efficiency_ratio`), `rooms JSONB`, `floor_number`, `floor_label`, `is_locked`, `has_scale_reference`,
  `measurement_confidence`. `UNIQUE(valuation_id, floor_number)`.
  Image columns added by `034_floor_plan_images.sql`: `image_url` (`minio://bucket/key`), `image_generated_at`, `image_width`, `image_height`.
- **`valuation_floor_plan_rooms`** — `016_valuation_gaps.sql:60` — normalized rooms (`room_type`, area/perimeter, `meets_minimum_size`, …).

### Abandoned-track tables — DROPPED 2026-07-09

Migrations 027-030 created eight tables for the never-shipped Blender track (`floor_plan_migrations`,
`floor_plan_migration_errors`, `feature_flags`, `feature_flag_overrides`, `geometry_cache_stats`,
`valuation_floor_plan_geometry_versions`, `valuation_floor_plan_audit_log`,
`valuation_floor_plan_design_intents`) plus five scaffolding columns on `valuation_floor_plans`
(`migration_status`, `migration_error`, `migrated_at`, `legacy_canvas_json`, `migration_metadata`).
All were verified empty/NULL in production and dropped by
`backend/database/migrations/20260709_drop_floor_plan_design_intent_tables.sql`.
The 027-030 migration files are kept as applied history; on a fresh DB they create-then-drop.

### Related but separate (development projects — a file URL, not canvas geometry)

- `065_development_projects.sql:352` — units table `floor_plan_url VARCHAR(500)`
- `076_project_ghana_enhancements.sql:62` — project-level `floor_plan_url TEXT`
- `080_document_management.sql:65` — document type enum includes `'floor_plan'`

---

## 4. Frontend

Canvas library: **konva ^10.2.0 + react-konva ^19.2.2** (`frontend/package.json:71,85`). No fabric/three.js/react-planner.

### Live editor path

- **Page:** `frontend/src/app/dashboard/valuations/[id]/floor-plan/page.tsx` → route `/dashboard/valuations/:id/floor-plan`.
  Dynamically imports (`ssr:false`) `ProfessionalFloorPlanBuilder`; defines Ghana room types / minimum areas.
- **Editor:** `frontend/src/components/valuation/professional-floor-plan/KonvaFloorPlanBuilder.tsx`
  (barrel `professional-floor-plan/index.ts` exports `ProfessionalFloorPlanBuilder`).
  Supporting: `constants.ts`, `geometry.ts`, `types.ts`.
- **Wizard entry points:**
  - `dashboard/valuations/[id]/property/page.tsx:69` — "CONTINUE TO FLOOR PLANS" button
  - `dashboard/valuations/[id]/page.tsx:44` — "Floor Plans" step indicator + summary panel (line 505) via `floorPlanApi.getByValuation`

### API client — `frontend/src/lib/valuation-api.ts`

`floorPlanApi` (line 529): `create`, `getByValuation`, `getSummary`, `update`, `lock`, `delete`,
`saveImage`, `getImage`. (The dead `designIntentApi` block was removed 2026-07-09.)

---

## 5. Integration Points

### Valuation reports (primary consumer)

- `backend/src/services/valuation-engine/docGenerationService.ts` — `includeFloorPlans` option (line 38);
  `getFloorPlans` (764), `getFloorPlanImagesWithData` (778, base64); injects `floor_plan_0..N` image keys
  (355-383), `floor_plan_images` template data, schedule-of-accommodation rooms (527-539)
- `backend/src/services/valuation-engine/professionalDocxBuilder.ts:1595-1696` — Appendices section embeds
  floor-plan PNGs from MinIO (`data.floorPlans`, `fp.imageBuffer`)
- `backend/src/services/valuation-engine/reportService.ts:59,152` — `include_floor_plans` flag (default true)
- Report templates: `report-templates/sections/07_property_description.json`, `11_appendices.json`,
  `ghis-standard.json`, `00b_table_of_contents.json`
- Frontend: `dashboard/valuations/[id]/report/page.tsx` sends `include_floor_plans: true` (lines 101/128/153/180);
  `frontend/src/lib/reports-api.ts:215`

### Other consumers

- `backend/src/utils/propertyMapper.ts` — schedule-of-accommodation mapping
- Analytics dashboards (endpoints above); `gssPhcHousingService.ts` reuses the analytics service
- Development projects (separate feature): `unitService.ts` (142/183/233/330/1050), `projectWizardService.ts`
  (153/840), `projectDocumentService.ts` (89/1160); frontend `projects-api.ts:1739`, `types/projects.ts`

### NOT integrated (confirmed absent)

Marketplace, `apply/[token]` listing page, tenant portal, e-sign flows — no floor-plan references.

---

## 6. Storage (MinIO)

- Bucket: `buckets.uploads` = `propmetrik-uploads` (`backend/src/config/index.ts:144`)
- Write: `floorPlanService.saveImage` (1318) decodes data-URL PNG → `uploadFile` → stores `image_url = minio://<bucket>/<key>` (1358)
- Read: `getImageUrl` (1402) → presigned URL (3600s); report editor uses the `image-stream` proxy route
  (streams bytes, 24h cache, `Cross-Origin-Resource-Policy: cross-origin`)
- DOCX embedding pulls bytes server-side as base64 (no URL expiry issues)

---

## 7. Libraries

| Layer | Library | Role |
|---|---|---|
| Frontend | `konva` + `react-konva` | Floor plan drawing canvas |
| Backend | `docxtemplater` + `docxtemplater-image-module-free`, `docx` | PNG embedding into DOCX |
| Backend | `puppeteer`, `pdf-lib`, `pdfkit` | Report → PDF |
| Backend | `sharp` | Image processing |

No CAD/DXF/three.js/Blender library is installed anywhere. The "Blender geometry kernel" was
aspirational and never shipped; its remnants were removed on 2026-07-09 (see §8).

---

## 8. Live Inventory + Cleanup Record

**LIVE — do not delete**

- `valuations.ts` floor-plan CRUD routes (§1 table), `floorPlanService.ts`, `valuation_floor_plans` + `valuation_floor_plan_rooms`
- `dashboard/valuations/[id]/floor-plan/page.tsx` + `components/valuation/professional-floor-plan/*` + `floorPlanApi`
- DOCX/PDF report embedding, analytics endpoints/service, MinIO storage + `image-stream` proxy
- `backend/src/types/floorPlanDesign.ts` — despite the name, its `RoomType`/room-program types are used by the live geometry validators and `propertyMapper.ts`
- Dev-projects `floor_plan_url` (separate feature)

**REMOVED 2026-07-09 — abandoned design-intent/Blender track cleanup**

- `backend/src/routes/floor-plan-design.ts` (routes returned 501) + its import/mount in `valuations.ts`
- `floorPlanService.ts` geometry-versioning / audit-log / design-intent methods (~305 lines, no callers)
- `backend/scripts/migrate-floor-plans.ts` — broken (imported a nonexistent module)
- `backend/tests/integration/floorPlanDesignIntent.test.ts`, `floorPlanEnhancement.test.ts`, `blenderGeometry.test.ts` — tests for the abandoned track; all imported modules that don't exist (`floor-plan-geometry`, `floor-plan-adjustments`, `services/ai/floorPlanDesignIntentService`, `services/geometry/blenderGeometryService`), so they were already broken
- 8 empty tables + 5 NULL columns dropped via `20260709_drop_floor_plan_design_intent_tables.sql` (see §2)
- `frontend/src/app/floor-plan/page.tsx` (demo posting to a nonexistent endpoint), `components/valuation/KonvaFloorPlanBuilder.tsx` (old builder), `LayoutAlternatives.tsx`, their barrel exports in `components/valuation/index.ts`, and the `designIntentApi` block in `valuation-api.ts`
- `docs/floor-plan-enhancement-plan.md` — unshipped AutoCAD/Blender architecture plan

Verified after cleanup: `tsc` = 0 errors on both backend and frontend; removed endpoints respond like
any unknown route; live floor-plans endpoints and the editor page still serve; prod DB confirmed
(dropped tables gone, live floor plans intact).
