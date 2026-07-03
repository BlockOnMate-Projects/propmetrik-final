-- Backfill commission records for deals that were WON before the auto-generation
-- trigger existed (dealService now books commission on win, but historical wins
-- were never priced). Mirrors commissionService.generateRecordsForWonDeal for the
-- no-split path: one pending record per won deal, priced by calculate_deal_commission
-- against the deal's assigned agent. Idempotent — skips any deal that already has a
-- deal_close record, so re-running never double-books. Records are 'pending' (an
-- accrual awaiting approval), never auto-paid.

INSERT INTO commission_records (
    organization_id, deal_id, agent_id, source_type,
    deal_value, commission_rate, split_percentage,
    gross_commission, agent_share, company_share,
    status, deal_close_date, accrual_date
)
SELECT
    d.organization_id,
    d.id,
    d.assigned_agent,
    'deal_close',
    d.deal_value,
    c.commission_rate,
    100,
    c.gross_commission,
    c.agent_share,
    c.company_share,
    'pending',
    COALESCE(d.actual_close_date, CURRENT_DATE),
    COALESCE(d.actual_close_date, CURRENT_DATE)
FROM deals d
CROSS JOIN LATERAL calculate_deal_commission(
    d.id, d.assigned_agent, d.deal_value, d.organization_id
) AS c
WHERE d.deal_status = 'won'
  AND d.assigned_agent IS NOT NULL
  AND d.deal_value > 0
  AND NOT EXISTS (
      SELECT 1 FROM commission_records cr
      WHERE cr.deal_id = d.id
        AND cr.organization_id = d.organization_id
        AND cr.source_type = 'deal_close'
  );
