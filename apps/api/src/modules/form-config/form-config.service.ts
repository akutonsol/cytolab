import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RequisitionFormType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { FORM_DEFAULTS } from './form-config.defaults';
import { UpdateFieldDto } from './dto/form-config.dto';

const fullInclude = {
  fields: { orderBy: { sortOrder: 'asc' as const } },
  printGroups: { orderBy: { sortOrder: 'asc' as const } },
};

@Injectable()
export class FormConfigService {
  constructor(private prisma: PrismaService) {}

  /** Get the lab's config for a form type, seeding defaults on first access. */
  async getOrCreate(formType: RequisitionFormType) {
    const existing = await this.prisma.formConfig.findFirst({ where: { formType }, include: fullInclude });
    if (existing) return existing;

    const defaults = FORM_DEFAULTS[formType];
    // labId (on FormConfig + nested fields/print groups, all tenant models) is
    // stamped from the request lab context by the tenancy extension.
    await this.prisma.formConfig.create({
      data: tenantCreate<Prisma.FormConfigUncheckedCreateInput>({
        formType,
        printGroups: { create: defaults.groups.map((name, i) => ({ name, sortOrder: i })) },
        fields: { create: defaults.fields.map((f, i) => ({ fieldKey: f.fieldKey, label: f.label, fieldType: f.fieldType, sortOrder: i })) },
      } as Prisma.FormConfigUncheckedCreateInput),
    });
    // Re-read so fields/print groups come back ordered.
    return this.prisma.formConfig.findFirstOrThrow({ where: { formType }, include: fullInclude });
  }

  /** Full config (ordered fields + print groups); creates defaults if missing. */
  getConfig(formType: RequisitionFormType) {
    return this.getOrCreate(formType);
  }

  /** Only enabled fields in sort order — consumed by the record form drawer. */
  async getFormSchema(formType: RequisitionFormType) {
    const config = await this.getOrCreate(formType);
    return {
      formType,
      fields: config.fields
        .filter((f) => f.enabled)
        .map((f) => ({ fieldKey: f.fieldKey, label: f.label, fieldType: f.fieldType, showWhenPrinting: f.showWhenPrinting, printGroupId: f.printGroupId, sortOrder: f.sortOrder })),
    };
  }

  /** Update a field's presentation. fieldKey/fieldType are immutable. */
  async updateField(fieldId: string, dto: UpdateFieldDto) {
    const field = await this.prisma.formFieldConfig.findFirst({ where: { id: fieldId } });
    if (!field) throw new NotFoundException('Field not found');
    return this.prisma.formFieldConfig.update({
      where: { id: fieldId },
      data: {
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.showWhenPrinting !== undefined ? { showWhenPrinting: dto.showWhenPrinting } : {}),
        ...(dto.printGroupId !== undefined ? { printGroupId: dto.printGroupId || null } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      },
    });
  }

  /** Append a print group to a config (sortOrder after the current max). */
  async addPrintGroup(formConfigId: string, name: string) {
    const config = await this.prisma.formConfig.findFirst({ where: { id: formConfigId }, select: { id: true } });
    if (!config) throw new NotFoundException('Form config not found');
    const last = await this.prisma.formPrintGroup.findFirst({ where: { formConfigId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    return this.prisma.formPrintGroup.create({
      data: tenantCreate<Prisma.FormPrintGroupUncheckedCreateInput>({
        formConfigId, name: name.trim(), sortOrder: (last?.sortOrder ?? -1) + 1,
      } as Prisma.FormPrintGroupUncheckedCreateInput),
    });
  }

  /** Delete a print group; the FK (onDelete: SetNull) unassigns any fields. */
  async deletePrintGroup(id: string) {
    const group = await this.prisma.formPrintGroup.findFirst({ where: { id }, select: { id: true } });
    if (!group) throw new NotFoundException('Print group not found');
    await this.prisma.formFieldConfig.updateMany({ where: { printGroupId: id }, data: { printGroupId: null } });
    await this.prisma.formPrintGroup.delete({ where: { id } });
    return { id };
  }
}
