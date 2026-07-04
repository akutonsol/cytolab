import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { paginate } from '../../../common/dto/pagination.dto';
import { portalCreate } from '../../../common/tenancy/tenancy.extension';
import { NotificationsHelper } from '../../notifications/notifications.helper';
import { PortalPrincipal } from '../common/portal-principal';
import {
  CreateChangeRequestDto,
  CreatePortalMessageDto,
  PortalChangeRequestQueryDto,
} from './dto/portal-change-request.dto';

const changeRequestSelect = {
  id: true,
  type: true,
  subject: true,
  status: true,
  recordId: true,
  createdAt: true,
  updatedAt: true,
  messages: {
    select: { id: true, body: true, authorPortalUserId: true, authorUserId: true, createdAt: true },
    orderBy: { createdAt: 'asc' as const },
  },
  events: {
    // Status timeline the client can see (no internal staff identity).
    select: { id: true, status: true, note: true, createdAt: true },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

/**
 * Portal-side change requests. Every query is automatically lab + client scoped
 * (portal context, Rule A), and clientId/labId are stamped on writes from
 * context — never the request body (portalCreate omits both at the type level).
 */
@Injectable()
export class PortalChangeRequestsService {
  constructor(private prisma: PrismaService, private notifs: NotificationsHelper) {}

  async create(dto: CreateChangeRequestDto, principal: PortalPrincipal) {
    // If a record is referenced it must be the client's own (client-scoped).
    if (dto.recordId) {
      const record = await this.prisma.record.findFirst({ where: { id: dto.recordId }, select: { id: true } });
      if (!record) throw new NotFoundException('Record not found');
    }

    const cr = await this.prisma.changeRequest.create({
      data: portalCreate<Prisma.ChangeRequestUncheckedCreateInput>({
        type: dto.type,
        subject: dto.subject,
        recordId: dto.recordId,
        createdByPortalUserId: principal.portalUserId,
        messages: {
          create: [
            portalCreate<Prisma.ChangeRequestMessageUncheckedCreateWithoutChangeRequestInput>({
              body: dto.message,
              authorPortalUserId: principal.portalUserId,
            }),
          ],
        },
      }),
      select: changeRequestSelect,
    });

    // Alert lab staff who triage requests.
    const who = await this.portalUserName(principal.portalUserId);
    await this.notifs.notifyPermission('changerequest:view', {
      type: NotificationType.CHANGE_REQUEST_RECEIVED,
      title: 'New client request',
      body: `${who} sent: "${cr.subject}"`,
      link: '/change-requests',
      entityId: cr.id,
      entityType: 'changerequest',
    });
    return cr;
  }

  private async portalUserName(portalUserId: string): Promise<string> {
    const u = await this.prisma.portalUser.findFirst({ where: { id: portalUserId }, select: { firstName: true, lastName: true } }).catch(() => null);
    return u ? `${u.firstName} ${u.lastName}`.trim() || 'A client' : 'A client';
  }

  async findAll(query: PortalChangeRequestQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where: Prisma.ChangeRequestWhereInput = {};
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      this.prisma.changeRequest.findMany({ where, skip, take: pageSize, orderBy: { updatedAt: 'desc' }, select: changeRequestSelect }),
      this.prisma.changeRequest.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findOne(id: string) {
    const cr = await this.prisma.changeRequest.findFirst({ where: { id }, select: changeRequestSelect });
    if (!cr) throw new NotFoundException('Change request not found');
    return cr;
  }

  /** Add a message to the client's own change request thread. */
  async addMessage(id: string, dto: CreatePortalMessageDto, principal: PortalPrincipal) {
    // Client-scoped: a foreign change request resolves to null -> 404.
    const cr = await this.prisma.changeRequest.findFirst({ where: { id }, select: { id: true, subject: true } });
    if (!cr) throw new NotFoundException('Change request not found');

    await this.prisma.changeRequestMessage.create({
      data: portalCreate<Prisma.ChangeRequestMessageUncheckedCreateInput>({
        changeRequestId: id,
        body: dto.body,
        authorPortalUserId: principal.portalUserId,
      }),
    });

    const who = await this.portalUserName(principal.portalUserId);
    await this.notifs.notifyPermission('changerequest:view', {
      type: NotificationType.CHANGE_REQUEST_REPLIED,
      title: 'Client replied',
      body: `${who} replied on "${cr.subject}"`,
      link: '/change-requests',
      entityId: id,
      entityType: 'changerequest',
    });
    return this.findOne(id);
  }
}
