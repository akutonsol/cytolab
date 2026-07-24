import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DeliveryScope, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { PublishedGenerationResolver } from './published-generation.resolver';
import { DELIVERY_SESSION_CONFIG } from './delivery.constants';

/**
 * Program 5A · P5-5A-ii — issue / redeem / revoke short-lived, generation-bound viewing capabilities.
 *
 * The DATABASE is authoritative: validity = revokedAt IS NULL AND expiresAt > now; the bound generation,
 * scopes, actor, lab, and slide come from the persisted row, never from client claims. Only SHA-256(raw)
 * is stored; the raw 256-bit token is returned ONCE and never logged/persisted/put in exceptions. Issuance
 * binds the generation authoritative at issuance time (slide locked FOR UPDATE); redemption keeps serving
 * a since-SUPERSEDED (still immutable) generation but rejects ARCHIVED. No object-store I/O in any tx.
 */

export interface DeliverySessionConfig {
  defaultTtlMs: number;
  maxTtlMs: number;
}
export function loadDeliverySessionConfig(env: NodeJS.ProcessEnv = process.env): DeliverySessionConfig {
  const max = posNum(env.WSI_DELIVERY_MAX_TTL_MS, 15 * 60_000);
  const def = posNum(env.WSI_DELIVERY_TTL_MS, 10 * 60_000);
  return { defaultTtlMs: Math.min(def, max), maxTtlMs: max }; // default can never exceed the ceiling
}
function posNum(v: string | undefined, d: number): number {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
}

export interface IssueInput {
  labId: string;
  actorUserId: string;
  slideId: string;
  scopes: DeliveryScope[];
  ttlMs?: number;
}
export interface IssuedSession {
  sessionId: string;
  generationId: string;
  scopes: DeliveryScope[];
  expiresAt: Date;
}
export interface IssueResult {
  rawToken: string; // returned ONCE — never persisted/logged
  session: IssuedSession;
}
export interface ValidatedCapability {
  sessionId: string;
  labId: string;
  slideId: string;
  generationId: string;
  actorUserId: string;
  scopes: DeliveryScope[];
}
export type RevokeResult = 'REVOKED' | 'NOT_CHANGED';

/** A requested TTL was non-positive or exceeded the configured ceiling. */
export class InvalidTtlError extends Error {
  constructor(requestedMs: number, maxMs: number) {
    super(`invalid delivery TTL ${requestedMs}ms (must be > 0 and <= ${maxMs}ms)`);
    this.name = 'InvalidTtlError';
  }
}
/** The slide is not accessible to the issuing lab (missing or cross-lab). */
export class SlideNotAccessibleError extends Error {
  constructor(slideId: string) {
    super(`slide ${slideId} is not accessible`);
    this.name = 'SlideNotAccessibleError';
  }
}
/** At least one scope must be requested. */
export class EmptyScopeError extends Error {
  constructor() {
    super('a delivery session must request at least one scope');
    this.name = 'EmptyScopeError';
  }
}
/** No live session matches the presented token. */
export class InvalidTokenError extends Error {
  constructor() {
    super('invalid delivery token');
    this.name = 'InvalidTokenError';
  }
}
export class ExpiredTokenError extends Error {
  constructor() {
    super('delivery token expired');
    this.name = 'ExpiredTokenError';
  }
}
export class RevokedTokenError extends Error {
  constructor() {
    super('delivery token revoked');
    this.name = 'RevokedTokenError';
  }
}
/** The persisted session's lab/slide/generation relationship no longer holds (integrity failure). */
export class SessionBindingError extends Error {
  constructor(detail: string) {
    super(`delivery session binding invalid: ${detail}`);
    this.name = 'SessionBindingError';
  }
}
/** The bound generation is no longer deliverable (e.g. ARCHIVED). */
export class BoundGenerationUnavailableError extends Error {
  constructor(status: string) {
    super(`bound generation is not deliverable (status=${status})`);
    this.name = 'BoundGenerationUnavailableError';
  }
}
/** The bound generation lost its seal/verify invariant (integrity failure). */
export class BoundGenerationIntegrityError extends Error {
  constructor(detail: string) {
    super(`bound generation integrity: ${detail}`);
    this.name = 'BoundGenerationIntegrityError';
  }
}
/** A required capability scope is not present on the session. */
export class ScopeError extends Error {
  constructor(scope: DeliveryScope) {
    super(`delivery session lacks required scope ${scope}`);
    this.name = 'ScopeError';
  }
}

@Injectable()
export class DeliverySessionService {
  private readonly logger = new Logger(DeliverySessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: PublishedGenerationResolver,
    // Resolved explicitly from the DI graph (DELIVERY_SESSION_CONFIG); the default only serves direct
    // construction in tests — Nest never relies on it.
    @Inject(DELIVERY_SESSION_CONFIG) private readonly config: DeliverySessionConfig = loadDeliverySessionConfig(),
  ) {}

  /** Issue a capability bound to the slide's CURRENTLY published generation (must be PUBLISHED). */
  async issue(input: IssueInput): Promise<IssueResult> {
    if (input.scopes.length === 0) throw new EmptyScopeError();
    const ttlMs = input.ttlMs ?? this.config.defaultTtlMs;
    if (!(ttlMs > 0 && ttlMs <= this.config.maxTtlMs)) throw new InvalidTtlError(ttlMs, this.config.maxTtlMs); // R1 — bounded

    return this.prisma.$transaction(async (tx) => {
      const slideRows = await tx.$queryRaw<{ id: string; labId: string; publishedGenerationId: string | null }[]>`
        SELECT id, "labId", "publishedGenerationId" FROM "DigitalSlide" WHERE id = ${input.slideId} AND "labId" = ${input.labId} FOR UPDATE
      `;
      const slide = slideRows[0];
      if (!slide) throw new SlideNotAccessibleError(input.slideId);

      const resolved = await this.resolver.resolveForSlideRow(tx, slide);

      const rawToken = randomBytes(32).toString('base64url'); // 256-bit CSPRNG
      const tokenHash = sha256Hex(rawToken);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlMs);
      const sessionId = randomUUID();

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "DeliverySession" (id, "labId", "slideId", "generationId", "actorUserId", "tokenHash", scopes, "issuedAt", "expiresAt", "createdAt")
        VALUES (${sessionId}, ${input.labId}, ${resolved.slideId}, ${resolved.generationId}, ${input.actorUserId}, ${tokenHash},
                ARRAY[${Prisma.join(input.scopes)}]::"DeliveryScope"[], ${now}, ${expiresAt}, ${now})
      `);

      this.logger.log(`issued delivery session ${sessionId} for slide ${resolved.slideId} generation ${resolved.generationId}`);
      return { rawToken, session: { sessionId, generationId: resolved.generationId, scopes: input.scopes, expiresAt } };
    });
  }

  /** Redeem a raw token → a validated capability. Read-only; the DB is authoritative for validity. */
  async redeem(rawToken: string): Promise<ValidatedCapability> {
    const tokenHash = sha256Hex(rawToken); // never logged — it is the lookup credential
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string; labId: string; slideId: string; generationId: string; actorUserId: string; scopes: string[]; revokedAt: Date | null; expiresAt: Date }[]
      >`
        SELECT id, "labId", "slideId", "generationId", "actorUserId", scopes::text[] AS scopes, "revokedAt", "expiresAt"
        FROM "DeliverySession" WHERE "tokenHash" = ${tokenHash}
      `;
      const s = rows[0];
      if (!s) throw new InvalidTokenError();
      if (s.revokedAt != null) throw new RevokedTokenError();
      if (s.expiresAt <= new Date()) throw new ExpiredTokenError(); // R8 — boundary instant is expired

      // Re-verify the full binding from live state (don't trust the session row alone).
      const genRows = await tx.$queryRaw<{ id: string; slideId: string; labId: string; status: string; sealed: boolean; verified: boolean }[]>`
        SELECT id, "slideId", "labId", status, sealed, verified FROM "DerivativeGeneration" WHERE id = ${s.generationId}
      `;
      const g = genRows[0];
      if (!g || g.slideId !== s.slideId || g.labId !== s.labId) throw new SessionBindingError(`generation ${s.generationId} no longer binds slide ${s.slideId}/lab ${s.labId}`);

      const slideRows = await tx.$queryRaw<{ labId: string }[]>`SELECT "labId" FROM "DigitalSlide" WHERE id = ${s.slideId}`;
      if (!slideRows[0] || slideRows[0].labId !== s.labId) throw new SessionBindingError(`slide ${s.slideId} no longer belongs to lab ${s.labId}`);

      if (!g.sealed || !g.verified) throw new BoundGenerationIntegrityError(`generation ${g.id} sealed=${g.sealed} verified=${g.verified}`);
      // A since-SUPERSEDED generation is still immutable → deliverable; ARCHIVED (or anything else) is not.
      if (g.status !== 'PUBLISHED' && g.status !== 'SUPERSEDED') throw new BoundGenerationUnavailableError(g.status);

      return {
        sessionId: s.id,
        labId: s.labId,
        slideId: s.slideId,
        generationId: s.generationId,
        actorUserId: s.actorUserId,
        scopes: s.scopes as DeliveryScope[],
      };
    });
  }

  /**
   * Revoke a session — tenant-safe + idempotent. Returns a NEUTRAL result: it never distinguishes
   * "does not exist" / "another lab" / "already revoked", so revocation cannot become a cross-tenant
   * existence oracle. (R2)
   */
  async revoke(sessionId: string, labId: string): Promise<RevokeResult> {
    const affected = await this.prisma.$executeRaw`
      UPDATE "DeliverySession" SET "revokedAt" = ${new Date()} WHERE id = ${sessionId} AND "labId" = ${labId} AND "revokedAt" IS NULL
    `;
    return affected === 1 ? 'REVOKED' : 'NOT_CHANGED';
  }

  /** Pure scope check — no hierarchy/implication; a viewer that needs two scopes must hold both. */
  requireScope(capability: ValidatedCapability, scope: DeliveryScope): void {
    if (!capability.scopes.includes(scope)) throw new ScopeError(scope);
  }
}

function sha256Hex(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
