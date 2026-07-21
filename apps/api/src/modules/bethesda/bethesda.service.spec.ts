/**
 * Program 3 · C7 — Bethesda service integration + delegation + tenancy suite.
 *
 * Implements ONLY the tests defined by the frozen C7 design
 * (docs/PROGRAM_3_C7_BETHESDA_TEST_DESIGN.md, commit 490c862). Reuses the C1-C6 production-parity `_test`
 * harness. Collaborators EscalationService + RecallService are STUBBED — only delegation is verified,
 * never their behavior (Recall internals are C4-closed; Escalation is a separate module).
 *
 * SD governance (frozen): SD-1 — no transaction/partial-failure blessing (successful orchestration only);
 * SD-2 — overwrite is characterized as CURRENT implementation behavior, not the desired long-term
 * contract. No external-integration or scheduler tests (neither exists).
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createTestPrisma, resolveTestDatabaseUrl } from '@test/test-database';
import { tenancyExtension } from '../../common/tenancy/tenancy.extension';
import { phiEncryptionExtension } from '../../common/crypto/phi-encryption.extension';
import { LabContext } from '../../common/tenancy/lab-context';
import { BethesdaService } from './bethesda.service';
import type { PrismaService } from '../../database/prisma.service';
import type { EscalationService } from '../escalation/escalation.service';
import type { RecallService } from '../recall/recall.service';
import type { UpsertBethesdaResultDto } from './dto/bethesda.dto';

const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('BethesdaService (C7 integration)', () => {
  const raw = createTestPrisma();
  const labContext = new LabContext();
  const scoped = raw.$extends(tenancyExtension(labContext)).$extends(phiEncryptionExtension());
  const escalationStub = { evaluateRecord: jest.fn() };
  const recallStub = { autoCreateFromBethesda: jest.fn() };
  const bethesda = new BethesdaService(
    scoped as unknown as PrismaService,
    escalationStub as unknown as EscalationService,
    recallStub as unknown as RecallService,
  );

  const createdLabIds: string[] = [];
  const uid = () => randomUUID().slice(0, 8);

  async function makeLab(): Promise<string> {
    const u = uid();
    const lab = await raw.lab.create({ data: { name: `C7 Lab ${u}`, slug: `c7-lab-${u}` } });
    createdLabIds.push(lab.id);
    return lab.id;
  }
  async function makeUser(labId: string): Promise<string> {
    const account = await raw.account.create({ data: { labId, name: `Acct ${uid()}` } });
    const user = await raw.user.create({
      data: { labId, accountId: account.id, email: `${uid()}@ex.test`, passwordHash: 'x', firstName: 'Cyto', lastName: uid().slice(0, 4) },
    });
    return user.id;
  }
  async function makeRecord(labId: string) {
    const patient = await raw.patient.create({ data: { labId, registrationNo: `REG-${uid()}`, firstName: 'Test', lastName: 'Patient' } });
    return raw.record.create({ data: { labId, identifier: `ID-${uid()}`, patientId: patient.id } });
  }

  const NILM: UpsertBethesdaResultDto = { specimenAdequacy: 'Satisfactory', generalCategory: 'NILM' };
  const runAs = <T>(labId: string, fn: () => Promise<T>): Promise<T> =>
    labContext.run({ labId }, async () => await fn());

  beforeEach(() => {
    escalationStub.evaluateRecord.mockReset();
    escalationStub.evaluateRecord.mockResolvedValue(undefined);
    recallStub.autoCreateFromBethesda.mockReset();
    recallStub.autoCreateFromBethesda.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    if (createdLabIds.length) {
      const where = { labId: { in: createdLabIds } };
      await raw.bethesdaResult.deleteMany({ where });
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

  // ================================ upsert ================================

  it('upsert: creates a result, persists the narrative, and returns the derived short code', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const record = await makeRecord(labId);

    const result = await runAs(labId, () => bethesda.upsert(record.id, NILM, user));
    expect(result.shortCode).toBe('NILM');
    const row = await raw.bethesdaResult.findUnique({ where: { recordId: record.id } });
    expect(row?.specimenAdequacy).toBe('Satisfactory');
    expect(row?.generatedNarrative).toContain('GENERAL CATEGORIZATION');
  });

  it('upsert: a second upsert OVERWRITES the single result (current implementation behavior — no history, SD-2)', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const record = await makeRecord(labId);
    await runAs(labId, () => bethesda.upsert(record.id, NILM, user));
    const updated = await runAs(labId, () =>
      bethesda.upsert(record.id, { specimenAdequacy: 'Satisfactory', generalCategory: 'EpithelialAbnormality', squamousCategory: 'LSIL' }, user),
    );
    // one row per record; the prior NILM classification is replaced (documents overwrite, not a contract).
    expect(await raw.bethesdaResult.count({ where: { recordId: record.id } })).toBe(1);
    expect(updated.shortCode).toBe('LSIL');
  });

  it('upsert: a Satisfactory specimen without a general category → BadRequest', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const record = await makeRecord(labId);
    await expect(runAs(labId, () => bethesda.upsert(record.id, { specimenAdequacy: 'Satisfactory' }, user))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('upsert: an unknown record → NotFound', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    await expect(runAs(labId, () => bethesda.upsert(randomUUID(), NILM, user))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('upsert: delegates to Escalation and Recall with the record id (delegation only)', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const record = await makeRecord(labId);
    await runAs(labId, () => bethesda.upsert(record.id, NILM, user));
    expect(escalationStub.evaluateRecord).toHaveBeenCalledWith(record.id);
    expect(recallStub.autoCreateFromBethesda).toHaveBeenCalledWith(record.id);
  });

  // ================================ getByRecord / remove ================================

  it('getByRecord: returns the result + short code; null when none exists', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const record = await makeRecord(labId);
    expect(await runAs(labId, () => bethesda.getByRecord(record.id))).toBeNull();
    await runAs(labId, () => bethesda.upsert(record.id, NILM, user));
    const got = await runAs(labId, () => bethesda.getByRecord(record.id));
    expect(got?.shortCode).toBe('NILM');
  });

  it('remove: deletes the result; unknown → NotFound', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const record = await makeRecord(labId);
    await runAs(labId, () => bethesda.upsert(record.id, NILM, user));
    expect(await runAs(labId, () => bethesda.remove(record.id))).toEqual({ deleted: true });
    expect(await raw.bethesdaResult.count({ where: { recordId: record.id } })).toBe(0);
    await expect(runAs(labId, () => bethesda.remove(record.id))).rejects.toBeInstanceOf(NotFoundException);
  });

  // ================================ tenancy ================================

  it('tenancy: getByRecord returns null for another lab’s record', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const user = await makeUser(labA);
    const record = await makeRecord(labA);
    await runAs(labA, () => bethesda.upsert(record.id, NILM, user));
    expect(await runAs(labB, () => bethesda.getByRecord(record.id))).toBeNull();
  });

  it('tenancy: upsert / remove cannot reach another lab’s record', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const userA = await makeUser(labA);
    const userB = await makeUser(labB);
    const record = await makeRecord(labA);
    await runAs(labA, () => bethesda.upsert(record.id, NILM, userA));
    await expect(runAs(labB, () => bethesda.upsert(record.id, NILM, userB))).rejects.toBeInstanceOf(NotFoundException);
    await expect(runAs(labB, () => bethesda.remove(record.id))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tenancy: a read with no lab context fails closed (guard throws)', async () => {
    const record = { id: randomUUID() };
    await expect(bethesda.getByRecord(record.id)).rejects.toThrow(/no lab context/i);
  });
});
