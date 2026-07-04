import { Injectable } from '@nestjs/common';
import { Prisma, RecordStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { tenantCreate } from '../../common/tenancy/tenancy.extension';
import { hoursElapsed } from '../../common/util/tat-priority';
import { UpsertTargetDto } from './dto/workload.dto';

const DEFAULT_DAILY = 20;
const DEFAULT_WEEKLY = 100;

// Open, assignable statuses (mirrors RecordsService.OPEN_ASSIGNABLE).
const OPEN_ASSIGNABLE: RecordStatus[] = [
  RecordStatus.Pending, RecordStatus.Submitted, RecordStatus.Processing,
  RecordStatus.Partial, RecordStatus.Completed, RecordStatus.Resulted,
];

function startOfToday(): Date {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d;
}
function startOfWeek(): Date {
  const d = startOfToday();
  const diff = (d.getDay() + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  return d;
}
const initials = (f: string, l: string) => `${f?.[0] ?? ''}${l?.[0] ?? ''}`.toUpperCase();

@Injectable()
export class WorkloadService {
  constructor(private prisma: PrismaService, private labContext: LabContext) {}

  private async thresholdHours(): Promise<number> {
    const labId = this.labContext.getLabId();
    const lab = labId ? await this.prisma.lab.findFirst({ where: { id: labId }, select: { targetTatDays: true } }) : null;
    return (lab?.targetTatDays ?? 3) * 24;
  }

  /** Reviewers = users who can authorize result sheets (pathologists/authorizers, super roles included). */
  private reviewers() {
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        roles: { some: { role: { OR: [{ isSuperRole: true }, { permissions: { some: { permission: { code: 'resultsheet:authorize' } } } }] } } },
      },
      select: { id: true, firstName: true, lastName: true, roles: { select: { role: { select: { name: true } } } } },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  async summary() {
    const [reviewers, threshold] = await Promise.all([this.reviewers(), this.thresholdHours()]);
    if (reviewers.length === 0) return [];

    const ids = reviewers.map((u) => u.id);
    const dayStart = startOfToday();
    const weekStart = startOfWeek();
    const now = Date.now();

    const [openAssigned, sheetsThisWeek, targets] = await Promise.all([
      // Open assigned records for these reviewers (for totals / breach / oldest).
      this.prisma.record.findMany({
        where: { assignedToId: { in: ids }, status: { in: OPEN_ASSIGNABLE } },
        select: { assignedToId: true, urgent: true, specimenDate: true, createdAt: true, assignedAt: true },
      }),
      // Result sheets authorized this week by these reviewers (today ⊂ week).
      this.prisma.resultSheet.findMany({
        where: { authorized: true, authorizedById: { in: ids }, authorizedAt: { gte: weekStart } },
        select: { authorizedById: true, authorizedAt: true },
      }),
      // Per-user target overrides.
      this.prisma.workloadTarget.findMany({ select: { userId: true, dailyTarget: true, weeklyTarget: true } }),
    ]);
    const targetByUser = new Map(targets.map((t) => [t.userId, t]));

    return reviewers.map((u) => {
      const mine = openAssigned.filter((r) => r.assignedToId === u.id);
      const breaches = mine.filter((r) => hoursElapsed(r.specimenDate ?? r.createdAt, now) >= threshold).length;
      const oldest = mine.reduce<Date | null>((acc, r) => {
        const d = r.assignedAt ?? r.specimenDate ?? r.createdAt;
        return !acc || +new Date(d) < +new Date(acc) ? d : acc;
      }, null);
      const sheets = sheetsThisWeek.filter((s) => s.authorizedById === u.id);
      const authorizedToday = sheets.filter((s) => s.authorizedAt && +new Date(s.authorizedAt) >= +dayStart).length;
      const authorizedThisWeek = sheets.length;
      const t = targetByUser.get(u.id);
      const dailyTarget = t?.dailyTarget ?? DEFAULT_DAILY;
      const weeklyTarget = t?.weeklyTarget ?? DEFAULT_WEEKLY;
      return {
        userId: u.id,
        userName: `${u.firstName} ${u.lastName}`.trim(),
        avatarInitials: initials(u.firstName, u.lastName),
        role: u.roles[0]?.role.name ?? 'Reviewer',
        assignedTotal: mine.length,
        authorizedToday,
        authorizedThisWeek,
        dailyTarget,
        weeklyTarget,
        dailyProgress: dailyTarget ? authorizedToday / dailyTarget : 0,
        weeklyProgress: weeklyTarget ? authorizedThisWeek / weeklyTarget : 0,
        oldestCase: oldest ? new Date(oldest).toISOString() : null,
        tatBreachCount: breaches,
      };
    });
  }

  /** Recent assignment history (last 50) — record, assignee, assigner, when. */
  async history() {
    const rows = await this.prisma.record.findMany({
      where: { assignedAt: { not: null } },
      select: {
        id: true, labNumber: true, identifier: true, assignedAt: true, assignedById: true,
        assignedTo: { select: { firstName: true, lastName: true } },
        patient: { select: { firstName: true, lastName: true } },
      },
      orderBy: { assignedAt: 'desc' },
      take: 50,
    });
    const actorIds = [...new Set(rows.map((r) => r.assignedById).filter(Boolean) as string[])];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const byId = new Map(actors.map((a) => [a.id, `${a.firstName} ${a.lastName}`.trim()]));
    return rows.map((r) => ({
      recordId: r.id,
      labNumber: r.labNumber ?? r.identifier,
      patientName: r.patient ? `${r.patient.firstName} ${r.patient.lastName}`.trim() : '—',
      assignedTo: r.assignedTo ? `${r.assignedTo.firstName} ${r.assignedTo.lastName}`.trim() : '—',
      assignedBy: r.assignedById ? byId.get(r.assignedById) ?? '—' : '—',
      assignedAt: r.assignedAt!.toISOString(),
    }));
  }

  listTargets() {
    return this.prisma.workloadTarget.findMany({
      select: { id: true, userId: true, dailyTarget: true, weeklyTarget: true, isActive: true, user: { select: { firstName: true, lastName: true } } },
      orderBy: { user: { firstName: 'asc' } },
    });
  }

  async upsertTarget(dto: UpsertTargetDto) {
    return this.prisma.workloadTarget.upsert({
      where: { userId: dto.userId },
      create: tenantCreate<Prisma.WorkloadTargetUncheckedCreateInput>({
        userId: dto.userId,
        dailyTarget: dto.dailyTarget ?? DEFAULT_DAILY,
        weeklyTarget: dto.weeklyTarget ?? DEFAULT_WEEKLY,
        isActive: dto.isActive ?? true,
      }),
      update: {
        ...(dto.dailyTarget !== undefined && { dailyTarget: dto.dailyTarget }),
        ...(dto.weeklyTarget !== undefined && { weeklyTarget: dto.weeklyTarget }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }
}
