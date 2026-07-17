/**
 * Program 1 · P1-3B — governed simulated-screening disposition: shared core (HARDENED).
 *
 * Pure, testable core for remediating the 75 conclusively-simulated AIScreeningResult
 * rows (P1-3A): HKDF-derived independent subkeys, AES-256-GCM evidence encryption,
 * HMAC-SHA-256-authenticated manifest, environment/DB/schema/commit binding, fail-closed
 * preconditions, and dependency-injected transactional cores. Nothing here reads env,
 * fs, or a database on import. NOT a Prisma migration; never in app startup/seed/migrations.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'crypto';

export const EVIDENCE_FORMAT_VERSION = 'ai-screening-disposition/v1';
export const EXPECTED_COUNT = 75;
export const EXPECTED_LABS = 2;
export const DISPOSITION_REASON =
  'Conclusively-simulated AI-screening output (Program 1 · P1-3). Non-clinical. Contained runtime; no downstream dependency.';

const HKDF_SALT = 'pathos/ai-screening-remediation/v1';
const INFO_EVIDENCE = 'pathos/ai-screening-remediation/evidence/v1';
const INFO_MANIFEST = 'pathos/ai-screening-remediation/manifest/v1';

export interface AiScreeningRow {
  id: string; labId: string; recordId: string; status: string;
  confidence: number | null; confidenceLevel: string | null; findings: unknown;
  primaryFinding: string | null; flaggedAreas: number; agreedWithAI: boolean | null; pathologistNote: string | null;
  processedAt: Date | string | null; reviewedAt: Date | string | null; reviewedById: string | null;
  createdAt: Date | string; updatedAt: Date | string;
}

export interface PrismaLike {
  aIScreeningResult: {
    findMany(args?: any): Promise<AiScreeningRow[]>;
    count(args?: any): Promise<number>;
    deleteMany(args: any): Promise<{ count: number }>;
    createMany(args: any): Promise<{ count: number }>;
  };
  labFeature: { count(args?: any): Promise<number> };
  $transaction<T>(fn: (tx: PrismaLike) => Promise<T>): Promise<T>;
}

// ── Canonicalisation & checksums ────────────────────────────────────────────
const iso = (v: Date | string | null): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString() : new Date(v).toISOString();

export function canonicalRow(r: AiScreeningRow): string {
  const o = {
    agreedWithAI: r.agreedWithAI ?? null, confidence: r.confidence ?? null, confidenceLevel: r.confidenceLevel ?? null,
    createdAt: iso(r.createdAt), findings: r.findings ?? null, flaggedAreas: r.flaggedAreas, id: r.id, labId: r.labId,
    pathologistNote: r.pathologistNote ?? null, primaryFinding: r.primaryFinding ?? null, processedAt: iso(r.processedAt),
    recordId: r.recordId, reviewedAt: iso(r.reviewedAt), reviewedById: r.reviewedById ?? null, status: r.status, updatedAt: iso(r.updatedAt),
  };
  return JSON.stringify(o, Object.keys(o).sort());
}
export const rowChecksum = (r: AiScreeningRow): string => createHash('sha256').update(canonicalRow(r)).digest('hex');
export function populationChecksum(rows: AiScreeningRow[]): string {
  return createHash('sha256').update(rows.map((r) => `${r.id}:${rowChecksum(r)}`).sort().join('\n')).digest('hex');
}
export const sortedIds = (rows: AiScreeningRow[]): string[] => rows.map((r) => r.id).sort();
export const distinctLabs = (rows: AiScreeningRow[]): string[] => [...new Set(rows.map((r) => r.labId))].sort();

// ── Simulated-signature validation (P1-3A rules) ────────────────────────────
const FIELD_REGION = /^Field \d+$/;
export function validateSimulatedRow(r: AiScreeningRow): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (r.status !== 'Completed') reasons.push(`status=${r.status} (expected Completed)`);
  if (r.confidence != null && (r.confidence < 0 || r.confidence > 100)) reasons.push('confidence out of 0..100');
  const f = r.findings;
  if (f != null) {
    if (!Array.isArray(f)) reasons.push('findings not an array');
    else for (const item of f as any[]) {
      if (!item || typeof item.region !== 'string' || !FIELD_REGION.test(item.region)) { reasons.push('findings region does not match synthetic "Field N" simulation pattern'); break; }
    }
  }
  return { ok: reasons.length === 0, reasons };
}
export function validatePopulation(rows: AiScreeningRow[], opts: { expectedCount: number; expectedLabs: number }) {
  const anomalies: { id: string; reasons: string[] }[] = [];
  for (const r of rows) { const v = validateSimulatedRow(r); if (!v.ok) anomalies.push({ id: r.id, reasons: v.reasons }); }
  const labs = distinctLabs(rows).length;
  return { ok: anomalies.length === 0 && rows.length === opts.expectedCount && labs === opts.expectedLabs, anomalies, count: rows.length, labs };
}

// ── Key derivation (HKDF-SHA-256 → independent subkeys) ──────────────────────
export interface DerivedKeys { encKey: Buffer; macKey: Buffer }
export function deriveKeys(masterHex: string): DerivedKeys {
  const ikm = Buffer.from(masterHex.trim(), 'hex');
  if (ikm.length !== 32) throw new Error('master key must be 32 bytes (64 hex chars) supplied via the approved secret channel');
  const salt = Buffer.from(HKDF_SALT);
  const encKey = Buffer.from(hkdfSync('sha256', ikm, salt, INFO_EVIDENCE, 32));
  const macKey = Buffer.from(hkdfSync('sha256', ikm, salt, INFO_MANIFEST, 32));
  return { encKey, macKey };
}

// ── Authenticated encryption (AES-256-GCM) — uses the derived encKey only ────
export interface EncryptedPackage { v: string; alg: 'aes-256-gcm'; iv: string; tag: string; ct: string }
export function encrypt(plaintext: string, encKey: Buffer): EncryptedPackage {
  if (encKey.length !== 32) throw new Error('encryption key must be a 32-byte derived key');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encKey, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { v: EVIDENCE_FORMAT_VERSION, alg: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ct: ct.toString('base64') };
}
export function decrypt(pkg: EncryptedPackage, encKey: Buffer): string {
  const d = createDecipheriv('aes-256-gcm', encKey, Buffer.from(pkg.iv, 'base64'));
  d.setAuthTag(Buffer.from(pkg.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(pkg.ct, 'base64')), d.final()]).toString('utf8');
}

// ── Evidence & manifest ─────────────────────────────────────────────────────
export interface EvidenceMeta {
  exportedAtUtc: string; environment: string; databaseId: string; databaseFingerprint: string; commitHash: string; schemaStateId: string;
}
export interface EvidencePackage extends EvidenceMeta {
  formatVersion: string; dispositionReason: string; contentsStatement: string; restoreInstructions: string;
  rowCount: number; labCount: number; targetIdManifest: string[]; rowChecksums: Record<string, string>; populationChecksum: string; rows: AiScreeningRow[];
}
export function buildEvidencePackage(rows: AiScreeningRow[], meta: EvidenceMeta): EvidencePackage {
  const rowChecksums: Record<string, string> = {}; for (const r of rows) rowChecksums[r.id] = rowChecksum(r);
  return {
    ...meta, formatVersion: EVIDENCE_FORMAT_VERSION, dispositionReason: DISPOSITION_REASON,
    contentsStatement: 'These records are conclusively SIMULATED, NON-CLINICAL AI-screening outputs. They were never real diagnostic inference.',
    restoreInstructions: 'Emergency rollback only: restore.ts --in <encrypted-evidence> --environment <env> --rollback-reference <ref> --execution-id <id> (requires the master key via the approved secret channel). Refuses if any target ID already exists.',
    rowCount: rows.length, labCount: distinctLabs(rows).length, targetIdManifest: sortedIds(rows), rowChecksums, populationChecksum: populationChecksum(rows), rows,
  };
}

/** Non-PHI operational manifest. HMAC-authenticated; ordinary checksum is diagnostic only. */
export interface Manifest {
  formatVersion: string; exportId: string; exportedAtUtc: string;
  environment: string; databaseFingerprint: string; commitHash: string; schemaStateId: string; // binding controls
  rowCount: number; labCount: number; labIds: string[]; targetIds: string[];
  rowChecksums: Record<string, string>; populationChecksum: string; evidencePackageChecksum: string;
  manifestChecksum?: string; // diagnostic (accidental corruption) only — NOT an authorization control
  manifestHmac?: string;     // HMAC-SHA-256 over the canonical manifest (authorization control)
}

function canonicalManifestForAuth(m: Manifest): string {
  const { manifestChecksum: _c, manifestHmac: _h, ...rest } = m;
  return JSON.stringify(rest, Object.keys(rest).sort());
}
export function manifestChecksum(m: Manifest): string {
  return createHash('sha256').update(canonicalManifestForAuth(m)).digest('hex');
}
export function hmacManifest(m: Manifest, macKey: Buffer): string {
  return createHmac('sha256', macKey).update(canonicalManifestForAuth(m)).digest('hex');
}
export function buildManifest(rows: AiScreeningRow[], meta: EvidenceMeta & { exportId: string; evidencePackageChecksum: string }, macKey: Buffer): Manifest {
  const rowChecksums: Record<string, string> = {}; for (const r of rows) rowChecksums[r.id] = rowChecksum(r);
  const m: Manifest = {
    formatVersion: EVIDENCE_FORMAT_VERSION, exportId: meta.exportId, exportedAtUtc: meta.exportedAtUtc,
    environment: meta.environment, databaseFingerprint: meta.databaseFingerprint, commitHash: meta.commitHash, schemaStateId: meta.schemaStateId,
    rowCount: rows.length, labCount: distinctLabs(rows).length, labIds: distinctLabs(rows), targetIds: sortedIds(rows),
    rowChecksums, populationChecksum: populationChecksum(rows), evidencePackageChecksum: meta.evidencePackageChecksum,
  };
  m.manifestChecksum = manifestChecksum(m);
  m.manifestHmac = hmacManifest(m, macKey);
  return m;
}
const ctEqualHex = (a?: string, b?: string): boolean => {
  if (!a || !b) return false; const x = Buffer.from(a, 'hex'); const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
};
export const verifyManifestSelfChecksum = (m: Manifest): boolean => ctEqualHex(m.manifestChecksum, manifestChecksum(m)); // diagnostic
export const verifyManifestHmac = (m: Manifest, macKey: Buffer): boolean => ctEqualHex(m.manifestHmac, hmacManifest(m, macKey));
/** Authorization control: throws unless the manifest HMAC authenticates under macKey. */
export function authenticateManifest(m: Manifest, macKey: Buffer): void {
  if (!m.manifestHmac) throw new Error('ABORT: manifest has no HMAC (not an authenticated authorization artifact)');
  if (!verifyManifestHmac(m, macKey)) throw new Error('ABORT: manifest HMAC authentication FAILED (tampered manifest or wrong key)');
}

// ── Environment / database / schema / commit binding ────────────────────────
export interface RuntimeBinding { environment: string; databaseFingerprint: string; schemaStateId: string; commitHash: string }
export function assertBinding(m: Manifest, runtime: RuntimeBinding, cliEnvironment: string): void {
  if (cliEnvironment !== m.environment) throw new Error(`ABORT: --environment ${cliEnvironment} !== manifest ${m.environment}`);
  if (runtime.environment !== m.environment) throw new Error(`ABORT: runtime environment ${runtime.environment} !== manifest ${m.environment}`);
  if (runtime.databaseFingerprint !== m.databaseFingerprint) throw new Error('ABORT: database fingerprint mismatch (manifest was exported from a different database)');
  if (runtime.schemaStateId !== m.schemaStateId) throw new Error(`ABORT: schema-state ${runtime.schemaStateId} !== manifest ${m.schemaStateId}`);
  if (runtime.commitHash !== m.commitHash) throw new Error(`ABORT: tooling commit ${runtime.commitHash} !== manifest ${m.commitHash} (re-export under the approved commit)`);
}

// ── Approval / execution metadata ───────────────────────────────────────────
export interface ExecutionMetadata { approvalReference: string; executionId: string }
export function assertExecutionMetadata(md: Partial<ExecutionMetadata>, kind: 'approval' | 'rollback'): ExecutionMetadata {
  const ref = (md.approvalReference ?? '').trim();
  const eid = (md.executionId ?? '').trim();
  if (!ref) throw new Error(`ABORT: --${kind}-reference is required and must be non-empty`);
  if (!eid) throw new Error('ABORT: --execution-id is required and must be non-empty');
  return { approvalReference: ref, executionId: eid };
}

// ── Fail-closed delete preconditions (in-transaction re-check) ──────────────
export interface DeletePreconditionInput { manifest: Manifest; liveRows: AiScreeningRow[]; containmentActive: boolean; expectedCount: number; expectedLabs: number }
export function assertDeletePreconditions(inp: DeletePreconditionInput): void {
  const { manifest, liveRows, containmentActive, expectedCount, expectedLabs } = inp;
  if (!containmentActive) throw new Error('ABORT: runtime containment is NOT active (AI_SCREENING is enabled for one or more labs)');
  if (manifest.rowCount !== expectedCount) throw new Error(`ABORT: manifest rowCount ${manifest.rowCount} !== expected ${expectedCount}`);
  if (manifest.labCount !== expectedLabs) throw new Error(`ABORT: manifest labCount ${manifest.labCount} !== expected ${expectedLabs}`);
  if (liveRows.length !== expectedCount) throw new Error(`ABORT: live rowCount ${liveRows.length} !== expected ${expectedCount} (drift)`);
  if (distinctLabs(liveRows).length !== expectedLabs) throw new Error(`ABORT: live labCount !== expected ${expectedLabs}`);
  const liveIds = sortedIds(liveRows); const manifestIds = [...manifest.targetIds].sort();
  if (liveIds.length !== manifestIds.length || liveIds.some((id, i) => id !== manifestIds[i])) throw new Error('ABORT: live target-ID set does not exactly match the manifest (drift)');
  for (const r of liveRows) {
    const expected = manifest.rowChecksums[r.id];
    if (!expected) throw new Error(`ABORT: live row ${r.id} is not in the manifest (unexpected extra row)`);
    if (rowChecksum(r) !== expected) throw new Error(`ABORT: live row ${r.id} checksum changed since export (modified target row)`);
    const v = validateSimulatedRow(r); if (!v.ok) throw new Error(`ABORT: live row ${r.id} no longer satisfies the simulated signature: ${v.reasons.join('; ')}`);
  }
  if (populationChecksum(liveRows) !== manifest.populationChecksum) throw new Error('ABORT: live population checksum does not match the manifest (drift)');
}

// ── Transactional cores (pre-transaction gate → transaction) ────────────────
export async function computeContainmentActive(p: PrismaLike): Promise<boolean> {
  return (await p.labFeature.count({ where: { featureKey: 'AI_SCREENING', isEnabled: true } })) === 0;
}
export interface DeletionResult { deleted: number; tableCountAfter: number }

export interface GovernedDeleteArgs {
  manifest: Manifest; macKey: Buffer; binding: RuntimeBinding; cliEnvironment: string;
  approval: Partial<ExecutionMetadata>; expectedCount: number; expectedLabs: number; confirmContained: boolean;
  select: unknown; onGate?: () => void;
}
/**
 * Fail-closed governed deletion. ALL of these pre-transaction gates pass BEFORE any
 * transaction opens: destructive-metadata → manifest HMAC → binding → (containment via a
 * read). Only then does the transaction re-read + re-assert + delete + verify.
 */
export async function executeTargetedDeletion(prisma: PrismaLike, args: GovernedDeleteArgs): Promise<DeletionResult> {
  if (!args.confirmContained) throw new Error('ABORT: --confirm-contained is required.');
  assertExecutionMetadata(args.approval, 'approval');
  authenticateManifest(args.manifest, args.macKey);        // HMAC before anything touches the DB
  assertBinding(args.manifest, args.binding, args.cliEnvironment);
  const containedPre = await computeContainmentActive(prisma);
  if (!containedPre) throw new Error('ABORT: containment inactive (pre-transaction gate)');
  args.onGate?.(); // test seam: all pre-transaction gates passed
  return prisma.$transaction(async (tx) => {
    const liveRows = await tx.aIScreeningResult.findMany({ select: args.select as any, orderBy: { id: 'asc' } });
    const contained = await computeContainmentActive(tx);
    assertDeletePreconditions({ manifest: args.manifest, liveRows, containmentActive: contained, expectedCount: args.expectedCount, expectedLabs: args.expectedLabs });
    const ids = sortedIds(liveRows);
    const del = await tx.aIScreeningResult.deleteMany({ where: { id: { in: ids } } });
    if (del.count !== args.expectedCount) throw new Error(`ABORT: deleted ${del.count} !== expected ${args.expectedCount} (rolling back)`);
    const remaining = await tx.aIScreeningResult.count({ where: { id: { in: ids } } });
    if (remaining !== 0) throw new Error(`ABORT: ${remaining} manifest IDs still present after delete (rolling back)`);
    const tableCountAfter = await tx.aIScreeningResult.count();
    return { deleted: del.count, tableCountAfter };
  });
}

export async function executeRestore(prisma: PrismaLike, args: { rows: AiScreeningRow[]; expectedCount: number; toCreate: (r: AiScreeningRow) => unknown; approval: Partial<ExecutionMetadata> }): Promise<number> {
  assertExecutionMetadata(args.approval, 'rollback');
  const ids = args.rows.map((r) => r.id);
  const existing = await prisma.aIScreeningResult.count({ where: { id: { in: ids } } });
  if (existing > 0) throw new Error(`ABORT: ${existing} target IDs already exist — refusing partial/duplicate restore`);
  return prisma.$transaction(async (tx) => {
    const res = await tx.aIScreeningResult.createMany({ data: args.rows.map(args.toCreate) as any, skipDuplicates: false });
    if (res.count !== args.expectedCount) throw new Error(`ABORT: inserted ${res.count} !== ${args.expectedCount} (rolling back)`);
    const present = await tx.aIScreeningResult.count({ where: { id: { in: ids } } });
    if (present !== args.expectedCount) throw new Error(`ABORT: only ${present} present after insert (rolling back)`);
    return res.count;
  });
}

// ── Non-PHI execution receipt (testable) ────────────────────────────────────
export interface ReceiptInput {
  action: 'delete' | 'restore'; executionId: string; approvalReference: string;
  startedAtUtc: string; completedAtUtc: string; environment: string; databaseFingerprint: string;
  toolingCommit: string; schemaStateId: string; manifestHmacStatus: string; manifestChecksumStatus: string;
  evidencePackageChecksum: string; manifestChecksum?: string; preconditionResults: string;
  preOperationCount: number; affectedRowCount: number; postOperationCount: number;
  containmentVerified: boolean; result: 'SUCCESS' | 'FAILURE'; failureReason?: string;
}
/** Build the non-PHI receipt. NEVER includes target IDs, row payloads, credentials, or keys. */
export function buildReceipt(i: ReceiptInput): Record<string, unknown> {
  return {
    operation: `ai-screening-disposition-${i.action}`,
    executionId: i.executionId,
    approvalReference: i.approvalReference,
    approvalNote: 'Reference recorded as CLAIMED authorization; organizational approval remains an external governance responsibility.',
    actionType: i.action,
    startedAtUtc: i.startedAtUtc, completedAtUtc: i.completedAtUtc,
    environment: i.environment, databaseFingerprint: i.databaseFingerprint, toolingCommit: i.toolingCommit, schemaStateId: i.schemaStateId,
    manifestHmacStatus: i.manifestHmacStatus, manifestChecksumStatus: i.manifestChecksumStatus,
    evidencePackageChecksum: i.evidencePackageChecksum, manifestChecksum: i.manifestChecksum,
    preconditionResults: i.preconditionResults,
    preOperationCount: i.preOperationCount, affectedRowCount: i.affectedRowCount, postOperationCount: i.postOperationCount,
    containmentVerified: i.containmentVerified, result: i.result, failureReason: i.failureReason,
  };
}

// ── CLI flag parsing (fail-closed, non-interactive) ─────────────────────────
export interface DestructiveFlags {
  execute: boolean; environment?: string; expectedCount: number; expectedLabs: number; confirmContained: boolean;
  manifestPath?: string; inPath?: string; outPath?: string; receiptPath?: string;
  approvalReference?: string; rollbackReference?: string; executionId?: string;
}
export function parseFlags(argv: string[]): DestructiveFlags {
  const get = (n: string): string | undefined => { const i = argv.indexOf(`--${n}`); return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined; };
  const has = (n: string): boolean => argv.includes(`--${n}`);
  return {
    execute: has('execute-destructive-disposition'), environment: get('environment'),
    expectedCount: Number(get('expected-count') ?? EXPECTED_COUNT), expectedLabs: Number(get('expected-labs') ?? EXPECTED_LABS),
    confirmContained: has('confirm-contained'), manifestPath: get('manifest'), inPath: get('in'), outPath: get('out'), receiptPath: get('receipt'),
    approvalReference: get('approval-reference'), rollbackReference: get('rollback-reference'), executionId: get('execution-id'),
  };
}
