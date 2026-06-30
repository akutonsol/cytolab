import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { paginate } from '../../../common/dto/pagination.dto';
import { PortalRecordQueryDto } from './dto/portal-record.dto';

// The status timeline (RecordStatusEvent) is NOT client-scoped, so it is read
// ONLY as an include off the (client-scoped) Record — never queried directly.
// Rows therefore arrive via the FK join from owned records, which is the
// structural guarantee that a portal user only ever sees its own timeline.
const portalRecordSelect = {
  id: true,
  identifier: true,
  labNumber: true,
  urgent: true,
  status: true,
  dateStatus: true,
  createdAt: true,
  patient: { select: { registrationNo: true, firstName: true, lastName: true } },
  specimens: { select: { id: true, type: true, label: true, dateReceived: true } },
  statusHistory: {
    select: { status: true, notes: true, createdAt: true },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

/**
 * Sample tracking for the client portal. Every query is automatically lab- AND
 * client-scoped by the tenancy guard (portal context), so a portal user can only
 * ever see its own client's records — no manual where clause, and a crafted id
 * for another client's record simply resolves to nothing.
 */
@Injectable()
export class PortalRecordsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: PortalRecordQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const where: Prisma.RecordWhereInput = {};
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      this.prisma.record.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' }, select: portalRecordSelect }),
      this.prisma.record.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findOne(id: string) {
    // Client-scoped: a record belonging to another client returns null -> 404,
    // indistinguishable from a record that does not exist.
    const record = await this.prisma.record.findFirst({ where: { id }, select: portalRecordSelect });
    if (!record) throw new NotFoundException('Record not found');
    return record;
  }
}
