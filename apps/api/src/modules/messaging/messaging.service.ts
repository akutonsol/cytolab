import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ThreadType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { CreateThreadDto, SendMessageDto, ThreadQueryDto, UserQueryDto } from './dto/messaging.dto';

// Selects reused across thread reads.
const userLite = { select: { id: true, firstName: true, lastName: true, email: true } };
const portalLite = { select: { id: true, firstName: true, lastName: true, email: true } };
const participantInclude = { user: userLite, portalUser: portalLite };
const clientLite = { select: { id: true, officeName: true, firstName: true, lastName: true, accountNo: true } };

@Injectable()
export class MessagingService {
  constructor(
    private prisma: PrismaService,
    private labContext: LabContext,
  ) {}

  private name(p: any): string {
    const u = p.user ?? p.portalUser;
    return u ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || 'Unknown' : 'Unknown';
  }

  /** Threads the user participates in, newest activity first, with a preview + unread flag. */
  async listThreads(userId: string, query: ThreadQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ThreadWhereInput = { participants: { some: { userId } } };
    if (query.type) where.type = query.type;

    const [threads, total] = await Promise.all([
      this.prisma.thread.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          client: clientLite,
          participants: { include: participantInclude },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.thread.count({ where }),
    ]);

    // Per-thread unread count = inbound messages this user hasn't read yet.
    const threadIds = threads.map((t) => t.id);
    const unreadGroups = threadIds.length
      ? await this.prisma.message.groupBy({
          by: ['threadId'],
          where: { threadId: { in: threadIds }, authorUserId: { not: userId }, readAt: null },
          _count: { _all: true },
        })
      : [];
    const unreadMap = new Map(unreadGroups.map((g) => [g.threadId, g._count._all]));

    const data = threads.map((t) => {
      const last = t.messages[0] ?? null;
      const others = t.participants.filter((p) => p.userId !== userId);
      const unreadCount = unreadMap.get(t.id) ?? 0;
      return {
        id: t.id, type: t.type, subject: t.subject, clientId: t.clientId,
        client: t.client, updatedAt: t.updatedAt, messageCount: t._count.messages,
        participants: t.participants.map((p) => ({ userId: p.userId, portalUserId: p.portalUserId, name: this.name(p) })),
        title: t.subject || (t.type === 'CLIENT' ? (t.client?.officeName || `${t.client?.firstName ?? ''} ${t.client?.lastName ?? ''}`.trim() || 'Client') : (others[0] ? this.name(others[0]) : 'Thread')),
        lastMessage: last ? { body: last.body, createdAt: last.createdAt, authorUserId: last.authorUserId } : null,
        unreadCount,
        // A thread is unread when it holds inbound messages this user has not
        // yet read — so opening it (which marks them read) clears the flag.
        unread: unreadCount > 0,
      };
    });
    return paginate(data, total, page, pageSize);
  }

  /** Full thread with messages (chronological) + participants. Participant-gated. */
  async getThread(userId: string, threadId: string) {
    const thread = await this.prisma.thread.findFirst({
      where: { id: threadId, participants: { some: { userId } } },
      include: {
        client: clientLite,
        participants: { include: participantInclude },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { authorUser: userLite, authorPortalUser: portalLite },
        },
      },
    });
    if (!thread) throw new NotFoundException('Thread not found');

    // Fetching a thread delivers the recipient's inbound, not-yet-delivered
    // messages. The returned payload already carries readAt/deliveredAt scalars
    // (getThread uses `include`, so all message columns come back).
    await this.prisma.message.updateMany({
      where: { threadId, deliveredAt: null, authorUserId: { not: userId } },
      data: { deliveredAt: new Date() },
    });

    const others = thread.participants.filter((p) => p.userId !== userId);
    return {
      ...thread,
      title: thread.subject || (thread.type === 'CLIENT' ? (thread.client?.officeName || `${thread.client?.firstName ?? ''} ${thread.client?.lastName ?? ''}`.trim() || 'Client') : (others[0] ? this.name(others[0]) : 'Thread')),
      counterpart: others[0] ? this.name(others[0]) : null,
    };
  }

  /** Mark every inbound message in a thread as read (and delivered) by the user. */
  async markThreadRead(userId: string, threadId: string) {
    await this.getThread(userId, threadId); // participant-gate
    await this.prisma.message.updateMany({
      where: { threadId, readAt: null, authorUserId: { not: userId } },
      data: { readAt: new Date(), deliveredAt: new Date() },
    });
    return { ok: true };
  }

  /** Refresh this user's typing indicator on the thread (expires in 5s). */
  async setTyping(userId: string, threadId: string) {
    await this.getThread(userId, threadId); // participant-gate
    const expiresAt = new Date(Date.now() + 5000);
    await this.prisma.typingIndicator.upsert({
      where: { threadId_userId: { threadId, userId } },
      create: { threadId, userId, expiresAt },
      update: { expiresAt },
    });
    return { ok: true };
  }

  /** Active (non-expired) typing indicators from OTHER participants. */
  async getTyping(userId: string, threadId: string) {
    await this.getThread(userId, threadId); // participant-gate
    const typing = await this.prisma.typingIndicator.findMany({
      where: { threadId, expiresAt: { gt: new Date() }, userId: { not: userId } },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    return typing.map((t) => ({
      userId: t.userId,
      name: `${t.user.firstName} ${t.user.lastName}`.trim(),
      expiresAt: t.expiresAt,
    }));
  }

  /** Create a thread, adding the creator + any other staff as participants. */
  async createThread(userId: string, dto: CreateThreadDto) {
    const type = dto.type ?? ThreadType.INTERNAL;
    if (type === ThreadType.CLIENT && !dto.clientId) {
      throw new BadRequestException('A client is required for a client thread.');
    }
    const userIds = [...new Set([userId, ...(dto.userIds ?? [])])];

    const thread = await this.prisma.thread.create({
      data: tenantCreate<Prisma.ThreadUncheckedCreateInput>({
        type,
        subject: dto.subject?.trim() || null,
        clientId: type === ThreadType.CLIENT ? dto.clientId : null,
        participants: { create: userIds.map((uid) => ({ userId: uid })) },
      }),
      include: { participants: { include: participantInclude }, client: clientLite },
    });
    return thread;
  }

  /** Post a message to a thread the user participates in, then touch updatedAt. */
  async sendMessage(userId: string, threadId: string, dto: SendMessageDto) {
    const thread = await this.prisma.thread.findFirst({
      where: { id: threadId, participants: { some: { userId } } },
      select: { id: true },
    });
    if (!thread) throw new ForbiddenException('You are not a participant of this thread.');

    const message = await this.prisma.message.create({
      data: { threadId, body: dto.body.trim(), authorUserId: userId },
      include: { authorUser: userLite },
    });
    // @updatedAt only fires on an actual field change — set it explicitly.
    await this.prisma.thread.update({ where: { id: threadId }, data: { updatedAt: new Date() } });
    return message;
  }

  /** Lab-scoped active-staff list for the New Thread participant picker. */
  async listUsers(query: UserQueryDto) {
    const where: Prisma.UserWhereInput = { isActive: true };
    if (query.q) {
      where.OR = [
        { firstName: { contains: query.q, mode: 'insensitive' } },
        { lastName: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const data = await this.prisma.user.findMany({
      where,
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      take: 50,
    });
    return data.map((u) => ({ ...u, avatarUrl: null }));
  }
}
