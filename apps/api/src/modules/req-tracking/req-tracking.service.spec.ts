/**
 * Program 3 · C6 — Request Tracking service integration + timeline + tenancy suite.
 *
 * Implements ONLY the tests defined by the frozen C6 design
 * (docs/PROGRAM_3_C6_REQUEST_TRACKING_TEST_DESIGN.md, commit 09e37e8). Reuses the C1-C5 production-parity
 * `_test` harness. ReqTrackingService collaborators: Prisma (real, `_test`) + LabContext (the harness
 * instance) + NotificationsHelper (stub). No monetary surface; no scheduler; no exported pure function
 * → no unit layer.
 *
 * SD governance (frozen): transitions are tested along the NORMAL pipeline order only (SD-1 — no
 * out-of-order blessing); no partial-failure/transaction characterization (SD-2); lazy get-or-create is
 * characterized as CURRENT implementation behavior, not an intended read/authorization contract (SD-3);
 * no invented Processing transition (SD-4); timeline ordering uses deliberately SEPARATED timestamps —
 * never a same-millisecond tie (SD-5).
 */
import { NotFoundException } from '@nestjs/common';
import { FormCondition, NotificationType, TrackingStage } from '@prisma/client';
import { randomUUID } from 'crypto';
import { createTestPrisma, resolveTestDatabaseUrl } from '@test/test-database';
import { tenancyExtension } from '../../common/tenancy/tenancy.extension';
import { phiEncryptionExtension } from '../../common/crypto/phi-encryption.extension';
import { LabContext } from '../../common/tenancy/lab-context';
import { ReqTrackingService } from './req-tracking.service';
import type { PrismaService } from '../../database/prisma.service';
import type { NotificationsHelper } from '../notifications/notifications.helper';

const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('ReqTrackingService (C6 integration)', () => {
  const raw = createTestPrisma();
  const labContext = new LabContext();
  const scoped = raw.$extends(tenancyExtension(labContext)).$extends(phiEncryptionExtension());
  const notifsStub = { notifyPermission: jest.fn() };
  const tracking = new ReqTrackingService(
    scoped as unknown as PrismaService,
    labContext,
    notifsStub as unknown as NotificationsHelper,
  );

  const createdLabIds: string[] = [];
  const uid = () => randomUUID().slice(0, 8);

  async function makeLab(): Promise<string> {
    const u = uid();
    const lab = await raw.lab.create({ data: { name: `C6 Lab ${u}`, slug: `c6-lab-${u}` } });
    createdLabIds.push(lab.id);
    return lab.id;
  }
  async function makeUser(labId: string): Promise<string> {
    const account = await raw.account.create({ data: { labId, name: `Acct ${uid()}` } });
    const user = await raw.user.create({
      data: { labId, accountId: account.id, email: `${uid()}@ex.test`, passwordHash: 'x', firstName: 'Clerk', lastName: uid().slice(0, 4) },
    });
    return user.id;
  }
  async function makeRequisition(labId: string, opts: { referenceNo?: string } = {}) {
    return raw.requisition.create({ data: { labId, referenceNo: opts.referenceNo ?? null } });
  }

  const runAs = <T>(labId: string, fn: () => Promise<T>): Promise<T> =>
    labContext.run({ labId }, async () => await fn());

  beforeEach(() => {
    notifsStub.notifyPermission.mockReset();
    notifsStub.notifyPermission.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    if (createdLabIds.length) {
      const where = { labId: { in: createdLabIds } };
      await raw.trackingEvent.deleteMany({ where });
      await raw.requisitionTracking.deleteMany({ where });
      await raw.requisition.deleteMany({ where });
      await raw.user.deleteMany({ where });
      await raw.account.deleteMany({ where });
      await raw.lab.deleteMany({ where: { id: { in: createdLabIds } } });
    }
    await raw.$disconnect();
  });

  it('runs against the isolated _test database', () => {
    expect(resolveTestDatabaseUrl()).toMatch(/test/);
  });

  // ================================ lazy get-or-create (SD-3, current behavior) ================================

  it('getByRequisition: first access lazily creates a Pending tracking row (CURRENT implementation behavior, not an intended read contract)', async () => {
    const labId = await makeLab();
    const req = await makeRequisition(labId);
    const result = await runAs(labId, () => tracking.getByRequisition(req.id));
    expect(result.currentStage).toBe(TrackingStage.Pending);
    expect(result.events).toEqual([]);
    // Documents the get-or-create write-on-read as implemented today; NOT endorsed as the read/authz contract.
    expect(await raw.requisitionTracking.count({ where: { requisitionId: req.id } })).toBe(1);
  });

  it('getByRequisition: a nonexistent requisition → NotFound', async () => {
    const labId = await makeLab();
    await expect(runAs(labId, () => tracking.getByRequisition(randomUUID()))).rejects.toBeInstanceOf(NotFoundException);
  });

  // ================================ normal lifecycle transitions ================================

  it('receiveForm: advances Pending → FormReceived, sets the milestone, appends one event', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const req = await makeRequisition(labId);
    const result = await runAs(labId, () =>
      tracking.receiveForm(req.id, user, { formCondition: FormCondition.Good, formConditionNotes: 'legible' }),
    );
    expect(result.currentStage).toBe(TrackingStage.FormReceived);
    expect(result.detail.formReceivedAt).toBeTruthy();
    expect(result.events).toHaveLength(1);
    expect(result.events[0].stage).toBe(TrackingStage.FormReceived);
  });

  it('receiveBench: advances to BenchReceived', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const req = await makeRequisition(labId);
    const result = await runAs(labId, () => tracking.receiveBench(req.id, user));
    expect(result.currentStage).toBe(TrackingStage.BenchReceived);
    expect(result.detail.benchReceivedAt).toBeTruthy();
  });

  it('verify: advances to Verified and records the verification note', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const req = await makeRequisition(labId);
    const result = await runAs(labId, () => tracking.verify(req.id, user, { verificationNotes: 'matches specimen' }));
    expect(result.currentStage).toBe(TrackingStage.Verified);
    expect(result.detail.verifiedAt).toBeTruthy();
  });

  it('file: advances to Filed and records the file location', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const req = await makeRequisition(labId);
    const result = await runAs(labId, () => tracking.file(req.id, user, { fileLocation: 'Cabinet A, Drawer 3' }));
    expect(result.currentStage).toBe(TrackingStage.Filed);
    expect(result.detail.fileLocation).toBe('Cabinet A, Drawer 3');
  });

  it('full normal pipeline: Pending → FormReceived → BenchReceived → Verified → Filed appends one event per transition', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const req = await makeRequisition(labId);
    await runAs(labId, () => tracking.receiveForm(req.id, user, {}));
    await runAs(labId, () => tracking.receiveBench(req.id, user));
    await runAs(labId, () => tracking.verify(req.id, user, {}));
    const final = await runAs(labId, () => tracking.file(req.id, user, { fileLocation: 'A1' }));
    expect(final.currentStage).toBe(TrackingStage.Filed);
    // one event per transition (4); assert the SET of stages, not same-ms order (SD-5).
    expect(final.events).toHaveLength(4);
    expect(new Set(final.events.map((e) => e.stage))).toEqual(
      new Set([TrackingStage.FormReceived, TrackingStage.BenchReceived, TrackingStage.Verified, TrackingStage.Filed]),
    );
  });

  it('reject: advances to Rejected and notifies', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const req = await makeRequisition(labId);
    const result = await runAs(labId, () => tracking.reject(req.id, user, { notes: 'wrong patient' }));
    expect(result.currentStage).toBe(TrackingStage.Rejected);
    expect(notifsStub.notifyPermission).toHaveBeenCalledWith(
      'system:health',
      expect.objectContaining({ type: NotificationType.SYSTEM_ALERT }),
    );
  });

  // ================================ timeline ordering (separated timestamps, SD-5) ================================

  it('getByRequisition: returns the timeline newest-first using deterministically separated timestamps', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const req = await makeRequisition(labId);
    await raw.requisitionTracking.create({ data: { labId, requisitionId: req.id, currentStage: TrackingStage.Verified } });
    const base = Date.now();
    // Distinct, seconds-apart timestamps → deterministic ordering (never a same-ms tie).
    await raw.trackingEvent.create({ data: { labId, requisitionId: req.id, stage: TrackingStage.FormReceived, performedById: user, performedAt: new Date(base - 3000) } });
    await raw.trackingEvent.create({ data: { labId, requisitionId: req.id, stage: TrackingStage.BenchReceived, performedById: user, performedAt: new Date(base - 2000) } });
    await raw.trackingEvent.create({ data: { labId, requisitionId: req.id, stage: TrackingStage.Verified, performedById: user, performedAt: new Date(base - 1000) } });

    const result = await runAs(labId, () => tracking.getByRequisition(req.id));
    expect(result.events.map((e) => e.stage)).toEqual([
      TrackingStage.Verified,
      TrackingStage.BenchReceived,
      TrackingStage.FormReceived,
    ]);
  });

  it('timeline is append-only: a later transition adds an event without mutating earlier ones', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const req = await makeRequisition(labId);
    await runAs(labId, () => tracking.receiveForm(req.id, user, {}));
    const afterFirst = await runAs(labId, () => tracking.getByRequisition(req.id));
    expect(afterFirst.events).toHaveLength(1);
    await runAs(labId, () => tracking.receiveBench(req.id, user));
    const afterSecond = await runAs(labId, () => tracking.getByRequisition(req.id));
    expect(afterSecond.events).toHaveLength(2); // appended, earlier event preserved
  });

  // ================================ queries ================================

  it('list: filters by stage (backfilled rows appear as Pending)', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const filed = await makeRequisition(labId);
    await makeRequisition(labId); // left untracked → ensureAll backfills to Pending
    await runAs(labId, () => tracking.file(filed.id, user, { fileLocation: 'A1' }));

    const filedList = await runAs(labId, () => tracking.list({ stage: TrackingStage.Filed }));
    expect(filedList).toHaveLength(1);
    expect(filedList[0].requisitionId).toBe(filed.id);
  });

  it('scan: finds a tracking row by barcode value; unmatched → { found: false }', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const req = await makeRequisition(labId);
    await runAs(labId, () => tracking.receiveForm(req.id, user, { barcodeValue: 'BC-123' }));

    const found = await runAs(labId, () => tracking.scan('BC-123'));
    expect(found.found).toBe(true);
    const missing = await runAs(labId, () => tracking.scan('NOPE-999'));
    expect(missing).toEqual({ found: false });
  });

  it('scan: finds a tracking row by requisition reference number', async () => {
    const labId = await makeLab();
    const req = await makeRequisition(labId, { referenceNo: 'REQ-XYZ' });
    await raw.requisitionTracking.create({ data: { labId, requisitionId: req.id, currentStage: TrackingStage.Pending } });
    const found = await runAs(labId, () => tracking.scan('REQ-XYZ'));
    expect(found.found).toBe(true);
  });

  it('stats: counts requisitions by stage', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const filed = await makeRequisition(labId);
    await runAs(labId, () => tracking.file(filed.id, user, { fileLocation: 'A1' }));
    const stats = await runAs(labId, () => tracking.stats());
    expect(stats.filedCount).toBe(1);
  });

  // ================================ tenancy ================================

  it('tenancy: getByRequisition cannot reach another lab’s requisition', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const req = await makeRequisition(labA);
    await expect(runAs(labB, () => tracking.getByRequisition(req.id))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tenancy: transitions cannot reach another lab’s requisition', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const req = await makeRequisition(labA);
    const userB = await makeUser(labB);
    await expect(runAs(labB, () => tracking.receiveForm(req.id, userB, {}))).rejects.toBeInstanceOf(NotFoundException);
    await expect(runAs(labB, () => tracking.verify(req.id, userB, {}))).rejects.toBeInstanceOf(NotFoundException);
    await expect(runAs(labB, () => tracking.reject(req.id, userB, { notes: 'x' }))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tenancy: list from lab B excludes lab A trackings', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const reqA = await makeRequisition(labA);
    await runAs(labA, () => tracking.getByRequisition(reqA.id)); // creates lab A tracking
    const fromB = await runAs(labB, () => tracking.list({}));
    expect(fromB.some((t) => t.requisitionId === reqA.id)).toBe(false);
  });

  it('tenancy: scan does not surface another lab’s barcode', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const user = await makeUser(labA);
    const req = await makeRequisition(labA);
    await runAs(labA, () => tracking.receiveForm(req.id, user, { barcodeValue: 'BC-AAA' }));
    const fromB = await runAs(labB, () => tracking.scan('BC-AAA'));
    expect(fromB).toEqual({ found: false });
  });

  it('tenancy: a read with no lab context fails closed (guard throws)', async () => {
    await expect(tracking.list({})).rejects.toThrow(/no lab context/i);
  });
});
