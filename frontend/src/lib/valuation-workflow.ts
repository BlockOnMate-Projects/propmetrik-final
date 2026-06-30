/**
 * Valuation workflow navigation.
 *
 * A valuation can apply several methodologies. The method pages form an ordered
 * wizard; which pages are active depends on which methods the valuer selected
 * (`valuation.methods_applied`). Previously each page hardcoded its own BACK and
 * CONTINUE destinations, which drifted out of sync (e.g. the Cost page's back
 * button always said "BACK TO MARKET DATA" and Rental Market's said "BACK TO
 * METHODS" regardless of the actual previous step).
 *
 * This module is the single source of truth for the step order so BACK and
 * CONTINUE are always symmetric and driven by the selected methods.
 */

export interface WorkflowStep {
  /** URL slug under /dashboard/valuations/[id]/ */
  page: string
  /** Gating method key in methods_applied; null = always present (e.g. reconciliation) */
  method: string | null
  /** Short label used in nav buttons, e.g. "COST APPROACH" */
  label: string
}

// Canonical order of the valuation wizard. Sales comparison spans two pages
// (comparable selection → market analysis); the income approach spans two
// (rental-market evidence → income engine). Reconciliation is always last.
export const VALUATION_STEPS: WorkflowStep[] = [
  { page: 'comparables', method: 'sales_comparison', label: 'COMPARABLES' },
  { page: 'market', method: 'sales_comparison', label: 'MARKET DATA' },
  { page: 'cost', method: 'cost_approach', label: 'COST APPROACH' },
  { page: 'rental-market', method: 'income_approach', label: 'RENTAL MARKET' },
  { page: 'income', method: 'income_approach', label: 'INCOME APPROACH' },
  { page: 'drc', method: 'drc_method', label: 'DRC' },
  { page: 'profits', method: 'profits_method', label: 'PROFITS' },
  { page: 'residual', method: 'residual_method', label: 'RESIDUAL' },
  { page: 'reconciliation', method: null, label: 'RECONCILIATION' },
]

/** The method-selection hub the wizard returns to before the first active step. */
export const METHODS_STEP: WorkflowStep = { page: 'methods', method: null, label: 'METHODS' }

/** Read the selected methods off a valuation, tolerant of both field names. */
export function getSelectedMethods(valuation: any): string[] {
  const m = valuation?.selectedMethods || valuation?.methods_applied || []
  return Array.isArray(m) ? m : []
}

/** The subset of steps active for the given selected methods, in workflow order. */
export function activeSteps(selectedMethods: string[]): WorkflowStep[] {
  return VALUATION_STEPS.filter((s) => s.method === null || selectedMethods.includes(s.method))
}

/** The step after `currentPage`. Falls through to reconciliation at the end. */
export function getNextStep(currentPage: string, selectedMethods: string[]): WorkflowStep {
  const steps = activeSteps(selectedMethods)
  const idx = steps.findIndex((s) => s.page === currentPage)
  if (idx === -1 || idx >= steps.length - 1) return steps[steps.length - 1]
  return steps[idx + 1]
}

/** The step before `currentPage`. Falls back to the methods hub at the start. */
export function getPrevStep(currentPage: string, selectedMethods: string[]): WorkflowStep {
  const steps = activeSteps(selectedMethods)
  const idx = steps.findIndex((s) => s.page === currentPage)
  if (idx <= 0) return METHODS_STEP
  return steps[idx - 1]
}

/** Absolute route for a step within a valuation. */
export function stepPath(valuationId: string, step: WorkflowStep): string {
  return `/dashboard/valuations/${valuationId}/${step.page}`
}
