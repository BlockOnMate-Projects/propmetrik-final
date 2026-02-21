/**
 * Autopilot Module — barrel exports
 */
export { autopilotPipeline } from './autopilotPipeline';
export { autopilotScheduler } from './autopilotScheduler';
export { anomalyTrigger } from './anomalyTrigger';
export { runQualityGates } from './qualityGateEngine';
export { selectCharts, generateAICharts } from './chartSelectionEngine';
export { getTemplate, PUBLICATION_TEMPLATES } from './templates';

export type {
  AutopilotSchedule,
  AutopilotRun,
  AutopilotRunResult,
  QualityGateResults,
  QualityLayerResult,
  QualityCheck,
  GeneratedDraft,
  GeneratedSection,
  SelectedChart,
  ChartCandidate,
  DetectedAnomaly,
  AnomalyThresholds,
  AutopilotSettings,
  PublishOptions,
  AutopilotHealth,
  PublicationTemplate,
  TemplateSectionDef,
  ChartSelectionRules,
  QualityThresholds,
  PreviousEdition,
} from './types';
