import {
  validateSimulatedRow, validatePopulation, rowChecksum, populationChecksum,
  deriveKeys, encrypt, decrypt, buildEvidencePackage, buildManifest, manifestChecksum,
  authenticateManifest, verifyManifestHmac, verifyManifestSelfChecksum, assertBinding, assertExecutionMetadata,
  assertDeletePreconditions, executeTargetedDeletion, executeRestore, buildReceipt, parseFlags,
  type AiScreeningRow, type Manifest, type PrismaLike,
} from './shared';
import { assertOutsideRepo } from './runtime';
// Type-check the CLI entrypoints (importing does NOT connect to a DB).
import { main as discoverMain } from './discover';
import { main as exportMain } from './export';
import { main as deleteMain } from './delete';
import { main as restoreMain } from './restore';

/** Program 1 · P1-3B — HARDENED remediation tooling safety tests (mock transactional seam; no DB, no live data). */
const MASTER = 'a'.repeat(64);
const WRONG_MASTER = 'b'.repeat(64);
const { encKey, macKey } = deriveKeys(MASTER);
const META = { exportedAtUtc: '2026-07-16T00:00:00.000Z', environment: 'production', databaseId: 'h:5432/db', databaseFingerprint: 'dbfp-1', commitHash: 'deadbeef', schemaStateId: 'mig-9' };
const BINDING = { environment: 'production', databaseFingerprint: 'dbfp-1', schemaStateId: 'mig-9', commitHash: 'deadbeef' };
const APPROVAL = { approvalReference: 'COMPLIANCE-123', executionId: 'exec-001' };
const OPTS = { expectedCount: 3, expectedLabs: 2 };

function makeRow(i: number, over: Partial<AiScreeningRow> = {}): AiScreeningRow {
  return {
    id: `row-${i}`, labId: i % 2 === 0 ? 'lab-A' : 'lab-B', recordId: `rec-${i}`, status: 'Completed',
    confidence: 80 + i, confidenceLevel: 'High', findings: [{ region: 'Field 1', finding: 'NILM', confidence: 82 }],
    primaryFinding: 'NILM', flaggedAreas: 1, agreedWithAI: null, pathologistNote: null,
    processedAt: '2026-07-01T00:00:02.000Z', reviewedAt: null, reviewedById: null,
    createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z', ...over,
  };
}
const POP = [makeRow(0), makeRow(1), makeRow(2)];
const makeManifest = (rows: AiScreeningRow[]): Manifest => buildManifest(rows, { ...META, exportId: 'exp1', evidencePackageChecksum: 'pkgsum' }, macKey);

function mockPrisma(initial: AiScreeningRow[], enabledAiScreening = 0) {
  let table = initial.map((r) => ({ ...r }));
  let txOpened = 0;
  const api: PrismaLike = {
    aIScreeningResult: {
      findMany: async () => [...table].sort((a, b) => (a.id < b.id ? -1 : 1)),
      count: async (args?: any) => (args?.where?.id?.in ? table.filter((r) => args.where.id.in.includes(r.id)).length : table.length),
      deleteMany: async (args: any) => { const ids: string[] = args.where.id.in; const before = table.length; table = table.filter((r) => !ids.includes(r.id)); return { count: before - table.length }; },
      createMany: async (args: any) => { table.push(...args.data); return { count: args.data.length }; },
    },
    labFeature: { count: async () => enabledAiScreening },
    $transaction: async (fn) => { txOpened++; const snap = [...table]; try { return await fn(api); } catch (e) { table = snap; throw e; } },
  };
  return { api, table: () => table, txOpened: () => txOpened };
}
const govArgs = (over: Partial<Parameters<typeof executeTargetedDeletion>[1]> = {}) => ({
  manifest: makeManifest(POP), macKey, binding: BINDING, cliEnvironment: 'production', approval: APPROVAL,
  ...OPTS, confirmContained: true, select: {}, ...over,
});

describe('simulated-signature validation', () => {
  it('accepts Field-N; rejects non-Completed and real-inference region shape', () => {
    expect(validateSimulatedRow(makeRow(0)).ok).toBe(true);
    expect(validateSimulatedRow(makeRow(0, { status: 'Pending' })).ok).toBe(false);
    expect(validateSimulatedRow(makeRow(0, { findings: [{ region: 'x:120,y:44', finding: 'HSIL', confidence: 96 }] })).ok).toBe(false);
  });
  it('validatePopulation surfaces anomaly IDs only (no PHI)', () => {
    const bad = validatePopulation([makeRow(0, { status: 'Pending' }), makeRow(1), makeRow(2)], OPTS);
    expect(bad.ok).toBe(false); expect(bad.anomalies[0].id).toBe('row-0'); expect(JSON.stringify(bad)).not.toContain('rec-');
  });
});

describe('HKDF key derivation & AES-256-GCM', () => {
  it('derives INDEPENDENT encryption and manifest keys', () => {
    const { encKey: e, macKey: m } = deriveKeys(MASTER);
    expect(e.equals(m)).toBe(false);
    expect(deriveKeys(MASTER).encKey.equals(e)).toBe(true); // deterministic
    expect(deriveKeys(WRONG_MASTER).encKey.equals(e)).toBe(false);
  });
  it('round-trips and detects tampering / wrong key', () => {
    const pkg = encrypt('secret-evidence', encKey);
    expect(decrypt(pkg, encKey)).toBe('secret-evidence');
    expect(() => decrypt({ ...pkg, ct: Buffer.from('zzzz').toString('base64') } as any, encKey)).toThrow();
    expect(() => decrypt(pkg, deriveKeys(WRONG_MASTER).encKey)).toThrow();
  });
  it('rejects a non-32-byte master', () => { expect(() => deriveKeys('ab')).toThrow(/32 bytes/); });
});

describe('manifest HMAC authentication (authorization control)', () => {
  it('authenticates a well-formed manifest', () => { expect(() => authenticateManifest(makeManifest(POP), macKey)).not.toThrow(); });
  it('FAILS HMAC when content is altered even if the ordinary checksum is recomputed', () => {
    const m = makeManifest(POP);
    const forged: Manifest = { ...m, rowCount: 2, targetIds: ['row-0', 'row-1'] }; // attacker changes the target set
    forged.manifestChecksum = manifestChecksum(forged); // and recomputes the plain checksum
    expect(verifyManifestSelfChecksum(forged)).toBe(true); // ordinary checksum now "valid"
    expect(verifyManifestHmac(forged, macKey)).toBe(false); // but HMAC does not authenticate
    expect(() => authenticateManifest(forged, macKey)).toThrow(/HMAC/);
  });
  it('FAILS when the HMAC field itself is altered', () => {
    const m = makeManifest(POP); const t = { ...m, manifestHmac: 'deadbeef' };
    expect(() => authenticateManifest(t as any, macKey)).toThrow(/HMAC/);
  });
  it('FAILS under the wrong master key', () => { expect(() => authenticateManifest(makeManifest(POP), deriveKeys(WRONG_MASTER).macKey)).toThrow(/HMAC/); });
  it('FAILS when the HMAC is missing entirely', () => { const { manifestHmac, ...m } = makeManifest(POP); expect(() => authenticateManifest(m as any, macKey)).toThrow(/no HMAC/); });
});

describe('environment / database / schema / commit binding', () => {
  const m = makeManifest(POP);
  it('passes for a matching runtime', () => { expect(() => assertBinding(m, BINDING, 'production')).not.toThrow(); });
  it('fails on CLI environment mismatch', () => { expect(() => assertBinding(m, BINDING, 'staging')).toThrow(/environment/); });
  it('fails on runtime environment mismatch', () => { expect(() => assertBinding(m, { ...BINDING, environment: 'staging' }, 'production')).toThrow(/runtime environment/); });
  it('fails on database-fingerprint mismatch (copied manifest, different DB)', () => { expect(() => assertBinding(m, { ...BINDING, databaseFingerprint: 'other' }, 'production')).toThrow(/database fingerprint/); });
  it('fails on schema-state mismatch', () => { expect(() => assertBinding(m, { ...BINDING, schemaStateId: 'mig-10' }, 'production')).toThrow(/schema-state/); });
  it('fails on tooling-commit mismatch', () => { expect(() => assertBinding(m, { ...BINDING, commitHash: 'cafe' }, 'production')).toThrow(/tooling commit/); });
});

describe('approval / execution metadata', () => {
  it('requires a non-empty approval reference and execution id', () => {
    expect(() => assertExecutionMetadata({ approvalReference: '', executionId: 'x' }, 'approval')).toThrow(/approval-reference/);
    expect(() => assertExecutionMetadata({ approvalReference: '   ', executionId: 'x' }, 'approval')).toThrow(/approval-reference/);
    expect(() => assertExecutionMetadata({ approvalReference: 'r', executionId: '' }, 'approval')).toThrow(/execution-id/);
    expect(assertExecutionMetadata({ approvalReference: ' r ', executionId: ' e ' }, 'approval')).toEqual({ approvalReference: 'r', executionId: 'e' });
  });
});

describe('assertDeletePreconditions (in-transaction re-check)', () => {
  const base = { manifest: makeManifest(POP), liveRows: POP, containmentActive: true, expectedCount: 3, expectedLabs: 2 };
  it('passes for the exact verified population', () => { expect(() => assertDeletePreconditions(base)).not.toThrow(); });
  it('fails on inactive containment / wrong count / wrong labs', () => {
    expect(() => assertDeletePreconditions({ ...base, containmentActive: false })).toThrow(/containment/);
    expect(() => assertDeletePreconditions({ ...base, liveRows: POP.slice(0, 2) })).toThrow(/rowCount/);
    expect(() => assertDeletePreconditions({ ...base, expectedLabs: 3 })).toThrow(/labCount/);
  });
  it('fails on modified / missing / additional / de-simulated rows', () => {
    expect(() => assertDeletePreconditions({ ...base, liveRows: [makeRow(0, { confidence: 999 }), makeRow(1), makeRow(2)] })).toThrow();
    expect(() => assertDeletePreconditions({ ...base, liveRows: [makeRow(0), makeRow(1), makeRow(9)] })).toThrow();
    expect(() => assertDeletePreconditions({ ...base, liveRows: [...POP, makeRow(3)] })).toThrow();
    expect(() => assertDeletePreconditions({ ...base, liveRows: [makeRow(0, { findings: [{ region: 'x1', finding: 'HSIL', confidence: 96 }] }), makeRow(1), makeRow(2)] })).toThrow();
  });
});

describe('executeTargetedDeletion — gates open no transaction until they pass', () => {
  it('deletes exactly the verified population', async () => {
    const { api, table, txOpened } = mockPrisma(POP);
    const res = await executeTargetedDeletion(api, govArgs());
    expect(res.deleted).toBe(3); expect(res.tableCountAfter).toBe(0); expect(table()).toHaveLength(0); expect(txOpened()).toBe(1);
  });
  it('opens NO transaction when the manifest HMAC fails', async () => {
    const { api, table, txOpened } = mockPrisma(POP);
    await expect(executeTargetedDeletion(api, govArgs({ macKey: deriveKeys(WRONG_MASTER).macKey }))).rejects.toThrow(/HMAC/);
    expect(txOpened()).toBe(0); expect(table()).toHaveLength(3);
  });
  it('opens NO transaction on binding mismatch', async () => {
    const { api, txOpened } = mockPrisma(POP);
    await expect(executeTargetedDeletion(api, govArgs({ binding: { ...BINDING, databaseFingerprint: 'other' } }))).rejects.toThrow(/database fingerprint/);
    expect(txOpened()).toBe(0);
  });
  it('opens NO transaction when approval metadata is missing', async () => {
    const { api, txOpened } = mockPrisma(POP);
    await expect(executeTargetedDeletion(api, govArgs({ approval: { approvalReference: '', executionId: '' } }))).rejects.toThrow(/approval-reference/);
    expect(txOpened()).toBe(0);
  });
  it('requires --confirm-contained', async () => {
    const { api, txOpened } = mockPrisma(POP);
    await expect(executeTargetedDeletion(api, govArgs({ confirmContained: false }))).rejects.toThrow(/confirm-contained/);
    expect(txOpened()).toBe(0);
  });
  it('rolls back (deletes nothing) on live drift', async () => {
    const { api, table } = mockPrisma([...POP, makeRow(3)]);
    await expect(executeTargetedDeletion(api, govArgs())).rejects.toThrow();
    expect(table()).toHaveLength(4);
  });
  it('fails at the pre-transaction containment gate when AI_SCREENING is enabled', async () => {
    const { api, txOpened } = mockPrisma(POP, 1);
    await expect(executeTargetedDeletion(api, govArgs())).rejects.toThrow(/containment/);
    expect(txOpened()).toBe(0);
  });
});

describe('executeRestore (all-or-nothing)', () => {
  const toCreate = (r: AiScreeningRow) => ({ ...r });
  it('requires rollback reference + execution id', async () => {
    const { api } = mockPrisma([]);
    await expect(executeRestore(api, { rows: POP, expectedCount: 3, toCreate, approval: { approvalReference: '', executionId: 'e' } })).rejects.toThrow(/rollback-reference/);
  });
  it('restores the exact population into an empty table', async () => {
    const { api, table } = mockPrisma([]);
    expect(await executeRestore(api, { rows: POP, expectedCount: 3, toCreate, approval: { approvalReference: 'RB-1', executionId: 'e1' } })).toBe(3);
    expect(table()).toHaveLength(3);
  });
  it('refuses restoration if any target ID already exists', async () => {
    const { api, table } = mockPrisma([makeRow(0)]);
    await expect(executeRestore(api, { rows: POP, expectedCount: 3, toCreate, approval: { approvalReference: 'RB-1', executionId: 'e1' } })).rejects.toThrow(/already exist/);
    expect(table()).toHaveLength(1);
  });
});

describe('receipt', () => {
  it('includes approval reference + execution id and EXCLUDES target IDs / row payloads', () => {
    const r = buildReceipt({
      action: 'delete', executionId: 'exec-001', approvalReference: 'COMPLIANCE-123',
      startedAtUtc: 'a', completedAtUtc: 'b', environment: 'production', databaseFingerprint: 'dbfp-1', toolingCommit: 'deadbeef', schemaStateId: 'mig-9',
      manifestHmacStatus: 'AUTHENTICATED', manifestChecksumStatus: 'ok', evidencePackageChecksum: 'x', manifestChecksum: 'y',
      preconditionResults: 'PASS', preOperationCount: 75, affectedRowCount: 75, postOperationCount: 0, containmentVerified: true, result: 'SUCCESS',
    });
    const json = JSON.stringify(r);
    expect(r.executionId).toBe('exec-001'); expect(r.approvalReference).toBe('COMPLIANCE-123');
    expect(json).not.toContain('row-'); expect(json).not.toContain('rec-'); expect(json).not.toContain('findings');
    expect(json).not.toContain('targetIds'); expect(json.toLowerCase()).not.toContain('key');
  });
});

describe('CLI flags, repo-write guard, entrypoints', () => {
  it('defaults to dry-run; recognises destructive flag + metadata flags', () => {
    expect(parseFlags(['--manifest', 'm']).execute).toBe(false);
    const f = parseFlags(['--execute-destructive-disposition', '--approval-reference', 'R', '--execution-id', 'E', '--rollback-reference', 'RB']);
    expect(f.execute).toBe(true); expect(f.approvalReference).toBe('R'); expect(f.executionId).toBe('E'); expect(f.rollbackReference).toBe('RB');
  });
  it('refuses to write evidence inside the repository', () => {
    expect(() => assertOutsideRepo('apps/api/scripts/remediation/ai-screening/evi.enc')).toThrow(/inside the repository/);
    expect(() => assertOutsideRepo('/tmp/secure/evi.enc')).not.toThrow();
  });
  it('all four CLI commands expose a main()', () => { for (const m of [discoverMain, exportMain, deleteMain, restoreMain]) expect(typeof m).toBe('function'); });
});
