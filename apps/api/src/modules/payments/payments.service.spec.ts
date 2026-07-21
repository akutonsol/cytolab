/**
 * Program 3 · C2 — Payments service test hardening.
 *
 * Implements ONLY the Payments tests defined by the frozen C2 design
 * (docs/PROGRAM_3_C2_PAYMENTS_TEST_DESIGN.md, commit 0e73595). Reuses the C1 harness verbatim: the
 * isolated `_test` database via `createTestPrisma()` and the production-parity extended client
 * (base.$extends(tenancyExtension).$extends(phiEncryptionExtension)) driven inside labContext.run().
 *
 *  - `raw`    — bare `_test` client: fixture seeding + scoped teardown only (labId stamped explicitly).
 *  - `scoped` — the client the service under test receives.
 *  - RecordsService + NotificationsHelper are thin stubs (design §5): create() calls only
 *    updateStatus() (Records-owned Billed->Paid legality) and notifyPermission() (best-effort emitter).
 *
 * Per the SD-1 Outcome-A ruling (design §7): C2 verifies SEQUENTIAL settlement correctness, the
 * deterministic guards, and single-call $transaction behavior. It adds NO concurrency characterization
 * test and neither blesses nor fails on the unproven concurrency race. Bills are seeded via the bare
 * client because Payments cannot create bills (that is Billing/C1).
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BillStatus, NotificationType, PaymentType, RecordStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { createTestPrisma, resolveTestDatabaseUrl } from '@test/test-database';
import { tenancyExtension } from '../../common/tenancy/tenancy.extension';
import { phiEncryptionExtension } from '../../common/crypto/phi-encryption.extension';
import { LabContext } from '../../common/tenancy/lab-context';
import { PaymentsService } from './payments.service';
import { BillingService } from '../billing/billing.service';
import type { PrismaService } from '../../database/prisma.service';
import type { RecordsService } from '../records/records.service';
import type { NotificationsHelper } from '../notifications/notifications.helper';

const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('PaymentsService (C2 integration)', () => {
  const raw = createTestPrisma();
  const labContext = new LabContext();
  const scoped = raw.$extends(tenancyExtension(labContext)).$extends(phiEncryptionExtension());
  const recordsStub = { updateStatus: jest.fn() };
  const notifsStub = { notifyPermission: jest.fn() };
  const payments = new PaymentsService(
    scoped as unknown as PrismaService,
    recordsStub as unknown as RecordsService,
    notifsStub as unknown as NotificationsHelper,
  );
  // For the drift-free cross-check: Billing's derived `outstanding` read through its public API.
  const billing = new BillingService(scoped as unknown as PrismaService, recordsStub as unknown as RecordsService);

  const createdLabIds: string[] = [];
  const uid = () => randomUUID().slice(0, 8);

  async function makeLab(): Promise<string> {
    const u = uid();
    const lab = await raw.lab.create({ data: { name: `C2 Lab ${u}`, slug: `c2-lab-${u}` } });
    createdLabIds.push(lab.id);
    return lab.id;
  }
  async function makePatient(labId: string) {
    return raw.patient.create({
      data: { labId, registrationNo: `REG-${uid()}`, firstName: 'Test', lastName: 'Patient' },
    });
  }
  async function makeRecord(labId: string, opts: { status?: RecordStatus } = {}) {
    const patient = await makePatient(labId);
    return raw.record.create({
      data: { labId, identifier: `ID-${uid()}`, patientId: patient.id, status: opts.status ?? RecordStatus.Approved },
    });
  }
  async function seedBill(
    labId: string,
    status: BillStatus,
    opts: { total?: number; amountPaid?: number; recordId?: string } = {},
  ) {
    const recordId = opts.recordId ?? (await makeRecord(labId)).id;
    const total = opts.total ?? 1000;
    return raw.bill.create({
      data: {
        labId,
        recordId,
        referenceNo: `BILL-${uid()}`,
        status,
        subtotal: total,
        taxTotal: 0,
        total,
        amountPaid: opts.amountPaid ?? 0,
      },
    });
  }
  async function seedPayment(
    labId: string,
    billId: string,
    opts: { amount?: number; type?: PaymentType; verified?: boolean } = {},
  ) {
    return raw.payment.create({
      data: {
        labId,
        billId,
        amount: opts.amount ?? 100,
        type: opts.type ?? PaymentType.Cash,
        verified: opts.verified ?? false,
      },
    });
  }

  const runAs = <T>(labId: string, fn: () => Promise<T>): Promise<T> =>
    labContext.run({ labId }, async () => await fn());

  beforeEach(() => {
    recordsStub.updateStatus.mockReset();
    recordsStub.updateStatus.mockResolvedValue({});
    notifsStub.notifyPermission.mockReset();
    notifsStub.notifyPermission.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    if (createdLabIds.length) {
      const where = { labId: { in: createdLabIds } };
      await raw.payment.deleteMany({ where });
      await raw.billTax.deleteMany({ where });
      await raw.billLine.deleteMany({ where });
      await raw.bill.deleteMany({ where });
      await raw.recordStatusEvent.deleteMany({ where });
      await raw.record.deleteMany({ where });
      await raw.patient.deleteMany({ where });
      await raw.service.deleteMany({ where });
      await raw.tax.deleteMany({ where });
      await raw.client.deleteMany({ where });
      await raw.lab.deleteMany({ where: { id: { in: createdLabIds } } });
    }
    await raw.$disconnect();
  });

  it('runs against the isolated _test database', () => {
    expect(resolveTestDatabaseUrl()).toMatch(/test/);
  });

  // ================================ create() — settlement ================================

  it('create: a partial payment on an Issued bill records the payment and sets amountPaid + PartiallyPaid', async () => {
    const labId = await makeLab();
    const bill = await seedBill(labId, BillStatus.Issued, { total: 1000 });

    const payment = await runAs(labId, () => payments.create({ billId: bill.id, amount: 400, type: PaymentType.Cash }, randomUUID()));

    expect(payment.amount).toBe(400);
    const after = await raw.bill.findUnique({ where: { id: bill.id } });
    expect(after!.amountPaid).toBe(400);
    expect(after!.status).toBe(BillStatus.PartiallyPaid);
    // partial settlement does not advance the record.
    expect(recordsStub.updateStatus).not.toHaveBeenCalled();
  });

  it('create: an exact-full payment settles the bill to Paid with amountPaid = total', async () => {
    const labId = await makeLab();
    const bill = await seedBill(labId, BillStatus.Issued, { total: 1000 });

    await runAs(labId, () => payments.create({ billId: bill.id, amount: 1000, type: PaymentType.Cash }, randomUUID()));

    const after = await raw.bill.findUnique({ where: { id: bill.id } });
    expect(after!.amountPaid).toBe(1000);
    expect(after!.status).toBe(BillStatus.Paid);
  });

  it('create: sequential partial payments recompute amountPaid drift-free from the payment rows', async () => {
    const labId = await makeLab();
    const bill = await seedBill(labId, BillStatus.Issued, { total: 1000 });

    await runAs(labId, () => payments.create({ billId: bill.id, amount: 300, type: PaymentType.Cash }, randomUUID()));
    let after = await raw.bill.findUnique({ where: { id: bill.id } });
    expect(after!.amountPaid).toBe(300);
    expect(after!.status).toBe(BillStatus.PartiallyPaid);

    await runAs(labId, () => payments.create({ billId: bill.id, amount: 700, type: PaymentType.BankTransfer }, randomUUID()));
    after = await raw.bill.findUnique({ where: { id: bill.id } });
    expect(after!.amountPaid).toBe(1000); // == Σ of payment rows, not an increment
    expect(after!.status).toBe(BillStatus.Paid);

    // amountPaid equals the authoritative sum of rows (drift-free).
    const agg = await raw.payment.aggregate({ where: { billId: bill.id }, _sum: { amount: true } });
    expect(after!.amountPaid).toBe(agg._sum.amount);

    // Billing's derived outstanding stays consistent with the recomputed amountPaid.
    const decorated = (await runAs(labId, () => billing.findOne(bill.id))) as any;
    expect(decorated.amountPaid).toBe(1000);
    expect(decorated.outstanding).toBe(0);
  });

  // ================================ create() — guards ================================

  it('create: rejects with NotFound when the bill does not exist', async () => {
    const labId = await makeLab();
    await expect(
      runAs(labId, () => payments.create({ billId: randomUUID(), amount: 100, type: PaymentType.Cash }, randomUUID())),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create: rejects a Draft bill (must be issued before it can be paid)', async () => {
    const labId = await makeLab();
    const bill = await seedBill(labId, BillStatus.Draft, { total: 1000 });
    await expect(
      runAs(labId, () => payments.create({ billId: bill.id, amount: 100, type: PaymentType.Cash }, randomUUID())),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create: rejects a payment against an already-Paid bill', async () => {
    const labId = await makeLab();
    const bill = await seedBill(labId, BillStatus.Paid, { total: 1000, amountPaid: 1000 });
    await expect(
      runAs(labId, () => payments.create({ billId: bill.id, amount: 100, type: PaymentType.Cash }, randomUUID())),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create: rejects an overpayment and writes nothing (single-call atomicity on guard rejection)', async () => {
    const labId = await makeLab();
    const bill = await seedBill(labId, BillStatus.PartiallyPaid, { total: 1000, amountPaid: 600 });

    await expect(
      runAs(labId, () => payments.create({ billId: bill.id, amount: 500, type: PaymentType.Cash }, randomUUID())), // outstanding is 400
    ).rejects.toBeInstanceOf(BadRequestException);

    // no payment row, no bill mutation.
    expect(await raw.payment.count({ where: { billId: bill.id } })).toBe(0);
    const after = await raw.bill.findUnique({ where: { id: bill.id } });
    expect(after!.amountPaid).toBe(600);
    expect(after!.status).toBe(BillStatus.PartiallyPaid);
  });

  it('create: an exact-outstanding payment on a PartiallyPaid bill settles it to Paid', async () => {
    const labId = await makeLab();
    const bill = await seedBill(labId, BillStatus.PartiallyPaid, { total: 1000, amountPaid: 600 });
    await seedPayment(labId, bill.id, { amount: 600 }); // the row backing the existing amountPaid

    await runAs(labId, () => payments.create({ billId: bill.id, amount: 400, type: PaymentType.Cash }, randomUUID()));

    const after = await raw.bill.findUnique({ where: { id: bill.id } });
    expect(after!.amountPaid).toBe(1000);
    expect(after!.status).toBe(BillStatus.Paid);
  });

  // ================================ create() — Records delegation ================================

  it('create: full settlement of a Billed record delegates the Billed->Paid transition to RecordsService', async () => {
    const labId = await makeLab();
    const record = await makeRecord(labId, { status: RecordStatus.Billed });
    const bill = await seedBill(labId, BillStatus.Issued, { total: 1000, recordId: record.id });
    const userId = randomUUID();

    await runAs(labId, () => payments.create({ billId: bill.id, amount: 1000, type: PaymentType.Cash }, userId));

    expect(recordsStub.updateStatus).toHaveBeenCalledTimes(1);
    expect(recordsStub.updateStatus).toHaveBeenCalledWith(record.id, userId, {
      status: RecordStatus.Paid,
      notes: 'Bill fully paid',
    });
  });

  it('create: full settlement does NOT advance a record that is not currently Billed', async () => {
    const labId = await makeLab();
    const record = await makeRecord(labId, { status: RecordStatus.Approved });
    const bill = await seedBill(labId, BillStatus.Issued, { total: 1000, recordId: record.id });

    await runAs(labId, () => payments.create({ billId: bill.id, amount: 1000, type: PaymentType.Cash }, randomUUID()));

    // bill still settles...
    const after = await raw.bill.findUnique({ where: { id: bill.id } });
    expect(after!.status).toBe(BillStatus.Paid);
    // ...but the record transition is not triggered (guarded by record.status === Billed).
    expect(recordsStub.updateStatus).not.toHaveBeenCalled();
  });

  // ================================ create() — notification ================================

  it('create: notifies payment:view holders on a received payment', async () => {
    const labId = await makeLab();
    const bill = await seedBill(labId, BillStatus.Issued, { total: 1000 });

    await runAs(labId, () => payments.create({ billId: bill.id, amount: 200, type: PaymentType.Cash }, randomUUID()));

    expect(notifsStub.notifyPermission).toHaveBeenCalledTimes(1);
    expect(notifsStub.notifyPermission).toHaveBeenCalledWith(
      'payment:view',
      expect.objectContaining({ type: NotificationType.PAYMENT_RECEIVED }),
    );
  });

  // ================================ findAll / paymentsForBill ================================

  it('findAll: paginates payments', async () => {
    const labId = await makeLab();
    const bill = await seedBill(labId, BillStatus.Issued);
    await seedPayment(labId, bill.id);
    await seedPayment(labId, bill.id);
    await seedPayment(labId, bill.id);

    const page = await runAs(labId, () => payments.findAll({ page: 1, pageSize: 2 }));
    expect(page.total).toBe(3);
    expect(page.data).toHaveLength(2);
  });

  it('findAll: filters by billId', async () => {
    const labId = await makeLab();
    const billA = await seedBill(labId, BillStatus.Issued);
    const billB = await seedBill(labId, BillStatus.Issued);
    await seedPayment(labId, billA.id);
    await seedPayment(labId, billB.id);

    const forA = await runAs(labId, () => payments.findAll({ billId: billA.id }));
    expect(forA.total).toBe(1);
    expect(forA.data.every((p) => p.billId === billA.id)).toBe(true);
  });

  it('paymentsForBill: returns only that bill’s payments', async () => {
    const labId = await makeLab();
    const billA = await seedBill(labId, BillStatus.Issued);
    const billB = await seedBill(labId, BillStatus.Issued);
    await seedPayment(labId, billA.id);
    await seedPayment(labId, billB.id);

    const forB = await runAs(labId, () => payments.paymentsForBill(billB.id, {}));
    expect(forB.total).toBe(1);
    expect(forB.data.every((p) => p.billId === billB.id)).toBe(true);
  });

  // ================================ summary() ================================

  it('summary: aggregates count, collected, and byType', async () => {
    const labId = await makeLab();
    const bill = await seedBill(labId, BillStatus.Issued);
    await seedPayment(labId, bill.id, { amount: 100, type: PaymentType.Cash });
    await seedPayment(labId, bill.id, { amount: 250, type: PaymentType.Cash });
    await seedPayment(labId, bill.id, { amount: 700, type: PaymentType.BankTransfer });

    const summary = await runAs(labId, () => payments.summary());
    expect(summary.count).toBe(3);
    expect(summary.collected).toBe(1050);
    const cash = summary.byType.find((t) => t.type === PaymentType.Cash);
    const transfer = summary.byType.find((t) => t.type === PaymentType.BankTransfer);
    expect(cash).toEqual({ type: PaymentType.Cash, count: 2, amount: 350 });
    expect(transfer).toEqual({ type: PaymentType.BankTransfer, count: 1, amount: 700 });
  });

  it('summary: an empty lab returns the frozen { count: 0, collected: 0, byType: [] } (byType is an array)', async () => {
    const labId = await makeLab();
    const summary = await runAs(labId, () => payments.summary());
    expect(summary).toEqual({ count: 0, collected: 0, byType: [] });
    expect(Array.isArray(summary.byType)).toBe(true);
  });

  // ================================ verify() ================================

  it('verify: flags a payment verified', async () => {
    const labId = await makeLab();
    const bill = await seedBill(labId, BillStatus.Issued);
    const payment = await seedPayment(labId, bill.id, { verified: false });

    const verified = await runAs(labId, () => payments.verify(payment.id));
    expect(verified.verified).toBe(true);
  });

  it('verify: is idempotent — verifying an already-verified payment stays verified with no error', async () => {
    const labId = await makeLab();
    const bill = await seedBill(labId, BillStatus.Issued);
    const payment = await seedPayment(labId, bill.id, { verified: false });

    await runAs(labId, () => payments.verify(payment.id));
    const second = await runAs(labId, () => payments.verify(payment.id));
    expect(second.verified).toBe(true);
  });

  it('verify: rejects with NotFound for an unknown id', async () => {
    const labId = await makeLab();
    await expect(runAs(labId, () => payments.verify(randomUUID()))).rejects.toBeInstanceOf(NotFoundException);
  });

  // ======================= cross-lab tenancy (frozen outcomes, design §4b) =======================

  it('tenancy: create on another lab’s bill fails NotFound before the tx and calls no collaborators', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const bill = await seedBill(labA, BillStatus.Issued, { total: 1000 });

    await expect(
      runAs(labB, () => payments.create({ billId: bill.id, amount: 100, type: PaymentType.Cash }, randomUUID())),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(await raw.payment.count({ where: { billId: bill.id } })).toBe(0);
    expect(recordsStub.updateStatus).not.toHaveBeenCalled();
    expect(notifsStub.notifyPermission).not.toHaveBeenCalled();
  });

  it('tenancy: findAll from lab B excludes lab A payments', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const billA = await seedBill(labA, BillStatus.Issued);
    const pA = await seedPayment(labA, billA.id);
    const billB = await seedBill(labB, BillStatus.Issued);
    await seedPayment(labB, billB.id);

    const fromB = await runAs(labB, () => payments.findAll({}));
    expect(fromB.total).toBe(1);
    expect(fromB.data.some((p) => p.id === pA.id)).toBe(false);
  });

  it('tenancy: summary from lab B excludes lab A totals', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const billA = await seedBill(labA, BillStatus.Issued);
    await seedPayment(labA, billA.id, { amount: 5000 });

    const fromB = await runAs(labB, () => payments.summary());
    expect(fromB).toEqual({ count: 0, collected: 0, byType: [] }); // lab A's 5000 does not leak
  });

  it('tenancy: verify cannot reach another lab’s payment (NotFound)', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const billA = await seedBill(labA, BillStatus.Issued);
    const pA = await seedPayment(labA, billA.id);
    await expect(runAs(labB, () => payments.verify(pA.id))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tenancy: a Payments read with no lab context fails closed (guard throws)', async () => {
    await expect(payments.findAll({})).rejects.toThrow(/no lab context/i);
  });
});
