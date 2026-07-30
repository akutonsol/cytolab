import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { AuditRecorder } from '../audit/audit-recorder.service';
import { VALIDATION_VALIDATOR } from './validation-tokens';
import { ValidationValidator, GeneratedValidation } from './validation-validator';
import { isValidatableLifecycle, validateScalarMetric, validateConfusionCell, validateCurvePoint, VALIDATION_METRICS_SCHEMA_VERSION, VALIDATION_COMPUTATION_VERSION } from './validation-metrics';
import { RunValidationDto } from './dto/validation.dto';

/**
 * Program 6 · Phase 6F — validation evidence (no claim beyond recorded evidence).
 *
 * A manual `validation:run` binds a FROZEN 6B DatasetVersion to a VALIDATION/APPROVED 6A AiModelVersion, snapshots
 * both identities + the config as immutable digests (Guardrails 1/2/5), runs the deterministic non-clinical stub, and
 * persists an immutable structured evidence graph (run + metrics + confusion cells + curve points) ATOMICALLY
 * (Guardrail 6). Revalidation creates a NEW, fully independent run (Guardrail 8). Lab-scoped; cross-lab fails closed.
 * NEVER mutates the model lifecycle (no support lifecycle promotion), datasets, inference, or the clinical path.
 */
@Injectable()
export class ValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRecorder,
    @Inject(VALIDATION_VALIDATOR) private readonly validator: ValidationValidator,
  ) {}

  async runValidation(dto: RunValidationDto, actorId?: string | null) {
    // Model must exist in this lab AND be validatable (VALIDATION/APPROVED) — Decision 7. Read-only (no lifecycle write).
    const model = await this.prisma.aiModelVersion.findFirst({
      where: { id: dto.modelVersionId },
      select: { id: true, versionUuid: true, artifactDigest: true, lifecycleState: true, model: { select: { modelUuid: true } } },
    });
    if (!model) throw new NotFoundException('AI model version not found');
    if (!isValidatableLifecycle(model.lifecycleState)) {
      throw new BadRequestException(`model version is ${model.lifecycleState}; only VALIDATION or APPROVED versions can be validated`);
    }
    // Dataset version must exist in this lab AND be FROZEN — Decision 7 (immutable reference corpus).
    const ds = await this.prisma.datasetVersion.findFirst({ where: { id: dto.datasetVersionId }, select: { id: true, state: true, manifestDigest: true } });
    if (!ds) throw new NotFoundException('dataset version not found');
    if (ds.state !== 'FROZEN') throw new BadRequestException(`dataset version is ${ds.state}; only a FROZEN dataset version can be validated against`);

    // Guardrail 1 — ground-truth snapshot digest over the frozen label set (interpretation fixed forever).
    const labels = await this.prisma.groundTruthLabel.findMany({ where: { datasetVersionId: ds.id }, select: { slideId: true, labelSchemaKey: true, labelSchemaVersion: true, labelValue: true }, orderBy: [{ slideId: 'asc' }, { labelSchemaKey: 'asc' }] });
    const groundTruthDigest = this.digest(JSON.stringify(labels));

    // Guardrail 5 — config snapshot as immutable digests.
    const cfg = (dto.config ?? {}) as Record<string, unknown>;
    const configDigest = dto.config == null ? null : this.digest(this.stableStringify(dto.config));
    const thresholdConfigDigest = this.digest(this.stableStringify(cfg.thresholds ?? null));
    const metricSelectionDigest = this.digest(this.stableStringify(cfg.metrics ?? null));
    const computationConfigDigest = this.digest(this.stableStringify(cfg.computation ?? null));

    // Deterministic stub over the snapshots (Guardrail 4) — validate the whole set BEFORE persistence (Guardrail 6).
    const generated = await this.validator.validate({
      model: { modelVersionUuid: model.versionUuid, modelUuid: model.model.modelUuid, artifactDigest: model.artifactDigest, lifecycleState: model.lifecycleState },
      dataset: { datasetVersionId: ds.id, manifestDigest: ds.manifestDigest, groundTruthDigest },
      configDigest,
    });
    this.validateGenerated(generated);

    const eventId = randomUUID();
    const run = await this.prisma.$transaction(async (tx) => {
      const created = await tx.validationRun.create({
        data: tenantCreate<Prisma.ValidationRunUncheckedCreateInput>({
          modelVersionId: model.id,
          datasetVersionId: ds.id,
          datasetManifestDigest: ds.manifestDigest,
          groundTruthDigest,
          modelVersionUuid: model.versionUuid,
          modelUuid: model.model.modelUuid,
          modelArtifactDigest: model.artifactDigest,
          adapterId: null,
          adapterVersion: null,
          modelLifecycleStateAtRun: model.lifecycleState,
          validatorId: this.validator.validatorId,
          validatorVersion: this.validator.validatorVersion,
          computationVersion: VALIDATION_COMPUTATION_VERSION,
          metricSchemaVersion: VALIDATION_METRICS_SCHEMA_VERSION,
          calculationId: generated.calculationId,
          configDigest,
          thresholdConfigDigest,
          metricSelectionDigest,
          computationConfigDigest,
          eventId,
          createdById: actorId ?? null,
        }),
      });
      for (const m of generated.metrics) {
        await tx.validationMetric.create({ data: tenantCreate<Prisma.ValidationMetricUncheckedCreateInput>({ runId: created.id, metricKind: m.metricKind, labelClassCode: m.labelClassCode ?? null, value: m.value ?? null, numeratorSource: m.numeratorSource ?? null, denominatorSource: m.denominatorSource ?? null, ordinal: m.ordinal }) });
      }
      for (const c of generated.confusionCells) {
        await tx.validationConfusionCell.create({ data: tenantCreate<Prisma.ValidationConfusionCellUncheckedCreateInput>({ runId: created.id, trueClassCode: c.trueClassCode, predClassCode: c.predClassCode, count: c.count }) });
      }
      for (const p of generated.curvePoints) {
        await tx.validationCurvePoint.create({ data: tenantCreate<Prisma.ValidationCurvePointUncheckedCreateInput>({ runId: created.id, curveKind: p.curveKind, x: p.x, y: p.y, threshold: p.threshold ?? null, ordinal: p.ordinal }) });
      }
      return created;
    });

    await this.audit.recordEntityCreated({ resource: { type: 'ValidationRun', id: run.id }, producerModule: 'validation' }).catch(() => undefined);
    return this.getRun(run.id);
  }

  listRuns() {
    return this.prisma.validationRun.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async getRun(id: string) {
    const run = await this.prisma.validationRun.findFirst({
      where: { id },
      include: { metrics: { orderBy: { ordinal: 'asc' } }, confusionCells: { orderBy: [{ trueClassCode: 'asc' }, { predClassCode: 'asc' }] }, curvePoints: { orderBy: [{ curveKind: 'asc' }, { ordinal: 'asc' }] } },
    });
    if (!run) throw new NotFoundException('validation run not found');
    return run;
  }

  // ── validation + helpers ─────────────────────────────────────────────────────────────────────────────────────
  private validateGenerated(g: GeneratedValidation): void {
    if (!/^[a-f0-9]{64}$/.test(g.calculationId)) throw new BadRequestException('validator must produce a deterministic calculation id');
    if (!g.metrics.length || !g.confusionCells.length) throw new BadRequestException('a validation run must record metrics and a confusion matrix');
    for (const m of g.metrics) { const e = validateScalarMetric(m); if (e) throw new BadRequestException(`invalid metric: ${e}`); }
    for (const c of g.confusionCells) { const e = validateConfusionCell(c); if (e) throw new BadRequestException(`invalid confusion cell: ${e}`); }
    for (const p of g.curvePoints) { const e = validateCurvePoint(p); if (e) throw new BadRequestException(`invalid curve point: ${e}`); }
  }

  private digest(s: string): string {
    return createHash('sha256').update(s).digest('hex');
  }

  /** Deterministic, key-sorted JSON so a config digest is stable regardless of key order. */
  private stableStringify(value: unknown): string {
    const seen = new WeakSet();
    const norm = (v: unknown): unknown => {
      if (v === null || typeof v !== 'object') return v;
      if (seen.has(v as object)) throw new BadRequestException('config must not contain circular references');
      seen.add(v as object);
      if (Array.isArray(v)) return v.map(norm);
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce((acc, k) => {
          acc[k] = norm((v as Record<string, unknown>)[k]);
          return acc;
        }, {} as Record<string, unknown>);
    };
    return JSON.stringify(norm(value));
  }
}
