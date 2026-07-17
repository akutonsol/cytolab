/**
 * Program 1 · P1-3B — export.ts.
 *
 * Builds a verified, AES-256-GCM-encrypted evidence package of all target rows plus a
 * SEPARATE non-PHI operational manifest. DRY-RUN by default: with no --out it validates
 * and prints the plan and writes nothing. A real export requires an explicit external
 * --out destination (rejected if inside the repo), --environment, and the encryption key
 * via AISCREENING_REMEDIATION_KEY. Writes atomically (temp -> verify decrypt+checksum ->
 * rename). Never writes plaintext evidence.
 *
 * Usage (dry-run):  ts-node export.ts --environment production
 * Usage (real):     ts-node export.ts --environment production --out /secure/evi.enc --manifest /secure/manifest.json
 */
import { writeFileSync } from 'fs';
import { getPrisma, RESULT_SELECT_ALL, containmentActive, gitCommit, schemaStateId, databaseId, databaseFingerprint, deriveEnvKeys, atomicWriteJsonEncrypted, assertOutsideRepo, fileSha256 } from './runtime';
import {
  parseFlags, validatePopulation, buildEvidencePackage, buildManifest, encrypt, decrypt,
  populationChecksum, EXPECTED_COUNT, EXPECTED_LABS, EVIDENCE_FORMAT_VERSION,
} from './shared';
import { createHash } from 'crypto';

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const flags = parseFlags(argv);
  const expectedCount = flags.expectedCount || EXPECTED_COUNT;
  const expectedLabs = flags.expectedLabs || EXPECTED_LABS;
  if (!flags.environment) { console.error('FAIL: --environment is required.'); return 1; }
  const prisma = getPrisma();
  try {
    const rows = (await prisma.aIScreeningResult.findMany({ select: RESULT_SELECT_ALL, orderBy: { id: 'asc' } })) as any;
    const contained = await containmentActive(prisma);
    const v = validatePopulation(rows, { expectedCount, expectedLabs });
    if (!contained) { console.error('FAIL: containment not active.'); return 2; }
    if (!v.ok) { console.error('FAIL: population is not an approved simulated deletion target (run discover.ts).'); return 1; }

    const dryRun = !flags.outPath;
    console.log(`── EXPORT ${dryRun ? '(DRY-RUN — no files written)' : ''} ──`);
    console.log('rows/labs          :', v.count, '/', v.labs);
    console.log('populationChecksum :', populationChecksum(rows));

    if (dryRun) { console.log('DRY-RUN: preconditions PASS. Provide --out <external> and --manifest <path> to write the encrypted evidence.'); return 0; }
    if (!flags.manifestPath) { console.error('FAIL: --manifest <path> is required for a real export.'); return 1; }
    assertOutsideRepo(flags.outPath!); assertOutsideRepo(flags.manifestPath);

    const { encKey, macKey } = deriveEnvKeys(); // HKDF: independent evidence + manifest subkeys
    const meta = { exportedAtUtc: new Date().toISOString(), environment: flags.environment, databaseId: databaseId(), databaseFingerprint: databaseFingerprint(), commitHash: gitCommit(), schemaStateId: schemaStateId() };
    const evidence = buildEvidencePackage(rows, meta);
    const plaintext = JSON.stringify(evidence);
    const pkg = encrypt(plaintext, encKey);

    // Atomic write + decrypt/parse/checksum verification of the written bytes.
    atomicWriteJsonEncrypted(flags.outPath!, pkg, (raw) => {
      const parsed = decrypt(JSON.parse(raw), encKey);
      if (parsed !== plaintext) throw new Error('verify: decrypted evidence does not match source');
      const roundtrip = JSON.parse(parsed);
      if (roundtrip.rowCount !== expectedCount) throw new Error('verify: rowCount mismatch');
      if (roundtrip.populationChecksum !== populationChecksum(rows)) throw new Error('verify: populationChecksum mismatch');
    });

    const evidencePackageChecksum = fileSha256(flags.outPath!);
    const exportId = createHash('sha256').update(`${meta.exportedAtUtc}:${evidencePackageChecksum}`).digest('hex').slice(0, 16);
    const manifest = buildManifest(rows, { ...meta, exportId, evidencePackageChecksum }, macKey); // HMAC-authenticated
    writeFileSync(flags.manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });

    console.log('EXPORTED:');
    console.log('  evidence (encrypted) :', flags.outPath, '· sha256', evidencePackageChecksum);
    console.log('  manifest (non-PHI)   :', flags.manifestPath, '· exportId', exportId);
    console.log('  format               :', EVIDENCE_FORMAT_VERSION);
    console.log('Store the encrypted evidence in the approved protected location; keep the manifest for the delete step.');
    return 0;
  } finally {
    await (prisma as any).$disconnect?.();
  }
}

if (require.main === module) {
  main().then((c) => process.exit(c)).catch((e) => { console.error(e?.message ?? e); process.exit(3); });
}
