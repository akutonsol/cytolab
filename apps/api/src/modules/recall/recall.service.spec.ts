/**
 * Program 3 · C4 — Recall service integration + scheduler + tenancy suite.
 *
 * Implements ONLY the tests defined by the frozen C4 design (docs/PROGRAM_3_C4_RECALL_TEST_DESIGN.md,
 * commit 82bffb4). Reuses the C1-C3 production-parity `_test` harness. RecallService collaborators:
 * Prisma (real, `_test`) + NotificationsHelper (stub). No monetary surface.
 *
 * Scheduler: only checkDue() is exercised (deterministic, lab-scoped). RecallScheduler.run() (a global
 * all-lab sweep) is NOT integration-tested against the shared DB (design §4). SD-1..SD-5 are NOT
 * normalized: transitions are tested from normal Pending/Due origins (never terminal->active), no end-of-
 * month-overflow contract, no patient-mismatch acceptance, no notify-before-persist / duplicate /
 * double-state-advance blessing, no silent-failure contract. checkDue phases are seeded separately so no
 * single invocation is asserted to advance a recall through two states.
 */
import { NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma, RecallStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { createTestPrisma, resolveTestDatabaseUrl } from '@test/test-database';
import { tenancyExtension } from '../../common/tenancy/tenancy.extension';
import { phiEncryptionExtension } from '../../common/crypto/phi-encryption.extension';
import { LabContext } from '../../common/tenancy/lab-context';
import { RecallService } from './recall.service';
import type { PrismaService } from '../../database/prisma.service';
import type { NotificationsHelper } from '../notifications/notifications.helper';

const describeIf = process.env.DATABASE_URL ? describe : describe.skip;
const DAY = 86_400_000;

describeIf('RecallService (C4 integration)', () => {
  const raw = createTestPrisma();
  const labContext = new LabContext();
  const scoped = raw.$extends(tenancyExtension(labContext)).$extends(phiEncryptionExtension());
  const notifsStub = { notifyPermission: jest.fn() };
  const recalls = new RecallService(scoped as unknown as PrismaService, notifsStub as unknown as NotificationsHelper);

  const createdLabIds: string[] = [];
  const uid = () => randomUUID().slice(0, 8);

  async function makeLab(): Promise<string> {
    const u = uid();
    const lab = await raw.lab.create({ data: { name: `C4 Lab ${u}`, slug: `c4-lab-${u}` } });
    createdLabIds.push(lab.id);
    return lab.id;
  }
  async function makePatient(labId: string) {
    return raw.patient.create({ data: { labId, registrationNo: `REG-${uid()}`, firstName: 'Test', lastName: 'Patient' } });
  }
  async function makeRecord(labId: string, opts: { patientId?: string; specimenDate?: Date } = {}) {
    const patientId = opts.patientId ?? (await makePatient(labId)).id;
    return raw.record.create({
      data: { labId, identifier: `ID-${uid()}`, patientId, specimenDate: opts.specimenDate ?? null },
    });
  }
  async function makeBethesda(
    labId: string,
    recordId: string,
    fields: Partial<Prisma.BethesdaResultUncheckedCreateInput> = {},
  ) {
    // specimenAdequacy is the only required enum; default to Satisfactory so category fields drive the interval.
    return raw.bethesdaResult.create({
      data: { labId, recordId, specimenAdequacy: 'Satisfactory', ...fields } as Prisma.BethesdaResultUncheckedCreateInput,
    });
  }
  /** Seed a RecallRecord directly (bare client) with a controlled status + dueDate. */
  async function seedRecall(
    labId: string,
    opts: { status?: RecallStatus; dueDate?: Date; intervalMonths?: number; patientId?: string; triggerRecordId?: string } = {},
  ) {
    const patientId = opts.patientId ?? (await makePatient(labId)).id;
    const triggerRecordId = opts.triggerRecordId ?? (await makeRecord(labId, { patientId })).id;
    return raw.recallRecord.create({
      data: {
        labId,
        patientId,
        triggerRecordId,
        triggerDiagnosis: 'LSIL',
        triggerDate: new Date('2025-01-01'),
        recallIntervalMonths: opts.intervalMonths ?? 12,
        dueDate: opts.dueDate ?? new Date('2025-06-01'),
        status: opts.status ?? RecallStatus.Pending,
      },
    });
  }

  const runAs = <T>(labId: string, fn: () => Promise<T>): Promise<T> =>
    labContext.run({ labId }, async () => await fn());

  const past = () => new Date(Date.now() - 10 * DAY); // past due, < 90 days
  const longPast = () => new Date(Date.now() - 100 * DAY); // > 90 days overdue
  const future = () => new Date(Date.now() + 100 * DAY);

  beforeEach(() => {
    notifsStub.notifyPermission.mockReset();
    notifsStub.notifyPermission.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    if (createdLabIds.length) {
      const where = { labId: { in: createdLabIds } };
      await raw.recallRecord.deleteMany({ where });
      await raw.bethesdaResult.deleteMany({ where });
      await raw.record.deleteMany({ where });
      await raw.patient.deleteMany({ where });
      await raw.lab.deleteMany({ where: { id: { in: createdLabIds } } });
    }
    await raw.$disconnect();
  });

  it('runs against the isolated _test database', () => {
    expect(resolveTestDatabaseUrl()).toMatch(/test/);
  });

  // ================================ manual ================================

  it('manual: creates a Pending recall for the trigger record', async () => {
    const labId = await makeLab();
    const patient = await makePatient(labId);
    const record = await makeRecord(labId, { patientId: patient.id, specimenDate: new Date('2025-01-15') });

    const created = await runAs(labId, () =>
      recalls.manual({ patientId: patient.id, triggerRecordId: record.id, intervalMonths: 3, diagnosis: 'Manual' }),
    );

    expect(created.status).toBe(RecallStatus.Pending);
    expect(created.recallIntervalMonths).toBe(3);
    expect(new Date(created.dueDate).getTime()).toBeGreaterThan(new Date('2025-01-15').getTime());
    expect(await raw.recallRecord.count({ where: { triggerRecordId: record.id } })).toBe(1);
  });

  it('manual: upserts by trigger record (a second call updates, no duplicate)', async () => {
    const labId = await makeLab();
    const patient = await makePatient(labId);
    const record = await makeRecord(labId, { patientId: patient.id });

    await runAs(labId, () => recalls.manual({ patientId: patient.id, triggerRecordId: record.id, intervalMonths: 3 }));
    const second = await runAs(labId, () =>
      recalls.manual({ patientId: patient.id, triggerRecordId: record.id, intervalMonths: 6 }),
    );

    expect(second.recallIntervalMonths).toBe(6);
    expect(await raw.recallRecord.count({ where: { triggerRecordId: record.id } })).toBe(1);
  });

  it('manual: rejects when the trigger record does not exist', async () => {
    const labId = await makeLab();
    const patient = await makePatient(labId);
    await expect(
      runAs(labId, () => recalls.manual({ patientId: patient.id, triggerRecordId: randomUUID(), intervalMonths: 3 })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ================================ autoCreateFromBethesda ================================

  it('autoCreateFromBethesda: creates a Pending recall from a low-grade Bethesda result', async () => {
    const labId = await makeLab();
    const record = await makeRecord(labId);
    await makeBethesda(labId, record.id, { squamousCategory: 'LSIL' });

    await runAs(labId, () => recalls.autoCreateFromBethesda(record.id));

    const row = await raw.recallRecord.findFirst({ where: { triggerRecordId: record.id } });
    expect(row?.status).toBe(RecallStatus.Pending);
    expect(row?.triggerDiagnosis).toBe('LSIL');
    expect(row?.recallIntervalMonths).toBe(12);
  });

  it('autoCreateFromBethesda: is idempotent (a second call creates no duplicate)', async () => {
    const labId = await makeLab();
    const record = await makeRecord(labId);
    await makeBethesda(labId, record.id, { squamousCategory: 'LSIL' });
    await runAs(labId, () => recalls.autoCreateFromBethesda(record.id));
    await runAs(labId, () => recalls.autoCreateFromBethesda(record.id));
    expect(await raw.recallRecord.count({ where: { triggerRecordId: record.id } })).toBe(1);
  });

  it('autoCreateFromBethesda: creates nothing when there is no Bethesda result', async () => {
    const labId = await makeLab();
    const record = await makeRecord(labId);
    await runAs(labId, () => recalls.autoCreateFromBethesda(record.id));
    expect(await raw.recallRecord.count({ where: { triggerRecordId: record.id } })).toBe(0);
  });

  it('autoCreateFromBethesda: creates nothing for a high-grade result (no recall interval)', async () => {
    const labId = await makeLab();
    const record = await makeRecord(labId);
    await makeBethesda(labId, record.id, { squamousCategory: 'HSIL' });
    await runAs(labId, () => recalls.autoCreateFromBethesda(record.id));
    expect(await raw.recallRecord.count({ where: { triggerRecordId: record.id } })).toBe(0);
  });

  // ================================ lifecycle mutations ================================

  it('update: sets status and notes (normal Pending → Due origin)', async () => {
    const labId = await makeLab();
    const recall = await seedRecall(labId, { status: RecallStatus.Pending });
    const updated = await runAs(labId, () => recalls.update(recall.id, { status: RecallStatus.Due, notes: 'follow up' }));
    expect(updated.status).toBe(RecallStatus.Due);
    expect(updated.notes).toBe('follow up');
  });

  it('complete: marks a recall Completed with completedAt + completedRecordId', async () => {
    const labId = await makeLab();
    const recall = await seedRecall(labId, { status: RecallStatus.Due });
    const done = await runAs(labId, () => recalls.complete(recall.id, { completedRecordId: 'rec-xyz' }));
    expect(done.status).toBe(RecallStatus.Completed);
    expect(done.completedAt).toBeTruthy();
    expect(done.completedRecordId).toBe('rec-xyz');
  });

  it('cancel: marks a recall Cancelled with notes', async () => {
    const labId = await makeLab();
    const recall = await seedRecall(labId, { status: RecallStatus.Pending });
    const cancelled = await runAs(labId, () => recalls.cancel(recall.id, { notes: 'clinician cancelled' }));
    expect(cancelled.status).toBe(RecallStatus.Cancelled);
    expect(cancelled.notes).toBe('clinician cancelled');
  });

  it('decline: marks a recall Declined with notes', async () => {
    const labId = await makeLab();
    const recall = await seedRecall(labId, { status: RecallStatus.Pending });
    const declined = await runAs(labId, () => recalls.decline(recall.id, { notes: 'patient declined' }));
    expect(declined.status).toBe(RecallStatus.Declined);
  });

  it('notifyClient: records the notification intent', async () => {
    const labId = await makeLab();
    const recall = await seedRecall(labId, {});
    const result = await runAs(labId, () => recalls.notifyClient(recall.id));
    expect(result.id).toBe(recall.id);
    expect(result.clientNotifiedAt).toBeTruthy();
    const row = await raw.recallRecord.findUnique({ where: { id: recall.id } });
    expect(row?.clientNotifiedAt).toBeTruthy();
  });

  it('detail / update reject an unknown recall id', async () => {
    const labId = await makeLab();
    await expect(runAs(labId, () => recalls.detail(randomUUID()))).rejects.toBeInstanceOf(NotFoundException);
    await expect(runAs(labId, () => recalls.update(randomUUID(), { notes: 'x' }))).rejects.toBeInstanceOf(NotFoundException);
  });

  // ================================ queries ================================

  it('list: filters by status', async () => {
    const labId = await makeLab();
    await seedRecall(labId, { status: RecallStatus.Pending });
    await seedRecall(labId, { status: RecallStatus.Due });
    const pending = await runAs(labId, () => recalls.list({ status: RecallStatus.Pending }));
    expect(pending.every((r) => r.status === RecallStatus.Pending)).toBe(true);
    expect(pending).toHaveLength(1);
  });

  it('summary: counts by open status', async () => {
    const labId = await makeLab();
    await seedRecall(labId, { status: RecallStatus.Pending });
    await seedRecall(labId, { status: RecallStatus.Due });
    await seedRecall(labId, { status: RecallStatus.Overdue });
    const summary = await runAs(labId, () => recalls.summary());
    expect(summary.pending).toBe(1);
    expect(summary.due).toBe(1);
    expect(summary.overdue).toBe(1);
  });

  it('detail / byPatient: retrieve recall rows', async () => {
    const labId = await makeLab();
    const patient = await makePatient(labId);
    const recall = await seedRecall(labId, { patientId: patient.id });
    const detail = await runAs(labId, () => recalls.detail(recall.id));
    expect(detail.id).toBe(recall.id);
    const byPatient = await runAs(labId, () => recalls.byPatient(patient.id));
    expect(byPatient).toHaveLength(1);
    expect(byPatient[0].id).toBe(recall.id);
  });

  it('generateList: returns open recalls by default', async () => {
    const labId = await makeLab();
    await seedRecall(labId, { status: RecallStatus.Pending });
    await seedRecall(labId, { status: RecallStatus.Completed });
    const list = await runAs(labId, () => recalls.generateList({}));
    // default status filter is Pending/Due/Overdue → the Completed row is excluded.
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe(RecallStatus.Pending);
  });

  it('recordIdsWithOpenRecall: returns distinct sorted trigger ids for open statuses only', async () => {
    const labId = await makeLab();
    const open = await seedRecall(labId, { status: RecallStatus.Due });
    const closed = await seedRecall(labId, { status: RecallStatus.Completed });
    const ids = await runAs(labId, () => recalls.recordIdsWithOpenRecall());
    expect(ids).toContain(open.triggerRecordId);
    expect(ids).not.toContain(closed.triggerRecordId);
    expect([...ids]).toEqual([...ids].sort()); // sorted
  });

  // ================================ scheduler: checkDue() ================================

  it('checkDue: advances a past-due Pending recall to Due and notifies', async () => {
    const labId = await makeLab();
    await seedRecall(labId, { status: RecallStatus.Pending, dueDate: past() });
    const result = await runAs(labId, () => recalls.checkDue());
    expect(result).toEqual({ due: 1, overdue: 0 });
    expect(notifsStub.notifyPermission).toHaveBeenCalledWith(
      'system:health',
      expect.objectContaining({ type: NotificationType.SYSTEM_ALERT }),
    );
  });

  it('checkDue: advances a Due recall past 90 days to Overdue', async () => {
    const labId = await makeLab();
    await seedRecall(labId, { status: RecallStatus.Due, dueDate: longPast() });
    const result = await runAs(labId, () => recalls.checkDue());
    expect(result).toEqual({ due: 0, overdue: 1 });
  });

  it('checkDue: leaves a future-dated Pending recall untouched and emits no notification', async () => {
    const labId = await makeLab();
    const recall = await seedRecall(labId, { status: RecallStatus.Pending, dueDate: future() });
    const result = await runAs(labId, () => recalls.checkDue());
    expect(result).toEqual({ due: 0, overdue: 0 });
    expect(notifsStub.notifyPermission).not.toHaveBeenCalled();
    const row = await raw.recallRecord.findUnique({ where: { id: recall.id } });
    expect(row?.status).toBe(RecallStatus.Pending);
  });

  it('checkDue: is idempotent — a second sweep advances nothing and re-notifies nothing', async () => {
    const labId = await makeLab();
    await seedRecall(labId, { status: RecallStatus.Pending, dueDate: past() });
    await runAs(labId, () => recalls.checkDue()); // → Due
    notifsStub.notifyPermission.mockClear();
    const second = await runAs(labId, () => recalls.checkDue());
    expect(second).toEqual({ due: 0, overdue: 0 });
    expect(notifsStub.notifyPermission).not.toHaveBeenCalled();
  });

  // ================================ tenancy ================================

  it('tenancy: detail cannot read another lab’s recall', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const recall = await seedRecall(labA, {});
    await expect(runAs(labB, () => recalls.detail(recall.id))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tenancy: update / complete / cancel / decline cannot reach another lab’s recall', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const recall = await seedRecall(labA, {});
    await expect(runAs(labB, () => recalls.update(recall.id, { notes: 'x' }))).rejects.toBeInstanceOf(NotFoundException);
    await expect(runAs(labB, () => recalls.complete(recall.id, {}))).rejects.toBeInstanceOf(NotFoundException);
    await expect(runAs(labB, () => recalls.cancel(recall.id, {}))).rejects.toBeInstanceOf(NotFoundException);
    await expect(runAs(labB, () => recalls.decline(recall.id, {}))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tenancy: list from lab B excludes lab A recalls', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const recallA = await seedRecall(labA, {});
    const fromB = await runAs(labB, () => recalls.list({}));
    expect(fromB.some((r) => r.id === recallA.id)).toBe(false);
  });

  it('tenancy: checkDue advances only the acting lab’s recalls', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    await seedRecall(labA, { status: RecallStatus.Pending, dueDate: past() });
    const bRecall = await seedRecall(labB, { status: RecallStatus.Pending, dueDate: past() });
    await runAs(labA, () => recalls.checkDue());
    const bRow = await raw.recallRecord.findUnique({ where: { id: bRecall.id } });
    expect(bRow?.status).toBe(RecallStatus.Pending); // lab B untouched
  });

  it('tenancy: a Recall read with no lab context fails closed (guard throws)', async () => {
    await expect(recalls.list({})).rejects.toThrow(/no lab context/i);
  });
});
