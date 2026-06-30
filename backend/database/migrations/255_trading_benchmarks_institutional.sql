-- 255_trading_benchmarks_institutional.sql
-- Raises the Profits (trade-related) method to institutional RICS standard by extending the
-- trading_property_benchmarks config with:
--   cap_rate_low / cap_rate_high       : the trading YIELD RANGE (not just a single point) so the
--                                        report shows the evidenced band, like an investment yield.
--   operator_capital_pct               : the operator's tied-up capital (FF&E + trade stock) as a
--                                        fraction of annual turnover. RICS divisible-balance theory
--                                        requires the operator to earn a return ON this capital
--                                        before the residual (the property's rent) is capitalised.
--   return_on_operator_capital_pct     : the operator's required return on that capital.
--
-- Divisible balance (institutional):
--   net operating profit
--     − operator's remuneration (reward for running the business)
--     − return on operator's capital (FF&E + stock)            <-- NEW
--     = Fair Maintainable Operating Profit attributable to the PROPERTY  → capitalise.
--
-- Seeds are professional-standard starting figures, flagged for valuer review. Idempotent.

ALTER TABLE trading_property_benchmarks
  ADD COLUMN IF NOT EXISTS cap_rate_low                   NUMERIC(6, 4),
  ADD COLUMN IF NOT EXISTS cap_rate_high                  NUMERIC(6, 4),
  ADD COLUMN IF NOT EXISTS operator_capital_pct           NUMERIC(5, 4),
  ADD COLUMN IF NOT EXISTS return_on_operator_capital_pct NUMERIC(5, 4);

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      -- type,           cap_low, cap_high, op_capital_pct (of turnover), return_on_capital
      ('hotel',          0.0850, 0.1150, 0.30, 0.12),
      ('hospital',       0.0900, 0.1200, 0.35, 0.12),
      ('school',         0.0950, 0.1250, 0.10, 0.12),
      ('restaurant',     0.1000, 0.1300, 0.20, 0.12),
      ('fuel_station',   0.1000, 0.1300, 0.10, 0.12),
      ('healthcare',     0.0900, 0.1200, 0.25, 0.12)
    ) AS t(pt, cap_low, cap_high, op_cap, roc)
  LOOP
    UPDATE trading_property_benchmarks
       SET cap_rate_low                   = r.cap_low,
           cap_rate_high                  = r.cap_high,
           operator_capital_pct           = r.op_cap,
           return_on_operator_capital_pct = r.roc
     WHERE property_type = r.pt
       AND (operator_capital_pct IS NULL);   -- only seed rows not yet customised
  END LOOP;
END $$;
