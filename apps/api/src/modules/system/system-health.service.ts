import { Injectable } from '@nestjs/common';
import { AppointmentStatus, BillStatus, ChangeRequestStatus, RecordStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';

export type CheckStatus = 'ok' | 'warn' | 'error';
export interface Check {
  status: CheckStatus;
  value?: number | string | null;
  message?: string | null;
  /** Optional mini time-series for a sparkline (e.g. 7-day authorization rate). */
  trend?: number[];
}

const RANK: Record<CheckStatus, number> = { ok: 0, warn: 1, error: 2 };
const worst = (checks: Check[]): CheckStatus =>
  checks.reduce<CheckStatus>((w, c) => (RANK[c.status] > RANK[w] ? c.status : w), 'ok');

const fmtUptime = (s: number) => {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
};

// Auto-maintenance marker written into a stuck record's status-event note so a
// nightly run doesn't re-flag the same record every day.
const FLAG_MARKER = '[auto-maintenance]';

@Injectable()
export class SystemHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly labContext: LabContext,
  ) {}

  /** Full health report — GLOBAL across every lab (runs in the system scope). */
  async getHealth() {
    return this.labContext.runSystem(async () => {
      const now = Date.now();
      const ago = (d: number) => new Date(now - d * 86_400_000);
      const p = this.prisma;
      // Wrap each check so a single failure becomes status:'error', never a throw.
      const safe = async (fn: () => Promise<Check>): Promise<Check> => {
        try { return await fn(); } catch (e: any) { return { status: 'error', message: e?.message ?? 'check failed' }; }
      };

      const [
        dbPing, memoryUsage,
        stuckRecords, missingLabNumbers, unpaidBills, unfiledRecords, portalUsersInactive,
        authorizationRate, avgTat, pendingChangeRequests, failedRecords,
        usersWithNoRole,
        maintenanceLog,
      ] = await Promise.all([
        // ── Infrastructure ──
        safe(async () => {
          const t = Date.now();
          await p.$queryRaw`SELECT 1`;
          const ms = Date.now() - t;
          return { status: ms < 100 ? 'ok' : ms < 500 ? 'warn' : 'error', value: ms, message: `${ms} ms` };
        }),
        safe(async () => {
          const mem = process.memoryUsage();
          const pct = Math.round((mem.heapUsed / mem.heapTotal) * 100);
          const mb = (n: number) => Math.round(n / 1_048_576);
          return { status: pct > 80 ? 'warn' : 'ok', value: pct, message: `${mb(mem.heapUsed)} / ${mb(mem.heapTotal)} MB` };
        }),
        // ── Data integrity (global) ──
        safe(async () => {
          const c = await p.record.count({ where: { status: { in: [RecordStatus.Processing, RecordStatus.Partial, RecordStatus.Submitted] }, updatedAt: { lt: ago(7) } } });
          return { status: c > 10 ? 'error' : c > 0 ? 'warn' : 'ok', value: c, message: c ? `${c} stuck > 7 days` : 'None stuck' };
        }),
        safe(async () => {
          const c = await p.record.count({ where: { labNumber: null } });
          return { status: c > 0 ? 'warn' : 'ok', value: c, message: c ? `${c} without a lab number` : 'All assigned' };
        }),
        safe(async () => {
          const c = await p.bill.count({ where: { status: { in: [BillStatus.Issued, BillStatus.PartiallyPaid] }, createdAt: { lt: ago(30) } } });
          return { status: c > 0 ? 'warn' : 'ok', value: c, message: c ? `${c} unpaid > 30 days` : 'None overdue' };
        }),
        safe(async () => {
          const c = await p.record.count({ where: { cabinetId: null, createdAt: { lt: ago(14) } } });
          return { status: c > 0 ? 'warn' : 'ok', value: c, message: c ? `${c} unfiled > 14 days` : 'All filed' };
        }),
        safe(async () => {
          const c = await p.portalUser.count({ where: { lastLoginAt: { lt: ago(90) } } });
          return { status: c > 0 ? 'warn' : 'ok', value: c, message: c ? `${c} inactive > 90 days` : 'None inactive' };
        }),
        // ── Business health (last 30 days, global) ──
        safe(async () => {
          const since = ago(30);
          const authorized = { in: [RecordStatus.Approved, RecordStatus.Billed, RecordStatus.Paid] };
          const [total, approved] = await Promise.all([
            p.record.count({ where: { createdAt: { gte: since } } }),
            p.record.count({ where: { createdAt: { gte: since }, status: authorized } }),
          ]);
          const rate = total ? Math.round((approved / total) * 100) : 100;
          // 7-day authorization-rate trend (oldest → newest) for the sparkline.
          const trend = await Promise.all(
            Array.from({ length: 7 }, (_, i) => 6 - i).map(async (d) => {
              const start = new Date(now - d * 86_400_000); start.setHours(0, 0, 0, 0);
              const end = new Date(start.getTime() + 86_400_000);
              const [t, a] = await Promise.all([
                p.record.count({ where: { createdAt: { gte: start, lt: end } } }),
                p.record.count({ where: { createdAt: { gte: start, lt: end }, status: authorized } }),
              ]);
              return t ? Math.round((a / t) * 100) : 0;
            }),
          );
          return { status: total === 0 ? 'ok' : rate < 50 ? 'error' : rate < 70 ? 'warn' : 'ok', value: rate, message: `${approved}/${total} authorized (30d)`, trend };
        }),
        safe(async () => {
          const recs = await p.record.findMany({
            where: { status: { in: [RecordStatus.Approved, RecordStatus.Billed, RecordStatus.Paid] }, updatedAt: { gte: ago(30) } },
            select: { statusHistory: { where: { status: { in: [RecordStatus.Submitted, RecordStatus.Approved] } }, orderBy: { createdAt: 'asc' }, select: { status: true, createdAt: true } } },
            take: 500,
          });
          const spans: number[] = [];
          for (const r of recs) {
            const sub = r.statusHistory.find((e) => e.status === RecordStatus.Submitted);
            const app = r.statusHistory.find((e) => e.status === RecordStatus.Approved);
            if (sub && app) { const d = (app.createdAt.getTime() - sub.createdAt.getTime()) / 86_400_000; if (d >= 0) spans.push(d); }
          }
          if (!spans.length) return { status: 'ok', value: 0, message: 'No completed turnarounds' };
          const avg = spans.reduce((a, b) => a + b, 0) / spans.length;
          return { status: avg > 10 ? 'error' : avg > 5 ? 'warn' : 'ok', value: Math.round(avg * 10) / 10, message: `over ${spans.length} records` };
        }),
        safe(async () => {
          const c = await p.changeRequest.count({ where: { status: { in: [ChangeRequestStatus.Open, ChangeRequestStatus.InReview] }, createdAt: { lt: ago(7) } } });
          return { status: c > 0 ? 'warn' : 'ok', value: c, message: c ? `${c} pending > 7 days` : 'None pending' };
        }),
        safe(async () => {
          const c = await p.record.count({ where: { status: RecordStatus.Failed, updatedAt: { gte: ago(30) } } });
          return { status: c > 0 ? 'warn' : 'ok', value: c, message: c ? `${c} failed (30d)` : 'None failed' };
        }),
        // ── Security ──
        safe(async () => {
          const c = await p.user.count({ where: { roles: { none: {} } } });
          return { status: c > 0 ? 'warn' : 'ok', value: c, message: c ? `${c} without a role` : 'All assigned' };
        }),
        // ── Maintenance log ──
        p.maintenanceLog.findMany({ orderBy: { ranAt: 'desc' }, take: 10 }),
      ]);

      const apiUptime: Check = { status: 'ok', value: fmtUptime(process.uptime()) };
      const nodeVersion: Check = { status: 'ok', value: process.version };
      const orphanedSpecimens: Check = { status: 'ok', value: 0, message: 'FK-enforced (specimens require a record)' };
      const recentFailedLogins: Check = { status: 'ok', value: 'No audit log configured' };

      const all: Check[] = [
        dbPing, apiUptime, memoryUsage, nodeVersion,
        stuckRecords, orphanedSpecimens, missingLabNumbers, unpaidBills, unfiledRecords, portalUsersInactive,
        authorizationRate, avgTat, pendingChangeRequests, failedRecords,
        usersWithNoRole, recentFailedLogins,
      ];

      return {
        generatedAt: new Date().toISOString(),
        overall: worst(all),
        infrastructure: { dbPing, apiUptime, memoryUsage, nodeVersion },
        dataIntegrity: { stuckRecords, orphanedSpecimens, missingLabNumbers, unpaidBills, unfiledRecords, portalUsersInactive },
        businessHealth: { authorizationRate, avgTat, pendingChangeRequests, failedRecords },
        security: { usersWithNoRole, recentFailedLogins },
        maintenanceLog,
        backup: {
          configured: !!process.env.BACKUP_SHEET_ID,
          sheetId: process.env.BACKUP_SHEET_ID ?? null,
        },
      };
    });
  }

  /** Run automated fixes across every lab and record the run to MaintenanceLog. */
  async runMaintenance(ranBy: string) {
    return this.labContext.runSystem(async () => {
      const start = Date.now();
      const p = this.prisma;
      const now = Date.now();

      // 1. Flag stuck records (non-destructive: add a note event, keep the status).
      //    Skip any already auto-flagged in the last 7 days so daily runs don't spam.
      const stuck = await p.record.findMany({
        where: { status: { in: [RecordStatus.Processing, RecordStatus.Partial, RecordStatus.Submitted] }, updatedAt: { lt: new Date(now - 7 * 86_400_000) } },
        select: {
          id: true, labId: true, status: true,
          statusHistory: { where: { notes: { startsWith: FLAG_MARKER }, createdAt: { gte: new Date(now - 7 * 86_400_000) } }, take: 1, select: { id: true } },
        },
        take: 1000,
      });
      const toFlag = stuck.filter((r) => r.statusHistory.length === 0);
      if (toFlag.length) {
        await p.recordStatusEvent.createMany({
          data: toFlag.map((r) => ({ labId: r.labId, recordId: r.id, status: r.status, notes: `${FLAG_MARKER} No progress in > 7 days (flagged ${new Date().toISOString().slice(0, 10)})` })),
        });
      }
      const flagged = toFlag.length;

      // 2. Archive old notifications — no notification store exists yet.
      const archived = 0;

      // 3. Close missed appointments (SCHEDULED and > 2h past their slot).
      const missed = await p.appointment.updateMany({
        where: { status: AppointmentStatus.SCHEDULED, scheduledAt: { lt: new Date(now - 2 * 3_600_000) } },
        data: { status: AppointmentStatus.MISSED },
      });
      const missedClosed = missed.count;

      const duration = Date.now() - start;
      const results = { flagged, archived, missedClosed };
      const notes = `Flagged ${flagged} stuck record(s), archived ${archived} notification(s), closed ${missedClosed} missed appointment(s).`;
      const log = await p.maintenanceLog.create({ data: { ranBy, duration, results, notes } });

      return { ...results, duration, ranAt: log.ranAt, notes };
    });
  }
}
