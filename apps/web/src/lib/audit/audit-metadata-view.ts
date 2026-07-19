/**
 * Program 2 · P2-8C — pure helpers for rendering bounded audit metadata. Deterministic key order +
 * safe value formatting; NO inference beyond the returned object, NO HTML, NO editable derivation.
 * (The frozen metadata contracts are scalar-only; array/object handling is defensive fallback only.)
 */
export type MetadataObject = Record<string, unknown> | null;

/** Entries in a deterministic (alphabetical) key order. */
export function orderedMetadataEntries(metadata: MetadataObject): Array<[string, unknown]> {
  if (!metadata) return [];
  return Object.keys(metadata)
    .sort()
    .map((k) => [k, metadata[k]] as [string, unknown]);
}

/** Render a metadata value as a safe, read-only string. Scalars pass through; the (contract-forbidden)
 *  object/array case is JSON-stringified defensively rather than trusted or spread. */
export function formatMetadataValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number' || typeof v === 'string') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return '[unrenderable]';
  }
}
