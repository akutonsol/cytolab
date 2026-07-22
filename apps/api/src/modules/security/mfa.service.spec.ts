import { BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { Secret, TOTP } from 'otpauth';
import { MfaService } from './mfa.service';

/**
 * R-007 — regression coverage for MFA. Real argon2 + real TOTP (otpauth); Prisma/mail mocked.
 * Encryption is a passthrough so the stored base32 round-trips. Each subsystem has a negative control.
 */
const EMAIL = 'user@x.test';
const secret = new Secret({ size: 20 });
const base32 = secret.base32;
const validTotp = () =>
  new TOTP({ issuer: 'Cytolab', label: EMAIL, digits: 6, period: 30, secret: Secret.fromBase32(base32) }).generate();

const make = () => {
  const prisma: any = {
    mfaConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    mfaChallenge: {
      findFirst: jest.fn(),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
  };
  const encryption = { encrypt: (s: string) => s, decrypt: (s: string) => s } as any;
  const svc = new MfaService(prisma, { runSystem: (fn: any) => fn() } as any, { send: jest.fn() } as any, encryption);
  return { svc, prisma };
};
const user = { id: 'u1', email: EMAIL };

describe('MfaService — TOTP enrolment', () => {
  it('a valid first code enables TOTP and mints exactly 8 one-time backup codes', async () => {
    const { svc, prisma } = make();
    prisma.mfaConfig.findUnique.mockResolvedValue({ totpSecret: base32, totpEnabled: false, backupCodes: [] });
    const res = await svc.verifyTotpSetup(user, validTotp());
    expect(res.backupCodes).toHaveLength(8);
    expect(prisma.mfaConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ totpEnabled: true }) }),
    );
  });

  it('NEGATIVE: an invalid TOTP code is rejected and does not enable MFA', async () => {
    const { svc, prisma } = make();
    prisma.mfaConfig.findUnique.mockResolvedValue({ totpSecret: base32, totpEnabled: false, backupCodes: [] });
    await expect(svc.verifyTotpSetup(user, '000000')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.mfaConfig.update).not.toHaveBeenCalled();
  });

  it('NEGATIVE: verifying before setup (no secret) is rejected', async () => {
    const { svc, prisma } = make();
    prisma.mfaConfig.findUnique.mockResolvedValue(null);
    await expect(svc.verifyTotpSetup(user, validTotp())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('disableTotp requires a valid code', async () => {
    const { svc, prisma } = make();
    prisma.mfaConfig.findUnique.mockResolvedValue({ totpEnabled: true, totpSecret: base32, backupCodes: [] });
    await expect(svc.disableTotp(user, '000000')).rejects.toBeInstanceOf(BadRequestException);
    await svc.disableTotp(user, validTotp());
    expect(prisma.mfaConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ totpEnabled: false }) }),
    );
  });
});

describe('MfaService — backup codes are single-use', () => {
  it('consumes a backup code once, then rejects the same code (removed from the set)', async () => {
    const { svc, prisma } = make();
    const code = 'ABCD234567';
    const hash = await argon2.hash(code);
    // Stateful config: verifyLoginCode reads it, then consumeBackupCode re-reads it, and the
    // successful consume persists the reduced set — so the second attempt sees no matching code.
    let codes = [hash];
    prisma.mfaConfig.findUnique.mockImplementation(async () => ({ totpEnabled: false, emailEnabled: false, backupCodes: codes }));
    prisma.mfaConfig.update.mockImplementation(async ({ data }: any) => { codes = data.backupCodes; return {}; });

    expect(await svc.verifyLoginCode(user, code)).toBe(true); // first use accepted
    expect(codes).toEqual([]); // consumed
    // NEGATIVE: the same code again → no matching unused hash → rejected.
    expect(await svc.verifyLoginCode(user, code)).toBe(false);
  });
});

describe('MfaService — email OTP', () => {
  it('verifies a live OTP once and marks it used (single-use)', async () => {
    const { svc, prisma } = make();
    const hash = await argon2.hash('123456');
    prisma.mfaChallenge.findFirst.mockResolvedValue({ id: 'c1', code: hash });
    expect(await svc.verifyEmailOtp('u1', '123456')).toBe(true);
    expect(prisma.mfaChallenge.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1' }, data: expect.objectContaining({ usedAt: expect.any(Date) }) }),
    );
  });

  it('NEGATIVE: an expired or already-used OTP (no live challenge) is rejected', async () => {
    const { svc, prisma } = make();
    prisma.mfaChallenge.findFirst.mockResolvedValue(null); // the live-challenge filter excludes expired/used
    expect(await svc.verifyEmailOtp('u1', '123456')).toBe(false);
    expect(prisma.mfaChallenge.update).not.toHaveBeenCalled();
  });

  it('NEGATIVE: a wrong OTP against a live challenge is rejected and not consumed', async () => {
    const { svc, prisma } = make();
    const hash = await argon2.hash('123456');
    prisma.mfaChallenge.findFirst.mockResolvedValue({ id: 'c1', code: hash });
    expect(await svc.verifyEmailOtp('u1', '999999')).toBe(false);
    expect(prisma.mfaChallenge.update).not.toHaveBeenCalled();
  });
});
