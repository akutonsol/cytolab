import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ChangeRequestStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { ChangeRequestQueryDto, StaffReplyDto, TransitionChangeRequestDto } from './dto/change-request.dto';

// Status lifecycle: Open -> InReview -> Actioned | Declined. Actioned/Declined
// are terminal. Open can also be Declined outright.
const ALLOWED_TRANSITIONS: Record<ChangeRequestStatus, ChangeRequestStatus[]> = {
  [ChangeRequestStatus.Open]: [ChangeRequestStatus.InReview, ChangeRequestStatus.Declined],
  [ChangeRequestStatus.InReview]: [ChangeRequestStatus.Actioned, ChangeRequestStatus.Declined],
  [ChangeRequestStatus.Actioned]: [],
  [ChangeRequestStatus.Declined]: [],
};

const changeRequestSelect = {
  id: true,
  type: true,
  subject: true,
  status: true,
  recordId: true,
  clientId: true,
  createdByPortalUserId: true,
  assignedToUserId: true,
  createdAt: true,
  updatedAt: true,
  client: { select: { id: true, firstName: true, lastName: true, officeName: true } },
  messages: {
    select: { id: true, body: true, authorPortalUserId: true, authorUserId: true, createdAt: true },
    orderBy: { createdAt: 'asc' as const },
  },
  events: {
    select: { id: true, status: true, note: true, byUserId: true, createdAt: true },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

/**
 * Staff-facing change-request triage. Lab-scoped (staff context), so a lab only
 * ever sees its own clients' requests. Status transitions are validated and each
 * writes an append-only ChangeRequestEvent (who/when/what). clientId on the
 * audit/message rows is taken from the parent request, never external input.
 */
@Injectable()
export class ChangeRequestsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: ChangeRequestQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where: Prisma.ChangeRequestWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.clientId) where.clientId = query.clientId;

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

  /** Validated status transition, recording a ChangeRequestEvent audit entry. */
  async transition(id: string, userId: string, dto: TransitionChangeRequestDto) {
    const cr = await this.prisma.changeRequest.findFirst({
      where: { id },
      select: { id: true, status: true, clientId: true },
    });
    if (!cr) throw new NotFoundException('Change request not found');

    const allowed = ALLOWED_TRANSITIONS[cr.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(`Cannot transition a change request from ${cr.status} to ${dto.status}`);
    }

    return this.prisma.changeRequest.update({
      where: { id },
      data: {
        status: dto.status,
        events: {
          create: tenantCreate<Prisma.ChangeRequestEventUncheckedCreateWithoutChangeRequestInput>({
            // labId stamped by the tenancy guard; clientId from the parent request.
            clientId: cr.clientId,
            status: dto.status,
            note: dto.note,
            byUserId: userId,
          }),
        },
      },
      select: changeRequestSelect,
    });
  }

  /** Staff reply on the thread; author captured as the staff user. */
  async reply(id: string, userId: string, dto: StaffReplyDto) {
    const cr = await this.prisma.changeRequest.findFirst({
      where: { id },
      select: { id: true, clientId: true },
    });
    if (!cr) throw new NotFoundException('Change request not found');

    await this.prisma.changeRequestMessage.create({
      data: tenantCreate<Prisma.ChangeRequestMessageUncheckedCreateInput>({
        changeRequestId: id,
        clientId: cr.clientId,
        body: dto.body,
        authorUserId: userId,
      }),
    });
    return this.findOne(id);
  }
}
