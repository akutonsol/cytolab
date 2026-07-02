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

    const data = threads.map((t) => {
      const last = t.messages[0] ?? null;
      const others = t.participants.filter((p) => p.userId !== userId);
      return {
        id: t.id, type: t.type, subject: t.subject, clientId: t.clientId,
        client: t.client, updatedAt: t.updatedAt, messageCount: t._count.messages,
        participants: t.participants.map((p) => ({ userId: p.userId, portalUserId: p.portalUserId, name: this.name(p) })),
        title: t.subject || (t.type === 'CLIENT' ? (t.client?.officeName || `${t.client?.firstName ?? ''} ${t.client?.lastName ?? ''}`.trim() || 'Client') : (others[0] ? this.name(others[0]) : 'Thread')),
        lastMessage: last ? { body: last.body, createdAt: last.createdAt, authorUserId: last.authorUserId } : null,
        // No read-state model yet: a thread is "unread" when the latest message
        // was written by someone other than the current user.
        unread: !!last && last.authorUserId !== userId,
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
    const others = thread.participants.filter((p) => p.userId !== userId);
    return {
      ...thread,
      title: thread.subject || (thread.type === 'CLIENT' ? (thread.client?.officeName || `${thread.client?.firstName ?? ''} ${thread.client?.lastName ?? ''}`.trim() || 'Client') : (others[0] ? this.name(others[0]) : 'Thread')),
      counterpart: others[0] ? this.name(others[0]) : null,
    };
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
