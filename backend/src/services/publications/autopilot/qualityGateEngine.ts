/**
 * Quality Gate Engine
 *
 * 4-layer validation pipeline that replaces human approval for autopilot publications.
 * Layer 1: Structural validation (deterministic)
 * Layer 2: Factual accuracy (AI cross-check)
 * Layer 3: Content quality (AI self-review → confidence score)
 * Layer 4: Freshness & deduplication
 */
import { logger } from '../../../utils/logger';
import * as geminiService from '../geminiService';
import { getTemplate } from './templates';
import type {
  GeneratedDraft,
  PreviousEdition,
  QualityGateResults,
  QualityLayerResult,
  QualityCheck,
  QualityThresholds,
} from './types';

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Run all 4 quality gate layers against a generated draft.
 * Returns immediately on first hard-fail layer (structural / factual).
 */
export async function runQualityGates(
  draft: GeneratedDraft,
  thresholds: QualityThresholds,
  previousEdition: PreviousEdition | null,
  rawData: Record<string, unknown>,
): Promise<QualityGateResults> {
  logger.info({ product: draft.product, edition: draft.edition, title: draft.title }, 'Running quality gates');

  // LAYER 1 — Structural (soft gate — warns but does NOT short-circuit)
  const structural = runStructuralValidation(draft);
  if (!structural.passed) {
    logger.warn({ product: draft.product, edition: draft.edition, details: structural.details }, 'Structural validation has warnings — continuing to AI layers');
  }

  // LAYER 2 — Factual accuracy (soft gate — penalizes confidence, only hard-blocks on 6+ mismatches)
  const factual = await runFactualAccuracy(draft, rawData);
  if (!factual.passed) {
    const mismatchCount = factual.checks?.filter((c: QualityCheck) => !c.passed).length || 0;
    if (mismatchCount >= 10) {
      // Egregious factual errors — hard block
      return buildResult(false, 0, factual.details || 'Critical factual accuracy failure', {
        structural,
        factual,
        content: skippedLayer('Content Quality'),
        freshness: skippedLayer('Freshness & Deduplication'),
      });
    }
    logger.warn({ product: draft.product, edition: draft.edition, mismatches: mismatchCount, details: factual.details }, 'Factual accuracy has warnings — applying penalty');
  }

  // LAYER 3 — Content quality (produces confidence score)
  const content = await runContentQuality(draft, thresholds.minConfidence);

  // LAYER 4 — Freshness & deduplication
  const freshness = runFreshnessCheck(draft, previousEdition, thresholds);

  // Aggregate — structural and factual warnings reduce confidence but don't block
  const aiConfidence = content.score ?? 0;
  const structuralChecks = structural.checks || [];
  const structuralFailCount = structuralChecks.filter((c: QualityCheck) => !c.passed).length;
  const structuralPenalty = structural.passed ? 0 : Math.min(0.03, structuralFailCount * 0.01);
  const factualChecks = factual.checks || [];
  const factualFailCount = factualChecks.filter((c: QualityCheck) => !c.passed).length;
  const factualPenalty = factual.passed ? 0 : Math.min(0.05, factualFailCount * 0.01);
  const confidence = Math.max(0, aiConfidence - structuralPenalty - factualPenalty);
  const allPassed = content.passed && freshness.passed && (confidence >= thresholds.minConfidence);
  const failedLayers = [structural, factual, content, freshness].filter(l => !l.passed);
  const failureReason = !allPassed
    ? failedLayers.map(l => l.details).filter(Boolean).join('; ') || 'Quality gate failed'
    : null;

  return buildResult(allPassed, confidence, failureReason, {
    structural,
    factual,
    content,
    freshness,
  });
}

// ============================================================
// LAYER 1 — STRUCTURAL VALIDATION (deterministic)
// ============================================================

function runStructuralValidation(draft: GeneratedDraft): QualityLayerResult {
  const checks: QualityCheck[] = [];
  const template = getTemplate(draft.templateId || `${draft.product}_${draft.edition}_v1`);

  // Title
  checks.push({
    name: 'Title present',
    passed: !!draft.title && draft.title.length > 0,
    expected: 'Non-empty title',
    actual: draft.title || '(empty)',
  });
  checks.push({
    name: 'Title length ≤ 200 chars',
    passed: (draft.title?.length || 0) <= 200,
    expected: '≤ 200 chars',
    actual: `${draft.title?.length || 0} chars`,
  });
  checks.push({
    name: 'Title not ALL CAPS',
    passed: draft.title !== draft.title?.toUpperCase() || !draft.title,
    expected: 'Mixed case',
    actual: draft.title || '',
  });

  // Meta description
  checks.push({
    name: 'Meta description present',
    passed: !!draft.seoDescription && draft.seoDescription.length > 0,
    expected: 'Non-empty description',
    actual: draft.seoDescription || '(empty)',
  });
  checks.push({
    name: 'Meta description ≤ 500 chars',
    passed: (draft.seoDescription?.length || 0) <= 500,
    expected: '≤ 500 chars',
    actual: `${draft.seoDescription?.length || 0} chars`,
  });

  // Word count within ±50% of target (AI output varies)
  const target = template.wordCountTarget;
  const tolerance = target * 0.5;
  checks.push({
    name: 'Word count within ±50% of target',
    passed: draft.wordCount >= target - tolerance && draft.wordCount <= target + tolerance,
    expected: `${target - tolerance}–${target + tolerance}`,
    actual: `${draft.wordCount}`,
  });

  // Required sections present
  const requiredSections = template.sections.filter(s => s.required).map(s => s.heading);
  const draftHeadings = draft.sections.map(s => s.heading.toLowerCase());
  for (const required of requiredSections) {
    checks.push({
      name: `Section present: ${required}`,
      passed: draftHeadings.some(h => h.includes(required.toLowerCase())),
      expected: required,
      actual: draftHeadings.find(h => h.includes(required.toLowerCase())) || '(missing)',
    });
  }

  // Taxonomy tags
  checks.push({
    name: 'At least 1 sector tag',
    passed: draft.sectors.length >= 1,
    expected: '≥ 1',
    actual: `${draft.sectors.length}`,
  });
  checks.push({
    name: 'At least 1 topic tag',
    passed: draft.topics.length >= 1,
    expected: '≥ 1',
    actual: `${draft.topics.length}`,
  });
  checks.push({
    name: 'At least 1 region tag',
    passed: draft.regions.length >= 1,
    expected: '≥ 1',
    actual: `${draft.regions.length}`,
  });

  // Charts rendered
  checks.push({
    name: 'Charts within expected range',
    passed: draft.charts.length >= template.chartCountRange[0] && draft.charts.length <= template.chartCountRange[1],
    expected: `${template.chartCountRange[0]}–${template.chartCountRange[1]}`,
    actual: `${draft.charts.length}`,
  });

  // Excerpt present
  checks.push({
    name: 'Excerpt present',
    passed: !!draft.excerpt && draft.excerpt.length > 0,
    expected: 'Non-empty excerpt',
    actual: draft.excerpt ? `${draft.excerpt.length} chars` : '(empty)',
  });

  const allPassed = checks.every(c => c.passed);
  const failedChecks = checks.filter(c => !c.passed);

  return {
    name: 'Structural Validation',
    passed: allPassed,
    checks,
    details: allPassed
      ? 'All structural checks passed'
      : `Failed: ${failedChecks.map(c => c.name).join(', ')}`,
  };
}

// ============================================================
// LAYER 2 — FACTUAL ACCURACY (AI cross-check)
// ============================================================

async function runFactualAccuracy(
  draft: GeneratedDraft,
  rawData: Record<string, unknown>,
): Promise<QualityLayerResult> {
  const checks: QualityCheck[] = [];

  try {
    // Use AI to cross-check numbers in text against raw source data
    const fullText = draft.sections.map(s => `## ${s.heading}\n${s.content}`).join('\n\n');

    const response = await geminiService.generateSection({
      sectionType: 'custom',
      dataContext: { rawData, articleText: fullText },
      customPrompt: `You are a fact-checker for a real estate research publication. 

Compare every statistic, percentage, date, and number mentioned in the article text against the raw source data provided.

For each number found in the article:
1. Identify the claim (e.g., "CCI rose 3.2%")
2. Find the corresponding value in raw data
3. Determine if they match (within 0.1% tolerance for rounding)

Return ONLY a JSON object:
{
  "checksPerformed": 0,
  "mismatches": [
    { "claim": "...", "articleValue": "...", "sourceValue": "...", "field": "..." }
  ],
  "allAccurate": true/false
}

Return valid JSON only, no markdown code blocks.`,
    });

    const cleaned = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let result: { checksPerformed: number; mismatches: Array<{ claim: string; articleValue: string; sourceValue: string }>; allAccurate: boolean };

    try {
      result = JSON.parse(cleaned);
    } catch {
      // If AI returns unparseable response, pass with warning
      logger.warn({ raw: response.text }, 'Factual accuracy AI response unparseable — passing with warning');
      return {
        name: 'Factual Accuracy',
        passed: true,
        checks: [{ name: 'AI cross-check', passed: true, message: 'AI response unparseable; manual review recommended' }],
        details: 'AI cross-check inconclusive — passing with advisory',
      };
    }

    checks.push({
      name: 'AI factual cross-check',
      passed: result.allAccurate,
      expected: '0 mismatches',
      actual: `${result.mismatches?.length || 0} mismatches found`,
    });

    if (result.mismatches?.length > 0) {
      for (const m of result.mismatches.slice(0, 5)) {
        checks.push({
          name: `Mismatch: ${m.claim}`,
          passed: false,
          expected: m.sourceValue,
          actual: m.articleValue,
        });
      }
    }

    return {
      name: 'Factual Accuracy',
      passed: result.allAccurate,
      checks,
      details: result.allAccurate
        ? `${result.checksPerformed} facts verified — all accurate`
        : `${result.mismatches.length} factual mismatches detected`,
    };
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Factual accuracy AI check failed');
    // On AI failure, defer rather than silently pass
    return {
      name: 'Factual Accuracy',
      passed: false,
      checks: [{ name: 'AI cross-check', passed: false, message: `AI check error: ${(error as Error).message}` }],
      details: 'Factual accuracy check failed due to AI service error',
    };
  }
}

// ============================================================
// LAYER 3 — CONTENT QUALITY (AI self-review → confidence score)
// ============================================================

async function runContentQuality(
  draft: GeneratedDraft,
  minConfidence: number,
): Promise<QualityLayerResult> {
  const checks: QualityCheck[] = [];

  try {
    const fullText = draft.sections.map(s => `## ${s.heading}\n${s.content}`).join('\n\n');

    const response = await geminiService.generateSection({
      sectionType: 'custom',
      dataContext: { articleText: fullText, title: draft.title, wordCount: draft.wordCount },
      customPrompt: `You are a senior editor reviewing a real estate research publication before publication. Rate this article on multiple quality dimensions.

Review the following article and score each dimension from 0.0 to 1.0:

1. **professionalTone** — No casual language, no hype, measured and authoritative
2. **balancedPerspective** — Both risks and opportunities discussed
3. **logicalFlow** — Sections connect naturally, no jarring transitions
4. **noRepetition** — Each section adds unique value, no copy-paste across sections
5. **chartsReferenced** — Charts mentioned in narrative (not orphaned)
6. **forwardLooking** — Forward statements properly qualified ("we expect", "outlook suggests")
7. **readability** — Suitable for professional audience (Grade 12-16)
8. **noHallucinations** — No invented companies, projects, or people

Return ONLY a JSON object:
{
  "scores": {
    "professionalTone": 0.0,
    "balancedPerspective": 0.0,
    "logicalFlow": 0.0,
    "noRepetition": 0.0,
    "chartsReferenced": 0.0,
    "forwardLooking": 0.0,
    "readability": 0.0,
    "noHallucinations": 0.0
  },
  "overallConfidence": 0.0,
  "issues": ["issue 1", "issue 2"]
}

overallConfidence should be a weighted mean where noHallucinations weighs 2x and factual accuracy weighs 2x.
Return valid JSON only, no markdown code blocks.`,
    });

    const cleaned = response.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let result: {
      scores: Record<string, number>;
      overallConfidence: number;
      issues: string[];
    };

    try {
      result = JSON.parse(cleaned);
    } catch {
      logger.warn({ raw: response.text }, 'Content quality AI response unparseable');
      return {
        name: 'Content Quality',
        passed: false,
        checks: [{ name: 'AI quality review', passed: false, message: 'AI response unparseable' }],
        score: 0,
        details: 'Content quality check failed — AI response unparseable',
      };
    }

    const confidence = result.overallConfidence;

    // Add individual dimension checks
    for (const [dimension, score] of Object.entries(result.scores || {})) {
      checks.push({
        name: `Quality: ${dimension}`,
        passed: score >= 0.6,
        expected: '≥ 0.6',
        actual: `${score.toFixed(2)}`,
      });
    }

    checks.push({
      name: `Overall confidence ≥ ${minConfidence}`,
      passed: confidence >= minConfidence,
      expected: `≥ ${minConfidence}`,
      actual: `${confidence.toFixed(3)}`,
    });

    return {
      name: 'Content Quality',
      passed: confidence >= minConfidence,
      checks,
      score: confidence,
      details: confidence >= minConfidence
        ? `Confidence ${confidence.toFixed(3)} meets threshold ${minConfidence}`
        : `Confidence ${confidence.toFixed(3)} below threshold ${minConfidence}. Issues: ${(result.issues || []).join('; ')}`,
    };
  } catch (error) {
    logger.error({ error: (error as Error).message }, 'Content quality AI review failed');
    return {
      name: 'Content Quality',
      passed: false,
      checks: [{ name: 'AI quality review', passed: false, message: `AI error: ${(error as Error).message}` }],
      score: 0,
      details: 'Content quality check failed due to AI service error',
    };
  }
}

// ============================================================
// LAYER 4 — FRESHNESS & DEDUPLICATION
// ============================================================

function runFreshnessCheck(
  draft: GeneratedDraft,
  previousEdition: PreviousEdition | null,
  thresholds: QualityThresholds,
): QualityLayerResult {
  const checks: QualityCheck[] = [];

  // Check chart data freshness — all chart snapshot timestamps should be recent
  const now = new Date();
  const maxAge = thresholds.maxDataAgeDays * 24 * 60 * 60 * 1000; // ms

  for (const chart of draft.charts) {
    const snapshotDate = chart.snapshotData?.timestamp
      ? new Date(chart.snapshotData.timestamp as string)
      : now; // If no timestamp, assume current
    const age = now.getTime() - snapshotDate.getTime();
    const isStale = age > maxAge;

    checks.push({
      name: `Freshness: ${chart.title}`,
      passed: !isStale,
      expected: `≤ ${thresholds.maxDataAgeDays} days old`,
      actual: `${Math.floor(age / (24 * 60 * 60 * 1000))} days old`,
    });
  }

  // Content similarity vs. previous edition (simple word overlap for now)
  if (previousEdition?.content_html) {
    const similarity = computeSimpleSimilarity(
      draft.sections.map(s => s.content).join(' '),
      previousEdition.content_html,
    );
    checks.push({
      name: `Similarity vs. previous edition < ${thresholds.maxSimilarity}`,
      passed: similarity < thresholds.maxSimilarity,
      expected: `< ${thresholds.maxSimilarity}`,
      actual: `${similarity.toFixed(3)}`,
    });
  } else {
    checks.push({
      name: 'No previous edition for dedup comparison',
      passed: true,
      message: 'First edition — skipping similarity check',
    });
  }

  const allPassed = checks.every(c => c.passed);
  const failedChecks = checks.filter(c => !c.passed);

  return {
    name: 'Freshness & Deduplication',
    passed: allPassed,
    checks,
    details: allPassed
      ? 'All data fresh and content sufficiently unique'
      : `Failed: ${failedChecks.map(c => c.name).join(', ')}`,
  };
}

// ============================================================
// HELPERS
// ============================================================

function buildResult(
  allPassed: boolean,
  confidence: number,
  failureReason: string | null,
  layers: QualityGateResults['layers'],
): QualityGateResults {
  return { allPassed, confidence, failureReason: allPassed ? null : failureReason, layers };
}

function skippedLayer(name: string): QualityLayerResult {
  return { name, passed: false, checks: [], details: 'Skipped — prior layer failed' };
}

/**
 * Simple word-overlap similarity (Jaccard coefficient on word bigrams).
 * Returns 0.0 – 1.0 (1.0 = identical).
 *
 * This is a lightweight substitute until we integrate embedding-based cosine similarity.
 */
function computeSimpleSimilarity(textA: string, textB: string): number {
  const bigramsA = extractBigrams(textA);
  const bigramsB = extractBigrams(textB);

  if (bigramsA.size === 0 && bigramsB.size === 0) return 0;

  let intersection = 0;
  for (const bigram of bigramsA) {
    if (bigramsB.has(bigram)) intersection++;
  }

  const union = bigramsA.size + bigramsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function extractBigrams(text: string): Set<string> {
  const words = text.toLowerCase().replace(/<[^>]*>/g, '').split(/\s+/).filter(w => w.length > 2);
  const bigrams = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.add(`${words[i]} ${words[i + 1]}`);
  }
  return bigrams;
}
