/**
 * Valuation AI & writeup routes — extracted from valuations.ts (Phase 4).
 *
 * Draft AI narratives/writeups for the valuation workflow. All outputs are
 * DRAFT text for valuer review before report approval.
 */

import { Router, Request, Response } from 'express';
import { query } from '../database';
import { logger } from '../utils/logger';
import { pythonClient } from '../services/valuation-engine';
import { validateUUID } from './valuationRouteMiddleware';

const router = Router();

const WRITEUP_SECTIONS = [
  'land_value_evidence',
  'grounds_external_works',
  'condition_state',
  'services_description',
  'accommodation_description',
] as const;

router.post('/ai/area-narrative', async (req: Request, res: Response) => {
  try {
    const { areaNarrativeService } = await import('../services/valuation-engine/areaNarrativeService');
    const b = req.body || {};
    const result = await areaNarrativeService.generate({
      latitude: typeof b.latitude === 'number' ? b.latitude : (b.latitude ? Number(b.latitude) : null),
      longitude: typeof b.longitude === 'number' ? b.longitude : (b.longitude ? Number(b.longitude) : null),
      digitalAddress: b.digitalAddress || b.digital_address || null,
      address: b.address || b.addressStreet || null,
      city: b.city || b.addressCity || null,
      region: b.region || null,
      neighborhoodClass: b.neighborhoodClass || b.neighborhood_class || null,
      propertyType: b.propertyType || b.property_type || null,
    });
    return res.json(result);
  } catch (err: any) {
    const msg = err?.message || 'Failed to generate area narrative';
    const status = /could not determine the property location/i.test(msg) ? 400
      : /not configured/i.test(msg) ? 503
      : 502;
    return res.status(status).json({ error: msg });
  }
});

router.post('/ai/property-description', async (req: Request, res: Response) => {
  try {
    const { aiService } = await import('../services/ai/aiService');
    if (!aiService.isAvailable()) {
      return res.status(503).json({ error: 'AI text generation is not configured' });
    }
    const { generatePropertyDescription } = await import('../services/ai/propertyDescriptionService');
    const result = await generatePropertyDescription(req.body, 'valuation');
    return res.json({ description: result.text, provider: result.provider });
  } catch (err: any) {
    if (err?.statusCode === 400) return res.status(400).json({ error: err.message });
    return res.status(502).json({ error: err?.message || 'AI generation failed' });
  }
});

router.post('/:id/ai/writeup', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { aiService } = await import('../services/ai/aiService');
    if (!aiService.isAvailable()) {
      return res.status(503).json({ error: 'AI text generation is not configured' });
    }
    const section = String(req.body?.section || '');
    if (!(WRITEUP_SECTIONS as readonly string[]).includes(section)) {
      return res.status(400).json({ error: `Invalid section. Expected one of: ${WRITEUP_SECTIONS.join(', ')}` });
    }
    const r = await query(
      `SELECT v.*, p.* FROM valuations v JOIN properties p ON p.id = v.property_id WHERE v.id = $1`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Valuation not found' });
    const row = r.rows[0];

    const subject: any = {
      property_type: row.property_type,
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      floors: row.floors,
      year_built: row.year_built,
      condition: row.condition,
      land_area_sqm: row.land_area_sqm || row.land_size_sqm,
      building_area_sqm: row.built_area_sqm || row.building_size_sqm,
      amenities: row.amenities,
      neighbourhood: row.neighbourhood || row.address_neighbourhood,
      city: row.address_city || row.city,
      region: row.region,
      tenure: row.tenure,
      currency: 'GH₵',
    };

    if (section === 'land_value_evidence') {
      try {
        const propertyInput = {
          id: row.property_id,
          property_type: row.property_type || 'residential',
          region: row.region || 'greater_accra',
          address_city: row.address_city,
          address_street: row.address_street,
          latitude: row.latitude,
          longitude: row.longitude,
          land_area_sqm: row.land_area_sqm || row.land_size_sqm,
          building_size_sqm: row.building_size_sqm || row.built_area_sqm,
        };
        const lc: any = await pythonClient.getLandComparables(propertyInput, { max_distance_km: 10, max_results: 8 });
        const rawComps: any[] = Array.isArray(lc) ? lc : lc?.comparables || lc?.data?.comparables || [];
        subject.landComparables = rawComps.map((c: any) => ({
          address: c.address || c.address_street || c.title || null,
          land_area_sqm: Number(c.land_area_sqm || c.land_size_sqm) || null,
          price: Number(c.price || c.sale_price || c.adjusted_price) || null,
          price_per_sqm: Number(c.price_per_sqm || c.rate_per_sqm) || null,
          distance_km: Number(c.distance_km) || null,
        }));
        subject.landRatePerSqm =
          Number(lc?.land_rate_per_sqm || lc?.adopted_rate_per_sqm || lc?.data?.land_rate_per_sqm) || null;
      } catch (e: any) {
        logger.warn('writeup: land comparables fetch failed, drafting without comps', { error: e?.message });
      }
    }

    const { valuationWriteupService } = await import('../services/valuation-engine/valuationWriteupService');
    const out = await valuationWriteupService.generate(section as any, subject);
    return res.json({ section, text: out.text, provider: out.provider });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'AI generation failed' });
  }
});

router.post('/:id/ai/hbu-justification', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { aiService } = await import('../services/ai/aiService');
    if (!aiService.isAvailable()) {
      return res.status(503).json({ error: 'AI text generation is not configured' });
    }
    const conclusion = String(req.body?.conclusion || '').trim();
    if (!conclusion) {
      return res.status(400).json({ error: 'Select a Highest & Best Use conclusion first.' });
    }
    const tests = Array.isArray(req.body?.tests) ? req.body.tests : [];

    const r = await query(
      `SELECT v.*, p.* FROM valuations v JOIN properties p ON p.id = v.property_id WHERE v.id = $1`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Valuation not found' });
    const row = r.rows[0];

    const { valuationWriteupService } = await import('../services/valuation-engine/valuationWriteupService');
    const out = await valuationWriteupService.generateHbuJustification({
      conclusion,
      tests,
      propertyType: row.property_type,
      currentUse: row.property_use || row.property_type,
      city: row.address_city || row.city,
      neighbourhood: row.neighbourhood || row.address_neighbourhood,
      region: row.region,
      tenure: row.tenure,
    });
    return res.json({ text: out.text, provider: out.provider });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'AI generation failed' });
  }
});

router.post('/:id/ai/weight-rationale', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const { aiService } = await import('../services/ai/aiService');
    if (!aiService.isAvailable()) {
      return res.status(503).json({ error: 'AI text generation is not configured' });
    }
    const NAMES: Record<string, string> = {
      cost_approach: 'Cost Approach',
      sales_comparison: 'Sales Comparison Approach',
      income_approach: 'Income Capitalisation Approach',
      drc_method: 'Depreciated Replacement Cost',
      residual_method: 'Residual Method',
      profits_method: 'Profits Method',
    };
    const body = req.body || {};
    let methods: Array<{ name: string; value: number; weight: number }> = Array.isArray(body.methods)
      ? body.methods
          .map((m: any) => ({ name: String(m.name || m.method || ''), value: Number(m.value) || 0, weight: Number(m.weight) || 0 }))
          .filter((m: any) => m.name && (m.weight > 0 || m.value > 0))
      : [];
    let reconciledValue = Number(body.reconciledValue) || 0;
    let spreadPct = body.spreadPct != null ? Number(body.spreadPct) : null;
    let propertyType = body.propertyType || null;

    if (!methods.length || !reconciledValue) {
      const r = await query(
        `SELECT vr.method_results, vr.final_market_value, vr.value_spread_percentage, p.property_type
         FROM valuation_reconciliations vr
         JOIN valuations v ON v.id = vr.valuation_id
         JOIN properties p ON p.id = v.property_id
         WHERE vr.valuation_id = $1`,
        [req.params.id]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Reconciliation not found' });
      const row = r.rows[0];
      const mr = row.method_results || {};
      if (!methods.length) {
        methods = Object.entries(mr)
          .map(([k, v]: any) => ({ name: NAMES[k] || k, value: Number(v?.value) || 0, weight: Number(v?.weight) || 0 }))
          .filter((m) => m.weight > 0 || m.value > 0);
      }
      if (!reconciledValue) reconciledValue = Number(row.final_market_value) || 0;
      if (spreadPct == null && row.value_spread_percentage != null) spreadPct = Number(row.value_spread_percentage);
      propertyType = propertyType || row.property_type;
    }

    if (!methods.length) {
      return res.status(400).json({ error: 'No weighted methods to summarise — set the method weights first.' });
    }

    const { valuationWriteupService } = await import('../services/valuation-engine/valuationWriteupService');
    const out = await valuationWriteupService.generateWeightRationale({
      methods,
      reconciledValue,
      spreadPct,
      propertyType,
      currency: 'GH₵',
    });
    return res.json({ text: out.text, provider: out.provider });
  } catch (err: any) {
    return res.status(502).json({ error: err?.message || 'AI generation failed' });
  }
});

router.put('/:id/writeups', validateUUID('id'), async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const updates: Record<string, string> = {};
    for (const k of WRITEUP_SECTIONS) {
      if (typeof body[k] === 'string') updates[k] = body[k];
    }
    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No writeup fields provided' });
    }
    const r = await query(`SELECT property_id FROM valuations WHERE id = $1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Valuation not found' });
    await query(
      `UPDATE properties SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb WHERE id = $1`,
      [r.rows[0].property_id, JSON.stringify(updates)]
    );
    return res.json({ saved: Object.keys(updates) });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to save writeups' });
  }
});

export default router;
