/**
 * Program 2 · P2-1 — Deterministic canonicalization FOUNDATION (contract §Integrity).
 *
 * Produces a stable, order-independent string for a bounded scalar map so that a future
 * hash chain (P2-4) computes the same digest regardless of key insertion order. P2-1 only
 * establishes and tests this determinism — it does NOT compute selfHash/prevHash, assign a
 * chain, or make any tamper-evidence claim. Those are P2-4.
 */

export type CanonicalScalar = string | number | boolean | null;
export type CanonicalInput = Record<string, CanonicalScalar | undefined>;

/**
 * Canonical form: keys sorted lexicographically, `undefined` and empty values dropped,
 * each pair rendered as `key=JSON(value)` joined by `\n`. Deterministic for a given map.
 * Intentionally rejects nested objects/arrays — the audit envelope is flat scalars, and a
 * nested structure would reintroduce ordering ambiguity the hash chain must not depend on.
 */
export function canonicalize(input: CanonicalInput): string {
  const keys = Object.keys(input)
    .filter((k) => input[k] !== undefined)
    .sort();
  return keys
    .map((k) => {
      const v = input[k];
      if (v !== null && typeof v === 'object') {
        throw new Error(
          `canonicalize: value for "${k}" must be a scalar (nested structures are not canonicalizable)`,
        );
      }
      return `${k}=${JSON.stringify(v)}`;
    })
    .join('\n');
}
