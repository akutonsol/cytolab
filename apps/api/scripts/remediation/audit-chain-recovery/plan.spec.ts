/**
 * Program 2 · P2-R016B-A2 — Dry-Run Recovery Planner: unit tests (pure, no DB).
 *
 * Synthetic fixtures are built with the REAL computeSelfHash so classification exercises the
 * authoritative hash/verify path. Deterministic (fixed timestamps); no database, no I/O.
 */
import { computeSelfHash } from '../../../src/modules/audit/audit-hash';
import { GENESIS_PREV_HASH, AUDIT_HASH_ALGORITHM } from '../../../src/modules/audit/audit-chain';
import type { VerifiableAuditRow } from '../../../src/modules/audit/audit-verification.service';
import {
  verifyChain,
  computeVerificationDigest,
  buildRecoveryPlanEntry,
  buildRecoveryPlan,
  type ChainHeadState,
} from './shared';

const FIXED = new Date('2026-07-18T22:00:00.000Z');
const HEX_A = 'a'.repeat(64);

function makeEvent(seq: number, prevHash: string, chainId = 'test', overrides: Partial<VerifiableAuditRow> = {}): VerifiableAuditRow {
  const fields: any = {
    id: `evt-${chainId}-${seq}`,
    occurredAt: FIXED,
    recordedAt: FIXED,
    schemaVersion: 1,
    eventVersion: 1,
    category: 'SYSTEM',
    actionCode: 'JOB_STARTED',
    detailCode: null,
    severity: 'INFO',
    phiIndicator: false,
    dataClass: 'OPERATIONAL',
    retentionClass: 'STANDARD',
    durabilityClass: 'OPERATIONAL',
    actorType: 'SYSTEM',
    actorId: null,
    onBehalfOfActorId: null,
    servicePrincipal: null,
    organizationScope: 'SYSTEM',
    scopeLabId: null,
    organizationId: null,
    resourceType: 'Job',
    resourceId: null,
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
    producerModule: 'test',
    executionId: null,
    hashAlgorithm: AUDIT_HASH_ALGORITHM,
    metadata: null,
    sequence: BigInt(seq),
    chainId,
    prevHash,
    ...overrides,
  };
  const selfHash = computeSelfHash(fields);
  return { ...fields, selfHash };
}

function validChain(n: number, chainId = 'test'): VerifiableAuditRow[] {
  const rows: VerifiableAuditRow[] = [];
  let prev = GENESIS_PREV_HASH;
  for (let s = 1; s <= n; s++) {
    const e = makeEvent(s, prev, chainId);
    rows.push(e);
    prev = e.selfHash!;
  }
  return rows;
}

const headOf = (rows: VerifiableAuditRow[]): ChainHeadState => {
  const t = rows[rows.length - 1];
  return { lastSequence: t.sequence as bigint, lastSelfHash: t.selfHash as string };
};

describe('P2-R016B-A2 recovery planner (pure)', () => {
  describe('verifyChain', () => {
    it('classifies a valid, head-consistent chain as VERIFIED', () => {
      const rows = validChain(3);
      const v = verifyChain(rows, headOf(rows));
      expect(v.result).toBe('VERIFIED');
      expect(v.verifiedPrefixLength).toBe(3);
      expect(v.terminalCount).toBe(1);
      expect(v.headPresent).toBe(true);
      expect(v.headMatchesTerminal).toBe(true);
      expect(v.failure).toBeUndefined();
    });

    it('a valid chain with a MISSING head is still VERIFIED but headMatchesTerminal=false', () => {
      const rows = validChain(3);
      const v = verifyChain(rows, null);
      expect(v.result).toBe('VERIFIED');
      expect(v.headPresent).toBe(false);
      expect(v.headMatchesTerminal).toBe(false);
    });

    it('detects a broken predecessor link (the dev system-chain shape) as COMPROMISED', () => {
      // seq1 genesis; seq2.prevHash points at a hash that is NOT seq1.selfHash (deleted predecessor).
      const e1 = makeEvent(1, GENESIS_PREV_HASH);
      const e2 = makeEvent(2, HEX_A); // dangling prevHash
      const e3 = makeEvent(3, e2.selfHash!); // links to e2 correctly
      const v = verifyChain([e1, e2, e3], null);
      expect(v.result).toBe('COMPROMISED');
      expect(v.failure?.kind).toBe('prev_hash_mismatch');
      expect(v.failure?.sequence).toBe('2');
      expect(v.failure?.missingPredecessorHash).toBe(HEX_A);
      expect(v.verifiedPrefixLength).toBe(1); // only the (re-)genesis verified
      expect(v.terminalCount).toBe(1);
    });

    it('detects a tampered selfHash as COMPROMISED (self_hash_mismatch)', () => {
      const rows = validChain(2);
      const tampered = { ...rows[1], selfHash: 'b'.repeat(64) };
      const v = verifyChain([rows[0], tampered], null);
      expect(v.result).toBe('COMPROMISED');
      expect(v.failure?.kind).toBe('self_hash_mismatch');
    });

    it('classifies more than one terminal as AMBIGUOUS', () => {
      const e1 = makeEvent(1, GENESIS_PREV_HASH);
      const e1b = makeEvent(1, GENESIS_PREV_HASH, 'test', { id: 'evt-dup' });
      const v = verifyChain([e1, e1b], null);
      expect(v.terminalCount).toBe(2);
      expect(v.result).toBe('AMBIGUOUS');
    });
  });

  describe('computeVerificationDigest', () => {
    it('is deterministic for identical input', () => {
      const rows = validChain(3);
      const v = verifyChain(rows, headOf(rows));
      const d1 = computeVerificationDigest('test', rows, headOf(rows), v);
      const d2 = computeVerificationDigest('test', rows, headOf(rows), v);
      expect(d1.digest).toBe(d2.digest);
      expect(d1.digestAlgorithm).toBe('sha256');
      expect(d1.digestSchemaVersion).toBe(1);
      expect(d1.digest).toMatch(/^[a-f0-9]{64}$/);
    });

    it('changes when any event changes', () => {
      const rows = validChain(3);
      const v = verifyChain(rows, headOf(rows));
      const base = computeVerificationDigest('test', rows, headOf(rows), v).digest;
      const mutatedRows = validChain(3);
      const mv = verifyChain(mutatedRows, null); // different head (null) → different digest
      const other = computeVerificationDigest('test', mutatedRows, null, mv).digest;
      expect(other).not.toBe(base);
    });
  });

  describe('buildRecoveryPlanEntry', () => {
    it('a VERIFIED chain → REGISTER_ACTIVE, no recovery record', () => {
      const rows = validChain(3);
      const entry = buildRecoveryPlanEntry('lab:x', rows, headOf(rows));
      expect(entry.proposedG1Status).toBe('ACTIVE');
      expect(entry.action).toBe('REGISTER_ACTIVE');
      expect(entry.recoveryRecord).toBeNull();
      expect(entry.partition).toBe('lab:x');
    });

    it('a COMPROMISED chain → REGISTER_COMPROMISED_AND_ROLLOVER with an HONEST recovery record', () => {
      const e1 = makeEvent(1, GENESIS_PREV_HASH, 'system');
      const e2 = makeEvent(2, HEX_A, 'system');
      const e3 = makeEvent(3, e2.selfHash!, 'system');
      const entry = buildRecoveryPlanEntry('system', [e1, e2, e3], null);
      expect(entry.proposedG1Status).toBe('COMPROMISED');
      expect(entry.action).toBe('REGISTER_COMPROMISED_AND_ROLLOVER');
      const r = entry.recoveryRecord!;
      expect(r.previousGenerationChainId).toBe('system');
      expect(r.verificationResult).toBe('COMPROMISED');
      expect(r.failureReason).toBe('PREV_HASH_MISMATCH');
      expect(r.failureSequence).toBe('2');
      expect(r.missingPredecessorHash).toBe(HEX_A);
      // Never designates a "last good event" for a compromised chain.
      expect(r.terminalVerifiedSequence).toBeNull();
      expect(r.verificationDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(r.executionTimeFields).toEqual(
        expect.arrayContaining(['newGenerationId', 'newGenerationChainId', 'recoveredAt', 'authorizedBy']),
      );
    });
  });

  describe('buildRecoveryPlan', () => {
    it('summarizes mixed chains and sorts deterministically', () => {
      const healthy = validChain(2, 'lab:x');
      const e1 = makeEvent(1, GENESIS_PREV_HASH, 'system');
      const e2 = makeEvent(2, HEX_A, 'system');
      const plan = buildRecoveryPlan([
        { chainId: 'system', rows: [e1, e2], head: null },
        { chainId: 'lab:x', rows: healthy, head: headOf(healthy) },
      ]);
      expect(plan.summary.totalChains).toBe(2);
      expect(plan.summary.active).toBe(1);
      expect(plan.summary.compromised).toBe(1);
      expect(plan.summary.rolloversRequired).toBe(1);
      // sorted by chainId: lab:x before system
      expect(plan.chains.map((c) => c.chainId)).toEqual(['lab:x', 'system']);
      // identical rebuild → identical digests (determinism at the plan level)
      const again = buildRecoveryPlan([
        { chainId: 'lab:x', rows: healthy, head: headOf(healthy) },
        { chainId: 'system', rows: [e1, e2], head: null },
      ]);
      expect(again.chains.map((c) => c.verificationDigest.digest)).toEqual(
        plan.chains.map((c) => c.verificationDigest.digest),
      );
    });
  });
});
