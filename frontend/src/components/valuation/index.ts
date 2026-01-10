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

// Labor Costs Panel
export { LaborCostsPanel } from './LaborCostsPanel';
