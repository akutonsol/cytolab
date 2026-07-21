/**
 * Program 3 · C5 — Reagent service integration + scheduler + tenancy suite.
 *
 * Implements ONLY the tests defined by the frozen C5 design (docs/PROGRAM_3_C5_REAGENT_TEST_DESIGN.md,
 * commit b73bf10). Reuses the C1-C4 production-parity `_test` harness. Collaborators: Prisma (real,
 * `_test`) + NotificationsHelper (stub). No monetary surface; no exported pure function → no unit layer.
 *
 * Scheduler: only checkExpiry() is exercised (deterministic, lab-scoped). ReagentScheduler.run() (a
 * global all-lab sweep) is NOT integration-tested against the shared DB (design §5).
 *
 * SD-1..SD-7 are NOT normalized. Per the SD-1 ruling, the "quantity unchanged after use()" test
 * characterizes the CURRENT implementation behavior — NOT a desired inventory/depletion contract. Only
 * engine-produced status transitions (Active on create, Quarantined via quarantine, Expired via
 * checkExpiry) are exercised; no arbitrary/invalid transition, expired-lot-use, notes-overwrite-intent,
 * ordering/failure, or cross-lab record acceptance is blessed.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotificationType, ReagentStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { createTestPrisma, resolveTestDatabaseUrl } from '@test/test-database';
import { tenancyExtension } from '../../common/tenancy/tenancy.extension';
import { phiEncryptionExtension } from '../../common/crypto/phi-encryption.extension';
import { LabContext } from '../../common/tenancy/lab-context';
import { ReagentService } from './reagent.service';
import type { PrismaService } from '../../database/prisma.service';
import type { NotificationsHelper } from '../notifications/notifications.helper';

const describeIf = process.env.DATABASE_URL ? describe : describe.skip;
const DAY = 86_400_000;

describeIf('ReagentService (C5 integration)', () => {
  const raw = createTestPrisma();
  const labContext = new LabContext();
  const scoped = raw.$extends(tenancyExtension(labContext)).$extends(phiEncryptionExtension());
  const notifsStub = { notifyPermission: jest.fn() };
  const reagents = new ReagentService(scoped as unknown as PrismaService, notifsStub as unknown as NotificationsHelper);

  const createdLabIds: string[] = [];
  const uid = () => randomUUID().slice(0, 8);

  async function makeLab(): Promise<string> {
    const u = uid();
    const lab = await raw.lab.create({ data: { name: `C5 Lab ${u}`, slug: `c5-lab-${u}` } });
    createdLabIds.push(lab.id);
    return lab.id;
  }
  async function makeUser(labId: string): Promise<string> {
    const account = await raw.account.create({ data: { labId, name: `Acct ${uid()}` } });
    const user = await raw.user.create({
      data: { labId, accountId: account.id, email: `${uid()}@ex.test`, passwordHash: 'x', firstName: 'Tech', lastName: uid().slice(0, 4) },
    });
    return user.id;
  }
  async function makePatient(labId: string) {
    return raw.patient.create({ data: { labId, registrationNo: `REG-${uid()}`, firstName: 'Test', lastName: 'Patient' } });
  }
  async function makeRecord(labId: string) {
    const patient = await makePatient(labId);
    return raw.record.create({ data: { labId, identifier: `ID-${uid()}`, patientId: patient.id } });
  }
  async function makeLot(
    labId: string,
    opts: { name?: string; status?: ReagentStatus; expiryDate?: Date | null; quantity?: number; createdById?: string } = {},
  ) {
    return raw.reagentLot.create({
      data: {
        labId,
        name: opts.name ?? `Reagent ${uid()}`,
        lotNumber: `LOT-${uid()}`,
        status: opts.status ?? ReagentStatus.Active,
        expiryDate: opts.expiryDate === undefined ? null : opts.expiryDate,
        quantity: opts.quantity ?? null,
        createdById: opts.createdById ?? null,
      },
    });
  }
  async function makeUsage(labId: string, reagentLotId: string, usedById: string, opts: { recordId?: string; quantityUsed?: number } = {}) {
    return raw.reagentUsage.create({
      data: { labId, reagentLotId, usedById, recordId: opts.recordId ?? null, quantityUsed: opts.quantityUsed ?? null },
    });
  }
  async function seedExpiryNotification(labId: string, userId: string, lotId: string) {
    return raw.notification.create({
      data: { labId, userId, type: NotificationType.SYSTEM_ALERT, title: 'Reagent expiring soon', body: 'x', entityId: lotId, entityType: 'reagent-expiry' },
    });
  }

  const runAs = <T>(labId: string, fn: () => Promise<T>): Promise<T> =>
    labContext.run({ labId }, async () => await fn());

  const past = () => new Date(Date.now() - 10 * DAY);
  const soon = () => new Date(Date.now() + 10 * DAY); // within the 30-day window
  const far = () => new Date(Date.now() + 100 * DAY);

  beforeEach(() => {
    notifsStub.notifyPermission.mockReset();
    notifsStub.notifyPermission.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    if (createdLabIds.length) {
      const where = { labId: { in: createdLabIds } };
      await raw.reagentUsage.deleteMany({ where });
      await raw.reagentLot.deleteMany({ where });
      await raw.notification.deleteMany({ where });
      await raw.record.deleteMany({ where });
      await raw.patient.deleteMany({ where });
      await raw.user.deleteMany({ where });
      await raw.account.deleteMany({ where });
      await raw.lab.deleteMany({ where: { id: { in: createdLabIds } } });
    }
    await raw.$disconnect();
  });

  it('runs against the isolated _test database', () => {
    expect(resolveTestDatabaseUrl()).toMatch(/test/);
  });

  // ================================ lot CRUD ================================

  it('create: creates an Active lot with trimmed name/lotNumber and zero usage', async () => {
    const labId = await makeLab();
    const actor = await makeUser(labId);
    const lot = await runAs(labId, () => reagents.create({ name: '  Pap Stain  ', lotNumber: '  LOT-A1  ' }, actor));
    expect(lot.name).toBe('Pap Stain');
    expect(lot.lotNumber).toBe('LOT-A1');
    expect(lot.status).toBe(ReagentStatus.Active);
    expect(lot.usageCount).toBe(0);
  });

  it('detail: returns the lot with its usages; unknown → NotFound', async () => {
    const labId = await makeLab();
    const actor = await makeUser(labId);
    const lot = await makeLot(labId, {});
    await makeUsage(labId, lot.id, actor);
    const detail = await runAs(labId, () => reagents.detail(lot.id));
    expect(detail.id).toBe(lot.id);
    expect(detail.usages).toHaveLength(1);
    await expect(runAs(labId, () => reagents.detail(randomUUID()))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update: updates fields (quantity, notes) on an existing lot; unknown → NotFound', async () => {
    const labId = await makeLab();
    const lot = await makeLot(labId, { quantity: 100 });
    const updated = await runAs(labId, () => reagents.update(lot.id, { quantity: 50, notes: 'restocked' }));
    expect(updated.quantity).toBe(50);
    expect(updated.notes).toBe('restocked');
    await expect(runAs(labId, () => reagents.update(randomUUID(), { notes: 'x' }))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove: deletes a lot with no usage', async () => {
    const labId = await makeLab();
    const lot = await makeLot(labId, {});
    const result = await runAs(labId, () => reagents.remove(lot.id));
    expect(result).toEqual({ ok: true });
    expect(await raw.reagentLot.count({ where: { id: lot.id } })).toBe(0);
  });

  it('remove: rejects deleting a lot that has recorded usage (guard)', async () => {
    const labId = await makeLab();
    const actor = await makeUser(labId);
    const lot = await makeLot(labId, {});
    await makeUsage(labId, lot.id, actor);
    await expect(runAs(labId, () => reagents.remove(lot.id))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('remove: unknown → NotFound', async () => {
    const labId = await makeLab();
    await expect(runAs(labId, () => reagents.remove(randomUUID()))).rejects.toBeInstanceOf(NotFoundException);
  });

  // ================================ usage ================================

  it('use: records a usage row; unknown lot → NotFound', async () => {
    const labId = await makeLab();
    const actor = await makeUser(labId);
    const lot = await makeLot(labId, {});
    const result = await runAs(labId, () => reagents.use(lot.id, actor, { quantityUsed: 5 }));
    expect(result).toEqual({ ok: true });
    expect(await raw.reagentUsage.count({ where: { reagentLotId: lot.id } })).toBe(1);
    await expect(runAs(labId, () => reagents.use(randomUUID(), actor, {}))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('use: leaves lot.quantity UNCHANGED — CURRENT implementation behavior, not an intended depletion contract (SD-1)', async () => {
    const labId = await makeLab();
    const actor = await makeUser(labId);
    const lot = await makeLot(labId, { quantity: 100 });
    await runAs(labId, () => reagents.use(lot.id, actor, { quantityUsed: 10 }));
    const after = await raw.reagentLot.findUnique({ where: { id: lot.id } });
    // Documents that use() does not decrement quantity as implemented today; NOT a stock-ledger contract.
    expect(after?.quantity).toBe(100);
  });

  // ================================ quarantine ================================

  it('quarantine: flips the lot to Quarantined, sets the reason, and notifies', async () => {
    const labId = await makeLab();
    const lot = await makeLot(labId, {});
    const result = await runAs(labId, () => reagents.quarantine(lot.id, { reason: 'contamination' }));
    expect(result.status).toBe('Quarantined');
    const row = await raw.reagentLot.findUnique({ where: { id: lot.id } });
    expect(row?.status).toBe(ReagentStatus.Quarantined);
    expect(row?.notes).toBe('contamination');
    expect(notifsStub.notifyPermission).toHaveBeenCalledWith(
      'system:health',
      expect.objectContaining({ type: NotificationType.SYSTEM_ALERT }),
    );
  });

  it('quarantine: reports records processed with the lot in the last 7 days', async () => {
    const labId = await makeLab();
    const actor = await makeUser(labId);
    const record = await makeRecord(labId);
    const lot = await makeLot(labId, {});
    await makeUsage(labId, lot.id, actor, { recordId: record.id });
    const result = await runAs(labId, () => reagents.quarantine(lot.id, { reason: 'suspected' }));
    expect(result.affectedRecent).toBe(1);
  });

  // ================================ projections / reporting ================================

  it('affectedRecords: returns a de-duplicated list of affected records', async () => {
    const labId = await makeLab();
    const actor = await makeUser(labId);
    const recordA = await makeRecord(labId);
    const recordB = await makeRecord(labId);
    const lot = await makeLot(labId, {});
    await makeUsage(labId, lot.id, actor, { recordId: recordA.id });
    await makeUsage(labId, lot.id, actor, { recordId: recordA.id }); // duplicate record
    await makeUsage(labId, lot.id, actor, { recordId: recordB.id });
    const result = await runAs(labId, () => reagents.affectedRecords(lot.id));
    expect(result.count).toBe(2); // A + B, de-duped
  });

  it('usedOnRecord: lists lots used on a record', async () => {
    const labId = await makeLab();
    const actor = await makeUser(labId);
    const record = await makeRecord(labId);
    const lot = await makeLot(labId, {});
    await makeUsage(labId, lot.id, actor, { recordId: record.id });
    const used = await runAs(labId, () => reagents.usedOnRecord(record.id));
    expect(used).toHaveLength(1);
    expect(used[0].lot.id).toBe(lot.id);
  });

  it('expiring: returns only Active lots inside the 30-day window', async () => {
    const labId = await makeLab();
    const soonLot = await makeLot(labId, { expiryDate: soon() });
    await makeLot(labId, { expiryDate: far() });
    const expiring = await runAs(labId, () => reagents.expiring());
    expect(expiring).toHaveLength(1);
    expect(expiring[0].id).toBe(soonLot.id);
  });

  it('list: filters by status', async () => {
    const labId = await makeLab();
    await makeLot(labId, { status: ReagentStatus.Active });
    await makeLot(labId, { status: ReagentStatus.Quarantined });
    const quarantined = await runAs(labId, () => reagents.list({ status: ReagentStatus.Quarantined }));
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0].status).toBe(ReagentStatus.Quarantined);
  });

  it('stats: counts active / quarantined lots and monthly usage', async () => {
    const labId = await makeLab();
    const actor = await makeUser(labId);
    const active = await makeLot(labId, { status: ReagentStatus.Active });
    await makeLot(labId, { status: ReagentStatus.Quarantined });
    await makeUsage(labId, active.id, actor);
    const stats = await runAs(labId, () => reagents.stats());
    expect(stats.totalActive).toBe(1);
    expect(stats.quarantined).toBe(1);
    expect(stats.usagesThisMonth).toBe(1);
  });

  // ================================ scheduler: checkExpiry() ================================

  it('checkExpiry: flips a past-expiry Active lot to Expired', async () => {
    const labId = await makeLab();
    const lot = await makeLot(labId, { status: ReagentStatus.Active, expiryDate: past() });
    const result = await runAs(labId, () => reagents.checkExpiry());
    expect(result.expired).toBe(1);
    const row = await raw.reagentLot.findUnique({ where: { id: lot.id } });
    expect(row?.status).toBe(ReagentStatus.Expired);
  });

  it('checkExpiry: notifies for a lot expiring within the window', async () => {
    const labId = await makeLab();
    await makeLot(labId, { status: ReagentStatus.Active, expiryDate: soon() });
    const result = await runAs(labId, () => reagents.checkExpiry());
    expect(result.notified).toBe(1);
    expect(notifsStub.notifyPermission).toHaveBeenCalledWith(
      'system:health',
      expect.objectContaining({ entityType: 'reagent-expiry' }),
    );
  });

  it('checkExpiry: deduplicates — skips a lot that already has a reagent-expiry notification', async () => {
    const labId = await makeLab();
    const actor = await makeUser(labId);
    const lot = await makeLot(labId, { status: ReagentStatus.Active, expiryDate: soon() });
    await seedExpiryNotification(labId, actor, lot.id); // a prior notification exists
    const result = await runAs(labId, () => reagents.checkExpiry());
    expect(result.notified).toBe(0);
    expect(notifsStub.notifyPermission).not.toHaveBeenCalled();
  });

  it('checkExpiry: leaves a far-future Active lot untouched and unnotified', async () => {
    const labId = await makeLab();
    const lot = await makeLot(labId, { status: ReagentStatus.Active, expiryDate: far() });
    const result = await runAs(labId, () => reagents.checkExpiry());
    expect(result).toEqual({ expired: 0, notified: 0 });
    const row = await raw.reagentLot.findUnique({ where: { id: lot.id } });
    expect(row?.status).toBe(ReagentStatus.Active);
  });

  // ================================ tenancy ================================

  it('tenancy: detail cannot read another lab’s lot', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const lot = await makeLot(labA, {});
    await expect(runAs(labB, () => reagents.detail(lot.id))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tenancy: update / remove / use / quarantine cannot reach another lab’s lot', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const lot = await makeLot(labA, {});
    const actorB = await makeUser(labB);
    await expect(runAs(labB, () => reagents.update(lot.id, { notes: 'x' }))).rejects.toBeInstanceOf(NotFoundException);
    await expect(runAs(labB, () => reagents.remove(lot.id))).rejects.toBeInstanceOf(NotFoundException);
    await expect(runAs(labB, () => reagents.use(lot.id, actorB, {}))).rejects.toBeInstanceOf(NotFoundException);
    await expect(runAs(labB, () => reagents.quarantine(lot.id, { reason: 'x' }))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tenancy: list from lab B excludes lab A lots', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const lotA = await makeLot(labA, {});
    const fromB = await runAs(labB, () => reagents.list({}));
    expect(fromB.some((l) => l.id === lotA.id)).toBe(false);
  });

  it('tenancy: checkExpiry expires only the acting lab’s lots', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    await makeLot(labA, { status: ReagentStatus.Active, expiryDate: past() });
    const bLot = await makeLot(labB, { status: ReagentStatus.Active, expiryDate: past() });
    await runAs(labA, () => reagents.checkExpiry());
    const bRow = await raw.reagentLot.findUnique({ where: { id: bLot.id } });
    expect(bRow?.status).toBe(ReagentStatus.Active); // lab B untouched
  });

  it('tenancy: a Reagent read with no lab context fails closed (guard throws)', async () => {
    await expect(reagents.list({})).rejects.toThrow(/no lab context/i);
  });
});
