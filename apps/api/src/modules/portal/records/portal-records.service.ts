import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { paginate } from '../../../common/dto/pagination.dto';
import { PortalRecordQueryDto } from './dto/portal-record.dto';
import { AuditRecorder } from '../../audit/audit-recorder.service';

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
  constructor(private prisma: PrismaService, private audit: AuditRecorder) {}

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
    // P2-5CR: the query projection is expanded to fetch patientId in the SAME query (no second
    // round-trip). It is used for audit ONLY and stripped from the response — the external portal
    // client must never receive the internal patient UUID (portalRecordSelect deliberately omits it).
    const full = await this.prisma.record.findFirst({
      where: { id },
      select: { ...portalRecordSelect, patientId: true },
    });
    if (!full) throw new NotFoundException('Record not found');
    const { patientId, ...record } = full; // patientId is audit-only; NOT returned to the external client
    // Enterprise audit (P2-5C): successful single-subject PHI read via the SEPARATE portal owner
    // (does not reuse RecordsService). PORTAL attribution comes from the ExecutionContext.
    // Best-effort; never breaks the read.
    await this.audit.recordPhiRead({
      patientId,
      accessSurface: 'record_detail',
      accessMode: 'view',
      producerModule: 'portal',
      resource: { type: 'Record', id },
    });
    return record;
  }
}
