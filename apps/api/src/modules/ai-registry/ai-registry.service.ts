import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, AiModelLifecycleState } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { AuditRecorder } from '../audit/audit-recorder.service';
import { isLegalLifecycleTransition, LIFECYCLE_ENTRY_STAMP } from './ai-model-lifecycle';
import { CreateAiModelDto, UpdateAiModelDto, CreateAiModelVersionDto } from './dto/ai-registry.dto';

/**
 * Program 6 · Phase 6A — AI model registry + lifecycle governance. Establishes the ARCHITECTURE only: it manages
 * model/version metadata (permanent UUID identity) and the append-only lifecycle state machine. It performs NO
 * image inference / prediction / execution and writes NO InferenceRecord row (there is no execution surface in
 * 6A). All access is lab-scoped by the Prisma tenancy extension (labId auto-stamped from LabContext; cross-lab
 * reads/writes fail closed). No PHI is stored: slides are referenced by id only; provenance is a digest/reference.
 */
@Injectable()
export class AiRegistryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRecorder,
  ) {}

  // ── models ────────────────────────────────────────────────────────────────────────────────────────────────
  async createModel(dto: CreateAiModelDto, actorId?: string | null) {
    try {
      return await this.prisma.aiModel.create({
        data: tenantCreate<Prisma.AiModelUncheckedCreateInput>({
          key: dto.key,
          displayName: dto.displayName,
          task: dto.task,
          description: dto.description ?? null,
          createdById: actorId ?? null,
        }),
      });
    } catch (e) {
      throw this.mapUnique(e, 'a model with this key');
    }
  }

  listModels() {
    return this.prisma.aiModel.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async getModel(id: string) {
    const model = await this.prisma.aiModel.findFirst({
      where: { id },
      include: { versions: { orderBy: [{ semverMajor: 'desc' }, { semverMinor: 'desc' }, { semverPatch: 'desc' }] } },
    });
    if (!model) throw new NotFoundException('AI model not found');
    return model;
  }

  /** Update MUTABLE descriptive metadata only. `key`, `modelUuid`, and all version provenance are never rewritten. */
  async updateModel(id: string, dto: UpdateAiModelDto) {
    const data: Prisma.AiModelUncheckedUpdateManyInput = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.task !== undefined) data.task = dto.task;
    if (dto.description !== undefined) data.description = dto.description;
    const res = await this.prisma.aiModel.updateMany({ where: { id }, data }); // updateMany → lab-scoped where
    if (res.count !== 1) throw new NotFoundException('AI model not found');
    return this.getModel(id);
  }

  // ── versions (immutable content/provenance; only lifecycleState transitions) ────────────────────────────────
  async createVersion(modelId: string, dto: CreateAiModelVersionDto, actorId?: string | null) {
    await this.getModel(modelId); // existence + tenancy (findFirst is lab-scoped)
    try {
      return await this.prisma.aiModelVersion.create({
        data: tenantCreate<Prisma.AiModelVersionUncheckedCreateInput>({
          modelId,
          semverMajor: dto.semverMajor,
          semverMinor: dto.semverMinor,
          semverPatch: dto.semverPatch,
          artifactDigest: dto.artifactDigest ?? null,
          provenanceRef: dto.provenanceRef ?? null,
          createdById: actorId ?? null,
        }),
      });
    } catch (e) {
      throw this.mapUnique(e, 'this semantic version for the model');
    }
  }

  async getVersion(versionId: string) {
    const version = await this.prisma.aiModelVersion.findFirst({
      where: { id: versionId },
      include: { lifecycleEvents: { orderBy: { occurredAt: 'asc' } } },
    });
    if (!version) throw new NotFoundException('AI model version not found');
    return version;
  }

  /**
   * Perform a lifecycle transition. Legality is enforced from the CURRENT persisted state (compare-and-set on
   * `lifecycleState`, so an illegal or concurrent transition mutates nothing), and every accepted transition
   * writes exactly one append-only AiModelLifecycleEvent in the SAME transaction. Requires `aimodel:promote`
   * at the controller. Writes no InferenceRecord.
   */
  async transitionVersion(versionId: string, toState: AiModelLifecycleState, actorId?: string | null, reason?: string | null) {
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.aiModelVersion.findFirst({ where: { id: versionId }, select: { id: true, lifecycleState: true } });
      if (!current) throw new NotFoundException('AI model version not found');
      const from = current.lifecycleState;
      if (!isLegalLifecycleTransition(from, toState)) {
        throw new BadRequestException(`illegal AI model lifecycle transition: ${from} -> ${toState}`);
      }
      const stamp = LIFECYCLE_ENTRY_STAMP[toState];
      const cas = await tx.aiModelVersion.updateMany({
        where: { id: versionId, lifecycleState: from }, // CAS on the observed state
        data: { lifecycleState: toState, ...(stamp ? { [stamp]: now } : {}) },
      });
      if (cas.count !== 1) throw new ConflictException('lifecycle state changed concurrently');
      await tx.aiModelLifecycleEvent.create({
        data: tenantCreate<Prisma.AiModelLifecycleEventUncheckedCreateInput>({
          modelVersionId: versionId,
          fromState: from,
          toState,
          actorId: actorId ?? null,
          reason: reason ?? null,
          eventId: randomUUID(),
          occurredAt: now,
        }),
      });
      return tx.aiModelVersion.findFirst({ where: { id: versionId }, include: { lifecycleEvents: { orderBy: { occurredAt: 'asc' } } } });
    });
    // Best-effort cross-cutting audit (field names only; domain provenance is the lifecycle-event log).
    await this.audit.recordEntityUpdated({ resource: { type: 'AiModelVersion', id: versionId }, changedFields: ['lifecycleState'], producerModule: 'ai-registry' }).catch(() => undefined);
    return result;
  }

  private mapUnique(e: unknown, what: string): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return new ConflictException(`${what} already exists`);
    return e;
  }
}
