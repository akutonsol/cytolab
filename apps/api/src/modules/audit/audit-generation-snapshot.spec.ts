import {
  computeGenerationSnapshotDigest,
  snapshotGeneration,
  snapshotsEqual,
} from './audit-generation-snapshot';
import { VerifiableAuditRow } from './audit-verification.service';

/**
 * R-016b — the full-generation snapshot fingerprint (PURE; no DB).
 *
 * The load-bearing property (the required correction to the original terminal-only design): a change
 * to ANY interior event must alter the digest, EVEN WHEN the event count, terminal sequence, and
 * terminal selfHash are all unchanged. A terminal-only fingerprint cannot see that; this must.
 */
const HEX = (c: string) => c.repeat(64).slice(0, 64);

function mkRow(seq: number, over: Partial<VerifiableAuditRow> = {}): VerifiableAuditRow {
  return {
    id: `evt-${seq}`,
    occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    recordedAt: new Date('2026-01-01T00:00:01.000Z'),
    schemaVersion: 1,
    eventVersion: 1,
    category: 'RECORD_LIFECYCLE',
    actionCode: 'RECORD_CREATED',
    detailCode: null,
    severity: 'INFO',
    phiIndicator: false,
    dataClass: 'OPERATIONAL',
    retentionClass: 'STANDARD',
    durabilityClass: 'STANDARD',
    actorType: 'STAFF',
    actorId: 'u-1',
    onBehalfOfActorId: null,
    servicePrincipal: null,
    organizationScope: 'SYSTEM',
    scopeLabId: null,
    organizationId: null,
    resourceType: 'Record',
    resourceId: 'rec-1',
    resourceLabId: null,
    parentResourceType: null,
    parentResourceId: null,
    patientRef: null,
    outcome: 'SUCCESS',
    statusCode: null,
    errorCode: null,
    reasonCode: null,
    changedFields: [],
    beforeHash: null,
    afterHash: null,
    producerModule: 'snap-test',
    executionId: null,
    metadata: null,
    sequence: BigInt(seq),
    chainId: 'system',
    prevHash: HEX('a'),
    selfHash: HEX(String(seq % 10)),
    hashAlgorithm: 'sha256/v1',
    ...over,
  };
}

const genOf3 = (): VerifiableAuditRow[] => [mkRow(1), mkRow(2), mkRow(3)];

describe('audit-generation-snapshot (R-016b)', () => {
  it('is deterministic for the same generation', () => {
    expect(computeGenerationSnapshotDigest(genOf3())).toBe(computeGenerationSnapshotDigest(genOf3()));
  });

  it('is order-independent of how rows were queried (sorts by sequence)', () => {
    const forward = genOf3();
    const shuffled = [forward[2], forward[0], forward[1]];
    expect(computeGenerationSnapshotDigest(shuffled)).toBe(computeGenerationSnapshotDigest(forward));
  });

  it('CORE: an interior CONTENT change alters the digest even when count + terminal sequence + terminal selfHash are unchanged', () => {
    const clean = genOf3();
    // Tamper ONLY the interior event's content; leave its stored selfHash and the terminal row alone.
    const tampered = [clean[0], mkRow(2, { reasonCode: 'TAMPERED' }), clean[2]];

    const a = snapshotGeneration(clean);
    const b = snapshotGeneration(tampered);

    // The terminal-only fingerprint is IDENTICAL — this is exactly what the old design would have missed.
    expect(b.eventCount).toBe(a.eventCount);
    expect(b.terminalSequence).toBe(a.terminalSequence);
    expect(b.terminalSelfHash).toBe(a.terminalSelfHash);
    // The full-generation digest is NOT — the interior change is caught.
    expect(b.snapshotDigest).not.toBe(a.snapshotDigest);
    expect(snapshotsEqual(b, a)).toBe(false);
  });

  it('detects a change to an interior stored selfHash alone (content untouched)', () => {
    const clean = genOf3();
    const tampered = [clean[0], mkRow(2, { selfHash: HEX('f') }), clean[2]];
    expect(computeGenerationSnapshotDigest(tampered)).not.toBe(computeGenerationSnapshotDigest(clean));
  });

  it('detects an appended row (count changes)', () => {
    const grown = [...genOf3(), mkRow(4)];
    expect(computeGenerationSnapshotDigest(grown)).not.toBe(computeGenerationSnapshotDigest(genOf3()));
    expect(snapshotGeneration(grown).eventCount).toBe(4);
  });

  it('detects a removed interior row', () => {
    const clean = genOf3();
    const shrunk = [clean[0], clean[2]];
    expect(computeGenerationSnapshotDigest(shrunk)).not.toBe(computeGenerationSnapshotDigest(clean));
  });

  it('snapshotGeneration reports the terminal (highest-sequence) event', () => {
    const snap = snapshotGeneration(genOf3());
    expect(snap.eventCount).toBe(3);
    expect(snap.terminalSequence).toBe('3');
    expect(snap.terminalSelfHash).toBe(HEX('3'));
  });

  it('refuses to snapshot an empty generation', () => {
    expect(() => snapshotGeneration([])).toThrow(/empty generation/);
  });

  it('snapshotsEqual normalizes a bigint terminalSequence (seal column) against the computed string', () => {
    const snap = snapshotGeneration(genOf3());
    expect(
      snapshotsEqual(snap, {
        eventCount: 3,
        terminalSequence: 3n,
        terminalSelfHash: snap.terminalSelfHash,
        snapshotDigest: snap.snapshotDigest,
      }),
    ).toBe(true);
  });
});
