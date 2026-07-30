import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { AuditRecorder } from '../audit/audit-recorder.service';
import { CONTINUOUS_EVALUATOR } from './continuous-eval-tokens';
import { ContinuousEvaluator, EvalMemberRecord, GeneratedEvaluation } from './continuous-evaluator';
import { isMonitorableLifecycle, validateEvalMetric, EVAL_METRICS_SCHEMA_VERSION, EVAL_COMPUTATION_VERSION, EVAL_WINDOW_DEFINITION_VERSION } from './continuous-eval-metrics';
import { RunEvaluationDto } from './dto/continuous-eval.dto';

/**
 * Program 6 · Phase 6G — continuous evaluation evidence (longitudinal, NOT autonomous).
 *
 * A manual `evaluation:run` binds a monitorable model version to an explicit time window + cohort, materializes the
 * EXACT eligible InferenceRecord population as immutable member rows (Guardrail 1), runs the deterministic stub, and
 * persists an immutable evidence graph (window + members + metrics + advisory recommendations + supporting evidence)
 * ATOMICALLY (Guardrails 5/12). Re-evaluation creates a NEW window (Decision 9). Lab-scoped; cross-lab fails closed.
 * NEVER mutates model lifecycle (no support lifecycle mutation; no automatic retirement), inference, validation, or
 * the clinical path. Trends are DERIVED from immutable windows (Guardrail 10), never stored.
 */
@Injectable()
export class ContinuousEvalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRecorder,
    @Inject(CONTINUOUS_EVALUATOR) private readonly evaluator: ContinuousEvaluator,
  ) {}

  async runEvaluation(dto: RunEvaluationDto, actorId?: string | null) {
    const windowStart = new Date(dto.windowStart);
    const windowEnd = new Date(dto.windowEnd);
    if (!(windowStart.getTime() < windowEnd.getTime())) throw new BadRequestException('windowStart must be before windowEnd');
    const timeBasis = dto.timeBasis ?? 'UTC';

    // Model must exist in this lab AND be monitorable (VALIDATION/APPROVED/DEPRECATED) — Decision 10. Read-only.
    const model = await this.prisma.aiModelVersion.findFirst({ where: { id: dto.modelVersionId }, select: { id: true, versionUuid: true, lifecycleState: true, model: { select: { modelUuid: true } } } });
    if (!model) throw new NotFoundException('AI model version not found');
    if (!isMonitorableLifecycle(model.lifecycleState)) {
      throw new BadRequestException(`model version is ${model.lifecycleState}; only VALIDATION, APPROVED, or DEPRECATED versions can be continuously evaluated`);
    }

    // Optional baseline — must be a same-lab, same-model-version, immutable 6F ValidationRun (Guardrail 3).
    let baseline: { validationRunId: string; calculationId: string } | null = null;
    let baselineCompatibility: 'OBSERVED' | 'UNAVAILABLE' = 'UNAVAILABLE';
    if (dto.baselineValidationRunId) {
      const vr = await this.prisma.validationRun.findFirst({ where: { id: dto.baselineValidationRunId }, select: { id: true, modelVersionId: true, calculationId: true } });
      if (!vr) throw new NotFoundException('baseline validation run not found');
      if (vr.modelVersionId !== model.id) throw new BadRequestException('baseline validation run belongs to a different model version');
      baseline = { validationRunId: vr.id, calculationId: vr.calculationId };
      baselineCompatibility = 'OBSERVED';
    }

    // Materialize the EXACT eligible member population (Guardrail 1) — terminal outcomes in [start,end), by cohort.
    const validationOnly = dto.cohort === 'VALIDATION_ONLY';
    const memberRows = await this.prisma.inferenceRecord.findMany({
      where: { modelVersionId: model.id, validationOnly, outcome: { in: ['SUCCEEDED', 'FAILED', 'TIMED_OUT'] }, createdAt: { gte: windowStart, lt: windowEnd } },
      select: { id: true, outcome: true, durationMs: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const members: EvalMemberRecord[] = memberRows.map((r) => ({ inferenceRecordId: r.id, outcome: r.outcome!, durationMs: r.durationMs }));

    const configDigest = dto.config == null ? null : this.digest(this.stableStringify(dto.config));
    const failureRateThreshold = this.resolveThreshold(dto.config);
    const thresholdConfigDigest = this.digest(this.stableStringify({ failureRateThreshold }));
    // Guardrail 8 — deterministic window identity for duplicate detection (does NOT include the member set).
    const windowSignature = this.digest(this.stableStringify({ model: { modelVersionUuid: model.versionUuid, modelUuid: model.model.modelUuid, lifecycleState: model.lifecycleState }, cohort: dto.cohort, windowStart: dto.windowStart, windowEnd: dto.windowEnd, timeBasis, windowDefinitionVersion: EVAL_WINDOW_DEFINITION_VERSION, configDigest, evaluatorId: this.evaluator.evaluatorId, evaluatorVersion: this.evaluator.evaluatorVersion }));

    const generated = await this.evaluator.evaluate({
      model: { modelVersionUuid: model.versionUuid, modelUuid: model.model.modelUuid, lifecycleState: model.lifecycleState },
      cohort: dto.cohort, members, windowStart: dto.windowStart, windowEnd: dto.windowEnd, timeBasis, windowDefinitionVersion: EVAL_WINDOW_DEFINITION_VERSION,
      baseline, configDigest, failureRateThreshold, thresholdConfigDigest,
    });
    this.validateGenerated(generated);

    const eventId = randomUUID();
    const window = await this.prisma.$transaction(async (tx) => {
      const w = await tx.evaluationWindow.create({
        data: tenantCreate<Prisma.EvaluationWindowUncheckedCreateInput>({
          modelVersionId: model.id, modelVersionUuid: model.versionUuid, modelUuid: model.model.modelUuid, modelLifecycleStateAtRun: model.lifecycleState,
          windowStart, windowEnd, timeBasis, windowDefinitionVersion: EVAL_WINDOW_DEFINITION_VERSION, cohort: dto.cohort,
          baselineValidationRunId: baseline?.validationRunId ?? null, baselineCalculationId: baseline?.calculationId ?? null, baselineCompatibility,
          sampleCount: members.length, coverageStatus: generated.coverageStatus,
          evaluatorId: this.evaluator.evaluatorId, evaluatorVersion: this.evaluator.evaluatorVersion, computationVersion: EVAL_COMPUTATION_VERSION, metricSchemaVersion: EVAL_METRICS_SCHEMA_VERSION,
          configDigest, calculationId: generated.calculationId, windowSignature, completionState: 'COMPLETE', eventId, createdById: actorId ?? null,
        }),
      });
      for (let i = 0; i < members.length; i++) {
        await tx.evaluationWindowMember.create({ data: tenantCreate<Prisma.EvaluationWindowMemberUncheckedCreateInput>({ windowId: w.id, inferenceRecordId: members[i].inferenceRecordId, ordinal: i }) });
      }
      const metricIdByOrdinal = new Map<number, string>();
      for (const m of generated.metrics) {
        const created = await tx.evaluationMetric.create({
          data: tenantCreate<Prisma.EvaluationMetricUncheckedCreateInput>({
            windowId: w.id, metricKind: m.metricKind, provenance: m.provenance, cohort: m.cohort, binCode: m.binCode ?? null, value: m.value ?? null,
            numeratorSource: m.numeratorSource ?? null, denominatorSource: m.denominatorSource ?? null, unit: m.unit ?? null, sampleCount: m.sampleCount ?? null,
            baselineRelation: m.baselineRelation ?? null, unavailableReason: m.unavailableReason ?? null, ordinal: m.ordinal,
          }),
        });
        metricIdByOrdinal.set(m.ordinal, created.id);
      }
      for (const rec of generated.recommendations) {
        const createdRec = await tx.evaluationRecommendation.create({
          data: tenantCreate<Prisma.EvaluationRecommendationUncheckedCreateInput>({ windowId: w.id, recommendationCode: rec.recommendationCode, ruleId: rec.ruleId, ruleVersion: rec.ruleVersion, thresholdConfigDigest: rec.thresholdConfigDigest ?? null, coverageStatus: rec.coverageStatus, provenance: rec.provenance, ordinal: rec.ordinal }),
        });
        for (let j = 0; j < rec.supportingMetricOrdinals.length; j++) {
          const metricId = metricIdByOrdinal.get(rec.supportingMetricOrdinals[j]);
          if (!metricId) throw new BadRequestException('recommendation references a non-existent metric');
          await tx.evaluationRecommendationEvidence.create({ data: tenantCreate<Prisma.EvaluationRecommendationEvidenceUncheckedCreateInput>({ recommendationId: createdRec.id, metricId, ordinal: j }) });
        }
      }
      return w;
    });

    await this.audit.recordEntityCreated({ resource: { type: 'EvaluationWindow', id: window.id }, producerModule: 'continuous-eval' }).catch(() => undefined);
    return this.getWindow(window.id);
  }

  listWindows() {
    return this.prisma.evaluationWindow.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async getWindow(id: string) {
    const w = await this.prisma.evaluationWindow.findFirst({
      where: { id },
      include: { metrics: { orderBy: { ordinal: 'asc' } }, recommendations: { include: { evidence: { orderBy: { ordinal: 'asc' } } }, orderBy: { ordinal: 'asc' } }, members: { orderBy: { ordinal: 'asc' } } },
    });
    if (!w) throw new NotFoundException('evaluation window not found');
    return w;
  }

  // ── validation + helpers ─────────────────────────────────────────────────────────────────────────────────────
  private validateGenerated(g: GeneratedEvaluation): void {
    if (!/^[a-f0-9]{64}$/.test(g.calculationId) || !g.metrics.length) throw new BadRequestException('evaluator must produce a deterministic calculation id and at least one metric');
    for (const m of g.metrics) { const e = validateEvalMetric(m); if (e) throw new BadRequestException(`invalid metric: ${e}`); }
    // Advisory recommendations are only valid on COVERED evidence and must reference supporting metrics.
    for (const r of g.recommendations) {
      if (r.coverageStatus !== 'COVERED') throw new BadRequestException('a recommendation may only be issued on COVERED evidence');
      if (!r.supportingMetricOrdinals.length) throw new BadRequestException('a recommendation must reference supporting metrics');
    }
  }

  private resolveThreshold(config: unknown): number {
    const t = (config as { failureRateThreshold?: unknown } | null | undefined)?.failureRateThreshold;
    return typeof t === 'number' && Number.isFinite(t) && t >= 0 && t <= 1 ? t : 0.5;
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
