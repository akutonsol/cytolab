import { PrismaClient, RecordStatus, ResultSheetEventType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { RecordsService } from '../records/records.service';
import { ResultSheetsService } from '../result-sheets/result-sheets.service';
import { AiReportingService } from './ai-reporting.service';
import { AiService } from './ai.service';

/**
 * F4 end-to-end (Anthropic stubbed — never hits the network):
 *  - AI enabled → generate + accept + authorize works, and the HUMAN finalText
 *    (not the raw AI output) is what feeds the report.
 *  - AI down → the authorizer authorizes normally with no AI, no draft persisted.
 *  - de-authorize gate: accepting a draft OR editing the narrative on an
 *    AUTHORIZED sheet re-opens it (Approved → Resulted) — a signed report is
 *    never silently changed.
 * Gated on DATABASE_URL.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('AI-assisted reporting (integration)', () => {
  const raw = new PrismaClient();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const records = new RecordsService(prisma, labContext, { notifyUser: async () => {}, notifyPermission: async () => {} } as any);
  const realtimeStub = { emitToLab() {}, emitToUser() {}, emitToSuperusers() {} } as any;
  const resultSheets = new ResultSheetsService(prisma, records, { evaluateRecord: async () => {} } as any, labContext, realtimeStub);

  // Stubbed AI: available + returns a fixed draft. Swapped per-test for the down case.
  const okAi = { hasApiKey: () => true, generate: jest.fn(async () => ({ available: true, output: 'AI DRAFT narrative', model: 'claude-sonnet-4-6' })) };
  const downAi = { hasApiKey: () => true, generate: jest.fn(async () => ({ available: false, reason: 'API error' })) };
  const aiUp = new AiReportingService(prisma, okAi as unknown as AiService, resultSheets, labContext);
  const aiDown = new AiReportingService(prisma, downAi as unknown as AiService, resultSheets, labContext);

  const tag = `ai-${Date.now().toString(36)}`;
  let labId: string;
  let patientId: string;
  const run = <T>(fn: () => Promise<T>) => labContext.run({ labId }, fn);

  const freshResultedSheet = async () => {
    const rec = await records.create(null as any, { patientId, formType: 'Gynecology', gynFeatures: { nowPregnant: false } } as any);
    for (const s of [RecordStatus.Submitted, RecordStatus.Processing, RecordStatus.Completed]) {
      await records.updateStatus(rec.id, null as any, { status: s });
    }
    const sheet = await resultSheets.create({ recordId: rec.id, entries: [{ lines: [{ abbreviation: 'NC SS', findings: 'scant' }] }] }, null as any);
    return { recordId: rec.id, sheetId: sheet.id };
  };
  const statusOf = async (id: string) => (await raw.record.findUniqueOrThrow({ where: { id } })).status;
  const eventsOf = async (sheetId: string) => (await raw.resultSheetEvent.findMany({ where: { resultSheetId: sheetId } })).map((e) => e.type);

  beforeAll(async () => {
    const lab = await raw.lab.create({ data: { name: `AI ${tag}`, slug: `ai-${tag}` } });
    labId = lab.id;
    await raw.labAiSettings.create({ data: { labId, enabled: true, redactionPolicy: 'Strict' } });
    const patient = await raw.patient.create({ data: { labId, registrationNo: `${tag}-P`, firstName: 'Ada', lastName: 'Lovelace' } });
    patientId = patient.id;
  });

  afterAll(async () => {
    await raw.aiDraft.deleteMany({ where: { labId } });
    await raw.resultSheetEvent.deleteMany({ where: { labId } });
    await raw.resultSheet.deleteMany({ where: { labId } });
    await raw.recordStatusEvent.deleteMany({ where: { labId } });
    await raw.gynClinicalFeatures.deleteMany({ where: { labId } });
    await raw.labAiSettings.deleteMany({ where: { labId } });
    await raw.record.deleteMany({ where: { labId } });
    await raw.patient.deleteMany({ where: { labId } });
    await raw.labSequence.deleteMany({ where: { labId } });
    await raw.lab.deleteMany({ where: { id: labId } });
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('AI enabled: generate → accept (human edits) → authorize; finalText feeds the report', () =>
    run(async () => {
      const { recordId, sheetId } = await freshResultedSheet();

      const gen = await aiUp.generateNarrative(sheetId, null as any);
      expect(gen.available).toBe(true);
      expect(gen.data.status).toBe('Generated');
      expect(gen.data.output).toBe('AI DRAFT narrative');
      expect(gen.data.inputDigest).toHaveLength(64); // provenance
      expect(await eventsOf(sheetId)).toContain(ResultSheetEventType.AiDrafted);

      // Authorizer edits the draft before accepting.
      const accepted = await aiUp.acceptNarrative(sheetId, gen.data.id, null as any, 'EDITED by pathologist');
      expect(accepted.draft.status).toBe('Accepted');
      expect(accepted.draft.finalText).toBe('EDITED by pathologist');
      expect((accepted.draft.editedDiff as any).identical).toBe(false);
      expect(accepted.draft.acceptedById).toBeNull(); // (null user in test) — field is wired
      expect(await eventsOf(sheetId)).toContain(ResultSheetEventType.AiAccepted);

      // The HUMAN finalText — not the raw AI output — is the sheet narrative.
      expect(accepted.sheet.narrative).toBe('EDITED by pathologist');
      expect(accepted.sheet.narrative).not.toBe('AI DRAFT narrative');

      // Sign-off proceeds normally.
      await resultSheets.authorize(sheetId, null as any);
      expect(await statusOf(recordId)).toBe(RecordStatus.Approved);
    }));

  it('AI down: authorizer authorizes normally, no draft persisted', () =>
    run(async () => {
      const { recordId, sheetId } = await freshResultedSheet();

      const gen = await aiDown.generateNarrative(sheetId, null as any);
      expect(gen.available).toBe(false); // degraded
      expect(gen.data).toBeUndefined();
      expect(await raw.aiDraft.count({ where: { resultSheetId: sheetId } })).toBe(0); // nothing stored

      // Authorization is completely independent of AI.
      await resultSheets.authorize(sheetId, null as any);
      expect(await statusOf(recordId)).toBe(RecordStatus.Approved);
    }));

  it('AI disabled for the lab: capability returns unavailable, no draft', () =>
    run(async () => {
      const { sheetId } = await freshResultedSheet();
      await raw.labAiSettings.update({ where: { labId }, data: { enabled: false } });
      const gen = await aiUp.generateNarrative(sheetId, null as any);
      expect(gen.available).toBe(false);
      expect(await raw.aiDraft.count({ where: { resultSheetId: sheetId } })).toBe(0);
      await raw.labAiSettings.update({ where: { labId }, data: { enabled: true } });
    }));

  it('de-authorize gate: accepting a draft on an AUTHORIZED sheet re-opens it', () =>
    run(async () => {
      const { recordId, sheetId } = await freshResultedSheet();
      // Get to Approved first.
      const g1 = await aiUp.generateNarrative(sheetId, null as any);
      await aiUp.acceptNarrative(sheetId, g1.data.id, null as any, 'first narrative');
      await resultSheets.authorize(sheetId, null as any);
      expect(await statusOf(recordId)).toBe(RecordStatus.Approved);

      // A NEW draft accepted after sign-off must revoke authorization.
      const g2 = await aiUp.generateNarrative(sheetId, null as any);
      const accepted = await aiUp.acceptNarrative(sheetId, g2.data.id, null as any, 'revised narrative');
      expect(accepted.sheet.authorized).toBe(false);
      expect(await statusOf(recordId)).toBe(RecordStatus.Resulted); // requeued
      expect(await eventsOf(sheetId)).toContain(ResultSheetEventType.Deauthorized);
    }));

  it('de-authorize gate: editing the narrative directly on an AUTHORIZED sheet re-opens it', () =>
    run(async () => {
      const { recordId, sheetId } = await freshResultedSheet();
      const g = await aiUp.generateNarrative(sheetId, null as any);
      await aiUp.acceptNarrative(sheetId, g.data.id, null as any, 'narrative one');
      await resultSheets.authorize(sheetId, null as any);
      expect(await statusOf(recordId)).toBe(RecordStatus.Approved);

      const edited = await resultSheets.update(sheetId, null as any, { narrative: 'edited after signing' });
      expect(edited.authorized).toBe(false);
      expect(await statusOf(recordId)).toBe(RecordStatus.Resulted);
    }));
});
