import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LabInvoiceStatus, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { allocateSequence } from '../../common/util/lab-sequence';
import { NotificationsHelper } from '../notifications/notifications.helper';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { InvoiceQueryDto, UpsertBillingProfileDto } from './dto/platform-billing.dto';

const INVOICE_SEQUENCE = 'labInvoiceNo';
// The lab permission whose holders (plus super-roles) are the lab's admins — the
// audience for invoice notifications and the lab-facing invoice view.
const LAB_ADMIN_PERMISSION = 'applicationprefs:view';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const invoiceInclude = {
  lines: { orderBy: { amount: 'desc' } },
  lab: { select: { id: true, name: true, slug: true, email: true, currency: true } },
} satisfies Prisma.LabInvoiceInclude;

@Injectable()
export class PlatformBillingService {
  private readonly log = new Logger(PlatformBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly labContext: LabContext,
    private readonly notifications: NotificationsHelper,
    private readonly realtime: RealtimeGateway,
  ) {}

  // ── Period helpers ─────────────────────────────────────────────────────────
  /** The calendar month `date` falls in: start, end, "YYYY-MM" key, and label. */
  private periodFor(date: Date) {
    const y = date.getFullYear();
    const m = date.getMonth();
    const start = new Date(y, m, 1, 0, 0, 0, 0);
    const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
    const key = `${y}-${String(m + 1).padStart(2, '0')}`;
    return { start, end, key, label: `${MONTHS[m]} ${y}`, yyyymm: `${y}${String(m + 1).padStart(2, '0')}` };
  }

  private money(cents: number, currency: string) {
    return `${currency} ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // ── Superuser: cross-lab config surface ────────────────────────────────────
  /** Every lab with its billing profile summary + latest invoice (superuser). */
  async listLabsWithBilling() {
    return this.labContext.runSystem(async () => {
      const labs = await this.prisma.lab.findMany({
        select: {
          id: true, name: true, slug: true, currency: true, isActive: true,
          billingProfile: { include: { items: { orderBy: { sortOrder: 'asc' } } } },
        },
        orderBy: { name: 'asc' },
      });
      // Latest invoice + outstanding count per lab, in one pass.
      const invoices = await this.prisma.labInvoice.findMany({
        select: { labId: true, total: true, status: true, issueDate: true, number: true, periodLabel: true },
        orderBy: { issueDate: 'desc' },
      });
      const latest = new Map<string, (typeof invoices)[number]>();
      const outstanding = new Map<string, number>();
      for (const inv of invoices) {
        if (!latest.has(inv.labId)) latest.set(inv.labId, inv);
        if (inv.status === LabInvoiceStatus.Sent || inv.status === LabInvoiceStatus.Overdue) {
          outstanding.set(inv.labId, (outstanding.get(inv.labId) ?? 0) + inv.total);
        }
      }
      return labs.map((l) => {
        const p = l.billingProfile;
        const monthly = (p?.items ?? []).reduce((s, it) => s + it.quantity * it.unitPrice, 0);
        return {
          labId: l.id,
          labName: l.name,
          slug: l.slug,
          currency: p?.currency ?? l.currency,
          isActive: l.isActive,
          profile: p
            ? { active: p.active, billingDayOfMonth: p.billingDayOfMonth, dueDays: p.dueDays, autoSend: p.autoSend, currency: p.currency, notes: p.notes, lastRunPeriod: p.lastRunPeriod, lastRunAt: p.lastRunAt, items: p.items.map((it) => ({ id: it.id, description: it.description, quantity: it.quantity, unitPrice: it.unitPrice })) }
            : null,
          monthlyAmount: monthly,
          latestInvoice: latest.get(l.id) ?? null,
          outstandingTotal: outstanding.get(l.id) ?? 0,
        };
      });
    });
  }

  /** A single lab's billing profile (superuser). */
  async getProfile(labId: string) {
    return this.labContext.runSystem(async () => {
      const lab = await this.prisma.lab.findUnique({ where: { id: labId }, select: { id: true, name: true, currency: true } });
      if (!lab) throw new NotFoundException('Lab not found');
      const profile = await this.prisma.labBillingProfile.findUnique({
        where: { labId },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
      return { lab, profile };
    });
  }

  /** Create or update a lab's billing profile + its template line items (superuser). */
  async upsertProfile(labId: string, dto: UpsertBillingProfileDto) {
    return this.labContext.runSystem(async () => {
      const lab = await this.prisma.lab.findUnique({ where: { id: labId }, select: { id: true, currency: true } });
      if (!lab) throw new NotFoundException('Lab not found');

      const currency = (dto.currency ?? lab.currency ?? 'JMD').toUpperCase();
      const profile = await this.prisma.labBillingProfile.upsert({
        where: { labId },
        create: {
          labId,
          active: dto.active ?? false,
          billingDayOfMonth: dto.billingDayOfMonth ?? 1,
          dueDays: dto.dueDays ?? 14,
          autoSend: dto.autoSend ?? true,
          currency,
          notes: dto.notes,
        },
        update: {
          active: dto.active ?? undefined,
          billingDayOfMonth: dto.billingDayOfMonth ?? undefined,
          dueDays: dto.dueDays ?? undefined,
          autoSend: dto.autoSend ?? undefined,
          currency,
          notes: dto.notes ?? undefined,
        },
      });

      // Replace the template line items when provided.
      if (dto.items) {
        await this.prisma.labBillingItem.deleteMany({ where: { profileId: profile.id } });
        if (dto.items.length) {
          await this.prisma.labBillingItem.createMany({
            data: dto.items.map((it, i) => ({ labId, profileId: profile.id, description: it.description, quantity: it.quantity, unitPrice: it.unitPrice, sortOrder: i })),
          });
        }
      }
      return this.prisma.labBillingProfile.findUnique({ where: { labId }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
    });
  }

  // ── Generation ─────────────────────────────────────────────────────────────
  /**
   * Generate the invoice for `labId` for the calendar month of `when` (default
   * now). Idempotent per (lab, period): returns the existing invoice if one was
   * already generated for that month. Context-agnostic — does all work under an
   * explicit-labId system scope, and notifies inside a lab scope.
   */
  async generateForLab(labId: string, opts: { when?: Date; generatedBy?: string } = {}) {
    const when = opts.when ?? new Date();
    const period = this.periodFor(when);

    const invoice = await this.labContext.runSystem(async () => {
      const profile = await this.prisma.labBillingProfile.findUnique({
        where: { labId },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
      if (!profile) throw new BadRequestException('This lab has no billing profile configured');
      if (!profile.items.length) throw new BadRequestException('This lab has no billing line items configured');

      // Idempotency: one invoice per lab per calendar month.
      const existing = await this.prisma.labInvoice.findFirst({ where: { labId, periodStart: period.start }, include: invoiceInclude });
      if (existing) return { invoice: existing, created: false, sent: false, profile };

      const subtotal = profile.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
      const seq = await allocateSequence(this.prisma, labId, INVOICE_SEQUENCE, 0n);
      const number = `INV-${period.yyyymm}-${seq.toString().padStart(4, '0')}`;
      const willSend = profile.active && profile.autoSend;
      const dueDate = new Date(when.getTime() + profile.dueDays * 86_400_000);

      const created = await this.prisma.labInvoice.create({
        data: {
          labId,
          profileId: profile.id,
          number,
          periodLabel: period.label,
          periodStart: period.start,
          periodEnd: period.end,
          status: willSend ? LabInvoiceStatus.Sent : LabInvoiceStatus.Draft,
          currency: profile.currency,
          subtotal,
          total: subtotal,
          issueDate: when,
          dueDate,
          sentAt: willSend ? when : null,
          generatedBy: opts.generatedBy ?? 'system',
          lines: {
            create: profile.items.map((it) => ({ labId, description: it.description, quantity: it.quantity, unitPrice: it.unitPrice, amount: it.quantity * it.unitPrice })),
          },
        },
        include: invoiceInclude,
      });

      await this.prisma.labBillingProfile.update({ where: { id: profile.id }, data: { lastRunPeriod: period.key, lastRunAt: when } });
      return { invoice: created, created: true, sent: willSend, profile };
    });

    // Notify the lab only when the invoice is actually issued (Sent).
    if (invoice.created && invoice.sent) await this.notifyIssued(labId, invoice.invoice);
    return invoice;
  }

  /** In-app + realtime notification that an invoice was issued to a lab. */
  private async notifyIssued(labId: string, invoice: { id: string; number: string; total: number; currency: string; dueDate: Date | null }) {
    const dueStr = invoice.dueDate ? ` — due ${invoice.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : '';
    // notifyPermission resolves labId from context, so run inside a lab scope.
    await this.labContext.runLabScoped(labId, () =>
      this.notifications.notifyPermission(LAB_ADMIN_PERMISSION, {
        type: NotificationType.INVOICE_ISSUED,
        title: `Invoice ${invoice.number}`,
        body: `A new invoice for ${this.money(invoice.total, invoice.currency)} is ready${dueStr}.`,
        link: '/account/invoices',
        entityId: invoice.id,
        entityType: 'labInvoice',
      }),
    );
    this.realtime.emitToLab(labId, 'labInvoice:issued', { id: invoice.id, number: invoice.number, total: invoice.total });
    this.realtime.emitToSuperusers('labInvoice:generated', { labId, id: invoice.id, number: invoice.number, total: invoice.total });
  }

  // ── Superuser: invoice management ──────────────────────────────────────────
  async listInvoices(query: InvoiceQueryDto) {
    return this.labContext.runSystem(() =>
      this.prisma.labInvoice.findMany({
        where: { ...(query.status ? { status: query.status } : {}), ...(query.labId ? { labId: query.labId } : {}) },
        include: invoiceInclude,
        orderBy: { issueDate: 'desc' },
        take: 500,
      }),
    );
  }

  async getInvoice(id: string) {
    const inv = await this.labContext.runSystem(() => this.prisma.labInvoice.findUnique({ where: { id }, include: invoiceInclude }));
    if (!inv) throw new NotFoundException('Invoice not found');
    return inv;
  }

  /** Set an invoice's lifecycle status (superuser). Stamps the matching timestamp
   *  and, on a Draft→Sent transition, notifies the lab. */
  async setInvoiceStatus(id: string, status: LabInvoiceStatus) {
    const result = await this.labContext.runSystem(async () => {
      const inv = await this.prisma.labInvoice.findUnique({ where: { id }, include: invoiceInclude });
      if (!inv) throw new NotFoundException('Invoice not found');
      const nowSending = status === LabInvoiceStatus.Sent && inv.status !== LabInvoiceStatus.Sent;
      const updated = await this.prisma.labInvoice.update({
        where: { id },
        data: {
          status,
          sentAt: status === LabInvoiceStatus.Sent ? inv.sentAt ?? new Date() : inv.sentAt,
          paidAt: status === LabInvoiceStatus.Paid ? new Date() : status === LabInvoiceStatus.Void ? inv.paidAt : inv.paidAt,
          voidedAt: status === LabInvoiceStatus.Void ? new Date() : inv.voidedAt,
        },
        include: invoiceInclude,
      });
      return { updated, nowSending };
    });
    if (result.nowSending) await this.notifyIssued(result.updated.labId, result.updated);
    return result.updated;
  }

  // ── Lab-facing (tenant-scoped): the lab's own invoices ─────────────────────
  async listMyInvoices() {
    // Auto-scoped to the caller's lab by the tenancy extension.
    return this.prisma.labInvoice.findMany({
      where: { status: { not: LabInvoiceStatus.Draft } },
      include: { lines: { orderBy: { amount: 'desc' } } },
      orderBy: { issueDate: 'desc' },
      take: 200,
    });
  }

  async getMyInvoice(id: string) {
    const inv = await this.prisma.labInvoice.findFirst({ where: { id, status: { not: LabInvoiceStatus.Draft } }, include: { lines: { orderBy: { amount: 'desc' } } } });
    if (!inv) throw new NotFoundException('Invoice not found');
    return inv;
  }

  // ── Cron entry points ──────────────────────────────────────────────────────
  /** Generate invoices for every active profile whose billing day is `day` and
   *  which hasn't already run this period. Returns a summary. */
  async runScheduledGeneration(when = new Date()) {
    const day = when.getDate();
    const period = this.periodFor(when);
    const due = await this.labContext.runSystem(() =>
      this.prisma.labBillingProfile.findMany({
        where: { active: true, billingDayOfMonth: day, NOT: { lastRunPeriod: period.key } },
        select: { labId: true },
      }),
    );
    let generated = 0;
    for (const p of due) {
      try {
        const r = await this.generateForLab(p.labId, { when, generatedBy: 'system' });
        if (r.created) generated++;
      } catch (e: any) {
        this.log.error(`Invoice generation failed for lab ${p.labId}: ${e?.message}`);
      }
    }
    return { candidates: due.length, generated };
  }

  /** Flip Sent invoices past their due date to Overdue (cross-lab). */
  async sweepOverdue(when = new Date()) {
    const r = await this.labContext.runSystem(() =>
      this.prisma.labInvoice.updateMany({
        where: { status: LabInvoiceStatus.Sent, dueDate: { lt: when } },
        data: { status: LabInvoiceStatus.Overdue },
      }),
    );
    return r.count;
  }
}
