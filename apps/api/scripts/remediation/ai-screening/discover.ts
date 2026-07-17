/**
 * Program 1 · P1-3B — discover.ts (READ-ONLY).
 *
 * Fingerprints the AIScreeningResult population and validates the simulated signature.
 * Never mutates, exports, or writes PHI. Exits non-zero if any row fails the approved
 * simulated-population rules (anomalous IDs are reported without patient-facing fields).
 *
 * Usage: ts-node discover.ts [--expected-count 75] [--expected-labs 2]
 */
import { getPrisma, RESULT_SELECT_ALL, containmentActive } from './runtime';
import {
  parseFlags, validatePopulation, populationChecksum, sortedIds, distinctLabs, EXPECTED_COUNT, EXPECTED_LABS,
} from './shared';

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const flags = parseFlags(argv);
  const expectedCount = flags.expectedCount || EXPECTED_COUNT;
  const expectedLabs = flags.expectedLabs || EXPECTED_LABS;
  const prisma = getPrisma();
  try {
    const rows = await prisma.aIScreeningResult.findMany({ select: RESULT_SELECT_ALL, orderBy: { id: 'asc' } });
    const contained = await containmentActive(prisma);
    const result = validatePopulation(rows as any, { expectedCount, expectedLabs });

    console.log('── AI-Screening disposition · DISCOVERY (read-only) ──');
    console.log('rowCount           :', result.count);
    console.log('distinctLabs       :', result.labs, distinctLabs(rows as any));
    console.log('containmentActive  :', contained, '(AI_SCREENING enabled for 0 labs)');
    console.log('populationChecksum :', populationChecksum(rows as any));
    console.log('targetIds (sorted) :', sortedIds(rows as any).length, 'ids');
    console.log('expectedCount/labs :', expectedCount, '/', expectedLabs);

    if (!contained) { console.error('FAIL: runtime containment is not active.'); return 2; }
    if (!result.ok) {
      console.error('FAIL: population does not satisfy the approved simulated-population rules.');
      for (const a of result.anomalies) console.error(`  anomalous id ${a.id}: ${a.reasons.join('; ')}`);
      if (result.count !== expectedCount) console.error(`  count ${result.count} !== expected ${expectedCount}`);
      if (result.labs !== expectedLabs) console.error(`  labs ${result.labs} !== expected ${expectedLabs}`);
      return 1;
    }
    console.log('PASS: all rows are conclusively simulated; population approved as a deletion target.');
    return 0;
  } finally {
    await (prisma as any).$disconnect?.();
  }
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((e) => { console.error(e?.message ?? e); process.exit(3); });
}
