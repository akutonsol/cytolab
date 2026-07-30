import { randomUUID } from 'node:crypto';
import { Prisma, AiModelLifecycleState, InferenceOutcome } from '@prisma/client';
import { createTestPrisma } from '@test/test-database';
import { PrismaService } from '../../database/prisma.service';
import { LabContext } from '../../common/tenancy/lab-context';
import { HumanReviewService } from './human-review.service';

/**
 * Program 6 · Phase 6E — human review against the REAL test Postgres via the tenancy-scoped PrismaService. Proves:
 * lab scoping + cross-lab fail-closed; SUCCEEDED-only eligibility; authenticated non-null human reviewer; immutable
 * append-only decisions + derived effective decision; request/decision separation + deterministic completion boundary
 * (Guardrail 3); decision snapshot integrity (Guardrail 1); explainability same-record consistency (Guardrail 2);
 * validation-only inheritance; structured MODIFY findings; no support inference; no support clinical authorization;
 * no PHI / no clinical-terminology columns; every provenance FK RESTRICT; non-null reviewer FK.
 */
const describeIf = process.env.DATABASE_URL ? describe : describe.skip;

describeIf('P6-6E human review (integration)', () => {
  const raw = createTestPrisma();
  const labContext = new LabContext();
  const prisma = new PrismaService(labContext);
  const audit = { recordEntityCreated: jest.fn(async () => undefined), recordEntityUpdated: jest.fn(async () => undefined) } as any;
  const svc = new HumanReviewService(prisma, audit);
  const asLab = <T>(labId: string, fn: () => Promise<T>) => labContext.runLabScoped(labId, fn) as Promise<T>;
  const labIds: string[] = [];

  const accountByLab = new Map<string, string>();
  const mkLab = async () => { const l = await raw.lab.create({ data: { name: 'p6e', slug: `p6e-${randomUUID()}` } }); labIds.push(l.id); return l.id; };
  const accountFor = async (labId: string) => {
    if (!accountByLab.has(labId)) accountByLab.set(labId, (await raw.account.create({ data: { labId, name: 'p6e-acct' }, select: { id: true } })).id);
    return accountByLab.get(labId)!;
  };
  const mkUser = async (labId: string) => (await raw.user.create({ data: { labId, accountId: await accountFor(labId), email: `u-${randomUUID()}@t.test`, passwordHash: 'x', firstName: 'Rev', lastName: 'Iewer' }, select: { id: true } })).id;
  const mkRecord = async (labId: string, opts: { outcome?: InferenceOutcome | null; validationOnly?: boolean; lifecycle?: AiModelLifecycleState } = {}) => {
    const m = await raw.aiModel.create({ data: { labId, key: `m-${randomUUID()}`, displayName: 'M', task: 'demo' } });
    const v = await raw.aiModelVersion.create({ data: { labId, modelId: m.id, semverMajor: 1, semverMinor: 0, semverPatch: 0, lifecycleState: opts.lifecycle ?? 'APPROVED' } });
    const rec = await raw.inferenceRecord.create({ data: { labId, modelVersionId: v.id, inputDigest: 'a'.repeat(64), resultDigest: 'b'.repeat(64), outcome: opts.outcome === undefined ? 'SUCCEEDED' : opts.outcome, validationOnly: opts.validationOnly ?? false, adapterId: 'stub', adapterVersion: '1.0.0', engineVersion: '6c.1.0', modelLifecycleStateAtRun: opts.lifecycle ?? 'APPROVED' } });
    return { recordId: rec.id, modelVersionId: v.id };
  };
  const mkExplain = async (labId: string, inferenceRecordId: string) => (await raw.explainabilityGeneration.create({ data: { labId, inferenceRecordId, generatorId: 'stub', generatorVersion: '1.0.0', validationOnly: false, eventId: randomUUID() }, select: { id: true } })).id;

  afterAll(async () => {
    for (const labId of labIds) {
      for (const t of ['HumanReviewModifiedFinding', 'HumanReviewDecision', 'HumanReviewRequestEvent', 'HumanReviewRequest', 'ExplainabilityGeneration', 'InferenceRecord', 'AiModelVersion', 'AiModel', 'User', 'Account']) {
        await raw.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "labId" = $1`, labId);
      }
      await raw.$executeRaw`DELETE FROM "Lab" WHERE id = ${labId}`;
    }
    await prisma.$disconnect();
    await raw.$disconnect();
  });

  it('is lab-scoped and fails closed cross-lab', async () => {
    const A = await mkLab(); const B = await mkLab();
    const { recordId } = await mkRecord(A);
    const req = await asLab(A, () => svc.createRequest({ inferenceRecordId: recordId }));
    await expect(asLab(B, () => svc.getRequest(req.id))).rejects.toThrow(/not found/i);
    const bRec = await mkRecord(B);
    await expect(asLab(A, () => svc.createRequest({ inferenceRecordId: bRec.recordId }))).rejects.toThrow(/not found/i);
  });

  it('enforces SUCCEEDED-only eligibility', async () => {
    const A = await mkLab();
    const failed = await mkRecord(A, { outcome: 'FAILED' });
    const incomplete = await mkRecord(A, { outcome: null });
    const ok = await mkRecord(A, { outcome: 'SUCCEEDED' });
    await expect(asLab(A, () => svc.createRequest({ inferenceRecordId: failed.recordId }))).rejects.toThrow(/SUCCEEDED/);
    await expect(asLab(A, () => svc.createRequest({ inferenceRecordId: incomplete.recordId }))).rejects.toThrow(/SUCCEEDED/);
    await expect(asLab(A, () => svc.createRequest({ inferenceRecordId: ok.recordId }))).resolves.toBeTruthy();
  });

  it('records an immutable decision with a snapshot of what was reviewed (Guardrail 1); reviewer is the authenticated id', async () => {
    const A = await mkLab();
    const { recordId, modelVersionId } = await mkRecord(A);
    const reviewer = await mkUser(A);
    const req = await asLab(A, () => svc.createRequest({ inferenceRecordId: recordId }));
    const dec = await asLab(A, () => svc.submitDecision(req.id, { reviewDecision: 'ACCEPT' }, reviewer));
    expect(dec.reviewerUserId).toBe(reviewer); // authenticated principal, not a body field
    expect(dec.reviewedModelVersionId).toBe(modelVersionId); // Guardrail 1 snapshot
    expect(dec.reviewedResultDigest).toBe('b'.repeat(64));
    expect(dec.modelLifecycleStateAtReview).toBe('APPROVED');
    // request completed once (Guardrail 3)
    const reqRow = await raw.humanReviewRequest.findUnique({ where: { id: req.id } });
    expect(reqRow?.state).toBe('COMPLETED');
    expect(reqRow?.completedAt).toBeTruthy();
    expect(await raw.humanReviewRequestEvent.count({ where: { requestId: req.id, toState: 'COMPLETED' } })).toBe(1);
  });

  it('rejects a decision from a reviewer not in this lab (human ownership fails closed)', async () => {
    const A = await mkLab(); const B = await mkLab();
    const { recordId } = await mkRecord(A);
    const foreignReviewer = await mkUser(B);
    const req = await asLab(A, () => svc.createRequest({ inferenceRecordId: recordId }));
    await expect(asLab(A, () => svc.submitDecision(req.id, { reviewDecision: 'ACCEPT' }, foreignReviewer))).rejects.toThrow(/reviewer not found/i);
  });

  it('is append-only with a TERMINAL completion boundary: a change of mind requires a governed reopen (Guardrail 3)', async () => {
    const A = await mkLab();
    const { recordId } = await mkRecord(A);
    const reviewer = await mkUser(A);
    const req = await asLab(A, () => svc.createRequest({ inferenceRecordId: recordId }));
    const d1 = await asLab(A, () => svc.submitDecision(req.id, { reviewDecision: 'ACCEPT' }, reviewer)); // PENDING → COMPLETED
    const d1Row = await raw.humanReviewDecision.findUnique({ where: { id: d1.id } });
    const completedAt1 = (await raw.humanReviewRequest.findUnique({ where: { id: req.id } }))?.completedAt;
    expect((await asLab(A, () => svc.getRequest(req.id))).effectiveReviewDecision?.reviewDecision).toBe('ACCEPT');

    // COMPLETED is terminal: a DIRECT second submission fails closed (no reopen was performed)
    await expect(asLab(A, () => svc.submitDecision(req.id, { reviewDecision: 'REJECT' }, reviewer))).rejects.toThrow(/COMPLETED/);
    expect(await raw.humanReviewDecision.count({ where: { requestId: req.id } })).toBe(1); // no new decision persisted
    expect((await asLab(A, () => svc.getRequest(req.id))).effectiveReviewDecision?.reviewDecision).toBe('ACCEPT'); // effective unchanged

    // the governed reopen creates an append-only request event; only then may a new decision be submitted
    const pendingEventsBefore = await raw.humanReviewRequestEvent.count({ where: { requestId: req.id, toState: 'PENDING' } });
    await asLab(A, () => svc.reopen(req.id, {}));
    expect(await raw.humanReviewRequestEvent.count({ where: { requestId: req.id, toState: 'PENDING' } })).toBe(pendingEventsBefore + 1); // reopen recorded
    const d2 = await asLab(A, () => svc.submitDecision(req.id, { reviewDecision: 'REJECT' }, reviewer)); // PENDING → COMPLETED again
    expect(d2.id).not.toBe(d1.id);
    expect(await raw.humanReviewDecision.count({ where: { requestId: req.id } })).toBe(2); // both retained
    expect((await asLab(A, () => svc.getRequest(req.id))).effectiveReviewDecision?.reviewDecision).toBe('REJECT'); // effective changed ONLY after reopen + new submission

    // prior decision byte-unchanged; original completedAt preserved; the event history proves each completion cycle
    expect(await raw.humanReviewDecision.findUnique({ where: { id: d1.id } })).toEqual(d1Row);
    const reqRow = await raw.humanReviewRequest.findUnique({ where: { id: req.id } });
    expect(reqRow?.completedAt?.getTime()).toBe(completedAt1?.getTime()); // single immutable completion boundary
    expect(await raw.humanReviewRequestEvent.count({ where: { requestId: req.id, toState: 'COMPLETED' } })).toBe(2); // two governed completion cycles
    for (const s of ['updateDecision', 'editDecision', 'deleteDecision']) expect((svc as any)[s]).toBeUndefined();
  });

  it('MODIFY carries structured coded findings + a correction digest; ACCEPT/REJECT may not carry findings', async () => {
    const A = await mkLab();
    const { recordId } = await mkRecord(A);
    const reviewer = await mkUser(A);
    const req = await asLab(A, () => svc.createRequest({ inferenceRecordId: recordId }));
    await expect(asLab(A, () => svc.submitDecision(req.id, { reviewDecision: 'MODIFY' }, reviewer))).rejects.toThrow(/at least one/i);
    await expect(asLab(A, () => svc.submitDecision(req.id, { reviewDecision: 'ACCEPT', modifiedFindings: [{ findingCode: 'x' }] }, reviewer))).rejects.toThrow(/only a MODIFY/i);
    const dec = await asLab(A, () => svc.submitDecision(req.id, { reviewDecision: 'MODIFY', modifiedFindings: [{ findingCode: 'atypia', valueCode: 'present' }, { findingCode: 'count', valueNum: 3 }] }, reviewer));
    expect(dec.correctionDigest).toMatch(/^[a-f0-9]{64}$/);
    const findings = await raw.humanReviewModifiedFinding.findMany({ where: { decisionId: dec.id }, orderBy: { ordinal: 'asc' } });
    expect(findings.map((f) => f.findingCode)).toEqual(['atypia', 'count']);
    expect(findings[1].valueNum).toBe(3);
  });

  it('an explainability reference must belong to the SAME inference record (Guardrail 2)', async () => {
    const A = await mkLab();
    const rec1 = await mkRecord(A); const rec2 = await mkRecord(A);
    const reviewer = await mkUser(A);
    const genSame = await mkExplain(A, rec1.recordId);
    const genOther = await mkExplain(A, rec2.recordId);
    const req = await asLab(A, () => svc.createRequest({ inferenceRecordId: rec1.recordId }));
    await expect(asLab(A, () => svc.submitDecision(req.id, { reviewDecision: 'ACCEPT', explainabilityGenerationId: genOther }, reviewer))).rejects.toThrow(/different inference record/i);
    const dec = await asLab(A, () => svc.submitDecision(req.id, { reviewDecision: 'ACCEPT', explainabilityGenerationId: genSame }, reviewer));
    expect(dec.explainabilityGenerationId).toBe(genSame);
  });

  it('inherits validation-only provenance immutably from the record', async () => {
    const A = await mkLab();
    const { recordId } = await mkRecord(A, { validationOnly: true, lifecycle: 'VALIDATION' });
    const reviewer = await mkUser(A);
    const req = await asLab(A, () => svc.createRequest({ inferenceRecordId: recordId }));
    expect((await raw.humanReviewRequest.findUnique({ where: { id: req.id } }))?.validationOnly).toBe(true);
    const dec = await asLab(A, () => svc.submitDecision(req.id, { reviewDecision: 'ACCEPT' }, reviewer));
    expect(dec.validationOnly).toBe(true);
    expect(dec.modelLifecycleStateAtReview).toBe('VALIDATION');
  });

  it('governed reopen transitions away from COMPLETED without deleting decisions; cancel preserves decisions', async () => {
    const A = await mkLab();
    const { recordId } = await mkRecord(A);
    const reviewer = await mkUser(A);
    const req = await asLab(A, () => svc.createRequest({ inferenceRecordId: recordId }));
    await asLab(A, () => svc.submitDecision(req.id, { reviewDecision: 'ACCEPT' }, reviewer));
    const reopened = await asLab(A, () => svc.reopen(req.id, {}));
    expect(reopened.state).toBe('PENDING');
    expect(await raw.humanReviewDecision.count({ where: { requestId: req.id } })).toBe(1); // decision retained through reopen
    await asLab(A, () => svc.cancel(req.id));
    expect((await raw.humanReviewRequest.findUnique({ where: { id: req.id } }))?.state).toBe('CANCELLED');
    expect(await raw.humanReviewDecision.count({ where: { requestId: req.id } })).toBe(1); // cancel never deletes decisions
    // a CANCELLED request refuses new decisions until reopened
    await expect(asLab(A, () => svc.submitDecision(req.id, { reviewDecision: 'REJECT' }, reviewer))).rejects.toThrow(/CANCELLED/);
  });

  it('performs NO support inference and NO support clinical authorization; no PHI / clinical-terminology columns; RESTRICT FKs; reviewer non-null', async () => {
    const A = await mkLab();
    const { recordId } = await mkRecord(A);
    const reviewer = await mkUser(A);
    const before = await raw.inferenceRecord.findUnique({ where: { id: recordId } });
    const req = await asLab(A, () => svc.createRequest({ inferenceRecordId: recordId }));
    await asLab(A, () => svc.submitDecision(req.id, { reviewDecision: 'ACCEPT' }, reviewer));
    expect(await raw.inferenceRecord.findUnique({ where: { id: recordId } })).toEqual(before); // no support inference

    const models = ['HumanReviewRequest', 'HumanReviewDecision', 'HumanReviewModifiedFinding', 'HumanReviewRequestEvent'];
    const phi = /patient|birth|\bdob\b|ssn|mrn|firstname|lastname|demographic|address|phone/i;
    const clinical = /finalDiagnosis|\bdiagnosis\b|authorized|approvedDiagnosis|clinicalTruth|confirmedCorrect|signOut|clinicalConfidence/i;
    for (const m of models) {
      const fields = Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields;
      expect(fields.map((f) => f.name).filter((f) => phi.test(f))).toEqual([]);
      expect(fields.map((f) => f.name).filter((f) => clinical.test(f))).toEqual([]);
      // no support clinical authorization: no relation into the clinical sign-out path
      expect(fields.filter((f) => ['ResultSheet', 'Record', 'RecordStatusEvent', 'AiDraft'].includes(f.type))).toEqual([]);
    }
    // reviewer FK is NON-NULL (human ownership)
    const reviewerField = Prisma.dmmf.datamodel.models.find((x) => x.name === 'HumanReviewDecision')!.fields.find((f) => f.name === 'reviewerUserId')!;
    expect(reviewerField.isRequired).toBe(true);
    // every 6E provenance FK is ON DELETE RESTRICT
    const fks = (await raw.$queryRawUnsafe(
      `SELECT conname, confdeltype::text AS d FROM pg_constraint WHERE contype='f' AND conname ~ '^(HumanReviewRequest|HumanReviewDecision|HumanReviewModifiedFinding|HumanReviewRequestEvent)_.*_fkey$'`,
    )) as Array<{ conname: string; d: string }>;
    expect(fks.length).toBeGreaterThanOrEqual(12);
    expect(fks.every((r) => r.d === 'r')).toBe(true);
  });

  it('assigns a reviewer (workflow only) and fails closed on a cross-lab assignee', async () => {
    const A = await mkLab(); const B = await mkLab();
    const { recordId } = await mkRecord(A);
    const assignee = await mkUser(A);
    const foreign = await mkUser(B);
    const req = await asLab(A, () => svc.createRequest({ inferenceRecordId: recordId }));
    await expect(asLab(A, () => svc.assignReview(req.id, { assigneeUserId: foreign }))).rejects.toThrow(/assignee not found/i);
    const assigned = await asLab(A, () => svc.assignReview(req.id, { assigneeUserId: assignee }));
    expect(assigned.state).toBe('ASSIGNED');
    expect((await raw.humanReviewRequest.findUnique({ where: { id: req.id } }))?.assigneeUserId).toBe(assignee);
  });
});
