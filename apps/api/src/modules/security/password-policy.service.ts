import { BadRequestException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma.service';

/** Persisted, admin-tunable password policy (SystemConfig key `password_policy`). */
export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
  /** 0 = passwords never expire. */
  expiryDays: number;
  /** Failed attempts before the account auto-locks (informational; progressive
   * lockout thresholds live in LoginProtectionService). */
  maxFailedAttempts: number;
  /** How many previous hashes to block reuse against. */
  historyDepth: number;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: true,
  expiryDays: 0,
  maxFailedAttempts: 10,
  historyDepth: 10,
};

const POLICY_KEY = 'password_policy';
const SPECIAL_RE = /[^A-Za-z0-9]/;

export const ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const;

@Injectable()
export class PasswordPolicyService {
  constructor(private prisma: PrismaService) {}

  /** Current policy, falling back to the secure default (merged, so partial rows are safe). */
  async getPolicy(): Promise<PasswordPolicy> {
    const row = await (this.prisma as any).systemConfig.findUnique({ where: { key: POLICY_KEY } });
    if (!row?.value) return { ...DEFAULT_PASSWORD_POLICY };
    return { ...DEFAULT_PASSWORD_POLICY, ...(row.value as Partial<PasswordPolicy>) };
  }

  async updatePolicy(patch: Partial<PasswordPolicy>): Promise<PasswordPolicy> {
    const current = await this.getPolicy();
    const next: PasswordPolicy = { ...current, ...patch };
    await (this.prisma as any).systemConfig.upsert({
      where: { key: POLICY_KEY },
      update: { value: next as any },
      create: { key: POLICY_KEY, value: next as any },
    });
    return next;
  }

  /**
   * Return the list of policy rules a password violates (empty = compliant).
   * The caller decides whether to surface these (authenticated self-service) or
   * collapse them into a generic message (unauthenticated flows).
   */
  validate(password: string, policy: PasswordPolicy): string[] {
    const errors: string[] = [];
    if (password.length < policy.minLength) {
      errors.push(`Must be at least ${policy.minLength} characters.`);
    }
    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Must contain an uppercase letter.');
    }
    if (policy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Must contain a lowercase letter.');
    }
    if (policy.requireNumber && !/[0-9]/.test(password)) {
      errors.push('Must contain a number.');
    }
    if (policy.requireSpecial && !SPECIAL_RE.test(password)) {
      errors.push('Must contain a special character.');
    }
    return errors;
  }

  /**
   * Enforce complexity for an AUTHENTICATED self-service change — specific errors
   * are safe to reveal here (the user owns the account).
   */
  async assertCompliant(password: string): Promise<void> {
    const policy = await this.getPolicy();
    const errors = this.validate(password, policy);
    if (errors.length) throw new BadRequestException(errors);
  }

  /** Throw if the new password matches any of the last N stored hashes. */
  async assertNotReused(userId: string, newPassword: string): Promise<void> {
    const policy = await this.getPolicy();
    const history = await this.prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: policy.historyDepth,
    });
    for (const h of history) {
      if (await argon2.verify(h.hash, newPassword).catch(() => false)) {
        throw new BadRequestException(
          `Password was used recently. Choose one you have not used in your last ${policy.historyDepth} passwords.`,
        );
      }
    }
  }

  /** Hash with Argon2id at the mandated cost, and record it in history. */
  async hashAndRecord(userId: string, password: string): Promise<string> {
    const hash = await argon2.hash(password, ARGON2_OPTS);
    await this.prisma.passwordHistory.create({ data: { userId, hash } });
    return hash;
  }

  /** Compute passwordExpiresAt from the policy, or null when expiry is disabled. */
  async computeExpiry(from = new Date()): Promise<Date | null> {
    const policy = await this.getPolicy();
    if (!policy.expiryDays || policy.expiryDays <= 0) return null;
    return new Date(from.getTime() + policy.expiryDays * 86_400_000);
  }
}
