/**
 * AI drafting for the free-text valuation report writeups that previously rendered
 * "[Not provided]" — Evidence of Land Values, Grounds & External Works, General Condition,
 * Services, and the Accommodation narrative.
 *
 * Each draft is grounded ONLY in the data passed in (subject attributes + real land
 * comparables for land evidence). The valuer reviews and edits before it is saved to
 * `properties.metadata`, so AI is a first-draft aid, never the final word. Mirrors the
 * grounded, no-fabrication approach of areaNarrativeService.
 */

import { aiService } from '../ai/aiService';
import { logger } from '../../utils/logger';

export type WriteupSection =
  | 'land_value_evidence'
  | 'grounds_external_works'
  | 'condition_state'
  | 'services_description'
  | 'accommodation_description';

export interface WriteupSubject {
  property_type?: string | null;
  bedrooms?: number | string | null;
  bathrooms?: number | string | null;
  floors?: number | string | null;
  year_built?: number | string | null;
  condition?: string | null;
  land_area_sqm?: number | string | null;
  building_area_sqm?: number | string | null;
  amenities?: string[] | string | null;
  neighbourhood?: string | null;
  city?: string | null;
  region?: string | null;
  tenure?: string | null;
  /** Real land comparables (for land_value_evidence only). */
  landComparables?: Array<{
    address?: string | null;
    land_area_sqm?: number | null;
    price?: number | null;
    price_per_sqm?: number | null;
    distance_km?: number | null;
  }>;
  /** Concluded subject land rate (GH₵/m²) from the land-value engine, if available. */
  landRatePerSqm?: number | null;
  currency?: string;
}

const SECTION_BRIEF: Record<WriteupSection, string> = {
  land_value_evidence:
    'Write the "Evidence of Land Values" section. Summarise the comparable land evidence supplied, note the per-square-metre range, and conclude the land rate adopted for the subject and the resulting land value. 3–5 sentences.',
  grounds_external_works:
    'Write the "Grounds and External Works" section describing the compound, boundary treatment, paving/driveway, landscaping and external features. 2–4 sentences.',
  condition_state:
    'Write the "General Condition and State of Repair" section, commenting on the overall condition, apparent maintenance and any defects observed for a building of this age. 2–4 sentences.',
  services_description:
    'Write the "Services" section covering the utilities and services available to the property (water, electricity, telecoms, sanitation) given its locality. 2–4 sentences.',
  accommodation_description:
    'Write the "Accommodation" narrative summarising the layout and rooms across the floors. 2–3 sentences.',
};

function fmt(n?: number | null): string {
  if (n === null || n === undefined || isNaN(Number(n))) return '';
  return Number(n).toLocaleString('en-GH', { maximumFractionDigits: 0 });
}

class ValuationWriteupService {
  /** Build the data block the model may use — strictly the facts we hold. */
  private buildFacts(section: WriteupSection, s: WriteupSubject): string {
    const cur = s.currency || 'GH₵';
    const lines: string[] = [];
    const amenities = Array.isArray(s.amenities)
      ? s.amenities.join(', ')
      : (s.amenities || '');
    lines.push(`Property type: ${s.property_type || 'residential'}`);
    if (s.bedrooms) lines.push(`Bedrooms: ${s.bedrooms}`);
    if (s.bathrooms) lines.push(`Bathrooms: ${s.bathrooms}`);
    if (s.floors) lines.push(`Floors/storeys: ${s.floors}`);
    if (s.year_built) lines.push(`Year built: ${s.year_built}`);
    if (s.condition) lines.push(`Recorded condition: ${s.condition}`);
    if (s.land_area_sqm) lines.push(`Land area: ${fmt(Number(s.land_area_sqm))} m²`);
    if (s.building_area_sqm) lines.push(`Gross floor area: ${fmt(Number(s.building_area_sqm))} m²`);
    if (amenities) lines.push(`Amenities/features: ${amenities}`);
    if (s.tenure) lines.push(`Tenure: ${s.tenure}`);
    const place = [s.neighbourhood, s.city, s.region].filter(Boolean).join(', ');
    if (place) lines.push(`Location: ${place}`);

    if (section === 'land_value_evidence') {
      const comps = (s.landComparables || []).filter(
        (c) => c && (c.price_per_sqm || c.price)
      );
      if (comps.length) {
        lines.push('Comparable land evidence:');
        comps.slice(0, 8).forEach((c, i) => {
          const rate = c.price_per_sqm
            ? `${cur}${fmt(c.price_per_sqm)}/m²`
            : c.price && c.land_area_sqm
            ? `${cur}${fmt(c.price / c.land_area_sqm)}/m²`
            : '';
          lines.push(
            `  ${i + 1}. ${c.address || 'Comparable plot'}${c.land_area_sqm ? `, ${fmt(c.land_area_sqm)} m²` : ''}${c.price ? `, ${cur}${fmt(c.price)}` : ''}${rate ? `, ${rate}` : ''}${c.distance_km ? ` (~${Number(c.distance_km).toFixed(1)} km)` : ''}`
          );
        });
      } else {
        lines.push('Comparable land evidence: (none supplied)');
      }
      if (s.landRatePerSqm) lines.push(`Adopted land rate for subject: ${cur}${fmt(s.landRatePerSqm)}/m²`);
    }
    return lines.join('\n');
  }

  /**
   * Draft the reconciliation "Weight Rationale" — why each approach received its weight, a
   * comment on the spread between indications, and the reliability of the reconciled value.
   * Grounded strictly in the supplied method indications + weights (no invented figures).
   */
  async generateWeightRationale(ctx: {
    methods: Array<{ name: string; value: number; weight: number }>;
    reconciledValue: number;
    spreadPct?: number | null;
    propertyType?: string | null;
    currency?: string;
  }): Promise<{ text: string; provider: string }> {
    const cur = ctx.currency || 'GH₵';
    const rows = ctx.methods
      .map((m) => `  - ${m.name}: indicated ${cur}${fmt(m.value)}, weighted ${Math.round(m.weight)}%`)
      .join('\n');
    const facts = [
      `Property type: ${ctx.propertyType || 'residential'}`,
      `Valuation approaches, their indicated values and applied weights:\n${rows}`,
      `Reconciled Market Value: ${cur}${fmt(ctx.reconciledValue)}`,
      ctx.spreadPct != null && !isNaN(Number(ctx.spreadPct))
        ? `Spread between the highest and lowest indication: ${Number(ctx.spreadPct).toFixed(1)}%`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    const system = [
      'You are a chartered valuation surveyor practising in Ghana, writing the reconciliation',
      'rationale of a formal valuation report (RICS Red Book / GhIS standards). Professional,',
      'measured, third-person. Use GH₵ for cedis and British/Ghanaian spelling.',
      'CRITICAL: use ONLY the figures provided — never invent values, weights, or evidence.',
      'No heading, no bullet list, no citations, no markdown — return plain prose (3–5 sentences).',
    ].join(' ');

    const prompt =
      'Write the valuer\'s "Weight Rationale" for the reconciliation section. Explain why each ' +
      'approach was afforded its weight (reflecting data quality, availability of market evidence, ' +
      'and the property\'s characteristics), comment on the spread between the indications, and ' +
      `conclude on the reliability of the reconciled Market Value. Facts you may use (and ONLY these):\n${facts}`;

    try {
      const res = await aiService.generateText({
        system,
        prompt,
        temperature: 0.4,
        maxOutputTokens: 600,
        feature: 'valuation.writeup.weight_rationale',
      });
      const text = (res.text || '')
        .replace(/\s*\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      return { text, provider: res.provider };
    } catch (err) {
      logger.error('valuationWriteupService: weight rationale generation failed', {
        error: err instanceof Error ? err.message : 'unknown',
      });
      throw err;
    }
  }

  /**
   * Draft the "Highest and Best Use" justification from the valuer's concluded use and the
   * recorded four-test analysis (legally permissible / physically possible / financially feasible /
   * maximally productive). Reasons ONLY from the supplied facts.
   */
  async generateHbuJustification(ctx: {
    conclusion: string;
    tests?: Array<{ name: string; passed?: boolean | null; notes?: string | null }>;
    propertyType?: string | null;
    currentUse?: string | null;
    city?: string | null;
    neighbourhood?: string | null;
    region?: string | null;
    tenure?: string | null;
  }): Promise<{ text: string; provider: string }> {
    const verdict = (p?: boolean | null) => (p === true ? 'satisfied' : p === false ? 'not satisfied' : 'not formally concluded');
    const testLines = (ctx.tests || [])
      .filter((t) => t && t.name && (t.passed != null || (t.notes && t.notes.trim())))
      .map((t) => `  - ${t.name}: ${verdict(t.passed)}${t.notes && t.notes.trim() ? ` — ${t.notes.trim()}` : ''}`)
      .join('\n');
    const location = [ctx.neighbourhood, ctx.city, ctx.region].filter(Boolean).join(', ');
    const facts = [
      `Concluded highest and best use: ${ctx.conclusion}`,
      ctx.currentUse ? `Existing/current use: ${ctx.currentUse}` : '',
      `Property type: ${ctx.propertyType || 'residential'}`,
      location ? `Location: ${location}` : '',
      ctx.tenure ? `Tenure: ${ctx.tenure}` : '',
      testLines ? `Four-test analysis recorded by the valuer:\n${testLines}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const system = [
      'You are a chartered valuation surveyor practising in Ghana, writing the Highest and Best Use',
      'justification of a formal valuation report (RICS Red Book / GhIS standards). Professional,',
      'measured, third-person. Use British/Ghanaian spelling and GH₵ for cedis.',
      'CRITICAL: use ONLY the facts provided — never invent zoning, figures, or evidence.',
      'No heading, no bullet list, no citations, no markdown — return plain prose (3–5 sentences).',
    ].join(' ');

    const prompt =
      'Write the "Highest and Best Use" justification supporting the concluded use. Reason through ' +
      'the four standard tests — legally permissible, physically possible, financially feasible and ' +
      'maximally productive — and conclude why the stated use represents the highest and best use of ' +
      `the subject property. Facts you may use (and ONLY these):\n${facts}`;

    try {
      const res = await aiService.generateText({
        system,
        prompt,
        temperature: 0.4,
        maxOutputTokens: 600,
        feature: 'valuation.writeup.hbu_justification',
      });
      const text = (res.text || '')
        .replace(/\s*\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      return { text, provider: res.provider };
    } catch (err) {
      logger.error('valuationWriteupService: HBU justification generation failed', {
        error: err instanceof Error ? err.message : 'unknown',
      });
      throw err;
    }
  }

  async generate(section: WriteupSection, subject: WriteupSubject): Promise<{ text: string; provider: string }> {
    if (!SECTION_BRIEF[section]) throw new Error(`Unknown writeup section: ${section}`);
    const facts = this.buildFacts(section, subject);

    const system = [
      'You are a chartered valuation surveyor practising in Ghana, writing a section of a formal',
      'property valuation report. Write in a professional, measured, third-person register suitable',
      'for a signed valuation report. Use British/Ghanaian spelling and GH₵ for cedis.',
      'CRITICAL: use ONLY the facts provided — never invent figures, features, distances or names.',
      'If the facts are thin, write a brief, honest, general statement rather than fabricating detail.',
      'Do not include a heading, citations, bracketed references, or markdown — return plain prose only.',
    ].join(' ');

    const prompt = `${SECTION_BRIEF[section]}\n\nFacts you may use (and ONLY these):\n${facts}`;

    try {
      const res = await aiService.generateText({
        system,
        prompt,
        temperature: 0.4,
        maxOutputTokens: 600,
        feature: `valuation.writeup.${section}`,
      });
      // Belt-and-suspenders: strip any stray citation markers / leading heading echoes.
      const text = (res.text || '')
        .replace(/\s*\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      return { text, provider: res.provider };
    } catch (err) {
      logger.error('valuationWriteupService: generation failed', {
        section,
        error: err instanceof Error ? err.message : 'unknown',
      });
      throw err;
    }
  }
}

export const valuationWriteupService = new ValuationWriteupService();
export default valuationWriteupService;
