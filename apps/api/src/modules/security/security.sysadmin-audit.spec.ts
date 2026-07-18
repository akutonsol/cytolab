import { SecurityService } from './security.service';

/**
 * Program 2 · P2-6E — SecurityService security-administration emit placement: the right helper fires
 * after successful governing persistence, ALWAYS through the runSystemAsCurrentActor bridge (proving
 * SYSTEM scope + preserved actor, per the bridge's own unit proof), and never on failure. Single-
 * session termination is intentionally NOT wired (deferred pending the revokeSession contract).
 */
function audit() {
  return {
    recordAccountUnlocked: jest.fn(),
    recordPasswordResetForced: jest.fn(),
    recordUserMfaReset: jest.fn(),
    recordSessionTerminated: jest.fn(),
    recordIpBlockAdded: jest.fn(),
    recordIpBlockRemoved: jest.fn(),
    recordTrustedDeviceRevoked: jest.fn(),
    recordSecurityAlertResolved: jest.fn(),
  };
}
function make(over: { prisma?: any; sessions?: any; mfa?: any } = {}) {
  const rec = audit();
  const labContext = { runSystem: (fn: any) => fn() } as any;
  const bridge = jest.fn((fn: any) => fn());
  const executionContext = { runSystemAsCurrentActor: bridge } as any;
  const prisma = over.prisma ?? {};
  const sessions = over.sessions ?? {};
  const mfa = over.mfa ?? {};
  const svc = new SecurityService(prisma, labContext, sessions, mfa, {} as any, rec as any, executionContext);
  return { svc, rec, bridge };
}

describe('SecurityService — P2-6E security administration audit', () => {
  it('unlockUser emits ACCOUNT_UNLOCKED through the bridge, after the unlock writes', async () => {
    const prisma = { accountLock: { findUnique: jest.fn().mockResolvedValue(null) }, user: { update: jest.fn().mockResolvedValue({}) } };
    const { svc, rec, bridge } = make({ prisma });
    await svc.unlockUser('u1', 'admin1');
    expect(rec.recordAccountUnlocked).toHaveBeenCalledWith({ userId: 'u1', producerModule: 'security' });
    expect(bridge).toHaveBeenCalledTimes(1); // bridge wraps the emit
  });

  it('unlockUser does NOT emit if the user write fails', async () => {
    const prisma = { accountLock: { findUnique: jest.fn().mockResolvedValue(null) }, user: { update: jest.fn().mockRejectedValue(new Error('db')) } };
    const { svc, rec } = make({ prisma });
    await expect(svc.unlockUser('u1', 'admin1')).rejects.toThrow();
    expect(rec.recordAccountUnlocked).not.toHaveBeenCalled();
  });

  it('forcePasswordReset emits PASSWORD_RESET_FORCED after the passwordExpiresAt write (session revoke is fire-after)', async () => {
    const prisma = { user: { update: jest.fn().mockResolvedValue({}) } };
    const sessions = { revokeAllForUser: jest.fn().mockResolvedValue(2) };
    const { svc, rec } = make({ prisma, sessions });
    await svc.forcePasswordReset('u1');
    expect(rec.recordPasswordResetForced).toHaveBeenCalledWith({ userId: 'u1', producerModule: 'security' });
  });

  it('resetUserMfa emits USER_MFA_RESET after resetMfa; not if resetMfa throws', async () => {
    const okMfa = { resetMfa: jest.fn().mockResolvedValue(undefined) };
    const okd = make({ mfa: okMfa });
    await okd.svc.resetUserMfa('u1');
    expect(okd.rec.recordUserMfaReset).toHaveBeenCalledWith({ userId: 'u1', producerModule: 'security' });

    const badMfa = { resetMfa: jest.fn().mockRejectedValue(new Error('no cfg')) };
    const bad = make({ mfa: badMfa });
    await expect(bad.svc.resetUserMfa('u1')).rejects.toThrow();
    expect(bad.rec.recordUserMfaReset).not.toHaveBeenCalled();
  });

  it('terminateAllForUser emits ONE SESSION_TERMINATED{all} with the actual count', async () => {
    const sessions = { revokeAllForUser: jest.fn().mockResolvedValue(3) };
    const { svc, rec } = make({ sessions });
    await svc.terminateAllForUser('u1');
    expect(rec.recordSessionTerminated).toHaveBeenCalledTimes(1);
    expect(rec.recordSessionTerminated).toHaveBeenCalledWith({ scope: 'all', terminatedCount: 3, resource: { type: 'User', id: 'u1' }, producerModule: 'security' });
  });

  it('terminateAllForUser with a zero-count success still emits terminatedCount 0 (no suppression)', async () => {
    const sessions = { revokeAllForUser: jest.fn().mockResolvedValue(0) };
    const { svc, rec } = make({ sessions });
    await svc.terminateAllForUser('u1');
    expect(rec.recordSessionTerminated).toHaveBeenCalledWith(expect.objectContaining({ scope: 'all', terminatedCount: 0 }));
  });

  it('terminateSession (single) is DEFERRED — emits nothing (revokeSession contract does not guarantee revocation)', async () => {
    const sessions = { revokeSession: jest.fn().mockResolvedValue(undefined) };
    const { svc, rec } = make({ sessions });
    await svc.terminateSession('sess1');
    expect(rec.recordSessionTerminated).not.toHaveBeenCalled();
  });

  it('addBlockedIp emits IP_BLOCK_ADDED with the row id + permanent (never the raw IP)', async () => {
    const prisma = { blockedIp: { upsert: jest.fn().mockResolvedValue({ id: 'blk1', ipAddress: '198.51.100.9' }) } };
    const { svc, rec } = make({ prisma });
    await svc.addBlockedIp({ ipAddress: '198.51.100.9', reason: 'abuse', permanent: true }, 'admin1');
    expect(rec.recordIpBlockAdded).toHaveBeenCalledWith({ blockedIpId: 'blk1', permanent: true, producerModule: 'security' });
    // the intent carries no raw IP or reason
    const arg = rec.recordIpBlockAdded.mock.calls[0][0];
    expect(JSON.stringify(arg)).not.toContain('198.51.100.9');
    expect(JSON.stringify(arg)).not.toContain('abuse');
  });

  it('unblockIp emits IP_BLOCK_REMOVED with the row id after delete; not if delete fails', async () => {
    const ok = make({ prisma: { blockedIp: { delete: jest.fn().mockResolvedValue({}) } } });
    await ok.svc.unblockIp('blk1');
    expect(ok.rec.recordIpBlockRemoved).toHaveBeenCalledWith({ blockedIpId: 'blk1', producerModule: 'security' });

    const bad = make({ prisma: { blockedIp: { delete: jest.fn().mockRejectedValue(new Error('not found')) } } });
    await expect(bad.svc.unblockIp('missing')).rejects.toThrow();
    expect(bad.rec.recordIpBlockRemoved).not.toHaveBeenCalled();
  });

  it('revokeTrustedDevice emits TRUSTED_DEVICE_REVOKED with the row id; not if delete fails', async () => {
    const ok = make({ prisma: { trustedDevice: { delete: jest.fn().mockResolvedValue({}) } } });
    await ok.svc.revokeTrustedDevice('dev1');
    expect(ok.rec.recordTrustedDeviceRevoked).toHaveBeenCalledWith({ trustedDeviceId: 'dev1', producerModule: 'security' });

    const bad = make({ prisma: { trustedDevice: { delete: jest.fn().mockRejectedValue(new Error('nf')) } } });
    await expect(bad.svc.revokeTrustedDevice('missing')).rejects.toThrow();
    expect(bad.rec.recordTrustedDeviceRevoked).not.toHaveBeenCalled();
  });

  it('resolveAlert emits SECURITY_ALERT_RESOLVED with the alert id; not on not-found', async () => {
    const ok = make({ prisma: { securityAlert: { findUnique: jest.fn().mockResolvedValue({ id: 'al1' }), update: jest.fn().mockResolvedValue({ id: 'al1' }) } } });
    await ok.svc.resolveAlert('al1', 'admin1');
    expect(ok.rec.recordSecurityAlertResolved).toHaveBeenCalledWith({ alertId: 'al1', producerModule: 'security' });

    const bad = make({ prisma: { securityAlert: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() } } });
    await expect(bad.svc.resolveAlert('missing', 'admin1')).rejects.toThrow();
    expect(bad.rec.recordSecurityAlertResolved).not.toHaveBeenCalled();
  });

  it('a bridge failure never fails the completed security action (best-effort swallow)', async () => {
    const prisma = { accountLock: { findUnique: jest.fn().mockResolvedValue(null) }, user: { update: jest.fn().mockResolvedValue({}) } };
    const rec = audit();
    const labContext = { runSystem: (fn: any) => fn() } as any;
    const executionContext = { runSystemAsCurrentActor: jest.fn().mockRejectedValue(new Error('no actor')) } as any;
    const svc = new SecurityService(prisma as any, labContext, {} as any, {} as any, {} as any, rec as any, executionContext);
    await expect(svc.unlockUser('u1', 'admin1')).resolves.toEqual({ status: 'OK' });
  });
});
