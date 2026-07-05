import { Injectable } from '@nestjs/common';
import { Prisma, WorkforceNotificationType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/**
 * Persists in-app workforce notifications. Records are tenant-stamped
 * automatically (WorkforceNotification carries labId), so callers never pass a
 * lab id. Recipients are resolved to User ids.
 */
@Injectable()
export class WorkforceNotificationService {
  constructor(private prisma: PrismaService) {}

  notify(
    recipientId: string,
    type: WorkforceNotificationType,
    title: string,
    body: string,
    relatedEntityId?: string,
    relatedEntityType?: string,
  ) {
    return this.prisma.workforceNotification.create({
      data: {
        recipientId,
        type,
        title,
        body,
        relatedEntityId: relatedEntityId ?? null,
        relatedEntityType: relatedEntityType ?? null,
      } as Prisma.WorkforceNotificationUncheckedCreateInput,
    });
  }

  /** Notify many recipients with the same payload (best-effort, sequential). */
  async notifyMany(
    recipientIds: string[],
    type: WorkforceNotificationType,
    title: string,
    body: string,
    relatedEntityId?: string,
    relatedEntityType?: string,
  ) {
    for (const id of new Set(recipientIds)) {
      await this.notify(id, type, title, body, relatedEntityId, relatedEntityType);
    }
  }

  /**
   * Active users in the current lab who can approve workforce actions — holders
   * of a super role or of the `employee:change` permission that Phase 1 uses to
   * gate approvals. User is tenant-scoped, so this is lab-local automatically.
   */
  async managerRecipientIds(): Promise<string[]> {
    const managers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        roles: {
          some: {
            role: {
              OR: [
                { isSuperRole: true },
                { permissions: { some: { permission: { code: 'employee:change' } } } },
              ],
            },
          },
        },
      },
      select: { id: true },
    });
    return managers.map((m) => m.id);
  }

  // ── Read endpoints (current user) ─────────────────────────────────────────
  list(recipientId: string) {
    return this.prisma.workforceNotification.findMany({
      where: { recipientId },
      orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  async markRead(id: string, recipientId: string) {
    await this.prisma.workforceNotification.updateMany({
      where: { id, recipientId },
      data: { isRead: true },
    });
    return { ok: true };
  }

  async markAllRead(recipientId: string) {
    const res = await this.prisma.workforceNotification.updateMany({
      where: { recipientId, isRead: false },
      data: { isRead: true },
    });
    return { updated: res.count };
  }

  async unreadCount(recipientId: string) {
    const count = await this.prisma.workforceNotification.count({
      where: { recipientId, isRead: false },
    });
    return { count };
  }
}
