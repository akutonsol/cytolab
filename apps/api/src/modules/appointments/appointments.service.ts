import { Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, AppointmentType, Prisma, RecordStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { AppointmentQueryDto, CreateAppointmentDto, UpdateAppointmentDto } from './dto/appointments.dto';

// Selects reused across appointment reads.
const patientLite = { select: { id: true, firstName: true, lastName: true } };
const clientLite = { select: { id: true, officeName: true, firstName: true, lastName: true } };
const userLite = { select: { id: true, firstName: true, lastName: true } };
const apptInclude = { patient: patientLite, client: clientLite, assignedUser: userLite };

// Records that are resulted but not yet authorized (awaiting review).
const AWAITING_REVIEW: RecordStatus[] = [RecordStatus.Resulted];
// "Open" = not yet authorized/closed — used for the critical-result alert.
const OPEN_RECORD: RecordStatus[] = [
  RecordStatus.Pending, RecordStatus.Submitted, RecordStatus.Processing,
  RecordStatus.Partial, RecordStatus.Completed, RecordStatus.Resulted,
];

const patientName = (p?: { firstName: string; lastName: string } | null) =>
  p ? `${p.firstName} ${p.lastName}`.trim() : null;
const clientName = (c?: { officeName: string | null; firstName: string; lastName: string } | null) =>
  c ? (c.officeName || `${c.firstName} ${c.lastName}`.trim() || null) : null;

function dayBounds(date?: string) {
  // A bare 'YYYY-MM-DD' parses as UTC midnight, which is the previous local day
  // in negative-offset timezones. Anchor it to local midnight instead.
  const base = date
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00` : date)
    : new Date();
  const start = new Date(base); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { start, end };
}

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) {}

  /** Dashboard aggregate: KPIs, today's schedule, alerts, callbacks, recent records. */
  async overview() {
    const { start, end } = dayBounds();
    const today: Prisma.AppointmentWhereInput = { scheduledAt: { gte: start, lt: end } };

    const [
      scheduledToday, missed, pendingCallbacks, pendingReports,
      todayAppts, callbackAppts, recentRecords, urgentRecord, missedAppt,
    ] = await Promise.all([
      this.prisma.appointment.count({ where: { ...today, status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] } } }),
      this.prisma.appointment.count({ where: { status: AppointmentStatus.MISSED } }),
      this.prisma.appointment.count({ where: { type: AppointmentType.CALLBACK, status: AppointmentStatus.SCHEDULED } }),
      this.prisma.record.count({ where: { status: { in: AWAITING_REVIEW } } }),
      this.prisma.appointment.findMany({ where: today, orderBy: { scheduledAt: 'asc' }, include: apptInclude }),
      this.prisma.appointment.findMany({
        where: { type: AppointmentType.CALLBACK, status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.IN_PROGRESS] } },
        orderBy: { scheduledAt: 'asc' }, include: apptInclude,
      }),
      this.prisma.record.findMany({
        orderBy: { createdAt: 'desc' }, take: 8,
        include: { patient: patientLite, specimens: { take: 1, select: { type: true } } },
      }),
      this.prisma.record.findFirst({
        where: { urgent: true, status: { in: OPEN_RECORD } },
        orderBy: { createdAt: 'desc' }, include: { patient: patientLite },
      }),
      this.prisma.appointment.findFirst({ where: { status: AppointmentStatus.MISSED }, orderBy: { scheduledAt: 'desc' }, include: apptInclude }),
    ]);

    const todaySchedule = todayAppts.map((a) => ({
      id: a.id, title: a.title, type: a.type, status: a.status,
      scheduledAt: a.scheduledAt, duration: a.duration,
      patientName: patientName(a.patient), clientName: clientName(a.client),
    }));

    const callbacks = callbackAppts.map((a) => ({
      id: a.id, title: a.title, status: a.status, scheduledAt: a.scheduledAt,
      patientName: patientName(a.patient), clientName: clientName(a.client),
    }));

    const recent = recentRecords.map((r) => ({
      id: r.id, labNumber: r.labNumber, status: r.status, createdAt: r.createdAt,
      patientName: patientName(r.patient), specimenType: r.specimens[0]?.type ?? null,
    }));

    // Alerts derived from real data, most urgent first, capped at 3.
    const alerts: { type: 'critical' | 'overdue' | 'pending'; title: string; description: string; patientId?: string }[] = [];
    if (urgentRecord) {
      alerts.push({
        type: 'critical',
        title: 'Critical Lab Result',
        description: `${patientName(urgentRecord.patient) ?? 'A patient'} has an urgent open case${urgentRecord.labNumber ? ` (${urgentRecord.labNumber})` : ''}. Review immediately.`,
        patientId: urgentRecord.patientId ?? undefined,
      });
    }
    if (missed > 0) {
      alerts.push({
        type: 'overdue',
        title: 'Follow-up Overdue',
        description: missedAppt?.patient
          ? `${patientName(missedAppt.patient)} and ${missed - 1 > 0 ? `${missed - 1} other${missed - 1 === 1 ? '' : 's'}` : 'others'} missed a scheduled visit.`
          : `${missed} appointment${missed === 1 ? '' : 's'} were missed and need rescheduling.`,
      });
    }
    if (pendingReports > 0) {
      alerts.push({
        type: 'pending',
        title: 'Reports Awaiting Review',
        description: `${pendingReports} lab report${pendingReports === 1 ? '' : 's'} resulted and awaiting authorization.`,
      });
    }

    return {
      kpis: { scheduledToday, missed, pendingCallbacks, pendingReports },
      todaySchedule,
      alerts: alerts.slice(0, 3),
      callbacks,
      recentRecords: recent,
    };
  }

  async findAll(query: AppointmentQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.AppointmentWhereInput = {};
    if (query.date) { const { start, end } = dayBounds(query.date); where.scheduledAt = { gte: start, lt: end }; }
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;

    const [data, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where, orderBy: { scheduledAt: 'asc' },
        skip: (page - 1) * pageSize, take: pageSize, include: apptInclude,
      }),
      this.prisma.appointment.count({ where }),
    ]);
    return paginate(data, total, page, pageSize);
  }

  async findOne(id: string) {
    const appt = await this.prisma.appointment.findFirst({ where: { id }, include: apptInclude });
    if (!appt) throw new NotFoundException('Appointment not found');
    return appt;
  }

  async create(dto: CreateAppointmentDto) {
    return this.prisma.appointment.create({
      data: tenantCreate<Prisma.AppointmentUncheckedCreateInput>({
        title: dto.title.trim(),
        type: dto.type ?? AppointmentType.COLLECTION,
        status: dto.status ?? AppointmentStatus.SCHEDULED,
        scheduledAt: new Date(dto.scheduledAt),
        duration: dto.duration ?? 30,
        patientId: dto.patientId ?? null,
        clientId: dto.clientId ?? null,
        assignedUserId: dto.assignedUserId ?? null,
        notes: dto.notes?.trim() || null,
      }),
      include: apptInclude,
    });
  }

  async update(id: string, dto: UpdateAppointmentDto) {
    await this.findOne(id); // lab-scoped existence check
    return this.prisma.appointment.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.scheduledAt !== undefined ? { scheduledAt: new Date(dto.scheduledAt) } : {}),
        ...(dto.duration !== undefined ? { duration: dto.duration } : {}),
        ...(dto.patientId !== undefined ? { patientId: dto.patientId || null } : {}),
        ...(dto.clientId !== undefined ? { clientId: dto.clientId || null } : {}),
        ...(dto.assignedUserId !== undefined ? { assignedUserId: dto.assignedUserId || null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      },
      include: apptInclude,
    });
  }

  async updateStatus(id: string, status: AppointmentStatus) {
    await this.findOne(id);
    return this.prisma.appointment.update({ where: { id }, data: { status }, include: apptInclude });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.appointment.delete({ where: { id } });
    return { id };
  }
}
