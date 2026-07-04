import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FeatureKey, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { ALL_FEATURE_KEYS, BUILT_FEATURES, FEATURE_TIERS } from './feature-catalog';
import { ToggleFeatureDto } from './dto/lab-features.dto';

const featureSelect = {
  featureKey: true,
  tier: true,
  isEnabled: true,
  enabledAt: true,
  notes: true,
  updatedAt: true,
  enabledBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.LabFeatureSelect;

export interface FeatureRow {
  featureKey: FeatureKey;
  tier: number;
  isEnabled: boolean;
  enabledAt: string | null;
  enabledByName: string | null;
  notes: string | null;
}

@Injectable()
export class LabFeaturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly labContext: LabContext,
  ) {}

  /** The caller's own lab (from the JWT — never the body). */
  private currentLabId(): string {
    const labId = this.labContext.getLabId();
    if (!labId) throw new ForbiddenException('No lab context');
    return labId;
  }

  /**
   * Guarantee a row exists for every toggleable key for this lab (labs created
   * after the seed, or new keys added later). Runs in system scope so it can key
   * off an explicit labId without the tenancy stamp interfering.
   */
  private async ensureRows(labId: string): Promise<void> {
    await this.labContext.runSystem(async () => {
      const existing = await this.prisma.labFeature.findMany({
        where: { labId },
        select: { featureKey: true },
      });
      const have = new Set(existing.map((r) => r.featureKey));
      const missing = ALL_FEATURE_KEYS.filter((k) => !have.has(k));
      if (missing.length === 0) return;
      await this.prisma.labFeature.createMany({
        data: missing.map((key) => ({
          labId,
          featureKey: key,
          tier: FEATURE_TIERS[key],
          isEnabled: BUILT_FEATURES.has(key),
          enabledAt: BUILT_FEATURES.has(key) ? new Date() : null,
        })),
        skipDuplicates: true,
      });
    });
  }

  private toRow(f: Prisma.LabFeatureGetPayload<{ select: typeof featureSelect }>): FeatureRow {
    return {
      featureKey: f.featureKey,
      tier: f.tier,
      isEnabled: f.isEnabled,
      enabledAt: f.enabledAt?.toISOString() ?? null,
      enabledByName: f.enabledBy ? `${f.enabledBy.firstName} ${f.enabledBy.lastName}`.trim() : null,
      notes: f.notes,
    };
  }

  /** All feature rows for the caller's lab (superuser-only). */
  async listForLab(): Promise<FeatureRow[]> {
    const labId = this.currentLabId();
    await this.ensureRows(labId);
    const rows = await this.prisma.labFeature.findMany({
      select: featureSelect,
      orderBy: [{ tier: 'asc' }, { featureKey: 'asc' }],
    });
    return rows.map((r) => this.toRow(r));
  }

  /** Every lab with its feature states — superuser cross-lab view. */
  async listAllLabs(): Promise<Array<{ labId: string; labName: string; features: FeatureRow[] }>> {
    return this.labContext.runSystem(async () => {
      const labs = await this.prisma.lab.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      await Promise.all(labs.map((l) => this.ensureRows(l.id)));
      const result = [];
      for (const lab of labs) {
        const rows = await this.prisma.labFeature.findMany({
          where: { labId: lab.id },
          select: featureSelect,
          orderBy: [{ tier: 'asc' }, { featureKey: 'asc' }],
        });
        result.push({ labId: lab.id, labName: lab.name, features: rows.map((r) => this.toRow(r)) });
      }
      return result;
    });
  }

  /** Just the enabled FeatureKeys for the caller's lab — used by frontend gating. */
  async enabledForLab(): Promise<{ enabled: FeatureKey[] }> {
    const labId = this.currentLabId();
    await this.ensureRows(labId);
    const rows = await this.prisma.labFeature.findMany({
      where: { isEnabled: true },
      select: { featureKey: true },
    });
    return { enabled: rows.map((r) => r.featureKey) };
  }

  /** Toggle a feature for a lab, log to the system audit stream, return the new row. */
  async toggle(featureKeyRaw: string, dto: ToggleFeatureDto, actorId: string): Promise<FeatureRow> {
    const featureKey = featureKeyRaw as FeatureKey;
    if (!(featureKey in FEATURE_TIERS)) {
      throw new BadRequestException(`Unknown feature key: ${featureKeyRaw}`);
    }
    const { labId, isEnabled, notes } = dto;

    return this.labContext.runSystem(async () => {
      const lab = await this.prisma.lab.findUnique({ where: { id: labId }, select: { id: true } });
      if (!lab) throw new NotFoundException('Lab not found');

      const updated = await this.prisma.labFeature.upsert({
        where: { labId_featureKey: { labId, featureKey } },
        create: {
          labId,
          featureKey,
          tier: FEATURE_TIERS[featureKey],
          isEnabled,
          enabledAt: new Date(),
          enabledById: actorId,
          notes: notes ?? null,
        },
        update: {
          isEnabled,
          enabledAt: new Date(),
          enabledById: actorId,
          ...(notes !== undefined && { notes }),
        },
        select: featureSelect,
      });
      return this.toRow(updated);
    });
  }
}
