-- Migration 220: Fix pipeline stage transitions
-- BUG-002: Property Inspection & Valuation stages unreachable from Title Search
--
-- Fix: For each pipeline that has all three stages (Title Search, Property Inspection, Valuation),
-- add the missing transitions so the full sequential path works.

-- Step 1: Title Search → add Property Inspection and Valuation
UPDATE deal_stages ts
SET allowed_next_stages = (
    SELECT DISTINCT array_agg(elem) FROM (
        SELECT unnest(ts.allowed_next_stages) AS elem
        UNION
        SELECT pi.id FROM deal_stages pi WHERE pi.stage_name = 'Property Inspection' AND pi.pipeline_id = ts.pipeline_id
        UNION
        SELECT v.id FROM deal_stages v WHERE v.stage_name = 'Valuation' AND v.pipeline_id = ts.pipeline_id
    ) sub
)
FROM deal_stages pi_check
WHERE ts.stage_name = 'Title Search'
  AND pi_check.stage_name = 'Property Inspection'
  AND pi_check.pipeline_id = ts.pipeline_id
  AND NOT (ts.allowed_next_stages @> ARRAY[pi_check.id]);

-- Step 2: Property Inspection → add Valuation
UPDATE deal_stages pi
SET allowed_next_stages = (
    SELECT DISTINCT array_agg(elem) FROM (
        SELECT unnest(pi.allowed_next_stages) AS elem
        UNION
        SELECT v.id FROM deal_stages v WHERE v.stage_name = 'Valuation' AND v.pipeline_id = pi.pipeline_id
    ) sub
)
FROM deal_stages v_check
WHERE pi.stage_name = 'Property Inspection'
  AND v_check.stage_name = 'Valuation'
  AND v_check.pipeline_id = pi.pipeline_id
  AND NOT (pi.allowed_next_stages @> ARRAY[v_check.id]);

-- Step 3: Valuation → ensure Financing Application is allowed
UPDATE deal_stages v
SET allowed_next_stages = (
    SELECT DISTINCT array_agg(elem) FROM (
        SELECT unnest(v.allowed_next_stages) AS elem
        UNION
        SELECT fa.id FROM deal_stages fa WHERE fa.stage_name = 'Financing Application' AND fa.pipeline_id = v.pipeline_id
    ) sub
)
FROM deal_stages fa_check
WHERE v.stage_name = 'Valuation'
  AND fa_check.stage_name = 'Financing Application'
  AND fa_check.pipeline_id = v.pipeline_id
  AND NOT (v.allowed_next_stages @> ARRAY[fa_check.id]);
