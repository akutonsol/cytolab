/**
 * Program 2 · P2-R016B-A2 — Dry-Run Recovery Planner CLI (READ-ONLY).
 *
 * Reads all audit chains, classifies each (VERIFIED / COMPROMISED / AMBIGUOUS), computes a versioned
 * verification digest, and prints a deterministic recovery PLAN for the generation-rollover model.
 * It MUTATES NOTHING: no writes, no head advance, no transactions, no schema/migration, no repair.
 * Its output is a plan for a later, separately-authorized execution checkpoint (A3).
 *
 * Usage:  ts-node plan.ts [--json]
 *   --json  emit only the machine-readable plan JSON (deterministic for a fixed DB snapshot).
 *
 * Exit code: 0 when a plan was produced. The plan CONTENT (summary.rolloversRequired) signals whether
 * any chain needs recovery; producing that signal is success, not failure.
 */
import { getPrisma, readAllChains, readLegacyCount, gitCommit, databaseBinding } from './runtime';
import { buildRecoveryPlan } from './shared';

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const jsonOnly = argv.includes('--json');
  const prisma = getPrisma();
  try {
    const snapshots = await readAllChains(prisma);
    const legacyCount = await readLegacyCount(prisma);
    const plan = buildRecoveryPlan(snapshots);

    const envelope = {
      tool: 'p2-r016b-a2-dry-run-recovery-planner',
      readOnly: true,
      binding: { gitCommit: gitCommit(), database: databaseBinding() },
      legacyNullChainEvents: legacyCount,
      plan,
    };

    if (jsonOnly) {
      console.log(JSON.stringify(envelope, null, 2));
      return 0;
    }

    console.log('── P2-R016B-A2 · Dry-Run Recovery Planner (READ-ONLY) ──');
    console.log('gitCommit          :', envelope.binding.gitCommit);
    console.log('database           :', envelope.binding.database.target, `(fp ${envelope.binding.database.fingerprint})`);
    console.log('legacy NULL-chain  :', legacyCount, 'event(s)');
    console.log('chains             :', plan.summary.totalChains,
      `(active ${plan.summary.active} · compromised ${plan.summary.compromised} · ambiguous ${plan.summary.ambiguous})`);
    console.log('rollovers required :', plan.summary.rolloversRequired);
    for (const e of plan.chains) {
      console.log(`\n  chainId          : ${e.chainId}`);
      console.log(`  partition        : ${e.partition}`);
      console.log(`  events / maxSeq  : ${e.eventCount} / ${e.maxSequence}`);
      console.log(`  verification     : ${e.verification.result}` +
        (e.verification.failure ? ` (${e.verification.failure.kind} @ seq ${e.verification.failure.sequence})` : '') +
        ` · headMatchesTerminal=${e.verification.headMatchesTerminal}`);
      console.log(`  verifyDigest     : ${e.verificationDigest.digestAlgorithm}/v${e.verificationDigest.digestSchemaVersion} ${e.verificationDigest.digest}`);
      console.log(`  proposed g1      : ${e.proposedG1Status}`);
      console.log(`  action           : ${e.action}`);
      if (e.recoveryRecord) {
        const r = e.recoveryRecord;
        console.log(`  recoveryRecord   : result=${r.verificationResult} reason=${r.failureReason} seq=${r.failureSequence} missingPredecessor=${r.missingPredecessorHash}`);
        console.log(`                     verifiedPrefixLength=${r.verifiedPrefixLength} terminalVerifiedSequence=${r.terminalVerifiedSequence}`);
        console.log(`                     executionTimeFields=[${r.executionTimeFields.join(', ')}]`);
        console.log(`                     note: ${r.note}`);
      }
    }
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error('planner error:', err?.message ?? err);
    process.exit(2);
  });
}
