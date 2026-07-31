import { randomBytes } from 'node:crypto';
import { sha256 } from '../../common/crypto/phi-crypto';

/**
 * Program 7 · Phase 7B.2 — the opaque staff-invitation token (Clarification 3 / I2). A 256-bit high-entropy random
 * token is the ONLY thing carried in the invitation URL; the server resolves the lab/user/invitation from its hash.
 * At rest the token is stored HASH-ONLY (sha256) — the plaintext is emailed once and never persisted/logged/audited (I3).
 */
export const STAFF_INVITATION_TTL_MS = 72 * 60 * 60 * 1000; // 72h (I4)

/** A 256-bit opaque, URL-safe token. Returned once (email); never stored. */
export function generateInvitationToken(): string {
  return randomBytes(32).toString('base64url');
}

/** sha256 of the token — the stored lookup key (unique index ⇒ constant-time lookup, no plaintext compare). */
export function hashInvitationToken(raw: string): string {
  return sha256(raw);
}

/** A random, unusable placeholder secret whose Argon2id hash seeds an INVITED user (Model C — passwordHash stays NOT NULL). */
export function generatePlaceholderSecret(): string {
  return randomBytes(32).toString('base64url');
}
