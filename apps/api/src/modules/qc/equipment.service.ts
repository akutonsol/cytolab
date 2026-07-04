import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { CreateEquipmentDto, UpdateEquipmentDto } from './dto/qc.dto';

const select = {
  id: true, name: true, type: true, serialNumber: true, lastServiceDate: true, isActive: true, createdAt: true,
  _count: { select: { qcChecks: true } },
} satisfies Prisma.EquipmentSelect;

@Injectable()
export class EquipmentService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.equipment.findMany({ select, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
  }

  create(dto: CreateEquipmentDto) {
    return this.prisma.equipment.create({
      data: tenantCreate<Prisma.EquipmentUncheckedCreateInput>({
        name: dto.name.trim(),
        type: dto.type,
        serialNumber: dto.serialNumber?.trim() || null,
        lastServiceDate: dto.lastServiceDate ? new Date(dto.lastServiceDate) : null,
        isActive: dto.isActive ?? true,
      }),
      select,
    });
  }

  async update(id: string, dto: UpdateEquipmentDto) {
    const existing = await this.prisma.equipment.findFirst({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Equipment not found');
    return this.prisma.equipment.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.serialNumber !== undefined && { serialNumber: dto.serialNumber.trim() || null }),
        ...(dto.lastServiceDate !== undefined && { lastServiceDate: dto.lastServiceDate ? new Date(dto.lastServiceDate) : null }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      select,
    });
  }

  /** Soft delete — keeps historical QC checks intact. */
  async remove(id: string) {
    const existing = await this.prisma.equipment.findFirst({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Equipment not found');
    await this.prisma.equipment.update({ where: { id }, data: { isActive: false } });
    return { ok: true };
  }
}
