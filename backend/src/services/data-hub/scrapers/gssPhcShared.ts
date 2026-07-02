/**
 * GSS PHC Shared PxWeb Helpers (Slice 3)
 *
 * Common client + json-stat2 index resolver shared by the three Slice 3 PHC
 * scrapers (population, employment, poverty). Factored out of the per-table
 * stride math in gssPhcHousingService.ts into one generic, dimension-order-safe
 * resolver so each scraper only expresses *which* cell it wants by dimension
 * code → value, not how the flat array is laid out.
 *
 * @module services/data-hub/scrapers/gssPhcShared
 */

import https from 'https';

const STATSBANK_HOST = process.env.GSS_STATSBANK_HOST || 'statsbank.statsghana.gov.gh';

/** 16 GSS region names (verbatim PxWeb Geographic_Area values for regional totals). */
export const GSS_REGIONS = [
  'Western', 'Central', 'Greater Accra', 'Volta', 'Eastern', 'Ashanti',
  'Western North', 'Ahafo', 'Bono', 'Bono East', 'Oti', 'Northern',
  'Savannah', 'North East', 'Upper East', 'Upper West',
];

/** GSS region label → snake_case storage key (matches gssPhcHousingService.regionKey). */
export function regionKey(gssLabel: string): string {
  return gssLabel.toLowerCase().replace(/\s+/g, '_');
}

/**
 * json-stat2 response shape. `id` gives the dimension order and `size` the
 * per-dimension cardinality — the authoritative layout of the flat `value`
 * array. When absent we fall back to Object.keys(dimension) order.
 */
export interface PxStat2 {
  value: (number | null)[];
  id?: string[];
  size?: number[];
  dimension: Record<string, {
    category: { index: Record<string, number>; label: Record<string, string> };
  }>;
  updated?: string;
}

/** Small sleep to avoid hammering the GSS API. */
export const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * POST a PxWeb query and return the json-stat2 body.
 * Identical transport to gssPhcHousingService.pxPost.
 */
export function pxPost(path: string, queryBody: unknown): Promise<PxStat2> {
  const body = JSON.stringify({ query: queryBody, response: { format: 'json-stat2' } });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: 'POST', hostname: STATSBANK_HOST, path,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'propmetrik-datahub',
        },
        timeout: 60000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`GSS ${res.statusCode} for ${path}: ${data.slice(0, 200)}`));
            return;
          }
          try { resolve(JSON.parse(data) as PxStat2); }
          catch (e) { reject(new Error(`Parse error for ${path}: ${(e as Error).message}`)); }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`GSS timeout: ${path}`)));
    req.write(body);
    req.end();
  });
}

/**
 * Resolve a single cell from a json-stat2 cube by dimension code → value code.
 *
 * `selection` must name a value for EVERY dimension in the response (each
 * dimension collapses to the one selected category). Returns null if any
 * dimension/value is missing or the flat index is out of range.
 *
 * Uses row-major strides derived from `size`/`id` (or dimension insertion order
 * as a fallback), so it is correct regardless of the dimension order the API
 * happens to return.
 */
export function pxGetValue(px: PxStat2, selection: Record<string, string>): number | null {
  const dims = px.id && px.id.length ? px.id : Object.keys(px.dimension);
  const sizes = px.size && px.size.length
    ? px.size
    : dims.map(d => Object.keys(px.dimension[d]?.category.index ?? {}).length);

  // Row-major strides: last dimension varies fastest.
  const strides = new Array(dims.length).fill(1);
  for (let i = dims.length - 2; i >= 0; i--) strides[i] = strides[i + 1] * sizes[i + 1];

  let flat = 0;
  for (let i = 0; i < dims.length; i++) {
    const dimCode = dims[i];
    const dim = px.dimension[dimCode];
    if (!dim) return null;
    const valueCode = selection[dimCode];
    if (valueCode === undefined) return null;
    const idx = dim.category.index[valueCode];
    if (idx === undefined) return null;
    flat += idx * strides[i];
  }
  const v = px.value[flat];
  return v === undefined ? null : v;
}
