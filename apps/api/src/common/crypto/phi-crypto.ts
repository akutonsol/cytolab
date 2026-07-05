import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from 'node:crypto';

/**
 * PHI field-level encryption primitives (AES-256-GCM).
 *
 * Pure functions (no Nest DI) so the Prisma client extension — which is built
 * before the DI container is fully wired — can call them directly, while
 * {@link EncryptionService} wraps them for ordinary injectable use.
 *
 * Wire format: `v1:<iv>:<authTag>:<ciphertext>` (each part base64). The `v1`
 * prefix lets us (a) detect already-encrypted values so reads/writes stay
 * idempotent, and (b) rotate the scheme later without a data migration guess.
 *
 * SECURITY: never log the plaintext or the encrypted blob of a PHI value.
 */

const SCHEME = 'v1';
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const KEY_BYTES = 32; // AES-256

let cachedKey: Buffer | null = null;

/**
 * Resolve and validate the 32-byte key from ENCRYPTION_KEY (hex). Cached after
 * first use. Throws if missing/malformed — callers at startup surface this as a
 * hard boot failure so we never run with PHI encryption silently disabled.
 */
export function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      'ENCRYPTION_KEY is not set. A 32-byte hex key (64 hex chars) is required to encrypt PHI.',
    );
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `ENCRYPTION_KEY must be ${KEY_BYTES} bytes (${KEY_BYTES * 2} hex chars); got ${key.length} bytes.`,
    );
  }
  cachedKey = key;
  return key;
}

/** True if a value is one of our encrypted blobs (so we never double-encrypt). */
export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(`${SCHEME}:`);
}

/** Encrypt a UTF-8 string → `v1:iv:authTag:ciphertext` (base64 parts). */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    SCHEME,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/** Decrypt a `v1:iv:authTag:ciphertext` blob. Returns input unchanged if not encrypted. */
export function decrypt(encrypted: string): string {
  if (!isEncrypted(encrypted)) return encrypted;
  const [, ivB64, tagB64, dataB64] = encrypted.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = createDecipheriv(ALGO, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString('utf8');
}

/** SHA-256 hex — used for stable deviceId and token lookups (not for passwords). */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
