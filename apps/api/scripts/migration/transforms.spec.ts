/**
 * Unit tests for the ETL transforms — pure, no database. Verifies the four
 * transforms against synthetic fixtures shaped like the real legacy data
 * (name-variant drift, text-for-bool, dd/mm dates, dollar floats). This is the
 * layer we CAN prove locally; the DB-touching load runs inside the customer
 * cloud where PHI stays.
 */
import { cleanString, parseBool, parseIntOrNull, parseDate } from './transforms/coerce';
import { toCents } from './transforms/money';
import { mapRecordStatus, mapRequisitionStatus, mapSpecimenType, mapGender } from './transforms/enums';
import { pivotClinicalItems, LegacyClinicalItem } from './transforms/clinical-features';

describe('coerce', () => {
  it('cleanString trims and nulls sentinels', () => {
    expect(cleanString('  hi ')).toBe('hi');
    expect(cleanString('')).toBeNull();
    expect(cleanString('   ')).toBeNull();
    expect(cleanString('N/A')).toBeNull();
    expect(cleanString('null')).toBeNull();
    expect(cleanString(null)).toBeNull();
  });

  it('parseBool handles legacy text-for-bool', () => {
    expect(parseBool(true)).toBe(true);
    expect(parseBool('true')).toBe(true);
    expect(parseBool('Yes')).toBe(true);
    expect(parseBool('1')).toBe(true);
    expect(parseBool('false')).toBe(false);
    expect(parseBool('no')).toBe(false);
    expect(parseBool('')).toBe(false); // fallback
    expect(parseBool('garbage')).toBe(false); // unrecognized -> fallback
    expect(parseBool(null, false)).toBe(false);
  });

  it('parseIntOrNull pulls integers out of noisy text', () => {
    expect(parseIntOrNull('3')).toBe(3);
    expect(parseIntOrNull(2)).toBe(2);
    expect(parseIntOrNull('G3')).toBe(3);
    expect(parseIntOrNull('')).toBeNull();
    expect(parseIntOrNull('none')).toBeNull();
  });

  it('parseDate handles ISO and day-first legacy dates', () => {
    expect(parseDate('2021-06-15')?.getUTCFullYear()).toBe(2021);
    // dd/mm/yyyy (Jamaica locale) -> 3 April 2022, not March.
    const d = parseDate('03/04/2022');
    expect(d?.getUTCMonth()).toBe(3); // April = month index 3
    expect(d?.getUTCDate()).toBe(3);
    expect(parseDate('not a date')).toBeNull();
    expect(parseDate('')).toBeNull();
  });
});

describe('money', () => {
  it('toCents converts dollars to integer cents', () => {
    expect(toCents(10)).toBe(1000);
    expect(toCents(19.99)).toBe(1999);
    expect(toCents('4.5')).toBe(450);
    expect(toCents(null)).toBe(0);
    expect(toCents('')).toBe(0);
    expect(toCents(0.1 + 0.2)).toBe(30); // float noise rounds cleanly
  });
});

describe('enums', () => {
  it('maps the six observed record statuses', () => {
    for (const s of ['Approved', 'Completed', 'Resulted', 'Submitted', 'Pending', 'Processing']) {
      expect(mapRecordStatus(s)).toBe(s);
    }
    expect(mapRecordStatus(null)).toBe('Pending'); // default
  });

  it('maps requisition statuses observed in prod', () => {
    expect(mapRequisitionStatus('Partial')).toBe('Partial');
    expect(mapRequisitionStatus('Completed')).toBe('Completed');
    expect(mapRequisitionStatus('Pending')).toBe('Pending');
  });

  it('maps specimen type and gender', () => {
    expect(mapSpecimenType('CERV_SCRAP')).toBe('CERV_SCRAP');
    expect(mapGender('Female')).toBe('Female');
    expect(mapGender(null)).toBeNull();
  });

  it('throws on an unmapped legacy value (drift guard)', () => {
    expect(() => mapSpecimenType('MARTIAN_FLUID')).toThrow(/unmapped/);
  });
});

describe('clinical-features pivot', () => {
  it('pivots gyn EAV rows into typed fields, coalescing variants', () => {
    const items: LegacyClinicalItem[] = [
      { name: 'LMP', value: '2021-05-01', datatype: 'text' },
      { name: 'Now Pregnant', value: 'true', datatype: 'bool' },
      { name: 'No. of Pregnancies', value: '2', datatype: 'text' },
      // text variant is blank, bool variant true -> OR-coalesce must yield true
      { name: 'Previous Cytology', value: '', datatype: 'text' },
      { name: 'Previous Cytology', value: 'yes', datatype: 'bool' },
      { name: 'Routine Check', value: 'no', datatype: 'bool' },
      { name: 'Leucorrhea', value: 'scant', datatype: 'text' },
      { name: 'Clinical Diagnosis', value: 'NILM', datatype: 'text' },
      { name: 'Some Unknown Field', value: 'x', datatype: 'text' },
    ];
    const r = pivotClinicalItems(items, 'Gynecology');
    expect(r.gyn).toBeDefined();
    expect(r.gyn!.lmp?.getUTCFullYear()).toBe(2021);
    expect(r.gyn!.nowPregnant).toBe(true);
    expect(r.gyn!.pregnancies).toBe(2);
    expect(r.gyn!.previousCytology).toBe(true); // coalesced across variants
    expect(r.gyn!.routineCheck).toBe(false);
    expect(r.gyn!.leucorrhea).toBe('scant');
    expect(r.record.clinicalDiagnosis).toBe('NILM'); // routed to the record
    expect(r.nonGyn).toBeUndefined();
    expect(r.unmapped).toContain('Some Unknown Field'); // surfaced, not silently dropped
  });

  it('pivots non-gyn rows and ignores gyn-only fields', () => {
    const items: LegacyClinicalItem[] = [
      { name: 'Nature & Source of Specimen', value: 'Urine, voided', datatype: 'text' },
      { name: 'Sample Description', value: 'clear', datatype: 'text' },
      { name: 'Now Pregnant', value: 'true', datatype: 'bool' }, // gyn field on nongyn record -> ignored
    ];
    const r = pivotClinicalItems(items, 'NonGynecology');
    expect(r.nonGyn).toBeDefined();
    expect(r.nonGyn!.natureAndSource).toBe('Urine, voided');
    expect(r.nonGyn!.sampleDescription).toBe('clear');
    expect(r.gyn).toBeUndefined();
  });

  it('bool fields default to false when the record has no such row', () => {
    const r = pivotClinicalItems([{ name: 'LMP', value: '2020-01-01' }], 'Gynecology');
    expect(r.gyn!.nowPregnant).toBe(false);
    expect(r.gyn!.menopause).toBe(false);
    expect(r.gyn!.pregnancies).toBeNull();
  });
});
