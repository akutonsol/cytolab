import { PrismaClient, RecordStatus, RequisitionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { RecordsService } from '../records/records.service';

/**
 * Batch fulfillment: a requisition is PARTIAL until every line's linked record
 * reaches Completed-or-beyond, then COMPLETED — and it drops back to PARTIAL if
 * a fulfilled record regresses. Recompute is driven by RecordsService.updateStatus.
 * Gated on DATABASE_URL.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('Requisition fulfillment recompute (integration)', () => {
  const raw = new PrismaClient();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const records = new RecordsService(prisma);

  const tag = `ful-${Date.now().toString(36)}`;
  let labId: string;
  let requisitionId: string;
  const recordIds: string[] = [];

  const reqStatus = async () =>
    (await raw.requisition.findUniqueOrThrow({ where: { id: requisitionId } })).status;
  const drive = (recordId: string, statuses: RecordStatus[]) =>
    labContext.run({ labId }, async () => {
      for (const status of statuses) await records.updateStatus(recordId, null as any, { status });
    });

  beforeAll(async () => {
    const lab = await raw.lab.create({ data: { name: `Ful ${tag}`, slug: `lab-${tag}` } });
    labId = lab.id;
    const patient = await raw.patient.create({
      data: { labId, registrationNo: `${tag}-P`, firstName: 'P', lastName: 'X' },
    });
    const req = await raw.requisition.create({ data: { labId, referenceNo: `${tag}-REQ` } });
    requisitionId = req.id;
    // 3 lines, each its own record (case).
    for (let i = 0; i < 3; i++) {
      const record = await raw.record.create({
        data: { labId, identifier: `${tag}-R${i}`, patientId: patient.id, status: RecordStatus.Pending },
      });
      recordIds.push(record.id);
      await raw.requisitionLine.create({ data: { labId, requisitionId, recordId: record.id } });
    }
  });

  afterAll(async () => {
    await raw.recordStatusEvent.deleteMany({ where: { labId } });
    await raw.requisitionLine.deleteMany({ where: { labId } });
    await raw.requisition.deleteMany({ where: { labId } });
    await raw.record.deleteMany({ where: { labId } });
    await raw.patient.deleteMany({ where: { labId } });
    await raw.lab.deleteMany({ where: { id: labId } });
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('is PARTIAL after the first line is fulfilled (not all yet)', async () => {
    await drive(recordIds[0], [RecordStatus.Submitted, RecordStatus.Processing, RecordStatus.Completed]);
    expect(await reqStatus()).toBe(RequisitionStatus.Partial);
  });

  it('stays PARTIAL while some lines remain unfulfilled', async () => {
    await drive(recordIds[1], [RecordStatus.Submitted, RecordStatus.Processing, RecordStatus.Completed]);
    expect(await reqStatus()).toBe(RequisitionStatus.Partial); // 2/3
  });

  it('flips to COMPLETED only when ALL lines are fulfilled', async () => {
    await drive(recordIds[2], [RecordStatus.Submitted, RecordStatus.Processing, RecordStatus.Completed]);
    expect(await reqStatus()).toBe(RequisitionStatus.Completed); // 3/3
  });

  it('drops back to PARTIAL if a fulfilled record regresses', async () => {
    // Completed -> OnHold is an allowed transition and is NOT a fulfilled state.
    await drive(recordIds[0], [RecordStatus.OnHold]);
    expect(await reqStatus()).toBe(RequisitionStatus.Partial); // back to 2/3
  });
});
