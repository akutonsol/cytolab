// Program 5B · B2 — pure helpers (deterministic, unit-tested).

/**
 * Quiescence rule (evaluated only once a discovery is already STABILIZING, i.e. at least a second poll):
 * a file is stable iff its size is UNCHANGED since the previously-persisted observation AND its mtime has
 * been quiet for `settleMs`. Two independent signals — size-stable-across-polls (the primary guard; defeats
 * a file still growing, even if copied with a preserved old mtime) and mtime-quiet (defeats an in-place
 * rewrite). Never trusts a single instantaneous stat. `prevSizeBytes === null` (never observed) is not stable.
 */
export function isStable(
  prevSizeBytes: number | null,
  curSizeBytes: number,
  mtimeMs: number,
  now: number,
  settleMs: number,
): boolean {
  return prevSizeBytes !== null && prevSizeBytes === curSizeBytes && now - mtimeMs >= settleMs;
}

/**
 * Extract the accession token from a discovered file's ref, per the source's configured convention.
 * Default = the filename stem (basename without the final extension). If `matchConfig.pattern` is a valid
 * regex, its first capture group (or full match) on the basename is used. Extraction is deterministic;
 * the extracted token is then matched EXACTLY (labNumber → identifier) by AccessionMatchResolver — there is
 * no fuzzy/contains/best-guess step anywhere.
 */
export function extractAccession(sourceRef: string, matchConfig: unknown): string {
  const base = sourceRef.split('/').pop() ?? sourceRef;
  const stem = base.replace(/\.[^.]+$/, '');
  const pattern = (matchConfig as { pattern?: unknown } | null | undefined)?.pattern;
  if (typeof pattern === 'string' && pattern) {
    try {
      const m = new RegExp(pattern).exec(base);
      if (m) return (m[1] ?? m[0]).trim();
    } catch {
      /* invalid configured pattern → fall back to the stem (never throw the whole scan) */
    }
  }
  return stem.trim();
}
