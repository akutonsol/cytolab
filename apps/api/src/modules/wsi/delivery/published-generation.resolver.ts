import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Program 5A · P5-5A-ii — resolve + validate the authoritative published generation for a slide, used at
 * delivery-session ISSUANCE. The three failure classes are deliberately distinct (an ordinary unpublished
 * slide is a normal negative; the others are integrity signals).
 */

/** The slide has no published generation (ordinary — not corruption). */
export class SlideNotPublishedError extends Error {
  constructor(slideId: string) {
    super(`slide ${slideId} has no published generation`);
    this.name = 'SlideNotPublishedError';
  }
}

/** The slide's published pointer disagrees with the generation it references (integrity failure). */
export class PublicationDivergenceError extends Error {
  constructor(detail: string) {
    super(`publication-state divergence: ${detail}`);
    this.name = 'PublicationDivergenceError';
  }
}

/** The published generation violates its own invariant (not sealed / not verified) — illegal state. */
export class IllegalPublishedGenerationError extends Error {
  constructor(detail: string) {
    super(`illegal published-generation state: ${detail}`);
    this.name = 'IllegalPublishedGenerationError';
  }
}

export interface LockedSlide {
  id: string;
  labId: string;
  publishedGenerationId: string | null;
}

export interface ResolvedPublishedGeneration {
  generationId: string;
  slideId: string;
  labId: string;
}

@Injectable()
export class PublishedGenerationResolver {
  /**
   * Validate + resolve the published generation for an ALREADY-LOADED (locked) slide row — the issuance
   * transaction has locked the slide, so no second slide read is performed here.
   */
  async resolveForSlideRow(tx: Prisma.TransactionClient, slide: LockedSlide): Promise<ResolvedPublishedGeneration> {
    if (slide.publishedGenerationId == null) throw new SlideNotPublishedError(slide.id);

    const rows = await tx.$queryRaw<{ id: string; slideId: string; status: string; sealed: boolean; verified: boolean }[]>`
      SELECT id, "slideId", status, sealed, verified FROM "DerivativeGeneration" WHERE id = ${slide.publishedGenerationId}
    `;
    const g = rows[0];
    if (!g) throw new PublicationDivergenceError(`slide ${slide.id} points to missing generation ${slide.publishedGenerationId}`);
    if (g.slideId !== slide.id) throw new PublicationDivergenceError(`published generation ${g.id} belongs to slide ${g.slideId}, not ${slide.id}`);
    if (g.status !== 'PUBLISHED') throw new PublicationDivergenceError(`published generation ${g.id} has status ${g.status}, not PUBLISHED`);
    if (!g.sealed || !g.verified) throw new IllegalPublishedGenerationError(`published generation ${g.id} is PUBLISHED but sealed=${g.sealed} verified=${g.verified}`);

    return { generationId: g.id, slideId: slide.id, labId: slide.labId };
  }
}
