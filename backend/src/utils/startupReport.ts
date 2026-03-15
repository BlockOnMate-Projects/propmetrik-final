/**
 * Startup diagnostics report — tracks every bootstrap step with timing,
 * status, and error details so container logs reveal exactly what failed.
 */

export interface StepResult {
  name: string;
  status: 'ok' | 'warn' | 'fail' | 'skip';
  durationMs: number;
  error?: string;
  detail?: string;
}

interface StartupReport {
  startedAt: string;
  completedAt: string | null;
  overallStatus: 'pending' | 'ok' | 'degraded' | 'failed';
  steps: StepResult[];
}

const report: StartupReport = {
  startedAt: new Date().toISOString(),
  completedAt: null,
  overallStatus: 'pending',
  steps: [],
};

/** Record one bootstrap step with timing. */
export async function recordStep(
  name: string,
  fn: () => Promise<{ status: 'ok' | 'warn' | 'fail' | 'skip'; detail?: string }>,
): Promise<StepResult> {
  const t0 = Date.now();
  try {
    const result = await fn();
    const step: StepResult = {
      name,
      status: result.status,
      durationMs: Date.now() - t0,
      detail: result.detail,
    };
    report.steps.push(step);
    return step;
  } catch (err) {
    const step: StepResult = {
      name,
      status: 'fail',
      durationMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
    report.steps.push(step);
    return step;
  }
}

/** Finalize the report after bootstrap completes. */
export function finalizeReport(): void {
  report.completedAt = new Date().toISOString();
  const hasFail = report.steps.some((s) => s.status === 'fail');
  const hasWarn = report.steps.some((s) => s.status === 'warn');
  report.overallStatus = hasFail ? 'failed' : hasWarn ? 'degraded' : 'ok';
}

/** Get the full report (used by /health/startup). */
export function getStartupReport(): StartupReport {
  return { ...report, steps: [...report.steps] };
}

/** Print a human-readable summary to stdout so it appears in `docker logs`. */
export function printStartupSummary(): void {
  const icon = { ok: '✓', warn: '⚠', fail: '✗', skip: '–' };
  const lines = [
    '',
    '╔══════════════════════════════════════════════════════════════╗',
    '║              PROPMETRIK API — STARTUP REPORT                ║',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
  ];

  for (const step of report.steps) {
    const sym = icon[step.status] || '?';
    const dur = `${step.durationMs}ms`.padStart(7);
    let line = `  ${sym}  ${step.name.padEnd(35)} ${dur}`;
    if (step.detail) line += `  (${step.detail})`;
    if (step.error) line += `  ERROR: ${step.error}`;
    lines.push(line);
  }

  lines.push('');
  lines.push(`  Overall: ${report.overallStatus.toUpperCase()}  |  Boot time: ${report.completedAt && report.startedAt ? `${new Date(report.completedAt).getTime() - new Date(report.startedAt).getTime()}ms` : 'N/A'}`);
  lines.push('');

  // Use console.log so it's guaranteed to appear in docker logs even if
  // the structured logger transport is misconfigured.
  console.log(lines.join('\n'));
}
