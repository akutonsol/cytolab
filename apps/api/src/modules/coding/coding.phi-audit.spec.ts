import { CodingService } from './coding.service';

/**
 * Program 2 · P2-5DR — coding PHI classification + export-boundary placement.
 *  - records() is a PHI-bearing worklist → PATIENT_LIST_QUERIED on the 'coding' surface.
 *  - exportData() only shapes data → NO export event.
 *  - toCsv() is the CSV artifact-success boundary → PHI_EXPORTED emitted after the bytes are built.
 * The audit metadata never carries initials, codes, IDs, filenames, or URLs.
 */
function makeService() {
  const recordPhiList = jest.fn();
  const recordPhiExport = jest.fn();
  const prisma = {
    record: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'rec-uuid-1',
          labNumber: 'C-24-000123',
          identifier: 'ID-1',
          formType: 'Gynecology',
          createdAt: new Date('2026-01-02T00:00:00Z'),
          patient: { firstName: 'Jane', lastName: 'Doe' },
          bethesdaResult: null,
          codings: [{ codeType: 'Diagnosis', code: { system: 'SNOMED', code: '123', display: 'X' } }],
        },
      ]),
    },
  };
  const audit = { recordPhiList, recordPhiExport } as any;
  const svc = new CodingService(prisma as any, audit);
  return { svc, recordPhiList, recordPhiExport, prisma };
}

describe('CodingService.records() — PHI worklist classification (P2-5DR)', () => {
  it('emits PATIENT_LIST_QUERIED on the coding surface with bounded metadata only', async () => {
    const { svc, recordPhiList } = makeService();
    const rows = await svc.records();
    // The response IS PHI-bearing (recordId + labNo + initials + bethesda + status)...
    expect(rows[0]).toEqual(
      expect.objectContaining({ recordId: 'rec-uuid-1', labNo: 'C-24-000123', patientInitials: 'JD' }),
    );
    // ...but the AUDIT event carries none of it — only bounded aggregate fields.
    expect(recordPhiList).toHaveBeenCalledTimes(1);
    const arg = recordPhiList.mock.calls[0][0];
    expect(arg).toEqual({ accessSurface: 'coding', producerModule: 'coding', resultCount: 1, resourceType: 'CodingWorklist' });
    const s = JSON.stringify(arg);
    expect(s).not.toMatch(/JD|Jane|Doe|C-24|rec-uuid|Diagnosis|SNOMED/); // no initials/labNo/id/codes
  });
});

describe('CodingService export boundary (P2-5DR)', () => {
  it('exportData() shapes data but emits NO export event (it is not the artifact boundary)', async () => {
    const { svc, recordPhiExport } = makeService();
    const data = await svc.exportData({} as any);
    expect(data.count).toBe(1);
    expect(recordPhiExport).not.toHaveBeenCalled();
  });

  it('toCsv() emits PHI_EXPORTED only after the CSV artifact is built, with no filename/URL/PHI', async () => {
    const { svc, recordPhiExport } = makeService();
    const csv = await svc.toCsv({
      records: [{ labNo: 'C-1', patientInitials: 'JD', specimenType: 'Gynecologic', date: '2026-01-02', codes: [{ system: 'SNOMED', code: '1', display: 'x', codeType: 'Diagnosis' }] }],
    });
    expect(typeof csv).toBe('string');
    expect(recordPhiExport).toHaveBeenCalledTimes(1);
    const arg = recordPhiExport.mock.calls[0][0];
    expect(arg).toEqual({ accessSurface: 'export', producerModule: 'coding', documentType: 'coding', resultCount: 1, resourceType: 'CodingExport' });
    expect(JSON.stringify(arg)).not.toMatch(/\.csv|coded-records|https?:|JD|C-1|SNOMED/);
  });

  it('serialization failure emits NO export event (emit is after the bytes are built)', async () => {
    const { svc, recordPhiExport } = makeService();
    // A malformed record makes the row builder throw before the CSV string is assembled.
    await expect(svc.toCsv({ records: [{ get codes(): never { throw new Error('boom'); } } as any] })).rejects.toThrow();
    expect(recordPhiExport).not.toHaveBeenCalled();
  });
});
