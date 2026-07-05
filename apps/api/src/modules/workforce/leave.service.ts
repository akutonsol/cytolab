import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LeaveRequestStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WorkforceNotificationService } from './workforce-notification.service';
import {
  CreateLeaveRequestDto, CreateLeaveTypeDto, InitializeBalancesDto, LeaveRequestQuery,
} from './dto/workforce-phase2.dto';

const DAY = 86_400_000;
const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
// Inclusive calendar-day span between two dates (e.g. Mon→Fri = 5 days).
const inclusiveDays = (start: Date, end: Date) =>
  Math.floor((+dayStart(end) - +dayStart(start)) / DAY) + 1;

@Injectable()
export class LeaveService {
  constructor(
    private prisma: PrismaService,
    private notifications: WorkforceNotificationService,
  ) {}

  // ── Leave types ─────────────────────────────────────────────────────────────
  createLeaveType(dto: CreateLeaveTypeDto) {
    return this.prisma.leaveType.create({
      data: {
        name: dto.name,
        maxDaysPerYear: dto.maxDaysPerYear,
        requiresApproval: dto.requiresApproval ?? true,
        isActive: dto.isActive ?? true,
      } as Prisma.LeaveTypeUncheckedCreateInput,
    });
  }

  listLeaveTypes() {
    return this.prisma.leaveType.findMany({ orderBy: { name: 'asc' } });
  }

  // ── Requests ────────────────────────────────────────────────────────────────
  async createLeaveRequest(dto: CreateLeaveRequestDto) {
    const employee = await this.prisma.employee.findFirst({ where: { id: dto.employeeId } });
    if (!employee) throw new NotFoundException('Employee not found');
    const leaveType = await this.prisma.leaveType.findFirst({ where: { id: dto.leaveTypeId } });
    if (!leaveType) throw new NotFoundException('Leave type not found');

    const start = dayStart(new Date(dto.startDate));
    const end = dayStart(new Date(dto.endDate));
    if (+end < +start) throw new BadRequestException('endDate must be on or after startDate');
    const totalDays = inclusiveDays(start, end);
    const year = start.getFullYear();

    // Validate the employee has enough remaining balance for this leave type/year.
    const balance = await this.prisma.leaveBalance.findFirst({
      where: { employeeId: dto.employeeId, leaveTypeId: dto.leaveTypeId, year },
    });
    if (!balance) {
      throw new BadRequestException(`No ${leaveType.name} balance initialised for ${year}`);
    }
    const available = balance.entitlement - balance.used - balance.pending;
    if (totalDays > available) {
      throw new BadRequestException(`Insufficient balance: ${available} day(s) available, ${totalDays} requested`);
    }

    const request = await this.prisma.leaveRequest.create({
      data: {
        employeeId: dto.employeeId,
        leaveTypeId: dto.leaveTypeId,
        startDate: start,
        endDate: end,
        totalDays,
        reason: dto.reason ?? null,
        status: LeaveRequestStatus.PENDING,
      } as Prisma.LeaveRequestUncheckedCreateInput,
    });

    // Reserve the days as pending until the request is decided.
    await this.prisma.leaveBalance.update({
      where: { id: balance.id },
      data: { pending: balance.pending + totalDays },
    });

    // Notify managers that a request awaits their decision.
    const managers = await this.notifications.managerRecipientIds();
    await this.notifications.notifyMany(
      managers,
      'LEAVE_REQUEST_SUBMITTED',
      'Leave request submitted',
      `${leaveType.name} leave requested for ${totalDays} day(s) from ${start.toISOString().slice(0, 10)}.`,
      request.id,
      'LeaveRequest',
    );

    return request;
  }

  listLeaveRequests(q: LeaveRequestQuery) {
    const where: Prisma.LeaveRequestWhereInput = {};
    if (q.status) where.status = q.status as LeaveRequestStatus;
    if (q.employeeId) where.employeeId = q.employeeId;
    // Overlap filter: requests intersecting [startDate, endDate].
    if (q.startDate) where.endDate = { gte: new Date(q.startDate) };
    if (q.endDate) where.startDate = { lte: new Date(q.endDate) };
    return this.prisma.leaveRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        leaveType: true,
        employee: { include: { user: { select: { firstName: true, lastName: true } }, department: { select: { name: true } } } },
      },
    });
  }

  async getLeaveRequest(id: string) {
    const req = await this.prisma.leaveRequest.findFirst({
      where: { id },
      include: {
        leaveType: true,
        employee: { include: { user: { select: { firstName: true, lastName: true } }, department: { select: { name: true } } } },
        approvedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!req) throw new NotFoundException('Leave request not found');
    return req;
  }

  private async loadPending(id: string) {
    const req = await this.prisma.leaveRequest.findFirst({ where: { id }, include: { leaveType: true, employee: { select: { userId: true } } } });
    if (!req) throw new NotFoundException('Leave request not found');
    if (req.status !== LeaveRequestStatus.PENDING) {
      throw new BadRequestException(`Request is ${req.status}, not PENDING`);
    }
    return req;
  }

  async approveLeaveRequest(id: string, userId: string) {
    const req = await this.loadPending(id);
    // Move the reserved days from pending → used.
    const balance = await this.prisma.leaveBalance.findFirst({
      where: { employeeId: req.employeeId, leaveTypeId: req.leaveTypeId, year: req.startDate.getFullYear() },
    });
    if (balance) {
      await this.prisma.leaveBalance.update({
        where: { id: balance.id },
        data: { pending: Math.max(0, balance.pending - req.totalDays), used: balance.used + req.totalDays },
      });
    }
    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: { status: LeaveRequestStatus.APPROVED, approvedById: userId, approvedAt: new Date() },
    });
    await this.notifications.notify(
      req.employee.userId,
      'LEAVE_APPROVED',
      'Leave approved',
      `Your ${req.leaveType.name} leave (${req.totalDays} day(s)) was approved.`,
      id,
      'LeaveRequest',
    );
    return updated;
  }

  async rejectLeaveRequest(id: string, rejectionReason: string, userId: string) {
    const req = await this.loadPending(id);
    // Release the reserved pending days.
    const balance = await this.prisma.leaveBalance.findFirst({
      where: { employeeId: req.employeeId, leaveTypeId: req.leaveTypeId, year: req.startDate.getFullYear() },
    });
    if (balance) {
      await this.prisma.leaveBalance.update({
        where: { id: balance.id },
        data: { pending: Math.max(0, balance.pending - req.totalDays) },
      });
    }
    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: { status: LeaveRequestStatus.REJECTED, rejectionReason, approvedById: userId, approvedAt: new Date() },
    });
    await this.notifications.notify(
      req.employee.userId,
      'LEAVE_REJECTED',
      'Leave rejected',
      `Your ${req.leaveType.name} leave (${req.totalDays} day(s)) was rejected: ${rejectionReason}`,
      id,
      'LeaveRequest',
    );
    return updated;
  }

  // ── Balances ────────────────────────────────────────────────────────────────
  getBalances(employeeId: string) {
    const year = new Date().getFullYear();
    return this.prisma.leaveBalance.findMany({
      where: { employeeId, year },
      include: { leaveType: true },
      orderBy: { leaveType: { name: 'asc' } },
    });
  }

  /**
   * Bulk-initialise leave balances for a year. Applies to the given employees
   * (or all active employees) across the given leave-type entitlements (or every
   * active leave type at its maxDaysPerYear). Existing rows keep their used /
   * pending and only have entitlement refreshed.
   */
  async initializeBalances(dto: InitializeBalancesDto) {
    const employees = dto.employeeIds?.length
      ? await this.prisma.employee.findMany({ where: { id: { in: dto.employeeIds }, isActive: true }, select: { id: true } })
      : await this.prisma.employee.findMany({ where: { isActive: true }, select: { id: true } });

    let entitlements: { leaveTypeId: string; entitlement: number }[];
    if (dto.typeEntitlements?.length) {
      entitlements = dto.typeEntitlements;
    } else {
      const types = await this.prisma.leaveType.findMany({ where: { isActive: true } });
      entitlements = types.map((t) => ({ leaveTypeId: t.id, entitlement: t.maxDaysPerYear }));
    }

    let created = 0, updated = 0;
    for (const emp of employees) {
      for (const ent of entitlements) {
        const existing = await this.prisma.leaveBalance.findFirst({
          where: { employeeId: emp.id, leaveTypeId: ent.leaveTypeId, year: dto.year },
        });
        if (existing) {
          await this.prisma.leaveBalance.update({ where: { id: existing.id }, data: { entitlement: ent.entitlement } });
          updated++;
        } else {
          await this.prisma.leaveBalance.create({
            data: { employeeId: emp.id, leaveTypeId: ent.leaveTypeId, year: dto.year, entitlement: ent.entitlement, used: 0, pending: 0 },
          });
          created++;
        }
      }
    }
    return { year: dto.year, employees: employees.length, leaveTypes: entitlements.length, created, updated };
  }
}
