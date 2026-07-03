-- Salesforce-style forecast categories on deals.
--
-- forecast_category is an OPTIONAL rep override. When NULL the category is
-- derived at read time from the deal's stage/win probability:
--   >= 75%  → commit      (high confidence, counted on)
--   >= 40%  → best_case   (upside)
--   <  40%  → pipeline    (early)
-- won deals roll into a "closed" bucket; a rep can also set 'omitted' to
-- exclude a deal from the forecast entirely. Storing the override (not the
-- derived value) keeps the derivation live as probability changes.
-- Idempotent.

ALTER TABLE deals ADD COLUMN IF NOT EXISTS forecast_category VARCHAR(20);

-- Guard rail: only allow the known category values (or NULL = auto-derive).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'deals_forecast_category_chk'
    ) THEN
        ALTER TABLE deals ADD CONSTRAINT deals_forecast_category_chk
            CHECK (forecast_category IS NULL OR forecast_category IN
                ('pipeline', 'best_case', 'commit', 'closed', 'omitted'));
    END IF;
END $$;
