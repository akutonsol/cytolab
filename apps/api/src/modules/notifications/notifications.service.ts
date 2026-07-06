import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateNotificationDto, NotificationQueryDto } from './dto/notification.dto';

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  read: true,
  readAt: true,
  link: true,
  entityId: true,
  entityType: true,
  createdAt: true,
} as const;

/**
 * Per-user in-app notifications. Every query is automatically lab-scoped by the
 * tenancy guard; on top of that we always constrain by userId so a user only
 * ever sees, or mutates, their own notifications.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeGateway,
  ) {}

  async findAll(userId: string, query: NotificationQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where: Prisma.NotificationWhereInput = { userId };
    if (query.read !== undefined) where.read = query.read;

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' }, select: notificationSelect }),
      this.prisma.notification.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({ where: { userId, read: false } });
    return { count };
  }

  async markRead(id: string, userId: string) {
    // Ownership: a foreign/other-user notification resolves to null (lab-scoped
    // read) -> 403, indistinguishable from a non-existent id.
    const existing = await this.prisma.notification.findFirst({ where: { id }, select: { id: true, userId: true } });
    if (!existing || existing.userId !== userId) throw new ForbiddenException('Notification not found');
    await this.prisma.notification.update({ where: { id }, data: { read: true, readAt: new Date() } });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    const res = await this.prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true, readAt: new Date() } });
    return { ok: true, updated: res.count };
  }

  /** Internal only — stamps labId from the ambient tenant context. */
  async create(dto: CreateNotificationDto) {
    const created = await this.prisma.notification.create({
      data: tenantCreate<Prisma.NotificationUncheckedCreateInput>({
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        link: dto.link,
        entityId: dto.entityId,
        entityType: dto.entityType,
      }),
    });
    // Realtime: push to just the recipient so their bell badge updates live.
    this.realtime.emitToUser(dto.userId, 'notification:new', {
      type: 'notification:new',
      data: { id: created.id, title: created.title, type: created.type },
    });
    return created;
  }
}
