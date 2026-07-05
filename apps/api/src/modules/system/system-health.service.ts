import { Injectable } from '@nestjs/common';
import { AppointmentStatus, BillStatus, ChangeRequestStatus, FeatureKey, RecordStatus } from '@prisma/client';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { ALL_FEATURE_KEYS } from '../lab-features/feature-catalog';

const execAsync = promisify(exec);

export type CheckStatus = 'ok' | 'warn' | 'error';

// ─── Deep Diagnostics ────────────────────────────────────────────────────────
export type DiagnosticCategory =
  | 'api' | 'email' | 'storage' | 'pdf' | 'fhir' | 'scheduler' | 'database' | 'features';

export interface DiagnosticCheck {
  name: string;
  category: DiagnosticCategory;
  status: CheckStatus;
  responseTimeMs?: number;
  message: string;
  detail?: string;
}
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

  // ── Deep Diagnostics ───────────────────────────────────────────────────────
  /**
   * Runs a broad, active-probe diagnostic sweep across every subsystem in
   * parallel. Each probe is self-contained and NEVER throws — a failure becomes
   * a `status: 'error'` result carrying the message only (never a stack trace).
   * These are additive to {@link getHealth} and share none of its checks.
   */
  async runDeepDiagnostics(): Promise<DiagnosticCheck[]> {
    return this.labContext.runSystem(async () => {
      // Wrap a probe so it always resolves to a DiagnosticCheck (timing included),
      // converting any thrown error into a sanitized 'error' result.
      const probe = async (
        name: string,
        category: DiagnosticCategory,
        fn: () => Promise<Omit<DiagnosticCheck, 'name' | 'category' | 'responseTimeMs'>>,
      ): Promise<DiagnosticCheck> => {
        const t = Date.now();
        try {
          const r = await fn();
          return { name, category, responseTimeMs: Date.now() - t, ...r };
        } catch (e: any) {
          return {
            name, category, responseTimeMs: Date.now() - t,
            status: 'error', message: this.sanitizeError(e),
          };
        }
      };

      // A short-lived (30s) internal SUPERUSER token so the API-route probes can
      // authenticate as the system itself for this diagnostic call only.
      const token = this.mintInternalToken(await this.prisma.lab.findFirst({ select: { id: true } }).then((l) => l?.id));
      const baseUrl = `http://localhost:${process.env.PORT ?? 4000}`;

      const criticalRoutes: { method: 'GET'; path: string; name: string }[] = [
        { method: 'GET', path: '/api/v1/health', name: 'Health endpoint' },
        { method: 'GET', path: '/api/v1/patients/overview', name: 'Patients module' },
        { method: 'GET', path: '/api/v1/specimens/overview', name: 'Specimens module' },
        { method: 'GET', path: '/api/v1/reports/overview', name: 'Reports module' },
        { method: 'GET', path: '/api/v1/workforce/attendance/roster', name: 'Workforce module' },
        { method: 'GET', path: '/api/v1/report-center/summary', name: 'Report center' },
        { method: 'GET', path: '/api/v1/payroll/periods', name: 'Payroll module' },
        { method: 'GET', path: '/api/v1/system/support/announcements/active', name: 'Support module' },
      ];

      const probes: Promise<DiagnosticCheck>[] = [
        // ── API route health (one probe per critical endpoint) ──
        ...criticalRoutes.map((route) =>
          probe(route.name, 'api', async () => {
            const res = await axios.request({
              method: route.method,
              url: `${baseUrl}${route.path}`,
              headers: { Authorization: `Bearer ${token}` },
              timeout: 8000,
              validateStatus: () => true,
            });
            const code = res.status;
            const status: CheckStatus = code >= 200 && code < 300 ? 'ok' : code >= 400 && code < 500 ? 'warn' : 'error';
            const message = code >= 200 && code < 300 ? `HTTP ${code}`
              : code >= 400 && code < 500 ? `HTTP ${code} — auth/validation issue`
              : `HTTP ${code} — server error`;
            return { status, message, detail: `${route.method} ${route.path}` };
          }),
        ),

        // ── Email delivery (SMTP connection verify only — no email is sent) ──
        probe('SMTP connection', 'email', async () => {
          if (!process.env.SMTP_HOST) return { status: 'warn', message: 'Email not configured' };
          const t = Date.now();
          const transport = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT ?? 587),
            secure: false,
            connectionTimeout: 10_000,
            greetingTimeout: 10_000,
          });
          try {
            await transport.verify();
          } finally {
            transport.close();
          }
          const ms = Date.now() - t;
          const status: CheckStatus = ms < 3000 ? 'ok' : ms < 10_000 ? 'warn' : 'error';
          return { status, message: `SMTP responded in ${ms} ms`, detail: process.env.SMTP_HOST };
        }),

        // ── File storage (write → read → delete round-trip) ──
        probe('GCS round-trip', 'storage', async () => {
          if (!process.env.STORAGE_BUCKET) return { status: 'warn', message: 'GCS storage not configured' };
          // Dynamic require so the package is only needed when storage is enabled.
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { Storage } = require('@google-cloud/storage');
          const bucket = new Storage().bucket(process.env.STORAGE_BUCKET);
          const file = bucket.file(`diagnostic-ping-${Date.now()}.txt`);
          const t = Date.now();
          await file.save('ok');
          const [buf] = await file.download();
          await file.delete();
          const ms = Date.now() - t;
          const ok = buf.length > 0 && ms < 2000;
          return { status: ok ? 'ok' : 'warn', message: `Round-trip ${ms} ms (${buf.length} bytes)`, detail: process.env.STORAGE_BUCKET };
        }),

        // ── PDF generation (render a minimal document via pdfmake) ──
        probe('PDF renderer', 'pdf', async () => {
          const buf = await this.renderDiagnosticPdf();
          return buf.length > 0
            ? { status: 'ok', message: `Generated ${buf.length}-byte PDF` }
            : { status: 'error', message: 'PDF generator returned an empty buffer' };
        }),

        // ── FHIR capability statement ──
        probe('FHIR capability statement', 'fhir', async () => {
          if (!process.env.FHIR_SERVER_URL) return { status: 'warn', message: 'FHIR not configured' };
          const url = `${process.env.FHIR_SERVER_URL.replace(/\/$/, '')}/metadata`;
          const res = await axios.get(url, { timeout: 10_000, validateStatus: () => true });
          return res.status === 200
            ? { status: 'ok', message: 'Capability statement OK (HTTP 200)', detail: url }
            : { status: 'warn', message: `Unexpected response: HTTP ${res.status}`, detail: url };
        }),

        // ── Scheduler freshness (last system-run of the maintenance cron) ──
        probe('Scheduler freshness', 'scheduler', async () => {
          const last = await this.prisma.maintenanceLog.findFirst({ where: { ranBy: 'system' }, orderBy: { ranAt: 'desc' } });
          if (!last) return { status: 'error', message: 'Scheduler has not run recently', detail: 'No system runs found' };
          const hrs = (Date.now() - last.ranAt.getTime()) / 3_600_000;
          if (hrs <= 25) return { status: 'ok', message: `Last run: ${this.relTime(last.ranAt)}` };
          if (hrs <= 48) return { status: 'warn', message: 'Scheduler may have missed a run', detail: `Last run: ${this.relTime(last.ranAt)}` };
          return { status: 'error', message: 'Scheduler has not run recently', detail: `Last run: ${this.relTime(last.ranAt)}` };
        }),

        // ── Prisma migration drift ──
        probe('Migration status', 'database', async () => {
          let out = '';
          try {
            const { stdout } = await execAsync('npx prisma migrate status --schema=prisma/schema.prisma', { timeout: 10_000 });
            out = stdout;
          } catch (e: any) {
            // `migrate status` exits non-zero when migrations are pending; the
            // useful text is still on stdout. Re-throw only for real failures.
            out = (e?.stdout ?? '') + (e?.stderr ?? '');
            if (!out) return { status: 'warn', message: 'Could not determine migration status', detail: this.sanitizeError(e) };
          }
          if (/up to date/i.test(out)) return { status: 'ok', message: 'Database schema is up to date' };
          const pending = out.match(/have not yet been applied/i)
            ? (out.match(/^\s*\d{14}_/gm)?.length ?? undefined)
            : undefined;
          if (/not yet been applied/i.test(out)) {
            return { status: 'error', message: pending ? `${pending} pending migration(s)` : 'Pending migrations detected' };
          }
          return { status: 'warn', message: 'Could not determine migration status' };
        }),

        // ── Feature-gate integrity (unknown feature keys) ──
        probe('Feature-gate integrity', 'features', async () => {
          const rows = await this.prisma.labFeature.findMany({ select: { featureKey: true } });
          const valid = new Set<FeatureKey>(ALL_FEATURE_KEYS);
          const invalid = [...new Set(rows.map((r) => r.featureKey).filter((k) => !valid.has(k)))];
          return invalid.length
            ? { status: 'warn', message: `${invalid.length} unknown feature key(s)`, detail: invalid.join(', ') }
            : { status: 'ok', message: `${rows.length} feature record(s), all valid` };
        }),
      ];

      const settled = await Promise.allSettled(probes);
      return settled.map((s, i) =>
        s.status === 'fulfilled'
          ? s.value
          : ({ name: `Check ${i + 1}`, category: 'database', status: 'error', message: this.sanitizeError((s as PromiseRejectedResult).reason) } as DiagnosticCheck),
      );
    });
  }

  /** Sign a 30-second internal SUPERUSER staff token for the diagnostic route probes. */
  private mintInternalToken(labId?: string): string {
    const secret = process.env.JWT_SECRET ?? 'dev-secret';
    return jwt.sign(
      { scope: 'staff', isSuperRole: true, roles: ['SUPERUSER'], permissions: [], labId, type: 'access' },
      secret,
      { subject: 'system', audience: 'staff', expiresIn: '30s' },
    );
  }

  /** Render a tiny PDF via pdfmake to prove the renderer is functional. Returns the buffer. */
  private renderDiagnosticPdf(): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PdfPrinter = require('pdfmake');
    const printer = new PdfPrinter({
      Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
    });
    const doc = printer.createPdfKitDocument({
      defaultStyle: { font: 'Helvetica' },
      content: [{ text: 'Cytolab diagnostic ping' }],
    });
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    });
  }

  /** Extract a safe, single-line message from an error — never a stack trace. */
  private sanitizeError(e: any): string {
    const msg = typeof e === 'string' ? e : e?.message ?? 'check failed';
    return String(msg).split('\n')[0].slice(0, 300);
  }

  private relTime(d: Date): string {
    const s = Math.round((Date.now() - d.getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86_400)}d ago`;
  }
}
