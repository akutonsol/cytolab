/**
 * Program 5A · P5-3B.2A — deterministic canonical JSON for the manifest.
 *
 * The same logical value ALWAYS produces identical UTF-8 bytes: object keys sorted lexicographically,
 * arrays kept in their given order (the builder supplies a deterministic order), explicit `null`
 * preserved, `undefined` omitted, numbers via the well-defined ECMAScript Number→String, strings via
 * JSON escaping, no insignificant whitespace, no trailing newline. A dedicated serializer (not the
 * flat-scalar audit canonicaliser) because the manifest is nested.
 */
export function canonicalSerialize(value: unknown): string {
  return serialize(value);
}

function serialize(v: unknown): string {
  if (v === null) return 'null';
  const t = typeof v;
  if (t === 'string') return JSON.stringify(v);
  if (t === 'boolean') return v ? 'true' : 'false';
  if (t === 'number') {
    if (!Number.isFinite(v as number)) throw new Error('non-finite number is not serializable in a manifest');
    return JSON.stringify(v); // deterministic shortest round-trip for a given IEEE-754 value
  }
  if (Array.isArray(v)) {
    return '[' + v.map((e) => serialize(e)).join(',') + ']';
  }
  if (t === 'object') {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined) // drop undefined; keep explicit null
      .sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + serialize(obj[k])).join(',') + '}';
  }
  throw new Error(`unserializable value of type ${t}`);
}
