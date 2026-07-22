import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../database/prisma.service';
import { AuditRecordInput } from './audit.contract';
import { AuditPersistenceService } from './audit-persistence.service';
import { AuditChainService } from './audit-chain.service';
import { AuditVerificationService, VerifiableAuditRow } from './audit-verification.service';
import { AuditIntegrityMonitorService } from './audit-integrity-monitor.service';
import { AuditSealRegistrarService, SealRegistrationError } from './audit-seal-registrar.service';
import { snapshotGeneration } from './audit-generation-snapshot';
import { LEGACY_SYSTEM_CHAIN_ID, ACTIVE_SYSTEM_CHAIN_ID } from './audit-chain';

/**
 * R-016b — Sealed-Generation Audit Monitor (integration, isolated test DB).
 *
 * A sealed generation is a FROZEN prior generation that is not required to verify as a live chain; its
 * invariant is "unchanged since sealing", proven against a full-generation snapshot. These tests drive
 * the REAL registrar (fail-closed writer) and the REAL report-only monitor against real, appended
 * chains, and assert every behavior the authorization required — above all that interior tampering
 * which leaves count/terminal untouched is still caught, and that a failed active chain never becomes
 * healthy (only explicitly-sealed chains take the sealed path).
 */
const prisma = createTestPrisma();
const chain = new AuditChainService();
const persistence = new AuditPersistenceService(prisma as unknown as PrismaService, chain);
const verifier = new AuditVerificationService(prisma as unknown as PrismaService);
const monitor = new AuditIntegrityMonitorService(verifier, prisma as unknown as PrismaService);
const registrar = new AuditSealRegistrarService(prisma as unknown as PrismaService);

const MARKER = 'r016b-seal-it';
const PREFIX = 'lab:r16b-';
const cid = (labId: string) => `lab:${labId}`;

function mkInput(over: Partial<AuditRecordInput> = {}): AuditRecordInput {
  return {
    category: 'RECORD_LIFECYCLE',
    action: { code: 'RECORD_CREATED' },
    actor: { type: 'STAFF', id: 'u-itc' },
    organization: { scope: 'LAB', labId: 'r16b-x' },
    resource: { type: 'Record', id: 'rec-itc' },
    outcome: { status: 'SUCCESS' },
    producerModule: MARKER,
    ...over,
  };
}
const appendTx = (inp: AuditRecordInput) => prisma.$transaction((tx) => persistence.append(inp, tx as any));

/** Build an n-event LAB chain (chainId `lab:<labId>`). */
async function buildLab(labId: string, n: number): Promise<string> {
  for (let i = 0; i < n; i++) await appendTx(mkInput({ organization: { scope: 'LAB', labId } }));
  return cid(labId);
}
/** Build an n-event SYSTEM chain — routes to the ACTIVE generation (system:g1). */
async function buildSystem(n: number): Promise<string> {
  for (let i = 0; i < n; i++) await appendTx(mkInput({ organization: { scope: 'SYSTEM' } }));
  return ACTIVE_SYSTEM_CHAIN_ID;
}

async function loadRows(chainId: string): Promise<VerifiableAuditRow[]> {
  return (await prisma.auditEvent.findMany({ where: { chainId }, orderBy: { sequence: 'asc' } })) as unknown as VerifiableAuditRow[];
}
/** Register a matching seal for a well-formed generation (the authorized-snapshot happy path). */
async function seal(chainId: string): Promise<void> {
  const expected = snapshotGeneration(await loadRows(chainId));
  await registrar.registerSeal(chainId, expected, 'test seal', 'tester');
}

// Raw tamper helpers (bypass the append API to simulate post-seal DB corruption).
const setEventReasonCode = (chainId: string, sequence: bigint, reasonCode: string) =>
  prisma.$executeRaw`UPDATE "AuditEvent" SET "reasonCode" = ${reasonCode} WHERE "chainId" = ${chainId} AND "sequence" = ${sequence}`;
const setEventSelfHash = (chainId: string, sequence: bigint, selfHash: string) =>
  prisma.$executeRaw`UPDATE "AuditEvent" SET "selfHash" = ${selfHash} WHERE "chainId" = ${chainId} AND "sequence" = ${sequence}`;
const setEventPrevHash = (chainId: string, sequence: bigint, prevHash: string) =>
  prisma.$executeRaw`UPDATE "AuditEvent" SET "prevHash" = ${prevHash} WHERE "chainId" = ${chainId} AND "sequence" = ${sequence}`;
const deleteEvent = (chainId: string, sequence: bigint) =>
  prisma.$executeRaw`DELETE FROM "AuditEvent" WHERE "chainId" = ${chainId} AND "sequence" = ${sequence}`;

async function cleanup(): Promise<void> {
  await prisma.auditEvent.deleteMany({ where: { producerModule: MARKER } });
  await prisma.$executeRaw`DELETE FROM "AuditChainHead" WHERE "chainId" LIKE ${PREFIX + '%'} OR "chainId" IN (${ACTIVE_SYSTEM_CHAIN_ID}, ${LEGACY_SYSTEM_CHAIN_ID})`;
  await prisma.$executeRaw`DELETE FROM "AuditChainSeal" WHERE "chainId" LIKE ${PREFIX + '%'} OR "chainId" IN (${ACTIVE_SYSTEM_CHAIN_ID}, ${LEGACY_SYSTEM_CHAIN_ID})`;
}
beforeEach(cleanup);
afterAll(cleanup);

describe('R-016b — seal registration (fail-closed writer)', () => {
  it('seals a generation that reproduces the authorized snapshot exactly', async () => {
    const chainId = await buildLab('r16b-ok', 3);
    const res = await registrar.registerSeal(chainId, snapshotGeneration(await loadRows(chainId)), 'test seal', 'tester');
    expect(res.outcome).toBe('sealed');
    const row = await prisma.auditChainSeal.findUnique({ where: { chainId } });
    expect(row?.eventCount).toBe(3);
    expect(row?.terminalSequence).toBe(3n);
  });

  it('REFUSES to seal when the deployed generation does not match the expected snapshot (fail closed, no write)', async () => {
    const chainId = await buildLab('r16b-mismatch', 3);
    const wrong = { ...snapshotGeneration(await loadRows(chainId)), snapshotDigest: 'deadbeef'.repeat(8) };
    await expect(registrar.registerSeal(chainId, wrong, 'test seal', 'tester')).rejects.toBeInstanceOf(SealRegistrationError);
    expect(await prisma.auditChainSeal.findUnique({ where: { chainId } })).toBeNull();
  });

  it('REFUSES to seal a generation with no events', async () => {
    await expect(registrar.registerSeal(cid('r16b-empty'), snapshotGeneration([mkStub()]) as any, 'x', null)).rejects.toBeInstanceOf(SealRegistrationError);
  });

  it('is idempotent: re-registering a matching seal writes nothing new', async () => {
    const chainId = await buildLab('r16b-idem', 2);
    const expected = snapshotGeneration(await loadRows(chainId));
    await registrar.registerSeal(chainId, expected, 'test seal', 'tester');
    const res2 = await registrar.registerSeal(chainId, expected, 'test seal', 'tester');
    expect(res2.outcome).toBe('already-sealed');
    expect(await prisma.auditChainSeal.count({ where: { chainId } })).toBe(1);
  });

  it('registerInitialSystemSeal fails closed when the authorized system gen-0 rows are absent', async () => {
    // The isolated test DB has no frozen `system` generation-0, so registration must refuse (not invent one).
    await expect(registrar.registerInitialSystemSeal('tester')).rejects.toBeInstanceOf(SealRegistrationError);
    expect(await prisma.auditChainSeal.findUnique({ where: { chainId: LEGACY_SYSTEM_CHAIN_ID } })).toBeNull();
  });
});

describe('R-016b — monitor classification', () => {
  it('reports a matching sealed generation as SEALED', async () => {
    const chainId = await buildLab('r16b-sealed', 3);
    await seal(chainId);
    const a = await monitor.assessChain(chainId);
    expect(a.status).toBe('SEALED');
    expect(a.reason).toBeNull();
  });

  it('reports an ACTIVE (unsealed) system:g1 generation as VERIFIED — not SEALED', async () => {
    const chainId = await buildSystem(3);
    const a = await monitor.assessChain(chainId);
    expect(a.status).toBe('VERIFIED');
  });

  it('reports an UNSEALED broken chain as COMPROMISED (the verifier still rejects it)', async () => {
    const chainId = await buildLab('r16b-broken', 3);
    await setEventPrevHash(chainId, 2n, 'b'.repeat(64)); // break interior linkage; do NOT seal
    const a = await monitor.assessChain(chainId);
    expect(a.status).toBe('COMPROMISED');
    // And the canonical verifier rejects it DIRECTLY (sealing infrastructure did not neuter it).
    const v = await verifier.verifyChain({ chainId });
    expect(v.verified).toBe(false);
  });

  it('CORE: interior tampering with count + terminal sequence + terminal selfHash unchanged → COMPROMISED', async () => {
    const chainId = await buildLab('r16b-interior', 3);
    await seal(chainId);
    // Mutate ONLY interior event #2's content — row count, terminal sequence, and terminal selfHash are all unchanged.
    await setEventReasonCode(chainId, 2n, 'TAMPERED');
    const a = await monitor.assessChain(chainId);
    expect(a.status).toBe('COMPROMISED');
    expect(a.reason).toBe('sealed_generation_tampered');
  });

  it('detects an interior stored selfHash mutation → COMPROMISED', async () => {
    const chainId = await buildLab('r16b-selfhash', 3);
    await seal(chainId);
    await setEventSelfHash(chainId, 2n, 'c'.repeat(64));
    expect((await monitor.assessChain(chainId)).reason).toBe('sealed_generation_tampered');
  });

  it('detects a terminal-event mutation → COMPROMISED', async () => {
    const chainId = await buildLab('r16b-terminal', 3);
    await seal(chainId);
    await setEventSelfHash(chainId, 3n, 'd'.repeat(64));
    expect((await monitor.assessChain(chainId)).status).toBe('COMPROMISED');
  });

  it('detects an appended row after sealing → COMPROMISED', async () => {
    const chainId = await buildLab('r16b-appended', 3);
    await seal(chainId);
    await appendTx(mkInput({ organization: { scope: 'LAB', labId: 'r16b-appended' } })); // now 4 events
    expect((await monitor.assessChain(chainId)).status).toBe('COMPROMISED');
  });

  it('detects a removed row after sealing → COMPROMISED', async () => {
    const chainId = await buildLab('r16b-removed', 3);
    await seal(chainId);
    await deleteEvent(chainId, 2n);
    expect((await monitor.assessChain(chainId)).status).toBe('COMPROMISED');
  });
});

describe('R-016b — sweep aggregation', () => {
  it('counts sealed and compromised distinctly, and stays DEGRADED when any chain is compromised', async () => {
    const sealedId = await buildLab('r16b-agg-sealed', 3);
    await seal(sealedId);
    const brokenId = await buildLab('r16b-agg-broken', 3);
    await seal(brokenId);
    await setEventReasonCode(brokenId, 2n, 'TAMPERED');
    const verifiedId = await buildLab('r16b-agg-verified', 2);

    const report = await monitor.runSweep('manual', [sealedId, brokenId, verifiedId]);
    expect(report.sealed).toBe(1);
    expect(report.compromised).toBe(1);
    expect(report.verified).toBe(1);
    expect(report.state).toBe('DEGRADED');
    expect(report.compromisedChainIds).toEqual([brokenId]);
  });

  it('is HEALTHY when every chain is either VERIFIED or SEALED', async () => {
    const sealedId = await buildLab('r16b-h-sealed', 3);
    await seal(sealedId);
    const verifiedId = await buildLab('r16b-h-verified', 2);
    const report = await monitor.runSweep('manual', [sealedId, verifiedId]);
    expect(report.state).toBe('HEALTHY');
    expect(report.sealed).toBe(1);
    expect(report.verified).toBe(1);
  });

  it('NEVER auto-seals: sweeping an unsealed broken chain creates no seal row', async () => {
    const chainId = await buildLab('r16b-noseal', 3);
    await setEventPrevHash(chainId, 2n, 'e'.repeat(64));
    await monitor.runSweep('manual', [chainId]);
    expect(await prisma.auditChainSeal.count({ where: { chainId } })).toBe(0);
  });
});

/** A minimal synthetic row so the empty-generation registrar test can construct an "expected" snapshot. */
function mkStub(): VerifiableAuditRow {
  return {
    id: 'stub', occurredAt: new Date(0), recordedAt: new Date(0), schemaVersion: 1, eventVersion: 1,
    category: 'RECORD_LIFECYCLE', actionCode: 'RECORD_CREATED', detailCode: null, severity: 'INFO',
    phiIndicator: false, dataClass: 'OPERATIONAL', retentionClass: 'STANDARD', durabilityClass: 'STANDARD',
    actorType: 'STAFF', actorId: null, onBehalfOfActorId: null, servicePrincipal: null,
    organizationScope: 'SYSTEM', scopeLabId: null, organizationId: null, resourceType: 'Record',
    resourceId: null, resourceLabId: null, parentResourceType: null, parentResourceId: null, patientRef: null,
    outcome: 'SUCCESS', statusCode: null, errorCode: null, reasonCode: null, changedFields: [],
    beforeHash: null, afterHash: null, producerModule: MARKER, executionId: null, metadata: null,
    sequence: 1n, chainId: 'stub', prevHash: '0'.repeat(64), selfHash: '1'.repeat(64), hashAlgorithm: 'sha256/v1',
  };
}
