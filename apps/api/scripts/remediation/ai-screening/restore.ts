/**
 * Program 1 · P1-3B — restore.ts (emergency rollback ONLY; not a product workflow).
 *
 * DRY-RUN by default. A real restore requires:
 *   --execute-destructive-disposition --in <encrypted-evidence> --environment <env>
 *   --rollback-reference <ref> --execution-id <id>
 * and AISCREENING_REMEDIATION_KEY. It authenticates + checksum-verifies the evidence
 * (GCM tag detects tampering), refuses if ANY target ID already exists, and inserts exact
 * IDs+values in one transaction (all-or-nothing).
 */
import { getPrisma, deriveEnvKeys, readFileSync } from './runtime';
import { parseFlags, decrypt, populationChecksum, rowChecksum, executeRestore, assertExecutionMetadata, EXPECTED_COUNT, type EvidencePackage, type EncryptedPackage, type AiScreeningRow } from './shared';

const toDate = (v: string | Date | null): Date | null => (v == null ? null : new Date(v));
function toCreate(r: AiScreeningRow) {
  return {
    id: r.id, labId: r.labId, recordId: r.recordId, status: r.status as any, confidence: r.confidence, confidenceLevel: r.confidenceLevel as any,
    findings: r.findings as any, primaryFinding: r.primaryFinding, flaggedAreas: r.flaggedAreas, agreedWithAI: r.agreedWithAI,
    pathologistNote: r.pathologistNote, processedAt: toDate(r.processedAt), reviewedAt: toDate(r.reviewedAt), reviewedById: r.reviewedById,
    createdAt: toDate(r.createdAt)!, updatedAt: toDate(r.updatedAt)!,
  };
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const flags = parseFlags(argv);
  if (!flags.inPath) { console.error('FAIL: --in <encrypted-evidence> is required.'); return 1; }
  if (!flags.environment) { console.error('FAIL: --environment is required.'); return 1; }
  // Rollback authorization metadata is mandatory (records the CLAIMED authorization).
  let approval: { approvalReference: string; executionId: string };
  try { approval = assertExecutionMetadata({ approvalReference: flags.rollbackReference, executionId: flags.executionId }, 'rollback'); }
  catch (e: any) { console.error(e?.message ?? e); return 1; }

  let evidence: EvidencePackage;
  try {
    const { encKey } = deriveEnvKeys();
    const pkg: EncryptedPackage = JSON.parse(readFileSync(flags.inPath, 'utf8'));
    evidence = JSON.parse(decrypt(pkg, encKey)); // GCM auth failure here = tampered/wrong key
  } catch (e: any) { console.error('FAIL: could not authenticate/decrypt evidence (tampered, corrupt, or wrong key):', e?.message ?? e); return 2; }

  for (const r of evidence.rows) if (evidence.rowChecksums[r.id] !== rowChecksum(r)) { console.error(`FAIL: row ${r.id} checksum mismatch in evidence.`); return 2; }
  if (populationChecksum(evidence.rows) !== evidence.populationChecksum) { console.error('FAIL: population checksum mismatch in evidence.'); return 2; }
  if (evidence.rowCount !== evidence.rows.length) { console.error('FAIL: rowCount mismatch in evidence.'); return 2; }

  const prisma = getPrisma();
  try {
    const ids = evidence.rows.map((r) => r.id);
    const existing = await prisma.aIScreeningResult.count({ where: { id: { in: ids } } });
    if (existing > 0) { console.error(`FAIL: ${existing} of ${ids.length} target IDs already exist — refusing partial/duplicate restore.`); return 1; }
    if (!flags.execute) {
      console.log(`DRY-RUN: evidence authenticated (${evidence.rowCount} rows, checksums OK); 0 target IDs currently present. WOULD restore all-or-nothing. Nothing written. executionId=${approval.executionId}`);
      return 0;
    }
    const restored = await executeRestore(prisma as any, { rows: evidence.rows, expectedCount: evidence.rowCount, toCreate, approval });
    console.log(`RESTORED ${restored} rows (expected ${EXPECTED_COUNT}). rollbackReference=${approval.approvalReference} executionId=${approval.executionId}. Verify checksums against the manifest.`);
    return 0;
  } catch (e: any) {
    console.error('RESTORE ABORTED (rolled back):', e?.message ?? e);
    return 2;
  } finally {
    await (prisma as any).$disconnect?.();
  }
}

if (require.main === module) {
  main().then((c) => process.exit(c)).catch((e) => { console.error(e?.message ?? e); process.exit(3); });
}
