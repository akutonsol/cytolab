import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, HumanReviewRequestState } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { AuditRecorder } from '../audit/audit-recorder.service';
import { isLegalRequestTransition, effectiveDecision } from './human-review-state';
import { CreateReviewRequestDto, AssignReviewDto, SubmitReviewDecisionDto, ReopenReviewDto } from './dto/human-review.dto';

/**
 * Program 6 · Phase 6E — human review workflow (the human owns the diagnosis).
 *
 * A downstream human-decision EVIDENCE layer over a completed (SUCCEEDED) InferenceRecord — SEPARATE from and never
 * modifying the authoritative clinical sign-out (ResultSheet/Record/AiDraft). The mutable HumanReviewRequest carries
 * routing; the immutable append-only HumanReviewDecision rows carry the human's ACCEPT/REJECT/MODIFY. The reviewer is
 * the AUTHENTICATED principal (never the request body). Every decision snapshots what was reviewed (Guardrail 1); an
 * optional explainability reference must belong to the same record (Guardrail 2); completion is a deterministic
 * boundary (Guardrail 3). Lab-scoped; cross-lab fails closed. No support inference; no support clinical authorization.
 */
@Injectable()
export class HumanReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRecorder,
  ) {}

  // ── request workflow (mutable routing; not clinical truth) ─────────────────────────────────────────────────
  async createRequest(dto: CreateReviewRequestDto, actorId?: string | null) {
    const record = await this.requireSucceededRecord(dto.inferenceRecordId);
    const now = new Date();
    const eventId = randomUUID();
    return this.prisma.$transaction(async (tx) => {
      const req = await tx.humanReviewRequest.create({
        data: tenantCreate<Prisma.HumanReviewRequestUncheckedCreateInput>({
          inferenceRecordId: record.id,
          state: 'PENDING',
          validationOnly: record.validationOnly,
          createdById: actorId ?? null,
        }),
      });
      await this.appendRequestEvent(tx, req.id, null, 'PENDING', actorId, eventId);
      return req;
    });
  }

  async assignReview(requestId: string, dto: AssignReviewDto, actorId?: string | null) {
    const assignee = await this.prisma.user.findFirst({ where: { id: dto.assigneeUserId }, select: { id: true } });
    if (!assignee) throw new BadRequestException('assignee not found in this lab');
    return this.transition(requestId, 'ASSIGNED', actorId, { assigneeUserId: dto.assigneeUserId });
  }

  /** Governed reopen of a COMPLETED/CANCELLED request — administrative workflow; never mutates decision history. */
  reopen(requestId: string, dto: ReopenReviewDto, actorId?: string | null) {
    return this.transition(requestId, dto.toState ?? 'PENDING', actorId);
  }

  cancel(requestId: string, actorId?: string | null) {
    return this.transition(requestId, 'CANCELLED', actorId);
  }

  private async transition(requestId: string, to: HumanReviewRequestState, actorId?: string | null, extra?: { assigneeUserId?: string }) {
    const now = new Date();
    const eventId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      const req = await tx.humanReviewRequest.findFirst({ where: { id: requestId }, select: { id: true, state: true } });
      if (!req) throw new NotFoundException('review request not found');
      if (!isLegalRequestTransition(req.state, to)) throw new BadRequestException(`illegal review transition: ${req.state} -> ${to}`);
      const cas = await tx.humanReviewRequest.updateMany({
        where: { id: requestId, state: req.state },
        data: { state: to, ...(extra?.assigneeUserId ? { assigneeUserId: extra.assigneeUserId } : {}), ...(to === 'PENDING' ? { assigneeUserId: null } : {}) },
      });
      if (cas.count !== 1) throw new ConflictException('review request state changed concurrently');
      await this.appendRequestEvent(tx, requestId, req.state, to, actorId, eventId);
    });
    await this.audit.recordEntityUpdated({ resource: { type: 'HumanReviewRequest', id: requestId }, changedFields: ['state'], producerModule: 'human-review' }).catch(() => undefined);
    return this.getRequest(requestId);
  }

  // ── decision (immutable, append-only, authenticated human) ─────────────────────────────────────────────────
  /**
   * Submit a human ACCEPT/REJECT/MODIFY decision. `reviewerUserId` is the AUTHENTICATED principal (Decision 3) — the
   * caller (controller) supplies it from request context, never the body. Writes an immutable decision + structured
   * MODIFY findings + (once) the request COMPLETED boundary + an audit event, all in one transaction.
   */
  async submitDecision(requestId: string, dto: SubmitReviewDecisionDto, reviewerUserId: string) {
    const req = await this.prisma.humanReviewRequest.findFirst({ where: { id: requestId }, select: { id: true, state: true, inferenceRecordId: true, completedAt: true } });
    if (!req) throw new NotFoundException('review request not found');
    if (req.state === 'CANCELLED') throw new BadRequestException('review request is CANCELLED; reopen it before submitting a decision');

    // Human ownership: the reviewer must be a real, authenticated user IN THIS LAB (fails closed cross-lab).
    const reviewer = await this.prisma.user.findFirst({ where: { id: reviewerUserId }, select: { id: true } });
    if (!reviewer) throw new BadRequestException('authenticated reviewer not found in this lab');

    const record = await this.requireSucceededRecord(req.inferenceRecordId);

    const findings = dto.modifiedFindings ?? [];
    if (dto.reviewDecision === 'MODIFY' && findings.length === 0) throw new BadRequestException('a MODIFY decision must carry at least one structured finding');
    if (dto.reviewDecision !== 'MODIFY' && findings.length > 0) throw new BadRequestException('only a MODIFY decision may carry modified findings');

    // Guardrail 2 — an optional explainability reference must belong to the SAME inference record + lab.
    if (dto.explainabilityGenerationId) {
      const gen = await this.prisma.explainabilityGeneration.findFirst({ where: { id: dto.explainabilityGenerationId }, select: { inferenceRecordId: true } });
      if (!gen) throw new BadRequestException('explainability generation not found in this lab');
      if (gen.inferenceRecordId !== req.inferenceRecordId) throw new BadRequestException('explainability generation belongs to a different inference record');
    }

    const correctionDigest = findings.length
      ? createHash('sha256').update(JSON.stringify(findings.map((f, i) => ({ findingCode: f.findingCode, valueCode: f.valueCode ?? null, valueNum: f.valueNum ?? null, ordinal: i })))).digest('hex')
      : null;
    const now = new Date();
    const eventId = randomUUID();

    const decision = await this.prisma.$transaction(async (tx) => {
      const dec = await tx.humanReviewDecision.create({
        data: tenantCreate<Prisma.HumanReviewDecisionUncheckedCreateInput>({
          requestId: req.id,
          inferenceRecordId: record.id,
          reviewerUserId, // authenticated principal — Decision 3
          reviewDecision: dto.reviewDecision,
          validationOnly: record.validationOnly, // inherited immutably — Decision 7
          reviewedModelVersionId: record.modelVersionId, // Guardrail 1 snapshot
          reviewedResultDigest: record.resultDigest ?? null,
          modelLifecycleStateAtReview: record.modelLifecycleStateAtRun ?? null,
          reviewRationale: dto.reviewRationale ?? null,
          correctionDigest,
          explainabilityGenerationId: dto.explainabilityGenerationId ?? null,
          eventId,
        }),
      });
      for (let i = 0; i < findings.length; i++) {
        const f = findings[i];
        await tx.humanReviewModifiedFinding.create({
          data: tenantCreate<Prisma.HumanReviewModifiedFindingUncheckedCreateInput>({
            decisionId: dec.id,
            findingCode: f.findingCode,
            valueCode: f.valueCode ?? null,
            valueNum: f.valueNum ?? null,
            ordinal: i,
          }),
        });
      }
      // Guardrail 3 — completion is a deterministic boundary, represented once. First completion sets it; a request
      // already COMPLETED (accruing further decisions) is not re-transitioned.
      if (req.state === 'PENDING' || req.state === 'ASSIGNED') {
        const cas = await tx.humanReviewRequest.updateMany({ where: { id: req.id, state: req.state }, data: { state: 'COMPLETED', completedAt: req.completedAt ?? now } });
        if (cas.count !== 1) throw new ConflictException('review request state changed concurrently');
        await this.appendRequestEvent(tx, req.id, req.state, 'COMPLETED', reviewerUserId, eventId);
      }
      return dec;
    });

    await this.audit.recordEntityCreated({ resource: { type: 'HumanReviewDecision', id: decision.id }, producerModule: 'human-review' }).catch(() => undefined);
    return this.getDecision(decision.id);
  }

  // ── reads ──────────────────────────────────────────────────────────────────────────────────────────────────
  listRequests() {
    return this.prisma.humanReviewRequest.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async getRequest(id: string) {
    const req = await this.prisma.humanReviewRequest.findFirst({
      where: { id },
      include: { decisions: { include: { modifiedFindings: { orderBy: { ordinal: 'asc' } } }, orderBy: { submittedAt: 'asc' } }, events: { orderBy: { occurredAt: 'asc' } } },
    });
    if (!req) throw new NotFoundException('review request not found');
    const effective = effectiveDecision(req.decisions.map((d) => ({ decisionUuid: d.decisionUuid, submittedAt: d.submittedAt, reviewDecision: d.reviewDecision })));
    return { ...req, effectiveReviewDecision: effective };
  }

  async getDecision(id: string) {
    const dec = await this.prisma.humanReviewDecision.findFirst({ where: { id }, include: { modifiedFindings: { orderBy: { ordinal: 'asc' } } } });
    if (!dec) throw new NotFoundException('review decision not found');
    return dec;
  }

  // ── helpers ────────────────────────────────────────────────────────────────────────────────────────────────
  /** Load a lab-scoped InferenceRecord and require it to be SUCCEEDED (Decision 7). Cross-lab fails closed. */
  private async requireSucceededRecord(inferenceRecordId: string) {
    const record = await this.prisma.inferenceRecord.findFirst({
      where: { id: inferenceRecordId },
      select: { id: true, outcome: true, validationOnly: true, modelVersionId: true, resultDigest: true, modelLifecycleStateAtRun: true },
    });
    if (!record) throw new NotFoundException('inference record not found');
    if (record.outcome !== 'SUCCEEDED') throw new BadRequestException(`human review requires a SUCCEEDED inference record (record is ${record.outcome ?? 'incomplete'})`);
    return record;
  }

  private async appendRequestEvent(tx: Prisma.TransactionClient, requestId: string, fromState: HumanReviewRequestState | null, toState: HumanReviewRequestState, actorId: string | null | undefined, eventId: string) {
    await tx.humanReviewRequestEvent.create({
      data: tenantCreate<Prisma.HumanReviewRequestEventUncheckedCreateInput>({
        requestId,
        fromState: fromState ?? null,
        toState,
        actorId: actorId ?? null,
        eventId,
      }),
    });
  }
}
