/**
 * Program 3 · C8 — Coding service integration + transaction + tenancy suite.
 *
 * Implements ONLY the tests defined by the frozen C8 design
 * (docs/PROGRAM_3_C8_CODING_TEST_DESIGN.md, commit d03d2e3). Reuses the C1-C7 production-parity `_test`
 * harness. Collaborator AuditRecorder is STUBBED. This is a SIBLING to the existing
 * `coding.phi-audit.spec.ts`, which remains the authoritative (untouched) owner of the PHI-audit
 * placement contract — none of it is duplicated here.
 *
 * SD governance (frozen): SD-1 no negative-usageCount normalization (success-path only); SD-2
 * inactive-code assignability characterized as CURRENT behavior; SD-3 no invented audit events. The two
 * $transaction boundaries are verified on the success path only — no injected rollback.
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CodeSystem, CodingType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { createTestPrisma, resolveTestDatabaseUrl } from '@test/test-database';
import { tenancyExtension } from '../../common/tenancy/tenancy.extension';
import { phiEncryptionExtension } from '../../common/crypto/phi-encryption.extension';
import { LabContext } from '../../common/tenancy/lab-context';
import { CodingService } from './coding.service';
import type { PrismaService } from '../../database/prisma.service';
import type { AuditRecorder } from '../audit/audit-recorder.service';

const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('CodingService (C8 integration)', () => {
  const raw = createTestPrisma();
  const labContext = new LabContext();
  const scoped = raw.$extends(tenancyExtension(labContext)).$extends(phiEncryptionExtension());
  const auditStub = { recordPhiList: jest.fn(), recordPhiExport: jest.fn() };
  const coding = new CodingService(scoped as unknown as PrismaService, auditStub as unknown as AuditRecorder);

  const createdLabIds: string[] = [];
  const uid = () => randomUUID().slice(0, 8);

  async function makeLab(): Promise<string> {
    const u = uid();
    const lab = await raw.lab.create({ data: { name: `C8 Lab ${u}`, slug: `c8-lab-${u}` } });
    createdLabIds.push(lab.id);
    return lab.id;
  }
  async function makeUser(labId: string): Promise<string> {
    const account = await raw.account.create({ data: { labId, name: `Acct ${uid()}` } });
    const user = await raw.user.create({
      data: { labId, accountId: account.id, email: `${uid()}@ex.test`, passwordHash: 'x', firstName: 'Coder', lastName: uid().slice(0, 4) },
    });
    return user.id;
  }
  async function makeRecord(labId: string, opts: { formType?: string } = {}) {
    const patient = await raw.patient.create({ data: { labId, registrationNo: `REG-${uid()}`, firstName: 'Test', lastName: 'Patient' } });
    return raw.record.create({ data: { labId, identifier: `ID-${uid()}`, patientId: patient.id, formType: (opts.formType as never) ?? null } });
  }
  async function makeCode(labId: string, opts: { system?: CodeSystem; code?: string; display?: string; isActive?: boolean } = {}) {
    return raw.medicalCode.create({
      data: {
        labId,
        system: opts.system ?? CodeSystem.SNOMED_CT,
        code: opts.code ?? `C-${uid()}`,
        display: opts.display ?? 'Test code',
        isActive: opts.isActive ?? true,
      },
    });
  }
  async function makeBethesda(labId: string, recordId: string, squamousCategory: string) {
    return raw.bethesdaResult.create({
      data: { labId, recordId, specimenAdequacy: 'Satisfactory', squamousCategory: squamousCategory as never },
    });
  }

  const runAs = <T>(labId: string, fn: () => Promise<T>): Promise<T> =>
    labContext.run({ labId }, async () => await fn());

  afterAll(async () => {
    if (createdLabIds.length) {
      const where = { labId: { in: createdLabIds } };
      await raw.recordCoding.deleteMany({ where });
      await raw.medicalCode.deleteMany({ where });
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

  // ================================ dictionary ================================

  it('createCode: creates a dictionary entry; a duplicate system+code → Conflict', async () => {
    const labId = await makeLab();
    const created = await runAs(labId, () => coding.createCode({ system: CodeSystem.ICD10, code: 'N87.0', display: 'LSIL' }));
    expect(created.code).toBe('N87.0');
    await expect(runAs(labId, () => coding.createCode({ system: CodeSystem.ICD10, code: 'N87.0', display: 'dup' }))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('updateCode: updates fields; unknown → NotFound', async () => {
    const labId = await makeLab();
    const code = await makeCode(labId, { display: 'old' });
    const updated = await runAs(labId, () => coding.updateCode(code.id, { display: 'new', isActive: true }));
    expect(updated.display).toBe('new');
    await expect(runAs(labId, () => coding.updateCode(randomUUID(), { display: 'x' }))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deactivateCode: soft-deactivates (isActive=false); unknown → NotFound', async () => {
    const labId = await makeLab();
    const code = await makeCode(labId, {});
    const deactivated = await runAs(labId, () => coding.deactivateCode(code.id));
    expect(deactivated.isActive).toBe(false);
    await expect(runAs(labId, () => coding.deactivateCode(randomUUID()))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listCodes: filters by system', async () => {
    const labId = await makeLab();
    await makeCode(labId, { system: CodeSystem.ICD10 });
    await makeCode(labId, { system: CodeSystem.LOINC });
    const icd = await runAs(labId, () => coding.listCodes({ system: CodeSystem.ICD10 }));
    expect(icd.every((c) => c.system === CodeSystem.ICD10)).toBe(true);
    expect(icd).toHaveLength(1);
  });

  // ================================ assign (TX-1) / remove (TX-2) ================================

  it('assignCode (TX-1): creates the coding and increments usageCount exactly once', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const record = await makeRecord(labId);
    const code = await makeCode(labId, {});

    const coded = await runAs(labId, () => coding.assignCode(record.id, { codeId: code.id, codeType: CodingType.Diagnosis }, user));
    expect(coded.code.id).toBe(code.id);
    const after = await raw.medicalCode.findUnique({ where: { id: code.id } });
    expect(after?.usageCount).toBe(1);
  });

  it('assignCode: record-not-found and code-not-found → NotFound', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const record = await makeRecord(labId);
    const code = await makeCode(labId, {});
    await expect(runAs(labId, () => coding.assignCode(randomUUID(), { codeId: code.id, codeType: CodingType.Diagnosis }, user))).rejects.toBeInstanceOf(NotFoundException);
    await expect(runAs(labId, () => coding.assignCode(record.id, { codeId: randomUUID(), codeType: CodingType.Diagnosis }, user))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assignCode: a duplicate assignment → Conflict and leaves usageCount unchanged', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const record = await makeRecord(labId);
    const code = await makeCode(labId, {});
    await runAs(labId, () => coding.assignCode(record.id, { codeId: code.id, codeType: CodingType.Diagnosis }, user));
    await expect(runAs(labId, () => coding.assignCode(record.id, { codeId: code.id, codeType: CodingType.Diagnosis }, user))).rejects.toBeInstanceOf(
      ConflictException,
    );
    const after = await raw.medicalCode.findUnique({ where: { id: code.id } });
    expect(after?.usageCount).toBe(1); // the conflict is caught before the transaction
  });

  it('removeCoding (TX-2): deletes the coding and decrements usageCount exactly once', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const record = await makeRecord(labId);
    const code = await makeCode(labId, {});
    await runAs(labId, () => coding.assignCode(record.id, { codeId: code.id, codeType: CodingType.Diagnosis }, user));

    const result = await runAs(labId, () => coding.removeCoding(record.id, code.id));
    expect(result).toEqual({ recordId: record.id, codeId: code.id, removed: true });
    expect(await raw.recordCoding.count({ where: { recordId: record.id, codeId: code.id } })).toBe(0);
    const after = await raw.medicalCode.findUnique({ where: { id: code.id } });
    expect(after?.usageCount).toBe(0); // back to the starting count
  });

  it('removeCoding: unknown coding → NotFound', async () => {
    const labId = await makeLab();
    const record = await makeRecord(labId);
    await expect(runAs(labId, () => coding.removeCoding(record.id, randomUUID()))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getRecordCodings: lists the codings assigned to a record', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const record = await makeRecord(labId);
    const code = await makeCode(labId, {});
    await runAs(labId, () => coding.assignCode(record.id, { codeId: code.id, codeType: CodingType.Diagnosis }, user));
    const list = await runAs(labId, () => coding.getRecordCodings(record.id));
    expect(list).toHaveLength(1);
    expect(list[0].code.id).toBe(code.id);
  });

  // ================================ suggest ================================

  it('suggest: derives LOINC (specimen) + Bethesda-mapped codes that exist in the dictionary', async () => {
    const labId = await makeLab();
    const record = await makeRecord(labId, { formType: 'Gynecology' });
    await makeBethesda(labId, record.id, 'LSIL');
    // Dictionary rows the suggestions resolve to (formType→LOINC, Bethesda LSIL→SNOMED/ICD10).
    await makeCode(labId, { system: CodeSystem.LOINC, code: '10524-7', display: 'Gyn cytology' });
    await makeCode(labId, { system: CodeSystem.SNOMED_CT, code: '285854005', display: 'LSIL' });
    await makeCode(labId, { system: CodeSystem.ICD10, code: 'N87.0', display: 'LSIL' });

    const suggestions = await runAs(labId, () => coding.suggest(record.id));
    const codes = suggestions.map((s: any) => s.code.code);
    expect(codes).toEqual(expect.arrayContaining(['10524-7', '285854005', 'N87.0']));
    expect(suggestions.every((s: any) => s.alreadyAssigned === false)).toBe(true);
  });

  it('suggest: flags an already-assigned suggestion', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const record = await makeRecord(labId, { formType: 'Gynecology' });
    await makeBethesda(labId, record.id, 'LSIL');
    const loinc = await makeCode(labId, { system: CodeSystem.LOINC, code: '10524-7', display: 'Gyn cytology' });
    await runAs(labId, () => coding.assignCode(record.id, { codeId: loinc.id, codeType: CodingType.Procedure }, user));

    const suggestions = await runAs(labId, () => coding.suggest(record.id));
    const loincSuggestion = suggestions.find((s: any) => s.code.id === loinc.id);
    expect(loincSuggestion?.alreadyAssigned).toBe(true);
  });

  it('suggest: unknown record → NotFound', async () => {
    const labId = await makeLab();
    await expect(runAs(labId, () => coding.suggest(randomUUID()))).rejects.toBeInstanceOf(NotFoundException);
  });

  // ================================ stats / export ================================

  it('stats: reports dictionary size and per-system coding counts', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const record = await makeRecord(labId);
    const code = await makeCode(labId, { system: CodeSystem.ICD10 });
    await runAs(labId, () => coding.assignCode(record.id, { codeId: code.id, codeType: CodingType.Diagnosis }, user));

    const stats = await runAs(labId, () => coding.stats());
    expect(stats.dictionarySize).toBe(1);
    expect(stats.bySystem.ICD10).toBe(1);
    expect(stats.totalCoded).toBe(1);
  });

  it('exportData: shapes coded records within the date window', async () => {
    const labId = await makeLab();
    const user = await makeUser(labId);
    const record = await makeRecord(labId);
    const code = await makeCode(labId, { system: CodeSystem.ICD10, code: 'N87.0' });
    await runAs(labId, () => coding.assignCode(record.id, { codeId: code.id, codeType: CodingType.Diagnosis }, user));

    const data = await runAs(labId, () => coding.exportData({}));
    expect(data.count).toBe(1);
    expect(data.records[0].codes[0].code).toBe('N87.0');
  });

  // ================================ tenancy ================================

  it('tenancy: updateCode / deactivateCode cannot reach another lab’s code', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const code = await makeCode(labA, {});
    await expect(runAs(labB, () => coding.updateCode(code.id, { display: 'x' }))).rejects.toBeInstanceOf(NotFoundException);
    await expect(runAs(labB, () => coding.deactivateCode(code.id))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tenancy: assignCode cannot use another lab’s code', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const codeA = await makeCode(labA, {});
    const userB = await makeUser(labB);
    const recordB = await makeRecord(labB);
    await expect(runAs(labB, () => coding.assignCode(recordB.id, { codeId: codeA.id, codeType: CodingType.Diagnosis }, userB))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('tenancy: listCodes from lab B excludes lab A codes', async () => {
    const labA = await makeLab();
    const labB = await makeLab();
    const codeA = await makeCode(labA, {});
    const fromB = await runAs(labB, () => coding.listCodes({}));
    expect(fromB.some((c) => c.id === codeA.id)).toBe(false);
  });

  it('tenancy: a read with no lab context fails closed (guard throws)', async () => {
    await expect(coding.listCodes({})).rejects.toThrow(/no lab context/i);
  });
});
