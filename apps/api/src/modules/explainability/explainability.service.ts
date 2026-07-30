import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ExplainabilityArtifactKind } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { AuditRecorder } from '../audit/audit-recorder.service';
import { EXPLAINABILITY_GENERATOR } from './explainability-tokens';
import { ExplainabilityGenerator, GeneratedArtifact } from './explainability-generator';
import { validateProbabilityDistribution, validateRegionGeometry, SlideBounds } from './explainability-artifact';
import { GenerateExplainabilityDto } from './dto/explainability.dto';

const ALL_KINDS: ExplainabilityArtifactKind[] = ['HEATMAP', 'ATTENTION_OVERLAY', 'FEATURE_REGION', 'PROBABILITY_DISTRIBUTION'];

/**
 * Program 6 · Phase 6D — explainability artifact generation (assists, NEVER asserts correctness).
 *
 * Manual generation from a completed (SUCCEEDED) inference record: eligibility-checked, validation-only provenance
 * INHERITED immutably, content structurally validated (coded/numeric/bounded — no diagnostic/correctness field), and
 * the whole artifact set persisted ATOMICALLY under one shared generation identity (Guardrail 2). Artifacts are
 * immutable + append-only; regeneration creates a NEW set and never mutates prior rows or the InferenceRecord (no
 * support inference — Decision 14). Content is digest/reference only — no bytes/tiles/PHI. Lab-scoped; cross-lab
 * fails closed.
 */
@Injectable()
export class ExplainabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRecorder,
    @Inject(EXPLAINABILITY_GENERATOR) private readonly generator: ExplainabilityGenerator,
  ) {}

  async generate(dto: GenerateExplainabilityDto, actorId?: string | null) {
    // Eligibility: the record must exist in this lab AND be SUCCEEDED (Decision 5). findFirst is lab-scoped.
    const record = await this.prisma.inferenceRecord.findFirst({
      where: { id: dto.inferenceRecordId },
      select: { id: true, recordUuid: true, outcome: true, validationOnly: true, subjectSlideId: true, inputDigest: true, resultDigest: true },
    });
    if (!record) throw new NotFoundException('inference record not found');
    if (record.outcome !== 'SUCCEEDED') {
      throw new BadRequestException(`explainability requires a SUCCEEDED inference record (record is ${record.outcome ?? 'incomplete'})`);
    }

    const kinds = dto.kinds && dto.kinds.length ? [...new Set(dto.kinds)] : ALL_KINDS;
    const configDigest = dto.config == null ? null : this.digest(this.stableStringify(dto.config));

    // Coordinate-space provenance (Guardrail 1): snapshot the slide dimensions used, immutably.
    let bounds: SlideBounds = { width: null, height: null };
    let coordinateSpace: string | null = null;
    if (record.subjectSlideId) {
      const slide = await this.prisma.digitalSlide.findFirst({ where: { id: record.subjectSlideId }, select: { id: true, sourceWidth: true, sourceHeight: true } });
      bounds = { width: slide?.sourceWidth ?? null, height: slide?.sourceHeight ?? null };
      coordinateSpace = `slide-pixel${bounds.width != null && bounds.height != null ? `@${bounds.width}x${bounds.height}` : ''}`;
    }

    // Generate deterministically, then validate structurally BEFORE any persistence (fail closed on bad content).
    const generated = await this.generator.generate({
      recordUuid: record.recordUuid,
      inputDigest: record.inputDigest,
      resultDigest: record.resultDigest,
      configDigest,
      kinds,
      slide: record.subjectSlideId ? { width: bounds.width, height: bounds.height } : null,
    });
    this.validateGenerated(generated, bounds);

    const validationOnly = record.validationOnly; // inherited immutably (Decision 3/5)
    const eventId = randomUUID();

    // Atomic persistence of the COMPLETE set (Guardrail 2) — all-or-nothing.
    const generation = await this.prisma.$transaction(async (tx) => {
      const gen = await tx.explainabilityGeneration.create({
        data: tenantCreate<Prisma.ExplainabilityGenerationUncheckedCreateInput>({
          inferenceRecordId: record.id,
          subjectSlideId: record.subjectSlideId ?? null,
          generatorId: this.generator.generatorId,
          generatorVersion: this.generator.generatorVersion,
          configDigest,
          validationOnly,
          coordinateSpace,
          slideWidthPx: bounds.width,
          slideHeightPx: bounds.height,
          eventId,
          createdById: actorId ?? null,
        }),
      });
      for (const a of generated) {
        const geometryBearing = a.kind === 'FEATURE_REGION' || a.kind === 'HEATMAP' || a.kind === 'ATTENTION_OVERLAY';
        const artifact = await tx.explainabilityArtifact.create({
          data: tenantCreate<Prisma.ExplainabilityArtifactUncheckedCreateInput>({
            generationId: gen.id,
            inferenceRecordId: record.id,
            kind: a.kind,
            generatorId: this.generator.generatorId,
            generatorVersion: this.generator.generatorVersion,
            configDigest,
            contentDigest: a.contentDigest,
            contentRef: a.contentRef ?? null,
            validationOnly,
            slideId: geometryBearing ? record.subjectSlideId ?? null : null,
            coordinateSpace: geometryBearing ? coordinateSpace : null,
          }),
        });
        for (const r of a.regions ?? []) {
          await tx.explainabilityRegion.create({
            data: tenantCreate<Prisma.ExplainabilityRegionUncheckedCreateInput>({
              artifactId: artifact.id,
              regionType: r.regionType,
              categoryCode: r.categoryCode,
              geometry: r.geometry as Prisma.InputJsonValue,
              weight: r.weight ?? null,
              ordinal: r.ordinal,
            }),
          });
        }
        for (const p of a.probabilities ?? []) {
          await tx.explainabilityProbability.create({
            data: tenantCreate<Prisma.ExplainabilityProbabilityUncheckedCreateInput>({
              artifactId: artifact.id,
              classCode: p.classCode,
              value: p.value,
              ordinal: p.ordinal,
            }),
          });
        }
      }
      return gen;
    });

    await this.audit.recordEntityCreated({ resource: { type: 'ExplainabilityGeneration', id: generation.id }, producerModule: 'explainability' }).catch(() => undefined);
    return this.getGeneration(generation.id);
  }

  listGenerations() {
    return this.prisma.explainabilityGeneration.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async getGeneration(id: string) {
    const gen = await this.prisma.explainabilityGeneration.findFirst({
      where: { id },
      include: { artifacts: { include: { regions: { orderBy: { ordinal: 'asc' } }, probabilities: { orderBy: { ordinal: 'asc' } } }, orderBy: { kind: 'asc' } } },
    });
    if (!gen) throw new NotFoundException('explainability generation not found');
    return gen;
  }

  // ── validation + helpers ─────────────────────────────────────────────────────────────────────────────────────
  private validateGenerated(generated: GeneratedArtifact[], bounds: SlideBounds): void {
    if (!generated.length) throw new BadRequestException('generator produced no artifacts');
    for (const a of generated) {
      if (typeof a.contentDigest !== 'string' || !/^[a-f0-9]{64}$/.test(a.contentDigest)) {
        throw new BadRequestException(`artifact ${a.kind} must carry a sha256 content digest`);
      }
      if (a.kind === 'PROBABILITY_DISTRIBUTION') {
        const err = validateProbabilityDistribution(a.probabilities ?? []);
        if (err) throw new BadRequestException(`invalid probability distribution: ${err}`);
      }
      for (const r of a.regions ?? []) {
        const err = validateRegionGeometry(r.regionType, r.geometry, bounds);
        if (err) throw new BadRequestException(`invalid feature region: ${err}`);
      }
    }
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
