import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TemplateCategory } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { CreateResultTemplateDto, UpdateResultTemplateDto } from './dto/result-template.dto';

const listSelect = {
  id: true, name: true, category: true, shortCode: true, description: true, isActive: true, usageCount: true,
  specimenAdequacy: true, generalCategory: true, interpretation: true, recommendation: true,
  createdAt: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

/** Reusable cytology report templates. Lab-scoped by the tenancy extension. */
@Injectable()
export class ResultTemplatesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: { category?: string; isActive?: string; search?: string }) {
    const where: Prisma.ResultTemplateWhereInput = {};
    if (query.category && query.category in TemplateCategory) where.category = query.category as TemplateCategory;
    // Default list shows only active templates; pass isActive=false to see soft-deleted.
    where.isActive = query.isActive === undefined ? true : query.isActive !== 'false';
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { shortCode: { contains: query.search, mode: 'insensitive' } },
        { interpretation: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.resultTemplate.findMany({ where, orderBy: [{ usageCount: 'desc' }, { name: 'asc' }], select: listSelect });
  }

  async findOne(id: string) {
    const t = await this.prisma.resultTemplate.findFirst({ where: { id }, select: { ...listSelect, additionalNotes: true, findings: true } });
    if (!t) throw new NotFoundException('Template not found');
    return t;
  }

  async create(dto: CreateResultTemplateDto, userId: string) {
    try {
      return await this.prisma.resultTemplate.create({
        data: tenantCreate<Prisma.ResultTemplateUncheckedCreateInput>({
          name: dto.name.trim(),
          category: dto.category ?? TemplateCategory.Cervical,
          shortCode: dto.shortCode?.trim() || null,
          description: dto.description?.trim() || null,
          isActive: dto.isActive ?? true,
          specimenAdequacy: dto.specimenAdequacy?.trim() || null,
          generalCategory: dto.generalCategory?.trim() || null,
          interpretation: dto.interpretation?.trim() || null,
          recommendation: dto.recommendation?.trim() || null,
          additionalNotes: dto.additionalNotes?.trim() || null,
          findings: dto.findings ?? undefined,
          createdById: userId,
        }),
        select: { ...listSelect, additionalNotes: true, findings: true },
      });
    } catch (e) {
      throw this.friendly(e);
    }
  }

  async update(id: string, dto: UpdateResultTemplateDto) {
    await this.findOne(id); // lab-scoped existence check
    const norm = (v?: string) => (v === undefined ? undefined : v.trim() || null);
    try {
      return await this.prisma.resultTemplate.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.category !== undefined && { category: dto.category }),
          ...(dto.shortCode !== undefined && { shortCode: norm(dto.shortCode) }),
          ...(dto.description !== undefined && { description: norm(dto.description) }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          ...(dto.specimenAdequacy !== undefined && { specimenAdequacy: norm(dto.specimenAdequacy) }),
          ...(dto.generalCategory !== undefined && { generalCategory: norm(dto.generalCategory) }),
          ...(dto.interpretation !== undefined && { interpretation: norm(dto.interpretation) }),
          ...(dto.recommendation !== undefined && { recommendation: norm(dto.recommendation) }),
          ...(dto.additionalNotes !== undefined && { additionalNotes: norm(dto.additionalNotes) }),
          ...(dto.findings !== undefined && { findings: dto.findings ?? Prisma.DbNull }),
        },
        select: { ...listSelect, additionalNotes: true, findings: true },
      });
    } catch (e) {
      throw this.friendly(e);
    }
  }

  /** Soft delete — hide from the default list. */
  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.resultTemplate.update({ where: { id }, data: { isActive: false } });
    return { deleted: true };
  }

  /** Applied to a result sheet — bump usage and return the full template. */
  async use(id: string) {
    const existing = await this.prisma.resultTemplate.findFirst({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Template not found');
    return this.prisma.resultTemplate.update({
      where: { id },
      data: { usageCount: { increment: 1 } },
      select: { ...listSelect, additionalNotes: true, findings: true },
    });
  }

  private friendly(e: unknown): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const target = String((e.meta as any)?.target ?? '');
      if (target.includes('name')) return new BadRequestException('A template with that name already exists');
      if (target.includes('shortCode')) return new BadRequestException('That short code is already in use');
      return new BadRequestException('Duplicate value');
    }
    return e as Error;
  }
}
