import { computePlanBalanceUpdate } from '../../src/services/project-management/paymentPlanService';

// Pure exact-money helper behind buyer payment plans (no DB). Locks the completion
// boundary that a naive float subtraction gets wrong (P3.3 money-drift fix).
describe('computePlanBalanceUpdate — exact installment balance math', () => {
  it('applies a normal installment', () => {
    const r = computePlanBalanceUpdate(50000, 0, 4166.67);
    expect(r.newTotalPaid).toBe(4166.67);
    expect(r.newRemainingBalance).toBe(45833.33);
    expect(r.isCompleted).toBe(false);
  });

  it('marks the plan completed on the exact final payment', () => {
    const r = computePlanBalanceUpdate(50000, 45833.33, 4166.67);
    expect(r.newTotalPaid).toBe(50000);
    expect(r.newRemainingBalance).toBe(0);
    expect(r.isCompleted).toBe(true);
  });

  it('does NOT strand a fully-paid plan on a sub-pesewa float residue', () => {
    // The bug case: floats leave 0.004 remaining → isCompleted would be false.
    // Integer-pesewa math resolves it to exactly 0 → completed.
    const r = computePlanBalanceUpdate(50000.0, 49999.996, 0.004);
    expect(r.newRemainingBalance).toBe(0);
    expect(r.isCompleted).toBe(true);
  });

  it('treats an overpayment as completed with a negative remaining', () => {
    const r = computePlanBalanceUpdate(50000, 49000, 1500);
    expect(r.newTotalPaid).toBe(50500);
    expect(r.newRemainingBalance).toBe(-500);
    expect(r.isCompleted).toBe(true);
  });

  it('accumulates many 2dp installments without drift (0.1 + 0.2 class)', () => {
    let paid = 0;
    let remaining = 0.3;
    // 3 payments of 0.1 against a 0.3 balance must land exactly on completion.
    for (const amt of [0.1, 0.1, 0.1]) {
      const r = computePlanBalanceUpdate(0.3, paid, amt);
      paid = r.newTotalPaid;
      remaining = r.newRemainingBalance;
    }
    expect(paid).toBe(0.3);
    expect(remaining).toBe(0);
  });

  it('handles string-typed money inputs (pg NUMERIC comes back as string)', () => {
    const r = computePlanBalanceUpdate('50000' as any, '45833.33' as any, '4166.67' as any);
    expect(r.newRemainingBalance).toBe(0);
    expect(r.isCompleted).toBe(true);
  });
});
