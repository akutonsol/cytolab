import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { ClientQueryDto, CreateClientDto, CreateClientTypeDto, UpdateClientDto } from './dto/client.dto';

const clientSelect = {
  id: true,
  firstName: true,
  lastName: true,
  officeName: true,
  email: true,
  phoneNumber: true,
  mobileNumber: true,
  officeNumber: true,
  faxNumber: true,
  clientTypeId: true,
  clientType: { select: { id: true, name: true, type: true } },
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  // Every query below is automatically lab-scoped by the Prisma tenancy extension.
  async findAll(query: ClientQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (query.q) {
      const q = query.q;
      // Patient form "choose client by name OR email".
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { officeName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phoneNumber: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.client.findMany({ where, select: clientSelect, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.client.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findFirst({ where: { id }, select: clientSelect });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async create(dto: CreateClientDto) {
    return this.prisma.client.create({
      data: tenantCreate<Prisma.ClientUncheckedCreateInput>({ ...dto }),
      select: clientSelect,
    });
  }

  async update(id: string, dto: UpdateClientDto) {
    await this.findOne(id);
    return this.prisma.client.update({ where: { id }, data: dto, select: clientSelect });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.client.delete({ where: { id } });
    return { deleted: true };
  }

  // ClientType management
  async findAllClientTypes() {
    return this.prisma.clientType.findMany({ orderBy: { name: 'asc' } });
  }

  async createClientType(dto: CreateClientTypeDto) {
    return this.prisma.clientType.create({
      data: tenantCreate<Prisma.ClientTypeUncheckedCreateInput>({ ...dto }),
    });
  }
}
