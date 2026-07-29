import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ReportsService } from './reports.service';
import { ReportPdfService } from './report-pdf.service';

/**
 * The Phase 3 authorization gate is re-checked at render time: an unauthorized
 * (or de-authorized) result sheet must never produce a report PDF. This is what
 * keeps a stale PDF from outliving its authorization, and it's the same gate the
 * F2 client portal will rely on.
 */
describe('ReportsService.renderForRecord — authorization gate', () => {
  function makeService(sheet: unknown) {
    const findFirst = jest.fn().mockResolvedValue(sheet);
    const prisma = { resultSheet: { findFirst } } as unknown as PrismaService;
    const pdf = new ReportPdfService();
    const renderSpy = jest.spyOn(pdf, 'render');
    return { service: new ReportsService(prisma, pdf, { recordPhiRead: async () => {} } as any), renderSpy };
  }

  const authorizedSheet = {
    authorized: true,
    authorizedAt: new Date('2026-06-30T10:00:00Z'),
    authorizedBy: { firstName: 'Pat', lastName: 'Ologist', signatureUrl: null },
    resultEntries: [
      {
        specimen: { label: 'Block A', type: 'Tissue' },
        resultLines: [{ abbreviation: 'HPV', result: 'Positive', findings: 'See note', abnormalFinding: true }],
      },
    ],
    reports: [{ content: 'Narrative.', medicalEntry: null }],
    record: {
      identifier: 'REC-001',
      labNumber: 'LN-1',
      clinicalDiagnosis: 'Suspected',
      lab: { name: 'Acme Lab', address: '1 Main St', phone: '555', email: 'a@b.c', logoUrl: null },
      patient: {
        firstName: 'Jane',
        lastName: 'Doe',
        middleName: null,
        registrationNo: 'P-1',
        age: 40,
        gender: 'Female',
        bloodGroup: 'O+',
        phoneNumber: '555',
        dateOfBirth: new Date('1986-01-01T00:00:00Z'),
      },
      client: { firstName: 'Dr', lastName: 'Ref', officeName: 'Clinic' },
      specimens: [{ type: 'Tissue', label: 'Block A', bloodGroup: null, dateReceived: new Date('2026-06-29T00:00:00Z') }],
    },
  };

  it('refuses to render when the result sheet is NOT authorized', async () => {
    const { service, renderSpy } = makeService({ ...authorizedSheet, authorized: false, authorizedAt: null });

    await expect(service.renderForRecord('rec-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(renderSpy).not.toHaveBeenCalled(); // never even attempts to render
  });

  it('throws NotFound when the record has no result sheet at all', async () => {
    const { service, renderSpy } = makeService(null);

    await expect(service.renderForRecord('rec-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(renderSpy).not.toHaveBeenCalled();
  });

  it('renders a real PDF buffer when the sheet is authorized', async () => {
    const { service } = makeService(authorizedSheet);

    const { buffer, record } = await service.renderForRecord('rec-1');

    expect(record.identifier).toBe('REC-001');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    // Valid PDF files start with the "%PDF-" magic header.
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
