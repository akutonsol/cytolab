import { IngestionDiscoveryService } from './ingestion-discovery.service';

describe('P5B-B1 IngestionDiscoveryService — idempotency + byte-based dedup contracts', () => {
  it('recordDiscovery is idempotent: an already-seen (source, ref) returns the existing row, no create', async () => {
    const existing = { id: 'disc-1', status: 'DISCOVERED' };
    const prisma = { ingestionDiscovery: { findFirst: jest.fn().mockResolvedValue(existing), create: jest.fn() } };
    const svc = new IngestionDiscoveryService(prisma as any);
    const out = await svc.recordDiscovery({ sourceId: 's1', sourceRef: 'a/b.svs' });
    expect(out).toBe(existing);
    expect(prisma.ingestionDiscovery.create).not.toHaveBeenCalled();
  });

  it('recordDiscovery creates a fresh DISCOVERED row (no association) when unseen', async () => {
    const created = { id: 'disc-2', status: 'DISCOVERED', matchedRecordId: null, resultingSlideId: null };
    const prisma = { ingestionDiscovery: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(created) } };
    const svc = new IngestionDiscoveryService(prisma as any);
    const out = await svc.recordDiscovery({ sourceId: 's1', sourceRef: 'new.svs', sizeBytes: 10 });
    expect(out).toBe(created);
    // truthful: no slide / record / specimen association at discovery time
    expect(created.matchedRecordId).toBeNull();
    expect(created.resultingSlideId).toBeNull();
  });

  it('isDuplicateBytes is TRUE when the exact bytes already exist as a verified 5A ingestion', async () => {
    const prisma = { slideIngestion: { findFirst: jest.fn().mockResolvedValue({ id: 'ing-1' }) }, ingestionDiscovery: { findFirst: jest.fn().mockResolvedValue(null) } };
    const svc = new IngestionDiscoveryService(prisma as any);
    expect(await svc.isDuplicateBytes('a'.repeat(64))).toBe(true);
    // dedup is keyed on the checksum + verified status only (byte-based, lab-scoped by the tenancy extension)
    expect(prisma.slideIngestion.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { sourceChecksum: 'a'.repeat(64), status: 'VERIFIED' } }));
  });

  it('isDuplicateBytes is TRUE when a prior discovery already handed off these bytes', async () => {
    const prisma = { slideIngestion: { findFirst: jest.fn().mockResolvedValue(null) }, ingestionDiscovery: { findFirst: jest.fn().mockResolvedValue({ id: 'disc-9' }) } };
    const svc = new IngestionDiscoveryService(prisma as any);
    expect(await svc.isDuplicateBytes('b'.repeat(64))).toBe(true);
  });

  it('isDuplicateBytes is FALSE for genuinely new bytes, and never queries on filename/size/metadata', async () => {
    const prisma = { slideIngestion: { findFirst: jest.fn().mockResolvedValue(null) }, ingestionDiscovery: { findFirst: jest.fn().mockResolvedValue(null) } };
    const svc = new IngestionDiscoveryService(prisma as any);
    expect(await svc.isDuplicateBytes('c'.repeat(64))).toBe(false);
    const disc = prisma.ingestionDiscovery.findFirst.mock.calls[0][0];
    expect(Object.keys(disc.where)).toEqual(['sourceChecksum', 'status']); // NOT filename/patient/size
  });

  it('empty checksum is never a duplicate', async () => {
    const prisma = { slideIngestion: { findFirst: jest.fn() }, ingestionDiscovery: { findFirst: jest.fn() } };
    const svc = new IngestionDiscoveryService(prisma as any);
    expect(await svc.isDuplicateBytes('')).toBe(false);
    expect(prisma.slideIngestion.findFirst).not.toHaveBeenCalled();
  });
});
