import { AutomatedIngestionComposer } from './automated-ingestion-composer';

// The composer reuses the ACCEPTED 5A seams (injected) and must never fabricate an association.
const ingestion = {} as any; // SlideIngestionService
const queue = {} as any; // SlideProcessingQueueService.enqueueForIngestion
const cfg = { chunkBytes: 8 * 1024 * 1024 } as any; // WatchFolderConfig (only chunkBytes used by the byte flow)

describe('P5B-B1 AutomatedIngestionComposer — truthful handoff precondition', () => {
  const composer = new AutomatedIngestionComposer(ingestion, queue, cfg);

  it('allows handoff only for a uniquely MATCHED discovery with a record', () => {
    expect(composer.assertHandoffReady({ id: 'd1', status: 'MATCHED', matchedRecordId: 'rec-1' })).toEqual({ recordId: 'rec-1', specimenId: null });
  });

  it('carries an explicitly matched specimen when present (else record-level/null)', () => {
    expect(composer.assertHandoffReady({ id: 'd2', status: 'MATCHED', matchedRecordId: 'rec-1', matchedSpecimenId: 'spec-9' })).toEqual({ recordId: 'rec-1', specimenId: 'spec-9' });
  });

  it.each(['UNMATCHED', 'AMBIGUOUS', 'STABILIZING', 'DUPLICATE', 'FAILED', 'DISCOVERED'])(
    'refuses handoff for non-unique status %s (no fabricated association)',
    (status) => {
      expect(() => composer.assertHandoffReady({ id: 'd', status, matchedRecordId: null })).toThrow();
    },
  );

  it('refuses handoff when status is MATCHED but no record id is present', () => {
    expect(() => composer.assertHandoffReady({ id: 'd', status: 'MATCHED', matchedRecordId: null })).toThrow();
  });

  it('injects the accepted 5A ingestion + queue seams (no second processing path)', () => {
    expect((composer as any).ingestion).toBe(ingestion);
    expect((composer as any).queue).toBe(queue);
  });
});

describe('P5B-B2 AutomatedIngestionComposer.ingestMatchedFile — server-owned WATCH_FOLDER handoff', () => {
  const os = require('node:os'); const fsp = require('node:fs/promises'); const p = require('node:path'); const crypto = require('node:crypto');

  it('drives the ACCEPTED SlideIngestionService (initiate WATCH_FOLDER → appendChunk → complete); sets no browser-spoofable kind', async () => {
    const dir = await fsp.mkdtemp(p.join(os.tmpdir(), 'wf-comp-'));
    try {
      const abs = p.join(dir, 'CBL-9.svs');
      const bytes = Buffer.from('the-source-bytes-of-a-slide');
      await fsp.writeFile(abs, bytes);
      const sha = crypto.createHash('sha256').update(bytes).digest('hex');

      const svc = {
        initiate: jest.fn(async () => ({ slideId: 'slide-Z', ingestionId: 'ing-Z' })),
        appendChunk: jest.fn(async () => ({})),
        complete: jest.fn(async () => ({ ingestion: { sourceChecksum: sha } })),
      };
      const c = new AutomatedIngestionComposer(svc as any, {} as any, { chunkBytes: 8 } as any);
      const res = await c.ingestMatchedFile({ absPath: abs, filename: 'CBL-9.svs', sizeBytes: bytes.length, recordId: 'rec-1', specimenId: null, expectedChecksum: sha });

      // sourceKind set SERVER-SIDE = WATCH_FOLDER (public DTO whitelist untouched); userId=null (system).
      expect(svc.initiate).toHaveBeenCalledWith('rec-1', expect.objectContaining({ sourceKind: 'WATCH_FOLDER', filename: 'CBL-9.svs' }), null);
      // streamed the whole file through the accepted chunked path (8-byte chunks → multiple appends)
      expect(svc.appendChunk).toHaveBeenCalled();
      const uploaded = svc.appendChunk.mock.calls.reduce((n: number, call: any[]) => n + call[2].length, 0);
      expect(uploaded).toBe(bytes.length);
      // completed with the caller-computed checksum (the accepted service re-verifies before VERIFIED)
      expect(svc.complete).toHaveBeenCalledWith('ing-Z', { expectedChecksum: sha });
      expect(res).toEqual({ slideId: 'slide-Z', ingestionId: 'ing-Z', checksum: sha });
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});
