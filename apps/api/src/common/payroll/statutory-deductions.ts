/**
 * Authoritative Jamaican statutory payroll-deduction contract (employee side) — the SINGLE source of
 * truth for BOTH payroll engines (R-008 reconciliation). Monthly basis, all money in minor units (cents).
 *
 * ── Authoritative source (review this before changing any value) ─────────────────────────────────
 *   Supported statutory year : 2024/25
 *   Effective rules source   : Tax Administration Jamaica (TAJ) — Income Tax Threshold & PAYE rates
 *                              (25% / 30% bands); National Insurance Scheme (NIS) employee rate +
 *                              annual insurable-wage ceiling; National Housing Trust (NHT) and
 *                              Education Tax statutory employee rates.
 *   Rounding policy          : each component rounded independently (half-up, Math.round).
 *   NOTE: these are the 2024/25 figures — they are NOT permanently current. Revisit the source above
 *   when a new payroll year's tables take effect; do not silently carry these forward.
 *
 * NORMATIVE RULESET — supported payroll year 2024/25 (justified by the statutory tables above, not by
 * either prior implementation):
 *   • NIS            — 3% of the insurable wage, capped at the NIS ceiling (~JMD 5,000,000 / yr).
 *   • NHT            — 2% of gross.
 *   • Statutory base — gross − NIS. NIS is deductible BEFORE Education Tax and PAYE.
 *   • Education Tax  — 2.25% of the statutory base.
 *   • PAYE           — 0% up to the annual nil band (~JMD 1,700,088 / yr); 25% on the statutory base
 *                      above the nil band up to the higher threshold (~JMD 6,000,000 / yr); 30% above.
 *   • Rounding       — each component rounded to the nearest cent (half-up via Math.round).
 *
 * SCOPE NOTE: voluntary pension/superannuation is NOT part of the statutory base here — it is a
 * caller-side deduction, unchanged by R-008. Pension tax-deductibility (pre-PAYE) is a separate
 * statutory-accuracy enhancement, deliberately out of this reconciliation's scope.
 */

/** The payroll year whose statutory tables this contract encodes. */
export const JAMAICA_PAYROLL_YEAR = '2024/25';

export const NIS_RATE = 0.03;
/** Monthly NIS insurable-wage ceiling (cents) — ~JMD 5,000,000 / yr. */
export const NIS_MONTHLY_CEILING_CENTS = 41_666_667;
export const NHT_RATE = 0.02;
export const EDUCATION_TAX_RATE = 0.0225;
/** Monthly PAYE nil band (cents) — ~JMD 1,700,088 / yr; statutory income at/below this pays 0% PAYE. */
export const PAYE_MONTHLY_NIL_BAND_CENTS = 14_167_400;
/** Monthly PAYE higher-rate threshold (cents) — ~JMD 6,000,000 / yr statutory income. */
export const PAYE_MONTHLY_HIGHER_THRESHOLD_CENTS = 50_000_000;
export const PAYE_RATE_1 = 0.25;
export const PAYE_RATE_2 = 0.3;

export interface StatutoryDeductions {
  /** National Insurance Scheme (cents). */
  nis: number;
  /** National Housing Trust (cents). */
  nht: number;
  /** Education Tax (cents). */
  edTax: number;
  /** Pay As You Earn income tax (cents). */
  paye: number;
  /** Sum of the four statutory deductions (cents). Excludes voluntary/caller-side deductions. */
  total: number;
}

/**
 * Compute the employee's monthly statutory deductions for a gross amount (cents), per the year's
 * confirmed ruleset above. Statutory deductions ONLY — callers own gross construction, voluntary
 * deductions (pension/reimbursement/other), net-pay assembly, persistence, and workflow.
 */
export function calculateStatutoryDeductions(grossCents: number): StatutoryDeductions {
  const nis = Math.round(Math.min(grossCents, NIS_MONTHLY_CEILING_CENTS) * NIS_RATE);
  const nht = Math.round(grossCents * NHT_RATE);

  // NIS is deductible before Education Tax and PAYE.
  const statutoryBase = grossCents - nis;
  const edTax = Math.round(statutoryBase * EDUCATION_TAX_RATE);

  let paye = 0;
  if (statutoryBase > PAYE_MONTHLY_NIL_BAND_CENTS) {
    const band1 = Math.min(statutoryBase, PAYE_MONTHLY_HIGHER_THRESHOLD_CENTS) - PAYE_MONTHLY_NIL_BAND_CENTS;
    paye = band1 * PAYE_RATE_1;
    if (statutoryBase > PAYE_MONTHLY_HIGHER_THRESHOLD_CENTS) {
      paye += (statutoryBase - PAYE_MONTHLY_HIGHER_THRESHOLD_CENTS) * PAYE_RATE_2;
    }
    paye = Math.round(paye);
  }

  return { nis, nht, edTax, paye, total: nis + nht + edTax + paye };
}
