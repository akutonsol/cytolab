import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaClient, RecordStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { RecordsService } from '../records/records.service';
import { ResultSheetsService } from './result-sheets.service';

/**
 * Results workflow deltas:
 *  1. result-sheet create moves the record Completed → Resulted; authorize moves
 *     Resulted → Approved; both audited via RecordStatusEvent.
 *  2. the Completed-lock freezes DATA (update/remove rejected) but NOT the
 *     workflow (a valid status transition on the same record still succeeds).
 *  3. a result sheet can only be created on a Completed record.
 * Gated on DATABASE_URL.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('Results workflow (integration)', () => {
  const raw = new PrismaClient();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const records = new RecordsService(prisma, labContext, { notifyUser: async () => {}, notifyPermission: async () => {} } as any);
  const resultSheets = new ResultSheetsService(prisma, records);

  const tag = `rw-${Date.now().toString(36)}`;
  let labId: string;
  let patientId: string;

  const run = <T>(fn: () => Promise<T>) => labContext.run({ labId }, fn);
  const newRecord = () => run(() => records.create(null as any, { patientId } as any));
  const drive = (id: string, statuses: RecordStatus[]) =>
    run(async () => {
      for (const status of statuses) await records.updateStatus(id, null as any, { status });
    });
  const statusOf = async (id: string) => (await raw.record.findUniqueOrThrow({ where: { id } })).status;
  const eventNotes = async (id: string, status: RecordStatus) =>
    (await raw.recordStatusEvent.findFirst({ where: { recordId: id, status }, orderBy: { createdAt: 'desc' } }))?.notes;

  beforeAll(async () => {
    const lab = await raw.lab.create({ data: { name: `RW ${tag}`, slug: `rw-${tag}` } });
    labId = lab.id;
    const patient = await raw.patient.create({
      data: { labId, registrationNo: `${tag}-P`, firstName: 'P', lastName: 'X' },
    });
    patientId = patient.id;
  });

  afterAll(async () => {
    await raw.resultSheetEvent.deleteMany({ where: { labId } });
    await raw.resultSheet.deleteMany({ where: { labId } });
    await raw.recordStatusEvent.deleteMany({ where: { labId } });
    await raw.record.deleteMany({ where: { labId } });
    await raw.patient.deleteMany({ where: { labId } });
    await raw.labSequence.deleteMany({ where: { labId } });
    await raw.lab.deleteMany({ where: { id: labId } });
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('1. create → Completed→Resulted; authorize → Resulted→Approved (both audited)', async () => {
    const rec = await newRecord();
    await drive(rec.id, [RecordStatus.Submitted, RecordStatus.Processing, RecordStatus.Completed]);

    const sheet = await run(() => resultSheets.create({ recordId: rec.id }, null as any));
    expect(await statusOf(rec.id)).toBe(RecordStatus.Resulted);
    expect(await eventNotes(rec.id, RecordStatus.Resulted)).toBe('Result sheet added');

    await run(() => resultSheets.authorize(sheet.id, null as any));
    expect(await statusOf(rec.id)).toBe(RecordStatus.Approved);
    expect(await eventNotes(rec.id, RecordStatus.Approved)).toBe('Result sheet authorized');
  });

  it('2. Completed-lock freezes data but NOT the workflow', async () => {
    const rec = await newRecord();
    await drive(rec.id, [RecordStatus.Submitted, RecordStatus.Processing, RecordStatus.Completed]);

    // DATA edits/deletes are rejected on a Completed-or-beyond record.
    await expect(run(() => records.update(rec.id, null as any, { doctor: 'X' } as any))).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(run(() => records.remove(rec.id))).rejects.toBeInstanceOf(ConflictException);

    // ...but a valid status transition on that same record STILL succeeds.
    const moved = await run(() => records.updateStatus(rec.id, null as any, { status: RecordStatus.Resulted }));
    expect(moved.status).toBe(RecordStatus.Resulted);

    // Still locked at Resulted (Completed-or-beyond).
    await expect(run(() => records.remove(rec.id))).rejects.toBeInstanceOf(ConflictException);
  });

  it('4. editing an authorized sheet de-authorizes it and rolls Approved → Resulted', async () => {
    const rec = await newRecord();
    await drive(rec.id, [RecordStatus.Submitted, RecordStatus.Processing, RecordStatus.Completed]);
    const sheet = await run(() => resultSheets.create({ recordId: rec.id }, null as any));
    await run(() => resultSheets.authorize(sheet.id, null as any));
    expect(await statusOf(rec.id)).toBe(RecordStatus.Approved);

    // The authorizer re-opens the sheet to correct a finding.
    const edited = await run(() =>
      resultSheets.update(sheet.id, null as any, {
        entries: [{ lines: [{ abbreviation: 'NC SS', findings: 'corrected', abnormalFinding: true }] }],
      } as any),
    );
    expect(edited.authorized).toBe(false); // authorization revoked
    expect(edited.resultEntries[0].resultLines[0].findings).toBe('corrected'); // edit persisted
    // Record returns to the Awaiting Approval queue.
    expect(await statusOf(rec.id)).toBe(RecordStatus.Resulted);
    expect(await eventNotes(rec.id, RecordStatus.Resulted)).toBe('Result sheet edited — authorization revoked');

    // Re-authorizing advances it back to Approved.
    await run(() => resultSheets.authorize(sheet.id, null as any));
    expect(await statusOf(rec.id)).toBe(RecordStatus.Approved);
  });

  it('3. a result sheet cannot be created on a non-Completed record', async () => {
    const rec = await newRecord(); // Pending
    await expect(run(() => resultSheets.create({ recordId: rec.id }, null as any))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await drive(rec.id, [RecordStatus.Submitted]); // Submitted, still not Completed
    await expect(run(() => resultSheets.create({ recordId: rec.id }, null as any))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
