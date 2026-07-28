import { DicomIngestionService } from './dicom-ingestion.service';
import * as fs from 'node:fs';
import * as path from 'node:path';
const fx = (n: string) => fs.readFileSync(path.join(__dirname, 'testing/__fixtures__', n));

/**
 * Program 5C · C2 — the orchestration order + truthful no-slide behaviour, with mocked accepted services.
 * Proves conformance-and-profile BEFORE handoff, exact-match gating, duplicate-identity gating, and that a
 * successful VALID+matched input hands off with sourceKind=DICOM and persists SlideDicomMetadata.
 */
function harness(over: { resolver?: any; prisma?: any; ingestion?: any } = {}) {
  const ingestion = {
    initiate: jest.fn(async () => ({ slideId: 'slide-1', ingestionId: 'ing-1' })),
    appendChunk: jest.fn(async () => undefined),
    complete: jest.fn(async () => ({ ingestion: {}, duplicate: null })),
    ...(over.ingestion ?? {}),
  };
  const resolver = { resolve: jest.fn(async () => ({ kind: 'unique', recordId: 'rec-1', matchedBy: 'labNumber' })), ...(over.resolver ?? {}) };
  const prisma = {
    slideDicomMetadata: { findFirst: jest.fn(async () => null), create: jest.fn(async () => ({ id: 'sdm-1' })) },
    digitalSlide: { update: jest.fn(async () => ({})) },
    ...(over.prisma ?? {}),
  };
  const svc = new DicomIngestionService(prisma as any, ingestion as any, resolver as any);
  return { svc, ingestion, resolver, prisma };
}

describe('P5C-C2 DicomIngestionService', () => {
  it('VALID + uniquely matched → INGESTED via sourceKind=DICOM handoff + SlideDicomMetadata persisted', async () => {
    const h = harness();
    const res = await h.svc.ingestDicomWsi(fx('wsi-valid.dcm'), { filename: 'a.dcm' });
    expect(res.outcome).toBe('INGESTED');
    expect(res.slideId).toBe('slide-1');
    expect(h.ingestion.initiate).toHaveBeenCalledWith('rec-1', expect.objectContaining({ sourceKind: 'DICOM', filename: 'a.dcm' }), null);
    expect(h.ingestion.complete).toHaveBeenCalledWith('ing-1', expect.objectContaining({ expectedChecksum: expect.stringMatching(/^[a-f0-9]{64}$/) }));
    const persisted = h.prisma.slideDicomMetadata.create.mock.calls[0][0].data;
    expect(persisted).toEqual(expect.objectContaining({ slideId: 'slide-1', sopClassUID: '1.2.840.10008.5.1.4.1.1.77.1.6', conformanceStatus: 'VALID' }));
    // acquisition mapped onto the existing DigitalSlide field (objective power), never duplicated into metadata
    expect(h.prisma.digitalSlide.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ objectivePower: 20 }) }));
    expect(persisted).not.toHaveProperty('objectivePower');
    // no PHI persisted
    expect(JSON.stringify(persisted)).not.toContain('PatientName');
  });

  it('UNSUPPORTED decode profile (conformant-but-unsupported) → no initiate/append/complete, no metadata', async () => {
    const h = harness();
    const res = await h.svc.ingestDicomWsi(fx('wsi-mono.dcm'), { filename: 'mono.dcm' });
    expect(res.outcome).toBe('UNSUPPORTED');
    expect(res.slideId).toBeNull();
    expect(h.ingestion.initiate).not.toHaveBeenCalled();
    expect(h.prisma.slideDicomMetadata.create).not.toHaveBeenCalled();
  });

  it('NONCONFORMANT (wrong SOP class) → no slide/ingestion', async () => {
    const h = harness();
    // A CT SOP class is well-formed but not WSI → conformance UNSUPPORTED; assert no handoff either way.
    const res = await h.svc.ingestDicomWsi(fx('wsi-ct.dcm'), { filename: 'ct.dcm' });
    expect(res.slideId).toBeNull();
    expect(h.ingestion.initiate).not.toHaveBeenCalled();
  });

  it('no accession match → UNMATCHED, no slide', async () => {
    const h = harness({ resolver: { resolve: jest.fn(async () => ({ kind: 'none' })) } });
    const res = await h.svc.ingestDicomWsi(fx('wsi-valid.dcm'), { filename: 'a.dcm' });
    expect(res.outcome).toBe('UNMATCHED');
    expect(h.ingestion.initiate).not.toHaveBeenCalled();
  });

  it('ambiguous accession → AMBIGUOUS, no slide', async () => {
    const h = harness({ resolver: { resolve: jest.fn(async () => ({ kind: 'ambiguous', candidateRecordIds: ['a', 'b'] })) } });
    const res = await h.svc.ingestDicomWsi(fx('wsi-valid.dcm'), { filename: 'a.dcm' });
    expect(res.outcome).toBe('AMBIGUOUS');
    expect(h.ingestion.initiate).not.toHaveBeenCalled();
  });

  it('duplicate Study+Series identity → DUPLICATE, no second slide/ingestion', async () => {
    const h = harness({ prisma: { slideDicomMetadata: { findFirst: jest.fn(async () => ({ id: 'existing' })), create: jest.fn() }, digitalSlide: { update: jest.fn() } } });
    const res = await h.svc.ingestDicomWsi(fx('wsi-valid.dcm'), { filename: 'a.dcm' });
    expect(res.outcome).toBe('DUPLICATE');
    expect(h.ingestion.initiate).not.toHaveBeenCalled();
    expect(h.prisma.slideDicomMetadata.create).not.toHaveBeenCalled();
  });
});
