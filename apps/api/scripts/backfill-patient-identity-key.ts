/**
 * Backfill `Patient.identityKey` for rows created before de-duplication existed.
 *
 * Going forward, PatientsService.findOrCreate stamps every new patient with an
 * identity fingerprint so the same real-world person is never duplicated. Legacy
 * rows have a null key and therefore do not participate in dedup until they are
 * backfilled here.
 *
 * The client applies the PHI encryption extension (so `identityToken` decrypts to
 * plaintext for hashing) but NOT the tenancy guard — this is an operator script
 * that must see every lab. The unique index `(labId, identityKey)` is the safety
 * net: when two existing rows resolve to the same key they are a PRE-EXISTING
 * duplicate. We leave the second row's key null and report it for manual merge
 * rather than guessing which record set to move.
 *
 * Usage:
 *   cd apps/api
 *   npx ts-node scripts/backfill-patient-identity-key.ts           # apply
 *   npx ts-node scripts/backfill-patient-identity-key.ts --dry-run # report only
 */
import { PrismaClient } from '@prisma/client';
import { phiEncryptionExtension } from '../src/common/crypto/phi-encryption.extension';
import { computeIdentityKey } from '../src/common/util/patient-identity';
import { isUniqueConflict } from '../src/common/util/lab-sequence';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const prisma = new PrismaClient().$extends(phiEncryptionExtension());

  const patients = await prisma.patient.findMany({
    where: { identityKey: null },
    select: {
      id: true,
      labId: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      gender: true,
      identityToken: true,
    },
    orderBy: { createdAt: 'asc' }, // oldest wins the key; newer dupes flagged
  });

  let updated = 0;
  let skippedNoKey = 0;
  const duplicates: { id: string; labId: string; key: string }[] = [];

  for (const p of patients) {
    const key = computeIdentityKey(p);
    if (!key) {
      skippedNoKey++;
      continue;
    }
    if (dryRun) {
      updated++;
      continue;
    }
    try {
      await prisma.patient.update({ where: { id: p.id }, data: { identityKey: key } });
      updated++;
    } catch (e) {
      if (isUniqueConflict(e, 'identityKey')) {
        // Another (older) row already owns this identity → pre-existing duplicate.
        duplicates.push({ id: p.id, labId: p.labId, key });
        continue;
      }
      throw e;
    }
  }

  console.log(`\nPatient identity-key backfill ${dryRun ? '(dry run) ' : ''}complete:`);
  console.log(`  scanned:        ${patients.length}`);
  console.log(`  keyed:          ${updated}`);
  console.log(`  skipped (thin): ${skippedNoKey}  (no national ID and no DOB — cannot match)`);
  console.log(`  DUPLICATES:     ${duplicates.length}  (pre-existing; need manual merge)`);
  for (const d of duplicates) {
    console.log(`    - patient ${d.id} (lab ${d.labId}) collides on identity ${d.key.slice(0, 12)}…`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
