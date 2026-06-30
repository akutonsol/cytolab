import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { ClientQueryDto, CreateClientDto, CreateClientTypeDto, UpdateClientDto } from './dto/client.dto';

const clientSelect = {
  id: true,
  firstName: true,
  lastName: true,
  officeName: true,
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

  async findAll(labId: string, query: ClientQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: any = { labId };
    if (query.q) {
      const q = query.q;
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { officeName: { contains: q, mode: 'insensitive' } },
        { phoneNumber: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.client.findMany({ where, select: clientSelect, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
      this.prisma.client.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findOne(labId: string, id: string) {
    const client = await this.prisma.client.findFirst({ where: { id, labId }, select: clientSelect });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async create(labId: string, dto: CreateClientDto) {
    return this.prisma.client.create({ data: { labId, ...dto }, select: clientSelect });
  }

  async update(labId: string, id: string, dto: UpdateClientDto) {
    await this.findOne(labId, id);
    return this.prisma.client.update({ where: { id }, data: dto, select: clientSelect });
  }

  async remove(labId: string, id: string) {
    await this.findOne(labId, id);
    await this.prisma.client.delete({ where: { id } });
    return { deleted: true };
  }

  // ClientType management
  async findAllClientTypes(labId: string) {
    return this.prisma.clientType.findMany({ where: { labId }, orderBy: { name: 'asc' } });
  }

  async createClientType(labId: string, dto: CreateClientTypeDto) {
    return this.prisma.clientType.create({ data: { labId, ...dto } });
  }
}
