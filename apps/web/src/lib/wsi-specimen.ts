// P5-7 — case & specimen integration. ONE shared derivation of specimen grouping so the diagnostic-case
// and sign-out workspaces group slides from the SAME persisted truth (never conflicting assignment logic).
//
// Grouping is derived exclusively from each slide's persisted `specimenId`. A slide with a null specimen
// anchor is placed in the explicit record-level/unassigned bucket — it is NEVER fabricated into a specimen.
// Grouping implies nothing about review, completeness, publication, viewability, or spatial relationship.

import type { SlideSpecimenRef } from './wsi';

export const UNASSIGNED_KEY = '__unassigned__';

export interface SlideWithSpecimen {
  specimenId: string | null;
  specimen: SlideSpecimenRef | null;
}

export interface SpecimenGroup<T extends SlideWithSpecimen> {
  key: string; // specimen id, or UNASSIGNED_KEY
  specimen: SlideSpecimenRef | null; // null for the unassigned/record-level bucket
  slides: T[];
}

/** Human label for a specimen bucket: persisted label if present, else the persisted type. Never invented. */
export function specimenGroupLabel(specimen: SlideSpecimenRef | null): string {
  if (!specimen) return 'Unassigned (record-level)';
  return specimen.label?.trim() || specimen.type;
}

/**
 * Group slides by their persisted specimen anchor. Deterministic: specimen groups first, ordered by
 * (label|type, id); the unassigned/record-level bucket always last. Slide order within a group is
 * preserved from the input (the callers pass owner-ordered, uploadedAt-desc rows).
 */
export function groupSlidesBySpecimen<T extends SlideWithSpecimen>(slides: T[]): SpecimenGroup<T>[] {
  const byKey = new Map<string, SpecimenGroup<T>>();
  for (const s of slides) {
    const key = s.specimenId ?? UNASSIGNED_KEY;
    let g = byKey.get(key);
    if (!g) { g = { key, specimen: s.specimenId ? s.specimen : null, slides: [] }; byKey.set(key, g); }
    g.slides.push(s);
  }
  const groups = Array.from(byKey.values());
  groups.sort((a, b) => {
    const au = a.key === UNASSIGNED_KEY, bu = b.key === UNASSIGNED_KEY;
    if (au !== bu) return au ? 1 : -1; // unassigned always last
    if (au && bu) return 0;
    const al = specimenGroupLabel(a.specimen), bl = specimenGroupLabel(b.specimen);
    return al !== bl ? al.localeCompare(bl) : a.key.localeCompare(b.key);
  });
  return groups;
}
