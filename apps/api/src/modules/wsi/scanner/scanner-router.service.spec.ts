import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { ScannerRouterService } from './scanner-router.service';
import { ScannerAdapterError } from './scanner-adapter';

/**
 * Program 5C · C4 — the router reuses IngestionDiscovery + completeness and routes to the ACCEPTED intake:
 * DICOM_FILE → ingestDicomWsi (native bytes), DICOMWEB_SERIES → importSeries. It never creates a slide itself.
 */
function harness(over: { source?: any; adapter?: any; dicom?: any; imports?: any; discovery?: any } = {}) {
  const source = { id: 's1', kind: 'FILESYSTEM', rootPath: '/nonexistent', endpointBaseUrl: null, adapterType: 'FILESYSTEM_DICOM', enabled: true, ...(over.source ?? {}) };
  const sources = { get: jest.fn(async () => source) };
  const adapter = {
    id: 'filesystem-dicom',
    adapterType: 'FILESYSTEM_DICOM',
    discoverCompletedScans: jest.fn(async () => []),
    validateCompleteness: jest.fn(async () => ({ complete: true })),
    ...(over.adapter ?? {}),
  };
  const registry = { require: jest.fn(() => adapter) };
  const discovery = {
    recordDiscovery: jest.fn(async () => ({ id: 'd1', status: 'DISCOVERED', resultingSlideId: null })),
    setStatus: jest.fn(async () => ({})),
    ...(over.discovery ?? {}),
  };
  const dicom = { ingestDicomWsi: jest.fn(async () => ({ outcome: 'INGESTED', slideId: 'slide-1', ingestionId: 'ing-1' })), ...(over.dicom ?? {}) };
  const imports = { importSeries: jest.fn(async () => ({ outcome: 'INGESTED', slideId: 'slide-web', ingestionId: 'ing-web' })), ...(over.imports ?? {}) };
  const audit = { recordEntityUpdated: jest.fn(async () => undefined) };
  const svc = new ScannerRouterService(sources as any, discovery as any, registry as any, dicom as any, imports as any, audit as any);
  return { svc, source, sources, adapter, registry, discovery, dicom, imports };
}

describe('P5C-C4 ScannerRouterService', () => {
  let root: string;
  let checksum: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'scan-'));
    await fs.writeFile(path.join(root, 'a.dcm'), Buffer.from('DICM-native-bytes'));
  });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  it('rejects an adapter/transport mismatch deterministically', async () => {
    const h = harness({ source: { id: 's1', kind: 'DICOMWEB', rootPath: null, endpointBaseUrl: 'https://x/', adapterType: 'FILESYSTEM_DICOM', enabled: true } });
    await expect(h.svc.runSource('s1')).rejects.toBeInstanceOf(ScannerAdapterError);
  });

  it('rejects a disabled source', async () => {
    const h = harness({ source: { id: 's1', kind: 'FILESYSTEM', rootPath: root, adapterType: 'FILESYSTEM_DICOM', enabled: false } });
    await expect(h.svc.runSource('s1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('DICOM_FILE + complete → reads native bytes → ingestDicomWsi → INGESTED (no slide created by the router)', async () => {
    const h = harness({
      source: { id: 's1', kind: 'FILESYSTEM', rootPath: root, endpointBaseUrl: null, adapterType: 'FILESYSTEM_DICOM', enabled: true },
      adapter: { id: 'filesystem-dicom', adapterType: 'FILESYSTEM_DICOM', discoverCompletedScans: jest.fn(async () => [{ sourceRef: 'a.dcm', objectKind: 'DICOM_FILE', locator: { kind: 'DICOM_FILE', absPath: path.join(root, 'a.dcm') }, sizeBytes: 17 }]), validateCompleteness: jest.fn(async () => ({ complete: true })) },
    });
    const res = await h.svc.runSource('s1');
    expect(res.results[0].outcome).toBe('INGESTED');
    expect(h.dicom.ingestDicomWsi).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({ filename: 'a.dcm' }));
    // the router persisted the accepted outcome + native checksum on the discovery
    expect(h.discovery.setStatus).toHaveBeenCalledWith('d1', 'INGESTED', expect.objectContaining({ resultingSlideId: 'slide-1', sourceChecksum: expect.stringMatching(/^[a-f0-9]{64}$/) }));
  });

  it('incomplete scan → INCOMPLETE, STABILIZING, NEVER handed to C2', async () => {
    const h = harness({
      source: { id: 's1', kind: 'FILESYSTEM', rootPath: root, adapterType: 'FILESYSTEM_DICOM', enabled: true },
      adapter: { id: 'filesystem-dicom', adapterType: 'FILESYSTEM_DICOM', discoverCompletedScans: jest.fn(async () => [{ sourceRef: 'a.dcm', objectKind: 'DICOM_FILE', locator: { kind: 'DICOM_FILE', absPath: path.join(root, 'a.dcm') }, sizeBytes: 17 }]), validateCompleteness: jest.fn(async () => ({ complete: false, reason: 'not quiescent' })) },
    });
    const res = await h.svc.runSource('s1');
    expect(res.results[0].outcome).toBe('INCOMPLETE');
    expect(h.dicom.ingestDicomWsi).not.toHaveBeenCalled();
    expect(h.discovery.setStatus).toHaveBeenCalledWith('d1', 'STABILIZING', expect.anything());
  });

  it('a terminal (already-INGESTED) discovery short-circuits — no re-ingest (idempotent)', async () => {
    const h = harness({
      source: { id: 's1', kind: 'FILESYSTEM', rootPath: root, adapterType: 'FILESYSTEM_DICOM', enabled: true },
      adapter: { id: 'filesystem-dicom', adapterType: 'FILESYSTEM_DICOM', discoverCompletedScans: jest.fn(async () => [{ sourceRef: 'a.dcm', objectKind: 'DICOM_FILE', locator: { kind: 'DICOM_FILE', absPath: path.join(root, 'a.dcm') }, sizeBytes: 17 }]) },
      discovery: { recordDiscovery: jest.fn(async () => ({ id: 'd1', status: 'INGESTED', resultingSlideId: 'slide-old' })), setStatus: jest.fn() },
    });
    const res = await h.svc.runSource('s1');
    expect(res.results[0].outcome).toBe('INGESTED');
    expect(res.results[0].slideId).toBe('slide-old');
    expect(h.dicom.ingestDicomWsi).not.toHaveBeenCalled();
  });

  it('DICOMWEB_SERIES → delegates entirely to the accepted C3 importSeries (no C2 file path)', async () => {
    const h = harness({
      source: { id: 's2', kind: 'DICOMWEB', rootPath: null, endpointBaseUrl: 'https://x/', adapterType: 'DICOMWEB', enabled: true },
      adapter: { id: 'dicomweb', adapterType: 'DICOMWEB', discoverCompletedScans: jest.fn(async () => [{ sourceRef: '1.2/1.2.1', objectKind: 'DICOMWEB_SERIES', locator: { kind: 'DICOMWEB_SERIES', studyInstanceUID: '1.2', seriesInstanceUID: '1.2.1' } }]), validateCompleteness: jest.fn(async () => ({ complete: true })) },
    });
    const res = await h.svc.runSource('s2');
    expect(res.results[0].outcome).toBe('INGESTED');
    expect(h.imports.importSeries).toHaveBeenCalledWith({ sourceId: 's2', studyInstanceUID: '1.2', seriesInstanceUID: '1.2.1' });
    expect(h.dicom.ingestDicomWsi).not.toHaveBeenCalled();
  });
});
