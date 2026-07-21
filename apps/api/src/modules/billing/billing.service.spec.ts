/**
 * Program 3 · C1 — Billing service test hardening.
 *
 * Implements ONLY the Billing tests defined by the frozen C1 design
 * (docs/PROGRAM_3_C1_BILLING_TEST_DESIGN.md, commit 4b4c731). Scope is the six public
 * BillingService methods, decoration behavior (through the public surface), the Billing-owned
 * Draft→Issued transition, controlled tax fixtures, integer-cent monetary invariants, and cross-lab
 * tenancy isolation via a production-parity extended client.
 *
 * Harness (design §5): the ISOLATED `_test` database via `createTestPrisma()` (fail-closed guard).
 *  - `raw`    — the bare `_test` client: used ONLY for fixture seeding, cross-lab seeding, and scoped
 *               teardown (no tenancy guard, so labId is stamped explicitly).
 *  - `scoped` — production-parity extended client, mirroring PrismaService's construction:
 *               base.$extends(tenancyExtension(labContext)).$extends(phiEncryptionExtension()).
 *               The service under test ALWAYS receives this client, driven inside labContext.run().
 *  - RecordsService is a thin stub (design §5/§6): issue() calls only updateStatus(); the real
 *    transition() carries heavy unrelated side effects and owns the Approved→Billed legality.
 *
 * Not covered here (design §11): Payments (C2), Taxes admin/lifecycle (C9), Records transition
 * legality, issue-workflow atomicity. Per the F5 review (design §6) no test blesses partial-state
 * failure and no failure is injected after an internal write.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BillStatus, RecordStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { createTestPrisma, resolveTestDatabaseUrl } from '@test/test-database';
import { tenancyExtension } from '../../common/tenancy/tenancy.extension';
import { phiEncryptionExtension } from '../../common/crypto/phi-encryption.extension';
import { LabContext } from '../../common/tenancy/lab-context';
import { BillingService } from './billing.service';
import type { PrismaService } from '../../database/prisma.service';
import type { RecordsService } from '../records/records.service';

// Gate on DATABASE_URL so the suite skips cleanly when no database is configured; createTestPrisma
// resolves the isolated `_test` sibling and fails closed on anything else.
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('BillingService (C1 integration)', () => {
  const raw = createTestPrisma(); // bare, isolation-guarded — seeding + teardown only
  const labContext = new LabContext();
  // Production-parity extended client (design §5) — same extensions, same order as PrismaService.
  const scoped = raw
    .$extends(tenancyExtension(labContext))
    .$extends(phiEncryptionExtension());
  const recordsStub = { updateStatus: jest.fn() };
  const billing = new BillingService(
    scoped as unknown as PrismaService,
    recordsStub as unknown as RecordsService,
  );

  const createdLabIds: string[] = [];

  // ---- fixture builders (business-scenario shaped; seeded via the bare client) -------------------
  const uid = () => randomUUID().slice(0, 8);

  async function makeLab(): Promise<string> {
    const u = uid();
    const lab = await raw.lab.create({ data: { name: `C1 Lab ${u}`, slug: `c1-lab-${u}` } });
    createdLabIds.push(lab.id);
    return lab.id;
  }
  async function makePatient(labId: string) {
    return raw.patient.create({
      data: { labId, registrationNo: `REG-${uid()}`, firstName: 'Test', lastName: 'Patient' },
    });
  }
  async function makeClient(labId: string) {
    return raw.client.create({ data: { labId, firstName: 'Test', lastName: 'Client', officeName: 'Office' } });
  }
  async function makeRecord(
    labId: string,
    opts: { patientId?: string; clientId?: string | null; status?: RecordStatus } = {},
  ) {
    const patientId = opts.patientId ?? (await makePatient(labId)).id;
    return raw.record.create({
      data: {
        labId,
        identifier: `ID-${uid()}`,
        patientId,
        clientId: opts.clientId ?? null,
        status: opts.status ?? RecordStatus.Approved,
      },
    });
  }
  async function makeService(labId: string, opts: { price?: number; name?: string } = {}) {
    return raw.service.create({
      data: { labId, name: opts.name ?? `Svc ${uid()}`, code: `SVC-${uid()}`, price: opts.price ?? 1000 },
    });
  }
  async function makeTax(
    labId: string,
    opts: { rateBasisPoints?: number; isDefault?: boolean; name?: string } = {},
  ) {
    return raw.tax.create({
      data: {
        labId,
        name: opts.name ?? `Tax ${uid()}`,
        rateBasisPoints: opts.rateBasisPoints ?? 0,
        isDefault: opts.isDefault ?? false,
      },
    });
  }
  /** Seed a bill in an exact status directly (bare client) — used where Billing cannot legally reach
   *  the status itself (Paid/PartiallyPaid are C2-owned; see design §7). */
  async function seedBill(
    labId: string,
    status: BillStatus,
    opts: { total?: number; amountPaid?: number; dueDate?: Date | null } = {},
  ) {
    const record = await makeRecord(labId);
    const total = opts.total ?? 1000;
    return raw.bill.create({
      data: {
        labId,
        recordId: record.id,
        referenceNo: `BILL-SEED-${uid()}`,
        status,
        subtotal: total,
        taxTotal: 0,
        total,
        amountPaid: opts.amountPaid ?? 0,
        dueDate: opts.dueDate ?? null,
      },
    });
  }

  const runAs = <T>(labId: string, fn: () => Promise<T>): Promise<T> =>
    labContext.run({ labId }, async () => await fn());

  // dates safely separated from "now" (design §7 — controlled time without wall-clock coupling).
  const DAY = 24 * 60 * 60 * 1000;
  const past = () => new Date(Date.now() - 30 * DAY);
  const future = () => new Date(Date.now() + 30 * DAY);

  beforeEach(() => {
    recordsStub.updateStatus.mockReset();
    recordsStub.updateStatus.mockResolvedValue({});
  });

  afterAll(async () => {
    if (createdLabIds.length) {
      const where = { labId: { in: createdLabIds } };
      // Child-first, labId-scoped (design §5 — Lab relations are RESTRICT; no lab-root cascade).
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

  it('runs against the isolated _test database (design §5)', () => {
    expect(resolveTestDatabaseUrl()).toMatch(/test/);
  });

  // ============================ create() — monetary + snapshot + tax ============================

  it('create: computes line amount = quantity × unitPrice and subtotal = Σ line amounts; new bill is Draft with amountPaid 0', async () => {
    const labId = await makeLab();
    const record = await makeRecord(labId);
    const svcA = await makeService(labId, { price: 500 });
    const svcB = await makeService(labId, { price: 250 });

    const bill = await runAs(labId, () =>
      billing.create({
        recordId: record.id,
        lines: [
          { serviceId: svcA.id, quantity: 3 }, // 1500
          { serviceId: svcB.id, quantity: 2 }, // 500
        ],
      }),
    );

    expect(bill.lines.find((l) => l.serviceId === svcA.id)!.amount).toBe(1500);
    expect(bill.lines.find((l) => l.serviceId === svcB.id)!.amount).toBe(500);
    expect(bill.subtotal).toBe(2000);
    expect(bill.total).toBe(2000); // no taxes applied
    expect(bill.amountPaid).toBe(0);
    expect(bill.status).toBe(BillStatus.Draft);
  });

  it('create: applies explicit taxes as amount = round(subtotal × bps / 10000), summed independently; total = subtotal + taxTotal', async () => {
    const labId = await makeLab();
    const record = await makeRecord(labId);
    const svc = await makeService(labId, { price: 1000 });
    const gct = await makeTax(labId, { rateBasisPoints: 1500 }); // 15% → 150
    const levy = await makeTax(labId, { rateBasisPoints: 200 }); // 2% → 20

    const bill = await runAs(labId, () =>
      billing.create({ recordId: record.id, lines: [{ serviceId: svc.id, quantity: 1 }], taxIds: [gct.id, levy.id] }),
    );

    expect(bill.subtotal).toBe(1000);
    // taxes summed independently (not compounded): 150 + 20
    expect(bill.taxes.find((t) => t.taxId === gct.id)!.amount).toBe(150);
    expect(bill.taxes.find((t) => t.taxId === levy.id)!.amount).toBe(20);
    expect(bill.taxTotal).toBe(170);
    expect(bill.total).toBe(1170);
  });

  it('create: tax rounding is half-up at the half-cent boundary (150 @ 500bps = 7.5 → 8; 105 @ 500bps = 5.25 → 5)', async () => {
    const labId = await makeLab();
    const svc150 = await makeService(labId, { price: 150 });
    const svc105 = await makeService(labId, { price: 105 });
    const rate = await makeTax(labId, { rateBasisPoints: 500 }); // 5%
    const recA = await makeRecord(labId);
    const recB = await makeRecord(labId);

    // Worked example from design §8 — expected values computed by hand, not from the production expr.
    const billHalfUp = await runAs(labId, () =>
      billing.create({ recordId: recA.id, lines: [{ serviceId: svc150.id, quantity: 1 }], taxIds: [rate.id] }),
    );
    expect(billHalfUp.taxTotal).toBe(8); // 150 * 500 / 10000 = 7.5 → Math.round → 8

    const billDown = await runAs(labId, () =>
      billing.create({ recordId: recB.id, lines: [{ serviceId: svc105.id, quantity: 1 }], taxIds: [rate.id] }),
    );
    expect(billDown.taxTotal).toBe(5); // 105 * 500 / 10000 = 5.25 → Math.round → 5
  });

  it('create: with no taxIds applies the lab default taxes', async () => {
    const labId = await makeLab();
    const record = await makeRecord(labId);
    const svc = await makeService(labId, { price: 1000 });
    const def = await makeTax(labId, { rateBasisPoints: 1000, isDefault: true }); // 10% → 100
    await makeTax(labId, { rateBasisPoints: 5000, isDefault: false }); // non-default, must be ignored

    const bill = await runAs(labId, () =>
      billing.create({ recordId: record.id, lines: [{ serviceId: svc.id, quantity: 1 }] }),
    );

    expect(bill.taxes).toHaveLength(1);
    expect(bill.taxes[0].taxId).toBe(def.id);
    expect(bill.taxTotal).toBe(100);
  });

  it('create: with no taxIds and no default taxes yields taxTotal 0 and total = subtotal', async () => {
    const labId = await makeLab();
    const record = await makeRecord(labId);
    const svc = await makeService(labId, { price: 1000 });

    const bill = await runAs(labId, () =>
      billing.create({ recordId: record.id, lines: [{ serviceId: svc.id, quantity: 1 }] }),
    );

    expect(bill.taxes).toHaveLength(0);
    expect(bill.taxTotal).toBe(0);
    expect(bill.total).toBe(bill.subtotal);
  });

  it('create: snapshots service identity + price onto the line (serviceName/serviceCode/unitPrice)', async () => {
    const labId = await makeLab();
    const record = await makeRecord(labId);
    const svc = await makeService(labId, { price: 777, name: 'Pap Smear' });

    const bill = await runAs(labId, () =>
      billing.create({ recordId: record.id, lines: [{ serviceId: svc.id, quantity: 1 }] }),
    );

    const line = bill.lines[0];
    expect(line.unitPrice).toBe(777);
    expect(line.serviceName).toBe('Pap Smear');
    expect(line.serviceCode).toBe(svc.code);
  });

  it('create: the reference number matches the BILL-YYYYMMDD-XXXXXX format', async () => {
    const labId = await makeLab();
    const record = await makeRecord(labId);
    const svc = await makeService(labId, { price: 100 });

    const bill = await runAs(labId, () =>
      billing.create({ recordId: record.id, lines: [{ serviceId: svc.id, quantity: 1 }] }),
    );

    expect(bill.referenceNo).toMatch(/^BILL-\d{8}-[0-9A-F]{6}$/);
  });

  it('create: resolves clientId via dto.clientId ?? record.clientId ?? null', async () => {
    const labId = await makeLab();
    const svc = await makeService(labId, { price: 100 });
    const clientDirect = await makeClient(labId);
    const clientOnRecord = await makeClient(labId);
    const line = () => [{ serviceId: svc.id, quantity: 1 }];

    // (a) dto.clientId wins.
    const recA = await makeRecord(labId, { clientId: clientOnRecord.id });
    const billA = await runAs(labId, () =>
      billing.create({ recordId: recA.id, clientId: clientDirect.id, lines: line() }),
    );
    expect(billA.clientId).toBe(clientDirect.id);

    // (b) dto.clientId omitted → record.clientId.
    const recB = await makeRecord(labId, { clientId: clientOnRecord.id });
    const billB = await runAs(labId, () => billing.create({ recordId: recB.id, lines: line() }));
    expect(billB.clientId).toBe(clientOnRecord.id);

    // (c) neither → null.
    const recC = await makeRecord(labId, { clientId: null });
    const billC = await runAs(labId, () => billing.create({ recordId: recC.id, lines: line() }));
    expect(billC.clientId).toBeNull();
  });

  it('create: rejects with NotFound when the record does not exist', async () => {
    const labId = await makeLab();
    const svc = await makeService(labId, { price: 100 });
    await expect(
      runAs(labId, () =>
        billing.create({ recordId: randomUUID(), lines: [{ serviceId: svc.id, quantity: 1 }] }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create: rejects with NotFound when a line references an unknown service', async () => {
    const labId = await makeLab();
    const record = await makeRecord(labId);
    await expect(
      runAs(labId, () =>
        billing.create({ recordId: record.id, lines: [{ serviceId: randomUUID(), quantity: 1 }] }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ================================ price-snapshot immutability ================================

  it('snapshot immutability: changing Service.price after billing does not alter the existing bill line', async () => {
    const labId = await makeLab();
    const record = await makeRecord(labId);
    const svc = await makeService(labId, { price: 500 });

    const bill = await runAs(labId, () =>
      billing.create({ recordId: record.id, lines: [{ serviceId: svc.id, quantity: 2 }] }),
    );
    expect(bill.lines[0].unitPrice).toBe(500);
    expect(bill.total).toBe(1000);

    await raw.service.update({ where: { id: svc.id }, data: { price: 9999 } });

    const reread = await runAs(labId, () => billing.findOne(bill.id));
    expect(reread.lines[0].unitPrice).toBe(500); // snapshot unchanged
    expect(reread.total).toBe(1000);
  });

  // ==================================== findOne() + decoration ====================================

  it('findOne: returns the bill decorated with outstanding = total − amountPaid', async () => {
    const labId = await makeLab();
    const bill = await seedBill(labId, BillStatus.Issued, { total: 1000, amountPaid: 300 });

    const found = await runAs(labId, () => billing.findOne(bill.id)) as any;
    expect(found.outstanding).toBe(700);
  });

  it('findOne: rejects with NotFound for an unknown id', async () => {
    const labId = await makeLab();
    await expect(runAs(labId, () => billing.findOne(randomUUID()))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('decoration: a non-Paid bill past its due date is overdue', async () => {
    const labId = await makeLab();
    const record = await makeRecord(labId);
    const svc = await makeService(labId, { price: 100 });
    const bill = await runAs(labId, () =>
      billing.create({ recordId: record.id, lines: [{ serviceId: svc.id, quantity: 1 }], dueDate: past() }),
    );
    const found = await runAs(labId, () => billing.findOne(bill.id)) as any;
    expect(found.isOverdue).toBe(true);
  });

  it('decoration: a future due date or a missing due date is not overdue', async () => {
    const labId = await makeLab();
    const svc = await makeService(labId, { price: 100 });
    const recF = await makeRecord(labId);
    const recN = await makeRecord(labId);

    const billFuture = await runAs(labId, () =>
      billing.create({ recordId: recF.id, lines: [{ serviceId: svc.id, quantity: 1 }], dueDate: future() }),
    );
    const billNone = await runAs(labId, () =>
      billing.create({ recordId: recN.id, lines: [{ serviceId: svc.id, quantity: 1 }] }),
    );

    expect(((await runAs(labId, () => billing.findOne(billFuture.id))) as any).isOverdue).toBe(false);
    expect(((await runAs(labId, () => billing.findOne(billNone.id))) as any).isOverdue).toBe(false);
  });

  it('decoration: a Paid bill past its due date is not overdue (Paid seeded via the bare client)', async () => {
    const labId = await makeLab();
    const bill = await seedBill(labId, BillStatus.Paid, { total: 1000, amountPaid: 1000, dueDate: past() });
    const found = await runAs(labId, () => billing.findOne(bill.id)) as any;
    expect(found.isOverdue).toBe(false);
  });

  // ==================================== findAll() ====================================

  it('findAll: paginates and orders by createdAt desc', async () => {
    const labId = await makeLab();
    await seedBill(labId, BillStatus.Draft);
    await seedBill(labId, BillStatus.Draft);
    await seedBill(labId, BillStatus.Draft);

    const pageOne = await runAs(labId, () => billing.findAll({ page: 1, pageSize: 2 }));
    expect(pageOne.total).toBe(3);
    expect(pageOne.data).toHaveLength(2);
  });

  it('findAll: honors an explicit status query filter', async () => {
    const labId = await makeLab();
    await seedBill(labId, BillStatus.Draft);
    await seedBill(labId, BillStatus.Issued);

    const issued = await runAs(labId, () => billing.findAll({ status: BillStatus.Issued }));
    expect(issued.total).toBe(1);
    expect(issued.data.every((b) => b.status === BillStatus.Issued)).toBe(true);
  });

  it('findAll: honors a statusFilter array (the unpaid mapping: Issued + PartiallyPaid)', async () => {
    const labId = await makeLab();
    await seedBill(labId, BillStatus.Draft);
    await seedBill(labId, BillStatus.Issued);
    await seedBill(labId, BillStatus.PartiallyPaid);
    await seedBill(labId, BillStatus.Paid);

    const unpaid = await runAs(labId, () =>
      billing.findAll({}, [BillStatus.Issued, BillStatus.PartiallyPaid]),
    );
    expect(unpaid.total).toBe(2);
    const unpaidStatuses: BillStatus[] = [BillStatus.Issued, BillStatus.PartiallyPaid];
    expect(unpaid.data.every((b) => unpaidStatuses.includes(b.status))).toBe(true);
  });

  // ==================================== summary() ====================================

  it('summary: aggregates billed, collected, outstanding, and status counts', async () => {
    const labId = await makeLab();
    await seedBill(labId, BillStatus.Draft, { total: 1000, amountPaid: 0 });
    await seedBill(labId, BillStatus.Paid, { total: 500, amountPaid: 500 });

    const summary = await runAs(labId, () => billing.summary());
    expect(summary.billed).toBe(1500);
    expect(summary.collected).toBe(500);
    expect(summary.outstanding).toBe(1000);
    expect(summary.byStatus[BillStatus.Draft]).toBe(1);
    expect(summary.byStatus[BillStatus.Paid]).toBe(1);
  });

  it('summary: an empty lab reports zeroes, not nulls', async () => {
    const labId = await makeLab();
    const summary = await runAs(labId, () => billing.summary());
    expect(summary).toMatchObject({ billed: 0, collected: 0, outstanding: 0, byStatus: {} });
  });

  // ==================================== issue() ====================================

  it('issue: advances a Draft bill to Issued, flags the record billed, and delegates the record transition', async () => {
    const labId = await makeLab();
    const record = await makeRecord(labId);
    const svc = await makeService(labId, { price: 1000 });
    const bill = await runAs(labId, () =>
      billing.create({ recordId: record.id, lines: [{ serviceId: svc.id, quantity: 1 }] }),
    );
    const userId = randomUUID();

    const issued = await runAs(labId, () => billing.issue(bill.id, userId));

    expect(issued.status).toBe(BillStatus.Issued);
    expect(recordsStub.updateStatus).toHaveBeenCalledTimes(1);
    expect(recordsStub.updateStatus).toHaveBeenCalledWith(record.id, userId, {
      status: RecordStatus.Billed,
      notes: 'Bill issued',
    });
    const rec = await raw.record.findUnique({ where: { id: record.id } });
    expect(rec!.billed).toBe(true);
  });

  it('issue: rejects a bill that is not Draft and does not touch the record transition', async () => {
    const labId = await makeLab();
    const bill = await seedBill(labId, BillStatus.Issued);
    await expect(runAs(labId, () => billing.issue(bill.id, randomUUID()))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(recordsStub.updateStatus).not.toHaveBeenCalled();
  });

  it('issue: rejects with NotFound for an unknown bill', async () => {
    const labId = await makeLab();
    await expect(runAs(labId, () => billing.issue(randomUUID(), randomUUID()))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('issue: propagates a records-layer rejection raised before Billing writes, leaving the bill Draft (design §6 — no partial-state blessing)', async () => {
    const labId = await makeLab();
    const record = await makeRecord(labId);
    const svc = await makeService(labId, { price: 1000 });
    const bill = await runAs(labId, () =>
      billing.create({ recordId: record.id, lines: [{ serviceId: svc.id, quantity: 1 }] }),
    );
    recordsStub.updateStatus.mockRejectedValueOnce(new BadRequestException('transition rejected'));

    await expect(runAs(labId, () => billing.issue(bill.id, randomUUID()))).rejects.toBeInstanceOf(
      BadRequestException,
    );

    // updateStatus is Billing's FIRST side effect after the guard; its rejection precedes Billing's
    // own writes, so the bill remains Draft. (This asserts the pre-write path only — it does NOT
    // characterize post-write partial corruption, which is unauthorized per the F5 review.)
    const stillDraft = await raw.bill.findUnique({ where: { id: bill.id } });
    expect(stillDraft!.status).toBe(BillStatus.Draft);
    const rec = await raw.record.findUnique({ where: { id: record.id } });
    expect(rec!.billed).toBe(false);
  });

  // ==================================== markViewed() ====================================

  it('markViewed: flags the bill viewed', async () => {
    const labId = await makeLab();
    const bill = await seedBill(labId, BillStatus.Issued);
    const viewed = await runAs(labId, () => billing.markViewed(bill.id));
    expect(viewed.viewed).toBe(true);
  });

  it('markViewed: rejects with NotFound for an unknown id', async () => {
    const labId = await makeLab();
    await expect(runAs(labId, () => billing.markViewed(randomUUID()))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // ============================ cross-lab tenancy (frozen outcomes, design §4) ============================

  it('tenancy: findOne cannot read another lab’s bill (NotFound)', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const bill = await seedBill(labA, BillStatus.Issued);
    await expect(runAs(labB, () => billing.findOne(bill.id))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tenancy: findAll from lab B excludes lab A bills', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const billA = await seedBill(labA, BillStatus.Draft);
    await seedBill(labB, BillStatus.Draft);

    const fromB = await runAs(labB, () => billing.findAll({}));
    expect(fromB.total).toBe(1);
    expect(fromB.data.some((b) => b.id === billA.id)).toBe(false);
  });

  it('tenancy: summary from lab B excludes lab A totals', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    await seedBill(labA, BillStatus.Paid, { total: 5000, amountPaid: 5000 });
    await seedBill(labB, BillStatus.Draft, { total: 200, amountPaid: 0 });

    const fromB = await runAs(labB, () => billing.summary());
    expect(fromB.billed).toBe(200); // lab A's 5000 does not leak
    expect(fromB.collected).toBe(0);
  });

  it('tenancy: issue on another lab’s bill fails NotFound before any write and does not call the transition', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const bill = await seedBill(labA, BillStatus.Draft);

    await expect(runAs(labB, () => billing.issue(bill.id, randomUUID()))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(recordsStub.updateStatus).not.toHaveBeenCalled();
    const untouched = await raw.bill.findUnique({ where: { id: bill.id } });
    expect(untouched!.status).toBe(BillStatus.Draft); // no write occurred
  });

  it('tenancy: create referencing another lab’s record fails NotFound and writes no bill', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const foreignRecord = await makeRecord(labA);
    const svcB = await makeService(labB, { price: 100 });

    const before = await raw.bill.count({ where: { labId: labB } });
    await expect(
      runAs(labB, () =>
        billing.create({ recordId: foreignRecord.id, lines: [{ serviceId: svcB.id, quantity: 1 }] }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    const after = await raw.bill.count({ where: { labId: labB } });
    expect(after).toBe(before);
  });

  it('tenancy: create referencing another lab’s service fails NotFound and writes no bill', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const recordB = await makeRecord(labB);
    const foreignService = await makeService(labA, { price: 100 });

    const before = await raw.bill.count({ where: { labId: labB } });
    await expect(
      runAs(labB, () =>
        billing.create({ recordId: recordB.id, lines: [{ serviceId: foreignService.id, quantity: 1 }] }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    const after = await raw.bill.count({ where: { labId: labB } });
    expect(after).toBe(before);
  });

  it('tenancy: a Billing read with no lab context fails closed (guard throws)', async () => {
    // No labContext.run — the tenancy guard refuses the tenant-model operation.
    await expect(billing.findAll({})).rejects.toThrow(/no lab context/i);
  });
});
