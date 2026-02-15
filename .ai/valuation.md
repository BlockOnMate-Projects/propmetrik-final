# PROPMETRIK Valuation Engine - Implementation Strategy

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Backend API Inventory](#backend-api-inventory)
3. [Backend Gaps Analysis](#backend-gaps-analysis)
4. [Step 1: Property Setup & Fabric.js Measurement](#step-1-property-setup--fabricjs-measurement)
5. [Step 2: Highest & Best Use (HBU) Analysis](#step-2-highest--best-use-hbu-analysis)
6. [Step 3: Method Auto-Selection](#step-3-method-auto-selection)
7. [Step 4: Market Data Context](#step-4-market-data-context)
8. [Step 5: Cost Inputs Module](#step-5-cost-inputs-module)
9. [Step 6: Method-Specific Workflows](#step-6-method-specific-workflows)
10. [Step 7: Reconciliation & Final Value](#step-7-reconciliation--final-value)
11. [Step 8: Reporting](#step-8-reporting)
12. [UI Screen Map](#ui-screen-map)
13. [User Journey](#user-journey)
14. [Data Dependencies](#data-dependencies)
15. [Validation Logic](#validation-logic)

---

## Executive Summary

This document defines the **User Interface, Workflows, and Data Flow** for PROPMETRIK's enterprise-grade Real Estate Valuation Engine aligned with **IVS (International Valuation Standards)** and **RICS (Royal Institution of Chartered Surveyors)** standards for the Ghana market.

### Design Principles

1. **Measurements captured ONCE** — All physical attributes via Fabric.js are authoritative and reused across all valuation methodologies
2. **Transparent & Auditable Defaults** — All system defaults (costs, market data) are visible, overrideable, and logged
3. **Override Disclaimers** — Any user-overridden input automatically appears in the final report as a disclaimer
4. **IVS/RICS Compliance** — All workflows enforce professional standards and generate regulator-ready outputs

### Valuation Methods Supported

| Method | Service Status | Primary Use Case |
|--------|----------------|------------------|
| Sales Comparison | ✅ **BUILT** | Residential, general market value |
| Cost Approach | ✅ **BUILT** | New construction, specialized assets |
| Income Approach | ✅ **BUILT** | Investment properties, rental |
| Residual Method | ✅ **BUILT** | Development land, feasibility |
| Profits Method | ✅ **BUILT** | Trading properties (hotels, hospitals) |
| DRC Method | ✅ **BUILT** | Specialized/institutional assets |

---

## Backend API Inventory

### Existing Valuation API Endpoints

The following endpoints are **fully implemented** and available:

#### Core Valuation Endpoints (`/api/valuations`)

| Endpoint | Method | Description | Status |
|----------|--------|-------------|--------|
| `/api/valuations` | POST | Create new valuation | ✅ Built |
| `/api/valuations/:id` | GET | Get valuation by ID | ✅ Built |
| `/api/valuations/property/:propertyId` | GET | Get all valuations for a property | ✅ Built |
| `/api/valuations/:id/comparables` | GET | Get comparables used in valuation | ✅ Built |
| `/api/valuations/:id/report` | GET | Generate valuation report (JSON/HTML) | ✅ Built |
| `/api/valuations/market/:region` | GET | Get market conditions for region | ✅ Built |
| `/api/valuations/market/:region/indices` | GET | Get market index history | ✅ Built |
| `/api/valuations/quick` | POST | Quick valuation (Sales Comparison only) | ✅ Built |
| `/api/valuations/batch` | POST | Batch valuations (max 50) | ✅ Built |
| `/api/valuations/stats` | GET | Get valuation statistics | ✅ Built |

#### Contribution Workflow Endpoints (`/api/contributions`)

| Endpoint | Method | Description | Status |
|----------|--------|-------------|--------|
| `/api/contributions/analyze-gaps` | POST | Analyze comparable gaps for property | ✅ Built |
| `/api/contributions/prompts` | GET | Get active contribution prompts | ✅ Built |
| `/api/contributions/prompts/:id` | GET | Get specific contribution prompt | ✅ Built |
| `/api/contributions/submit` | POST | Submit a contribution | ✅ Built |
| `/api/contributions/my-submissions` | GET | Get user's submissions | ✅ Built |
| `/api/contributions/profile` | GET | Get contributor profile | ✅ Built |
| `/api/contributions/credits/history` | GET | Get credit transaction history | ✅ Built |
| `/api/contributions/credits/spend` | POST | Spend credits on a service | ✅ Built |
| `/api/contributions/achievements` | GET | Get user's achievements | ✅ Built |
| `/api/contributions/leaderboard` | GET | Get contribution leaderboard | ✅ Built |

### Existing Backend Services

#### Valuation Engine Services (`/src/services/valuation-engine/`)

| Service | File | Description | Status |
|---------|------|-------------|--------|
| Valuation Engine | `valuationEngineService.ts` | Main orchestrator, method selection, hybrid weighting | ✅ Built |
| Sales Comparison | `salesComparisonService.ts` | Comparable search, adjustments, weighting | ✅ Built |
| Cost Approach | `costApproachService.ts` | RCN, depreciation, land value | ✅ Built |
| Income Approach | `incomeApproachService.ts` | Direct Cap, DCF, GRM | ✅ Built |
| Residual Method | `residualMethodService.ts` | GDV, development costs, land value | ✅ Built |
| Profits Method | `profitsMethodService.ts` | Trading potential, MOP, cap rates | ✅ Built |
| DRC Method | `drcMethodService.ts` | MEA, specialized depreciation | ✅ Built |
| Market Data | `marketDataService.ts` | Market indices, economic factors, trends | ✅ Built |
| Confidence Scoring | `confidenceScoringService.ts` | Multi-factor confidence calculation | ✅ Built |
| Report Generation | `valuationReportService.ts` | PDF/HTML report generation | ✅ Built |
| Contribution Workflow | `contributionWorkflowService.ts` | Gap detection, contribution prompts | ✅ Built |

### Database Tables (Migration 014)

| Table | Purpose | Status |
|-------|---------|--------|
| `valuations` | Core valuation records | ✅ Created |
| `valuation_comparables` | Comparable properties used | ✅ Created |
| `valuation_market_indices` | Market index history | ✅ Created |
| `valuation_ml_models` | ML model registry | ✅ Created |
| `valuation_adjustment_factors` | Adjustment factor library | ✅ Created |
| `valuation_report_templates` | Report templates | ✅ Created |
| `valuation_audit_log` | Audit trail | ✅ Created |

### Database Tables (Migration 015 - Contribution Workflow)

| Table | Purpose | Status |
|-------|---------|--------|
| `contribution_prompts` | Active contribution prompts | ✅ Created |
| `contribution_submissions` | User submissions | ✅ Created |
| `contributor_profiles` | User credit/reputation profiles | ✅ Created |
| `contributor_credits` | Credit transactions | ✅ Created |
| `achievements` | Achievement definitions | ✅ Created |
| `user_achievements` | User achievement unlocks | ✅ Created |
| `credit_spending_rules` | Credit spending rules | ✅ Created |
| `contribution_validation_rules` | Validation rule definitions | ✅ Created |
| `contributed_properties` | Properties from contributions | ✅ Created |
| `contributed_transactions` | Transactions from contributions | ✅ Created |

---

## Backend Gaps Analysis

> **✅ UPDATE (Completed):** All critical and moderate gaps have been fully implemented. The following sections now reflect the completed status.

### ✅ CRITICAL GAPS (All Built)

#### 1. Fabric.js Floor Plan & Measurement System ✅

**Status:** ✅ **FULLY IMPLEMENTED**

**Implementation Details:**
- **Service File:** `/src/services/valuation-engine/floorPlanService.ts` (~550 lines)
- **Database Migration:** `/database/migrations/016_valuation_gaps.sql`
- **API Routes:** Added to `/src/routes/valuations.ts`

**Features Implemented:**
- Floor plan CRUD operations with multi-floor support
- Fabric.js canvas JSON persistence with versioning
- Shoelace formula area calculation from canvas geometry
- Room extraction and measurement (polygon/rectangle support)
- Ghana Building Code validation (minimum room sizes, setbacks)
- Scale calibration (pixels per meter)
- Floor plan locking for finalized valuations

**API Endpoints Built:**
- `POST /api/valuations/:id/floor-plans` - Create floor plan
- `GET /api/valuations/:id/floor-plans` - Get all floor plans
- `GET /api/valuations/:id/floor-plans/summary` - Get summary with room counts
- `PUT /api/valuations/floor-plans/:planId` - Update floor plan
- `POST /api/valuations/floor-plans/:planId/lock` - Lock floor plan
- `DELETE /api/valuations/floor-plans/:planId` - Delete floor plan

**Original Specification (for reference):**

**Current State:** ~~Only placeholder directories exist~~ **NOW BUILT**

**Required Backend Components:**

```typescript
// NEW FILE: /src/services/valuation-engine/floorPlanService.ts

interface FloorPlanService {
  // Floor plan CRUD
  createFloorPlan(valuationId: string, data: FloorPlanData): Promise<FloorPlan>;
  updateFloorPlan(floorPlanId: string, data: FloorPlanData): Promise<FloorPlan>;
  getFloorPlan(valuationId: string): Promise<FloorPlan | null>;
  lockFloorPlan(floorPlanId: string): Promise<void>;
  
  // Measurements
  calculateMeasurements(geometry: FabricGeometry): MeasurementResult;
  validateMeasurements(measurements: MeasurementResult): ValidationResult;
  
  // Storage
  saveCanvasState(floorPlanId: string, canvasJson: string): Promise<void>;
  loadCanvasState(floorPlanId: string): Promise<string>;
}

interface FloorPlanData {
  canvas_json: string;           // Fabric.js canvas state
  scale_factor: number;          // Pixels to meters
  building_footprint_sqm: number;
  gross_building_area_sqm: number;
  net_usable_area_sqm: number;
  site_boundary_sqm?: number;
  site_coverage_percent?: number;
  rooms: RoomMeasurement[];
}

interface RoomMeasurement {
  id: string;
  name: string;
  type: 'bedroom' | 'bathroom' | 'kitchen' | 'living' | 'dining' | 'office' | 'storage' | 'other';
  area_sqm: number;
  perimeter_m: number;
  geometry: FabricGeometry;
}
```

**Required API Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/valuations/:id/floor-plan` | POST | Create/save floor plan |
| `/api/valuations/:id/floor-plan` | GET | Get floor plan data |
| `/api/valuations/:id/floor-plan` | PUT | Update floor plan |
| `/api/valuations/:id/floor-plan/lock` | POST | Lock measurements |
| `/api/valuations/:id/floor-plan/measurements` | GET | Get calculated measurements |

**Required Database Migration:**

```sql
-- NEW TABLE: valuation_floor_plans
CREATE TABLE valuation_floor_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
  
  -- Canvas Data
  canvas_json TEXT NOT NULL,
  canvas_version VARCHAR(20) DEFAULT '1.0',
  scale_factor DECIMAL(10,4) NOT NULL DEFAULT 100, -- pixels per meter
  
  -- Calculated Measurements
  building_footprint_sqm DECIMAL(12,2),
  gross_building_area_sqm DECIMAL(12,2),
  net_usable_area_sqm DECIMAL(12,2),
  site_boundary_sqm DECIMAL(12,2),
  site_coverage_percent DECIMAL(5,2),
  
  -- Room Details
  rooms JSONB DEFAULT '[]',
  
  -- Status
  is_locked BOOLEAN DEFAULT false,
  locked_at TIMESTAMP WITH TIME ZONE,
  locked_by UUID REFERENCES users(id),
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(valuation_id)
);
```

---

#### 2. Highest & Best Use (HBU) Analysis ✅

**Status:** ✅ **FULLY IMPLEMENTED**

**Implementation Details:**
- **Service File:** `/src/services/valuation-engine/hbuAnalysisService.ts` (~480 lines)
- **Database Migration:** `/database/migrations/016_valuation_gaps.sql`
- **API Routes:** Added to `/src/routes/valuations.ts`

**Features Implemented:**
- Four-test HBU framework (Legal, Physical, Financial, Productivity)
- Zoning compliance check against permitted uses
- Physical constraints analysis (soil, flood zone, topography)
- Financial feasibility with ROI calculations
- Maximum productivity test across development options
- Valuation method recommendations based on HBU conclusion

**API Endpoints Built:**
- `GET /api/valuations/:id/hbu` - Get or create HBU analysis
- `PUT /api/valuations/hbu/:hbuId/legal` - Update legal analysis
- `PUT /api/valuations/hbu/:hbuId/physical` - Update physical analysis
- `PUT /api/valuations/hbu/:hbuId/financial` - Update financial analysis
- `PUT /api/valuations/hbu/:hbuId/productivity` - Update productivity analysis
- `POST /api/valuations/hbu/:hbuId/finalize` - Finalize with conclusion

**Original Specification (for reference):**

**Current State:** ~~Not implemented~~ **NOW BUILT**

**Required Backend Components:**

```typescript
// NEW FILE: /src/services/valuation-engine/hbuAnalysisService.ts

interface HBUAnalysisService {
  performHBUAnalysis(property: PropertyForValuation, measurements: MeasurementResult): Promise<HBUResult>;
  evaluateLegalPermissibility(property: PropertyForValuation): Promise<LegalAnalysis>;
  evaluatePhysicalPossibility(property: PropertyForValuation, measurements: MeasurementResult): Promise<PhysicalAnalysis>;
  evaluateFinancialFeasibility(property: PropertyForValuation): Promise<FinancialAnalysis>;
  evaluateMaximumProductivity(options: HBUOption[]): Promise<ProductivityAnalysis>;
}

interface HBUResult {
  id: string;
  valuation_id: string;
  
  // Four Tests
  legal_permissibility: LegalAnalysis;
  physical_possibility: PhysicalAnalysis;
  financial_feasibility: FinancialAnalysis;
  maximum_productivity: ProductivityAnalysis;
  
  // Conclusion
  recommended_use: string;
  current_use_is_hbu: boolean;
  hbu_value_premium: number;
  confidence_score: number;
  
  // Recommended Methods
  recommended_methods: ValuationMethod[];
  method_justifications: Record<ValuationMethod, string>;
}

interface LegalAnalysis {
  zoning_classification: string;
  permitted_uses: string[];
  conditional_uses: string[];
  prohibited_uses: string[];
  max_building_height_m: number;
  max_floor_area_ratio: number;
  max_site_coverage_percent: number;
  setback_requirements: SetbackRequirements;
  easements: Easement[];
  restrictions: string[];
  compliance_status: 'compliant' | 'non_compliant' | 'conditional';
}

interface PhysicalAnalysis {
  site_size_sqm: number;
  site_shape: 'regular' | 'irregular' | 'corner' | 'flag';
  topography: 'flat' | 'sloped' | 'steep';
  soil_conditions: 'good' | 'moderate' | 'poor' | 'unknown';
  flood_zone: boolean;
  access_quality: 'excellent' | 'good' | 'fair' | 'poor';
  utilities_available: string[];
  environmental_constraints: string[];
  buildable_area_sqm: number;
  max_developable_gfa_sqm: number;
}

interface FinancialAnalysis {
  development_scenarios: DevelopmentScenario[];
  market_demand_rating: 'high' | 'moderate' | 'low';
  absorption_rate_months: number;
  required_roi_percent: number;
  financing_available: boolean;
  risk_assessment: 'low' | 'moderate' | 'high';
}

interface ProductivityAnalysis {
  options_evaluated: HBUOption[];
  highest_value_option: HBUOption;
  value_differential: number;
}
```

**Required API Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/valuations/:id/hbu` | POST | Perform HBU analysis |
| `/api/valuations/:id/hbu` | GET | Get HBU analysis results |
| `/api/valuations/:id/hbu/legal` | GET | Get legal permissibility only |
| `/api/valuations/:id/hbu/physical` | GET | Get physical possibility only |
| `/api/valuations/:id/hbu/financial` | GET | Get financial feasibility only |

**Required Database Migration:**

```sql
-- NEW TABLE: valuation_hbu_analyses
CREATE TABLE valuation_hbu_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
  
  -- Legal Permissibility
  legal_analysis JSONB NOT NULL,
  legal_score DECIMAL(4,3),
  
  -- Physical Possibility
  physical_analysis JSONB NOT NULL,
  physical_score DECIMAL(4,3),
  
  -- Financial Feasibility
  financial_analysis JSONB NOT NULL,
  financial_score DECIMAL(4,3),
  
  -- Maximum Productivity
  productivity_analysis JSONB NOT NULL,
  productivity_score DECIMAL(4,3),
  
  -- Conclusion
  recommended_use VARCHAR(100),
  current_use_is_hbu BOOLEAN,
  hbu_value_premium DECIMAL(15,2),
  overall_confidence DECIMAL(4,3),
  
  -- Method Recommendations
  recommended_methods VARCHAR[] NOT NULL,
  method_justifications JSONB,
  
  -- Audit
  performed_by UUID REFERENCES users(id),
  performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(valuation_id)
);
```

---

#### 3. User Override Tracking & Disclaimers ✅

**Status:** ✅ **FULLY IMPLEMENTED**

**Implementation Details:**
- **Service File:** `/src/services/valuation-engine/overrideTrackingService.ts` (~450 lines)
- **Database Migration:** `/database/migrations/016_valuation_gaps.sql`
- **API Routes:** Added to `/src/routes/valuations.ts`

**Features Implemented:**
- Override recording with system vs. user values
- Deviation percentage calculation
- Override categorization (cost_input, market_data, adjustment_factor, etc.)
- RICS-compliant disclaimer generation
- Material uncertainty statement generation
- Approval workflow (pending → approved/rejected)

**API Endpoints Built:**
- `POST /api/valuations/:id/overrides` - Record override
- `GET /api/valuations/:id/overrides` - Get all overrides
- `GET /api/valuations/:id/overrides/summary` - Get summary with disclaimers
- `POST /api/valuations/overrides/:overrideId/approve` - Approve override
- `POST /api/valuations/overrides/:overrideId/reject` - Reject override

**Original Specification (for reference):**

**Current State:** ~~Partial - adjustments are logged but not tracked as user overrides with reasons~~ **NOW FULLY BUILT**

**Required Backend Enhancement:**

```typescript
// ENHANCE: /src/services/valuation-engine/overrideTrackingService.ts

interface OverrideTrackingService {
  recordOverride(valuationId: string, override: UserOverride): Promise<void>;
  getOverrides(valuationId: string): Promise<UserOverride[]>;
  generateDisclaimers(overrides: UserOverride[]): string[];
}

interface UserOverride {
  id: string;
  valuation_id: string;
  
  // What was overridden
  category: 'cost_input' | 'market_data' | 'adjustment_factor' | 'comparable_weight' | 'method_weight' | 'cap_rate' | 'other';
  field_name: string;
  field_label: string;
  
  // Values
  system_default_value: number | string;
  user_override_value: number | string;
  unit: string;
  
  // Justification
  reason: string;
  supporting_evidence?: string;
  
  // Source
  source_module: string; // Which UI module
  
  // Audit
  overridden_by: string;
  overridden_at: Date;
}
```

**Required Database Migration:**

```sql
-- NEW TABLE: valuation_user_overrides
CREATE TABLE valuation_user_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
  
  -- Override Details
  category VARCHAR(50) NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  field_label VARCHAR(200),
  
  -- Values
  system_default_value JSONB NOT NULL,
  user_override_value JSONB NOT NULL,
  unit VARCHAR(50),
  
  -- Justification
  reason TEXT NOT NULL,
  supporting_evidence TEXT,
  
  -- Source
  source_module VARCHAR(100),
  
  -- Audit
  overridden_by UUID REFERENCES users(id),
  overridden_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_user_overrides_valuation ON valuation_user_overrides(valuation_id);
```

---

#### 4. Comparable Basket Management ✅

**Status:** ✅ **FULLY IMPLEMENTED**

**Implementation Details:**
- **Service File:** `/src/services/valuation-engine/comparableBasketService.ts` (~600 lines)
- **Database Migration:** `/database/migrations/016_valuation_gaps.sql`
- **API Routes:** Added to `/src/routes/valuations.ts`

**Features Implemented:**
- Multiple baskets per valuation (primary/secondary)
- Add/remove comparables with justification
- Manual comparable entry (not from database)
- Manual weighting with justification requirement
- Quality scoring system
- Basket statistics (mean, median, std dev, COV)
- Weight normalization
- Weighted average price calculation

**API Endpoints Built:**
- `GET /api/valuations/:id/baskets` - Get all baskets
- `POST /api/valuations/:id/baskets` - Create basket
- `GET /api/valuations/baskets/:basketId/comparables` - Get comparables
- `POST /api/valuations/baskets/:basketId/comparables` - Add comparable
- `PUT /api/valuations/comparables/:comparableId` - Update comparable
- `GET /api/valuations/baskets/:basketId/statistics` - Get statistics
- `POST /api/valuations/baskets/:basketId/normalize-weights` - Normalize weights

**Original Specification (for reference):**

**Current State:** ~~Comparables are auto-selected but no manual basket management~~ **NOW FULLY BUILT**

**Required Backend Enhancement:**

```typescript
// ENHANCE: /src/services/valuation-engine/comparableBasketService.ts

interface ComparableBasketService {
  // Basket management
  getBasket(valuationId: string): Promise<ComparableBasket>;
  addToBasket(valuationId: string, comparable: ComparableProperty): Promise<void>;
  removeFromBasket(valuationId: string, comparableId: string, reason: string): Promise<void>;
  
  // Tagging
  tagComparable(comparableId: string, tag: 'primary' | 'secondary' | 'supporting'): Promise<void>;
  
  // Manual entry
  addManualComparable(valuationId: string, data: ManualComparableInput): Promise<ComparableProperty>;
  
  // Bulk upload
  uploadComparables(valuationId: string, file: File): Promise<BulkUploadResult>;
  
  // Weighting
  setComparableWeight(comparableId: string, weight: number, reason: string): Promise<void>;
  autoCalculateWeights(valuationId: string): Promise<void>;
}

interface ComparableBasket {
  valuation_id: string;
  comparables: ComparableProperty[];
  min_required: number;
  current_count: number;
  is_valid: boolean;
  validation_errors: string[];
  
  // Aggregates
  avg_similarity_score: number;
  avg_quality_score: number;
  total_weight: number;
}
```

**Required API Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/valuations/:id/comparables/basket` | GET | Get comparable basket |
| `/api/valuations/:id/comparables/basket` | POST | Add to basket |
| `/api/valuations/:id/comparables/basket/:compId` | DELETE | Remove from basket |
| `/api/valuations/:id/comparables/basket/:compId/tag` | PUT | Tag comparable |
| `/api/valuations/:id/comparables/basket/:compId/weight` | PUT | Set weight |
| `/api/valuations/:id/comparables/manual` | POST | Add manual comparable |
| `/api/valuations/:id/comparables/upload` | POST | Bulk upload comparables |

---

### ✅ MODERATE GAPS (Mostly Built)

#### 5. Investment Method Variants (Term & Reversion, Hardcore & Layer) ⏳

**Status:** ⏳ **PENDING** - Enhancement to existing incomeApproachService.ts

> Note: This is an enhancement to the existing Income Approach service rather than a new gap service. The other moderate gaps (Sensitivity Analysis and Reconciliation) have been fully implemented.

**Current State:** Only Direct Cap and DCF implemented in Income Approach

**Required Enhancement to `incomeApproachService.ts`:**

```typescript
// ADD to incomeApproachService.ts

interface InvestmentMethodVariants {
  // Existing
  calculateDirectCap(property: PropertyForValuation, noi: number, capRate: number): number;
  calculateDCF(property: PropertyForValuation, cashFlows: CashFlowProjection[], discountRate: number): number;
  
  // NEW
  calculateTermAndReversion(params: TermReversionParams): TermReversionResult;
  calculateHardcoreAndLayer(params: HardcoreLayerParams): HardcoreLayerResult;
}

interface TermReversionParams {
  current_rent: number;
  market_rent: number;
  remaining_lease_years: number;
  term_yield: number;
  reversion_yield: number;
}

interface HardcoreLayerParams {
  passing_rent: number;
  market_rent: number;
  remaining_lease_years: number;
  hardcore_yield: number;
  top_slice_yield: number;
}
```

#### 6. Sensitivity Analysis Engine ✅

**Status:** ✅ **FULLY IMPLEMENTED**

**Implementation Details:**
- **Service File:** `/src/services/valuation-engine/sensitivityAnalysisService.ts` (~550 lines)
- **Database Migration:** `/database/migrations/016_valuation_gaps.sql`
- **API Routes:** Added to `/src/routes/valuations.ts`

**Features Implemented:**
- Single variable sensitivity analysis
- Two-variable data tables
- Tornado diagram generation (impact ranking)
- Monte Carlo simulation with configurable iterations
- Distribution support (normal, uniform, triangular)
- Convenience methods for common analyses (cap rate, income approach tornado, residual Monte Carlo)

**API Endpoints Built:**
- `GET /api/valuations/:id/sensitivity` - Get all analyses
- `POST /api/valuations/:id/sensitivity/cap-rate` - Cap rate sensitivity
- `POST /api/valuations/:id/sensitivity/tornado` - Income approach tornado
- `POST /api/valuations/:id/sensitivity/monte-carlo` - Residual Monte Carlo

**Original Specification (for reference):**

**Current State:** ~~Basic sensitivity in Residual Method only~~ **NOW FULLY BUILT**

**Required New Service:**

```typescript
// NEW FILE: /src/services/valuation-engine/sensitivityAnalysisService.ts

interface SensitivityAnalysisService {
  runSensitivity(valuationId: string, config: SensitivityConfig): Promise<SensitivityResult>;
  generateTornadoChart(result: SensitivityResult): TornadoChartData;
  generateMonteCarloSimulation(valuationId: string, iterations: number): Promise<MonteCarloResult>;
}

interface SensitivityConfig {
  method: ValuationMethod;
  variables: SensitivityVariable[];
  variation_range: number; // e.g., 0.10 for ±10%
  step_size: number;       // e.g., 0.05 for 5% steps
}

interface SensitivityVariable {
  name: string;
  base_value: number;
  min_value?: number;
  max_value?: number;
}
```

#### 7. Reconciliation Workflow ✅

**Status:** ✅ **FULLY IMPLEMENTED**

**Implementation Details:**
- **Service File:** `/src/services/valuation-engine/reconciliationService.ts` (~550 lines)
- **Database Migration:** `/database/migrations/016_valuation_gaps.sql`
- **API Routes:** Added to `/src/routes/valuations.ts`

**Features Implemented:**
- Multi-method result collection
- Automatic confidence-based weighting
- Manual weight override with justification
- Weighted average calculation
- Final value selection (weighted avg, specific method, manual)
- RICS-compliant narrative template generation
- Review workflow (draft → under_review → approved → locked)
- Currency conversion (GHS/USD with exchange rate)
- Per-sqm value calculation
- Special assumptions and departures tracking

**API Endpoints Built:**
- `GET /api/valuations/:id/reconciliation` - Get reconciliation
- `POST /api/valuations/:id/reconciliation` - Create reconciliation
- `PUT /api/valuations/reconciliation/:id/weights` - Set method weights
- `POST /api/valuations/reconciliation/:id/finalize` - Finalize with narrative
- `POST /api/valuations/reconciliation/:id/approve` - Approve (reviewer)
- `POST /api/valuations/reconciliation/:id/lock` - Lock (final)
- `GET /api/valuations/reconciliation/:id/narrative-template` - Get narrative template

**Original Specification (for reference):**

**Current State:** ~~Hybrid weighting is automatic, no manual reconciliation UI support~~ **NOW FULLY BUILT**

**Required Enhancement:**

```typescript
// ENHANCE: /src/services/valuation-engine/reconciliationService.ts

interface ReconciliationService {
  getReconciliationData(valuationId: string): Promise<ReconciliationData>;
  setMethodWeights(valuationId: string, weights: MethodWeight[]): Promise<void>;
  setJustification(valuationId: string, justification: string): Promise<void>;
  calculateFinalValue(valuationId: string): Promise<FinalValueResult>;
  setConfidenceLevel(valuationId: string, level: ConfidenceLevel, reason: string): Promise<void>;
}

interface ReconciliationData {
  valuation_id: string;
  method_results: MethodResult[];
  market_context: MarketConditions;
  
  // Weighting
  auto_weights: MethodWeight[];
  manual_weights?: MethodWeight[];
  weight_source: 'auto' | 'manual';
  
  // Final Value
  preliminary_value: number;
  final_value?: number;
  value_range: { low: number; high: number };
  
  // Justification
  reconciliation_justification?: string;
  confidence_level?: ConfidenceLevel;
  confidence_reason?: string;
}

interface MethodWeight {
  method: ValuationMethod;
  weight: number;
  reason?: string;
}
```

**Required API Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/valuations/:id/reconciliation` | GET | Get reconciliation data |
| `/api/valuations/:id/reconciliation/weights` | PUT | Set method weights |
| `/api/valuations/:id/reconciliation/justification` | PUT | Set justification |
| `/api/valuations/:id/reconciliation/finalize` | POST | Calculate and lock final value |

---

### 🟢 MINOR GAPS (Nice to Have)

#### 8. PDF Report Generation with Fabric.js Drawings

**Current State:** HTML report generation works, PDF not fully implemented

**Required:** Integration with a PDF library (e.g., Puppeteer, PDFKit) to render Fabric.js canvas as images in reports.

#### 9. Real-time Collaboration

**Current State:** Single-user workflows only

**Required:** WebSocket integration for real-time updates when multiple users view/edit same valuation.

#### 10. Valuation Templates

**Current State:** Report templates exist, but no valuation workflow templates

**Required:** Pre-configured valuation templates for common property types (e.g., "Standard Residential Sale", "Bank Mortgage Valuation", "Development Appraisal").

---

## Gap Summary Table

| Gap | Priority | Effort | Dependencies |
|-----|----------|--------|--------------|
| Floor Plan & Measurement System | 🔴 Critical | High | Frontend Fabric.js component |
| HBU Analysis | 🔴 Critical | Medium | Zoning data integration |
| User Override Tracking | 🔴 Critical | Low | None |
| Comparable Basket Management | 🔴 Critical | Medium | Existing comparable service |
| Investment Method Variants | 🟡 Moderate | Medium | Existing income service |
| Sensitivity Analysis Engine | 🟡 Moderate | Medium | None |
| Reconciliation Workflow | 🟡 Moderate | Low | Existing valuation engine |
| PDF Report Generation | 🟢 Minor | Medium | Puppeteer/PDFKit |
| Real-time Collaboration | 🟢 Minor | High | WebSocket infrastructure |
| Valuation Templates | 🟢 Minor | Low | None |

---

## Step 1: Property Setup & Fabric.js Measurement

### Overview

The Property Setup & Measurement workflow is the **mandatory first step** for all valuations. It captures authoritative physical measurements using Fabric.js that are reused across all valuation methodologies.

### UI Design: Measurement Studio

#### Screen Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ VALUATION: VL-2026-00042 │ PROPERTY SETUP & MEASUREMENT          │ Step 1/8 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────┐  ┌───────────────────────────┐│
│  │                                         │  │ MEASUREMENT SUMMARY       ││
│  │                                         │  ├───────────────────────────┤│
│  │                                         │  │ Gross Building Area       ││
│  │                                         │  │ ████████████████  248 m²  ││
│  │         FABRIC.JS CANVAS                │  │                           ││
│  │                                         │  │ Net Usable Area           ││
│  │      (Drawing Area)                     │  │ ██████████████    210 m²  ││
│  │                                         │  │                           ││
│  │                                         │  │ Site Boundary             ││
│  │                                         │  │ ████████████████  450 m²  ││
│  │                                         │  │                           ││
│  │                                         │  │ Site Coverage             ││
│  │                                         │  │ ██████████        55.1%   ││
│  │                                         │  │                           ││
│  └─────────────────────────────────────────┘  │ Efficiency Ratio          ││
│                                                │ ████████████████  84.7%   ││
│  ┌──────────────────────────────────────────┐ └───────────────────────────┘│
│  │ DRAWING TOOLS                            │                              │
│  │ [Select] [Rectangle] [Polygon] [Line]    │  ┌───────────────────────────┐│
│  │ [Undo] [Redo] [Delete] [Clear]           │  │ ROOM BREAKDOWN            ││
│  ├──────────────────────────────────────────┤  ├───────────────────────────┤│
│  │ SCALE: 1 pixel = [0.05] meters           │  │ Living Room      42.5 m² ││
│  │ [Set Scale from Reference]               │  │ Kitchen          18.0 m² ││
│  └──────────────────────────────────────────┘  │ Master Bedroom   28.0 m² ││
│                                                │ Bedroom 2        16.5 m² ││
│                                                │ Bedroom 3        14.0 m² ││
│                                                │ Bathroom 1        8.5 m² ││
│                                                │ Bathroom 2        6.0 m² ││
│                                                │ Corridor         12.0 m² ││
│                                                │ Storage           4.5 m² ││
│                                                │ ─────────────────────────││
│                                                │ TOTAL           150.0 m² ││
│                                                └───────────────────────────┘│
│                                                                             │
│  [< Back]                    [Save Draft]           [Lock & Continue >]    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Functional Requirements

#### 1. Canvas Initialization

```typescript
interface CanvasConfig {
  width: number;        // Default: 800px
  height: number;       // Default: 600px
  backgroundColor: string;
  gridEnabled: boolean;
  gridSize: number;     // In pixels
  snapToGrid: boolean;
  scaleReference: {
    pixelsPerMeter: number;
    referenceType: 'known_dimension' | 'scale_bar' | 'manual';
  };
}
```

#### 2. Drawing Tools

| Tool | Purpose | Output |
|------|---------|--------|
| **Rectangle** | Draw rectangular rooms/areas | `fabric.Rect` with area calculation |
| **Polygon** | Draw irregular shapes | `fabric.Polygon` with area calculation |
| **Line** | Draw walls/boundaries | `fabric.Line` with length calculation |
| **Select** | Select and modify objects | Edit mode |
| **Label** | Add room labels | `fabric.Text` attached to shapes |

#### 3. Measurement Calculations

```typescript
interface MeasurementEngine {
  // Area calculations
  calculateRectangleArea(rect: fabric.Rect, scale: number): number;
  calculatePolygonArea(polygon: fabric.Polygon, scale: number): number;
  
  // Perimeter calculations
  calculatePerimeter(shape: fabric.Object, scale: number): number;
  
  // Aggregate calculations
  calculateGrossBuildingArea(shapes: fabric.Object[]): number;
  calculateNetUsableArea(shapes: fabric.Object[], deductions: string[]): number;
  calculateSiteCoverage(buildingFootprint: number, siteArea: number): number;
  
  // Efficiency
  calculateEfficiencyRatio(netArea: number, grossArea: number): number;
}
```

#### 4. Room Type Classification

```typescript
type RoomType = 
  | 'living_room'
  | 'bedroom'
  | 'master_bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'toilet'
  | 'dining_room'
  | 'office'
  | 'storage'
  | 'garage'
  | 'corridor'
  | 'balcony'
  | 'terrace'
  | 'utility'
  | 'other';

interface RoomProperties {
  id: string;
  type: RoomType;
  name: string;
  area_sqm: number;
  perimeter_m: number;
  floor_level: number;
  is_usable_area: boolean;  // Excluded from net usable if false
  notes?: string;
}
```

#### 5. Lock Mechanism

Once measurements are confirmed, they are **locked** and become read-only:

```typescript
interface LockState {
  is_locked: boolean;
  locked_at?: Date;
  locked_by?: string;
  unlock_requires_approval: boolean;
  
  // Downstream dependencies
  methods_using_measurements: ValuationMethod[];
  recalculation_required_on_unlock: boolean;
}
```

### Data Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Fabric.js     │────▶│   Measurement   │────▶│    Valuation    │
│   Canvas        │     │   Service       │     │    Engine       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  canvas_json    │     │  Calculated     │     │  Used in:       │
│  (stored)       │     │  Measurements   │     │  - Sales Comp   │
│                 │     │  (sqm values)   │     │  - Income       │
│                 │     │                 │     │  - Cost         │
│                 │     │                 │     │  - Residual     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Validation Rules

| Rule | Validation | Error Message |
|------|------------|---------------|
| Minimum shapes | At least 1 building footprint | "Building footprint is required" |
| Scale set | Scale factor > 0 | "Please set the measurement scale" |
| Reasonable area | GBA between 10-50,000 m² | "Building area seems unrealistic" |
| Room overlap | No overlapping rooms | "Rooms cannot overlap" |
| Total consistency | Sum of rooms ≤ GBA | "Room total exceeds building area" |

### API Calls

| Action | Endpoint | Method | Payload |
|--------|----------|--------|---------|
| Save draft | `/api/valuations/:id/floor-plan` | POST | `{ canvas_json, measurements }` |
| Get saved | `/api/valuations/:id/floor-plan` | GET | - |
| Lock | `/api/valuations/:id/floor-plan/lock` | POST | `{ confirm: true }` |
| Request unlock | `/api/valuations/:id/floor-plan/unlock` | POST | `{ reason: string }` |

---

## Step 2: Highest & Best Use (HBU) Analysis

### Overview

The HBU Analysis evaluates whether the current use represents the highest and best use of the property, following the four-test framework mandated by IVS.

### UI Design: HBU Evaluation Screen

#### Screen Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ VALUATION: VL-2026-00042 │ HIGHEST & BEST USE ANALYSIS           │ Step 2/8 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ CURRENT USE SUMMARY                                                     ││
│  │ Property Type: Residential House │ Bedrooms: 4 │ Area: 248 m²          ││
│  │ Location: East Legon, Accra │ Zoning: R-2 (Medium Density Residential) ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌────────────────────────────┐  ┌────────────────────────────┐            │
│  │ 1. LEGAL PERMISSIBILITY    │  │ 2. PHYSICAL POSSIBILITY    │            │
│  │ ──────────────────────────│  │ ──────────────────────────│            │
│  │                            │  │                            │            │
│  │ Zoning: R-2 Residential    │  │ Site Size: 450 m²          │            │
│  │ ☑ Single Family Dwelling   │  │ Shape: Regular Rectangle   │            │
│  │ ☑ Duplex                   │  │ Topography: Flat           │            │
│  │ ☑ Townhouse (up to 4)      │  │ Soil: Good (assumed)       │            │
│  │ ☐ Apartment Building       │  │ Flood Zone: No             │            │
│  │ ☐ Commercial               │  │ Access: Good (paved road)  │            │
│  │                            │  │                            │            │
│  │ Max Height: 15m (4 floors) │  │ Buildable Area: 405 m²     │            │
│  │ Max FAR: 1.5               │  │ Max GFA: 675 m²            │            │
│  │ Max Coverage: 60%          │  │                            │            │
│  │                            │  │ Utilities Available:       │            │
│  │ Score: ████████░░ 85%      │  │ ☑ Water  ☑ Electric        │            │
│  │                            │  │ ☑ Sewer  ☑ Gas             │            │
│  │ Status: ✓ PASSES           │  │                            │            │
│  │                            │  │ Score: ████████░░ 90%      │            │
│  │                            │  │ Status: ✓ PASSES           │            │
│  └────────────────────────────┘  └────────────────────────────┘            │
│                                                                             │
│  ┌────────────────────────────┐  ┌────────────────────────────┐            │
│  │ 3. FINANCIAL FEASIBILITY   │  │ 4. MAXIMUM PRODUCTIVITY    │            │
│  │ ──────────────────────────│  │ ──────────────────────────│            │
│  │                            │  │                            │            │
│  │ Scenario Analysis:         │  │ Options Evaluated:         │            │
│  │                            │  │                            │            │
│  │ A. Current Use (House)     │  │ ┌─────────────────────────┐│            │
│  │    Value: GHS 1,250,000    │  │ │Option    │ Est. Value   ││            │
│  │    ROI: 8.5%               │  │ ├─────────────────────────┤│            │
│  │    Feasible: ✓             │  │ │Current   │ GHS 1,250,000││            │
│  │                            │  │ │Duplex    │ GHS 1,450,000││            │
│  │ B. Duplex Conversion       │  │ │Townhouse │ GHS 1,680,000││            │
│  │    Dev Cost: GHS 350,000   │  │ └─────────────────────────┘│            │
│  │    Value: GHS 1,450,000    │  │                            │            │
│  │    ROI: 12.1%              │  │ HIGHEST: Townhouse Dev.    │            │
│  │    Feasible: ✓             │  │ Premium: +34.4%            │            │
│  │                            │  │                            │            │
│  │ C. Townhouse Development   │  │ ⚠ Current use is NOT HBU   │            │
│  │    Dev Cost: GHS 850,000   │  │                            │            │
│  │    Value: GHS 1,680,000    │  │ However, for this mortgage │            │
│  │    ROI: 15.2%              │  │ valuation, we value as-is. │            │
│  │    Feasible: ✓             │  │                            │            │
│  │                            │  │ Score: ████████░░ 85%      │            │
│  │ Score: ████████░░ 88%      │  │                            │            │
│  │ Status: ✓ PASSES           │  │                            │            │
│  └────────────────────────────┘  └────────────────────────────┘            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ HBU CONCLUSION                                                          ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │ Highest & Best Use: Townhouse Development (4 units)                     ││
│  │ Current Use Matches HBU: No                                             ││
│  │ HBU Value Premium: +GHS 430,000 (+34.4%)                                ││
│  │                                                                         ││
│  │ Valuation Basis: [●] As-Is (Current Use)  [ ] As-If HBU Developed      ││
│  │                                                                         ││
│  │ Recommended Methods:                                                    ││
│  │ ☑ Sales Comparison (primary for as-is residential)                      ││
│  │ ☑ Cost Approach (supporting)                                            ││
│  │ ☐ Income Approach (not primary for owner-occupied)                      ││
│  │ ☐ Residual Method (would apply if valuing for development)              ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  [< Back]                    [Save Draft]              [Continue >]         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Functional Requirements

#### 1. Legal Permissibility Module

```typescript
interface LegalPermissibilityInput {
  // Auto-populated from property data
  zoning_code?: string;
  
  // User inputs
  permitted_uses: string[];
  conditional_uses: string[];
  prohibited_uses: string[];
  
  // Constraints
  max_building_height_m: number;
  max_floor_area_ratio: number;
  max_site_coverage_percent: number;
  front_setback_m: number;
  side_setback_m: number;
  rear_setback_m: number;
  
  // Encumbrances
  easements: Easement[];
  deed_restrictions: string[];
  heritage_listing: boolean;
}
```

#### 2. Physical Possibility Module

```typescript
interface PhysicalPossibilityInput {
  // From Fabric.js measurements (auto-populated)
  site_size_sqm: number;
  building_footprint_sqm: number;
  
  // User assessments
  site_shape: 'regular' | 'irregular' | 'corner' | 'flag';
  topography: 'flat' | 'gentle_slope' | 'moderate_slope' | 'steep';
  soil_conditions: 'good' | 'moderate' | 'poor' | 'unknown';
  flood_zone: boolean;
  flood_zone_type?: 'AE' | 'VE' | 'X' | 'other';
  
  // Access
  road_access: 'excellent' | 'good' | 'fair' | 'poor';
  road_type: 'paved' | 'unpaved' | 'private';
  
  // Utilities
  utilities: {
    water: boolean;
    electricity: boolean;
    sewerage: boolean;
    gas: boolean;
    internet: boolean;
  };
  
  // Environmental
  environmental_constraints: string[];
}
```

#### 3. Financial Feasibility Module

```typescript
interface FinancialFeasibilityScenario {
  name: string;
  use_type: string;
  
  // Development costs (if applicable)
  land_cost: number;
  construction_cost: number;
  soft_costs: number;
  finance_costs: number;
  total_development_cost: number;
  
  // Expected value
  expected_value: number;
  expected_noi?: number;
  
  // Returns
  profit_margin_percent: number;
  irr_percent?: number;
  roi_percent: number;
  
  // Assessment
  is_feasible: boolean;
  feasibility_notes: string;
}
```

#### 4. Maximum Productivity Matrix

```typescript
interface ProductivityOption {
  use_type: string;
  estimated_value: number;
  passes_legal: boolean;
  passes_physical: boolean;
  passes_financial: boolean;
  is_highest_value: boolean;
}

interface ProductivityAnalysis {
  options: ProductivityOption[];
  highest_value_option: ProductivityOption;
  current_use_value: number;
  hbu_value_premium: number;
  hbu_value_premium_percent: number;
  current_use_is_hbu: boolean;
}
```

### Validation Rules

| Rule | Validation | Error Message |
|------|------------|---------------|
| Legal assessment complete | All 4 tests have scores | "Complete all HBU tests" |
| At least one feasible use | ≥1 option passes all tests | "No feasible use identified" |
| Method recommendation | ≥1 method selected | "Select at least one valuation method" |

### Data Flow to Method Selection

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   HBU Analysis  │────▶│   Method        │────▶│   Valuation     │
│   Results       │     │   Selector      │     │   Methods       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                                               │
        ▼                                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ Recommended Methods based on:                                   │
│ - Property Type (from HBU)                                      │
│ - Valuation Purpose (mortgage → Sales Comp primary)             │
│ - Data Availability (comparables exist → Sales Comp viable)     │
│ - Current vs HBU Use (development → Residual Method)            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step 3: Method Auto-Selection

### Overview

Based on property type and HBU results, the system automatically determines which valuation methods are applicable, with manual override capability.

### UI Design: Method Selection Panel

#### Screen Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ VALUATION: VL-2026-00042 │ VALUATION METHOD SELECTION            │ Step 3/8 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ PROPERTY CONTEXT                                                        ││
│  │ Type: Residential House │ Purpose: Mortgage │ HBU: Current Use (As-Is) ││
│  │ Region: Greater Accra │ Comparables Available: 12 │ Income Data: Limited││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ METHOD APPLICABILITY MATRIX                                             ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │ METHOD              │ APPLICABLE │ DATA QUALITY │ RECOMMENDED WEIGHT│││
│  │  ├─────────────────────────────────────────────────────────────────────┤││
│  │  │ ☑ Sales Comparison  │ ✓ Yes      │ ████████░░   │ 60%  [▼]        │││
│  │  │   └─ 12 comparables within 3km, avg age 8 months                   │││
│  │  ├─────────────────────────────────────────────────────────────────────┤││
│  │  │ ☑ Cost Approach     │ ✓ Yes      │ ██████░░░░   │ 30%  [▼]        │││
│  │  │   └─ Construction cost data available for region                   │││
│  │  ├─────────────────────────────────────────────────────────────────────┤││
│  │  │ ☐ Income Approach   │ △ Limited  │ ████░░░░░░   │ 10%  [▼]        │││
│  │  │   └─ Owner-occupied; rental comparables limited                    │││
│  │  ├─────────────────────────────────────────────────────────────────────┤││
│  │  │ ☐ Residual Method   │ ✗ N/A      │ ░░░░░░░░░░   │ --              │││
│  │  │   └─ Not development land; HBU is current use                      │││
│  │  ├─────────────────────────────────────────────────────────────────────┤││
│  │  │ ☐ Profits Method    │ ✗ N/A      │ ░░░░░░░░░░   │ --              │││
│  │  │   └─ Not a trading property                                        │││
│  │  ├─────────────────────────────────────────────────────────────────────┤││
│  │  │ ☐ DRC Method        │ ✗ N/A      │ ░░░░░░░░░░   │ --              │││
│  │  │   └─ Not a specialized/institutional asset                         │││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  │                                                                         ││
│  │  TOTAL WEIGHT: 100% ✓                                                   ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ ⚠ MANUAL OVERRIDE (Optional)                                           ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │ To include a non-recommended method or change weights:                  ││
│  │                                                                         ││
│  │ Override Method Selection: [No override selected ▼]                     ││
│  │ Justification: [                                                    ]   ││
│  │                                                                         ││
│  │ ⓘ Any manual override will be disclosed in the final valuation report. ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  [< Back]                    [Save Draft]              [Continue >]         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Method Applicability Logic

#### Existing Backend Logic (from `valuationEngineService.ts`)

```typescript
// Already implemented in backend
const METHOD_APPLICABILITY: Record<string, ValuationMethod[]> = {
  house: ['sales_comparison', 'cost_approach'],
  apartment: ['sales_comparison', 'cost_approach', 'income_approach'],
  townhouse: ['sales_comparison', 'cost_approach'],
  villa: ['sales_comparison', 'cost_approach'],
  land: ['sales_comparison', 'residual_method'],
  commercial: ['sales_comparison', 'income_approach', 'cost_approach'],
  office: ['income_approach', 'sales_comparison', 'cost_approach'],
  retail: ['income_approach', 'sales_comparison', 'profits_method'],
  industrial: ['cost_approach', 'income_approach', 'sales_comparison'],
  hotel: ['profits_method', 'income_approach'],
  hospital: ['drc_method', 'profits_method'],
  school: ['drc_method', 'cost_approach'],
  religious: ['drc_method', 'cost_approach'],
  mixed_use: ['income_approach', 'sales_comparison', 'residual_method'],
};
```

### Enhanced Frontend Logic

```typescript
interface MethodApplicabilityResult {
  method: ValuationMethod;
  is_applicable: boolean;
  applicability_reason: string;
  data_quality_score: number;        // 0-100
  data_quality_factors: string[];
  recommended_weight: number;        // 0-100
  weight_reason: string;
  can_be_overridden: boolean;
}

interface MethodSelectionState {
  property_type: string;
  valuation_purpose: string;
  hbu_result: 'current_use' | 'alternative_use' | 'development';
  
  // Auto-calculated
  auto_selection: MethodApplicabilityResult[];
  
  // User modifications
  user_overrides: {
    method: ValuationMethod;
    include: boolean;
    custom_weight?: number;
    justification: string;
  }[];
  
  // Final selection
  final_methods: ValuationMethod[];
  final_weights: Record<ValuationMethod, number>;
}
```

### Data Quality Indicators

| Indicator | Calculation | Impact |
|-----------|-------------|--------|
| Comparable Count | Count within search radius | High count → higher Sales Comp weight |
| Comparable Age | Average days since sale | Fresher data → higher confidence |
| Rental Data Available | Rental listings/transactions | Required for Income Approach |
| Construction Costs | Region-specific cost data | Required for Cost Approach |
| Development Potential | HBU indicates development | Enables Residual Method |
| Trading History | Business revenue data | Required for Profits Method |

### Validation Rules

| Rule | Validation | Error Message |
|------|------------|---------------|
| At least one method | ≥1 method selected | "Select at least one valuation method" |
| Weights sum to 100% | Total = 100 | "Method weights must sum to 100%" |
| Override justification | If override, reason required | "Provide justification for override" |
| Data availability | Selected methods have data | "Insufficient data for [method]" |

### API Calls

| Action | Endpoint | Method | Payload |
|--------|----------|--------|---------|
| Get recommendations | `/api/valuations/:id/method-selection` | GET | - |
| Save selection | `/api/valuations/:id/method-selection` | PUT | `{ methods, weights, overrides }` |
| Get data quality | `/api/valuations/:id/data-quality` | GET | - |

---

## Step 4: Market Data Context

### Overview

The Market Context Panel provides a **read-only** view of current economic and market conditions that inform all valuation calculations. This data is referenced throughout the valuation process and displayed in the final reconciliation.

### UI Design: Market Context Panel

#### Screen Layout (Persistent Sidebar or Collapsible Panel)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ MARKET DATA CONTEXT                               [↻ Refresh] [Collapse ▲] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ ECONOMIC INDICATORS                                 As of: 08 Jan 2026 ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  Inflation Rate (YoY)           GDP Growth (YoY)                       ││
│  │  ████████████░░░ 23.2%          ████████░░░░░░░ 5.8%                   ││
│  │  ▲ +1.2% from last month        ▼ -0.3% from last quarter             ││
│  │                                                                         ││
│  │  Policy Rate (BoG)              USD/GHS Exchange                       ││
│  │  ████████████░░░ 29.5%          ████████████░░░ 15.45                  ││
│  │  ▲ +50 bps (Dec 2025)           ▲ +8.2% YTD                            ││
│  │                                                                         ││
│  │  Mortgage Rate (Avg)            Unemployment Rate                      ││
│  │  ████████████████ 32.5%         ████████░░░░░░░ 4.7%                   ││
│  │  → Stable                       ▼ -0.2% from Q3                        ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ MARKET CONDITIONS: Greater Accra - Residential                          ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  Market Trend           Market Activity         Market Cycle            ││
│  │  ▲ RISING               ●●●○○ MODERATE          ◐ EXPANSION             ││
│  │  +6.8% (12M)            ~45 transactions/mo     Early stage             ││
│  │                                                                         ││
│  │  ┌───────────────────────────────────────────────────────────────────┐ ││
│  │  │ PRICE INDEX TREND (12 Months)                                     │ ││
│  │  │                                                          ▲        │ ││
│  │  │                                                    ●────●         │ ││
│  │  │                                              ●────●               │ ││
│  │  │                                        ●────●                     │ ││
│  │  │                                  ●────●                           │ ││
│  │  │                            ●────●                                 │ ││
│  │  │  ●────●────●────●────●────●                                       │ ││
│  │  │  Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec  Jan  │ ││
│  │  │  2025                                                       2026  │ ││
│  │  └───────────────────────────────────────────────────────────────────┘ ││
│  │                                                                         ││
│  │  Price Index (Current)     Days on Market (Avg)    Inventory Level     ││
│  │  ██████████████░░ 124.5    ████████░░░░ 67 days    ●●●○○ BALANCED      ││
│  │  Base: 100 (Jan 2024)      ▼ -12 days from Q3     Supply = Demand      ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ DERIVED RISK PREMIUMS                                                   ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  Base Discount Rate        Risk-Free Rate          Market Risk Premium ││
│  │  14.0%                     29.5% (Policy Rate)     4.5%                ││
│  │                                                                         ││
│  │  Cap Rate Range            Terminal Cap Rate       Yield Adjustment    ││
│  │  6.5% - 8.5%               7.0% - 9.0%             +0.5% (inflation)   ││
│  │                                                                         ││
│  │  ⓘ These rates are derived from market analysis and should be         ││
│  │    reviewed for each specific property circumstance.                   ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ SEASONAL FACTORS                                   Current Month: Jan  ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  Seasonal Adjustment Factor: 0.98 (Post-holiday slowdown)              ││
│  │                                                                         ││
│  │  Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  Sep  Oct  Nov  Dec            ││
│  │  0.98 0.99 1.02 1.01 1.00 0.98 0.97 0.97 1.00 1.02 1.03 1.03           ││
│  │   ▲                                                                    ││
│  │  Current                                                               ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  Data Sources: Bank of Ghana, Ghana Statistical Service, PROPMETRIK DB    │
│  Last Updated: 08 Jan 2026, 09:45 GMT                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Existing Backend Integration

#### Market Data Service (Already Built)

The following data is available from `marketDataService.ts`:

```typescript
// EXISTING - from marketDataService.ts
interface MarketConditions {
  trend: 'rising' | 'stable' | 'falling' | 'unknown';
  trend_strength: number;
  activity_level: 'high' | 'moderate' | 'low' | 'unknown';
  days_on_market_avg: number | null;
  supply_demand_ratio: number | null;
  price_index: number | null;
  price_index_change_yoy: number | null;
  
  // Extended
  market_trend?: string;
  price_trend_12m?: number;
  price_trend_3m?: number;
  market_activity?: string;
  days_on_market?: number;
  inventory_level?: string;
  seasonal_factor?: number;
  cycle_phase?: string;
  market_index?: number;
  market_adjustment?: number;
  economic_factors?: EconomicFactors;
  
  price_metrics?: {
    median_price?: number;
    avg_price?: number;
    price_per_sqm?: number;
    average_per_sqm?: number;
    median_per_sqm?: number;
    year_over_year_change?: number;
    price_range?: { min: number; max: number };
  };
}

interface EconomicFactors {
  inflation_rate: number | null;
  interest_rate_policy: number | null;
  interest_rate?: number;
  mortgage_rate_avg: number | null;
  exchange_rate_usd: number | null;
  gdp_growth: number | null;
  gdp_growth_rate?: number;
  construction_cost_index: number | null;
  unemployment_rate?: number;
  consumer_confidence?: number;
  currency_stability?: 'volatile' | 'stable' | 'strengthening';
  economic_outlook?: 'negative' | 'neutral' | 'positive';
  snapshot_date: Date;
}
```

#### Existing API Endpoints

| Endpoint | Method | Description | Status |
|----------|--------|-------------|--------|
| `/api/valuations/market/:region` | GET | Market conditions for region | ✅ Built |
| `/api/valuations/market/:region/indices` | GET | Market index history | ✅ Built |

### Frontend Component

```typescript
interface MarketContextPanelProps {
  region: RegionCode;
  propertyType: string;
  valuationDate: Date;
  onDataLoad?: (data: MarketContextData) => void;
}

interface MarketContextData {
  economic: EconomicFactors;
  market: MarketConditions;
  indices: MarketIndex[];
  riskPremiums: RiskPremiums;
  seasonalFactor: number;
  dataFreshness: 'current' | 'stale' | 'outdated';
  lastUpdated: Date;
}

interface RiskPremiums {
  base_discount_rate: number;
  risk_free_rate: number;
  market_risk_premium: number;
  cap_rate_range: { min: number; max: number };
  terminal_cap_rate_range: { min: number; max: number };
  yield_adjustment: number;
}
```

### Usage in Valuation Methods

The Market Context data flows into each valuation method:

| Method | Market Data Used |
|--------|------------------|
| **Sales Comparison** | Time adjustment factor, seasonal adjustment |
| **Income Approach** | Cap rates, discount rates, vacancy rates |
| **Cost Approach** | Construction cost index, inflation adjustment |
| **Residual Method** | Finance rates, developer profit margins |
| **Profits Method** | Industry-specific yields, economic outlook |
| **DRC Method** | Replacement cost indices, depreciation factors |

---

## Step 5: Cost Inputs Module

### Overview

The Cost Inputs Module provides a **shared data layer** for construction costs, material prices, and labor rates used by both the **Cost Approach** and **Residual Method**. All defaults are transparent, with mandatory justification for any user overrides.

### UI Design: Cost Inputs Studio

#### Screen Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ VALUATION: VL-2026-00042 │ COST INPUTS MODULE                    │ Step 5/8 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ COST DATA CONFIGURATION                                                 ││
│  │ Region: Greater Accra │ Property Type: Residential │ Quality: Standard ││
│  │ ⓘ Costs are pre-populated from PROPMETRIK's Ghana Construction Database││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌───────────────────────────────────────────────┬─────────────────────────┐│
│  │ CONSTRUCTION COST RATES                       │ METADATA                ││
│  ├───────────────────────────────────────────────┼─────────────────────────┤│
│  │                                               │                         ││
│  │  Base Construction Cost                       │ Source: PROPMETRIK DB   ││
│  │  ┌─────────────────────────────────────────┐  │ Last Updated: Dec 2025  ││
│  │  │ System Default: GHS 4,000 / m²          │  │ Sample Size: 234 builds ││
│  │  │ [●] Use Default  [ ] Override            │  │ Confidence: High        ││
│  │  └─────────────────────────────────────────┘  │                         ││
│  │                                               │                         ││
│  │  Regional Multiplier                          │ Region: Greater Accra   ││
│  │  ┌─────────────────────────────────────────┐  │ Multiplier: 1.15x       ││
│  │  │ Factor: 1.15 (Accra premium)            │  │ (vs Kumasi base)        ││
│  │  │ Adjusted Rate: GHS 4,600 / m²           │  │                         ││
│  │  └─────────────────────────────────────────┘  │                         ││
│  │                                               │                         ││
│  └───────────────────────────────────────────────┴─────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ MATERIAL PRICES (Expandable Section)                           [Expand]││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  ┌────────────────────┬──────────┬──────────┬────────┬─────────────────┐││
│  │  │ Material           │ Unit     │ Default  │ Your   │ Status          │││
│  │  │                    │          │ Price    │ Price  │                 │││
│  │  ├────────────────────┼──────────┼──────────┼────────┼─────────────────┤││
│  │  │ Cement (50kg bag)  │ per bag  │ GHS 95   │ --     │ ○ Using Default │││
│  │  │ Sand (fine)        │ per m³   │ GHS 450  │ --     │ ○ Using Default │││
│  │  │ Sand (coarse)      │ per m³   │ GHS 380  │ --     │ ○ Using Default │││
│  │  │ Granite (3/4")     │ per m³   │ GHS 650  │ --     │ ○ Using Default │││
│  │  │ Steel Rebar (12mm) │ per ton  │ GHS 9,200│ 9,500  │ ● OVERRIDDEN    │││
│  │  │ Roofing Sheets     │ per m²   │ GHS 180  │ --     │ ○ Using Default │││
│  │  │ Tiles (floor)      │ per m²   │ GHS 120  │ --     │ ○ Using Default │││
│  │  │ Paint (exterior)   │ per ltr  │ GHS 85   │ --     │ ○ Using Default │││
│  │  │ Electrical Wiring  │ per m    │ GHS 25   │ --     │ ○ Using Default │││
│  │  │ Plumbing Pipes     │ per m    │ GHS 45   │ --     │ ○ Using Default │││
│  │  └────────────────────┴──────────┴──────────┴────────┴─────────────────┘││
│  │                                                                         ││
│  │  ⚠ 1 material price overridden - will appear in report disclaimer      ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ LABOR RATES                                                    [Expand]││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  ┌────────────────────┬──────────┬──────────┬────────┬─────────────────┐││
│  │  │ Trade              │ Unit     │ Default  │ Your   │ Status          │││
│  │  │                    │          │ Rate     │ Rate   │                 │││
│  │  ├────────────────────┼──────────┼──────────┼────────┼─────────────────┤││
│  │  │ Mason/Bricklayer   │ per day  │ GHS 180  │ --     │ ○ Using Default │││
│  │  │ Carpenter          │ per day  │ GHS 200  │ --     │ ○ Using Default │││
│  │  │ Electrician        │ per day  │ GHS 220  │ --     │ ○ Using Default │││
│  │  │ Plumber            │ per day  │ GHS 200  │ --     │ ○ Using Default │││
│  │  │ Painter            │ per day  │ GHS 150  │ --     │ ○ Using Default │││
│  │  │ General Laborer    │ per day  │ GHS 80   │ --     │ ○ Using Default │││
│  │  │ Tile Setter        │ per day  │ GHS 180  │ --     │ ○ Using Default │││
│  │  │ Welder             │ per day  │ GHS 250  │ --     │ ○ Using Default │││
│  │  └────────────────────┴──────────┴──────────┴────────┴─────────────────┘││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ OVERRIDE DETAILS                                                        ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  Steel Rebar (12mm): GHS 9,200 → GHS 9,500 (+3.3%)                      ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │ Reason for Override (REQUIRED):                                     │││
│  │  │ ┌─────────────────────────────────────────────────────────────────┐ │││
│  │  │ │ Recent supplier quotations from ABC Steel (Dec 2025) show      │ │││
│  │  │ │ current market price of GHS 9,500/ton due to import tariff     │ │││
│  │  │ │ increases effective November 2025.                             │ │││
│  │  │ └─────────────────────────────────────────────────────────────────┘ │││
│  │  │                                                                     │││
│  │  │ Supporting Evidence (Optional):                                     │││
│  │  │ [📎 Upload quotation or price list]                                 │││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ COST BREAKDOWN PREVIEW (Based on Measurements: 248 m²)                  ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  Component             │ % of Total │ Estimated Cost                    ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  Structure             │ 40%        │ GHS 456,320                       ││
│  │  Finishing             │ 25%        │ GHS 285,200                       ││
│  │  Electrical            │ 10%        │ GHS 114,080                       ││
│  │  Mechanical            │  8%        │ GHS  91,264                       ││
│  │  Plumbing              │  7%        │ GHS  79,856                       ││
│  │  External Works        │  5%        │ GHS  57,040                       ││
│  │  Professional Fees     │  3%        │ GHS  34,224                       ││
│  │  Contingency           │  2%        │ GHS  22,816                       ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  TOTAL RCN             │ 100%       │ GHS 1,140,800                     ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  [< Back]                    [Save Draft]              [Continue >]         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Existing Backend Data

#### Cost Approach Service Constants (Already Built)

From `costApproachService.ts`:

```typescript
// EXISTING - Base construction costs per sqm by property type and quality (GHS)
const BASE_COSTS_PER_SQM: Record<string, Record<string, number>> = {
  house: { basic: 2500, standard: 4000, premium: 6500, luxury: 12000 },
  apartment: { basic: 2000, standard: 3500, premium: 5500, luxury: 9000 },
  townhouse: { basic: 2200, standard: 3800, premium: 6000, luxury: 10000 },
  villa: { basic: 4000, standard: 6000, premium: 9000, luxury: 15000 },
  commercial: { basic: 3000, standard: 4500, premium: 7000, luxury: 12000 },
  office: { basic: 3500, standard: 5500, premium: 8000, luxury: 14000 },
  industrial: { basic: 1500, standard: 2500, premium: 4000, luxury: 6000 },
  warehouse: { basic: 1200, standard: 2000, premium: 3500, luxury: 5000 },
};

// EXISTING - Regional cost multipliers
const REGIONAL_MULTIPLIERS: Record<RegionCode, number> = {
  greater_accra: 1.15,
  kumasi_metro: 1.00,
  eastern: 0.95,
  western_cluster: 1.05,
  northern_cluster: 0.85,
};

// EXISTING - Cost breakdown percentages
const COST_BREAKDOWN_PERCENTAGES: Record<string, number> = {
  structure: 0.40,
  finishing: 0.25,
  mechanical: 0.08,
  electrical: 0.10,
  plumbing: 0.07,
  external_works: 0.05,
  professional_fees: 0.03,
  contingency: 0.02,
};
```

### Required Backend Enhancement

#### Material & Labor Price Database

**Status:** 🔴 NOT YET BUILT - Currently hardcoded constants

```sql
-- NEW TABLE: construction_materials
CREATE TABLE construction_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL,  -- 'cement', 'steel', 'roofing', etc.
  name VARCHAR(100) NOT NULL,
  unit VARCHAR(20) NOT NULL,      -- 'bag', 'ton', 'm²', etc.
  base_price DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'GHS',
  region region_code_enum,        -- NULL = all regions
  quality_tier VARCHAR(20),       -- 'basic', 'standard', 'premium'
  
  -- Source tracking
  source VARCHAR(200),
  source_date DATE,
  sample_size INTEGER,
  
  -- Validity
  effective_date DATE NOT NULL,
  expiry_date DATE,
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- NEW TABLE: labor_rates
CREATE TABLE labor_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade VARCHAR(100) NOT NULL,    -- 'mason', 'electrician', etc.
  skill_level VARCHAR(20),        -- 'apprentice', 'journeyman', 'master'
  unit VARCHAR(20) NOT NULL,      -- 'day', 'hour', 'job'
  base_rate DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'GHS',
  region region_code_enum,
  
  -- Source
  source VARCHAR(200),
  source_date DATE,
  
  -- Validity
  effective_date DATE NOT NULL,
  expiry_date DATE,
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Override Tracking Integration

When any cost input is overridden, it is recorded in `valuation_user_overrides`:

```typescript
interface CostInputOverride {
  category: 'cost_input';
  field_name: string;  // e.g., 'material.steel_rebar_12mm'
  field_label: string; // e.g., 'Steel Rebar (12mm)'
  system_default_value: number;
  user_override_value: number;
  unit: string;        // e.g., 'GHS/ton'
  reason: string;      // Required justification
  supporting_evidence?: string; // Optional file reference
}
```

### Disclaimer Generation

Overridden cost inputs automatically generate disclaimers:

```typescript
function generateCostDisclaimer(override: CostInputOverride): string {
  const change = ((override.user_override_value - override.system_default_value) 
                  / override.system_default_value * 100).toFixed(1);
  const direction = parseFloat(change) > 0 ? 'increased' : 'decreased';
  
  return `The ${override.field_label} rate was ${direction} from the system ` +
         `default of ${override.system_default_value} ${override.unit} to ` +
         `${override.user_override_value} ${override.unit} (${change}%). ` +
         `Reason: ${override.reason}`;
}
```

### Data Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Cost Inputs   │────▶│   Cost         │────▶│   Residual      │
│   Module        │     │   Approach      │     │   Method        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Overrides      │────▶│  RCN Calc       │     │  Dev Cost Calc  │
│  Tracked        │     │  GHS 1,140,800  │     │  GHS 1,350,000  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │
        ▼
┌─────────────────┐
│  Report         │
│  Disclaimers    │
└─────────────────┘
```

### Validation Rules

| Rule | Validation | Error Message |
|------|------------|---------------|
| Override reason | If overridden, reason ≥ 20 chars | "Provide detailed justification" |
| Reasonable range | Override within ±50% of default | "Override seems unrealistic" |
| Consistency | Related materials consistent | "Check steel price vs iron" |

---

## Step 6: Method-Specific Workflows

Each valuation method has its own dedicated workflow panel. Methods are accessed based on HBU analysis and method selection from Step 3.

---

### 6.1 Sales Comparison Approach

#### Overview

The Sales Comparison Approach is typically the **primary method** for residential properties. It derives value from direct comparison with recent sales of similar properties, applying adjustments for differences.

#### Backend Service (Built)

From `salesComparisonService.ts` (979 lines):

```typescript
// EXISTING - Adjustment categories with sub-items
const ADJUSTMENT_CATEGORIES: AdjustmentCategory[] = [
  {
    category: 'physical',
    subcategories: [
      { name: 'building_area', max_adjustment: 0.25, unit: 'sqm' },
      { name: 'lot_size', max_adjustment: 0.20, unit: 'sqm' },
      { name: 'bedrooms', max_adjustment: 0.05, unit: 'count' },
      { name: 'bathrooms', max_adjustment: 0.04, unit: 'count' },
      { name: 'age', max_adjustment: 0.15, unit: 'years' },
      { name: 'condition', max_adjustment: 0.15, unit: 'rating' },
      { name: 'quality', max_adjustment: 0.20, unit: 'rating' },
    ],
  },
  {
    category: 'location',
    subcategories: [
      { name: 'neighborhood', max_adjustment: 0.25, unit: 'rating' },
      { name: 'view', max_adjustment: 0.10, unit: 'rating' },
      { name: 'accessibility', max_adjustment: 0.08, unit: 'rating' },
      { name: 'proximity_to_amenities', max_adjustment: 0.10, unit: 'rating' },
    ],
  },
  {
    category: 'legal_economic',
    subcategories: [
      { name: 'title_type', max_adjustment: 0.10, unit: 'category' },
      { name: 'financing_terms', max_adjustment: 0.05, unit: 'category' },
      { name: 'sale_conditions', max_adjustment: 0.10, unit: 'category' },
    ],
  },
];
```

#### UI Design: Sales Comparison Studio

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ VALUATION: VL-2026-00042 │ SALES COMPARISON APPROACH               │ 6.1/8 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ COMPARABLE BASKET                                    [🔍 Find More]     ││
│  │ Subject: 4 Bed House, East Legon │ 248 m² │ Built 2018                  ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  ┌──────────────────────────────────────────────────────────────────┐  ││
│  │  │ 🗺️ MAP VIEW                                         [Satellite] │  ││
│  │  │ ┌────────────────────────────────────────────────────────────┐   │  ││
│  │  │ │                                                            │   │  ││
│  │  │ │                    [C1]●                                   │   │  ││
│  │  │ │                              [C2]●                         │   │  ││
│  │  │ │        [SUBJECT]★                                          │   │  ││
│  │  │ │                                        [C3]●               │   │  ││
│  │  │ │                    [C4]●                                   │   │  ││
│  │  │ │                                                            │   │  ││
│  │  │ │  ★ Subject   ● Selected Comparable   ○ Available           │   │  ││
│  │  │ │                                                            │   │  ││
│  │  │ └────────────────────────────────────────────────────────────┘   │  ││
│  │  └──────────────────────────────────────────────────────────────────┘  ││
│  │                                                                         ││
│  │  SELECTED COMPARABLES (4)                                              ││
│  │  ┌────────┬─────────────────────────┬────────┬────────┬────────────────┐││
│  │  │ ID     │ Address                 │ Price  │ Dist.  │ Quality        │││
│  │  ├────────┼─────────────────────────┼────────┼────────┼────────────────┤││
│  │  │ C1     │ 12 Boundary Rd, E.L.    │$385K   │ 0.3km  │ ●●●●○ Very Good│││
│  │  │ C2     │ 7 Labone Cres, E.L.     │$420K   │ 0.6km  │ ●●●○○ Good     │││
│  │  │ C3     │ 22 Airport Rd, E.L.     │$350K   │ 0.9km  │ ●●●●● Excellent│││
│  │  │ C4     │ 5 Shiashie Ave, E.L.    │$395K   │ 0.4km  │ ●●●●○ Very Good│││
│  │  └────────┴─────────────────────────┴────────┴────────┴────────────────┘││
│  │                                                                         ││
│  │  [+ Add Comparable]  [↑ Import from Basket]  [⚠ Missing Comparables?]  ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ ADJUSTMENT GRID                                                         ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  ┌──────────────────┬─────────┬─────────┬─────────┬─────────┬─────────┐││
│  │  │ Element          │ Subject │ C1      │ C2      │ C3      │ C4      │││
│  │  ├──────────────────┼─────────┼─────────┼─────────┼─────────┼─────────┤││
│  │  │ Sale Price       │    --   │ $385K   │ $420K   │ $350K   │ $395K   │││
│  │  │ Sale Date        │    --   │ Nov 25  │ Oct 25  │ Sep 25  │ Dec 25  │││
│  │  ├──────────────────┼─────────┼─────────┼─────────┼─────────┼─────────┤││
│  │  │ PHYSICAL         │         │         │         │         │         │││
│  │  │  GBA (m²)        │ 248     │ 260     │ 280     │ 220     │ 245     │││
│  │  │    Adjustment    │    --   │ -4.6%   │ -12.9%  │ +12.7%  │ +1.2%   │││
│  │  │  Bedrooms        │ 4       │ 4       │ 5       │ 4       │ 4       │││
│  │  │    Adjustment    │    --   │ 0%      │ -5.0%   │ 0%      │ 0%      │││
│  │  │  Bathrooms       │ 3       │ 3       │ 4       │ 2       │ 3       │││
│  │  │    Adjustment    │    --   │ 0%      │ -4.0%   │ +4.0%   │ 0%      │││
│  │  │  Age (years)     │ 7       │ 5       │ 8       │ 3       │ 6       │││
│  │  │    Adjustment    │    --   │ -2.0%   │ +1.0%   │ -4.0%   │ -1.0%   │││
│  │  │  Condition       │ Good    │ V.Good  │ Good    │ Excellent│ Good   │││
│  │  │    Adjustment    │    --   │ -5.0%   │ 0%      │ -10.0%  │ 0%      │││
│  │  ├──────────────────┼─────────┼─────────┼─────────┼─────────┼─────────┤││
│  │  │ LOCATION         │         │         │         │         │         │││
│  │  │  Neighborhood    │ Prime   │ Prime   │ Prime-  │ Prime+  │ Prime   │││
│  │  │    Adjustment    │    --   │ 0%      │ +3.0%   │ -5.0%   │ 0%      │││
│  │  ├──────────────────┼─────────┼─────────┼─────────┼─────────┼─────────┤││
│  │  │ TIME ADJUSTMENT  │         │         │         │         │         │││
│  │  │  Months since    │ 0       │ 2       │ 3       │ 4       │ 1       │││
│  │  │    Adjustment    │    --   │ +1.2%   │ +1.8%   │ +2.4%   │ +0.6%   │││
│  │  ├──────────────────┼─────────┼─────────┼─────────┼─────────┼─────────┤││
│  │  │ GROSS ADJ.       │    --   │ -10.4%  │ -16.1%  │ +0.1%   │ +0.8%   │││
│  │  │ ADJUSTED PRICE   │    --   │ $345K   │ $352K   │ $350K   │ $398K   │││
│  │  └──────────────────┴─────────┴─────────┴─────────┴─────────┴─────────┘││
│  │                                                                         ││
│  │  ⓘ Adjustments are pre-calculated. Click any cell to override.         ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ VALUE RECONCILIATION                                                    ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  Value Range: $345,000 - $398,000                                       ││
│  │                                                                         ││
│  │  Weighting Method:                                                      ││
│  │  [●] Quality-Weighted Average  [ ] Simple Average  [ ] Median           ││
│  │                                                                         ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │ Comparable │ Adj Price │ Quality Score │ Weight │ Weighted Value    │││
│  │  ├─────────────────────────────────────────────────────────────────────┤││
│  │  │ C1         │ $345,000  │ 85%           │ 25.8%  │ $89,010           │││
│  │  │ C2         │ $352,000  │ 72%           │ 21.8%  │ $76,736           │││
│  │  │ C3         │ $350,000  │ 90%           │ 27.3%  │ $95,550           │││
│  │  │ C4         │ $398,000  │ 83%           │ 25.2%  │ $100,296          │││
│  │  ├─────────────────────────────────────────────────────────────────────┤││
│  │  │ INDICATED VALUE (Sales Comparison)            │ $361,592 ≈ $362,000│││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  │                                                                         ││
│  │  Confidence: ●●●●○ HIGH (4 quality comparables, low gross adjustments) ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  [< Back to Method Selection]          [Save & Continue to Cost Approach >]│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Comparable Selection Criteria

| Criterion | Ideal | Acceptable | Flag |
|-----------|-------|------------|------|
| Sale age | < 6 months | < 12 months | > 12 months |
| Distance | < 1 km | < 3 km | > 5 km |
| Size difference | < 10% | < 25% | > 30% |
| Gross adjustment | < 15% | < 25% | > 30% |
| Min comparables | 5+ | 3-4 | < 3 |

---

### 6.2 Cost Approach

#### Overview

The Cost Approach estimates value based on **Replacement Cost New (RCN)** minus **Depreciation** plus **Land Value**. It is appropriate for new construction, special purpose properties, or when sales data is insufficient.

#### Backend Service (Built)

From `costApproachService.ts` (592 lines):

```typescript
// EXISTING - Depreciation calculation
interface DepreciationAnalysis {
  physical_depreciation: {
    effective_age: number;
    useful_life: number;
    rate: number;
    amount: number;
    method: 'age-life' | 'observed' | 'breakdown';
  };
  functional_obsolescence: {
    amount: number;
    items: string[];
    curable_percentage: number;
  };
  external_obsolescence: {
    amount: number;
    factors: string[];
    market_conditions_adjustment: number;
  };
  total_depreciation: number;
  total_depreciation_percentage: number;
}
```

#### UI Design: Cost Approach Studio

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ VALUATION: VL-2026-00042 │ COST APPROACH                           │ 6.2/8 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ LAND VALUE ESTIMATION                                                   ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  Site Area: 650 m² │ Location: East Legon, Greater Accra                ││
│  │                                                                         ││
│  │  Method: [ ] Direct Comparison  [●] Allocation  [ ] Extraction          ││
│  │                                                                         ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │ Land Comparable Analysis                                            │││
│  │  │                                                                     │││
│  │  │ Recent Land Sales (within 2km, last 12 months):                     │││
│  │  │ ┌──────────────┬─────────┬─────────────┬────────────────────────┐   │││
│  │  │ │ Address      │ Size    │ Price/m²    │ Adjusted Rate          │   │││
│  │  │ ├──────────────┼─────────┼─────────────┼────────────────────────┤   │││
│  │  │ │ Plot 15, E.L.│ 720 m²  │ $450/m²     │ $465/m² (+3.3% time)   │   │││
│  │  │ │ Plot 8, E.L. │ 580 m²  │ $480/m²     │ $490/m² (+2.1% time)   │   │││
│  │  │ │ Plot 22, E.L.│ 690 m²  │ $420/m²     │ $445/m² (+6.0% loc)    │   │││
│  │  │ └──────────────┴─────────┴─────────────┴────────────────────────┘   │││
│  │  │                                                                     │││
│  │  │ Indicated Land Value: $467/m² × 650 m² = $303,550 ≈ $304,000       │││
│  │  │                                                                     │││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  │                                                                         ││
│  │  ┌────────────────────────┬─────────────────────────────────────────────┐│
│  │  │ LAND VALUE             │ $304,000  (from Cost Inputs: $467/m²)      ││
│  │  │ [●] System Calculated  │ [ ] User Override                          ││
│  │  └────────────────────────┴─────────────────────────────────────────────┘│
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ REPLACEMENT COST NEW (RCN)                                              ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  ⓘ Using cost inputs from Step 5 (Cost Inputs Module)                  ││
│  │                                                                         ││
│  │  Building Area:     248 m² (from Floor Plan)                           ││
│  │  Base Cost Rate:    GHS 4,000/m² (Standard residential)                ││
│  │  Regional Factor:   × 1.15 (Greater Accra)                             ││
│  │  Adjusted Rate:     GHS 4,600/m²                                       ││
│  │                                                                         ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │ Cost Breakdown                                                      │││
│  │  │ ┌─────────────────────────────────┬──────────┬─────────────────────┐│││
│  │  │ │ Component                       │ %        │ Amount              ││││
│  │  │ ├─────────────────────────────────┼──────────┼─────────────────────┤│││
│  │  │ │ Structure (foundation, walls)   │ 40%      │ GHS 456,320         ││││
│  │  │ │ Finishing (floors, paint, etc.) │ 25%      │ GHS 285,200         ││││
│  │  │ │ Electrical systems              │ 10%      │ GHS 114,080         ││││
│  │  │ │ Mechanical (HVAC)               │ 8%       │ GHS 91,264          ││││
│  │  │ │ Plumbing                        │ 7%       │ GHS 79,856          ││││
│  │  │ │ External works                  │ 5%       │ GHS 57,040          ││││
│  │  │ │ Professional fees               │ 3%       │ GHS 34,224          ││││
│  │  │ │ Contingency                     │ 2%       │ GHS 22,816          ││││
│  │  │ ├─────────────────────────────────┼──────────┼─────────────────────┤│││
│  │  │ │ TOTAL RCN                       │ 100%     │ GHS 1,140,800       ││││
│  │  │ └─────────────────────────────────┴──────────┴─────────────────────┘│││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ DEPRECIATION ANALYSIS                                                   ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  1. PHYSICAL DEPRECIATION (Age-Life Method)                            ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │ Actual Age:      7 years                                            │││
│  │  │ Effective Age:   5 years (well-maintained)                          │││
│  │  │ Useful Life:     60 years (standard residential)                    │││
│  │  │ Depreciation Rate: 5 ÷ 60 = 8.33%                                   │││
│  │  │ Amount: 8.33% × GHS 1,140,800 = GHS 95,029                          │││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  │                                                                         ││
│  │  2. FUNCTIONAL OBSOLESCENCE                                            ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │ [ ] Outdated kitchen layout                                         │││
│  │  │ [ ] Inadequate electrical capacity                                  │││
│  │  │ [ ] Poor floor plan design                                          │││
│  │  │ [✓] No identified functional obsolescence                           │││
│  │  │                                                                     │││
│  │  │ Amount: GHS 0                                                       │││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  │                                                                         ││
│  │  3. EXTERNAL OBSOLESCENCE                                              ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │ [ ] Neighborhood decline                                            │││
│  │  │ [ ] Environmental factors                                           │││
│  │  │ [ ] Economic conditions affecting demand                            │││
│  │  │ [✓] No identified external obsolescence                             │││
│  │  │                                                                     │││
│  │  │ Amount: GHS 0                                                       │││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  │                                                                         ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │ TOTAL DEPRECIATION                                                  │││
│  │  │ Physical:    GHS 95,029                                             │││
│  │  │ Functional:  GHS 0                                                  │││
│  │  │ External:    GHS 0                                                  │││
│  │  │ ─────────────────────────────────────────────                       │││
│  │  │ TOTAL:       GHS 95,029 (8.33% of RCN)                              │││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ COST APPROACH SUMMARY                                                   ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  Land Value:                                GHS 304,000                ││
│  │  Replacement Cost New (RCN):               GHS 1,140,800               ││
│  │  Less: Total Depreciation:                (GHS 95,029)                 ││
│  │  ───────────────────────────────────────────────────────────           ││
│  │  INDICATED VALUE (Cost Approach):          GHS 1,349,771               ││
│  │                                                                         ││
│  │  Rounded:                                  GHS 1,350,000               ││
│  │  In USD (@ 15.45):                         $87,378                     ││
│  │                                                                         ││
│  │  Confidence: ●●●○○ MODERATE (New construction data good, land limited) ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  [< Back to Sales Comparison]           [Save & Continue to Income >]       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 6.3 Income Approach

#### Overview

The Income Approach is the **primary method** for income-producing properties. It includes three sub-methods:
1. **Direct Capitalization** - Single period income / Cap Rate
2. **Discounted Cash Flow (DCF)** - Multi-year projections
3. **Gross Rent Multiplier (GRM)** - Simplified for small residential

#### Backend Service (Built)

From `incomeApproachService.ts` (673 lines):

```typescript
// EXISTING - Income calculation methods
async calculateByMethod(
  propertyId: string,
  method: 'direct_capitalization' | 'dcf' | 'grm' | 'band_of_investment',
  inputs: IncomeInputs
): Promise<IncomeMethodResult>

// EXISTING - DCF Parameters
interface DCFParameters {
  projection_period: number;           // typically 5-10 years
  terminal_cap_rate: number;
  discount_rate: number;
  rent_growth_rate: number;
  expense_growth_rate: number;
  vacancy_rate: number;
}
```

#### UI Design: Income Approach Studio

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ VALUATION: VL-2026-00042 │ INCOME APPROACH                         │ 6.3/8 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ METHOD SELECTION                                                        ││
│  │ [●] Direct Capitalization  [ ] Discounted Cash Flow  [ ] Gross Rent Mult││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ INCOME ANALYSIS                                                         ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  POTENTIAL GROSS INCOME (PGI)                                          ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │ Unit/Space        │ Area    │ Monthly Rent │ Annual Rent            │││
│  │  ├───────────────────┼─────────┼──────────────┼────────────────────────┤││
│  │  │ Main Residence    │ 248 m²  │ GHS 8,500    │ GHS 102,000            │││
│  │  │ Outbuilding/BQ    │ 35 m²   │ GHS 1,500    │ GHS 18,000             │││
│  │  ├───────────────────┼─────────┼──────────────┼────────────────────────┤││
│  │  │ TOTAL PGI         │ 283 m²  │ GHS 10,000   │ GHS 120,000            │││
│  │  └───────────────────┴─────────┴──────────────┴────────────────────────┘││
│  │                                                                         ││
│  │  Market Rent Comparison:                                               ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │ Market Rate (4-bed, E.L.): GHS 7,500 - 10,000/month                 │││
│  │  │ Subject Contract Rent: GHS 8,500/month                              │││
│  │  │ Assessment: [●] At Market  [ ] Below Market  [ ] Above Market       │││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ VACANCY & COLLECTION LOSS                                               ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  Market Vacancy Rate (East Legon, Residential): 5.0%                   ││
│  │                                                                         ││
│  │  Vacancy Allowance:   [   5.0 ] %  ──●──────────────  (GHS 6,000)      ││
│  │                        0%    5%    10%    15%                          ││
│  │                                                                         ││
│  │  Collection Loss:     [   2.0 ] %                     (GHS 2,400)      ││
│  │                                                                         ││
│  │  ─────────────────────────────────────────────────────────────────────  ││
│  │  EFFECTIVE GROSS INCOME (EGI): GHS 120,000 - GHS 8,400 = GHS 111,600   ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ OPERATING EXPENSES                                                      ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  ┌──────────────────────────────────┬──────────┬───────┬───────────────┐││
│  │  │ Expense Category                 │ Annual   │ % EGI │ Source        │││
│  │  ├──────────────────────────────────┼──────────┼───────┼───────────────┤││
│  │  │ Property Taxes                   │ GHS 3,500│ 3.1%  │ Actual        │││
│  │  │ Insurance                        │ GHS 2,800│ 2.5%  │ Actual        │││
│  │  │ Property Management (8% EGI)     │ GHS 8,928│ 8.0%  │ Market        │││
│  │  │ Repairs & Maintenance            │ GHS 4,500│ 4.0%  │ Estimate      │││
│  │  │ Utilities (common areas)         │ GHS 1,200│ 1.1%  │ Actual        │││
│  │  │ Reserve for Replacement          │ GHS 3,000│ 2.7%  │ Standard      │││
│  │  ├──────────────────────────────────┼──────────┼───────┼───────────────┤││
│  │  │ TOTAL OPERATING EXPENSES         │ GHS23,928│ 21.4% │               │││
│  │  └──────────────────────────────────┴──────────┴───────┴───────────────┘││
│  │                                                                         ││
│  │  Expense Ratio Check: 21.4% [Within typical range 20-35% ✓]            ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ NET OPERATING INCOME (NOI)                                              ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  Effective Gross Income:           GHS 111,600                         ││
│  │  Less: Operating Expenses:        (GHS 23,928)                         ││
│  │  ───────────────────────────────────────────────                       ││
│  │  NET OPERATING INCOME:             GHS 87,672                          ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ CAPITALIZATION RATE ANALYSIS                                            ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  Cap Rate Derivation:                                                  ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │ Method              │ Rate   │ Weight │ Source                      │││
│  │  ├─────────────────────┼────────┼────────┼─────────────────────────────┤││
│  │  │ Market Extraction   │ 7.2%   │ 40%    │ 5 comparable sales          │││
│  │  │ Band of Investment  │ 7.8%   │ 30%    │ Mortgage + equity rates     │││
│  │  │ Survey/Published    │ 7.0%   │ 30%    │ GPC Q4 2025 report          │││
│  │  ├─────────────────────┼────────┼────────┼─────────────────────────────┤││
│  │  │ WEIGHTED CAP RATE   │ 7.3%   │ 100%   │ Rounded                     │││
│  │  └─────────────────────┴────────┴────────┴─────────────────────────────┘││
│  │                                                                         ││
│  │  Selected Cap Rate: [   7.3 ] %  ───────●────────── (Market range 6-9%)││
│  │                      6%         7.5%         9%                        ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ INCOME APPROACH SUMMARY (Direct Capitalization)                         ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  Net Operating Income:             GHS 87,672                          ││
│  │  Capitalization Rate:              ÷ 7.3%                              ││
│  │  ───────────────────────────────────────────────                       ││
│  │  INDICATED VALUE (Income Approach): GHS 1,201,260                      ││
│  │                                                                         ││
│  │  Rounded:                          GHS 1,200,000                       ││
│  │  In USD (@ 15.45):                 $77,670                             ││
│  │                                                                         ││
│  │  Confidence: ●●●●○ HIGH (Strong rental market data, verified income)   ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  [< Back to Cost Approach]              [Save & Continue to Residual >]     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 6.4 Residual Method

#### Overview

The Residual Method is used for **development properties** to determine land value or check development viability. It calculates the **Gross Development Value (GDV)** and works backwards to find residual land value.

#### Backend Service (Built)

From `residualMethodService.ts` (517 lines):

```typescript
// EXISTING - Development appraisal structure
interface DevelopmentAppraisal {
  gross_development_value: GDVCalculation;
  development_costs: DevelopmentCosts;
  finance_costs: FinanceCosts;
  developer_profit: DeveloperProfit;
  residual_land_value: ResidualLandValue;
  viability_analysis: ViabilityAnalysis;
}

interface DevelopmentCosts {
  construction_costs: ConstructionCosts;
  professional_fees: ProfessionalFees;
  statutory_fees: StatutoryFees;
  marketing_costs: MarketingCosts;
  contingency: ContingencyCosts;
}
```

#### UI Design: Residual Method Studio

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ VALUATION: VL-2026-00042 │ RESIDUAL METHOD                         │ 6.4/8 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ DEVELOPMENT SCHEME                                                      ││
│  │ Site Area: 2,500 m² │ Proposed: 12-Unit Apartment Block                ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ GROSS DEVELOPMENT VALUE (GDV)                                           ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  ┌────────────────┬─────────┬────────────┬───────────┬─────────────────┐││
│  │  │ Unit Type      │ Count   │ Area (m²)  │ Rate/m²   │ Value           │││
│  │  ├────────────────┼─────────┼────────────┼───────────┼─────────────────┤││
│  │  │ 2-Bed Apt      │ 4       │ 85 × 4     │ $2,800    │ $952,000        │││
│  │  │ 3-Bed Apt      │ 6       │ 120 × 6    │ $2,600    │ $1,872,000      │││
│  │  │ 4-Bed Penthouse│ 2       │ 180 × 2    │ $3,200    │ $1,152,000      │││
│  │  ├────────────────┼─────────┼────────────┼───────────┼─────────────────┤││
│  │  │ TOTAL GDV      │ 12      │ 1,420 m²   │           │ $3,976,000      │││
│  │  └────────────────┴─────────┴────────────┴───────────┴─────────────────┘││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ DEVELOPMENT COSTS                                                       ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  Construction (1,420 m² @ $1,800/m²):              $2,556,000          ││
│  │  Professional Fees (8% of construction):           $204,480            ││
│  │  Statutory Fees (permits, approvals):              $45,000             ││
│  │  Marketing & Sales (3% of GDV):                    $119,280            ││
│  │  Contingency (5% of construction):                 $127,800            ││
│  │  ───────────────────────────────────────────────────────────           ││
│  │  TOTAL DEVELOPMENT COSTS:                          $3,052,560          ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ FINANCE COSTS                                                           ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  Construction Period: 24 months                                        ││
│  │  Void Period (sales): 6 months                                         ││
│  │  Interest Rate: 28% p.a. (Ghana development finance)                   ││
│  │  S-Curve Financing: Average outstanding 50%                            ││
│  │                                                                         ││
│  │  Finance on Costs:    $3,052,560 × 50% × 28% × 2.5 yrs = $1,068,396    ││
│  │  Finance on Land:     (calculated on residual)                         ││
│  │  ───────────────────────────────────────────────────────────           ││
│  │  FINANCE COSTS:                                    $1,068,396          ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ DEVELOPER'S PROFIT                                                      ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  Profit Target: [  20  ] % of GDV                                      ││
│  │                 10%   15%   20%   25%   30%                            ││
│  │                              ●                                         ││
│  │                                                                         ││
│  │  Developer's Profit:  20% × $3,976,000 = $795,200                      ││
│  │                                                                         ││
│  │  ⓘ Typical range: 15-25% GDV (risk-adjusted)                           ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ RESIDUAL LAND VALUE CALCULATION                                         ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  Gross Development Value:                          $3,976,000          ││
│  │  Less: Development Costs:                         ($3,052,560)         ││
│  │  Less: Finance Costs:                             ($1,068,396)         ││
│  │  Less: Developer's Profit:                          ($795,200)         ││
│  │  ───────────────────────────────────────────────────────────           ││
│  │  GROSS RESIDUAL:                                   ($940,156)          ││
│  │                                                                         ││
│  │  ⚠ NEGATIVE RESIDUAL - Development not viable at current assumptions  ││
│  │                                                                         ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │ SENSITIVITY ANALYSIS                                                │││
│  │  │ ┌─────────────────────────────────────────────────────────────────┐ │││
│  │  │ │            │ GDV -10%  │ Base Case │ GDV +10%  │ GDV +20%      │ │││
│  │  │ ├─────────────────────────────────────────────────────────────────┤ │││
│  │  │ │ Cost -10%  │ ($643K)   │ ($540K)   │ ($142K)   │ $256K         │ │││
│  │  │ │ Base Case  │ ($1.24M)  │ ($940K)   │ ($542K)   │ ($144K)       │ │││
│  │  │ │ Cost +10%  │ ($1.55M)  │ ($1.24M)  │ ($848K)   │ ($450K)       │ │││
│  │  │ └─────────────────────────────────────────────────────────────────┘ │││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  │                                                                         ││
│  │  Breakeven Analysis:                                                   ││
│  │  • GDV required for breakeven: $5,180,000 (+30%)                       ││
│  │  • Or construction cost reduction needed: 31%                          ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  [< Back to Income]                     [Save & Continue to Profits >]      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 6.5 Profits Method

#### Overview

The Profits Method values **trade-related properties** (hotels, petrol stations, restaurants) based on the **maintainable operating profit (MOP)** of the business.

#### Backend Service (Built)

From `profitsMethodService.ts` (598 lines):

```typescript
// EXISTING - Profits calculation
interface ProfitsMethodResult {
  gross_revenue: GrossRevenue;
  operating_costs: OperatingCosts;
  maintainable_operating_profit: number;
  percentage_attributable_to_property: number;
  capitalization_rate: number;
  indicated_value: number;
  fair_maintainable_trade: FairMaintainableTrade;
}
```

#### UI Design: Profits Method Studio (Abbreviated)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ VALUATION: VL-2026-00042 │ PROFITS METHOD                          │ 6.5/8 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Property Type: [Hotel ▼]  │ Trading Period: 3 years                        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ REVENUE ANALYSIS (3-Year Average)                                       ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │ Room Revenue:        GHS 2,400,000/yr  (60 rooms × 65% occ × GHS 170)  ││
│  │ F&B Revenue:         GHS 1,200,000/yr                                   ││
│  │ Other Revenue:       GHS   300,000/yr                                   ││
│  │ ─────────────────────────────────────                                   ││
│  │ GROSS REVENUE:       GHS 3,900,000/yr                                   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ OPERATING COSTS                                                         ││
│  │ Departmental Costs:  GHS 1,560,000 (40% of revenue)                    ││
│  │ Admin & General:     GHS   390,000 (10%)                               ││
│  │ Marketing:           GHS   195,000 (5%)                                ││
│  │ Repairs/Maintenance: GHS   234,000 (6%)                                ││
│  │ Insurance & Taxes:   GHS   156,000 (4%)                                ││
│  │ ─────────────────────────────────────                                   ││
│  │ TOTAL COSTS:         GHS 2,535,000 (65%)                               ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ MAINTAINABLE OPERATING PROFIT                                           ││
│  │ Gross Revenue:                      GHS 3,900,000                       ││
│  │ Less: Operating Costs:             (GHS 2,535,000)                      ││
│  │ ─────────────────────────────────────                                   ││
│  │ MOP (before property costs):        GHS 1,365,000                       ││
│  │                                                                         ││
│  │ Portion Attributable to Property:   60% (excl. business goodwill)      ││
│  │ Property MOP:                       GHS   819,000                       ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ CAPITALIZATION                                                          ││
│  │ Property MOP:       GHS 819,000                                        ││
│  │ Cap Rate:           ÷ 9.0% (hotels, Ghana)                             ││
│  │ ─────────────────────────────────────                                   ││
│  │ INDICATED VALUE:    GHS 9,100,000                                       ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 6.6 Depreciated Replacement Cost (DRC) Method

#### Overview

DRC is used for **specialized properties** with no market (schools, hospitals, religious buildings, utilities). It applies the **Modern Equivalent Asset (MEA)** concept.

#### Backend Service (Built)

From `drcMethodService.ts` (606 lines):

```typescript
// EXISTING - DRC calculation
interface DRCResult {
  land_value: number;
  modern_equivalent_asset: MEACalculation;
  replacement_cost_new: number;
  depreciation: DepreciationBreakdown;
  depreciated_replacement_cost: number;
  service_potential_adjustment: number;
  final_value: number;
}

interface MEACalculation {
  original_asset_description: string;
  mea_description: string;
  mea_cost: number;
  efficiency_factor: number;
  adjusted_mea_cost: number;
}
```

#### UI Design: DRC Method Studio (Abbreviated)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ VALUATION: VL-2026-00042 │ DRC METHOD                              │ 6.6/8 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Specialized Property: [School ▼]  │ MEA Approach: [✓] Applied             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ MODERN EQUIVALENT ASSET (MEA)                                           ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │ Original Asset:   Traditional 20-classroom school (1,800 m²)           ││
│  │                   Built 1985, masonry construction                     ││
│  │                                                                         ││
│  │ Modern Equivalent: Modern 20-classroom school (1,500 m²)               ││
│  │                    Steel frame with better space efficiency            ││
│  │                                                                         ││
│  │ MEA Efficiency Factor: 1,500 / 1,800 = 0.833 (83.3%)                   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ DRC CALCULATION                                                         ││
│  │ Land Value:                         GHS 500,000                        ││
│  │ MEA Replacement Cost (1,500 m² @ GHS 5,000/m²): GHS 7,500,000          ││
│  │ Less: Physical Depreciation (40 yrs, 50-yr life = 80%): (GHS 6,000,000)││
│  │ Less: Functional Obsolescence:      (GHS 375,000)                      ││
│  │ Less: External Obsolescence:        (GHS 0)                            ││
│  │ ─────────────────────────────────────                                   ││
│  │ DEPRECIATED REPLACEMENT COST:       GHS 1,625,000                       ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Step 7: Reconciliation & Final Value

### Overview

The Reconciliation step brings together all method results to determine a single **final market value**. This is where the valuer applies professional judgment, supported by system-calculated confidence scores.

### Backend Service (Built)

From `valuationEngineService.ts`:

```typescript
// EXISTING - Hybrid weighting system
const DEFAULT_METHOD_WEIGHTS: Record<string, Record<string, number>> = {
  residential: {
    sales_comparison: 0.50,
    cost_approach: 0.25,
    income_approach: 0.25,
  },
  commercial: {
    sales_comparison: 0.20,
    cost_approach: 0.20,
    income_approach: 0.60,
  },
  industrial: {
    sales_comparison: 0.30,
    cost_approach: 0.40,
    income_approach: 0.30,
  },
  development: {
    residual_method: 0.70,
    sales_comparison: 0.20,
    cost_approach: 0.10,
  },
  specialized: {
    drc_method: 0.80,
    cost_approach: 0.20,
  },
};

// EXISTING - Confidence scoring
interface ConfidenceScore {
  data_quality_score: number;        // 0-1, quality of input data
  market_evidence_score: number;     // 0-1, strength of market support
  method_applicability_score: number;// 0-1, how appropriate is method
  overall_confidence: number;        // weighted average
  confidence_level: 'high' | 'moderate' | 'low';
  factors: ConfidenceFactor[];
}
```

### UI Design: Reconciliation Studio

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ VALUATION: VL-2026-00042 │ RECONCILIATION                          │ Step 7 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ METHOD RESULTS SUMMARY                                                  ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  ┌───────────────────────────────────────────────────────────────────┐  ││
│  │  │ VALUE DISTRIBUTION                                                │  ││
│  │  │                                                                   │  ││
│  │  │  GHS 1,200,000 ├──────────────●─────────────────────────┤ 1,400,000│ ││
│  │  │                        Income    Cost  Sales                      │  ││
│  │  │                        1,200K   1,350K  1,390K                    │  ││
│  │  │                                                                   │  ││
│  │  │                    Range: GHS 190,000 (15.8% spread)              │  ││
│  │  │                                                                   │  ││
│  │  └───────────────────────────────────────────────────────────────────┘  ││
│  │                                                                         ││
│  │  ┌────────────────┬────────────┬────────────┬────────────┬────────────┐││
│  │  │ Method         │ Value (GHS)│ Confidence │ Data Qual. │ Applicab.  │││
│  │  ├────────────────┼────────────┼────────────┼────────────┼────────────┤││
│  │  │ Sales Compar.  │ 1,390,000  │ ●●●●○ 85%  │ ●●●●○ 82%  │ ●●●●● 95%  │││
│  │  │ Cost Approach  │ 1,350,000  │ ●●●○○ 68%  │ ●●●●○ 75%  │ ●●●○○ 65%  │││
│  │  │ Income Appr.   │ 1,200,000  │ ●●●●○ 78%  │ ●●●○○ 70%  │ ●●●●○ 85%  │││
│  │  └────────────────┴────────────┴────────────┴────────────┴────────────┘││
│  │                                                                         ││
│  │  Primary Method: Sales Comparison (Residential, active market)         ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ WEIGHTING & RECONCILIATION                                              ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  Weighting Method:                                                      ││
│  │  [●] System-Calculated (Confidence-Based)                               ││
│  │  [ ] Standard Property Type Weights                                     ││
│  │  [ ] Custom Weights (requires justification)                            ││
│  │                                                                         ││
│  │  ┌────────────────┬────────────┬────────────┬────────────┬────────────┐││
│  │  │ Method         │ Value      │ System Wt  │ Your Wt    │ Weighted   │││
│  │  ├────────────────┼────────────┼────────────┼────────────┼────────────┤││
│  │  │ Sales Compar.  │ 1,390,000  │ 50%        │ [  50 ]%   │ 695,000    │││
│  │  │ Cost Approach  │ 1,350,000  │ 25%        │ [  25 ]%   │ 337,500    │││
│  │  │ Income Appr.   │ 1,200,000  │ 25%        │ [  25 ]%   │ 300,000    │││
│  │  ├────────────────┼────────────┼────────────┼────────────┼────────────┤││
│  │  │ TOTAL          │            │ 100%       │ 100%       │ 1,332,500  │││
│  │  └────────────────┴────────────┴────────────┴────────────┴────────────┘││
│  │                                                                         ││
│  │  ⓘ Weights should total 100%. System suggests 50-25-25 for residential.││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ FINAL VALUE DETERMINATION                                               ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  Weighted Average:                 GHS 1,332,500                        ││
│  │                                                                         ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │ FINAL MARKET VALUE SELECTION                                        │││
│  │  │                                                                     │││
│  │  │  [ ] Weighted Average:           GHS 1,332,500                      │││
│  │  │  [●] Primary Method (Sales):     GHS 1,390,000  ← Recommended       │││
│  │  │  [ ] Rounded Midpoint:           GHS 1,300,000                      │││
│  │  │  [ ] Custom Value:               GHS [_________]                    │││
│  │  │                                                                     │││
│  │  │  ⓘ Sales Comparison is recommended as primary for residential       │││
│  │  │    properties with good market evidence.                            │││
│  │  │                                                                     │││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  │                                                                         ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │ SELECTED FINAL VALUE                                                │││
│  │  │                                                                     │││
│  │  │  ╔═══════════════════════════════════════════════════════════════╗  │││
│  │  │  ║  MARKET VALUE: GHS 1,390,000                                  ║  │││
│  │  │  ║                                                               ║  │││
│  │  │  ║  In USD (@ 15.45): $89,968                                    ║  │││
│  │  │  ║  Value per m²: GHS 5,605 / $363                               ║  │││
│  │  │  ║                                                               ║  │││
│  │  │  ║  Valuation Date: 08 January 2026                              ║  │││
│  │  │  ╚═══════════════════════════════════════════════════════════════╝  │││
│  │  │                                                                     │││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  │                                                                         ││
│  │  Value Confidence: ●●●●○ HIGH                                          ││
│  │  Market Conditions: Rising (+6.8% 12M)                                 ││
│  │  Special Assumptions: None                                             ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ RECONCILIATION NARRATIVE (REQUIRED)                                     ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │ The Sales Comparison Approach is given greatest weight in this     │││
│  │  │ valuation as the subject property is a standard residential        │││
│  │  │ dwelling in an active market with good comparable sales evidence.  │││
│  │  │                                                                     │││
│  │  │ Four comparable sales were analyzed, all within 1km of the subject │││
│  │  │ and sold within the past 4 months. Gross adjustments ranged from   │││
│  │  │ 0.1% to 16.1%, with the most similar comparable requiring only     │││
│  │  │ 0.8% adjustment.                                                    │││
│  │  │                                                                     │││
│  │  │ The Cost Approach provides useful support but is considered less   │││
│  │  │ reliable as the property is 7 years old, introducing depreciation  │││
│  │  │ estimation uncertainty.                                             │││
│  │  │                                                                     │││
│  │  │ The Income Approach indicates a lower value, suggesting the        │││
│  │  │ rental market has not yet adjusted to rising capital values.       │││
│  │  │                                                                     │││
│  │  │ Based on the above analysis, the Market Value of GHS 1,390,000 is  │││
│  │  │ adopted, with primary reliance on the Sales Comparison Approach.   │││
│  │  │                                                                     │││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  │                                                                         ││
│  │  Character count: 847/1000 minimum  [✓ Meets requirement]              ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ OVERRIDE SUMMARY                                                        ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  User overrides made during this valuation:                            ││
│  │                                                                         ││
│  │  ┌──────────────────────────────────┬─────────┬─────────┬─────────────┐││
│  │  │ Field                            │ Default │ Override│ Reason      │││
│  │  ├──────────────────────────────────┼─────────┼─────────┼─────────────┤││
│  │  │ Steel Rebar (12mm)               │ GHS9,200│ GHS9,500│ Recent quote│││
│  │  │ Vacancy Rate                     │ 5.0%    │ 5.0%    │ (no change) │││
│  │  └──────────────────────────────────┴─────────┴─────────┴─────────────┘││
│  │                                                                         ││
│  │  ⓘ 1 material price override will appear in report disclaimers.       ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  [< Back to Methods]                           [Finalize & Generate Report]│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Reconciliation Rules

| Scenario | Action |
|----------|--------|
| Methods within 10% | Use weighted average |
| Methods >20% spread | Require detailed narrative |
| Single method only | Flag for review |
| Negative residual | Cannot be primary method |
| DRC for non-specialized | Warning flag |

### Data Saved at Reconciliation

```typescript
interface ReconciliationData {
  valuation_id: string;
  
  // Method results
  method_values: {
    method: ValuationMethod;
    indicated_value: number;
    confidence_score: number;
    data_quality_score: number;
    applicability_score: number;
  }[];
  
  // Weighting
  weighting_method: 'confidence_based' | 'standard' | 'custom';
  method_weights: Record<ValuationMethod, number>;
  weighted_average: number;
  
  // Final value
  final_value_selection: 'weighted_avg' | 'primary_method' | 'midpoint' | 'custom';
  final_market_value: number;
  
  // Narrative
  reconciliation_narrative: string;
  narrative_meets_minimum: boolean;
  
  // Audit
  overrides_summary: Override[];
  reconciled_by: string;
  reconciled_at: Date;
}
```

---

## Step 8: Report Generation & Delivery

### Overview

The final step generates IVS/RICS-compliant valuation reports in multiple formats. Reports include all methodology, evidence, adjustments, and required disclaimers.

### Backend Service (Built)

From `valuationReportService.ts`:

```typescript
// EXISTING - Report generation
interface ValuationReport {
  report_id: string;
  valuation_id: string;
  
  // Header
  report_number: string;
  report_date: Date;
  valuation_date: Date;
  purpose: string;
  
  // Property
  property_summary: PropertySummary;
  
  // Valuation
  basis_of_value: string;
  assumptions_conditions: string[];
  methodology: MethodologySection[];
  market_analysis: MarketAnalysis;
  reconciliation: ReconciliationSection;
  final_value: FinalValueSection;
  
  // Appendices
  appendices: ReportAppendix[];
  
  // Metadata
  prepared_by: ValuerDetails;
  reviewed_by: ValuerDetails | null;
  
  // Formats
  available_formats: ('pdf' | 'html' | 'docx')[];
}
```

### UI Design: Report Generation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ VALUATION: VL-2026-00042 │ REPORT GENERATION                       │ Step 8 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ REPORT CONFIGURATION                                                    ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  Report Type:                                                          ││
│  │  [●] Full Narrative Report (IVS/RICS compliant, 15-25 pages)           ││
│  │  [ ] Summary Report (Executive summary + key findings, 3-5 pages)      ││
│  │  [ ] Update Report (For existing valuation update)                     ││
│  │  [ ] Desktop Valuation Report (Limited scope, disclosures)             ││
│  │                                                                         ││
│  │  Report Standard:                                                      ││
│  │  [●] IVS 2022        [ ] RICS Red Book 2022       [ ] Dual Compliant   ││
│  │                                                                         ││
│  │  Output Format:                                                        ││
│  │  [✓] PDF (Signed)    [✓] HTML (Web View)    [ ] DOCX (Editable)        ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ REPORT SECTIONS                                                         ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  ┌─────────────────────────────────────────────────┬────────┬──────────┐││
│  │  │ Section                                         │ Status │ Action   │││
│  │  ├─────────────────────────────────────────────────┼────────┼──────────┤││
│  │  │ 1. Executive Summary                            │ ✓ Auto │ [Edit]   │││
│  │  │ 2. Terms of Engagement                          │ ✓ Auto │ [Edit]   │││
│  │  │ 3. Property Description                         │ ✓ Auto │ [Edit]   │││
│  │  │ 4. Market Analysis                              │ ✓ Auto │ [Edit]   │││
│  │  │ 5. Highest & Best Use Analysis                  │ ✓ Auto │ [Edit]   │││
│  │  │ 6. Valuation Methodology                        │ ✓ Auto │ [Edit]   │││
│  │  │    6a. Sales Comparison Approach                │ ✓ Auto │ [Edit]   │││
│  │  │    6b. Cost Approach                            │ ✓ Auto │ [Edit]   │││
│  │  │    6c. Income Approach                          │ ✓ Auto │ [Edit]   │││
│  │  │ 7. Reconciliation                               │ ✓ Auto │ [Edit]   │││
│  │  │ 8. Assumptions & Limiting Conditions            │ ✓ Auto │ [Edit]   │││
│  │  │ 9. Certification                                │ ○ Req'd│ [Sign]   │││
│  │  └─────────────────────────────────────────────────┴────────┴──────────┘││
│  │                                                                         ││
│  │  Appendices:                                                           ││
│  │  [✓] Floor Plan & Measurements                                         ││
│  │  [✓] Property Photographs                                              ││
│  │  [✓] Comparable Sales Data                                             ││
│  │  [✓] Market Data Charts                                                ││
│  │  [✓] Title Documents (if available)                                    ││
│  │  [ ] Cost Breakdown Details                                            ││
│  │  [ ] DCF Model (if applicable)                                         ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ AUTO-GENERATED DISCLAIMERS                                              ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  The following disclaimers will be included based on valuation inputs: ││
│  │                                                                         ││
│  │  ⚠ OVERRIDES                                                           ││
│  │  "The Steel Rebar (12mm) material price was adjusted from the system   ││
│  │   default of GHS 9,200/ton to GHS 9,500/ton (+3.3%). Reason: Recent    ││
│  │   supplier quotations from ABC Steel (Dec 2025) show current market    ││
│  │   price due to import tariff increases effective November 2025."       ││
│  │                                                                         ││
│  │  ⓘ STANDARD ASSUMPTIONS                                                ││
│  │  • Property was inspected on [date] and appeared to be in the          ││
│  │    condition described.                                                ││
│  │  • Title is assumed good and marketable unless otherwise stated.       ││
│  │  • No detailed building survey was undertaken.                         ││
│  │  • Values exclude VAT/NHIL where applicable.                           ││
│  │                                                                         ││
│  │  ⓘ MARKET CONDITIONS                                                   ││
│  │  "This valuation is prepared in the context of a rising market         ││
│  │   (+6.8% over 12 months) with moderate transaction activity."          ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ DIGITAL SIGNATURE                                                       ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  Prepared By:                                                          ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │ Name: Kofi Mensah, MRICS                                            │││
│  │  │ Registration: GhIS/V/2018/0042                                      │││
│  │  │ Company: ABC Valuers Ltd                                            │││
│  │  │                                                                     │││
│  │  │ [Sign with Digital Certificate]                                     │││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  │                                                                         ││
│  │  Reviewed By (Optional):                                               ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │ [ ] Add Reviewer                                                    │││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ REPORT PREVIEW                                                          ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │ ┌───────────────────────────────────────────────────────────────┐   │││
│  │  │ │                                                               │   │││
│  │  │ │                    VALUATION REPORT                           │   │││
│  │  │ │                                                               │   │││
│  │  │ │  Property: 15 Rose Avenue, East Legon                         │   │││
│  │  │ │  Valuation Date: 08 January 2026                              │   │││
│  │  │ │  Report Reference: VL-2026-00042-R1                           │   │││
│  │  │ │                                                               │   │││
│  │  │ │  ═══════════════════════════════════════════════              │   │││
│  │  │ │  MARKET VALUE: GHS 1,390,000                                  │   │││
│  │  │ │  (USD 89,968 @ 15.45)                                         │   │││
│  │  │ │  ═══════════════════════════════════════════════              │   │││
│  │  │ │                                                               │   │││
│  │  │ │  Prepared for: ABC Bank Ltd                                   │   │││
│  │  │ │  Purpose: Mortgage Security                                   │   │││
│  │  │ │                                                               │   │││
│  │  │ │  Prepared by: Kofi Mensah, MRICS                              │   │││
│  │  │ │  ABC Valuers Ltd                                              │   │││
│  │  │ │                                                               │   │││
│  │  │ └───────────────────────────────────────────────────────────────┘   │││
│  │  │                                                                     │││
│  │  │                [◄ Prev]  Page 1 of 18  [Next ►]                     │││
│  │  │                                                                     │││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  │                                                                         ││
│  │  [Preview Full Report]                                                 ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ DELIVERY OPTIONS                                                        ││
│  ├─────────────────────────────────────────────────────────────────────────┤│
│  │                                                                         ││
│  │  [✓] Save to ValuationHub (PROPMETRIK)                                 ││
│  │  [✓] Email to Client (abc.bank@example.com)                            ││
│  │  [ ] API Push to Client System                                         ││
│  │  [ ] Print (Local Printer)                                             ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  [< Back to Reconciliation]             [✓ Sign & Generate Report]         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Report Structure (IVS Compliant)

```
VALUATION REPORT
================

1. EXECUTIVE SUMMARY
   - Property identification
   - Final market value
   - Valuation date & purpose
   - Key metrics (value/m², yield)

2. TERMS OF ENGAGEMENT
   - Client identification
   - Purpose and intended use
   - Basis of value (IVS 104)
   - Scope of work

3. PROPERTY DESCRIPTION
   - Legal description & title
   - Physical characteristics
   - Floor plan & measurements
   - Photographs

4. MARKET ANALYSIS
   - Economic conditions
   - Market conditions
   - Supply/demand analysis
   - Recent transactions

5. HIGHEST & BEST USE
   - Four-test analysis
   - Conclusion on HBU

6. VALUATION METHODOLOGY
   - Methods applied
   - Detailed workings
   - Adjustments made
   - Indicated values

7. RECONCILIATION
   - Method comparison
   - Weighting rationale
   - Final value determination

8. ASSUMPTIONS & CONDITIONS
   - Standard assumptions
   - Special assumptions
   - Limiting conditions
   - Override disclaimers

9. CERTIFICATION
   - Valuer certification
   - Digital signature
   - Professional credentials

APPENDICES
- A: Floor Plan
- B: Photographs
- C: Comparable Sales
- D: Market Data
- E: Title Documents
```

---

## UI Screen Map

### Complete Screen Inventory

```
PROPMETRIK VALUATION ENGINE - SCREEN MAP
=========================================

┌─────────────────────────────────────────────────────────────────────────────┐
│                            DASHBOARD                                        │
│                        /valuations                                          │
│                              │                                              │
│              ┌───────────────┼───────────────┐                              │
│              │               │               │                              │
│              ▼               ▼               ▼                              │
│     ┌────────────┐   ┌────────────┐   ┌────────────┐                        │
│     │ New        │   │ In Progress│   │ Completed  │                        │
│     │ Valuation  │   │ List       │   │ Archive    │                        │
│     └────────────┘   └────────────┘   └────────────┘                        │
│              │                                                              │
│              ▼                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: PROPERTY SETUP                                                      │
│ /valuations/new/property-setup                                              │
│                                                                             │
│  ┌────────────────────┐    ┌────────────────────┐    ┌──────────────────┐   │
│  │ Property Search    │───▶│ Property Details   │───▶│ Floor Plan       │   │
│  │ /search            │    │ /details           │    │ Builder          │   │
│  │                    │    │                    │    │ /floor-plan      │   │
│  │ • Address lookup   │    │ • Basic info       │    │                  │   │
│  │ • GPS coordinates  │    │ • Title info       │    │ • Fabric.js      │   │
│  │ • Existing record  │    │ • Ownership        │    │ • Room drawing   │   │
│  │ • New property     │    │ • Classification   │    │ • Measurements   │   │
│  └────────────────────┘    └────────────────────┘    └──────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: HBU ANALYSIS                                                        │
│ /valuations/:id/hbu-analysis                                                │
│                                                                             │
│  ┌────────────────────┐    ┌────────────────────┐    ┌──────────────────┐   │
│  │ Legal Test         │───▶│ Physical Test      │───▶│ Financial Test   │   │
│  │ /legal             │    │ /physical          │    │ /financial       │   │
│  │                    │    │                    │    │                  │   │
│  │ • Zoning check     │    │ • Site constraints │    │ • Use scenarios  │   │
│  │ • Restrictions     │    │ • Access           │    │ • Revenue proj.  │   │
│  │ • Encumbrances     │    │ • Utilities        │    │ • Cost analysis  │   │
│  └────────────────────┘    └────────────────────┘    └──────────────────┘   │
│              │                                                              │
│              ▼                                                              │
│  ┌────────────────────┐    ┌────────────────────┐                           │
│  │ Productivity Test  │───▶│ HBU Conclusion     │                           │
│  │ /productivity      │    │ /conclusion        │                           │
│  │                    │    │                    │                           │
│  │ • NPV comparison   │    │ • Selected HBU     │                           │
│  │ • Ranking          │    │ • Justification    │                           │
│  └────────────────────┘    └────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: METHOD SELECTION                                                    │
│ /valuations/:id/method-selection                                            │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Method Applicability Matrix                                            │ │
│  │ • Auto-selected based on HBU + property type                           │ │
│  │ • Data quality indicators per method                                   │ │
│  │ • Override capability with justification                               │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 4: MARKET CONTEXT (Sidebar/Panel)                                      │
│ /valuations/:id/market-context                                              │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Read-only economic & market data panel                                 │ │
│  │ • Economic indicators (inflation, rates, GDP)                          │ │
│  │ • Market conditions (trend, activity, inventory)                       │ │
│  │ • Derived risk premiums (cap rates, discount rates)                    │ │
│  │ • Seasonal factors                                                     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 5: COST INPUTS                                                         │
│ /valuations/:id/cost-inputs                                                 │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Construction Cost Configuration                                        │ │
│  │ • Base rates (auto-populated)                                          │ │
│  │ • Material prices (override-able)                                      │ │
│  │ • Labor rates (override-able)                                          │ │
│  │ • Override justification capture                                       │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 6: METHOD WORKFLOWS                                                    │
│ /valuations/:id/methods                                                     │
│                                                                             │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐        │
│  │ Sales Comparison  │  │ Cost Approach     │  │ Income Approach   │        │
│  │ /sales-comparison │  │ /cost-approach    │  │ /income-approach  │        │
│  │                   │  │                   │  │                   │        │
│  │ • Comparable map  │  │ • Land value      │  │ • PGI/EGI/NOI     │        │
│  │ • Adjustment grid │  │ • RCN calc        │  │ • Cap rate        │        │
│  │ • Reconciliation  │  │ • Depreciation    │  │ • DCF option      │        │
│  └───────────────────┘  └───────────────────┘  └───────────────────┘        │
│                                                                             │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐        │
│  │ Residual Method   │  │ Profits Method    │  │ DRC Method        │        │
│  │ /residual-method  │  │ /profits-method   │  │ /drc-method       │        │
│  │                   │  │                   │  │                   │        │
│  │ • GDV projection  │  │ • Revenue analysis│  │ • MEA calculation │        │
│  │ • Dev costs       │  │ • MOP derivation  │  │ • Depreciation    │        │
│  │ • Sensitivity     │  │ • Cap rate        │  │ • Service adjust  │        │
│  └───────────────────┘  └───────────────────┘  └───────────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 7: RECONCILIATION                                                      │
│ /valuations/:id/reconciliation                                              │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ • Method results summary                                               │ │
│  │ • Weighting selection (system/standard/custom)                         │ │
│  │ • Final value determination                                            │ │
│  │ • Reconciliation narrative (required)                                  │ │
│  │ • Override summary                                                     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 8: REPORT GENERATION                                                   │
│ /valuations/:id/report                                                      │
│                                                                             │
│  ┌────────────────────┐    ┌────────────────────┐    ┌──────────────────┐   │
│  │ Report Config      │───▶│ Section Editor     │───▶│ Preview & Sign   │   │
│  │ /config            │    │ /sections          │    │ /preview         │   │
│  │                    │    │                    │    │                  │   │
│  │ • Report type      │    │ • Auto sections    │    │ • Full preview   │   │
│  │ • Standard         │    │ • Edit capability  │    │ • Digital sign   │   │
│  │ • Format selection │    │ • Appendices       │    │ • Delivery       │   │
│  └────────────────────┘    └────────────────────┘    └──────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ COMPLETED VALUATION                                                         │
│ /valuations/:id/view                                                        │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ • View report (PDF/HTML)                                               │ │
│  │ • Download/email                                                       │ │
│  │ • Create update valuation                                              │ │
│  │ • Audit trail                                                          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Screen Count Summary

| Module | Screens | Status |
|--------|---------|--------|
| Dashboard & Navigation | 3 | ⏳ To Build |
| Property Setup | 4 | ⏳ To Build |
| HBU Analysis | 5 | 🔴 To Build |
| Method Selection | 1 | ⏳ To Build |
| Market Context | 1 | ⏳ To Build |
| Cost Inputs | 1 | 🔴 To Build |
| Method Workflows | 6 | ⏳ Partial |
| Reconciliation | 1 | ⏳ To Build |
| Report Generation | 3 | ⏳ To Build |
| **TOTAL** | **25** | |

---

## User Journey

### Primary Flow: New Valuation (Residential Property)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ USER JOURNEY: RESIDENTIAL VALUATION                                         │
│ Estimated Time: 25-40 minutes (experienced valuer)                          │
└─────────────────────────────────────────────────────────────────────────────┘

PHASE 1: INITIALIZATION (2-3 min)
─────────────────────────────────
User Action                           System Response
───────────────────────────────────   ────────────────────────────────────────
Click "New Valuation"                 → Display property search
Enter address or coordinates          → Auto-fetch property data if exists
Confirm or create property record     → Load property details form
Select valuation purpose              → Set compliance requirements
                                      → Generate valuation ID (VL-2026-XXXXX)

PHASE 2: PROPERTY SETUP (5-10 min)
──────────────────────────────────
Verify/enter property details         → Validate against title records
Upload photographs                    → Store in document service
Open Floor Plan Builder               → Load Fabric.js canvas
Draw rooms & enter dimensions         → Calculate GBA automatically
Save floor plan                       → Store as SVG + measurements JSON
                                      → Update property record

PHASE 3: HBU ANALYSIS (3-5 min)
───────────────────────────────
Review legal test (zoning)            → Pre-populate from GIS data
Review physical test (site)           → Pre-populate known constraints
Review financial test                 → System runs quick viability check
Review productivity test              → Rank feasible uses by NPV
Confirm HBU conclusion                → Set HBU for method selection

PHASE 4: METHOD SELECTION (1-2 min)
───────────────────────────────────
Review auto-selected methods          → Display applicability matrix
View data quality indicators          → Show available data per method
Confirm or modify selection           → Lock methods for valuation
                                      → Queue data fetching

PHASE 5: MARKET CONTEXT (1 min - read only)
───────────────────────────────────────────
Review economic indicators            → Display current data
Review market conditions              → Show trends & indices
Note key factors for report           → (User mental note for narrative)

PHASE 6: COST INPUTS (2-3 min)
──────────────────────────────
Review auto-populated costs           → Load from Cost Database
Override if needed (with reason)      → Validate override, store with audit
Preview cost breakdown                → Calculate RCN preview

PHASE 7A: SALES COMPARISON (5-8 min)
────────────────────────────────────
Review auto-fetched comparables       → Display on map + list
Select 3-5 best comparables           → Add to adjustment grid
Review auto-calculated adjustments    → Show system adjustments
Modify adjustments if needed          → Track overrides
Review indicated value                → Calculate weighted average

PHASE 7B: COST APPROACH (3-5 min)
─────────────────────────────────
Review land value analysis            → Use Cost Inputs data
Review RCN calculation                → Auto-calculate from floor plan
Apply depreciation                    → Age-life method default
Review indicated value                → Calculate Cost Approach value

PHASE 7C: INCOME APPROACH (3-5 min)
───────────────────────────────────
Enter rental income                   → Validate against market rents
Enter operating expenses              → Show expense ratio check
Review cap rate derivation            → Display multiple sources
Confirm cap rate                      → Calculate indicated value

PHASE 8: RECONCILIATION (3-5 min)
─────────────────────────────────
Review all method results             → Display value range
Select weighting method               → Calculate weighted average
Select final value                    → Highlight recommendation
Write reconciliation narrative        → Validate minimum length
                                      → Check all required fields

PHASE 9: REPORT GENERATION (2-3 min)
────────────────────────────────────
Select report type & format           → Configure report structure
Review auto-generated sections        → Display editable sections
Review disclaimers                    → Show override disclaimers
Sign with digital certificate         → Apply signature
Generate & deliver                    → Create PDF/HTML, email/save

COMPLETION
──────────
Valuation complete                    → Status: Completed
Report available                      → View/download links
Audit trail saved                     → All actions logged
```

### Alternative Flows

#### Flow A: Commercial Property (Income-Primary)
```
Property Setup → HBU → Method Selection (Income primary)
                       ↓
              Income Approach (DCF + Direct Cap)
                       ↓
              Sales Comparison (Support)
                       ↓
              Cost Approach (Support)
                       ↓
              Reconciliation (60/20/20 weighting)
```

#### Flow B: Development Site (Residual-Primary)
```
Property Setup → HBU → Method Selection (Residual primary)
                       ↓
              Cost Inputs (Development costs)
                       ↓
              Residual Method (GDV → Residual)
                       ↓
              Sales Comparison (Land comparables)
                       ↓
              Reconciliation (70/30 weighting)
```

#### Flow C: Specialized Property (DRC-Primary)
```
Property Setup → HBU → Method Selection (DRC only)
                       ↓
              Cost Inputs (Specialized costs)
                       ↓
              DRC Method (MEA calculation)
                       ↓
              Reconciliation (Single method)
```

---

## Data Dependencies

### Complete Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DATA DEPENDENCY MAP                                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ EXTERNAL DATA SOURCES                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Bank of     │  │ Ghana       │  │ GPC/GHIS    │  │ Lands       │        │
│  │ Ghana       │  │ Statistical │  │ Survey      │  │ Commission  │        │
│  │             │  │ Service     │  │ Data        │  │             │        │
│  │ • Policy    │  │ • Inflation │  │ • Market    │  │ • Title     │        │
│  │   rate      │  │ • GDP       │  │   trends    │  │   records   │        │
│  │ • Exchange  │  │ • Unemploy  │  │ • Cap rates │  │ • Zoning    │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │                │
│         └────────────────┴────────────────┴────────────────┘                │
│                                   │                                         │
│                                   ▼                                         │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PROPMETRIK DATA STORES                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  │
│  │ Properties DB       │  │ Transactions DB     │  │ Market Data DB      │  │
│  │ (PostgreSQL/PostGIS)│  │ (PostgreSQL)        │  │ (PostgreSQL + Redis)│  │
│  │                     │  │                     │  │                     │  │
│  │ • Property records  │  │ • Sales history     │  │ • Economic factors  │  │
│  │ • Floor plans       │  │ • Rental data       │  │ • Market conditions │  │
│  │ • Measurements      │  │ • Comparables pool  │  │ • Price indices     │  │
│  │ • Photos/docs       │  │ • Adjustments       │  │ • Cap rates         │  │
│  └──────────┬──────────┘  └──────────┬──────────┘  └──────────┬──────────┘  │
│             │                        │                        │             │
│             └────────────────────────┴────────────────────────┘             │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    VALUATION ENGINE SERVICES                            ││
│  │                                                                         ││
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐               ││
│  │  │ valuationEng. │  │ salesCompar.  │  │ costApproach  │               ││
│  │  │ Service       │  │ Service       │  │ Service       │               ││
│  │  │               │  │               │  │               │               ││
│  │  │ • Orchestrate │  │ • Find comps  │  │ • RCN calc    │               ││
│  │  │ • Reconcile   │  │ • Adjustments │  │ • Depreciation│               ││
│  │  │ • Confidence  │  │ • Value       │  │ • Land value  │               ││
│  │  └───────────────┘  └───────────────┘  └───────────────┘               ││
│  │                                                                         ││
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐               ││
│  │  │ incomeAppr.   │  │ residualMeth. │  │ profitsMeth.  │               ││
│  │  │ Service       │  │ Service       │  │ Service       │               ││
│  │  │               │  │               │  │               │               ││
│  │  │ • PGI/NOI     │  │ • GDV calc    │  │ • MOP calc    │               ││
│  │  │ • DCF/Direct  │  │ • Dev costs   │  │ • Property %  │               ││
│  │  │ • Cap rate    │  │ • Sensitivity │  │ • Cap rate    │               ││
│  │  └───────────────┘  └───────────────┘  └───────────────┘               ││
│  │                                                                         ││
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐               ││
│  │  │ drcMethod     │  │ marketData    │  │ contribution  │               ││
│  │  │ Service       │  │ Service       │  │ Workflow Svc  │               ││
│  │  │               │  │               │  │               │               ││
│  │  │ • MEA calc    │  │ • Conditions  │  │ • Gap detect  │               ││
│  │  │ • Depreciation│  │ • Indices     │  │ • Prompts     │               ││
│  │  │ • Service adj │  │ • Rates       │  │ • Rewards     │               ││
│  │  └───────────────┘  └───────────────┘  └───────────────┘               ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         VALUATION RECORD                                ││
│  │                         (valuations table)                              ││
│  │                                                                         ││
│  │  • valuation_id                 • method_results (JSONB)                ││
│  │  • property_id                  • reconciliation_data (JSONB)           ││
│  │  • purpose                      • final_value                           ││
│  │  • status                       • overrides (JSONB)                     ││
│  │  • hbu_analysis (JSONB)         • report_id                            ││
│  │                                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Step-by-Step Data Requirements

| Step | Input Data Required | Output Data Generated |
|------|---------------------|----------------------|
| **1. Property Setup** | Address, coordinates, property type, measurements | Property record, floor plan, GBA, photos |
| **2. HBU Analysis** | Zoning data, site constraints, use scenarios | HBU conclusion, permitted uses, feasibility matrix |
| **3. Method Selection** | Property type, HBU, available data quality | Selected methods, data quality scores |
| **4. Market Context** | Region, property type, valuation date | Economic factors, market conditions, indices |
| **5. Cost Inputs** | Property type, quality, region | Base costs, material prices, labor rates |
| **6a. Sales Comparison** | Subject property, location, characteristics | Comparables, adjustments, indicated value |
| **6b. Cost Approach** | Floor plan, cost inputs, age/condition | RCN, depreciation, land value, indicated value |
| **6c. Income Approach** | Rental income, expenses, market cap rates | NOI, cap rate, DCF projections, indicated value |
| **6d. Residual Method** | Dev scheme, GDV, dev costs, profit margin | Residual land value, sensitivity analysis |
| **6e. Profits Method** | Trading accounts, MOP, property percentage | Fair maintainable trade, indicated value |
| **6f. DRC Method** | Asset description, MEA, depreciation factors | DRC value, service potential adjustment |
| **7. Reconciliation** | All method results, confidence scores | Weighted value, final value, narrative |
| **8. Report Generation** | All valuation data, user details | PDF/HTML report, audit trail |

### Data Freshness Requirements

| Data Type | Refresh Frequency | Staleness Threshold |
|-----------|-------------------|---------------------|
| Economic factors | Weekly | 2 weeks |
| Market conditions | Daily | 1 week |
| Price indices | Monthly | 2 months |
| Cap rates | Monthly | 3 months |
| Comparable sales | Real-time | N/A (dated at sale) |
| Cost rates | Quarterly | 6 months |
| Property records | On-demand | N/A |

---

## Validation Logic

### Field-Level Validations

#### Step 1: Property Setup

```typescript
const propertySetupValidation = {
  address: {
    required: true,
    minLength: 10,
    pattern: /^[a-zA-Z0-9\s,.-]+$/,
    errorMessage: 'Enter a valid property address'
  },
  propertyType: {
    required: true,
    enum: ['house', 'apartment', 'townhouse', 'villa', 'commercial', 
           'office', 'industrial', 'warehouse', 'land', 'mixed_use'],
    errorMessage: 'Select a property type'
  },
  grossBuildingArea: {
    required: true,
    min: 10,
    max: 100000,
    unit: 'sqm',
    errorMessage: 'GBA must be between 10 and 100,000 m²'
  },
  plotSize: {
    required: true,
    min: 50,
    max: 1000000,
    unit: 'sqm',
    validate: (value, context) => value >= context.grossBuildingArea,
    errorMessage: 'Plot size must be at least equal to GBA'
  },
  yearBuilt: {
    required: false,
    min: 1800,
    max: new Date().getFullYear(),
    errorMessage: 'Invalid year built'
  }
};
```

#### Step 2: HBU Analysis

```typescript
const hbuValidation = {
  legallyPermissible: {
    required: true,
    type: 'boolean',
    errorMessage: 'Confirm legal permissibility'
  },
  physicallyPossible: {
    required: true,
    type: 'boolean',
    errorMessage: 'Confirm physical possibility'
  },
  financiallyFeasible: {
    required: true,
    type: 'boolean',
    dependsOn: ['legallyPermissible', 'physicallyPossible'],
    validate: (value, context) => {
      if (value === true) {
        return context.legallyPermissible && context.physicallyPossible;
      }
      return true;
    },
    errorMessage: 'Financial feasibility requires legal and physical tests to pass'
  },
  maximallyProductive: {
    required: true,
    dependsOn: ['financiallyFeasible'],
    errorMessage: 'Confirm maximally productive use'
  },
  hbuConclusion: {
    required: true,
    minLength: 50,
    errorMessage: 'Provide HBU conclusion (min 50 characters)'
  }
};
```

#### Step 6: Method Validations

```typescript
// Sales Comparison
const salesComparisonValidation = {
  comparablesCount: {
    min: 3,
    recommended: 5,
    max: 10,
    errorMessage: 'Select 3-10 comparable properties'
  },
  comparableAge: {
    max: 365, // days
    warningThreshold: 180,
    errorMessage: 'Comparable sale is over 12 months old'
  },
  grossAdjustment: {
    max: 0.30, // 30%
    warningThreshold: 0.25,
    errorMessage: 'Gross adjustment exceeds 30% - reconsider comparable'
  },
  netAdjustment: {
    max: 0.20, // 20%
    warningThreshold: 0.15,
    errorMessage: 'Net adjustment exceeds 20%'
  }
};

// Income Approach
const incomeValidation = {
  vacancyRate: {
    min: 0,
    max: 0.50,
    warningThreshold: 0.20,
    errorMessage: 'Vacancy rate must be 0-50%'
  },
  expenseRatio: {
    min: 0.15,
    max: 0.60,
    warningRange: [0.20, 0.40],
    errorMessage: 'Expense ratio outside typical range'
  },
  capRate: {
    min: 0.04,
    max: 0.15,
    errorMessage: 'Cap rate must be 4-15%'
  }
};

// Cost Approach
const costValidation = {
  effectiveAge: {
    max: (context) => context.usefulLife,
    errorMessage: 'Effective age cannot exceed useful life'
  },
  totalDepreciation: {
    max: 0.90, // 90%
    warningThreshold: 0.80,
    errorMessage: 'Total depreciation cannot exceed 90%'
  }
};
```

#### Step 7: Reconciliation

```typescript
const reconciliationValidation = {
  methodWeights: {
    validate: (weights) => {
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      return Math.abs(sum - 1.0) < 0.001;
    },
    errorMessage: 'Method weights must total 100%'
  },
  finalValue: {
    validate: (value, context) => {
      const methodValues = Object.values(context.methodResults);
      const min = Math.min(...methodValues) * 0.8;
      const max = Math.max(...methodValues) * 1.2;
      return value >= min && value <= max;
    },
    warningMessage: 'Final value is outside method value range'
  },
  reconciliationNarrative: {
    required: true,
    minLength: 200,
    maxLength: 5000,
    errorMessage: 'Narrative must be 200-5000 characters'
  }
};
```

### Override Validation

```typescript
const overrideValidation = {
  reason: {
    required: true,
    minLength: 20,
    errorMessage: 'Provide detailed justification (min 20 characters)'
  },
  deviationLimit: {
    percentage: 0.50, // 50% from system default
    validate: (override, systemDefault) => {
      const deviation = Math.abs(override - systemDefault) / systemDefault;
      return deviation <= 0.50;
    },
    errorMessage: 'Override exceeds 50% deviation from system default'
  },
  requiresApproval: (override, systemDefault) => {
    const deviation = Math.abs(override - systemDefault) / systemDefault;
    return deviation > 0.25; // >25% requires senior approval
  }
};
```

### Cross-Step Validations

```typescript
const crossStepValidations = [
  {
    name: 'GBA Consistency',
    steps: ['property_setup', 'cost_approach'],
    validate: (data) => {
      return data.property_setup.gba === data.cost_approach.buildingArea;
    },
    errorMessage: 'GBA mismatch between property setup and cost approach'
  },
  {
    name: 'Method Selection Consistency',
    steps: ['method_selection', 'method_workflows'],
    validate: (data) => {
      const selected = data.method_selection.selectedMethods;
      const completed = Object.keys(data.method_workflows);
      return selected.every(m => completed.includes(m));
    },
    errorMessage: 'Not all selected methods have been completed'
  },
  {
    name: 'Final Value Reasonableness',
    steps: ['sales_comparison', 'reconciliation'],
    validate: (data) => {
      const psqm = data.reconciliation.finalValue / data.property_setup.gba;
      const marketRange = data.market_context.pricePerSqmRange;
      return psqm >= marketRange.min * 0.5 && psqm <= marketRange.max * 1.5;
    },
    warningMessage: 'Value per sqm outside market range'
  }
];
```

### Validation Error Levels

| Level | Icon | Action | Example |
|-------|------|--------|---------|
| **Error** | 🔴 | Block progression | Missing required field |
| **Warning** | 🟡 | Allow with confirmation | Value outside typical range |
| **Info** | 🔵 | Display only | Override tracked for report |
| **Success** | 🟢 | Validation passed | All fields complete |

---

## Implementation Roadmap

### Phase 1: Core Infrastructure (Weeks 1-4)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Floor Plan Builder (Fabric.js) | HIGH | 3 weeks | None |
| HBU Analysis Service | HIGH | 2 weeks | None |
| Override Tracking System | HIGH | 1 week | None |
| Material/Labor Price DB | MEDIUM | 1 week | None |

### Phase 2: UI Framework (Weeks 3-6)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Valuation Wizard Framework | HIGH | 2 weeks | None |
| Step Navigation Component | HIGH | 1 week | Wizard Framework |
| Property Setup Screens | HIGH | 2 weeks | Floor Plan Builder |
| Method Workflow Templates | HIGH | 2 weeks | Wizard Framework |

### Phase 3: Method Workflows (Weeks 5-10)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Sales Comparison UI | HIGH | 2 weeks | Backend API (exists) |
| Cost Approach UI | HIGH | 2 weeks | Material DB |
| Income Approach UI | HIGH | 2 weeks | Backend API (exists) |
| Residual Method UI | MEDIUM | 2 weeks | Backend API (exists) |
| Profits Method UI | MEDIUM | 1 week | Backend API (exists) |
| DRC Method UI | MEDIUM | 1 week | Backend API (exists) |

### Phase 4: Reconciliation & Reporting (Weeks 9-12)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Reconciliation Studio | HIGH | 2 weeks | All method UIs |
| Report Generator UI | HIGH | 2 weeks | Reconciliation |
| PDF Generation | HIGH | 1 week | Report template |
| Digital Signature | MEDIUM | 1 week | Auth system |

### Phase 5: Polish & Integration (Weeks 11-14)

| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Validation Framework | HIGH | 1 week | All UIs |
| Error Handling | HIGH | 1 week | Validation |
| Mobile Responsiveness | MEDIUM | 2 weeks | All UIs |
| Performance Optimization | MEDIUM | 1 week | All features |
| User Testing | HIGH | 2 weeks | All features |

---

## Appendix A: Backend API Quick Reference

### Existing Endpoints (Ready to Use)

```
POST   /api/valuations                    Create new valuation
GET    /api/valuations/:id                Get valuation details
PUT    /api/valuations/:id                Update valuation
DELETE /api/valuations/:id                Delete valuation

GET    /api/valuations/:id/comparables    Get comparables for valuation
POST   /api/valuations/:id/comparables    Add comparable to valuation
DELETE /api/valuations/:id/comparables/:cid  Remove comparable

GET    /api/valuations/:id/report         Get valuation report
POST   /api/valuations/:id/report/generate  Generate report

GET    /api/valuations/market/:region     Get market conditions
GET    /api/valuations/market/:region/indices  Get market indices

POST   /api/valuations/quick              Quick valuation (API)
POST   /api/valuations/batch              Batch valuations
GET    /api/valuations/stats              Dashboard statistics

POST   /api/contributions/analyze-gaps    Analyze comparable gaps
GET    /api/contributions/prompts         Get contribution prompts
POST   /api/contributions/submit          Submit contribution
GET    /api/contributions/profile         User contribution profile
GET    /api/contributions/credits/history Credit history
GET    /api/contributions/leaderboard     Contributor leaderboard
```

### Required New Endpoints

```
POST   /api/floor-plans                   Create floor plan
GET    /api/floor-plans/:id               Get floor plan
PUT    /api/floor-plans/:id               Update floor plan
DELETE /api/floor-plans/:id               Delete floor plan

POST   /api/hbu-analysis                  Create HBU analysis
GET    /api/hbu-analysis/:valuationId     Get HBU for valuation
PUT    /api/hbu-analysis/:id              Update HBU analysis

GET    /api/cost-data/materials           Get material prices
GET    /api/cost-data/labor               Get labor rates
PUT    /api/cost-data/materials/:id       Update material price (admin)
PUT    /api/cost-data/labor/:id           Update labor rate (admin)

GET    /api/overrides/:valuationId        Get all overrides
POST   /api/overrides                     Record override
```

---

*Document Version: 1.0*
*Last Updated: January 2026*
*Author: PROPMETRIK Engineering Team*
