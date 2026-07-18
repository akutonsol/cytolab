import { SessionService } from './session.service';

/**
 * Program 2 · P2-6E1 — truthful revokeSession contract. The return value reflects the ATOMIC
 * affected-row count of an `updateMany` guarded on `revokedAt: null`, never a read-then-write
 * inference: true iff an active session was revoked by this call; false for missing/already-revoked.
 */
function make(updateManyImpl?: jest.Mock) {
  const sessionUpdateMany = updateManyImpl ?? jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    userSession: {
      updateMany: sessionUpdateMany,
      findUnique: jest.fn().mockResolvedValue({ userId: 'u1', deviceId: 'dev1' }),
    },
    refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  } as any;
  const labContext = { runSystem: (fn: any) => fn() } as any;
  const svc = new SessionService(prisma, {} as any, labContext);
  return { svc, prisma, sessionUpdateMany };
}

describe('SessionService.revokeSession — P2-6E1 truthful contract', () => {
  it('an active session returns true (atomic count 1) and cleans up device refresh tokens', async () => {
    const { svc, prisma } = make(jest.fn().mockResolvedValue({ count: 1 }));
    await expect(svc.revokeSession('sess1')).resolves.toBe(true);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
  });

  it('determines truth from an atomic updateMany guarded on revokedAt: null (not a read-then-write)', async () => {
    const { svc, sessionUpdateMany } = make();
    await svc.revokeSession('sess1');
    expect(sessionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sess1', revokedAt: null } }),
    );
  });

  it('a missing session returns false (count 0) and skips token cleanup — no fabricated positive', async () => {
    const { svc, prisma } = make(jest.fn().mockResolvedValue({ count: 0 }));
    await expect(svc.revokeSession('missing')).resolves.toBe(false);
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('an already-revoked session returns false (the revokedAt: null guard yields count 0)', async () => {
    // Already-revoked rows are excluded by the guard, so updateMany affects 0 rows.
    const { svc } = make(jest.fn().mockResolvedValue({ count: 0 }));
    await expect(svc.revokeSession('sess1')).resolves.toBe(false);
  });

  it('a persistence failure throws (never a fabricated success)', async () => {
    const { svc } = make(jest.fn().mockRejectedValue(new Error('db')));
    await expect(svc.revokeSession('sess1')).rejects.toThrow('db');
  });
});
