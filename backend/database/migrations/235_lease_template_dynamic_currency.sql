-- Migration 235: Render the lease's actual currency (rentCurrency) instead of hardcoded GHS.
-- The Ghana residential template hardcoded "GHS" + "(Ghana Cedis: ...)" in the rent, advance,
-- and security-deposit clauses, so leases for USD/EUR/GBP properties still showed GHS.
-- rentCurrency is already provided to the template data (from the tenancy's rent_currency).
-- Safe no-op for templates that don't contain the hardcoded strings.

-- 3.1 Monthly rent: drop hardcoded "GHS" and the "Ghana Cedis:" label
UPDATE lease_templates
SET content = REPLACE(
    content,
    'GHS {{formatNumber monthlyRent}}</span> (Ghana Cedis: {{monthlyRentWords}} only)',
    '{{rentCurrency}} {{formatNumber monthlyRent}}</span> ({{monthlyRentWords}} only)'
),
updated_at = NOW()
WHERE content LIKE '%GHS {{formatNumber monthlyRent}}%';

-- 3.2 Advance payment total
UPDATE lease_templates
SET content = REPLACE(
    content,
    'GHS {{formatNumber advanceAmount}}',
    '{{rentCurrency}} {{formatNumber advanceAmount}}'
),
updated_at = NOW()
WHERE content LIKE '%GHS {{formatNumber advanceAmount}}%';

-- 4.1 Security deposit
UPDATE lease_templates
SET content = REPLACE(
    content,
    'GHS {{formatNumber securityDeposit}}',
    '{{rentCurrency}} {{formatNumber securityDeposit}}'
),
updated_at = NOW()
WHERE content LIKE '%GHS {{formatNumber securityDeposit}}%';

-- Advertise rentCurrency as a known variable on active templates
UPDATE lease_templates
SET variables = COALESCE(variables, '[]'::jsonb) || '["rentCurrency"]'::jsonb,
    updated_at = NOW()
WHERE is_active = TRUE
  AND NOT (COALESCE(variables, '[]'::jsonb) @> '["rentCurrency"]'::jsonb);
