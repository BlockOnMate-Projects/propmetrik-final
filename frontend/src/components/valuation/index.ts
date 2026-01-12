/**
 * Valuation Components
 * 
 * Exports all valuation-related components for property assessment.
 */

export { default as FloorPlanBuilder } from './FloorPlanBuilder';
export type {
  RoomType,
  Point,
  RoomMeasurement,
  FloorPlanSpecs,
  PropertyMeasurements,
} from './FloorPlanBuilder';

export {
  GapAnalysisAlert,
  ContributionDialog,
  ContributorProfileCard,
  CreditRewardAnimation,
} from './ContributionWorkflow';
export type {
  GapAnalysis,
  GapReason,
  MissingDataPoint,
  ContributionPrompt,
  ContributorProfile,
} from './ContributionWorkflow';

// Market/Sales Comparison Components
export { MarketContextPanel } from './MarketContextPanel';
export type { MarketContextData } from './MarketContextPanel';
export { ComparableDetailCard } from './ComparableDetailCard';
export type {
  ComparableProperty,
  ComparableAdjustments,
} from './ComparableDetailCard';
export { AdjustmentGrid, ADJUSTMENT_CATEGORIES } from './AdjustmentGrid';
export type {
  SubjectProperty,
  ComparableWithAdjustments,
} from './AdjustmentGrid';

// Listing Adjustment Panel (RICS/GhIS compliant asking-to-achieved adjustment)
export { ListingAdjustmentPanel, generateListingDisclosure } from './ListingAdjustmentPanel';
export type {
  EvidenceType as ListingEvidenceType,
  MarketConditions,
  ListingAdjustmentConfig,
} from './ListingAdjustmentPanel';

// Cost Approach Components
export { ConstructionCostPanel } from './ConstructionCostPanel';
export type { ConstructionCostData } from './ConstructionCostPanel';

// Editable Construction Cost Panel (with inline editing)
export { EditableConstructionCostPanel } from './EditableConstructionCostPanel';
export type { 
  ConstructionCostEditableData,
  MaterialIndex,
  LaborCost,
} from './EditableConstructionCostPanel';

// Land Value Panel (multi-method reconciliation)
export { LandValuePanel } from './LandValuePanel';
export type {
  LandValueMethodDetail,
  LandComparableSummary,
  LandValueResult,
} from './LandValuePanel';

// Labor Costs Panel
export { LaborCostsPanel } from './LaborCostsPanel';

// Depreciation Breakdown Panel (D6)
export { DepreciationBreakdownPanel } from './DepreciationBreakdownPanel';
export type {
  PhysicalDepreciationData,
  FunctionalObsolescenceItem,
  FunctionalObsolescenceData,
  ExternalObsolescenceData,
  DepreciationBreakdownData,
} from './DepreciationBreakdownPanel';

// Depreciation Override Dialog (D7)
export { DepreciationOverrideDialog } from './DepreciationOverrideDialog';
export type {
  DepreciationComponent,
  EvidenceType,
  OverrideFormData,
  OverrideValidationResult,
} from './DepreciationOverrideDialog';

// Combined Depreciation Panel with Override Capability
export { DepreciationPanelWithOverrides } from './DepreciationPanelWithOverrides';
export type { DepreciationOverrideState } from './DepreciationPanelWithOverrides';
