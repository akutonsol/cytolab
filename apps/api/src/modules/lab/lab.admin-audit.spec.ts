import { LabService } from './lab.service';

/**
 * Program 2 · P2-6 — LabService administrative config audit: SETTING_CHANGED emitted only after the
 * lab.update persists; branding broadcast is fire-after. Metadata is bounded (settingKey/scope) — never
 * the changed values or storage URLs.
 */
function make() {
  const recordSettingChanged = jest.fn();
  const audit = { recordSettingChanged } as any;
  const labContext = { getLabId: () => 'lab-1' } as any;
  const prisma = {
    lab: {
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({ id: 'lab-1', name: 'Acme', tagline: null, logoUrl: null }),
    },
  } as any;
  const realtime = { emitToLab: jest.fn() } as any;
  const files = { upload: jest.fn().mockResolvedValue({ storageUrl: 'gs://bucket/logo.png' }) } as any;
  const svc = new LabService(prisma, labContext, realtime, files, audit);
  return { svc, recordSettingChanged, prisma };
}

describe('LabService — P2-6 administrative config audit', () => {
  it('updateProfile emits SETTING_CHANGED (company_profile/lab) after success', async () => {
    const { svc, recordSettingChanged } = make();
    await svc.updateProfile({ name: 'New Name' } as any);
    expect(recordSettingChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        settingKey: 'company_profile',
        scope: 'lab',
        producerModule: 'lab',
        resource: expect.objectContaining({ type: 'Lab', id: 'lab-1', labId: 'lab-1' }),
      }),
    );
  });

  it('updateProfile metadata carries no changed values', async () => {
    const { svc, recordSettingChanged } = make();
    await svc.updateProfile({ name: 'Secret Co', email: 'x@y.z' } as any);
    const arg = recordSettingChanged.mock.calls[0][0];
    expect(JSON.stringify(arg)).not.toContain('Secret Co');
    expect(JSON.stringify(arg)).not.toContain('x@y.z');
  });

  it('updateProfile does NOT emit if the persistence fails', async () => {
    const { svc, recordSettingChanged, prisma } = make();
    prisma.lab.update.mockRejectedValue(new Error('db'));
    await expect(svc.updateProfile({ name: 'X' } as any)).rejects.toThrow();
    expect(recordSettingChanged).not.toHaveBeenCalled();
  });

  it('uploadLogo emits SETTING_CHANGED (company_logo/lab) with no storage URL in metadata', async () => {
    const { svc, recordSettingChanged } = make();
    await svc.uploadLogo({ mimetype: 'image/png', size: 1024 } as any);
    const arg = recordSettingChanged.mock.calls[0][0];
    expect(arg).toEqual(expect.objectContaining({ settingKey: 'company_logo', scope: 'lab', producerModule: 'lab' }));
    expect(JSON.stringify(arg)).not.toContain('gs://bucket/logo.png');
  });

  it('removeLogo emits SETTING_CHANGED (company_logo/lab) after success', async () => {
    const { svc, recordSettingChanged } = make();
    await svc.removeLogo();
    expect(recordSettingChanged).toHaveBeenCalledWith(
      expect.objectContaining({ settingKey: 'company_logo', scope: 'lab' }),
    );
  });
});
