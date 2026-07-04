import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { LogType, SystemLogQueryDto } from './dto/system-log.dto';

export type Severity = 'info' | 'success' | 'warning' | 'error';

export interface LogEntry {
  id: string;
  type: LogType;
  action: string;
  subject: string;
  userId: string | null;
  userName: string;
  userEmail: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  severity: Severity;
}

export interface SystemLogPage {
  data: LogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Unified activity log. Aggregates the existing append-only audit trails
 * (record status events, auth attempts, change-request transitions, result-sheet
 * authorizations, maintenance runs, payments) into a single normalized stream.
 *
 * Every tenant-scoped source is filtered to the caller's lab automatically by the
 * Prisma tenancy extension; AuthAttempt has no labId column, so it is scoped
 * manually through its user relation. Access is superuser-only (system:health).
 */
@Injectable()
export class SystemLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly labContext: LabContext,
  ) {}

  async getLogs(query: SystemLogQueryDto): Promise<SystemLogPage> {
    const { page = 1, pageSize = 50, type, userId, from, to } = query;
    const labId = this.labContext.getLabId();
    const gte = from ? new Date(from) : undefined;
    const lte = to ? new Date(to) : undefined;
    const dateRange = gte || lte ? { ...(gte && { gte }), ...(lte && { lte }) } : undefined;

    const [
      statusEvents,
      authAttempts,
      changeRequestEvents,
      resultSheetEvents,
      maintenanceLogs,
      paymentEvents,
    ] = await Promise.all([
      // Record status changes (labId auto-scoped by the tenancy extension).
      this.prisma.recordStatusEvent.findMany({
        where: {
          ...(userId && { userId }),
          ...(dateRange && { createdAt: dateRange }),
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          record: { select: { labNumber: true, identifier: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),

      // Login attempts (no labId column — scope via the user's lab).
      this.prisma.authAttempt.findMany({
        where: {
          user: { labId },
          ...(userId && { userId }),
          ...(dateRange && { createdAt: dateRange }),
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),

      // Change request transitions (labId auto-scoped). Staff actor is byUser.
      this.prisma.changeRequestEvent.findMany({
        where: {
          ...(userId && { byUserId: userId }),
          ...(dateRange && { createdAt: dateRange }),
        },
        include: {
          byUser: { select: { id: true, firstName: true, lastName: true, email: true } },
          changeRequest: { select: { subject: true, id: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),

      // Result sheet authorizations (labId auto-scoped). Actor is authorizedBy.
      this.prisma.resultSheet.findMany({
        where: {
          authorized: true,
          ...(userId && { authorizedById: userId }),
          ...(dateRange && { authorizedAt: dateRange }),
        },
        include: {
          authorizedBy: { select: { id: true, firstName: true, lastName: true } },
          record: { select: { labNumber: true } },
        },
        orderBy: { authorizedAt: 'desc' },
        take: 50,
      }),

      // Maintenance runs (global — no labId column).
      this.prisma.maintenanceLog.findMany({ orderBy: { ranAt: 'desc' }, take: 20 }),

      // Payments (labId auto-scoped).
      this.prisma.payment.findMany({
        where: { ...(dateRange && { createdAt: dateRange }) },
        include: {
          bill: { select: { referenceNo: true, client: { select: { officeName: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);

    const entries: LogEntry[] = [
      ...statusEvents.map((e): LogEntry => ({
        id: e.id,
        type: 'RECORD_STATUS',
        action: `Changed record status to ${e.status}`,
        subject: e.record?.labNumber ?? e.record?.identifier ?? '—',
        userId: e.userId,
        userName: e.user ? `${e.user.firstName} ${e.user.lastName}`.trim() : 'System',
        userEmail: e.user?.email ?? null,
        metadata: { status: e.status, recordId: e.recordId },
        createdAt: e.createdAt.toISOString(),
        severity: ['Failed', 'Disabled'].includes(e.status)
          ? 'error'
          : e.status === 'Approved'
            ? 'success'
            : 'info',
      })),

      ...authAttempts.map((e): LogEntry => ({
        id: e.id,
        type: 'AUTH',
        action: e.success ? 'Logged in' : 'Failed login attempt',
        subject: e.user?.email ?? e.email ?? '—',
        userId: e.userId,
        userName: e.user ? `${e.user.firstName} ${e.user.lastName}`.trim() : '—',
        userEmail: e.user?.email ?? e.email ?? null,
        metadata: { success: e.success, ip: e.ip },
        createdAt: e.createdAt.toISOString(),
        severity: e.success ? 'info' : 'warning',
      })),

      ...changeRequestEvents.map((e): LogEntry => ({
        id: e.id,
        type: 'CHANGE_REQUEST',
        action: `Change request ${e.status}`,
        subject: e.changeRequest?.subject ?? '—',
        userId: e.byUserId ?? null,
        userName: e.byUser ? `${e.byUser.firstName} ${e.byUser.lastName}`.trim() : 'Portal User',
        userEmail: e.byUser?.email ?? null,
        metadata: { status: e.status, changeRequestId: e.changeRequestId },
        createdAt: e.createdAt.toISOString(),
        severity: 'info',
      })),

      ...resultSheetEvents
        .filter((e) => e.authorizedAt)
        .map((e): LogEntry => ({
          id: `rs-${e.id}`,
          type: 'AUTHORIZATION',
          action: 'Result sheet authorized',
          subject: e.record?.labNumber ?? '—',
          userId: e.authorizedById ?? null,
          userName: e.authorizedBy
            ? `${e.authorizedBy.firstName} ${e.authorizedBy.lastName}`.trim()
            : '—',
          userEmail: null,
          metadata: { recordId: e.recordId },
          createdAt: e.authorizedAt!.toISOString(),
          severity: 'success',
        })),

      ...maintenanceLogs.map((e): LogEntry => {
        const results = (e.results ?? {}) as Record<string, unknown>;
        return {
          id: e.id,
          type: 'MAINTENANCE',
          action: 'System maintenance run',
          subject: `Flagged: ${results.flagged ?? 0}, Archived: ${results.archived ?? 0}`,
          userId: null,
          userName: e.ranBy ?? 'System',
          userEmail: null,
          metadata: results,
          createdAt: e.ranAt.toISOString(),
          severity: 'info',
        };
      }),

      ...paymentEvents.map((e): LogEntry => ({
        id: e.id,
        type: 'PAYMENT',
        action: `Payment recorded ($${(e.amount / 100).toFixed(2)})`,
        subject: e.bill?.referenceNo ?? '—',
        userId: null,
        userName: e.bill?.client?.officeName ?? 'Unknown',
        userEmail: null,
        metadata: { amount: e.amount, type: e.type },
        createdAt: e.createdAt.toISOString(),
        severity: 'success',
      })),
    ];

    // Final date bound applied uniformly so sources without a DB-level date
    // filter (e.g. the global maintenance log) still respect the range.
    const fromMs = gte?.getTime();
    const toMs = lte?.getTime();
    const sorted = entries
      .filter((e) => !type || e.type === type)
      .filter((e) => !userId || e.userId === userId)
      .filter((e) => {
        if (fromMs === undefined && toMs === undefined) return true;
        const t = new Date(e.createdAt).getTime();
        return (fromMs === undefined || t >= fromMs) && (toMs === undefined || t <= toMs);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = sorted.length;
    const skip = (page - 1) * pageSize;
    return {
      data: sorted.slice(skip, skip + pageSize),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
