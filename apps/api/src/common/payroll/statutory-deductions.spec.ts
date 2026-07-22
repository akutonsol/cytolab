import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  calculateStatutoryDeductions,
  PAYE_MONTHLY_NIL_BAND_CENTS,
  NIS_MONTHLY_CEILING_CENTS,
} from './statutory-deductions';
import { computeAdvice } from '../../modules/payroll/payroll.service';

/**
 * R-008 — one authoritative statutory-deduction calculation, both payroll engines delegating to it.
 * Golden cases + a record of the original two-engine divergence + a no-duplication guard.
 */
describe('calculateStatutoryDeductions — authoritative 2024/25 ruleset', () => {
  describe('golden cases (cents, monthly)', () => {
    it('below the PAYE nil band → no PAYE', () => {
      // gross 10,000,000: nis 300,000; statutory 9,700,000 ≤ nil band → paye 0
      expect(calculateStatutoryDeductions(10_000_000)).toEqual({
        nis: 300_000, nht: 200_000, edTax: 218_250, paye: 0, total: 718_250,
      });
    });

    it('mid-band (25%)', () => {
      // gross 30,000,000: nis 900,000; statutory 29,100,000; paye on 14,932,600 @25%
      expect(calculateStatutoryDeductions(30_000_000)).toEqual({
        nis: 900_000, nht: 600_000, edTax: 654_750, paye: 3_733_150, total: 5_887_900,
      });
    });

    it('above the higher threshold (30%) and above the NIS ceiling', () => {
      // gross 60,000,000: nis capped at ceiling → 1,250,000; statutory 58,750,000; 25% then 30%
      expect(calculateStatutoryDeductions(60_000_000)).toEqual({
        nis: 1_250_000, nht: 1_200_000, edTax: 1_321_875, paye: 11_583_150, total: 15_355_025,
      });
    });

    it('NIS is capped at the monthly ceiling', () => {
      const atCeiling = calculateStatutoryDeductions(NIS_MONTHLY_CEILING_CENTS);
      const aboveCeiling = calculateStatutoryDeductions(NIS_MONTHLY_CEILING_CENTS * 2);
      expect(atCeiling.nis).toBe(aboveCeiling.nis); // NIS does not grow past the ceiling
    });

    it('statutory base is gross − NIS (NIS deductible before Education Tax + PAYE)', () => {
      const gross = 30_000_000;
      const { nis, edTax } = calculateStatutoryDeductions(gross);
      expect(edTax).toBe(Math.round((gross - nis) * 0.0225)); // NOT gross * 0.0225
    });
  });

  describe('original divergence (characterization — documents what R-008 fixed)', () => {
    // Verbatim OLD Engine A (workforce): PAYE/edTax on GROSS, older 1,500,096/yr nil band.
    const oldEngineA = (gross: number) => {
      const nis = Math.round(Math.min(gross, (5_000_000 * 100) / 12) * 0.03);
      const nht = Math.round(gross * 0.02);
      const edTax = Math.round(gross * 0.0225); // on GROSS
      const annualPaye = (ag: number) => {
        const nil = 1_500_096 * 100;
        if (ag <= nil) return 0;
        const mid = Math.min(ag, 6_000_000 * 100) - nil;
        let p = mid * 0.25;
        if (ag > 6_000_000 * 100) p += (ag - 6_000_000 * 100) * 0.3;
        return p;
      };
      const paye = Math.round(annualPaye(gross * 12) / 12); // on annualised GROSS
      const total = nis + nht + edTax + paye;
      return { total, net: gross - total };
    };
    // OLD Engine B == the authoritative core (its rules were correct; behavior preserved).
    const oldEngineB = (gross: number) => {
      const { total } = calculateStatutoryDeductions(gross);
      return { total, net: gross - total };
    };

    it('the two engines produced DIFFERENT net pay for the same gross', () => {
      const gross = 30_000_000;
      const a = oldEngineA(gross);
      const b = oldEngineB(gross);
      expect(a.net).toBe(23_450_200);
      expect(b.net).toBe(24_112_100);
      expect(b.net - a.net).toBe(661_900); // old Engine A over-deducted ~JMD 6,619
    });

    it('the reconciled core matches the correct (Engine B) ruleset, not the old Engine A one', () => {
      const gross = 30_000_000;
      expect(calculateStatutoryDeductions(gross).total).toBe(oldEngineB(gross).total);
      expect(calculateStatutoryDeductions(gross).total).not.toBe(oldEngineA(gross).total);
    });
  });

  describe('delegation — both engines invoke the shared core, no duplicated statutory math remains', () => {
    it('Engine B (computeAdvice) statutory components equal the shared core', () => {
      const core = calculateStatutoryDeductions(30_000_000);
      const advice = computeAdvice({ basicPay: 30_000_000 });
      expect({ nis: advice.nis, nht: advice.nht, edTax: advice.edTax, paye: advice.paye }).toEqual({
        nis: core.nis, nht: core.nht, edTax: core.edTax, paye: core.paye,
      });
    });

    it('neither engine file re-implements statutory arithmetic (single source of truth)', () => {
      const engines = {
        'payroll.service.ts': join(__dirname, '../../modules/payroll/payroll.service.ts'),
        'payroll-engine.service.ts': join(__dirname, '../../modules/workforce/payroll-engine.service.ts'),
      };
      for (const [name, path] of Object.entries(engines)) {
        const src = readFileSync(path, 'utf8');
        expect(src).toContain('calculateStatutoryDeductions'); // delegates to the shared core
        expect(src).not.toContain('0.0225'); // no duplicated Education-Tax rate literal
        expect(src).not.toContain('annualPaye'); // the old duplicated PAYE fn is gone
        expect(src.includes('PAYE_THRESHOLD') || src.includes('PAYE_NIL_BAND')).toBe(false);
      }
    });

    it('pension remains a caller-side deduction (not part of the statutory core)', () => {
      const withPension = computeAdvice({ basicPay: 30_000_000, pension: 1_000_000 });
      const without = computeAdvice({ basicPay: 30_000_000 });
      // Statutory components identical; only net changes by the pension amount.
      expect(withPension.paye).toBe(without.paye);
      expect(without.netPay - withPension.netPay).toBe(1_000_000);
    });
  });

  it('exposes the nil band as a monthly cents constant', () => {
    expect(PAYE_MONTHLY_NIL_BAND_CENTS).toBe(14_167_400);
  });
});
