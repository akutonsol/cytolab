import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { NotificationsHelper } from '../notifications/notifications.helper';
import {
  AppointmentQueryDto, CalendarQueryDto, CancelAppointmentDto, CompleteAppointmentDto,
  CreateAppointmentDto, RescheduleAppointmentDto, UpdateAppointmentDto,
} from './dto/appointments.dto';

const DAY = 86_400_000;

const select = {
  id: true, type: true, status: true, scheduledAt: true, duration: true, location: true, doctorName: true, notes: true,
  checkedInAt: true, completedAt: true, resultRecordId: true, noShowAt: true, cancellationReason: true, reminderSentAt: true, recallRecordId: true, createdAt: true,
  patient: { select: { id: true, firstName: true, lastName: true, registrationNo: true, phoneNumber: true } },
  client: { select: { id: true, firstName: true, lastName: true, officeName: true } },
  assignedUser: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.AppointmentSelect;

type Row = Prisma.AppointmentGetPayload<{ select: typeof select }>;

const TITLE: Record<string, string> = {
  SpecimenCollection: 'Specimen Collection', FollowUp: 'Follow-Up', RecallVisit: 'Recall Visit', Consultation: 'Consultation', Other: 'Appointment',
};

@Injectable()
export class AppointmentsService {
  private readonly log = new Logger(AppointmentsService.name);
  constructor(private prisma: PrismaService, private notifs: NotificationsHelper) {}

  private toRow(a: Row) {
    return {
      ...a,
      patientName: a.patient ? `${a.patient.firstName} ${a.patient.lastName}`.trim() : '—',
      clientName: a.client ? (a.client.officeName || `${a.client.firstName} ${a.client.lastName}`.trim()) : null,
      assignedToName: a.assignedUser ? `${a.assignedUser.firstName} ${a.assignedUser.lastName}`.trim() : null,
    };
  }
  private dayBounds(dateStr: string) {
    const d = new Date(dateStr); const from = new Date(d); from.setHours(0, 0, 0, 0); const to = new Date(d); to.setHours(23, 59, 59, 999);
    return { from, to };
  }

  // ── Queries ───────────────────────────────────────────────────────────────
  async list(q: AppointmentQueryDto) {
    const where: Prisma.AppointmentWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.type && { type: q.type }),
      ...(q.assignedToId && { assignedUserId: q.assignedToId }),
      ...(q.clientId && { clientId: q.clientId }),
    };
    if (q.date) { const { from, to } = this.dayBounds(q.date); where.scheduledAt = { gte: from, lte: to }; }
    else if (q.dateFrom || q.dateTo) {
      where.scheduledAt = { ...(q.dateFrom && { gte: new Date(q.dateFrom) }), ...(q.dateTo && { lte: new Date(new Date(q.dateTo).setHours(23, 59, 59, 999)) }) };
    } else {
      const from = new Date(); from.setHours(0, 0, 0, 0);
      where.scheduledAt = { gte: from, lte: new Date(from.getTime() + 8 * DAY) };
    }
    const rows = await this.prisma.appointment.findMany({ where, select, orderBy: { scheduledAt: 'asc' }, take: 500 });
    return rows.map((r) => this.toRow(r));
  }

  async findOne(id: string) {
    const a = await this.prisma.appointment.findFirst({ where: { id }, select });
    if (!a) throw new NotFoundException('Appointment not found');
    return this.toRow(a);
  }

  today() {
    return this.list({ date: new Date().toISOString() } as AppointmentQueryDto);
  }

  async upcoming() {
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const rows = await this.prisma.appointment.findMany({ where: { scheduledAt: { gte: from, lte: new Date(from.getTime() + 8 * DAY) } }, select, orderBy: { scheduledAt: 'asc' } });
    return rows.map((r) => this.toRow(r));
  }

  async calendar(q: CalendarQueryDto) {
    const from = new Date(q.year, q.month - 1, 1); from.setHours(0, 0, 0, 0);
    const to = new Date(q.year, q.month, 0); to.setHours(23, 59, 59, 999);
    const rows = await this.prisma.appointment.findMany({ where: { scheduledAt: { gte: from, lte: to } }, select, orderBy: { scheduledAt: 'asc' } });
    const dates: Record<string, ReturnType<AppointmentsService['toRow']>[]> = {};
    for (const r of rows) {
      const key = new Date(r.scheduledAt).toISOString().slice(0, 10);
      (dates[key] ??= []).push(this.toRow(r));
    }
    return { year: q.year, month: q.month, dates };
  }

  async stats() {
    const now = new Date(); const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0); const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const [todayCount, upcomingCount, all, byTypeRaw] = await Promise.all([
      this.prisma.appointment.count({ where: { scheduledAt: { gte: todayStart, lte: todayEnd } } }),
      this.prisma.appointment.count({ where: { scheduledAt: { gt: todayEnd, lte: new Date(todayStart.getTime() + 8 * DAY) } } }),
      this.prisma.appointment.findMany({ select: { status: true } }),
      this.prisma.appointment.groupBy({ by: ['type'], _count: { id: true } }),
    ]);
    const noShow = all.filter((a) => a.status === 'NoShow').length;
    const completed = all.filter((a) => a.status === 'Completed').length;
    const finished = all.filter((a) => ['Completed', 'NoShow', 'Cancelled'].includes(a.status)).length;
    return {
      todayCount, upcomingCount,
      noShowRate: finished ? Math.round((noShow / finished) * 1000) / 10 : 0,
      completionRate: finished ? Math.round((completed / finished) * 1000) / 10 : 0,
      byType: byTypeRaw.map((t) => ({ type: t.type, count: t._count.id })),
    };
  }

  // ── Mutations ─────────────────────────────────────────────────────────────
  async create(dto: CreateAppointmentDto, userId: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id: dto.patientId }, select: { id: true, firstName: true, lastName: true } });
    if (!patient) throw new NotFoundException('Patient not found');

    const created = await this.prisma.appointment.create({
      data: tenantCreate<Prisma.AppointmentUncheckedCreateInput>({
        patientId: dto.patientId,
        type: dto.appointmentType,
        status: 'Scheduled',
        title: TITLE[dto.appointmentType] ?? 'Appointment',
        scheduledAt: new Date(dto.scheduledAt),
        duration: dto.duration ?? 30,
        location: dto.location ?? null,
        clientId: dto.clientId ?? null,
        doctorName: dto.doctorName ?? null,
        assignedUserId: dto.assignedToId ?? null,
        recallRecordId: dto.recallRecordId ?? null,
        notes: dto.notes ?? null,
        createdById: userId,
      }),
      select,
    });

    if (dto.assignedToId) {
      await this.notifs.notifyUser(dto.assignedToId, {
        type: NotificationType.APPOINTMENT_REMINDER,
        title: 'New appointment assigned',
        body: `${patient.firstName} ${patient.lastName} — ${TITLE[dto.appointmentType] ?? 'appointment'} on ${new Date(dto.scheduledAt).toLocaleString()}.`,
        link: '/appointments', entityId: created.id, entityType: 'appointment',
      }).catch((e) => this.log.warn(`assign notify failed: ${(e as Error).message}`));
    }
    return this.toRow(created);
  }

  private async getAppt(id: string) {
    const a = await this.prisma.appointment.findFirst({ where: { id }, select: { id: true } });
    if (!a) throw new NotFoundException('Appointment not found');
    return a;
  }

  async update(id: string, dto: UpdateAppointmentDto) {
    await this.getAppt(id);
    const data: Prisma.AppointmentUpdateInput = {
      ...(dto.appointmentType && { type: dto.appointmentType }),
      ...(dto.scheduledAt && { scheduledAt: new Date(dto.scheduledAt) }),
      ...(dto.duration !== undefined && { duration: dto.duration }),
      ...(dto.location !== undefined && { location: dto.location || null }),
      ...(dto.doctorName !== undefined && { doctorName: dto.doctorName || null }),
      ...(dto.notes !== undefined && { notes: dto.notes || null }),
      ...(dto.clientId !== undefined && { client: dto.clientId ? { connect: { id: dto.clientId } } : { disconnect: true } }),
      ...(dto.assignedToId !== undefined && { assignedUser: dto.assignedToId ? { connect: { id: dto.assignedToId } } : { disconnect: true } }),
    };
    return this.prisma.appointment.update({ where: { id }, data, select }).then((r) => this.toRow(r));
  }

  private setStatus(id: string, status: AppointmentStatus, extra: Prisma.AppointmentUpdateInput = {}) {
    return this.prisma.appointment.update({ where: { id }, data: { status, ...extra }, select }).then((r) => this.toRow(r));
  }

  async cancel(id: string, dto: CancelAppointmentDto) { await this.getAppt(id); return this.setStatus(id, 'Cancelled', { cancellationReason: dto.cancellationReason || null }); }
  async confirm(id: string) { await this.getAppt(id); return this.setStatus(id, 'Confirmed'); }
  async checkIn(id: string) { await this.getAppt(id); return this.setStatus(id, 'CheckedIn', { checkedInAt: new Date() }); }
  async complete(id: string, dto: CompleteAppointmentDto) { await this.getAppt(id); return this.setStatus(id, 'Completed', { completedAt: new Date(), resultRecordId: dto.resultRecordId || null }); }
  async noShow(id: string) { await this.getAppt(id); return this.setStatus(id, 'NoShow', { noShowAt: new Date() }); }

  /** Mark the current appointment Rescheduled and create a fresh one at the new time. */
  async reschedule(id: string, dto: RescheduleAppointmentDto, userId: string) {
    const orig = await this.prisma.appointment.findFirst({ where: { id }, select: { patientId: true, type: true, duration: true, location: true, clientId: true, doctorName: true, assignedUserId: true, recallRecordId: true, notes: true, title: true } });
    if (!orig) throw new NotFoundException('Appointment not found');
    await this.prisma.appointment.update({ where: { id }, data: { status: 'Rescheduled', cancellationReason: dto.reason || null } });
    const next = await this.prisma.appointment.create({
      data: tenantCreate<Prisma.AppointmentUncheckedCreateInput>({
        patientId: orig.patientId, type: orig.type, status: 'Scheduled', title: orig.title,
        scheduledAt: new Date(dto.newScheduledAt), duration: orig.duration, location: orig.location,
        clientId: orig.clientId, doctorName: orig.doctorName, assignedUserId: orig.assignedUserId,
        recallRecordId: orig.recallRecordId, notes: orig.notes, createdById: userId,
      }),
      select,
    });
    return this.toRow(next);
  }

  async sendReminder(id: string) {
    const a = await this.prisma.appointment.findFirst({ where: { id }, select: { id: true, assignedUserId: true, scheduledAt: true, patient: { select: { firstName: true, lastName: true } } } });
    if (!a) throw new NotFoundException('Appointment not found');
    const name = a.patient ? `${a.patient.firstName} ${a.patient.lastName}`.trim() : 'A patient';
    if (a.assignedUserId) {
      await this.notifs.notifyUser(a.assignedUserId, {
        type: NotificationType.APPOINTMENT_REMINDER,
        title: 'Appointment reminder',
        body: `Reminder: ${name} is scheduled for ${new Date(a.scheduledAt).toLocaleString()}.`,
        link: '/appointments', entityId: a.id, entityType: 'appointment',
      }).catch((e) => this.log.warn(`reminder notify failed: ${(e as Error).message}`));
    }
    await this.prisma.appointment.update({ where: { id }, data: { reminderSentAt: new Date() } });
    return { id, reminderSentAt: new Date().toISOString(), notified: !!a.assignedUserId };
  }
}
