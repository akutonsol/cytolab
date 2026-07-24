/**
 * Program 5B · P5-6.3 — response contract for the controlled publication endpoint. Carries only useful,
 * non-sensitive domain identifiers (D-E63). A fresh publication returns the shared publication-event id and
 * the superseded generation (if any); an idempotent re-publish returns applied:false with no fabricated
 * event id. There is NO request body (no precondition in this cut — D2).
 */
export type PublishResponse =
  | {
      outcome: 'PUBLISHED';
      applied: true;
      generationId: string;
      publicationEventId: string;
      supersededGenerationId: string | null;
    }
  | {
      outcome: 'ALREADY_PUBLISHED';
      applied: false;
      generationId: string;
    };
