/**
 * Program 3 · C9 — Taxes service integration + tenancy suite.
 *
 * Implements ONLY the tests defined by the frozen C9 design
 * (docs/PROGRAM_3_C9_TAXES_TEST_DESIGN.md, commit 8d9aa26). Reuses the C1–C8 production-parity `_test`
 * harness (compose the production extensions over `createTestPrisma`; never `new PrismaService`).
 * Taxes injects only `PrismaService` — no collaborators to stub.
 *
 * Frozen scope (C9 rulings): verifies the Taxes-owned CRUD + tenancy IMPLEMENTATION TRUTH only.
 * EXCLUDED — Billing tax calculations, BillTax snapshot preservation, Service↔Tax linkage,
 * transactions, scheduler, audit, pure-unit. SD-1 (multiple defaults), SD-2 (no rate ceiling), SD-3
 * (hard delete) are characterized as CURRENT behavior and NOT normalized.
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createTestPrisma, resolveTestDatabaseUrl } from '@test/test-database';
import { tenancyExtension } from '../../common/tenancy/tenancy.extension';
import { phiEncryptionExtension } from '../../common/crypto/phi-encryption.extension';
import { LabContext } from '../../common/tenancy/lab-context';
import { TaxesService } from './taxes.service';
import type { PrismaService } from '../../database/prisma.service';

const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('TaxesService (C9 integration)', () => {
  const raw = createTestPrisma();
  const labContext = new LabContext();
  const scoped = raw.$extends(tenancyExtension(labContext)).$extends(phiEncryptionExtension());
  const taxes = new TaxesService(scoped as unknown as PrismaService);

  const createdLabIds: string[] = [];
  const uid = () => randomUUID().slice(0, 8);

  async function makeLab(): Promise<string> {
    const u = uid();
    const lab = await raw.lab.create({ data: { name: `C9 Lab ${u}`, slug: `c9-lab-${u}` } });
    createdLabIds.push(lab.id);
    return lab.id;
  }
  async function makeTax(
    labId: string,
    opts: { name?: string; code?: string; rateBasisPoints?: number; isDefault?: boolean } = {},
  ) {
    return raw.tax.create({
      data: {
        labId,
        name: opts.name ?? `Tax-${uid()}`,
        code: opts.code,
        rateBasisPoints: opts.rateBasisPoints ?? 1500,
        isDefault: opts.isDefault ?? false,
      },
    });
  }

  const runAs = <T>(labId: string, fn: () => Promise<T>): Promise<T> =>
    labContext.run({ labId }, async () => await fn());

  afterAll(async () => {
    if (createdLabIds.length) {
      const where = { labId: { in: createdLabIds } };
      await raw.tax.deleteMany({ where }); // child-first, labId-scoped: Tax → Lab
      await raw.lab.deleteMany({ where: { id: { in: createdLabIds } } });
    }
    await raw.$disconnect();
  });

  it('runs against the isolated _test database', () => {
    expect(resolveTestDatabaseUrl()).toMatch(/test/);
  });

  // ================================ create ================================

  it('create: persists a lab-scoped tax with rateBasisPoints + isDefault', async () => {
    const labId = await makeLab();
    const created = await runAs(labId, () =>
      taxes.create({ name: 'GCT', code: 'GCT', rateBasisPoints: 1500, isDefault: true }),
    );
    expect(created).toMatchObject({ labId, name: 'GCT', code: 'GCT', rateBasisPoints: 1500, isDefault: true });
    const persisted = await raw.tax.findUnique({ where: { id: created.id } });
    expect(persisted?.rateBasisPoints).toBe(1500);
    expect(persisted?.isDefault).toBe(true);
  });

  it('create: a duplicate name within the SAME lab → Conflict', async () => {
    const labId = await makeLab();
    await runAs(labId, () => taxes.create({ name: 'VAT', rateBasisPoints: 100 }));
    await expect(runAs(labId, () => taxes.create({ name: 'VAT', rateBasisPoints: 200 }))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  // ================================ update ================================

  it('update: mutates name / rateBasisPoints / isDefault in place', async () => {
    const labId = await makeLab();
    const tax = await makeTax(labId, { name: 'Old', rateBasisPoints: 1000, isDefault: false });
    const updated = await runAs(labId, () => taxes.update(tax.id, { name: 'New', rateBasisPoints: 1750, isDefault: true }));
    expect(updated).toMatchObject({ name: 'New', rateBasisPoints: 1750, isDefault: true });
  });

  it('update: unknown id → NotFound', async () => {
    const labId = await makeLab();
    await expect(runAs(labId, () => taxes.update(randomUUID(), { name: 'x' }))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update: renaming onto an existing name in the lab → Conflict', async () => {
    const labId = await makeLab();
    await makeTax(labId, { name: 'A' });
    const b = await makeTax(labId, { name: 'B' });
    await expect(runAs(labId, () => taxes.update(b.id, { name: 'A' }))).rejects.toBeInstanceOf(ConflictException);
  });

  // ================================ remove ================================

  it('remove: hard-deletes and returns { deleted: true }', async () => {
    const labId = await makeLab();
    const tax = await makeTax(labId, {});
    const result = await runAs(labId, () => taxes.remove(tax.id));
    expect(result).toEqual({ deleted: true });
    expect(await raw.tax.findUnique({ where: { id: tax.id } })).toBeNull();
  });

  it('remove: unknown id → NotFound', async () => {
    const labId = await makeLab();
    await expect(runAs(labId, () => taxes.remove(randomUUID()))).rejects.toBeInstanceOf(NotFoundException);
  });

  // ================================ findAll ================================

  it('findAll: returns the lab’s taxes ordered by name', async () => {
    const labId = await makeLab();
    await makeTax(labId, { name: 'Zeta' });
    await makeTax(labId, { name: 'Alpha' });
    await makeTax(labId, { name: 'Mu' });
    const list = await runAs(labId, () => taxes.findAll());
    expect(list.map((t) => t.name)).toEqual(['Alpha', 'Mu', 'Zeta']);
  });

  // ============ current isDefault behavior — SD-1 (documented, NOT normalized) ============

  it('isDefault: MULTIPLE defaults are allowed — CURRENT behavior (SD-1), not endorsed', async () => {
    const labId = await makeLab();
    await runAs(labId, () => taxes.create({ name: 'D1', rateBasisPoints: 100, isDefault: true }));
    await runAs(labId, () => taxes.create({ name: 'D2', rateBasisPoints: 200, isDefault: true }));
    const defaults = (await runAs(labId, () => taxes.findAll())).filter((t) => t.isDefault);
    expect(defaults).toHaveLength(2); // setting a new default does NOT unset the prior one
  });

  // ============ current rateBasisPoints behavior — SD-2 (persistence only, no upper limit) ============

  it('rateBasisPoints: persisted as-is on create and update (no upper limit asserted — SD-2)', async () => {
    const labId = await makeLab();
    const created = await runAs(labId, () => taxes.create({ name: 'Rate', rateBasisPoints: 0 }));
    expect(created.rateBasisPoints).toBe(0);
    const updated = await runAs(labId, () => taxes.update(created.id, { rateBasisPoints: 1250 }));
    expect(updated.rateBasisPoints).toBe(1250);
  });

  // ================================ tenancy ================================

  it('tenancy: update / remove cannot reach another lab’s tax → NotFound', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const tax = await makeTax(labA, {});
    await expect(runAs(labB, () => taxes.update(tax.id, { name: 'x' }))).rejects.toBeInstanceOf(NotFoundException);
    await expect(runAs(labB, () => taxes.remove(tax.id))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tenancy: findAll from lab B excludes lab A’s taxes', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const taxA = await makeTax(labA, {});
    const fromB = await runAs(labB, () => taxes.findAll());
    expect(fromB.some((t) => t.id === taxA.id)).toBe(false);
  });

  it('tenancy: the same tax name in two different labs both succeed (per-lab uniqueness)', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const a = await runAs(labA, () => taxes.create({ name: 'Shared', rateBasisPoints: 100 }));
    const b = await runAs(labB, () => taxes.create({ name: 'Shared', rateBasisPoints: 100 }));
    expect(a.name).toBe('Shared');
    expect(b.name).toBe('Shared');
    expect(a.labId).not.toBe(b.labId);
  });

  it('tenancy: an operation with no lab context fails closed (guard throws)', async () => {
    await expect(taxes.findAll()).rejects.toThrow(/no lab context/i);
  });
});
