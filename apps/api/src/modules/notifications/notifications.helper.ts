import { Injectable, Logger } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';

export interface NotifyData {
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  entityId?: string;
  entityType?: string;
}

/**
 * The write-side of notifications, injected into other domain services. Callers
 * may run under EITHER the staff or the portal tenant context; the portal
 * tenancy guard refuses direct access to non-client-scoped models (User,
 * Notification), so we resolve the current labId from context and do all work
 * under `runSystem` with an explicit labId. Every method is best-effort: a
 * notification failure must never break the business action that triggered it.
 */
@Injectable()
export class NotificationsHelper {
  private readonly log = new Logger(NotificationsHelper.name);
  constructor(private prisma: PrismaService, private labContext: LabContext) {}

  private labId(): string | undefined {
    return this.labContext.getStore()?.labId;
  }

  /** Notify one user in the current lab. */
  async notifyUser(userId: string, data: NotifyData): Promise<void> {
    const labId = this.labId();
    if (!userId || !labId) return;
    try {
      await this.labContext.runSystem(() =>
        this.prisma.notification.create({ data: { labId, userId, ...data } }),
      );
    } catch (e) {
      this.log.warn(`notifyUser failed: ${(e as Error).message}`);
    }
  }

  /**
   * Notify every active user in the current lab who holds `permissionCode`
   * (super-role holders included, since they bypass the permission guard).
   */
  async notifyPermission(permissionCode: string, data: NotifyData): Promise<void> {
    const labId = this.labId();
    if (!labId) return;
    try {
      await this.labContext.runSystem(async () => {
        const users = await this.prisma.user.findMany({
          where: {
            labId,
            isActive: true,
            roles: {
              some: {
                role: {
                  OR: [
                    { isSuperRole: true },
                    { permissions: { some: { permission: { code: permissionCode } } } },
                  ],
                },
              },
            },
          },
          select: { id: true },
        });
        if (users.length === 0) return;
        await this.prisma.notification.createMany({
          data: users.map((u) => ({ labId, userId: u.id, ...data })),
        });
      });
    } catch (e) {
      this.log.warn(`notifyPermission failed: ${(e as Error).message}`);
    }
  }
}
