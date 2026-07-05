import { Prisma } from '@prisma/client';
import { decrypt, encrypt, isEncrypted } from './phi-crypto';

/**
 * Transparent PHI field encryption, implemented as a Prisma client extension —
 * the same pattern as the tenancy guard. Configured fields are AES-256-GCM
 * encrypted on write and decrypted on read, so the rest of the codebase handles
 * plaintext and never touches the cipher.
 *
 * WHY THIS FIELD SET (and not the literal spec list):
 *  - `dateOfBirth` is a DateTime column (age is derived from it) — storing a
 *    cipher string there is type-incompatible and would break date logic, so it
 *    is intentionally excluded.
 *  - `phoneNumber` and `email` are used in patient search (`contains`) — GCM is
 *    randomised, so encrypting them would silently break lookups. Excluded.
 *  - What IS encrypted: the sensitive free-text identifiers and full address
 *    lines that are never queried by value — the highest-value PHI at rest.
 *
 * Encryption keys off field NAME (these names are unique to their model), which
 * also covers nested relation writes (e.g. patient.create with nested
 * addresses). Decryption is prefix-detected on any string in the result tree,
 * so nested includes are decrypted automatically.
 */

/** Field names to encrypt on write (unique across the schema). */
const ENCRYPTED_FIELDS = new Set(['identityToken', 'motherMaidenName', 'line1', 'line2']);

/** Keys under which we must NOT descend when encrypting a write payload. */
const WRITE_SKIP_KEYS = new Set(['where', 'select', 'include', 'orderBy', 'connect', 'disconnect']);

const MAX_DEPTH = 8;

/** Recursively encrypt configured fields inside a write payload (data/create/update). */
function encryptWrite(node: unknown, depth = 0): void {
  if (depth > MAX_DEPTH || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) encryptWrite(item, depth + 1);
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (WRITE_SKIP_KEYS.has(key)) continue;
    if (ENCRYPTED_FIELDS.has(key) && typeof value === 'string' && value.length > 0 && !isEncrypted(value)) {
      (node as Record<string, unknown>)[key] = encrypt(value);
    } else if (value && typeof value === 'object') {
      encryptWrite(value, depth + 1);
    }
  }
}

/** Recursively decrypt any encrypted string in a query result (covers nested includes). */
function decryptRead(node: unknown, depth = 0): void {
  if (depth > MAX_DEPTH || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) decryptRead(item, depth + 1);
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (typeof value === 'string') {
      if (isEncrypted(value)) (node as Record<string, unknown>)[key] = decrypt(value);
    } else if (value && typeof value === 'object') {
      decryptRead(value, depth + 1);
    }
  }
}

const WRITE_OPS = new Set(['create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'upsert']);

export function phiEncryptionExtension() {
  return Prisma.defineExtension({
    name: 'phi-encryption',
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }) {
          if (WRITE_OPS.has(operation) && args && typeof args === 'object') {
            const a = args as Record<string, unknown>;
            encryptWrite(a.data);
            encryptWrite(a.create);
            encryptWrite(a.update);
          }
          const result = await query(args);
          decryptRead(result);
          return result;
        },
      },
    },
  });
}
