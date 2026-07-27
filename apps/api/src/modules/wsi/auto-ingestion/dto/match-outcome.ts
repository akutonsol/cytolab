// Program 5B · B1 — the accession-matching CONTRACT. A resolver returns a TRUTHFUL outcome and never
// forces/fabricates a record association. There is no "fuzzy/contains" outcome — only exact-key results.
export type MatchOutcome =
  | { kind: 'unique'; recordId: string; matchedBy: 'labNumber' | 'identifier' }
  | { kind: 'none' }
  | { kind: 'ambiguous'; candidateRecordIds: string[] };
