import { createHash, randomBytes } from 'crypto';

/**
 * Credential tokens (invite / reset): the raw token is emailed to the user; only
 * its SHA-256 hash is persisted, so a database leak never yields a usable token.
 * (SHA-256 is appropriate here — these are 256-bit random, high-entropy values,
 * not low-entropy passwords, so they need no slow KDF.)
 */
export function generateRawToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export const INVITE_TTL_HOURS = 72;
export const RESET_TTL_HOURS = 1;

export function expiryFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}
