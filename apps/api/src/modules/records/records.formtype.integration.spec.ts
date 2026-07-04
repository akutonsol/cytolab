import { BadRequestException } from '@nestjs/common';
import { PrismaClient, RequisitionFormType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { RecordsService } from './records.service';

/**
 * Form-type integrity (option B): clinical features are structurally bound to
 * the record's form type. Attaching the WRONG type must be REJECTED in BOTH
 * directions, and a record can NEVER hold both feature rows. Gated on DATABASE_URL.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('Record form-type integrity (integration)', () => {
  const raw = new PrismaClient();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const records = new RecordsService(prisma, labContext, { notifyUser: async () => {}, notifyPermission: async () => {} } as any);

  const tag = `ft-${Date.now().toString(36)}`;
  let labId: string;
  let patientId: string;

  const run = <T>(fn: () => Promise<T>) => labContext.run({ labId }, fn);
  const rowCounts = async (recordId: string) => ({
    gyn: await raw.gynClinicalFeatures.count({ where: { recordId } }),
    nonGyn: await raw.nonGynClinicalFeatures.count({ where: { recordId } }),
  });

  beforeAll(async () => {
    const lab = await raw.lab.create({ data: { name: `FT ${tag}`, slug: `ft-${tag}` } });
    labId = lab.id;
    const patient = await raw.patient.create({
      data: { labId, registrationNo: `${tag}-P`, firstName: 'P', lastName: 'X' },
    });
    patientId = patient.id;
  });

  afterAll(async () => {
    await raw.recordStatusEvent.deleteMany({ where: { labId } });
    await raw.gynClinicalFeatures.deleteMany({ where: { labId } });
    await raw.nonGynClinicalFeatures.deleteMany({ where: { labId } });
    await raw.record.deleteMany({ where: { labId } });
    await raw.patient.deleteMany({ where: { labId } });
    await raw.labSequence.deleteMany({ where: { labId } });
    await raw.lab.deleteMany({ where: { id: labId } });
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('a Gyn record accepts Gyn features (and holds NO NonGyn row)', async () => {
    const rec = await run(() =>
      records.create(null as any, {
        patientId,
        formType: RequisitionFormType.Gynecology,
        gynFeatures: { nowPregnant: true, pregnancies: 2 },
      } as any),
    );
    expect(rec.formType).toBe(RequisitionFormType.Gynecology);
    expect(rec.gynFeatures).toBeTruthy();
    expect(rec.nonGynFeatures).toBeNull();
    expect(await rowCounts(rec.id)).toEqual({ gyn: 1, nonGyn: 0 });
  });

  it('REJECTS NonGyn features on a Gyn record (create)', async () => {
    await expect(
      run(() =>
        records.create(null as any, {
          patientId,
          formType: RequisitionFormType.Gynecology,
          nonGynFeatures: { sampleDescription: 'urine' },
        } as any),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('REJECTS Gyn features on a NonGyn record (create) — the other direction', async () => {
    await expect(
      run(() =>
        records.create(null as any, {
          patientId,
          formType: RequisitionFormType.NonGynecology,
          gynFeatures: { menopause: true },
        } as any),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('REJECTS clinical features when no form type is set', async () => {
    await expect(
      run(() => records.create(null as any, { patientId, gynFeatures: { routineCheck: true } } as any)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('REJECTS attaching the wrong type via update', async () => {
    const rec = await run(() =>
      records.create(null as any, {
        patientId,
        formType: RequisitionFormType.NonGynecology,
        nonGynFeatures: { natureAndSource: 'CSF, spinal' },
      } as any),
    );
    await expect(
      run(() => records.update(rec.id, null as any, { gynFeatures: { lengthOfCycle: '28' } } as any)),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Unchanged: still exactly one NonGyn row, no Gyn row.
    expect(await rowCounts(rec.id)).toEqual({ gyn: 0, nonGyn: 1 });
  });

  it('switching the form type clears the opposite row (never both)', async () => {
    const rec = await run(() =>
      records.create(null as any, {
        patientId,
        formType: RequisitionFormType.Gynecology,
        gynFeatures: { nowPregnant: false },
      } as any),
    );
    expect(await rowCounts(rec.id)).toEqual({ gyn: 1, nonGyn: 0 });

    // Flip to NonGyn with NonGyn features → Gyn row deleted, NonGyn created.
    await run(() =>
      records.update(rec.id, null as any, {
        formType: RequisitionFormType.NonGynecology,
        nonGynFeatures: { sampleDescription: 'pleural fluid' },
      } as any),
    );
    expect(await rowCounts(rec.id)).toEqual({ gyn: 0, nonGyn: 1 });
  });

  it('NO record in the lab ever holds both feature rows', async () => {
    const both = await raw.record.count({
      where: { labId, gynFeatures: { isNot: null }, nonGynFeatures: { isNot: null } },
    });
    expect(both).toBe(0);
  });
});
