/**
 * Property Description AI — shared generator.
 *
 * Drafts a property description STRICTLY from the structured fields the user already
 * entered (no invented amenities/finishes/claims). Used by:
 *   - Property Management "Add Property"  → mode 'marketing' (warm listing copy)
 *   - Valuation "Subject Property" report → mode 'valuation' (formal RICS/GhIS prose)
 *
 * Accepts both camelCase (PM form) and snake_case (valuation form) field names.
 */

import { aiService } from './aiService';

export type DescriptionMode = 'marketing' | 'valuation';

const humanize = (v: unknown): string =>
  typeof v === 'string' ? v.replace(/_/g, ' ').trim() : '';

/** Read a field allowing both camelCase and snake_case keys. */
const pick = (b: any, ...keys: string[]): any => {
  for (const k of keys) {
    if (b[k] !== undefined && b[k] !== null && b[k] !== '') return b[k];
  }
  return undefined;
};

/** Build a fact list from ONLY the fields that are present — never invent. */
export function buildPropertyFacts(b: any): string[] {
  const facts: string[] = [];
  const title = pick(b, 'title', 'name');
  if (title) facts.push(`Name/Title: ${String(title).trim()}`);

  const ptype = pick(b, 'propertyType', 'property_type');
  if (ptype) facts.push(`Property type: ${humanize(ptype)}`);

  const ttype = pick(b, 'transactionType', 'transaction_type');
  if (ttype) facts.push(`Listing: for ${humanize(ttype)}`);

  const beds = pick(b, 'bedrooms');
  if (beds) facts.push(`Bedrooms: ${beds}`);
  const baths = pick(b, 'bathrooms');
  if (baths) facts.push(`Bathrooms: ${baths}`);

  const floorArea = pick(b, 'totalAreaSqm', 'total_area_sqm', 'gfa', 'builtAreaSqm', 'built_area_sqm');
  if (floorArea) facts.push(`Floor area: ${floorArea} sqm`);
  const landArea = pick(b, 'landAreaSqm', 'land_area_sqm', 'plotSizeSqm', 'plot_size_sqm');
  if (landArea) facts.push(`Land/plot area: ${landArea} sqm`);
  const floors = pick(b, 'floors', 'numberOfFloors', 'number_of_floors');
  if (floors) facts.push(`Floors/storeys: ${floors}`);
  const yearBuilt = pick(b, 'yearBuilt', 'year_built');
  if (yearBuilt) facts.push(`Year built: ${yearBuilt}`);

  const condition = pick(b, 'condition');
  if (condition) facts.push(`Condition: ${humanize(condition)}`);
  const quality = pick(b, 'quality', 'qualityRating', 'quality_rating');
  if (quality) facts.push(`Build quality: ${humanize(quality)}`);
  const tenure = pick(b, 'tenure', 'tenureType', 'tenure_type');
  if (tenure) facts.push(`Tenure: ${humanize(tenure)}`);

  const location = [
    pick(b, 'addressStreet', 'address_street', 'address'),
    pick(b, 'addressDistrict', 'address_district'),
    pick(b, 'addressCity', 'address_city', 'city'),
    humanize(pick(b, 'region')),
  ].filter(Boolean).join(', ');
  if (location) facts.push(`Location: ${location}`);
  const digital = pick(b, 'digitalAddress', 'digital_address');
  if (digital) facts.push(`Ghana Post digital address: ${digital}`);

  // Marketing-only extras
  const price = pick(b, 'price');
  if (price) {
    const cur = pick(b, 'priceCurrency', 'price_currency') || 'GHS';
    const period = String(ttype) === 'rental' ? ' per month' : '';
    facts.push(`Price: ${cur} ${price}${period}`);
  }
  if (pick(b, 'isMultiUnit', 'is_multi_unit')) {
    facts.push(`This is a multi-unit building${floors ? ` with ${floors} floor(s)` : ''}.`);
  }

  return facts;
}

const SYSTEM_PROMPTS: Record<DescriptionMode, string> = {
  marketing:
    'You are a professional real estate copywriter for the Ghanaian market. ' +
    'Write a concise, appealing property listing description using ONLY the facts provided. ' +
    'Do NOT invent amenities, finishes, neighbourhood claims, or features that are not given. ' +
    'Tone: warm but professional. Length: 2–3 sentences (about 50–90 words). ' +
    'Return plain text only — no markdown, headings, bullet points, or quotes.',
  valuation:
    'You are a professional property valuer in Ghana preparing the "Description of Property" ' +
    'section of a formal valuation report (RICS Red Book / GhIS standards). ' +
    'Write a factual, objective, third-person description of the SUBJECT PROPERTY using ONLY the facts provided. ' +
    'Do NOT invent features, finishes, conditions, or measurements that are not given — omit what is unknown. ' +
    'No marketing or promotional language. Length: 2–4 sentences (about 60–110 words). ' +
    'Return plain text only — no markdown, headings, bullet points, or quotes.',
};

/**
 * Generate a property description. Throws on no-facts (caller maps to 400) or AI failure.
 */
export async function generatePropertyDescription(
  body: any,
  mode: DescriptionMode
): Promise<{ text: string; provider: string }> {
  const facts = buildPropertyFacts(body || {});
  if (facts.length === 0) {
    const err: any = new Error('Provide some property details first (type, location, beds, area, etc.)');
    err.statusCode = 400;
    throw err;
  }

  const prompt = `Property facts:\n${facts.map((f) => `- ${f}`).join('\n')}\n\nWrite the ${mode === 'valuation' ? 'valuation-report property description' : 'listing description'}.`;

  const result = await aiService.generateText({
    system: SYSTEM_PROMPTS[mode],
    prompt,
    temperature: mode === 'valuation' ? 0.5 : 0.8,
    maxOutputTokens: 260,
    feature: `${mode === 'valuation' ? 'valuation' : 'pm'}.property-description`,
  });
  return { text: result.text, provider: result.provider };
}
