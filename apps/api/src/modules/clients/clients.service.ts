import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { PortalUsersService } from '../portal/portal-users/portal-users.service';
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
  active: true,
  blocked: true,
  avatarUrl: true,
  labCodeId: true,
  labCode: { select: { id: true, code: true, region: true } },
  workspaceId: true,
  clientTypeId: true,
  clientType: { select: { id: true, name: true, type: true } },
  addresses: {
    select: { id: true, label: true, line1: true, line2: true, city: true, region: true, postalCode: true, country: true },
  },
  portalUsers: {
    select: { id: true, username: true, email: true, isPrimary: true, isActive: true, twoFactorEnabled: true },
  },
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class ClientsService {
  constructor(
    private prisma: PrismaService,
    private portalUsers: PortalUsersService,
  ) {}

  private addressCreate(addresses?: { line1: string }[]) {
    if (!addresses?.length) return undefined;
    return {
      create: addresses.map((a) =>
        tenantCreate<Prisma.ClientAddressUncheckedCreateWithoutClientInput>({ ...a }),
      ),
    };
  }

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
    const { addresses, createPortalLogin, twoFactorEnabled, ...rest } = dto;

    // Pre-check the portal email BEFORE creating the client, so a taken email
    // never leaves an orphan client behind.
    if (createPortalLogin && rest.email) {
      await this.portalUsers.assertEmailAvailable(rest.email);
    }

    const client = await this.prisma.client.create({
      data: tenantCreate<Prisma.ClientUncheckedCreateInput>({
        ...rest,
        addresses: this.addressCreate(addresses),
      }),
      select: clientSelect,
    });

    // Auth Information → create the client's PORTAL login and email the F2 setup
    // invite. Staff never set the password.
    if (createPortalLogin && rest.email) {
      await this.portalUsers.provisionForClient({
        clientId: client.id,
        email: rest.email,
        firstName: rest.firstName,
        lastName: rest.lastName,
        twoFactorEnabled,
      });
      return this.findOne(client.id); // include the freshly-created portalUsers
    }
    return client;
  }

  async update(id: string, dto: UpdateClientDto) {
    await this.findOne(id);
    const { addresses, ...rest } = dto;
    const data: Prisma.ClientUncheckedUpdateInput = { ...rest };
    if (addresses !== undefined) {
      data.addresses = { deleteMany: {}, ...this.addressCreate(addresses) };
    }
    return this.prisma.client.update({ where: { id }, data, select: clientSelect });
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
