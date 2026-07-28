import { DicomWebImportService } from './dicomweb-import.service';
import { DicomWebError } from './dicomweb-errors';

const WSI = '1.2.840.10008.5.1.4.1.1.77.1.6';
const NATIVE = Buffer.from([0x44, 0x49, 0x43, 0x4d, 1, 2, 3]);

function harness(over: { client?: any; dicom?: any; discovery?: any; sources?: any } = {}) {
  const sources = {
    get: jest.fn(async () => ({ id: 'src-1', kind: 'DICOMWEB', enabled: true, endpointBaseUrl: 'https://pacs.example/dicomweb', authType: 'BEARER', credentialCipher: 'CIPHER' })),
    ...(over.sources ?? {}),
  };
  const discovery = {
    recordDiscovery: jest.fn(async () => ({ id: 'disc-1', status: 'DISCOVERED', resultingSlideId: null, resultingIngestionId: null })),
    setStatus: jest.fn(async () => ({})),
    ...(over.discovery ?? {}),
  };
  const dicom = { ingestDicomWsi: jest.fn(async () => ({ outcome: 'INGESTED', slideId: 'slide-1', ingestionId: 'ing-1' })), ...(over.dicom ?? {}) };
  const client = {
    qidoInstances: jest.fn(async () => [{ sopInstanceUID: 'sop-1', sopClassUID: WSI }]),
    wadoRetrieveInstance: jest.fn(async () => NATIVE),
    ...(over.client ?? {}),
  };
  const encryption = { decrypt: jest.fn(() => 'the-token') };
  const audit = { recordEntityUpdated: jest.fn(async () => undefined) };
  const svc = new DicomWebImportService(sources as any, discovery as any, dicom as any, client as any, encryption as any, audit as any);
  return { svc, sources, discovery, dicom, client, encryption };
}

describe('P5C-C3 DicomWebImportService', () => {
  const input = { sourceId: 'src-1', studyInstanceUID: '1.2.3', seriesInstanceUID: '1.2.3.1' };

  it('single WSI instance → WADO native bytes → C2 ingestDicomWsi → INGESTED (no second pipeline)', async () => {
    const h = harness();
    const res = await h.svc.importSeries(input);
    expect(res.outcome).toBe('INGESTED');
    expect(res.slideId).toBe('slide-1');
    // decrypted credential built a Bearer header; WADO retrieved; the EXACT native bytes went to C2
    expect(h.client.wadoRetrieveInstance).toHaveBeenCalledWith(expect.objectContaining({ authHeader: 'Bearer the-token', allowedHosts: ['pacs.example'] }), '1.2.3', '1.2.3.1', 'sop-1');
    expect(h.dicom.ingestDicomWsi).toHaveBeenCalledWith(NATIVE, expect.objectContaining({ filename: expect.any(String) }));
    expect(h.discovery.setStatus).toHaveBeenCalledWith('disc-1', 'INGESTED', expect.objectContaining({ resultingSlideId: 'slide-1' }));
  });

  it('multi-instance WSI series → UNSUPPORTED, NEVER retrieved or handed to C2 (C2 not widened)', async () => {
    const h = harness({ client: { qidoInstances: jest.fn(async () => [{ sopInstanceUID: 'a', sopClassUID: WSI }, { sopInstanceUID: 'b', sopClassUID: WSI }]) } });
    const res = await h.svc.importSeries(input);
    expect(res.outcome).toBe('UNSUPPORTED');
    expect(res.slideId).toBeNull();
    expect(h.client.wadoRetrieveInstance).not.toHaveBeenCalled();
    expect(h.dicom.ingestDicomWsi).not.toHaveBeenCalled();
  });

  it('no WSI instance in the series → UNSUPPORTED, no retrieval', async () => {
    const h = harness({ client: { qidoInstances: jest.fn(async () => [{ sopInstanceUID: 'x', sopClassUID: '1.2.840.10008.5.1.4.1.1.2' }]) } });
    const res = await h.svc.importSeries(input);
    expect(res.outcome).toBe('UNSUPPORTED');
    expect(h.client.wadoRetrieveInstance).not.toHaveBeenCalled();
  });

  it('a transport error (WADO) → FAILED with the structured code, no C2 handoff', async () => {
    const h = harness({ client: { qidoInstances: jest.fn(async () => [{ sopInstanceUID: 'sop-1', sopClassUID: WSI }]), wadoRetrieveInstance: jest.fn(async () => { throw new DicomWebError('TIMEOUT', 'timed out'); }) } });
    const res = await h.svc.importSeries(input);
    expect(res.outcome).toBe('FAILED');
    expect(res.error?.code).toBe('TIMEOUT');
    expect(h.dicom.ingestDicomWsi).not.toHaveBeenCalled();
  });

  it('idempotent: an already-INGESTED series discovery short-circuits (no re-retrieval)', async () => {
    const h = harness({ discovery: { recordDiscovery: jest.fn(async () => ({ id: 'disc-1', status: 'INGESTED', resultingSlideId: 'slide-9', resultingIngestionId: 'ing-9' })), setStatus: jest.fn() } });
    const res = await h.svc.importSeries(input);
    expect(res.outcome).toBe('INGESTED');
    expect(res.slideId).toBe('slide-9');
    expect(h.client.qidoInstances).not.toHaveBeenCalled();
    expect(h.client.wadoRetrieveInstance).not.toHaveBeenCalled();
  });

  it('C2 DUPLICATE/UNMATCHED propagate truthfully (native bytes are authoritative)', async () => {
    const dup = harness({ dicom: { ingestDicomWsi: jest.fn(async () => ({ outcome: 'DUPLICATE', slideId: null, ingestionId: null })) } });
    expect((await dup.svc.importSeries(input)).outcome).toBe('DUPLICATE');
    const um = harness({ dicom: { ingestDicomWsi: jest.fn(async () => ({ outcome: 'UNMATCHED', slideId: null, ingestionId: null })) } });
    expect((await um.svc.importSeries(input)).outcome).toBe('UNMATCHED');
  });
});
