import { ConflictException } from '@nestjs/common';
import { PrismaClient, RecordStatus, RequisitionFormType, SpecimenType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { RecordsService } from './records.service';

/**
 * Record edit: a below-Completed record can be updated (header + the matching
 * clinical-features model + specimen set), while a Completed-or-beyond record's
 * edit is rejected by the API (Completed-lock). Gated on DATABASE_URL.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('Record edit (integration)', () => {
  const raw = new PrismaClient();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const records = new RecordsService(prisma, labContext, { notifyUser: async () => {}, notifyPermission: async () => {} } as any, { record: async () => {}, recordPhiRead: async () => {} } as any);

  const tag = `edit-${Date.now().toString(36)}`;
  let labId: string;
  let patientId: string;

  const run = <T>(fn: () => Promise<T>) => labContext.run({ labId }, fn);

  beforeAll(async () => {
    const lab = await raw.lab.create({ data: { name: `Edit ${tag}`, slug: `edit-${tag}` } });
    labId = lab.id;
    const patient = await raw.patient.create({
      data: { labId, registrationNo: `${tag}-P`, firstName: 'P', lastName: 'X' },
    });
    patientId = patient.id;
  });

  afterAll(async () => {
    await raw.recordStatusEvent.deleteMany({ where: { labId } });
    await raw.gynClinicalFeatures.deleteMany({ where: { labId } });
    await raw.specimen.deleteMany({ where: { labId } });
    await raw.record.deleteMany({ where: { labId } });
    await raw.patient.deleteMany({ where: { labId } });
    await raw.labSequence.deleteMany({ where: { labId } });
    await raw.lab.deleteMany({ where: { id: labId } });
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('updates a below-Completed record: header, clinical features and specimens', async () => {
    const rec = await run(() =>
      records.create(null as any, {
        patientId,
        formType: RequisitionFormType.Gynecology,
        doctor: 'OLD',
        gynFeatures: { nowPregnant: false, pregnancies: 0 },
        specimens: [{ type: SpecimenType.ENDOCERV_ASP }],
      } as any),
    );

    const updated = await run(() =>
      records.update(rec.id, null as any, {
        doctor: 'BANJOKO',
        gynFeatures: { nowPregnant: true, pregnancies: 3 },
        specimens: [{ type: SpecimenType.CERV_SCRAP }, { type: SpecimenType.VAG_POOL }],
      } as any),
    );

    expect(updated.doctor).toBe('BANJOKO');
    expect(updated.gynFeatures?.nowPregnant).toBe(true);
    expect(updated.gynFeatures?.pregnancies).toBe(3);
    // Specimen set replaced (was 1 ENDOCERV, now 2).
    const types = (updated.specimens ?? []).map((s: any) => s.type).sort();
    expect(types).toEqual([SpecimenType.CERV_SCRAP, SpecimenType.VAG_POOL].sort());
    // Still only the Gyn features row (mutual exclusivity holds on edit).
    expect(updated.nonGynFeatures).toBeNull();
  });

  it('rejects editing a Completed-or-beyond record (Completed-lock, via the API)', async () => {
    const rec = await run(() => records.create(null as any, { patientId } as any));
    await run(async () => {
      for (const s of [RecordStatus.Submitted, RecordStatus.Processing, RecordStatus.Completed]) {
        await records.updateStatus(rec.id, null as any, { status: s });
      }
    });
    await expect(run(() => records.update(rec.id, null as any, { doctor: 'nope' } as any))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
