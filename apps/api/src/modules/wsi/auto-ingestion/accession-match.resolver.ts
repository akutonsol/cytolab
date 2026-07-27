import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { MatchOutcome } from './dto/match-outcome';

/**
 * Program 5B · B1 — exact accession → record resolver (the matching seam; B3 wires it into discovery).
 *
 * Canonical matching authority: exact `Record.labNumber` (primary) then exact `Record.identifier`
 * (secondary), BOTH unique per lab. The current lab is applied structurally by the tenancy extension
 * (the resolver must run inside the source's lab context — a Lab-A source can only ever match Lab-A
 * records). NO fuzzy/contains matching, NO patient-name matching, NO metadata similarity, NO cross-lab.
 *
 * The outcome is truthful: `unique` only when exactly one record is authoritatively identified;
 * `ambiguous` when the value resolves to DIFFERENT records via the two keys; `none` otherwise. A record
 * is NEVER fabricated or forced.
 */
@Injectable()
export class AccessionMatchResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(accession: string): Promise<MatchOutcome> {
    const value = (accession ?? '').trim();
    if (!value) return { kind: 'none' };

    // Both keys are unique per lab; tenancy scoping makes each findFirst return ≤1 row for the caller's lab.
    const [byLabNumber, byIdentifier] = await Promise.all([
      this.prisma.record.findFirst({ where: { labNumber: value }, select: { id: true } }),
      this.prisma.record.findFirst({ where: { identifier: value }, select: { id: true } }),
    ]);

    const ids = new Set<string>();
    if (byLabNumber) ids.add(byLabNumber.id);
    if (byIdentifier) ids.add(byIdentifier.id);

    if (ids.size === 0) return { kind: 'none' };
    if (ids.size > 1) return { kind: 'ambiguous', candidateRecordIds: [...ids] };
    return { kind: 'unique', recordId: [...ids][0], matchedBy: byLabNumber ? 'labNumber' : 'identifier' };
  }
}
