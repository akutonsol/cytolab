import { AccessionMatchResolver } from './accession-match.resolver';

// Mocked Record.findFirst keyed on which exact key the resolver queries — proves the TRUTHFUL outcome
// contract (unique/none/ambiguous) with NO fuzzy/contains matching and NO fabricated association.
function resolverWith(byLabNumber: string | null, byIdentifier: string | null) {
  const prisma = {
    record: {
      findFirst: jest.fn(({ where }: any) => {
        if ('labNumber' in where) return Promise.resolve(byLabNumber ? { id: byLabNumber } : null);
        if ('identifier' in where) return Promise.resolve(byIdentifier ? { id: byIdentifier } : null);
        return Promise.resolve(null);
      }),
    },
  };
  return new AccessionMatchResolver(prisma as any);
}

describe('P5B-B1 AccessionMatchResolver — exact, truthful matching', () => {
  it('unique via labNumber (primary key)', async () => {
    expect(await resolverWith('rec-1', null).resolve('CBL26-06-465')).toEqual({ kind: 'unique', recordId: 'rec-1', matchedBy: 'labNumber' });
  });

  it('unique via identifier (secondary key) when labNumber does not match', async () => {
    expect(await resolverWith(null, 'rec-2').resolve('ID-abc')).toEqual({ kind: 'unique', recordId: 'rec-2', matchedBy: 'identifier' });
  });

  it('unique when both keys resolve to the SAME record', async () => {
    const out = await resolverWith('rec-9', 'rec-9').resolve('shared');
    expect(out).toMatchObject({ kind: 'unique', recordId: 'rec-9' });
  });

  it('ambiguous when the value resolves to DIFFERENT records via the two keys (never forces one)', async () => {
    const out = await resolverWith('rec-A', 'rec-B').resolve('collide');
    expect(out.kind).toBe('ambiguous');
    expect((out as any).candidateRecordIds.sort()).toEqual(['rec-A', 'rec-B']);
  });

  it('none when nothing matches (no fabrication)', async () => {
    expect(await resolverWith(null, null).resolve('missing')).toEqual({ kind: 'none' });
  });

  it('none for empty/whitespace accession', async () => {
    expect(await resolverWith('x', 'y').resolve('   ')).toEqual({ kind: 'none' });
  });
});
