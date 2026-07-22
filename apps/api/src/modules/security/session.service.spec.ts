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

/** R-007 — session lifecycle: rotation, idle/absolute expiry, revoke-all/others, per-request touch. */
function make2() {
  const prisma: any = {
    refreshToken: {
      findUnique: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    userSession: {
      findUnique: jest.fn().mockResolvedValue({ userId: 'u1', deviceId: 'dev1' }),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ id: 's1' }),
    },
  };
  const config = { get: () => undefined } as any; // fall back to defaults: idle 15m, max 12h
  const labContext = { runSystem: (fn: any) => fn() } as any;
  const svc = new SessionService(prisma, config, labContext);
  return { svc, prisma };
}
const rctx: any = { ipAddress: '1.2.3.4', userAgent: 'ua', deviceId: 'dev1', deviceName: 'd', browser: 'b', os: 'o' };
const liveToken = { id: 't1', userId: 'u1', deviceId: 'dev1', revokedAt: null, expiresAt: new Date(Date.now() + 3_600_000) };

describe('SessionService — refresh-token rotation', () => {
  it('rotates a valid token on a live session (deletes old, mints new)', async () => {
    const { svc, prisma } = make2();
    prisma.refreshToken.findUnique.mockResolvedValue(liveToken);
    prisma.userSession.findFirst.mockResolvedValue({ id: 's1', createdAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000), lastActiveAt: new Date() });
    const res = await svc.rotateRefreshToken('raw', rctx);
    expect(res.userId).toBe('u1');
    expect(prisma.refreshToken.delete).toHaveBeenCalled();
    expect(prisma.refreshToken.create).toHaveBeenCalled();
  });

  it('NEGATIVE: a revoked refresh token is rejected', async () => {
    const { svc, prisma } = make2();
    prisma.refreshToken.findUnique.mockResolvedValue({ ...liveToken, revokedAt: new Date() });
    await expect(svc.rotateRefreshToken('raw', rctx)).rejects.toThrow('Invalid refresh token');
  });

  it('NEGATIVE: an expired refresh token is rejected', async () => {
    const { svc, prisma } = make2();
    prisma.refreshToken.findUnique.mockResolvedValue({ ...liveToken, expiresAt: new Date(Date.now() - 1_000) });
    await expect(svc.rotateRefreshToken('raw', rctx)).rejects.toThrow('Invalid refresh token');
  });

  it('NEGATIVE: past the 12h absolute lifetime → SESSION_EXPIRED, session revoked', async () => {
    const { svc, prisma } = make2();
    prisma.refreshToken.findUnique.mockResolvedValue(liveToken);
    prisma.userSession.findFirst.mockResolvedValue({ id: 's1', createdAt: new Date(Date.now() - 13 * 3_600_000), expiresAt: new Date(Date.now() + 3_600_000), lastActiveAt: new Date() });
    const err: any = await svc.rotateRefreshToken('raw', rctx).catch((e) => e);
    expect(err.getResponse()).toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(prisma.userSession.updateMany).toHaveBeenCalled(); // revokeSession ran
  });

  it('NEGATIVE: past the idle window → SESSION_IDLE_TIMEOUT, session revoked', async () => {
    const { svc, prisma } = make2();
    prisma.refreshToken.findUnique.mockResolvedValue(liveToken);
    prisma.userSession.findFirst.mockResolvedValue({ id: 's1', createdAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000), lastActiveAt: new Date(Date.now() - 16 * 60_000) });
    const err: any = await svc.rotateRefreshToken('raw', rctx).catch((e) => e);
    expect(err.getResponse()).toMatchObject({ code: 'SESSION_IDLE_TIMEOUT' });
    expect(prisma.userSession.updateMany).toHaveBeenCalled();
  });
});

describe('SessionService — touch + bulk revocation', () => {
  it('NEGATIVE: touchSession on a revoked session returns false', async () => {
    const { svc, prisma } = make2();
    prisma.userSession.findUnique.mockResolvedValue({ id: 's1', revokedAt: new Date() });
    expect(await svc.touchSession('s1')).toBe(false);
  });

  it('touchSession no-ops true for a legacy token with no session id', async () => {
    const { svc } = make2();
    expect(await svc.touchSession(undefined)).toBe(true);
  });

  it('revokeAllForUser returns the atomic revoked count', async () => {
    const { svc, prisma } = make2();
    prisma.userSession.updateMany.mockResolvedValue({ count: 3 });
    expect(await svc.revokeAllForUser('u1')).toBe(3);
  });

  it('revokeOthersForUser revokes every other session and keeps the current one', async () => {
    const { svc, prisma } = make2();
    prisma.userSession.findMany.mockResolvedValue([{ id: 'a', deviceId: 'd' }, { id: 'b', deviceId: 'd' }]);
    expect(await svc.revokeOthersForUser('u1', 'keep')).toBe(2);
    expect(prisma.userSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { not: 'keep' } }) }),
    );
  });
});
