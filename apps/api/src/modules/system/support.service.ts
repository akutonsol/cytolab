import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  Prisma,
  SubmitterType,
  TicketPriority,
  TicketStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsHelper } from '../../modules/notifications/notifications.helper';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { paginate } from '../../common/dto/pagination.dto';
import {
  AssignTicketDto,
  CreateAnnouncementDto,
  CreateCommentDto,
  CreateMaintenanceWindowDto,
  CreateTicketDto,
  PublicCreateTicketDto,
  ResolveTicketDto,
  TicketQueryDto,
  UpdateAnnouncementDto,
  UpdateMaintenanceWindowDto,
  UpdateTicketDto,
} from './dto/support.dto';

// SLA response windows (hours) applied to slaDeadline at ticket creation.
const SLA_HOURS: Record<TicketPriority, number> = {
  CRITICAL: 4,
  HIGH: 24,
  MEDIUM: 72,
  LOW: 168,
};

// Ticket statuses still "on the clock" for SLA-breach purposes.
const OPEN_STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'PENDING_RESPONSE'];

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly labContext: LabContext,
    private readonly notifications: NotificationsHelper,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Run `fn` cross-lab for superusers (they see/act on every lab), or in the
   * caller's normal lab scope otherwise. Creates that must stamp a labId never
   * use this — they run in the caller's request scope so the tenancy guard
   * stamps the lab automatically.
   */
  private run<T>(user: AuthUser, fn: () => Promise<T>): Promise<T> {
    return user.isSuperRole ? this.labContext.runSystem(fn) : fn();
  }

  private slaDeadline(priority: TicketPriority, from = new Date()): Date {
    return new Date(from.getTime() + SLA_HOURS[priority] * 3_600_000);
  }

  /** TKT-YYYY-NNNN, sequential per lab per year (retries on the global unique). */
  private async createTicketWithNumber(
    data: Omit<Prisma.SupportTicketUncheckedCreateInput, 'labId' | 'ticketNumber'>,
  ) {
    const year = new Date().getFullYear();
    const yearStart = new Date(year, 0, 1);
    // Count auto-scopes to the active lab (tenancy extension).
    const soFar = await this.prisma.supportTicket.count({
      where: { createdAt: { gte: yearStart } },
    });
    let seq = soFar + 1;
    for (let attempt = 0; attempt < 12; attempt++) {
      const ticketNumber = `TKT-${year}-${String(seq).padStart(4, '0')}`;
      try {
        // labId omitted → stamped by the tenancy guard from request context.
        return await this.prisma.supportTicket.create({
          data: { ...data, ticketNumber } as Prisma.SupportTicketUncheckedCreateInput,
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          seq++; // ticketNumber is globally unique; bump and retry
          continue;
        }
        throw e;
      }
    }
    throw new BadRequestException('Could not allocate a ticket number, please retry');
  }

  // ─── Tickets ──────────────────────────────────────────────────────────────

  async createTicket(user: AuthUser, dto: CreateTicketDto) {
    const priority = dto.priority ?? 'MEDIUM';
    const ticket = await this.createTicketWithNumber({
      title: dto.title,
      description: dto.description,
      category: dto.category,
      priority,
      submitterType: 'STAFF',
      submittedById: user.userId,
      submitterName: user.email,
      submitterEmail: user.email,
      assignedToId: dto.assignedToId ?? null,
      slaDeadline: this.slaDeadline(priority),
    });

    await this.labContext.runLabScoped(ticket.labId, async () => {
      await this.notifications.notifyPermission('system:health', {
        type: NotificationType.SYSTEM_ALERT,
        title: `New support ticket ${ticket.ticketNumber}`,
        body: `${ticket.title} (${ticket.priority})`,
        link: `/system/support?ticket=${ticket.id}`,
        entityId: ticket.id,
        entityType: 'SupportTicket',
      });
      if (ticket.assignedToId) await this.notifyAssignee(ticket.assignedToId, ticket.ticketNumber, ticket.id);
    });
    // Realtime: support desk is a superuser surface → push to all superusers.
    this.realtime.emitToSuperusers('ticket:new', {
      type: 'ticket:new',
      data: { id: ticket.id, ticketNumber: ticket.ticketNumber, priority: ticket.priority, title: ticket.title },
    });
    return ticket;
  }

  async createPublicTicket(dto: PublicCreateTicketDto) {
    if (dto.submitterType !== SubmitterType.CLIENT && dto.submitterType !== SubmitterType.CONSULTANT) {
      throw new BadRequestException('submitterType must be CLIENT or CONSULTANT');
    }
    // Validate the target lab exists (cross-lab lookup, no auth context).
    const lab = await this.labContext.runSystem(() =>
      this.prisma.lab.findUnique({ where: { id: dto.labId }, select: { id: true } }),
    );
    if (!lab) throw new BadRequestException('Unknown lab');

    const priority = dto.priority ?? 'MEDIUM';
    // Run in the target lab's scope so count/create/notify all resolve there.
    return this.labContext.runLabScoped(dto.labId, async () => {
      const ticket = await this.createTicketWithNumber({
        title: dto.title,
        description: dto.description,
        category: dto.category,
        priority,
        submitterType: dto.submitterType,
        submitterName: dto.submitterName,
        submitterEmail: dto.submitterEmail,
        slaDeadline: this.slaDeadline(priority),
      });
      await this.notifications.notifyPermission('system:health', {
        type: NotificationType.SYSTEM_ALERT,
        title: `New ${dto.submitterType.toLowerCase()} ticket ${ticket.ticketNumber}`,
        body: `${ticket.title} — from ${dto.submitterName}`,
        link: `/system/support?ticket=${ticket.id}`,
        entityId: ticket.id,
        entityType: 'SupportTicket',
      });
      return { ticketNumber: ticket.ticketNumber, id: ticket.id };
    });
  }

  async listTickets(user: AuthUser, query: TicketQueryDto) {
    const { page = 1, pageSize = 20 } = query;
    const where: Prisma.SupportTicketWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.priority && { priority: query.priority }),
      ...(query.category && { category: query.category }),
      ...(query.assignedToId && { assignedToId: query.assignedToId }),
      ...(query.submitterType && { submitterType: query.submitterType }),
      ...((query.startDate || query.endDate) && {
        createdAt: {
          ...(query.startDate && { gte: new Date(query.startDate) }),
          ...(query.endDate && { lte: new Date(query.endDate) }),
        },
      }),
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { ticketNumber: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };
    return this.run(user, async () => {
      const [data, total] = await Promise.all([
        this.prisma.supportTicket.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.supportTicket.count({ where }),
      ]);
      return paginate(data, total, page, pageSize);
    });
  }

  async getTicket(user: AuthUser, id: string) {
    const ticket = await this.run(user, () =>
      this.prisma.supportTicket.findUnique({
        where: { id },
        include: {
          comments: { orderBy: { createdAt: 'asc' } },
          attachments: { orderBy: { createdAt: 'asc' } },
        },
      }),
    );
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async updateTicket(user: AuthUser, id: string, dto: UpdateTicketDto) {
    return this.run(user, async () => {
      const existing = await this.prisma.supportTicket.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Ticket not found');
      const updated = await this.prisma.supportTicket.update({
        where: { id },
        data: {
          ...(dto.status && { status: dto.status }),
          ...(dto.priority && { priority: dto.priority }),
          ...(dto.assignedToId !== undefined && { assignedToId: dto.assignedToId }),
          ...(dto.resolutionNotes !== undefined && { resolutionNotes: dto.resolutionNotes }),
        },
      });
      if (dto.assignedToId && dto.assignedToId !== existing.assignedToId) {
        await this.labContext.runLabScoped(updated.labId, () =>
          this.notifyAssignee(dto.assignedToId!, updated.ticketNumber, updated.id),
        );
      }
      return updated;
    });
  }

  async assignTicket(user: AuthUser, id: string, dto: AssignTicketDto) {
    return this.run(user, async () => {
      const existing = await this.prisma.supportTicket.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Ticket not found');
      const updated = await this.prisma.supportTicket.update({
        where: { id },
        data: {
          assignedToId: dto.assignedToId,
          ...(existing.status === 'OPEN' && { status: 'IN_PROGRESS' as TicketStatus }),
        },
      });
      await this.labContext.runLabScoped(updated.labId, () =>
        this.notifyAssignee(dto.assignedToId, updated.ticketNumber, updated.id),
      );
      return updated;
    });
  }

  async resolveTicket(user: AuthUser, id: string, dto: ResolveTicketDto) {
    return this.run(user, async () => {
      const existing = await this.prisma.supportTicket.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Ticket not found');
      return this.prisma.supportTicket.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          ...(dto.resolutionNotes !== undefined && { resolutionNotes: dto.resolutionNotes }),
        },
      });
    });
  }

  async closeTicket(user: AuthUser, id: string) {
    return this.run(user, async () => {
      const existing = await this.prisma.supportTicket.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Ticket not found');
      return this.prisma.supportTicket.update({
        where: { id },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
    });
  }

  // ─── Comments ─────────────────────────────────────────────────────────────

  async addComment(user: AuthUser, id: string, dto: CreateCommentDto) {
    return this.run(user, async () => {
      const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
      if (!ticket) throw new NotFoundException('Ticket not found');
      const isInternal = dto.isInternal ?? false;
      const comment = await this.prisma.supportComment.create({
        data: {
          ticketId: id,
          authorId: user.userId,
          authorName: user.email,
          authorType: 'STAFF',
          body: dto.body,
          isInternal,
        },
      });
      // Notify the (staff) submitter of a public-facing reply, unless it's them.
      if (!isInternal && ticket.submittedById && ticket.submittedById !== user.userId) {
        await this.labContext.runLabScoped(ticket.labId, () =>
          this.notifications.notifyUser(ticket.submittedById!, {
            type: NotificationType.SYSTEM_ALERT,
            title: `Reply on ${ticket.ticketNumber}`,
            body: dto.body.slice(0, 140),
            link: `/system/support?ticket=${ticket.id}`,
            entityId: ticket.id,
            entityType: 'SupportTicket',
          }),
        );
      }
      return comment;
    });
  }

  async listComments(user: AuthUser, id: string) {
    return this.run(user, async () => {
      const ticket = await this.prisma.supportTicket.findUnique({ where: { id }, select: { id: true } });
      if (!ticket) throw new NotFoundException('Ticket not found');
      // Authenticated callers here are staff → internal notes are visible. The
      // isInternal flag gates visibility for any future external/portal view.
      return this.prisma.supportComment.findMany({
        where: { ticketId: id },
        orderBy: { createdAt: 'asc' },
      });
    });
  }

  // ─── Stats (superuser) ──────────────────────────────────────────────────────

  async stats(user: AuthUser) {
    return this.run(user, async () => {
      const now = new Date();
      const [byStatus, breachedSla, byPriorityRaw, byCategoryRaw, resolved] = await Promise.all([
        this.prisma.supportTicket.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.supportTicket.count({
          where: { status: { in: OPEN_STATUSES }, slaDeadline: { lt: now } },
        }),
        this.prisma.supportTicket.groupBy({ by: ['priority'], _count: { _all: true } }),
        this.prisma.supportTicket.groupBy({ by: ['category'], _count: { _all: true } }),
        this.prisma.supportTicket.findMany({
          where: { resolvedAt: { not: null } },
          select: { createdAt: true, resolvedAt: true },
        }),
      ]);

      const statusCount = (s: TicketStatus) =>
        byStatus.find((r) => r.status === s)?._count._all ?? 0;
      const avgResolutionHours = resolved.length
        ? Math.round(
            (resolved.reduce(
              (sum, t) => sum + (t.resolvedAt!.getTime() - t.createdAt.getTime()),
              0,
            ) /
              resolved.length /
              3_600_000) *
              10,
          ) / 10
        : 0;

      return {
        open: statusCount('OPEN'),
        inProgress: statusCount('IN_PROGRESS'),
        pendingResponse: statusCount('PENDING_RESPONSE'),
        resolved: statusCount('RESOLVED'),
        closed: statusCount('CLOSED'),
        breachedSla,
        avgResolutionHours,
        byPriority: Object.fromEntries(byPriorityRaw.map((r) => [r.priority, r._count._all])),
        byCategory: Object.fromEntries(byCategoryRaw.map((r) => [r.category, r._count._all])),
      };
    });
  }

  // ─── Maintenance windows ────────────────────────────────────────────────────

  async createWindow(user: AuthUser, dto: CreateMaintenanceWindowDto) {
    const win = await this.prisma.maintenanceWindow.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        scheduledAt: new Date(dto.scheduledAt),
        durationMinutes: dto.durationMinutes,
        affectedSystems: dto.affectedSystems,
        notifyUsers: dto.notifyUsers ?? true,
        ticketId: dto.ticketId ?? null,
        createdById: user.userId,
      } as Prisma.MaintenanceWindowUncheckedCreateInput,
    });
    if (win.notifyUsers) {
      await this.labContext.runLabScoped(win.labId, () =>
        this.notifyAllLabUsers(win.labId, {
          type: NotificationType.SYSTEM_ALERT,
          title: 'Scheduled maintenance',
          body: `${win.title} — ${new Date(win.scheduledAt).toLocaleString()} (${win.durationMinutes} min)`,
          link: '/system/support',
          entityId: win.id,
          entityType: 'MaintenanceWindow',
        }),
      );
    }
    return win;
  }

  async listWindows(user: AuthUser) {
    return this.run(user, () =>
      this.prisma.maintenanceWindow.findMany({ orderBy: { scheduledAt: 'desc' } }),
    );
  }

  async updateWindow(user: AuthUser, id: string, dto: UpdateMaintenanceWindowDto) {
    return this.run(user, async () => {
      const existing = await this.prisma.maintenanceWindow.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Maintenance window not found');
      return this.prisma.maintenanceWindow.update({
        where: { id },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.scheduledAt && { scheduledAt: new Date(dto.scheduledAt) }),
          ...(dto.durationMinutes !== undefined && { durationMinutes: dto.durationMinutes }),
          ...(dto.affectedSystems && { affectedSystems: dto.affectedSystems }),
          ...(dto.notifyUsers !== undefined && { notifyUsers: dto.notifyUsers }),
          ...(dto.status && { status: dto.status }),
        },
      });
    });
  }

  async cancelWindow(user: AuthUser, id: string) {
    return this.run(user, async () => {
      const existing = await this.prisma.maintenanceWindow.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Maintenance window not found');
      return this.prisma.maintenanceWindow.update({ where: { id }, data: { status: 'CANCELLED' } });
    });
  }

  // ─── Announcements ──────────────────────────────────────────────────────────

  createAnnouncement(user: AuthUser, dto: CreateAnnouncementDto) {
    return this.prisma.systemAnnouncement.create({
      data: {
        title: dto.title,
        body: dto.body,
        type: dto.type ?? 'INFO',
        showFrom: dto.showFrom ? new Date(dto.showFrom) : new Date(),
        showUntil: dto.showUntil ? new Date(dto.showUntil) : null,
        createdById: user.userId,
      } as Prisma.SystemAnnouncementUncheckedCreateInput,
    });
  }

  /** All announcements (active + inactive) for the management tab. */
  listAnnouncements(user: AuthUser) {
    return this.run(user, () =>
      this.prisma.systemAnnouncement.findMany({ orderBy: { showFrom: 'desc' } }),
    );
  }

  /** Currently-active announcements for the caller's lab. */
  activeAnnouncements() {
    const now = new Date();
    return this.prisma.systemAnnouncement.findMany({
      where: {
        isActive: true,
        showFrom: { lte: now },
        OR: [{ showUntil: null }, { showUntil: { gte: now } }],
      },
      orderBy: { showFrom: 'desc' },
    });
  }

  async updateAnnouncement(user: AuthUser, id: string, dto: UpdateAnnouncementDto) {
    return this.run(user, async () => {
      const existing = await this.prisma.systemAnnouncement.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('Announcement not found');
      return this.prisma.systemAnnouncement.update({
        where: { id },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.body !== undefined && { body: dto.body }),
          ...(dto.type !== undefined && { type: dto.type }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          ...(dto.showFrom && { showFrom: new Date(dto.showFrom) }),
          ...(dto.showUntil !== undefined && { showUntil: dto.showUntil ? new Date(dto.showUntil) : null }),
        },
      });
    });
  }

  // ─── Notification helpers ────────────────────────────────────────────────────

  private notifyAssignee(userId: string, ticketNumber: string, ticketId: string) {
    return this.notifications.notifyUser(userId, {
      type: NotificationType.SYSTEM_ALERT,
      title: `Ticket ${ticketNumber} assigned to you`,
      body: 'You have been assigned a support ticket.',
      link: `/system/support?ticket=${ticketId}`,
      entityId: ticketId,
      entityType: 'SupportTicket',
    });
  }

  /** Broadcast to every active user in a lab (mirrors NotificationsHelper's write path). */
  private async notifyAllLabUsers(
    labId: string,
    data: { type: NotificationType; title: string; body: string; link?: string; entityId?: string; entityType?: string },
  ) {
    try {
      await this.labContext.runSystem(async () => {
        const users = await this.prisma.user.findMany({
          where: { labId, isActive: true },
          select: { id: true },
        });
        if (!users.length) return;
        await this.prisma.notification.createMany({
          data: users.map((u) => ({ labId, userId: u.id, ...data })),
        });
      });
    } catch {
      // best-effort — never fail the maintenance-window write over a notification
    }
  }
}
