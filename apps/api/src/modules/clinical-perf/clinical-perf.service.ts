import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { AuditRecorder } from '../audit/audit-recorder.service';
import { CLINICAL_PERF_EVALUATOR } from './clinical-perf-tokens';
import { ClinicalPerfEvaluator, CpMember, GeneratedClinicalPerf } from './clinical-perf-evaluator';
import { isEligibleForClinicalPerf, validateClinicalPerfMetric, CLINICAL_PERF_METRICS_SCHEMA_VERSION, CLINICAL_PERF_COMPUTATION_VERSION, CLINICAL_PERF_WINDOW_DEFINITION_VERSION } from './clinical-perf-metrics';
import { RunClinicalPerfDto } from './dto/clinical-perf.dto';

/**
 * Program 6 · Phase 6H — clinical performance MEASUREMENT evidence (measurement only; never clinical authority).
 *
 * A manual `clinicalperf:run` binds an eligible model version to a time window + cohort, materializes the EXACT
 * eligible member population (6C InferenceRecords + 6E HumanReviewDecisions) as immutable member rows (Guardrail 3),
 * verifies compatibility (Guardrail 4), runs the deterministic stub, and persists an immutable measurement graph
 * (window + members + metrics) ATOMICALLY. Re-computation creates a NEW window. Lab-scoped; cross-lab fails closed.
 * NEVER creates/alters a diagnosis, sign-out, authorization, lifecycle, inference, validation, or continuous-eval
 * evidence (no support diagnostic authority). Program-5 is read-only coded operational metadata; no narrative/PHI; no
 * recommendation (Guardrail 5). Trends are derived from immutable windows, never stored.
 */
@Injectable()
export class ClinicalPerfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRecorder,
    @Inject(CLINICAL_PERF_EVALUATOR) private readonly evaluator: ClinicalPerfEvaluator,
  ) {}

  async runMeasurement(dto: RunClinicalPerfDto, actorId?: string | null) {
    const windowStart = new Date(dto.windowStart);
    const windowEnd = new Date(dto.windowEnd);
    if (!(windowStart.getTime() < windowEnd.getTime())) throw new BadRequestException('windowStart must be before windowEnd');
    const timeBasis = dto.timeBasis ?? 'UTC';
    const operationalDataUsed = dto.operationalDataUsed ?? false;

    const model = await this.prisma.aiModelVersion.findFirst({ where: { id: dto.modelVersionId }, select: { id: true, versionUuid: true, lifecycleState: true, model: { select: { modelUuid: true } } } });
    if (!model) throw new NotFoundException('AI model version not found');
    if (!isEligibleForClinicalPerf(model.lifecycleState)) {
      throw new BadRequestException(`model version is ${model.lifecycleState}; only VALIDATION, APPROVED, or DEPRECATED versions can be measured`);
    }

    // Optional baseline — same-lab, same-model-version, immutable 6F ValidationRun (Guardrail 4).
    let baselineValidationRunId: string | null = null;
    let baselineCalculationId: string | null = null;
    let evidenceCompatibility: 'OBSERVED' | 'UNAVAILABLE' = 'UNAVAILABLE';
    if (dto.baselineValidationRunId) {
      const vr = await this.prisma.validationRun.findFirst({ where: { id: dto.baselineValidationRunId }, select: { id: true, modelVersionId: true, calculationId: true } });
      if (!vr) throw new NotFoundException('baseline validation run not found');
      if (vr.modelVersionId !== model.id) throw new BadRequestException('baseline validation run belongs to a different model version');
      baselineValidationRunId = vr.id;
      baselineCalculationId = vr.calculationId;
      evidenceCompatibility = 'OBSERVED';
    }

    const validationOnly = dto.cohort === 'VALIDATION_ONLY';
    // Members: 6E human-review decisions + 6C inference records for this model version, cohort, in [start,end).
    const decisions = await this.prisma.humanReviewDecision.findMany({
      where: { reviewedModelVersionId: model.id, validationOnly, submittedAt: { gte: windowStart, lt: windowEnd } },
      select: { id: true, reviewDecision: true, inferenceRecordId: true },
      orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
    });
    const inferences = await this.prisma.inferenceRecord.findMany({
      where: { modelVersionId: model.id, validationOnly, outcome: { in: ['SUCCEEDED', 'FAILED', 'TIMED_OUT'] }, createdAt: { gte: windowStart, lt: windowEnd } },
      select: { id: true, outcome: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const members: CpMember[] = [
      ...decisions.map((d) => ({ source: 'HUMAN_REVIEW_DECISION' as const, inferenceRecordId: null, humanReviewDecisionId: d.id, outcome: null, reviewDecision: d.reviewDecision, subjectInferenceRecordId: d.inferenceRecordId })),
      ...inferences.map((r) => ({ source: 'INFERENCE_RECORD' as const, inferenceRecordId: r.id, humanReviewDecisionId: null, outcome: r.outcome, reviewDecision: null, subjectInferenceRecordId: r.id })),
    ];

    const configDigest = dto.config == null ? null : this.digest(this.stableStringify(dto.config));
    const windowDurationHours = (windowEnd.getTime() - windowStart.getTime()) / 3_600_000;
    const windowSignature = this.digest(this.stableStringify({ model: { modelVersionUuid: model.versionUuid, modelUuid: model.model.modelUuid, lifecycleState: model.lifecycleState }, cohort: dto.cohort, windowStart: dto.windowStart, windowEnd: dto.windowEnd, timeBasis, windowDefinitionVersion: CLINICAL_PERF_WINDOW_DEFINITION_VERSION, operationalDataUsed, configDigest, evaluatorId: this.evaluator.evaluatorId, evaluatorVersion: this.evaluator.evaluatorVersion }));

    const generated = await this.evaluator.evaluate({
      model: { modelVersionUuid: model.versionUuid, modelUuid: model.model.modelUuid, lifecycleState: model.lifecycleState },
      cohort: dto.cohort, members, windowStart: dto.windowStart, windowEnd: dto.windowEnd, timeBasis, windowDefinitionVersion: CLINICAL_PERF_WINDOW_DEFINITION_VERSION,
      baselineCalculationId, operationalDataUsed, configDigest, windowDurationHours,
    });
    this.validateGenerated(generated);

    const eventId = randomUUID();
    const window = await this.prisma.$transaction(async (tx) => {
      const w = await tx.clinicalPerfWindow.create({
        data: tenantCreate<Prisma.ClinicalPerfWindowUncheckedCreateInput>({
          modelVersionId: model.id, modelVersionUuid: model.versionUuid, modelUuid: model.model.modelUuid, modelLifecycleStateAtRun: model.lifecycleState,
          windowStart, windowEnd, timeBasis, windowDefinitionVersion: CLINICAL_PERF_WINDOW_DEFINITION_VERSION, cohort: dto.cohort,
          baselineValidationRunId, baselineCalculationId, evidenceCompatibility, operationalDataUsed,
          sampleCount: members.length, coverageStatus: generated.coverageStatus,
          evaluatorId: this.evaluator.evaluatorId, evaluatorVersion: this.evaluator.evaluatorVersion, computationVersion: CLINICAL_PERF_COMPUTATION_VERSION, metricSchemaVersion: CLINICAL_PERF_METRICS_SCHEMA_VERSION,
          configDigest, calculationId: generated.calculationId, windowSignature, completionState: 'COMPLETE', eventId, createdById: actorId ?? null,
        }),
      });
      for (let i = 0; i < members.length; i++) {
        const m = members[i];
        await tx.clinicalPerfWindowMember.create({ data: tenantCreate<Prisma.ClinicalPerfWindowMemberUncheckedCreateInput>({ windowId: w.id, source: m.source, inferenceRecordId: m.inferenceRecordId, humanReviewDecisionId: m.humanReviewDecisionId, ordinal: i }) });
      }
      for (const m of generated.metrics) {
        await tx.clinicalPerfMetric.create({ data: tenantCreate<Prisma.ClinicalPerfMetricUncheckedCreateInput>({ windowId: w.id, metricKind: m.metricKind, provenance: m.provenance, cohort: m.cohort, sourceSubsystem: m.sourceSubsystem, binCode: m.binCode ?? null, value: m.value ?? null, numeratorSource: m.numeratorSource ?? null, denominatorSource: m.denominatorSource ?? null, unit: m.unit ?? null, sampleCount: m.sampleCount ?? null, unavailableReason: m.unavailableReason ?? null, ordinal: m.ordinal }) });
      }
      return w;
    });

    await this.audit.recordEntityCreated({ resource: { type: 'ClinicalPerfWindow', id: window.id }, producerModule: 'clinical-perf' }).catch(() => undefined);
    return this.getWindow(window.id);
  }

  listWindows() {
    return this.prisma.clinicalPerfWindow.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async getWindow(id: string) {
    const w = await this.prisma.clinicalPerfWindow.findFirst({
      where: { id },
      include: { metrics: { orderBy: { ordinal: 'asc' } }, members: { orderBy: { ordinal: 'asc' } } },
    });
    if (!w) throw new NotFoundException('clinical performance window not found');
    return w;
  }

  // ── validation + helpers ─────────────────────────────────────────────────────────────────────────────────────
  private validateGenerated(g: GeneratedClinicalPerf): void {
    if (!/^[a-f0-9]{64}$/.test(g.calculationId) || !g.metrics.length) throw new BadRequestException('evaluator must produce a deterministic calculation id and at least one metric');
    for (const m of g.metrics) { const e = validateClinicalPerfMetric(m); if (e) throw new BadRequestException(`invalid metric: ${e}`); }
  }

  private digest(s: string): string {
    return createHash('sha256').update(s).digest('hex');
  }

  private stableStringify(value: unknown): string {
    const seen = new WeakSet();
    const norm = (v: unknown): unknown => {
      if (v === null || typeof v !== 'object') return v;
      if (seen.has(v as object)) throw new BadRequestException('config must not contain circular references');
      seen.add(v as object);
      if (Array.isArray(v)) return v.map(norm);
      return Object.keys(v as Record<string, unknown>).sort().reduce((acc, k) => { acc[k] = norm((v as Record<string, unknown>)[k]); return acc; }, {} as Record<string, unknown>);
    };
    return JSON.stringify(norm(value));
  }
}
