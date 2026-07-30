import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, DatasetPurpose, DatasetSlideMembership } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { AuditRecorder } from '../audit/audit-recorder.service';
import { isMutable, isFreezable } from './dataset-lifecycle';
import { CreateDatasetDto, UpdateDatasetDto, CreateDatasetVersionDto, AddDatasetSlideDto, SetGroundTruthLabelDto, AddTrainingReferenceDto } from './dto/dataset-governance.dto';

/**
 * Program 6 · Phase 6B — dataset governance. Manages governed datasets, immutable dataset versions (DRAFT →
 * FROZEN), slide membership (referenced by id — no PHI), structured ground-truth labels with append-only
 * annotation lineage, inclusion/exclusion rules, immutable dataset-purpose provenance, and pointer-only training
 * references. Lab-scoped via the Prisma tenancy extension; cross-lab reads/writes fail closed. No inference /
 * training / model-linkage / validation-metrics. Slides/specimens are REFERENCED, never copied; no PHI is stored.
 */
@Injectable()
export class DatasetGovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRecorder,
  ) {}

  // ── datasets ────────────────────────────────────────────────────────────────────────────────────────────
  async createDataset(dto: CreateDatasetDto, actorId?: string | null) {
    try {
      return await this.prisma.dataset.create({
        data: tenantCreate<Prisma.DatasetUncheckedCreateInput>({
          key: dto.key,
          displayName: dto.displayName,
          kind: dto.kind,
          description: dto.description ?? null,
          createdById: actorId ?? null,
        }),
      });
    } catch (e) {
      throw this.mapUnique(e, 'a dataset with this key');
    }
  }

  listDatasets() {
    return this.prisma.dataset.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async getDataset(id: string) {
    const dataset = await this.prisma.dataset.findFirst({
      where: { id },
      include: { versions: { orderBy: { versionNumber: 'desc' } }, trainingReferences: { orderBy: { createdAt: 'desc' } } },
    });
    if (!dataset) throw new NotFoundException('dataset not found');
    return dataset;
  }

  /** MUTABLE descriptive metadata only — never key/kind/datasetUuid. */
  async updateDataset(id: string, dto: UpdateDatasetDto) {
    const data: Prisma.DatasetUncheckedUpdateManyInput = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.description !== undefined) data.description = dto.description;
    const res = await this.prisma.dataset.updateMany({ where: { id }, data });
    if (res.count !== 1) throw new NotFoundException('dataset not found');
    return this.getDataset(id);
  }

  // ── versions ────────────────────────────────────────────────────────────────────────────────────────────
  async createVersion(datasetId: string, dto: CreateDatasetVersionDto, actorId?: string | null) {
    const dataset = await this.getDataset(datasetId);
    if (dataset.kind !== 'VALIDATION') throw new BadRequestException('only VALIDATION datasets have versions; use training references for TRAINING_REFERENCE datasets');
    const last = await this.prisma.datasetVersion.findFirst({ where: { datasetId }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true } });
    const versionNumber = (last?.versionNumber ?? 0) + 1;
    try {
      return await this.prisma.datasetVersion.create({
        data: tenantCreate<Prisma.DatasetVersionUncheckedCreateInput>({
          datasetId,
          versionNumber,
          purpose: dto.purpose as DatasetPurpose,
          inclusionRules: (dto.inclusionRules ?? undefined) as Prisma.InputJsonValue | undefined,
          createdById: actorId ?? null,
        }),
      });
    } catch (e) {
      throw this.mapUnique(e, 'this dataset version');
    }
  }

  async getVersion(versionId: string) {
    const version = await this.prisma.datasetVersion.findFirst({
      where: { id: versionId },
      include: { slides: { orderBy: { addedAt: 'asc' } }, groundTruth: { include: { lineage: { orderBy: { occurredAt: 'asc' } } } } },
    });
    if (!version) throw new NotFoundException('dataset version not found');
    return version;
  }

  private async requireDraft(versionId: string) {
    const v = await this.prisma.datasetVersion.findFirst({ where: { id: versionId }, select: { id: true, state: true, datasetId: true } });
    if (!v) throw new NotFoundException('dataset version not found');
    if (!isMutable(v.state)) throw new BadRequestException(`dataset version is ${v.state} (immutable); create a new version for corrections`);
    return v;
  }

  /** Add a slide to a DRAFT version's membership — references the slide by id only (no PHI). */
  async addSlide(versionId: string, dto: AddDatasetSlideDto) {
    await this.requireDraft(versionId);
    // The referenced slide must belong to the same lab (findFirst is lab-scoped → cross-lab fails closed).
    const slide = await this.prisma.digitalSlide.findFirst({ where: { id: dto.slideId }, select: { id: true } });
    if (!slide) throw new BadRequestException('referenced slide not found in this lab');
    if (dto.specimenId) {
      const spec = await this.prisma.specimen.findFirst({ where: { id: dto.specimenId }, select: { id: true } });
      if (!spec) throw new BadRequestException('referenced specimen not found in this lab');
    }
    try {
      return await this.prisma.datasetSlide.create({
        data: tenantCreate<Prisma.DatasetSlideUncheckedCreateInput>({
          datasetVersionId: versionId,
          slideId: dto.slideId,
          specimenId: dto.specimenId ?? null,
          membership: (dto.membership ?? 'INCLUDED') as DatasetSlideMembership,
          exclusionReason: dto.exclusionReason ?? null,
        }),
      });
    } catch (e) {
      throw this.mapUnique(e, 'this slide in the dataset version');
    }
  }

  /**
   * Set/replace a structured ground-truth label on a DRAFT version, and record an append-only lineage event.
   * The referenced slide must already be a member of the version.
   */
  async setLabel(versionId: string, dto: SetGroundTruthLabelDto, actorId?: string | null, method: 'PATHOLOGIST_ASSERTED' | 'CONSENSUS' | 'IMPORTED' = 'PATHOLOGIST_ASSERTED') {
    await this.requireDraft(versionId);
    const member = await this.prisma.datasetSlide.findFirst({ where: { datasetVersionId: versionId, slideId: dto.slideId }, select: { id: true } });
    if (!member) throw new BadRequestException('slide is not a member of this dataset version');
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.groundTruthLabel.findFirst({ where: { datasetVersionId: versionId, slideId: dto.slideId, labelSchemaKey: dto.labelSchemaKey }, select: { id: true } });
      const label = existing
        ? await tx.groundTruthLabel.update({ where: { id: existing.id }, data: { labelSchemaVersion: dto.labelSchemaVersion, labelValue: dto.labelValue, assertedById: actorId ?? null, assertedAt: now } })
        : await tx.groundTruthLabel.create({
            data: tenantCreate<Prisma.GroundTruthLabelUncheckedCreateInput>({
              datasetVersionId: versionId,
              slideId: dto.slideId,
              labelSchemaKey: dto.labelSchemaKey,
              labelSchemaVersion: dto.labelSchemaVersion,
              labelValue: dto.labelValue,
              assertedById: actorId ?? null,
              assertedAt: now,
            }),
          });
      await tx.annotationLineageEvent.create({
        data: tenantCreate<Prisma.AnnotationLineageEventUncheckedCreateInput>({
          groundTruthLabelId: label.id,
          method,
          actorId: actorId ?? null,
          sourceRef: null,
          eventId: randomUUID(),
          occurredAt: now,
        }),
      });
      return label;
    });
  }

  /** Freeze a DRAFT version → FROZEN (immutable). Compare-and-set on state; stamps a manifest digest. */
  async freezeVersion(versionId: string, actorId?: string | null) {
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const v = await tx.datasetVersion.findFirst({ where: { id: versionId }, select: { id: true, state: true } });
      if (!v) throw new NotFoundException('dataset version not found');
      if (!isFreezable(v.state)) throw new ConflictException(`dataset version is already ${v.state}`);
      // Deterministic manifest digest over membership + labels (provenance without copying content).
      const slides = await tx.datasetSlide.findMany({ where: { datasetVersionId: versionId }, select: { slideId: true, specimenId: true, membership: true, exclusionReason: true }, orderBy: { slideId: 'asc' } });
      const labels = await tx.groundTruthLabel.findMany({ where: { datasetVersionId: versionId }, select: { slideId: true, labelSchemaKey: true, labelSchemaVersion: true, labelValue: true }, orderBy: [{ slideId: 'asc' }, { labelSchemaKey: 'asc' }] });
      const manifestDigest = createHash('sha256').update(JSON.stringify({ slides, labels })).digest('hex');
      const cas = await tx.datasetVersion.updateMany({ where: { id: versionId, state: 'DRAFT' }, data: { state: 'FROZEN', frozenAt: now, manifestDigest } });
      if (cas.count !== 1) throw new ConflictException('dataset version state changed concurrently');
      return tx.datasetVersion.findFirst({ where: { id: versionId } });
    });
    await this.audit.recordEntityUpdated({ resource: { type: 'DatasetVersion', id: versionId }, changedFields: ['state', 'frozenAt', 'manifestDigest'], producerModule: 'dataset-governance' }).catch(() => undefined);
    return result;
  }

  // ── training references (TRAINING_REFERENCE datasets; pointer-only, no PHI/bytes) ───────────────────────────
  async addTrainingReference(datasetId: string, dto: AddTrainingReferenceDto, actorId?: string | null) {
    const dataset = await this.getDataset(datasetId);
    if (dataset.kind !== 'TRAINING_REFERENCE') throw new BadRequestException('training references are only valid on TRAINING_REFERENCE datasets');
    return this.prisma.trainingDatasetReference.create({
      data: tenantCreate<Prisma.TrainingDatasetReferenceUncheckedCreateInput>({
        datasetId,
        descriptor: dto.descriptor,
        provenanceUri: dto.provenanceUri,
        contentDigest: dto.contentDigest ?? null,
        createdById: actorId ?? null,
      }),
    });
  }

  private mapUnique(e: unknown, what: string): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return new ConflictException(`${what} already exists`);
    return e;
  }
}
