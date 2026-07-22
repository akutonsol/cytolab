import { ForbiddenException } from '@nestjs/common';
import { LoginProtectionService } from './login-protection.service';

/**
 * R-007 — regression coverage for the account-lockout / brute-force controls. Pure unit tests
 * (mocked Prisma + system-scope runner + mail); each subsystem includes a negative control.
 */
const make = () => {
  const prisma: any = {
    loginAttempt: { create: jest.fn().mockResolvedValue({}), count: jest.fn().mockResolvedValue(0) },
    user: { update: jest.fn().mockResolvedValue({ failedLoginCount: 0 }) },
    accountLock: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn().mockResolvedValue({}),
    },
    securityAlert: { create: jest.fn().mockResolvedValue({}) },
    blockedIp: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
    userSession: { findFirst: jest.fn().mockResolvedValue(null) },
    trustedDevice: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const labContext = { runSystem: (fn: any) => fn() } as any;
  const mail = { send: jest.fn().mockResolvedValue(undefined) } as any;
  const svc = new LoginProtectionService(prisma, labContext, mail);
  return { svc, prisma };
};
const ctx: any = { ipAddress: '1.2.3.4', userAgent: 'ua', lat: null, lng: null, deviceId: 'dev' };
const user = { id: 'u1', labId: 'l1' };

describe('LoginProtectionService — progressive lockout ladder', () => {
  it.each([[3, 5], [5, 15], [7, 60]])('%i failures → locked ~%i minutes', async (failures, minutes) => {
    const { svc, prisma } = make();
    prisma.user.update.mockResolvedValue({ failedLoginCount: failures });
    await svc.handleFailure({ user, email: 'e@x', ctx, reason: 'bad password' });
    const arg = prisma.accountLock.upsert.mock.calls[0][0];
    expect(arg.create.autoUnlockAt).toBeInstanceOf(Date);
    expect(Math.round((arg.create.autoUnlockAt.getTime() - Date.now()) / 60_000)).toBe(minutes);
  });

  it('10 failures → PERMANENT lock (no auto-unlock)', async () => {
    const { svc, prisma } = make();
    prisma.user.update.mockResolvedValue({ failedLoginCount: 10 });
    await svc.handleFailure({ user, email: 'e@x', ctx, reason: 'bad' });
    expect(prisma.accountLock.upsert.mock.calls[0][0].create.autoUnlockAt).toBeNull();
  });

  it('NEGATIVE: below the first rung (2 failures) → no lock applied', async () => {
    const { svc, prisma } = make();
    prisma.user.update.mockResolvedValue({ failedLoginCount: 2 });
    await svc.handleFailure({ user, email: 'e@x', ctx, reason: 'bad' });
    expect(prisma.accountLock.upsert).not.toHaveBeenCalled();
  });
});

describe('LoginProtectionService — lock-state queries', () => {
  it('permanent lock → locked + permanent', async () => {
    const { svc, prisma } = make();
    prisma.accountLock.findUnique.mockResolvedValue({ unlockedAt: null, autoUnlockAt: null, reason: 'x' });
    expect(await svc.getLockState('u1')).toMatchObject({ locked: true, permanent: true });
  });

  it('active auto-lock → locked', async () => {
    const { svc, prisma } = make();
    prisma.accountLock.findUnique.mockResolvedValue({ unlockedAt: null, autoUnlockAt: new Date(Date.now() + 60_000), reason: 'x' });
    expect((await svc.getLockState('u1')).locked).toBe(true);
  });

  it('NEGATIVE: an elapsed auto-lock releases and does not remain enforced', async () => {
    const { svc, prisma } = make();
    prisma.accountLock.findUnique.mockResolvedValue({ unlockedAt: null, autoUnlockAt: new Date(Date.now() - 1_000), reason: 'x' });
    expect((await svc.getLockState('u1')).locked).toBe(false);
    expect(prisma.accountLock.update).toHaveBeenCalled(); // cleanly released
  });

  it('a successful login resets the failure counter and clears an auto-lock', async () => {
    const { svc, prisma } = make();
    await svc.handleSuccess({ user: { ...user, email: 'e@x', firstName: 'F' }, ctx });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ failedLoginCount: 0 }) }));
    expect(prisma.accountLock.updateMany).toHaveBeenCalled();
  });
});

describe('LoginProtectionService — IP block + credential stuffing', () => {
  it('permanent / future-dated block → isIpBlocked true', async () => {
    const { svc, prisma } = make();
    prisma.blockedIp.findUnique.mockResolvedValue({ permanent: true });
    expect(await svc.isIpBlocked('1.2.3.4')).toBe(true);
    prisma.blockedIp.findUnique.mockResolvedValue({ permanent: false, expiresAt: new Date(Date.now() + 60_000) });
    expect(await svc.isIpBlocked('1.2.3.4')).toBe(true);
  });

  it('NEGATIVE: an EXPIRED block is not enforced', async () => {
    const { svc, prisma } = make();
    prisma.blockedIp.findUnique.mockResolvedValue({ permanent: false, expiresAt: new Date(Date.now() - 60_000) });
    expect(await svc.isIpBlocked('1.2.3.4')).toBe(false);
    await expect(svc.assertIpAllowed('1.2.3.4')).resolves.toBeUndefined();
  });

  it('assertIpAllowed throws ForbiddenException for a blocked IP', async () => {
    const { svc, prisma } = make();
    prisma.blockedIp.findUnique.mockResolvedValue({ permanent: true });
    await expect(svc.assertIpAllowed('1.2.3.4')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('auto-blocks an IP at ≥20 failed logins/hour', async () => {
    const { svc, prisma } = make();
    prisma.loginAttempt.count.mockResolvedValue(20);
    await svc.handleFailure({ user: null, email: 'e@x', ctx, reason: 'bad' });
    expect(prisma.blockedIp.upsert).toHaveBeenCalled();
    expect(prisma.blockedIp.upsert.mock.calls[0][0].create.expiresAt).toBeInstanceOf(Date); // 24h block
  });

  it('NEGATIVE: does not block below the stuffing threshold (19 failures)', async () => {
    const { svc, prisma } = make();
    prisma.loginAttempt.count.mockResolvedValue(19);
    await svc.handleFailure({ user: null, email: 'e@x', ctx, reason: 'bad' });
    expect(prisma.blockedIp.upsert).not.toHaveBeenCalled();
  });
});
