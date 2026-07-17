/**
 * Program 1 · P1-3B — delete.ts (destructive; fail-closed, HARDENED).
 *
 * DRY-RUN by default. A real deletion requires ALL of:
 *   --execute-destructive-disposition --manifest <path> --environment <env>
 *   --confirm-contained --approval-reference <ref> --execution-id <id>
 *   [--expected-count 75 --expected-labs 2] [--receipt <external>]
 * and AISCREENING_REMEDIATION_KEY (master → HKDF subkeys).
 *
 * NO transaction opens until every pre-transaction gate passes: destructive flag,
 * approval reference + execution id, key derivation, manifest parse, manifest HMAC,
 * environment/DB/schema/commit binding, and containment. Deletion is exact-ID targeted
 * and transactional; any drift/mismatch rolls back. Never TRUNCATE/unbounded/cascade.
 */
import { getPrisma, RESULT_SELECT_ALL, computeReceiptDest, writeReceipt, readFileSync, runtimeBinding, deriveEnvKeys, gitCommit, schemaStateId, databaseFingerprint, currentEnvironment } from './runtime';
import {
  parseFlags, assertDeletePreconditions, authenticateManifest, assertBinding, assertExecutionMetadata,
  verifyManifestHmac, verifyManifestSelfChecksum, computeContainmentActive, executeTargetedDeletion, buildReceipt,
  EXPECTED_COUNT, EXPECTED_LABS, type Manifest,
} from './shared';

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const flags = parseFlags(argv);
  const expectedCount = flags.expectedCount || EXPECTED_COUNT;
  const expectedLabs = flags.expectedLabs || EXPECTED_LABS;
  const startedAt = new Date().toISOString();
  let executionId = (flags.executionId ?? '').trim();

  try {
    if (!flags.manifestPath) throw new Error('FAIL: --manifest <path> is required.');
    if (!flags.environment) throw new Error('FAIL: --environment is required.');
    // Execution metadata is mandatory (records the CLAIMED authorization; not proof of validity).
    const approval = assertExecutionMetadata({ approvalReference: flags.approvalReference, executionId: flags.executionId }, 'approval');
    executionId = approval.executionId;

    const manifest: Manifest = JSON.parse(readFileSync(flags.manifestPath, 'utf8'));
    const { macKey } = deriveEnvKeys();                 // requires the master key
    authenticateManifest(manifest, macKey);            // HMAC authorization control — BEFORE any DB access
    const binding = runtimeBinding();
    assertBinding(manifest, binding, flags.environment); // env/db/schema/commit binding — BEFORE any DB access

    const prisma = getPrisma();
    try {
      if (!flags.execute) {
        if (!flags.confirmContained) console.error('NOTE: --confirm-contained will be required to execute.');
        const liveRows = (await prisma.aIScreeningResult.findMany({ select: RESULT_SELECT_ALL, orderBy: { id: 'asc' } })) as any;
        const contained = await computeContainmentActive(prisma as any);
        assertDeletePreconditions({ manifest, liveRows, containmentActive: contained, expectedCount, expectedLabs });
        console.log(`DRY-RUN: manifest AUTHENTICATED (HMAC ok), binding ok, all preconditions PASS. WOULD delete ${liveRows.length} rows. Nothing deleted.`);
        console.log('To execute: add --execute-destructive-disposition --confirm-contained (requires compliance/data-owner approval).');
        return 0;
      }

      const result = await executeTargetedDeletion(prisma as any, {
        manifest, macKey, binding, cliEnvironment: flags.environment, approval,
        expectedCount, expectedLabs, confirmContained: flags.confirmContained, select: RESULT_SELECT_ALL,
      });

      emitReceipt(flags, {
        action: 'delete', executionId, approvalReference: approval.approvalReference, result: 'SUCCESS',
        startedAt, manifest, preCount: expectedCount, affected: result.deleted, postCount: result.tableCountAfter,
        containmentVerified: true, macKey,
      });
      console.log(`DELETED ${result.deleted} rows. Manifest IDs absent; table now has ${result.tableCountAfter} row(s). executionId=${executionId}`);
      console.log('NOTE: this receipt does not replace an organizational audit or compliance process.');
      return 0;
    } finally {
      await (prisma as any).$disconnect?.();
    }
  } catch (e: any) {
    console.error('DELETE ABORTED (rolled back / no mutation):', e?.message ?? e);
    // Best-effort failure receipt (only if we captured an execution id and a destination; never PHI/keys).
    if (executionId && flags.receiptPath) {
      try {
        writeReceipt(flags.receiptPath, {
          operation: 'ai-screening-disposition-delete', executionId, approvalReference: (flags.approvalReference ?? '').trim() || '(missing)',
          environment: currentEnvironment(), databaseFingerprint: databaseFingerprint(), commitHash: gitCommit(), schemaStateId: schemaStateId(),
          startedAtUtc: startedAt, completedAtUtc: new Date().toISOString(), result: 'FAILURE', failureReason: String(e?.message ?? e),
        });
      } catch { /* ignore receipt-write failure */ }
    }
    return 2;
  }
}

function emitReceipt(
  flags: ReturnType<typeof parseFlags>,
  a: { action: string; executionId: string; approvalReference: string; result: string; startedAt: string; manifest: Manifest; preCount: number; affected: number; postCount: number; containmentVerified: boolean; macKey: Buffer },
): void {
  const rec = buildReceipt({
    action: 'delete', executionId: a.executionId, approvalReference: a.approvalReference,
    startedAtUtc: a.startedAt, completedAtUtc: new Date().toISOString(),
    environment: currentEnvironment(), databaseFingerprint: databaseFingerprint(), toolingCommit: gitCommit(), schemaStateId: schemaStateId(),
    manifestHmacStatus: verifyManifestHmac(a.manifest, a.macKey) ? 'AUTHENTICATED' : 'INVALID',
    manifestChecksumStatus: verifyManifestSelfChecksum(a.manifest) ? 'ok' : 'mismatch',
    evidencePackageChecksum: a.manifest.evidencePackageChecksum, manifestChecksum: a.manifest.manifestChecksum,
    preconditionResults: 'PASS', preOperationCount: a.preCount, affectedRowCount: a.affected, postOperationCount: a.postCount,
    containmentVerified: a.containmentVerified, result: a.result as 'SUCCESS' | 'FAILURE',
  });
  const dest = computeReceiptDest(flags.receiptPath);
  if (dest) writeReceipt(dest, rec); else console.log('RECEIPT:', JSON.stringify(rec, null, 2));
}

if (require.main === module) {
  main().then((c) => process.exit(c)).catch((e) => { console.error(e?.message ?? e); process.exit(3); });
}
