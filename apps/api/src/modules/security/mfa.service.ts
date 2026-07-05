import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes, randomInt } from 'node:crypto';
import * as QRCode from 'qrcode';
import { Secret, TOTP } from 'otpauth';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { MailService } from '../portal/mail/mail.service';
import { EncryptionService } from '../../common/encryption.service';

const ISSUER = 'Cytolab';
const TOTP_WINDOW = 1; // ±1 step (30s) clock skew tolerance
const BACKUP_CODE_COUNT = 8;
const BACKUP_CODE_LEN = 10;
const EMAIL_OTP_TTL_MS = 10 * 60_000;
const BACKUP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars

@Injectable()
export class MfaService {
  constructor(
    private prisma: PrismaService,
    private labContext: LabContext,
    private mail: MailService,
    private encryption: EncryptionService,
  ) {}

  /** Whether the user has any active MFA method. */
  async hasMfa(userId: string): Promise<boolean> {
    const cfg = await this.prisma.mfaConfig.findUnique({ where: { userId } });
    return !!cfg && (cfg.totpEnabled || cfg.emailEnabled);
  }

  async getStatus(userId: string): Promise<{ totpEnabled: boolean; emailEnabled: boolean; backupCodesRemaining: number }> {
    const cfg = await this.prisma.mfaConfig.findUnique({ where: { userId } });
    return {
      totpEnabled: cfg?.totpEnabled ?? false,
      emailEnabled: cfg?.emailEnabled ?? false,
      backupCodesRemaining: cfg?.backupCodes.length ?? 0,
    };
  }

  // --- TOTP ------------------------------------------------------------------

  /** Generate a new TOTP secret (stored encrypted, not yet enabled) + QR/manual key. */
  async setupTotp(user: { id: string; email: string }): Promise<{ qrCode: string; manualEntryKey: string }> {
    const secret = new Secret({ size: 20 });
    const totp = new TOTP({ issuer: ISSUER, label: user.email, digits: 6, period: 30, secret });
    const uri = totp.toString();
    const qrCode = await QRCode.toDataURL(uri); // data:image/png;base64,...

    await this.prisma.mfaConfig.upsert({
      where: { userId: user.id },
      create: { userId: user.id, totpSecret: this.encryption.encrypt(secret.base32), totpEnabled: false },
      update: { totpSecret: this.encryption.encrypt(secret.base32), totpEnabled: false },
    });
    return { qrCode, manualEntryKey: secret.base32 };
  }

  /** Verify the first TOTP code, enable TOTP, and mint 8 one-time backup codes. */
  async verifyTotpSetup(user: { id: string; email: string }, code: string): Promise<{ backupCodes: string[] }> {
    const cfg = await this.prisma.mfaConfig.findUnique({ where: { userId: user.id } });
    if (!cfg?.totpSecret) throw new BadRequestException('Start TOTP setup first.');
    if (!this.verifyTotpCode(cfg.totpSecret, user.email, code)) {
      throw new BadRequestException('Invalid verification code.');
    }
    const backupCodes = this.generateBackupCodes();
    const hashed = await Promise.all(backupCodes.map((c) => argon2.hash(c)));
    await this.prisma.mfaConfig.update({
      where: { userId: user.id },
      data: { totpEnabled: true, backupCodes: hashed },
    });
    return { backupCodes };
  }

  /** Disable TOTP — requires a current valid code (or backup code). */
  async disableTotp(user: { id: string; email: string }, code: string): Promise<void> {
    const cfg = await this.prisma.mfaConfig.findUnique({ where: { userId: user.id } });
    if (!cfg?.totpEnabled || !cfg.totpSecret) throw new BadRequestException('TOTP is not enabled.');
    const ok =
      this.verifyTotpCode(cfg.totpSecret, user.email, code) ||
      (await this.consumeBackupCode(user.id, code));
    if (!ok) throw new BadRequestException('Invalid verification code.');
    await this.prisma.mfaConfig.update({
      where: { userId: user.id },
      data: { totpEnabled: false, totpSecret: null, backupCodes: [] },
    });
  }

  private verifyTotpCode(encryptedSecret: string, email: string, code: string): boolean {
    const base32 = this.encryption.decrypt(encryptedSecret);
    const totp = new TOTP({
      issuer: ISSUER,
      label: email,
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(base32),
    });
    return totp.validate({ token: code.trim(), window: TOTP_WINDOW }) !== null;
  }

  // --- Email OTP -------------------------------------------------------------

  /** Generate + email a 6-digit OTP, storing its hash as a challenge. */
  async sendEmailOtp(user: { id: string; email: string; firstName?: string }): Promise<void> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const hash = await argon2.hash(code);
    await this.prisma.mfaChallenge.create({
      data: { userId: user.id, type: 'email', code: hash, expiresAt: new Date(Date.now() + EMAIL_OTP_TTL_MS) },
    });
    await this.prisma.mfaConfig.upsert({
      where: { userId: user.id },
      create: { userId: user.id, emailEnabled: true },
      update: { emailEnabled: true },
    });
    await this.mail.send(
      user.email,
      'Your Cytolab verification code',
      `<p>Hi ${user.firstName ?? ''},</p>
       <p>Your verification code is <strong style="font-size:20px;letter-spacing:3px">${code}</strong>.</p>
       <p>It expires in 10 minutes. If you didn't request it, ignore this email.</p>`,
    );
  }

  /** Verify an emailed OTP against the latest live challenge; single-use. */
  async verifyEmailOtp(userId: string, code: string): Promise<boolean> {
    const challenge = await this.prisma.mfaChallenge.findFirst({
      where: { userId, type: 'email', usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge?.code) return false;
    const ok = await argon2.verify(challenge.code, code.trim()).catch(() => false);
    if (ok) await this.prisma.mfaChallenge.update({ where: { id: challenge.id }, data: { usedAt: new Date() } });
    return ok;
  }

  // --- Unified login-time verification --------------------------------------

  /**
   * Verify a code presented during the MFA login step. Accepts a TOTP code, a
   * live email OTP, or a one-time backup code — whichever the user has.
   */
  async verifyLoginCode(user: { id: string; email: string }, code: string): Promise<boolean> {
    const cfg = await this.prisma.mfaConfig.findUnique({ where: { userId: user.id } });
    if (!cfg) return false;
    if (cfg.totpEnabled && cfg.totpSecret && this.verifyTotpCode(cfg.totpSecret, user.email, code)) return true;
    if (cfg.emailEnabled && (await this.verifyEmailOtp(user.id, code))) return true;
    return this.consumeBackupCode(user.id, code);
  }

  // --- Backup codes ----------------------------------------------------------

  private generateBackupCodes(): string[] {
    return Array.from({ length: BACKUP_CODE_COUNT }, () => {
      const bytes = randomBytes(BACKUP_CODE_LEN);
      let out = '';
      for (let i = 0; i < BACKUP_CODE_LEN; i++) out += BACKUP_ALPHABET[bytes[i] % BACKUP_ALPHABET.length];
      return out;
    });
  }

  /** Consume a backup code if it matches an unused one (removes it). */
  private async consumeBackupCode(userId: string, code: string): Promise<boolean> {
    const cfg = await this.prisma.mfaConfig.findUnique({ where: { userId } });
    if (!cfg?.backupCodes.length) return false;
    const candidate = code.trim().toUpperCase();
    for (const hash of cfg.backupCodes) {
      if (await argon2.verify(hash, candidate).catch(() => false)) {
        await this.prisma.mfaConfig.update({
          where: { userId },
          data: { backupCodes: cfg.backupCodes.filter((h) => h !== hash) },
        });
        return true;
      }
    }
    return false;
  }

  // --- Admin -----------------------------------------------------------------

  /** Admin override: wipe all MFA config for a user (they'll re-enrol). */
  async resetMfa(userId: string): Promise<void> {
    const cfg = await this.prisma.mfaConfig.findUnique({ where: { userId } });
    if (!cfg) throw new NotFoundException('No MFA configuration for this user.');
    await this.prisma.mfaConfig.delete({ where: { userId } });
    await this.prisma.mfaChallenge.deleteMany({ where: { userId } });
  }
}
