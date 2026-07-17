import { resolveActor, resolveOrganization } from './attribution-resolution';
import { PrincipalLike } from './execution-context.types';

describe('resolveActor', () => {
  it('resolves an authenticated staff principal', () => {
    const p: PrincipalLike = { kind: 'staff', userId: 'u1', labId: 'lab1' };
    expect(resolveActor(p)).toEqual({ actorType: 'STAFF', actorId: 'u1' });
  });

  it('resolves an authenticated portal principal', () => {
    const p: PrincipalLike = { kind: 'portal', portalUserId: 'pu1', labId: 'lab1', clientId: 'c1' };
    expect(resolveActor(p)).toEqual({ actorType: 'PORTAL', actorId: 'pu1' });
  });

  it('resolves a service principal', () => {
    const p: PrincipalLike = { kind: 'service', servicePrincipal: 'reagent-scheduler' };
    expect(resolveActor(p)).toEqual({
      actorType: 'SERVICE',
      servicePrincipal: 'reagent-scheduler',
    });
  });

  it('resolves explicit system execution', () => {
    expect(resolveActor({ kind: 'system' })).toEqual({ actorType: 'SYSTEM' });
  });

  it('resolves an unauthenticated request to ANONYMOUS', () => {
    expect(resolveActor(undefined)).toEqual({ actorType: 'ANONYMOUS' });
  });

  it('never trusts an unrecognized/forged principal shape for identity', () => {
    // A payload-shaped object with no recognized kind must not become an identity.
    const forged = { userId: 'attacker', labId: 'other-lab' } as unknown as PrincipalLike;
    expect(resolveActor(forged)).toEqual({ actorType: 'ANONYMOUS' });
  });
});

describe('resolveOrganization', () => {
  it('LAB scope from an authenticated labId', () => {
    expect(resolveOrganization({ kind: 'staff', userId: 'u', labId: 'lab1' })).toEqual({
      scope: 'LAB',
      labId: 'lab1',
    });
  });

  it('SYSTEM scope with no fabricated tenant when there is no authenticated lab', () => {
    expect(resolveOrganization(undefined)).toEqual({ scope: 'SYSTEM' });
    expect(resolveOrganization({ kind: 'staff', userId: 'u' })).toEqual({ scope: 'SYSTEM' });
  });

  it('honors an explicit SYSTEM/CROSS_LAB system execution and never carries a labId', () => {
    expect(resolveOrganization(undefined, 'SYSTEM')).toEqual({ scope: 'SYSTEM' });
    expect(resolveOrganization(undefined, 'CROSS_LAB')).toEqual({ scope: 'CROSS_LAB' });
    // Even if a principal has a lab, an explicit system scope wins and carries no tenant.
    expect(
      resolveOrganization({ kind: 'staff', userId: 'u', labId: 'lab1' }, 'CROSS_LAB'),
    ).toEqual({ scope: 'CROSS_LAB' });
  });
});
