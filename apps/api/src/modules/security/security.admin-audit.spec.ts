import { SecurityService } from './security.service';

/**
 * Program 2 · P2-6 — SecurityService administrative config audit: emits SETTING_CHANGED only after
 * successful persistence; never on failure. setMfaRequired emits OUTSIDE runSystem (admin attribution).
 */
function make() {
  const recordSettingChanged = jest.fn();
  const audit = { recordSettingChanged } as any;
  const labContext = { runSystem: (fn: any) => fn() } as any; // execute the callback inline
  const prisma = { user: { update: jest.fn().mockResolvedValue({}) } } as any;
  const passwordPolicy = { updatePolicy: jest.fn().mockResolvedValue({ minLength: 8 }) } as any;
  const svc = new SecurityService(prisma, labContext, {} as any, {} as any, passwordPolicy, audit);
  return { svc, recordSettingChanged, prisma, passwordPolicy };
}

describe('SecurityService — P2-6 administrative config audit', () => {
  it('setMfaRequired emits SETTING_CHANGED (mfa_required/user) after success', async () => {
    const { svc, recordSettingChanged } = make();
    await svc.setMfaRequired('u1', true);
    expect(recordSettingChanged).toHaveBeenCalledWith(
      expect.objectContaining({ settingKey: 'mfa_required', scope: 'user', producerModule: 'security', resource: expect.objectContaining({ type: 'User', id: 'u1' }) }),
    );
  });

  it('setMfaRequired does NOT emit if the persistence fails', async () => {
    const { svc, recordSettingChanged, prisma } = make();
    prisma.user.update.mockRejectedValue(new Error('db'));
    await expect(svc.setMfaRequired('u1', true)).rejects.toThrow();
    expect(recordSettingChanged).not.toHaveBeenCalled();
  });

  it('updatePasswordPolicy emits SETTING_CHANGED (password_policy/system) after success', async () => {
    const { svc, recordSettingChanged } = make();
    await svc.updatePasswordPolicy({ minLength: 10 });
    expect(recordSettingChanged).toHaveBeenCalledWith(
      expect.objectContaining({ settingKey: 'password_policy', scope: 'system', producerModule: 'security' }),
    );
  });

  it('updatePasswordPolicy does NOT emit if persistence fails', async () => {
    const { svc, recordSettingChanged, passwordPolicy } = make();
    passwordPolicy.updatePolicy.mockRejectedValue(new Error('db'));
    await expect(svc.updatePasswordPolicy({})).rejects.toThrow();
    expect(recordSettingChanged).not.toHaveBeenCalled();
  });
});
