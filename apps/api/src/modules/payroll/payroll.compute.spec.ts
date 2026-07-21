/**
 * Program 3 · C3 — computeAdvice pure-unit suite.
 *
 * Deterministic unit tests for the exported statutory-deduction calculator (no DB), per the frozen C3
 * design (docs/PROGRAM_3_C3_PAYROLL_TEST_DESIGN.md, commit ccdc930). Every expected value is a hand-
 * computed integer-cent literal — never the production expression re-run in the assertion.
 *
 * SD-1 (design §8): reimbursement's effect on net pay is an UNRESOLVED suspected defect. No test here
 * encodes a reimbursement-sign expectation. Only unambiguous deductions (pension, otherDeductions) are
 * asserted against net.
 *
 * computeAdvice computes the EMPLOYEE-side statutory deductions (NIS/NHT/EdTax/PAYE) + net; there is no
 * employer-contribution calculation in this function (none is implemented), so none is asserted.
 */
import { computeAdvice } from './payroll.service';

describe('computeAdvice (C3 unit)', () => {
  it('gross pay is the sum of basic + overtime + allowances + commission + bonus', () => {
    const c = computeAdvice({
      basicPay: 500_000,
      overtime: 100_000,
      allowances: 50_000,
      commission: 25_000,
      bonus: 25_000,
    });
    expect(c.grossPay).toBe(700_000);
  });

  it('below the PAYE threshold: NIS 3%, NHT 2%, EdTax 2.25% of post-NIS statutory, PAYE 0', () => {
    const c = computeAdvice({ basicPay: 1_000_000 });
    // gross 1,000,000 → nis 30,000; nht 20,000; statutory 970,000; edTax 21,825; paye 0
    expect(c.grossPay).toBe(1_000_000);
    expect(c.nis).toBe(30_000);
    expect(c.nht).toBe(20_000);
    expect(c.edTax).toBe(21_825);
    expect(c.paye).toBe(0);
    expect(c.netPay).toBe(928_175); // 1,000,000 − (30,000+20,000+21,825)
  });

  it('rounds half-up (EdTax on statutory 679,000 = 15,277.5 → 15,278)', () => {
    const c = computeAdvice({
      basicPay: 500_000,
      overtime: 100_000,
      allowances: 50_000,
      commission: 25_000,
      bonus: 25_000,
    });
    // gross 700,000 → nis 21,000; statutory 679,000; edTax round(15,277.5) = 15,278
    expect(c.edTax).toBe(15_278);
    expect(c.netPay).toBe(649_722); // 700,000 − (21,000+14,000+15,278)
  });

  it('PAYE band 1: 25% of statutory above the lower threshold, below the higher threshold', () => {
    const c = computeAdvice({ basicPay: 20_000_000 });
    // gross 20,000,000 → nis 600,000; statutory 19,400,000; edTax 436,500
    // band1 = 19,400,000 − 14,167,400 = 5,232,600 → paye 25% = 1,308,150
    expect(c.nis).toBe(600_000);
    expect(c.edTax).toBe(436_500);
    expect(c.paye).toBe(1_308_150);
    expect(c.netPay).toBe(17_255_350); // 20,000,000 − (600,000+400,000+436,500+1,308,150)
  });

  it('PAYE band 2 + NIS ceiling: 30% above the higher threshold, NIS capped at the monthly ceiling', () => {
    const c = computeAdvice({ basicPay: 60_000_000 });
    // NIS capped: round(min(60,000,000, 41,666,667) × 0.03) = 1,250,000 (NOT 1,800,000)
    expect(c.nis).toBe(1_250_000);
    // statutory 58,750,000; edTax 1,321,875
    expect(c.edTax).toBe(1_321_875);
    // band1 = 50,000,000 − 14,167,400 = 35,832,600 × 25% = 8,958,150
    // band2 = (58,750,000 − 50,000,000) × 30% = 2,625,000 → paye 11,583,150
    expect(c.paye).toBe(11_583_150);
    expect(c.netPay).toBe(44_644_975);
  });

  it('pension and otherDeductions reduce net pay (unambiguous deductions; no reimbursement asserted)', () => {
    const c = computeAdvice({ basicPay: 1_000_000, pension: 50_000, otherDeductions: 25_000 });
    // statutory deductions 71,825 (as above) + pension 50,000 + otherDeductions 25,000 = 146,825
    expect(c.netPay).toBe(853_175); // 1,000,000 − 146,825
  });

  it('zero input yields all-zero output (integer-cent identity)', () => {
    const c = computeAdvice({ basicPay: 0 });
    expect(c).toEqual({ grossPay: 0, nis: 0, nht: 0, edTax: 0, paye: 0, netPay: 0 });
  });
});
