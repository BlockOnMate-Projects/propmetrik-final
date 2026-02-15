# PROPMETRIK Floor Plan System: Valuation-First Architecture

**Version:** 2.0  
**Date:** January 2026  
**Classification:** Technical Architecture Document

---

## Executive Summary

This document outlines a production-ready architecture for PROPMETRIK's floor plan system, designed to deliver **valuation-defensible geometry** while providing an AutoCAD-like user experience. The system integrates:

- **LLMs** for intelligent layout generation and assumption surfacing
- **Blender 3D** as the authoritative geometry kernel  
- **Fabric.js** as the constrained interactive drafting layer

The architecture explicitly prioritizes **determinism, auditability, and measurement accuracy** over design flexibility—appropriate for professional valuers operating under RICS/GhIS standards.

---

## 1. Review of Existing Process

### 1.1 Current Implementation Analysis

**Existing Components (Reviewed):**

| Component | Location | Status | Assessment |
|-----------|----------|--------|------------|
| FloorPlanBuilder.tsx | `/frontend/src/components/valuation/` | Active | 1,449 lines, Fabric.js-based polygon/rectangle drawing |
| floorPlanService.ts | `/backend/src/services/valuation-engine/` | Active | 723 lines, CRUD + Shoelace area calculation |
| Floor Plan Page | `/frontend/src/app/floor-plan/page.tsx` | Active | Standalone builder interface |
| Database Schema | `valuation_floor_plans` | Active | Canvas JSON persistence, room breakdown, locking |

**Existing Strengths:**
- ✅ Shoelace formula area calculation (mathematically correct)
- ✅ Ghana Building Code validation (minimum room sizes)
- ✅ Multi-floor support with floor_number indexing
- ✅ Floor plan locking for finalized valuations
- ✅ Scale calibration (pixels per meter)
- ✅ Room type classification with minimum size enforcement
- ✅ Rectangle tool with real-time measurement preview
- ✅ Grid snapping for precision drawing

**Critical Weaknesses Identified:**

| Issue | Impact | Risk Level |
|-------|--------|------------|
| **Freehand polygon drawing** | Irregular shapes create non-defensible geometry | HIGH |
| **No wall thickness modeling** | GFA/NIA calculations are approximations | HIGH |
| **Client-side geometry authority** | Fabric.js coordinates are "source of truth" | HIGH |
| **No construction logic** | Wall continuity, shared walls not enforced | MEDIUM |
| **Missing audit trail for edits** | Cannot trace geometry changes | HIGH |
| **AI/LLM not integrated** | Manual layout creation only | MEDIUM |
| **No 3D storey stacking** | Multi-floor calculations are 2D aggregates | MEDIUM |

### 1.2 Valuation Defensibility Breakdown

**Where Current System Fails RICS/IVS Standards:**

1. **Measurement Reproducibility:** User A and User B drawing "same" building will produce different geometries
2. **Audit Trail:** No record of why geometry looks the way it does
3. **Assumption Transparency:** No capture of design decisions (e.g., "assumed 2.1m corridor width")
4. **Professional Skepticism:** No validation that drawn layout matches subject property features

### 1.3 Risks of Current Approach

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CURRENT RISK MATRIX                               │
├─────────────────────────────────────────────────────────────────────┤
│ Risk: Freehand Geometry                                              │
│ Problem: Valuers draw irregular polygons that don't reflect reality │
│ Impact: GFA/NIA miscalculated, valuation indefensible               │
│ Likelihood: HIGH (default drawing mode is polygon)                   │
├─────────────────────────────────────────────────────────────────────┤
│ Risk: Client-Side Authority                                          │
│ Problem: Fabric.js canvas is the only geometry record               │
│ Impact: Browser state becomes valuation evidence                     │
│ Likelihood: CERTAIN (no backend geometry validation)                 │
├─────────────────────────────────────────────────────────────────────┤
│ Risk: No Version Control                                             │
│ Problem: Geometry overwrites without history                         │
│ Impact: Cannot audit changes, no baseline comparison                 │
│ Likelihood: HIGH (single canvas_json field)                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Target System Objectives

### 2.1 Non-Negotiable Requirements

| # | Requirement | Rationale |
|---|-------------|-----------|
| 1 | **Auto-generate realistic layouts** from property features | Reduce manual error, ensure consistency |
| 2 | **Constrained adjustments only** | Prevent invalid geometry |
| 3 | **All measurements deterministic** | Same inputs → Same outputs |
| 4 | **All measurements reproducible** | Any system can recalculate |
| 5 | **All measurements auditable** | Complete trace of origin |
| 6 | **Separation of concerns** | Design intent ≠ Geometry ≠ Interaction ≠ Calculation |

### 2.2 Why Unrestricted CAD-Style Drawing is Inappropriate

**Traditional CAD (AutoCAD/Revit) Philosophy:**
- Designer has complete authority
- Geometry represents design intent
- Output is a drawing/model for construction

**Valuation Context (PROPMETRIK):**
- Valuer RECORDS existing reality
- Geometry must reflect subject property
- Output is EVIDENCE for valuation opinion

**Key Distinction:** A valuer should not "design" a floor plan; they should **capture** a property's spatial configuration. Unrestricted drawing tools enable:

- Drawings that don't match the subject
- Geometry that cannot be validated against inspections
- Measurements that vary between users for identical properties

### 2.3 Layered System Design

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PROPOSED ARCHITECTURE LAYERS                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ LAYER 1: DESIGN INTENT (LLM)                                 │   │
│  │ • Translate property features → layout strategy              │   │
│  │ • Surface assumptions and alternatives                       │   │
│  │ • Output: Structured JSON (NOT coordinates)                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↓                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ LAYER 2: GEOMETRY GENERATION (Blender)                       │   │
│  │ • Create authoritative geometry from design intent           │   │
│  │ • Enforce construction logic (walls, continuity)             │   │
│  │ • Calculate GFA, NIA, room areas with wall thickness         │   │
│  │ • Output: Validated geometry + measurements                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↓                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ LAYER 3: INTERACTION (Fabric.js)                             │   │
│  │ • Render Blender geometry                                    │   │
│  │ • Allow constrained adjustments                              │   │
│  │ • Export DELTAS, not full geometry                           │   │
│  │ • Output: Adjustment requests → sent back to Blender         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↓                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ LAYER 4: VALUATION CALCULATION (Backend)                     │   │
│  │ • Use Blender-validated measurements only                    │   │
│  │ • Lock geometry for finalized valuations                     │   │
│  │ • Full audit trail                                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Role of LLMs (Strictly Defined)

### 3.1 What LLMs ARE Allowed To Do

| Capability | Input | Output | Example |
|------------|-------|--------|---------|
| **Layout Strategy Selection** | Property features (beds, baths, sqm) | Layout type ID | "Use template: 3BR_COMPACT_COLONIAL" |
| **Room Adjacency Decisions** | Property type, room count | Adjacency matrix | "Kitchen adjacent to dining: true" |
| **Assumption Surfacing** | Incomplete data | Flagged assumptions | "Assuming standard 3m ceiling height" |
| **Alternative Generation** | User constraints | Layout options | "Option A: Open plan, Option B: Formal" |
| **Zoning Interpretation** | Property address, use | Zone requirements | "Residential R2, 40% coverage max" |

### 3.2 What LLMs MUST NOT Do

| Prohibited Action | Why | Alternative |
|-------------------|-----|-------------|
| **Output coordinates** | Non-deterministic, varies by run | Use Blender procedural generation |
| **Draw walls or rooms** | Creates unvalidated geometry | Generate design intent, not geometry |
| **Generate Fabric.js objects** | Client-side code execution risk | Blender generates, Fabric renders |
| **Directly control measurements** | Bypasses validation layer | Measurements always from Blender |
| **Modify existing geometry** | Audit trail broken | LLM suggests, Blender executes |

### 3.3 LLM Output Structure (Versioned, Logged, Auditable)

```typescript
interface LLMDesignIntent {
  version: "1.0.0";
  timestamp: string;
  model_id: string;
  request_id: string;
  
  // Input summary (logged for audit)
  input_features: {
    bedrooms: number;
    bathrooms: number;
    total_area_sqm: number;
    property_type: string;
    building_age_years?: number;
    property_condition?: string;
  };
  
  // Design decisions (NOT geometry)
  layout_strategy: {
    template_id: string;
    template_name: string;
    layout_style: "open_plan" | "formal" | "colonial" | "contemporary";
    circulation_type: "central_corridor" | "side_corridor" | "open_flow";
  };
  
  // Room configuration (abstract, not coordinates)
  room_program: Array<{
    room_type: RoomType;
    target_area_sqm: number;
    priority: "required" | "preferred" | "optional";
    adjacency_requirements: string[];
  }>;
  
  // Explicit assumptions (must be reviewed)
  assumptions: Array<{
    category: "dimension" | "layout" | "construction" | "code";
    assumption: string;
    default_value: string;
    confidence: "high" | "medium" | "low";
    source: string;
  }>;
  
  // Alternatives offered
  alternatives: Array<{
    option_id: string;
    description: string;
    trade_offs: string[];
  }>;
  
  // Audit metadata
  audit: {
    input_hash: string;
    output_hash: string;
    processing_time_ms: number;
  };
}
```

### 3.4 LLM Integration with Existing PROPMETRIK Services

```typescript
// NEW FILE: /backend/src/services/ai/floorPlanDesignIntentService.ts

import { anthropicClient } from '../ai/anthropicClient';
import { floorPlanService } from '../valuation-engine/floorPlanService';

interface DesignIntentRequest {
  valuation_id: string;
  property_features: PropertyFeatures;
  user_preferences?: UserLayoutPreferences;
}

class FloorPlanDesignIntentService {
  
  /**
   * Generate design intent from property features
   * LLM creates abstract layout strategy, NOT geometry
   */
  async generateDesignIntent(request: DesignIntentRequest): Promise<LLMDesignIntent> {
    const prompt = this.buildDesignIntentPrompt(request);
    
    const response = await anthropicClient.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
      system: DESIGN_INTENT_SYSTEM_PROMPT,
    });
    
    // Parse and validate structured output
    const designIntent = this.parseDesignIntent(response);
    
    // Log for audit trail
    await this.logDesignIntent(request.valuation_id, designIntent);
    
    return designIntent;
  }
  
  /**
   * Log design intent for audit purposes
   */
  private async logDesignIntent(valuationId: string, intent: LLMDesignIntent): Promise<void> {
    await pool.query(`
      INSERT INTO valuation_floor_plan_design_intents 
      (valuation_id, intent_json, model_id, created_at)
      VALUES ($1, $2, $3, NOW())
    `, [valuationId, JSON.stringify(intent), intent.model_id]);
  }
}
```

---

## 4. Role of Blender 3D (Geometric Authority)

### 4.1 Why Blender as Geometry Kernel

| Requirement | Blender Capability | Alternative Weaknesses |
|-------------|-------------------|------------------------|
| **Deterministic geometry** | Python scripting with exact coordinates | Fabric.js is rendering library, not CAD kernel |
| **Wall thickness modeling** | 3D mesh with real dimensions | 2D canvas cannot represent construction |
| **Shared wall resolution** | Boolean operations, mesh merging | JavaScript lacks geometric operations |
| **Multi-storey stacking** | Z-axis, floor slabs, structural alignment | 2D tools aggregate areas incorrectly |
| **GFA/NIA calculation** | Mesh volume, face area calculations | Shoelace works only for 2D polygons |
| **Regulatory compliance** | Parametric constraints | No enforcement in drawing tools |

### 4.2 Blender's Responsibilities

```
┌─────────────────────────────────────────────────────────────────────┐
│                BLENDER GEOMETRY KERNEL FUNCTIONS                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ INPUT: LLMDesignIntent (abstract layout strategy)                   │
│                                                                      │
│ PROCESSING:                                                          │
│ ├── Select base template from template library                      │
│ ├── Apply room program (target areas, adjacencies)                  │
│ ├── Generate wall geometry with thickness (150-230mm)               │
│ ├── Resolve shared walls (no double-counting)                       │
│ ├── Enforce minimum dimensions (Ghana Building Code)                │
│ ├── Stack floors with structural alignment                          │
│ ├── Calculate areas:                                                │
│ │   ├── GFA (Gross Floor Area) - external wall face                │
│ │   ├── NIA (Net Internal Area) - internal wall face               │
│ │   ├── Individual room areas (excluding wall thickness)           │
│ │   └── Circulation/common area deductions                         │
│ └── Validate geometry integrity                                     │
│                                                                      │
│ OUTPUT: BlenderGeometryResult                                       │
│ ├── Authoritative measurements (GFA, NIA, room breakdown)          │
│ ├── 2D projection for Fabric.js rendering                          │
│ ├── Geometry version hash                                          │
│ └── Validation report                                               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.3 Blender Output Structure

```typescript
interface BlenderGeometryResult {
  version: string;
  geometry_hash: string;  // SHA-256 of geometry for versioning
  timestamp: string;
  
  // Authoritative measurements (used in valuation)
  measurements: {
    gross_floor_area_sqm: number;
    net_internal_area_sqm: number;
    gross_external_area_sqm: number;
    efficiency_ratio: number;
    wall_area_sqm: number;
    total_perimeter_m: number;
  };
  
  // Per-floor breakdown
  floors: Array<{
    floor_number: number;
    floor_label: string;
    floor_to_floor_height_m: number;
    gross_area_sqm: number;
    net_area_sqm: number;
    rooms: BlenderRoom[];
  }>;
  
  // Individual rooms with wall-adjusted areas
  rooms: Array<{
    id: string;
    name: string;
    type: RoomType;
    floor_number: number;
    internal_area_sqm: number;  // Excludes wall thickness
    gross_area_sqm: number;     // Includes wall thickness
    internal_dimensions: { length_m: number; width_m: number };
    meets_minimum_code: boolean;
    code_minimum_sqm: number;
  }>;
  
  // 2D projection for Fabric.js (rendering only)
  fabric_projection: {
    scale_pixels_per_meter: number;
    canvas_width: number;
    canvas_height: number;
    objects: FabricRenderObject[];  // Read-only rendering data
  };
  
  // Construction metadata
  construction: {
    external_wall_thickness_mm: number;
    internal_wall_thickness_mm: number;
    floor_slab_thickness_mm: number;
    wall_material: string;
  };
  
  // Validation results
  validation: {
    is_valid: boolean;
    issues: ValidationIssue[];
    code_compliance: CodeComplianceResult;
  };
}
```

### 4.4 Blender Integration Architecture

```typescript
// NEW FILE: /backend/src/services/geometry/blenderGeometryService.ts

import { spawn } from 'child_process';
import { floorPlanService } from '../valuation-engine/floorPlanService';

class BlenderGeometryService {
  private blenderPath = process.env.BLENDER_PATH || '/usr/bin/blender';
  private scriptsPath = '/backend/blender_scripts';
  
  /**
   * Generate geometry from design intent
   * This is the ONLY path to create valuation geometry
   */
  async generateFromDesignIntent(
    valuationId: string,
    designIntent: LLMDesignIntent
  ): Promise<BlenderGeometryResult> {
    
    // Write design intent to temp file
    const intentPath = await this.writeIntentFile(designIntent);
    
    // Execute Blender in headless mode
    const result = await this.executeBlenderScript(
      'generate_floor_plan.py',
      { intent_path: intentPath, valuation_id: valuationId }
    );
    
    // Parse and validate result
    const geometryResult = this.parseBlenderOutput(result);
    
    // Store authoritative geometry
    await this.storeGeometry(valuationId, geometryResult);
    
    // Update existing floorPlanService with Blender-validated data
    await floorPlanService.updateFromBlenderGeometry(valuationId, geometryResult);
    
    return geometryResult;
  }
  
  /**
   * Apply user adjustments and regenerate
   * User edits are CONSTRAINTS, not direct geometry changes
   */
  async applyAdjustments(
    valuationId: string,
    adjustments: UserAdjustmentDeltas
  ): Promise<BlenderGeometryResult> {
    
    // Load current geometry
    const currentGeometry = await this.getGeometry(valuationId);
    
    // Validate adjustments are within constraints
    this.validateAdjustments(adjustments, currentGeometry);
    
    // Execute Blender with adjustment constraints
    const result = await this.executeBlenderScript(
      'apply_adjustments.py',
      { 
        geometry_hash: currentGeometry.geometry_hash,
        adjustments: adjustments 
      }
    );
    
    // Log adjustment for audit trail
    await this.logAdjustment(valuationId, adjustments, currentGeometry.geometry_hash);
    
    return this.parseBlenderOutput(result);
  }
  
  private async executeBlenderScript(
    scriptName: string, 
    args: Record<string, any>
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn(this.blenderPath, [
        '--background',
        '--python', `${this.scriptsPath}/${scriptName}`,
        '--', JSON.stringify(args)
      ]);
      
      let output = '';
      process.stdout.on('data', (data) => output += data);
      process.on('close', (code) => {
        if (code === 0) resolve(output);
        else reject(new Error(`Blender exited with code ${code}`));
      });
    });
  }
}
```

---

## 5. Role of Fabric.js (Interactive Drafting Layer)

### 5.1 Fabric.js as Rendering Layer, Not Authority

**Current Problem:** Fabric.js canvas_json is treated as source of truth
**Solution:** Fabric.js becomes a **read-only rendering layer** with **constrained interaction**

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FABRIC.JS ROLE REDEFINITION                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ALLOWED:                           PROHIBITED:                      │
│  ├── Render Blender geometry        ├── Create new geometry         │
│  ├── Display measurements           ├── Delete rooms                │
│  ├── Highlight selection            ├── Freehand polygon drawing    │
│  ├── Constrained wall dragging      ├── Direct coordinate editing   │
│  ├── Room proportion adjustment     ├── Unvalidated area changes    │
│  ├── Visual feedback during edit    ├── Bypassing Blender           │
│  └── Export adjustment deltas       └── Acting as source of truth   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Constrained Interaction Model

```typescript
// UPDATED: /frontend/src/components/valuation/FloorPlanBuilder.tsx

interface ConstrainedFloorPlanBuilderProps {
  valuationId: string;
  blenderGeometry: BlenderGeometryResult;  // Read-only authoritative geometry
  onAdjustmentRequest: (deltas: UserAdjustmentDeltas) => Promise<void>;
  readonly?: boolean;
}

/**
 * Constrained Floor Plan Builder
 * 
 * Renders Blender-generated geometry and allows CONSTRAINED adjustments only.
 * All adjustments are sent to backend for Blender re-validation.
 * Fabric.js never acts as geometry authority.
 */
export default function ConstrainedFloorPlanBuilder({
  valuationId,
  blenderGeometry,
  onAdjustmentRequest,
  readonly = false,
}: ConstrainedFloorPlanBuilderProps) {
  
  // Canvas only renders, never creates geometry
  const [renderState, setRenderState] = useState<FabricRenderState | null>(null);
  const [pendingAdjustments, setPendingAdjustments] = useState<UserAdjustmentDeltas | null>(null);
  const [isWaitingForBlender, setIsWaitingForBlender] = useState(false);
  
  // Render Blender geometry on mount/update
  useEffect(() => {
    if (!fabricCanvasRef.current || !blenderGeometry) return;
    
    // Clear canvas and render from Blender projection
    clearCanvas();
    renderBlenderGeometry(blenderGeometry.fabric_projection);
    
    // Display authoritative measurements (from Blender, not calculated here)
    displayMeasurements(blenderGeometry.measurements);
    
  }, [blenderGeometry]);
  
  /**
   * Handle constrained wall drag
   * Does NOT modify geometry directly - sends delta to Blender
   */
  const handleWallDrag = useCallback((
    wallId: string, 
    dragDelta: { dx: number; dy: number }
  ) => {
    if (readonly || isWaitingForBlender) return;
    
    // Validate drag is within constraints
    const constraint = getWallConstraints(wallId, blenderGeometry);
    if (!isWithinConstraints(dragDelta, constraint)) {
      showConstraintWarning(constraint);
      return;
    }
    
    // Show preview (visual feedback only)
    showDragPreview(wallId, dragDelta);
    
    // Queue adjustment delta
    setPendingAdjustments(prev => ({
      ...prev,
      wall_adjustments: [
        ...(prev?.wall_adjustments || []),
        { wall_id: wallId, delta: dragDelta }
      ]
    }));
    
  }, [readonly, isWaitingForBlender, blenderGeometry]);
  
  /**
   * Submit adjustments to Blender for re-validation
   */
  const submitAdjustments = useCallback(async () => {
    if (!pendingAdjustments) return;
    
    setIsWaitingForBlender(true);
    
    try {
      // Send to backend → Blender → get new geometry
      await onAdjustmentRequest(pendingAdjustments);
      
      // Clear pending (new geometry will arrive via props)
      setPendingAdjustments(null);
      
    } catch (error) {
      // Rollback visual preview
      revertPreview();
      showError("Adjustment rejected by geometry validator");
    } finally {
      setIsWaitingForBlender(false);
    }
    
  }, [pendingAdjustments, onAdjustmentRequest]);
  
  // ... rest of component
}
```

### 5.3 Adjustment Delta Structure

```typescript
interface UserAdjustmentDeltas {
  adjustment_id: string;
  timestamp: string;
  user_id: string;
  
  // Wall position adjustments (constrained)
  wall_adjustments?: Array<{
    wall_id: string;
    adjustment_type: "translate" | "stretch";
    delta: { dx: number; dy: number };  // In meters
    affected_rooms: string[];
  }>;
  
  // Room proportion adjustments (constrained)
  room_adjustments?: Array<{
    room_id: string;
    adjustment_type: "resize" | "merge" | "split";
    target_area_sqm?: number;
    merge_with?: string;
    split_ratio?: number;
  }>;
  
  // Internal partition adjustments
  partition_adjustments?: Array<{
    partition_id: string;
    action: "move" | "delete" | "add";
    new_position?: { x: number; y: number };
  }>;
  
  // User justification (required for audit)
  justification: string;
}
```

---

## 6. Controlled User Adjustments ("Smart Limits")

### 6.1 Adjustment Policy Matrix

| Element | Adjustable? | Constraints | Audit Required |
|---------|-------------|-------------|----------------|
| **External walls** | Stretch only | ±2m max, maintain min room sizes | Yes |
| **Internal partitions** | Move/Delete | Must not violate room minimums | Yes |
| **Room proportions** | Yes | Area ±20%, maintain adjacencies | Yes |
| **Room types** | Yes | Must match building program | No |
| **Wall thickness** | No | Construction-determined | N/A |
| **Floor height** | No | Construction-determined | N/A |
| **Building footprint** | Limited | ±10% max, maintain setbacks | Yes |
| **Floor count** | No | Property feature-determined | N/A |

### 6.2 Constraint Enforcement

```typescript
// NEW FILE: /backend/src/services/geometry/adjustmentConstraints.ts

interface AdjustmentConstraint {
  element_id: string;
  element_type: "wall" | "room" | "partition";
  
  // Movement limits
  max_translate_m: { x: number; y: number };
  max_stretch_m: { positive: number; negative: number };
  
  // Dependent elements
  affected_elements: string[];
  cascade_rules: CascadeRule[];
  
  // Validation rules
  validation_rules: ValidationRule[];
}

class AdjustmentConstraintService {
  
  /**
   * Get constraints for a specific element
   */
  getConstraints(
    elementId: string, 
    geometry: BlenderGeometryResult
  ): AdjustmentConstraint {
    
    const element = geometry.rooms.find(r => r.id === elementId);
    if (!element) throw new Error(`Element ${elementId} not found`);
    
    return {
      element_id: elementId,
      element_type: this.getElementType(element),
      
      max_translate_m: this.calculateMaxTranslate(element, geometry),
      max_stretch_m: this.calculateMaxStretch(element, geometry),
      
      affected_elements: this.findAffectedElements(element, geometry),
      cascade_rules: this.getCascadeRules(element, geometry),
      
      validation_rules: [
        { rule: "min_room_area", params: { min_sqm: element.code_minimum_sqm } },
        { rule: "maintain_adjacency", params: { required: element.adjacencies } },
        { rule: "no_overlap", params: {} },
        { rule: "building_code", params: { code: "ghana_building_code" } },
      ],
    };
  }
  
  /**
   * Validate adjustment against constraints
   */
  validateAdjustment(
    adjustment: UserAdjustmentDeltas,
    geometry: BlenderGeometryResult
  ): ValidationResult {
    
    const issues: ValidationIssue[] = [];
    
    for (const wallAdj of adjustment.wall_adjustments || []) {
      const constraint = this.getConstraints(wallAdj.wall_id, geometry);
      
      // Check movement limits
      if (Math.abs(wallAdj.delta.dx) > constraint.max_translate_m.x) {
        issues.push({
          element_id: wallAdj.wall_id,
          issue_type: "exceeds_limit",
          message: `X movement ${wallAdj.delta.dx}m exceeds max ${constraint.max_translate_m.x}m`,
          severity: "error",
        });
      }
      
      // Check cascade effects
      for (const affected of constraint.affected_elements) {
        const affectedRoom = geometry.rooms.find(r => r.id === affected);
        if (affectedRoom) {
          const newArea = this.calculateNewArea(affectedRoom, wallAdj.delta);
          if (newArea < affectedRoom.code_minimum_sqm) {
            issues.push({
              element_id: affected,
              issue_type: "below_minimum",
              message: `${affectedRoom.name} would be ${newArea}sqm, below minimum ${affectedRoom.code_minimum_sqm}sqm`,
              severity: "error",
            });
          }
        }
      }
    }
    
    return {
      is_valid: issues.filter(i => i.severity === "error").length === 0,
      issues,
    };
  }
}
```

### 6.3 Structural vs Non-Structural Elements

```typescript
enum ElementCategory {
  STRUCTURAL = "structural",       // Cannot be adjusted
  LOAD_BEARING = "load_bearing",   // Limited adjustment with engineering review
  PARTITION = "partition",         // Freely adjustable within room constraints
  FIXTURE = "fixture",             // Adjustable but affects room function
}

const ELEMENT_RESTRICTIONS: Record<ElementCategory, AdjustmentRestriction> = {
  [ElementCategory.STRUCTURAL]: {
    can_move: false,
    can_delete: false,
    can_resize: false,
    reason: "Structural elements are fixed by construction",
  },
  [ElementCategory.LOAD_BEARING]: {
    can_move: false,
    can_delete: false,
    can_resize: true,  // Thickness only
    reason: "Load-bearing elements require structural analysis",
  },
  [ElementCategory.PARTITION]: {
    can_move: true,
    can_delete: true,
    can_resize: true,
    reason: "Partitions can be freely adjusted",
  },
  [ElementCategory.FIXTURE]: {
    can_move: true,
    can_delete: false,
    can_resize: false,
    reason: "Fixtures are required for room function",
  },
};
```

---

## 7. Regeneration & Validation Loop

### 7.1 Regeneration Workflow (CAD "Regen" Equivalent)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    GEOMETRY REGENERATION LOOP                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐                                                   │
│  │ User edits   │                                                   │
│  │ in Fabric.js │                                                   │
│  └──────┬───────┘                                                   │
│         │ Adjustment deltas (NOT geometry)                          │
│         ▼                                                           │
│  ┌──────────────────┐                                               │
│  │ Constraint Check │ ◄─── Local validation (immediate feedback)    │
│  │ (Frontend)       │                                               │
│  └──────┬───────────┘                                               │
│         │ Pass                                                      │
│         ▼                                                           │
│  ┌──────────────────┐                                               │
│  │ Send to Backend  │                                               │
│  │ /api/floor-plans │                                               │
│  │ /adjustments     │                                               │
│  └──────┬───────────┘                                               │
│         │                                                           │
│         ▼                                                           │
│  ┌──────────────────┐                                               │
│  │ Blender          │ ◄─── Geometry kernel                          │
│  │ Regeneration     │                                               │
│  │ • Apply deltas   │                                               │
│  │ • Rebuild mesh   │                                               │
│  │ • Recalculate    │                                               │
│  │   areas          │                                               │
│  └──────┬───────────┘                                               │
│         │                                                           │
│         ▼                                                           │
│  ┌──────────────────┐                                               │
│  │ Validation       │ ◄─── Ghana Building Code + Construction Logic │
│  │ • Room minimums  │                                               │
│  │ • Wall integrity │                                               │
│  │ • Code compliance│                                               │
│  └──────┬───────────┘                                               │
│         │                                                           │
│         ▼                                                           │
│  ┌──────────────────┐    ┌──────────────────┐                       │
│  │ Valid?           │───►│ Store new        │                       │
│  │                  │Yes │ geometry version │                       │
│  └────────┬─────────┘    └──────┬───────────┘                       │
│           │No                   │                                   │
│           ▼                     ▼                                   │
│  ┌──────────────────┐    ┌──────────────────┐                       │
│  │ Return errors    │    │ Update Fabric.js │                       │
│  │ Revert preview   │    │ Render new geom  │                       │
│  └──────────────────┘    └──────────────────┘                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 API Endpoint for Adjustments

```typescript
// NEW ROUTE: /backend/src/routes/floor-plan-adjustments.ts

router.post('/:valuationId/floor-plans/adjustments', 
  validateUUID('valuationId'),
  requireAuth,
  async (req: Request, res: Response) => {
    
    const { valuationId } = req.params;
    const adjustments: UserAdjustmentDeltas = req.body;
    const userId = req.user.id;
    
    try {
      // 1. Load current geometry
      const currentGeometry = await blenderGeometryService.getGeometry(valuationId);
      if (!currentGeometry) {
        return res.status(404).json({ error: 'No geometry found' });
      }
      
      // 2. Check if locked
      if (await floorPlanService.isLocked(valuationId)) {
        return res.status(403).json({ error: 'Floor plan is locked for finalized valuation' });
      }
      
      // 3. Validate adjustments
      const validation = await adjustmentConstraintService.validateAdjustment(
        adjustments, 
        currentGeometry
      );
      
      if (!validation.is_valid) {
        return res.status(400).json({ 
          error: 'Adjustment rejected', 
          issues: validation.issues 
        });
      }
      
      // 4. Apply adjustments via Blender
      const newGeometry = await blenderGeometryService.applyAdjustments(
        valuationId,
        adjustments
      );
      
      // 5. Log for audit trail
      await auditService.logFloorPlanAdjustment({
        valuation_id: valuationId,
        user_id: userId,
        previous_geometry_hash: currentGeometry.geometry_hash,
        new_geometry_hash: newGeometry.geometry_hash,
        adjustments: adjustments,
        timestamp: new Date(),
      });
      
      // 6. Return new geometry
      res.json({
        success: true,
        data: newGeometry,
        previous_hash: currentGeometry.geometry_hash,
      });
      
    } catch (error) {
      logger.error('Floor plan adjustment failed', { error, valuationId });
      res.status(500).json({ error: 'Adjustment failed' });
    }
  }
);
```

---

## 8. Valuation Lock, Audit Trail & Trust

### 8.1 Geometry Versioning

```sql
-- NEW TABLE: valuation_floor_plan_geometry_versions
CREATE TABLE valuation_floor_plan_geometry_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
  
  -- Version identification
  geometry_hash VARCHAR(64) NOT NULL,  -- SHA-256
  version_number INTEGER NOT NULL,
  
  -- Full geometry snapshot
  blender_geometry JSONB NOT NULL,
  measurements JSONB NOT NULL,
  
  -- Source tracking
  source_type VARCHAR(50) NOT NULL,  -- 'llm_generated', 'user_adjusted', 'imported'
  source_reference UUID,  -- Reference to design_intent or adjustment log
  
  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(valuation_id, version_number)
);

-- Index for fast version lookup
CREATE INDEX idx_geometry_versions_valuation ON valuation_floor_plan_geometry_versions(valuation_id, version_number DESC);
```

### 8.2 Audit Trail Schema

```sql
-- NEW TABLE: valuation_floor_plan_audit_log
CREATE TABLE valuation_floor_plan_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id),
  
  -- Event type
  event_type VARCHAR(50) NOT NULL,  -- 'created', 'adjusted', 'locked', 'unlocked'
  
  -- Before/After state
  previous_geometry_hash VARCHAR(64),
  new_geometry_hash VARCHAR(64),
  
  -- What changed
  adjustments JSONB,  -- UserAdjustmentDeltas if applicable
  
  -- Who/When
  performed_by UUID REFERENCES users(id),
  performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Justification (required for adjustments)
  justification TEXT,
  
  -- LLM involvement (if applicable)
  llm_design_intent_id UUID REFERENCES valuation_floor_plan_design_intents(id)
);
```

### 8.3 Valuation-Safe Workflow

```typescript
// Enhanced floorPlanService methods

class FloorPlanService {
  // ... existing methods ...
  
  /**
   * Lock floor plan for finalized valuation
   * Creates immutable snapshot
   */
  async lockForValuation(
    valuationId: string, 
    userId: string,
    valuationReportId: string
  ): Promise<LockedFloorPlan> {
    
    // Get current geometry
    const geometry = await blenderGeometryService.getGeometry(valuationId);
    if (!geometry) throw new Error('No geometry to lock');
    
    // Validate geometry is complete
    const validation = await this.validateForLock(geometry);
    if (!validation.canLock) {
      throw new Error(`Cannot lock: ${validation.issues.join(', ')}`);
    }
    
    // Create immutable version
    const lockedVersion = await this.createLockedVersion(valuationId, geometry);
    
    // Update floor plan status
    await pool.query(`
      UPDATE valuation_floor_plans 
      SET is_locked = true, 
          locked_at = NOW(), 
          locked_by = $2,
          locked_geometry_hash = $3,
          valuation_report_id = $4
      WHERE valuation_id = $1
    `, [valuationId, userId, geometry.geometry_hash, valuationReportId]);
    
    // Log for audit
    await auditService.logFloorPlanLock({
      valuation_id: valuationId,
      user_id: userId,
      geometry_hash: geometry.geometry_hash,
      valuation_report_id: valuationReportId,
    });
    
    return {
      geometry_hash: geometry.geometry_hash,
      locked_at: new Date(),
      measurements: geometry.measurements,
    };
  }
  
  /**
   * Get locked geometry for valuation report
   * Returns EXACTLY the geometry used in valuation
   */
  async getLockedGeometry(valuationReportId: string): Promise<BlenderGeometryResult> {
    const result = await pool.query(`
      SELECT gv.blender_geometry, gv.measurements
      FROM valuation_floor_plan_geometry_versions gv
      JOIN valuation_floor_plans fp ON gv.geometry_hash = fp.locked_geometry_hash
      WHERE fp.valuation_report_id = $1
    `, [valuationReportId]);
    
    if (result.rows.length === 0) {
      throw new Error('No locked geometry found for valuation');
    }
    
    return result.rows[0].blender_geometry;
  }
}
```

### 8.4 RICS/IVS Defensibility Features

| RICS Requirement | Implementation |
|------------------|----------------|
| **Measurement transparency** | All measurements from Blender with calculation method logged |
| **Assumption disclosure** | LLM assumptions captured and surfaced in report |
| **Consistent methodology** | Same inputs → Same geometry via deterministic Blender scripts |
| **Audit trail** | Complete history of geometry changes with user/timestamp |
| **Professional judgment** | User adjustments require justification |
| **Data integrity** | Geometry hashed and versioned |
| **Reproducibility** | Any Blender installation can regenerate from design intent |

---

## 9. Tradeoff vs AutoCAD (Explicit Comparison)

### 9.1 Comparison Matrix

| Feature | AutoCAD | PROPMETRIK Floor Plan |
|---------|---------|----------------------|
| **Geometry authority** | User drawings | Blender kernel |
| **Drawing freedom** | Unlimited | Constrained to valid layouts |
| **Coordinate precision** | User-entered | System-calculated |
| **Wall modeling** | Manual | Automatic with thickness |
| **Area calculation** | Manual/CAD tools | Automatic, validated |
| **Audit trail** | External (file versions) | Built-in, per-change |
| **AI assistance** | Limited | LLM layout generation |
| **Valuation integration** | None | Native |
| **Code compliance** | Manual check | Automatic validation |
| **Multi-user** | File locking | Real-time with conflict resolution |

### 9.2 Intentional Flexibility Removal

| Removed Feature | Why | Benefit |
|-----------------|-----|---------|
| **Freehand polygon drawing** | Creates irregular, non-standard geometry | Consistent, code-compliant rooms |
| **Direct coordinate editing** | Bypasses validation | All geometry validated |
| **Unlimited wall movement** | Can create impossible layouts | Structurally sound configurations |
| **Room deletion** | Can violate building program | Layout integrity maintained |
| **Scale modification** | Inconsistent measurements | Single authoritative scale |

### 9.3 Gained Advantages

| Advantage | Description | Value for Valuers |
|-----------|-------------|-------------------|
| **Speed** | AI generates initial layout in seconds | 90% time reduction vs manual drawing |
| **Accuracy** | Blender calculates precise areas | No measurement errors |
| **Consistency** | Same property → Same geometry | Reproducible valuations |
| **Compliance** | Automatic code validation | No regulatory surprises |
| **Auditability** | Complete change history | Defensible in disputes |
| **Trust** | Measurements from validated kernel | Professional confidence |

### 9.4 Appropriate Tradeoff Summary

**For Architects (AutoCAD):**
- Need design freedom to explore options
- Geometry IS the deliverable
- Creative expression valued

**For Valuers (PROPMETRIK):**
- Need to capture existing reality
- Measurements ARE the deliverable
- Accuracy and defensibility valued

**Conclusion:** The tradeoff is appropriate because **valuers are not designing buildings**—they are measuring and documenting existing properties. The constraints that limit "design freedom" are the same constraints that ensure valuation accuracy.

---

## 10. Implementation Roadmap

### 10.0 Implementation Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLOOR PLAN ENHANCEMENT - 16 WEEK ROADMAP                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PHASE 1        PHASE 2        PHASE 3        PHASE 4        PHASE 5       │
│  Foundation     Blender        LLM            Integration    Production     │
│  Weeks 1-3      Weeks 4-6      Weeks 7-9      Weeks 10-13    Weeks 14-16   │
│                                                                              │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────────┐   ┌───────────┐ │
│  │ Schema  │   │ Python  │   │ Claude  │   │ End-to-End  │   │ Migration │ │
│  │ Updates │──►│ Scripts │──►│ Prompts │──►│ Pipeline    │──►│ & Launch  │ │
│  │ Types   │   │ Blender │   │ Design  │   │ Fabric.js   │   │ Hardening │ │
│  │ APIs    │   │ Kernel  │   │ Intent  │   │ Constraints │   │ Audit     │ │
│  └─────────┘   └─────────┘   └─────────┘   └─────────────┘   └───────────┘ │
│                                                                              │
│  Dependencies: ──────────────────────────────────────────────────────────►  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.1 Phase 1: Foundation & Schema (Weeks 1-3)

**Objective:** Establish database schema, TypeScript interfaces, and API structure for the new architecture.

#### Week 1: Database Schema & Migrations

| Day | Task | Owner | Deliverable | Definition of Done |
|-----|------|-------|-------------|-------------------|
| 1-2 | Create geometry versioning table | Backend | `025_floor_plan_geometry_versioning.sql` | Migration runs, rollback works |
| 2-3 | Create audit log table | Backend | `026_floor_plan_audit_log.sql` | FK constraints valid |
| 3-4 | Create design intents table | Backend | `027_floor_plan_design_intents.sql` | Index optimization verified |
| 4-5 | Update existing `valuation_floor_plans` table | Backend | Migration with backward compat | No data loss, legacy fields preserved |

```sql
-- Week 1 Deliverable: New tables

-- Table 1: Geometry Versions
CREATE TABLE valuation_floor_plan_geometry_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  geometry_hash VARCHAR(64) NOT NULL,
  blender_output JSONB NOT NULL,
  fabric_projection JSONB NOT NULL,
  measurements JSONB NOT NULL,
  validation_result JSONB,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  superseded_at TIMESTAMP,
  superseded_by UUID REFERENCES valuation_floor_plan_geometry_versions(id),
  UNIQUE(valuation_id, version_number)
);

-- Table 2: Audit Log
CREATE TABLE valuation_floor_plan_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
  geometry_version_id UUID REFERENCES valuation_floor_plan_geometry_versions(id),
  action VARCHAR(50) NOT NULL,
  actor_id UUID REFERENCES users(id),
  actor_type VARCHAR(20) NOT NULL, -- 'user', 'system', 'llm', 'blender'
  adjustment_deltas JSONB,
  justification TEXT,
  timestamp TIMESTAMP DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

-- Table 3: Design Intents (LLM outputs)
CREATE TABLE valuation_floor_plan_design_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES valuations(id) ON DELETE CASCADE,
  llm_model VARCHAR(50) NOT NULL,
  llm_request_id VARCHAR(100),
  input_features JSONB NOT NULL,
  layout_strategy JSONB NOT NULL,
  room_program JSONB NOT NULL,
  assumptions JSONB NOT NULL,
  alternatives JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  applied_at TIMESTAMP,
  rejected_at TIMESTAMP,
  rejection_reason TEXT
);
```

#### Week 2: TypeScript Interfaces & Types

| Day | Task | Owner | Deliverable | Definition of Done |
|-----|------|-------|-------------|-------------------|
| 1-2 | LLMDesignIntent interface | Backend | `types/floorPlan.ts` | Zod validation schema |
| 2-3 | BlenderGeometryResult interface | Backend | `types/geometry.ts` | All fields documented |
| 3-4 | UserAdjustmentDeltas interface | Backend | `types/adjustments.ts` | Constraint types defined |
| 4-5 | API request/response types | Backend | `types/api/floorPlan.ts` | OpenAPI spec updated |

```typescript
// Week 2 Deliverable: Core interfaces

// /backend/src/types/floorPlan.ts
export interface LLMDesignIntent {
  version: "1.0.0";
  timestamp: string;
  model_id: string;
  request_id: string;
  
  input_features: PropertyFeatures;
  layout_strategy: LayoutStrategy;
  room_program: RoomProgram[];
  assumptions: DesignAssumption[];
  alternatives?: LayoutAlternative[];
}

export interface PropertyFeatures {
  bedrooms: number;
  bathrooms: number;
  total_area_sqm: number;
  property_type: PropertyType;
  floors: number;
  year_built?: number;
  construction_type?: ConstructionType;
}

export interface LayoutStrategy {
  template_id: string;
  style: "colonial" | "modern" | "compound" | "apartment";
  circulation_type: "central_corridor" | "side_corridor" | "open_flow";
  primary_orientation?: "north" | "south" | "east" | "west";
}

export interface RoomProgram {
  room_type: RoomType;
  target_area_sqm: number;
  min_area_sqm: number;
  importance: "primary" | "secondary" | "ancillary";
  adjacency_requirements: string[];
  natural_light_required: boolean;
}

export interface DesignAssumption {
  category: "dimension" | "layout" | "construction" | "code";
  assumption: string;
  default_value: string | number;
  confidence: number;
  source: string;
  overridable: boolean;
}
```

#### Week 3: API Endpoints & Routes

| Day | Task | Owner | Deliverable | Definition of Done |
|-----|------|-------|-------------|-------------------|
| 1-2 | Design intent API routes | Backend | `routes/floor-plan-design.ts` | 4 endpoints functional |
| 2-3 | Geometry API routes | Backend | `routes/floor-plan-geometry.ts` | 5 endpoints functional |
| 3-4 | Adjustment API routes | Backend | `routes/floor-plan-adjustments.ts` | 3 endpoints functional |
| 4-5 | Integration tests | Backend | `tests/integration/floorPlan.test.ts` | 80%+ coverage |

```typescript
// Week 3 Deliverable: API Routes

// POST /api/valuations/:id/floor-plans/design-intent
// Generate LLM design intent from property features

// GET /api/valuations/:id/floor-plans/design-intent
// Retrieve existing design intent

// POST /api/valuations/:id/floor-plans/design-intent/:intentId/apply
// Apply design intent → trigger Blender generation

// POST /api/valuations/:id/floor-plans/geometry/regenerate
// Force regeneration from current design intent

// GET /api/valuations/:id/floor-plans/geometry/current
// Get current validated geometry

// GET /api/valuations/:id/floor-plans/geometry/versions
// List all geometry versions

// POST /api/valuations/:id/floor-plans/adjustments
// Submit user adjustment deltas

// GET /api/valuations/:id/floor-plans/adjustments/constraints
// Get allowed adjustment constraints for current geometry

// POST /api/valuations/:id/floor-plans/lock
// Lock floor plan for finalized valuation
```

**Phase 1 Exit Criteria:**
- [ ] All 3 database migrations run successfully
- [ ] TypeScript interfaces compile with strict mode
- [ ] All API endpoints return 501 (Not Implemented) placeholder
- [ ] Integration test suite skeleton in place

---

### 10.2 Phase 2: Blender Geometry Kernel (Weeks 4-6)

**Objective:** Establish Blender as the authoritative geometry engine with Python scripting infrastructure.

#### Week 4: Blender Environment Setup

| Day | Task | Owner | Deliverable | Definition of Done |
|-----|------|-------|-------------|-------------------|
| 1-2 | Docker container for Blender | DevOps | `docker/blender/Dockerfile` | Blender 4.0 runs headless |
| 2-3 | Python environment setup | Backend | `requirements-blender.txt` | All deps installed |
| 3-4 | IPC mechanism (stdin/stdout JSON) | Backend | `blenderGeometryService.ts` | Round-trip test passes |
| 4-5 | Health check & monitoring | DevOps | Prometheus metrics | Blender process monitored |

```dockerfile
# Week 4 Deliverable: Blender Docker

FROM ubuntu:22.04

# Install Blender 4.0
RUN apt-get update && apt-get install -y \
    blender \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies for Blender scripts
COPY requirements-blender.txt /app/
RUN pip3 install -r /app/requirements-blender.txt

# Copy Blender scripts
COPY blender_scripts/ /app/blender_scripts/

# Set working directory
WORKDIR /app

# Run Blender in background mode
ENTRYPOINT ["blender", "--background", "--python"]
```

#### Week 5: Core Geometry Generation Scripts

| Day | Task | Owner | Deliverable | Definition of Done |
|-----|------|-------|-------------|-------------------|
| 1-2 | Wall geometry generation | Backend | `generate_walls.py` | 150mm/230mm walls render |
| 2-3 | Room generation from program | Backend | `generate_rooms.py` | Rooms meet min sizes |
| 3-4 | Shared wall resolution | Backend | `resolve_shared_walls.py` | No double-counting |
| 4-5 | Area calculation (GFA/NIA) | Backend | `calculate_areas.py` | ±0.1 sqm accuracy |

```python
# Week 5 Deliverable: Core Blender Scripts

# /blender_scripts/generate_floor_plan.py
import bpy
import json
import sys

class FloorPlanGenerator:
    """Generate validated floor plan geometry from design intent."""
    
    WALL_THICKNESS = {
        'external': 0.230,  # 230mm external walls
        'internal': 0.150,  # 150mm internal partitions
        'load_bearing': 0.200,  # 200mm load-bearing internal
    }
    
    def __init__(self, design_intent: dict):
        self.design_intent = design_intent
        self.template = self._load_template(design_intent['layout_strategy']['template_id'])
        self.rooms = []
        self.walls = []
        
    def generate(self) -> dict:
        """Main generation pipeline."""
        # 1. Clear scene
        self._clear_scene()
        
        # 2. Generate external envelope
        self._generate_envelope()
        
        # 3. Place rooms according to program
        self._place_rooms()
        
        # 4. Generate internal walls
        self._generate_internal_walls()
        
        # 5. Resolve shared walls (boolean operations)
        self._resolve_shared_walls()
        
        # 6. Calculate areas
        measurements = self._calculate_areas()
        
        # 7. Validate against building code
        validation = self._validate_geometry()
        
        # 8. Generate 2D projection for Fabric.js
        fabric_projection = self._project_to_2d()
        
        return {
            'success': True,
            'geometry_hash': self._compute_hash(),
            'measurements': measurements,
            'fabric_projection': fabric_projection,
            'validation': validation,
        }
    
    def _calculate_areas(self) -> dict:
        """Calculate GFA, NIA, and room areas from mesh geometry."""
        gfa = self._calculate_gfa()  # External wall face
        nia = self._calculate_nia()  # Internal wall face
        
        room_areas = {}
        for room in self.rooms:
            room_areas[room['id']] = {
                'type': room['type'],
                'area_sqm': self._calculate_room_area(room),
                'meets_minimum': room['area_sqm'] >= room['min_area_sqm'],
            }
        
        return {
            'gfa_sqm': gfa,
            'nia_sqm': nia,
            'efficiency_ratio': nia / gfa if gfa > 0 else 0,
            'rooms': room_areas,
            'circulation_sqm': gfa - sum(r['area_sqm'] for r in room_areas.values()),
        }

# Entry point for subprocess call
if __name__ == '__main__':
    input_json = sys.stdin.read()
    design_intent = json.loads(input_json)
    
    generator = FloorPlanGenerator(design_intent)
    result = generator.generate()
    
    print(json.dumps(result))
```

#### Week 6: Templates & Multi-Floor Support

| Day | Task | Owner | Deliverable | Definition of Done |
|-----|------|-------|-------------|-------------------|
| 1-2 | Residential templates (2BR, 3BR, 4BR) | Backend | `.blend` template files | 6 templates created |
| 2-3 | Commercial templates (office, retail) | Backend | `.blend` template files | 3 templates created |
| 3-4 | Multi-floor stacking logic | Backend | `stack_floors.py` | Structural alignment verified |
| 4-5 | Template selection algorithm | Backend | `template_selector.py` | Best-fit scoring works |

```python
# Week 6 Deliverable: Template Library

TEMPLATE_LIBRARY = {
    # Residential Templates
    'RES_2BR_COMPACT': {
        'file': 'residential_2br_compact.blend',
        'base_area_sqm': 65,
        'area_range': (55, 80),
        'rooms': ['living', 'kitchen', 'bedroom1', 'bedroom2', 'bathroom'],
    },
    'RES_3BR_COLONIAL': {
        'file': 'residential_3br_colonial.blend',
        'base_area_sqm': 120,
        'area_range': (100, 150),
        'rooms': ['living', 'dining', 'kitchen', 'bedroom1', 'bedroom2', 'bedroom3', 'bathroom1', 'bathroom2'],
    },
    'RES_3BR_MODERN': {
        'file': 'residential_3br_modern.blend',
        'base_area_sqm': 130,
        'area_range': (110, 160),
        'rooms': ['living_dining', 'kitchen', 'master_suite', 'bedroom2', 'bedroom3', 'bathroom1', 'bathroom2'],
    },
    'RES_4BR_EXECUTIVE': {
        'file': 'residential_4br_executive.blend',
        'base_area_sqm': 180,
        'area_range': (160, 220),
        'rooms': ['living', 'dining', 'kitchen', 'master_suite', 'bedroom2', 'bedroom3', 'bedroom4', 'bathroom1', 'bathroom2', 'bathroom3'],
    },
    # Commercial Templates
    'COM_OFFICE_OPEN': {
        'file': 'commercial_office_open.blend',
        'base_area_sqm': 200,
        'area_range': (100, 500),
        'rooms': ['reception', 'open_office', 'meeting1', 'meeting2', 'kitchen', 'bathroom'],
    },
    'COM_RETAIL_STANDARD': {
        'file': 'commercial_retail.blend',
        'base_area_sqm': 150,
        'area_range': (50, 300),
        'rooms': ['sales_floor', 'storage', 'office', 'bathroom'],
    },
}
```

**Phase 2 Exit Criteria:**
- [ ] Blender Docker container runs in CI/CD
- [ ] `generate_floor_plan.py` produces valid geometry from design intent
- [ ] GFA/NIA calculations match manual verification within ±0.5 sqm
- [ ] 9 layout templates available (6 residential, 3 commercial)

---

### 10.3 Phase 3: LLM Design Intent Service (Weeks 7-9)

**Objective:** Integrate Claude for intelligent layout generation and assumption surfacing.

#### Week 7: LLM Service Infrastructure

| Day | Task | Owner | Deliverable | Definition of Done |
|-----|------|-------|-------------|-------------------|
| 1-2 | Claude API integration | AI Team | `anthropicClient.ts` update | Streaming works |
| 2-3 | Design intent service class | AI Team | `floorPlanDesignIntentService.ts` | Basic generation works |
| 3-4 | Prompt templates | AI Team | `prompts/floor-plan-design.md` | 3 prompt versions |
| 4-5 | Response parsing & validation | AI Team | Zod schema validation | Invalid responses caught |

```typescript
// Week 7 Deliverable: LLM Service

// /backend/src/services/ai/floorPlanDesignIntentService.ts
import Anthropic from '@anthropic-ai/sdk';
import { LLMDesignIntent, PropertyFeatures } from '../../types/floorPlan';
import { designIntentSchema } from '../../validation/floorPlanSchemas';

export class FloorPlanDesignIntentService {
  private anthropic: Anthropic;
  private modelId = 'claude-sonnet-4-20250514';
  
  async generateDesignIntent(
    valuationId: string,
    features: PropertyFeatures,
    preferences?: UserLayoutPreferences
  ): Promise<LLMDesignIntent> {
    
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(features, preferences);
    
    const response = await this.anthropic.messages.create({
      model: this.modelId,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    
    // Parse and validate response
    const rawIntent = this.parseResponse(response);
    const validatedIntent = designIntentSchema.parse(rawIntent);
    
    // Store in database
    await this.storeDesignIntent(valuationId, validatedIntent);
    
    return validatedIntent;
  }
  
  private buildSystemPrompt(): string {
    return `You are an expert residential architect and property valuer in Ghana.
Your task is to generate a floor plan DESIGN INTENT (not geometry) for a property.

CRITICAL RULES:
1. NEVER output coordinates, measurements, or pixel values
2. NEVER output Fabric.js or CAD instructions
3. ONLY output structured layout decisions and assumptions
4. Reference Ghana Building Code LI 1630 for minimum room sizes
5. Consider typical Ghanaian residential layouts and preferences

Your output will be processed by a geometry kernel (Blender) that will generate actual floor plans.
Focus on layout STRATEGY, room RELATIONSHIPS, and design ASSUMPTIONS.`;
  }
}
```

#### Week 8: Assumption Surfacing & Alternatives

| Day | Task | Owner | Deliverable | Definition of Done |
|-----|------|-------|-------------|-------------------|
| 1-2 | Assumption extraction logic | AI Team | `extractAssumptions()` | All assumptions flagged |
| 2-3 | Alternative layout generation | AI Team | `generateAlternatives()` | 2-3 options generated |
| 3-4 | Assumption UI component | Frontend | `AssumptionReview.tsx` | User can accept/modify |
| 4-5 | Alternative selection UI | Frontend | `LayoutAlternatives.tsx` | Side-by-side comparison |

```typescript
// Week 8 Deliverable: Assumption Surfacing

interface SurfacedAssumption {
  id: string;
  category: 'dimension' | 'layout' | 'construction' | 'code';
  assumption: string;
  default_value: string | number;
  alternatives: Array<{
    value: string | number;
    impact: string;
  }>;
  confidence: number;
  source: string;
  requires_user_confirmation: boolean;
}

// Example surfaced assumptions for a 3BR property:
const exampleAssumptions: SurfacedAssumption[] = [
  {
    id: 'ceiling_height',
    category: 'dimension',
    assumption: 'Standard ceiling height assumed',
    default_value: '3.0m',
    alternatives: [
      { value: '2.7m', impact: 'Reduces construction cost, meets minimum code' },
      { value: '3.3m', impact: 'Premium feel, higher AC costs' },
    ],
    confidence: 0.85,
    source: 'Ghana Building Code LI 1630',
    requires_user_confirmation: false,
  },
  {
    id: 'corridor_width',
    category: 'layout',
    assumption: 'Central corridor layout with standard width',
    default_value: '1.2m',
    alternatives: [
      { value: '1.0m', impact: 'Minimum code, tight circulation' },
      { value: '1.5m', impact: 'Generous circulation, reduces room sizes' },
    ],
    confidence: 0.75,
    source: 'Typical Ghanaian residential design',
    requires_user_confirmation: true,
  },
];
```

#### Week 9: Ghana Building Code Integration

| Day | Task | Owner | Deliverable | Definition of Done |
|-----|------|-------|-------------|-------------------|
| 1-2 | Building code rules engine | Backend | `buildingCodeValidator.ts` | LI 1630 rules coded |
| 2-3 | Room minimum size validation | Backend | `roomSizeValidator.ts` | All room types covered |
| 3-4 | Accessibility requirements | Backend | `accessibilityValidator.ts` | Door widths, corridors |
| 4-5 | Integration with LLM prompts | AI Team | Updated prompts | Code references included |

```typescript
// Week 9 Deliverable: Ghana Building Code Rules

// /backend/src/services/geometry/ghanaBuildingCode.ts

export const GHANA_BUILDING_CODE_LI_1630 = {
  // Minimum room sizes (in sqm)
  ROOM_MINIMUMS: {
    living_room: 12.0,
    dining_room: 9.0,
    kitchen: 5.5,
    master_bedroom: 11.0,
    bedroom: 9.0,
    bathroom: 3.0,
    toilet: 1.5,
    store: 2.0,
  },
  
  // Minimum dimensions (in meters)
  DIMENSION_MINIMUMS: {
    room_width: 2.4,
    corridor_width: 1.0,
    door_width_internal: 0.9,
    door_width_external: 1.0,
    ceiling_height: 2.7,
    window_area_ratio: 0.10, // 10% of floor area
  },
  
  // Staircase requirements
  STAIRCASE: {
    min_width: 0.9,
    max_riser: 0.19,
    min_tread: 0.25,
    headroom: 2.0,
  },
};

export function validateAgainstBuildingCode(
  geometry: BlenderGeometryResult
): ValidationResult {
  const violations: CodeViolation[] = [];
  
  // Check room sizes
  for (const room of geometry.rooms) {
    const minSize = GHANA_BUILDING_CODE_LI_1630.ROOM_MINIMUMS[room.type];
    if (minSize && room.area_sqm < minSize) {
      violations.push({
        code: 'LI1630-ROOM-SIZE',
        severity: 'error',
        element: room.id,
        message: `${room.type} (${room.area_sqm.toFixed(1)} sqm) below minimum (${minSize} sqm)`,
        reference: 'Ghana Building Code LI 1630, Schedule 1',
      });
    }
  }
  
  // Check corridor widths
  // Check door widths
  // Check ceiling heights
  // ... additional validations
  
  return {
    valid: violations.filter(v => v.severity === 'error').length === 0,
    violations,
  };
}
```

**Phase 3 Exit Criteria:**
- [ ] LLM generates valid design intent from property features
- [ ] Assumptions surfaced with user-reviewable UI
- [ ] 2-3 layout alternatives generated per request
- [ ] Ghana Building Code validation integrated

---

### 10.4 Phase 4: Frontend Integration & Constraints (Weeks 10-13)

**Objective:** Refactor Fabric.js to render Blender geometry with constrained adjustments.

#### Week 10: Constrained FloorPlanBuilder

| Day | Task | Owner | Deliverable | Definition of Done |
|-----|------|-------|-------------|-------------------|
| 1-2 | Blender geometry renderer | Frontend | `BlenderGeometryRenderer.tsx` | Renders from JSON |
| 2-3 | Remove freehand polygon mode | Frontend | Updated `FloorPlanBuilder.tsx` | Only constrained modes |
| 3-4 | Adjustment mode implementation | Frontend | `AdjustmentMode.tsx` | Drag handles work |
| 4-5 | Real-time constraint preview | Frontend | Visual constraint indicators | Red/green feedback |

```tsx
// Week 10 Deliverable: Constrained Floor Plan Builder

// /frontend/src/components/valuation/ConstrainedFloorPlanBuilder.tsx

export default function ConstrainedFloorPlanBuilder({
  valuationId,
  blenderGeometry,
  onAdjustmentSubmit,
  readonly = false,
}: ConstrainedFloorPlanBuilderProps) {
  
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [pendingAdjustments, setPendingAdjustments] = useState<AdjustmentDelta[]>([]);
  const [constraints, setConstraints] = useState<AdjustmentConstraint[]>([]);
  
  // Render Blender geometry (read-only base)
  useEffect(() => {
    if (!blenderGeometry) return;
    renderBlenderGeometry(canvasRef.current, blenderGeometry.fabric_projection);
  }, [blenderGeometry]);
  
  // Setup constrained interactions
  useEffect(() => {
    if (!canvasRef.current || readonly) return;
    
    canvasRef.current.on('object:moving', (e) => {
      const target = e.target;
      const constraint = constraints.find(c => c.element_id === target?.data?.id);
      
      if (constraint) {
        // Apply constraint limits
        const clampedPos = clampToConstraints(target, constraint);
        target.set({ left: clampedPos.x, top: clampedPos.y });
        
        // Show visual feedback
        updateConstraintIndicators(target, constraint);
      }
    });
    
    canvasRef.current.on('object:modified', (e) => {
      // Record adjustment delta (not raw coordinates)
      const delta = calculateAdjustmentDelta(e.target, blenderGeometry);
      setPendingAdjustments(prev => [...prev, delta]);
    });
  }, [constraints, readonly]);
  
  // Submit adjustments → Blender regeneration
  const handleApplyAdjustments = async () => {
    if (pendingAdjustments.length === 0) return;
    
    const adjustmentRequest: UserAdjustmentDeltas = {
      adjustment_id: generateId(),
      valuation_id: valuationId,
      base_geometry_version: blenderGeometry.version,
      adjustments: pendingAdjustments,
      timestamp: new Date().toISOString(),
      justification: justificationText,
    };
    
    await onAdjustmentSubmit(adjustmentRequest);
    setPendingAdjustments([]);
  };
  
  return (
    <div className="floor-plan-builder">
      {/* Toolbar - constrained tools only */}
      <Toolbar>
        <ToolButton icon="move" label="Adjust Walls" />
        <ToolButton icon="resize" label="Resize Room" />
        <ToolButton icon="swap" label="Change Room Type" />
        {/* NO freehand polygon, NO delete, NO arbitrary shapes */}
      </Toolbar>
      
      {/* Canvas */}
      <canvas ref={canvasRef} />
      
      {/* Pending adjustments panel */}
      {pendingAdjustments.length > 0 && (
        <AdjustmentPanel
          adjustments={pendingAdjustments}
          onApply={handleApplyAdjustments}
          onDiscard={() => setPendingAdjustments([])}
        />
      )}
    </div>
  );
}
```

#### Week 11: Adjustment Constraint Engine

| Day | Task | Owner | Deliverable | Definition of Done |
|-----|------|-------|-------------|-------------------|
| 1-2 | Backend constraint calculator | Backend | `adjustmentConstraints.ts` | Per-element limits |
| 2-3 | Constraint API endpoint | Backend | `GET /constraints` | Returns allowed ranges |
| 3-4 | Frontend constraint visualization | Frontend | Constraint overlays | Drag limits shown |
| 4-5 | Violation prevention | Frontend | Hard stops | Cannot violate |

```typescript
// Week 11 Deliverable: Constraint Engine

// /backend/src/services/geometry/adjustmentConstraints.ts

export class AdjustmentConstraintService {
  
  calculateConstraints(geometry: BlenderGeometryResult): AdjustmentConstraint[] {
    const constraints: AdjustmentConstraint[] = [];
    
    for (const wall of geometry.walls) {
      constraints.push({
        element_id: wall.id,
        element_type: 'wall',
        category: wall.is_external ? 'structural' : 'partition',
        
        allowed_operations: wall.is_external 
          ? ['stretch'] 
          : ['move', 'delete'],
        
        limits: {
          move: wall.is_external ? null : {
            min_x: wall.x - 2.0,  // Max 2m in either direction
            max_x: wall.x + 2.0,
            min_y: wall.y - 2.0,
            max_y: wall.y + 2.0,
          },
          stretch: wall.is_external ? {
            min_length: wall.length * 0.9,  // ±10%
            max_length: wall.length * 1.1,
          } : null,
        },
        
        validation_rules: [
          {
            rule: 'maintain_room_minimum',
            params: { affected_rooms: this.getAdjacentRooms(wall, geometry) },
          },
          {
            rule: 'maintain_adjacency',
            params: { required_adjacencies: this.getRequiredAdjacencies(wall, geometry) },
          },
        ],
      });
    }
    
    return constraints;
  }
}
```

#### Week 12: Regeneration Loop & Real-Time Updates

| Day | Task | Owner | Deliverable | Definition of Done |
|-----|------|-------|-------------|-------------------|
| 1-2 | WebSocket for geometry updates | Backend | Socket.io integration | Real-time push |
| 2-3 | Optimistic UI updates | Frontend | Immediate visual feedback | No lag on drag |
| 3-4 | Blender queue processing | Backend | Bull queue for Blender jobs | Handles concurrent |
| 4-5 | Error recovery & rollback | Full Stack | Revert on failure | Clean error states |

```typescript
// Week 12 Deliverable: Real-Time Regeneration

// /backend/src/queues/blenderQueue.ts

import Bull from 'bull';

export const blenderQueue = new Bull('blender-geometry', {
  redis: process.env.REDIS_URL,
  defaultJobOptions: {
    timeout: 30000, // 30s max
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  },
});

blenderQueue.process(async (job) => {
  const { valuationId, designIntent, adjustments } = job.data;
  
  // Run Blender generation
  const geometry = await blenderGeometryService.generate(
    designIntent,
    adjustments
  );
  
  // Store new geometry version
  await geometryVersionService.store(valuationId, geometry);
  
  // Emit WebSocket update
  io.to(`valuation:${valuationId}`).emit('geometry:updated', {
    version: geometry.version,
    measurements: geometry.measurements,
    fabric_projection: geometry.fabric_projection,
  });
  
  return geometry;
});
```

#### Week 13: Audit Trail & Valuation Lock

| Day | Task | Owner | Deliverable | Definition of Done |
|-----|------|-------|-------------|-------------------|
| 1-2 | Comprehensive audit logging | Backend | All actions logged | Complete trail |
| 2-3 | Geometry version comparison | Frontend | Diff visualization | See what changed |
| 3-4 | Valuation lock integration | Full Stack | Lock prevents edits | Enforced at API |
| 4-5 | Audit report generation | Backend | PDF/JSON export | Compliance ready |

```typescript
// Week 13 Deliverable: Audit Trail

// /backend/src/services/geometry/auditService.ts

export class FloorPlanAuditService {
  
  async logAction(
    valuationId: string,
    action: AuditAction,
    details: AuditDetails
  ): Promise<void> {
    
    await pool.query(`
      INSERT INTO valuation_floor_plan_audit_log (
        valuation_id,
        geometry_version_id,
        action,
        actor_id,
        actor_type,
        adjustment_deltas,
        justification,
        ip_address,
        user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      valuationId,
      details.geometry_version_id,
      action,
      details.actor_id,
      details.actor_type,
      JSON.stringify(details.adjustments),
      details.justification,
      details.ip_address,
      details.user_agent,
    ]);
  }
  
  async generateAuditReport(valuationId: string): Promise<AuditReport> {
    const entries = await pool.query(`
      SELECT 
        al.*,
        gv.geometry_hash,
        gv.measurements,
        u.full_name as actor_name
      FROM valuation_floor_plan_audit_log al
      LEFT JOIN valuation_floor_plan_geometry_versions gv ON al.geometry_version_id = gv.id
      LEFT JOIN users u ON al.actor_id = u.id
      WHERE al.valuation_id = $1
      ORDER BY al.timestamp ASC
    `, [valuationId]);
    
    return {
      valuation_id: valuationId,
      generated_at: new Date().toISOString(),
      entry_count: entries.rows.length,
      entries: entries.rows,
      summary: this.generateSummary(entries.rows),
    };
  }
}
```

**Phase 4 Exit Criteria:**
- [ ] Fabric.js renders Blender geometry correctly
- [ ] Freehand drawing modes removed
- [ ] Constrained adjustments work with visual feedback
- [ ] Real-time regeneration via WebSocket
- [ ] Complete audit trail for all geometry changes

---

### 10.5 Phase 5: Production Hardening & Migration (Weeks 14-16)

**Objective:** Migrate existing floor plans, performance optimization, and production deployment.

#### Week 14: Performance Optimization

| Day | Task | Owner | Deliverable | Definition of Done |
|-----|------|-------|-------------|-------------------|
| 1-2 | Blender generation caching | Backend | Redis geometry cache | <100ms for cached |
| 2-3 | Parallel Blender workers | DevOps | Scaled Blender pods | 10 concurrent jobs |
| 3-4 | Fabric.js rendering optimization | Frontend | Canvas virtualization | Smooth at 1000 objects |
| 4-5 | API response compression | Backend | gzip/brotli | 70% size reduction |

```typescript
// Week 14 Deliverable: Performance Optimization

// Geometry caching
const GEOMETRY_CACHE_TTL = 3600; // 1 hour

async function getCachedGeometry(designIntentHash: string): Promise<BlenderGeometryResult | null> {
  const cached = await redis.get(`geometry:${designIntentHash}`);
  if (cached) {
    await redis.hincrby('geometry:cache:stats', 'hits', 1);
    return JSON.parse(cached);
  }
  await redis.hincrby('geometry:cache:stats', 'misses', 1);
  return null;
}

async function cacheGeometry(designIntentHash: string, geometry: BlenderGeometryResult): Promise<void> {
  await redis.setex(
    `geometry:${designIntentHash}`,
    GEOMETRY_CACHE_TTL,
    JSON.stringify(geometry)
  );
}
```

#### Week 15: Migration & Backward Compatibility

| Day | Task | Owner | Deliverable | Definition of Done |
|-----|------|-------|-------------|-------------------|
| 1-2 | Legacy floor plan analyzer | Backend | `analyzeLegacyFloorPlan.ts` | Extracts room program |
| 2-3 | Batch migration script | Backend | `migrate-floor-plans.ts` | Processes all existing |
| 3-4 | Fallback rendering mode | Frontend | Legacy canvas support | Old plans still work |
| 4-5 | Migration monitoring | DevOps | Dashboard + alerts | Track progress |

```typescript
// Week 15 Deliverable: Migration Script

// /backend/scripts/migrate-floor-plans.ts

async function migrateAllFloorPlans(): Promise<MigrationReport> {
  const report: MigrationReport = {
    total: 0,
    migrated: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };
  
  // Get all floor plans with legacy canvas_json
  const legacyPlans = await pool.query(`
    SELECT vfp.*, v.id as valuation_id, v.property_id
    FROM valuation_floor_plans vfp
    JOIN valuations v ON vfp.valuation_id = v.id
    WHERE vfp.migration_status IS NULL
    ORDER BY vfp.created_at DESC
  `);
  
  report.total = legacyPlans.rows.length;
  console.log(`Found ${report.total} floor plans to migrate`);
  
  for (const plan of legacyPlans.rows) {
    try {
      // 1. Analyze legacy canvas to extract room program
      const roomProgram = await analyzeLegacyCanvas(plan.canvas_json);
      
      // 2. Get property features from valuation
      const features = await getPropertyFeatures(plan.valuation_id);
      
      // 3. Generate design intent
      const designIntent = await designIntentService.createFromLegacy(
        roomProgram,
        features
      );
      
      // 4. Generate Blender geometry
      const geometry = await blenderGeometryService.generate(designIntent);
      
      // 5. Store new geometry version
      await geometryVersionService.store(plan.valuation_id, geometry, {
        migration_source: 'legacy_canvas',
        legacy_canvas_hash: hashCanvas(plan.canvas_json),
      });
      
      // 6. Update migration status
      await pool.query(`
        UPDATE valuation_floor_plans
        SET migration_status = 'completed',
            legacy_canvas_json = canvas_json,
            migrated_at = NOW()
        WHERE id = $1
      `, [plan.id]);
      
      report.migrated++;
      
    } catch (error) {
      report.failed++;
      report.errors.push({
        floor_plan_id: plan.id,
        valuation_id: plan.valuation_id,
        error: error.message,
      });
      
      await pool.query(`
        UPDATE valuation_floor_plans
        SET migration_status = 'failed',
            migration_error = $2
        WHERE id = $1
      `, [plan.id, error.message]);
    }
  }
  
  return report;
}
```

#### Week 16: Production Deployment & Launch

| Day | Task | Owner | Deliverable | Definition of Done |
|-----|------|-------|-------------|-------------------|
| 1-2 | Staging environment testing | QA | Test report | All scenarios pass |
| 2-3 | Production deployment plan | DevOps | Runbook | Step-by-step guide |
| 3-4 | Gradual rollout (feature flags) | Full Stack | LaunchDarkly flags | 10% → 50% → 100% |
| 4-5 | Monitoring & alerting | DevOps | Grafana dashboards | Key metrics tracked |

```typescript
// Week 16 Deliverable: Feature Flags

// Feature flag configuration
const FLOOR_PLAN_V2_FLAGS = {
  // Gradual rollout by user/organization
  'floor-plan-v2-enabled': {
    type: 'boolean',
    defaultValue: false,
    targeting: [
      { percentage: 10, condition: 'internal_users' },
      { percentage: 50, condition: 'beta_organizations' },
    ],
  },
  
  // Force legacy mode for specific valuations
  'floor-plan-force-legacy': {
    type: 'boolean',
    defaultValue: false,
    targeting: [
      { valuations: ['list-of-problematic-valuations'] },
    ],
  },
  
  // LLM model selection
  'floor-plan-llm-model': {
    type: 'string',
    defaultValue: 'claude-sonnet-4-20250514',
    variations: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022'],
  },
};

// Usage in code
async function getFloorPlanBuilder(valuationId: string, userId: string) {
  const useV2 = await launchDarkly.variation('floor-plan-v2-enabled', { userId }, false);
  const forceLegacy = await launchDarkly.variation('floor-plan-force-legacy', { valuationId }, false);
  
  if (useV2 && !forceLegacy) {
    return <ConstrainedFloorPlanBuilder />;
  }
  return <LegacyFloorPlanBuilder />;
}
```

**Phase 5 Exit Criteria:**
- [ ] Blender generation < 2s for 95th percentile
- [ ] All existing floor plans migrated or flagged
- [ ] Feature flags enable gradual rollout
- [ ] Production monitoring dashboards operational
- [ ] Runbook documented for on-call

---

### 10.6 Post-Launch: Continuous Improvement (Ongoing)

| Timeframe | Focus | Deliverables |
|-----------|-------|--------------|
| Week 17-18 | User feedback collection | Hotjar recordings, NPS survey |
| Week 19-20 | LLM prompt refinement | Improved layout quality |
| Week 21-24 | Template expansion | 20+ templates for Ghana property types |
| Month 3+ | Advanced features | 3D visualization, AR preview |

---

### 10.7 Risk Mitigation Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Blender performance issues | Medium | High | Parallel workers, caching, queue management |
| LLM hallucination in layouts | Medium | Medium | Strict output schema, Blender validation |
| Migration data loss | Low | Critical | Preserve legacy_canvas_json, reversible |
| User resistance to constraints | Medium | Medium | Education, gradual rollout, feedback loops |
| Building code interpretation errors | Medium | High | Expert review, configurable rules |

---

### 10.8 Success Metrics

| Metric | Baseline | Target (Week 16) | Measurement |
|--------|----------|------------------|-------------|
| Floor plan creation time | 45 mins | 5 mins | Average time to complete |
| Measurement accuracy | ±5% | ±0.5% | Comparison to physical survey |
| User adoption | N/A | 80% | % using new system |
| Regeneration latency | N/A | <2s | 95th percentile |
| Audit completeness | 0% | 100% | % of actions logged |
| Building code compliance | Unknown | 100% | Automated validation pass rate |

---

## 10.4 Migration Strategy

```typescript
// Backward compatibility with existing floor plans

async function migrateExistingFloorPlan(valuationId: string): Promise<void> {
  // 1. Load existing canvas_json
  const existing = await floorPlanService.getByValuationId(valuationId);
  if (existing.length === 0) return;
  
  // 2. Extract room program from existing layout
  const roomProgram = extractRoomProgram(existing[0].rooms);
  
  // 3. Create design intent from existing layout
  const designIntent = await designIntentService.createFromExisting(roomProgram);
  
  // 4. Generate Blender geometry
  const geometry = await blenderGeometryService.generateFromDesignIntent(
    valuationId,
    designIntent
  );
  
  // 5. Mark as migrated
  await pool.query(`
    UPDATE valuation_floor_plans 
    SET migration_status = 'blender_regenerated',
        legacy_canvas_json = canvas_json
    WHERE valuation_id = $1
  `, [valuationId]);
}
```

---

## 11. File Structure Updates

```
backend/
├── src/
│   ├── services/
│   │   ├── valuation-engine/
│   │   │   └── floorPlanService.ts        # UPDATED: Integration with Blender
│   │   ├── ai/
│   │   │   └── floorPlanDesignIntentService.ts  # NEW: LLM design intent
│   │   └── geometry/
│   │       ├── blenderGeometryService.ts  # NEW: Blender integration
│   │       └── adjustmentConstraints.ts   # NEW: Constraint validation
│   ├── routes/
│   │   ├── valuations.ts                  # UPDATED: New floor plan routes
│   │   └── floor-plan-adjustments.ts      # NEW: Adjustment endpoints
│   └── database/
│       └── migrations/
│           └── 025_floor_plan_geometry_versioning.sql  # NEW
├── blender_scripts/
│   ├── generate_floor_plan.py             # NEW: Layout generation
│   ├── apply_adjustments.py               # NEW: Adjustment processing
│   └── templates/
│       ├── residential_3br.blend          # NEW: Layout templates
│       └── residential_4br.blend          # NEW

frontend/
├── src/
│   ├── components/
│   │   └── valuation/
│   │       ├── FloorPlanBuilder.tsx       # UPDATED: Constrained mode
│   │       └── ConstrainedFloorPlanBuilder.tsx  # NEW
│   └── app/
│       └── floor-plan/
│           └── page.tsx                    # UPDATED: New workflow
```

---

## 12. Conclusion

This architecture delivers:

1. **Trust:** Geometry from validated kernel, not user drawings
2. **Speed:** AI-generated layouts vs manual CAD
3. **Accuracy:** Wall thickness, shared walls, code compliance
4. **Auditability:** Complete version history and change logs
5. **Defensibility:** RICS/GhIS-compliant measurement methodology

The intentional removal of unrestricted CAD features is the **correct tradeoff** for a valuation-first product. Professional valuers need reliable measurements, not design tools.

---

*Document maintained by PROPMETRIK Engineering Team*
*Last updated: January 2026*