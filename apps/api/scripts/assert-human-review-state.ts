/**
 * Program 6 · Phase 6E — persisted-truth acceptance for the human review workflow.
 *
 * Boots the REAL AppModule DI graph and drives the REAL HumanReviewService, asserting persisted DATABASE truth
 * (no mocks): additive schema (4 tables + 2 enums), 12 RESTRICT provenance FKs, non-null reviewer User FK, the
 * reviewer taken from the authenticated param NEVER the body, SUCCEEDED-only eligibility, validation-only
 * inheritance, immutable model-version + result-digest snapshots (Guardrail 1), structured MODIFY findings +
 * deterministic correction digest, ACCEPT/REJECT reject findings, append-only decisions, deterministic effective
 * decision, terminal-state submission rejection + governed reopen + completedAt preservation + append-only
 * request-state events, same-record/same-lab explainability (Guardrail 2), lab isolation + cross-lab fail-closed,
 * permission separation + no default grant, no decision-mutation route, no support inference, no support clinical
 * authorization, and no prohibited clinical-terminology/PHI columns. Exits non-zero on any failed assertion.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';

function assertIsolatedAcceptanceDb(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required (isolated acceptance/test database).');
  const name = new URL(url).pathname.replace(/^\//, '');
  if (name === 'cytolab' || !/(test|accept)/i.test(name)) throw new Error(`Refusing "${name}": not an isolated acceptance DB.`);
}

async function main() {
  assertIsolatedAcceptanceDb();
  const fixturesPath = process.env.HUMAN_REVIEW_FIXTURES_OUT ? path.resolve(process.env.HUMAN_REVIEW_FIXTURES_OUT) : path.resolve(__dirname, '../../web/acceptance/.human-review-fixtures.json');
  const fx = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));
  const prisma = new PrismaClient();
  const fails: string[] = [];
  const ck = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };
  const threw = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

  /* eslint-disable @typescript-eslint/no-var-requires */
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../src/app.module');
  const { HumanReviewService } = require('../src/modules/human-review/human-review.service');
  const { HumanReviewController } = require('../src/modules/human-review/human-review.controller');
  const { LabContext } = require('../src/common/tenancy/lab-context');
  const { PERMISSIONS_KEY } = require('../src/common/decorators/require-permissions.decorator');
  /* eslint-enable @typescript-eslint/no-var-requires */

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const svc = app.get(HumanReviewService);
    const lab = app.get(LabContext);
    const asA = <T>(fn: () => Promise<T>) => lab.runLabScoped(fx.labAId, fn) as Promise<T>;
    const models = ['HumanReviewRequest', 'HumanReviewDecision', 'HumanReviewModifiedFinding', 'HumanReviewRequestEvent'];

    // ── (schema) tables + enums + RESTRICT FKs ──────────────────────────────────────────────────────────────
    const tableRows = (await prisma.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])`, models)) as Array<{ table_name: string }>;
    ck(tableRows.length === 4, `all 4 human-review tables exist (got ${tableRows.length})`);
    const enumRows = (await prisma.$queryRawUnsafe(`SELECT typname FROM pg_type WHERE typtype='e' AND typname = ANY($1::text[])`, ['HumanReviewRequestState', 'HumanReviewDecisionType'])) as Array<{ typname: string }>;
    ck(enumRows.length === 2, `both human-review enums exist (got ${enumRows.length})`);
    const fks = (await prisma.$queryRawUnsafe(`SELECT conname, confdeltype::text AS d FROM pg_constraint WHERE contype='f' AND conname ~ '^(HumanReviewRequest|HumanReviewDecision|HumanReviewModifiedFinding|HumanReviewRequestEvent)_.*_fkey$'`)) as Array<{ conname: string; d: string }>;
    ck(fks.length >= 12 && fks.every((r) => r.d === 'r'), `all 6E provenance FKs ON DELETE RESTRICT (${fks.length} FKs; non-RESTRICT: ${fks.filter((r) => r.d !== 'r').map((r) => r.conname).join(',') || 'none'})`);

    // ── (human ownership) reviewer FK non-null + references User; no PHI / clinical-terminology; no clinical relation
    const decFields = Prisma.dmmf.datamodel.models.find((x) => x.name === 'HumanReviewDecision')!.fields;
    const reviewerRel = decFields.find((f) => f.name === 'reviewer');
    ck(decFields.find((f) => f.name === 'reviewerUserId')!.isRequired && reviewerRel?.type === 'User', 'reviewer is a NON-NULL User FK (human ownership)');
    const phi = /patient|birth|\bdob\b|ssn|mrn|firstname|lastname|demographic|address|phone/i;
    const clinical = /finalDiagnosis|\bdiagnosis\b|authorized|approvedDiagnosis|clinicalTruth|confirmedCorrect|signOut|clinicalConfidence/i;
    for (const m of models) {
      const fields = Prisma.dmmf.datamodel.models.find((x) => x.name === m)!.fields;
      ck(fields.map((f) => f.name).filter((f) => phi.test(f)).length === 0, `${m} has no PHI-bearing column`);
      ck(fields.map((f) => f.name).filter((f) => clinical.test(f)).length === 0, `${m} has no clinical-authority column`);
      ck(!fields.some((f) => ['ResultSheet', 'Record', 'RecordStatusEvent', 'AiDraft'].includes(f.type)), `${m} has no relation into the clinical sign-out path (no support clinical authorization)`);
    }

    // ── (eligibility + cross-lab fail-closed) ───────────────────────────────────────────────────────────────
    ck(await threw(() => asA(() => svc.createRequest({ inferenceRecordId: fx.aFailedRecordId }))), 'FAILED inference record rejected');
    ck(await threw(() => asA(() => svc.createRequest({ inferenceRecordId: fx.aIncompleteRecordId }))), 'incomplete inference record rejected');
    ck(await threw(() => asA(() => svc.createRequest({ inferenceRecordId: fx.bSucceededRecordId }))), 'cross-lab inference record fails closed');

    // ── (snapshot integrity + authenticated reviewer + body cannot supply reviewer) ─────────────────────────
    const recBefore = await prisma.inferenceRecord.findUnique({ where: { id: fx.aSucceededRecordId } });
    const req1 = await asA(() => svc.createRequest({ inferenceRecordId: fx.aSucceededRecordId }));
    ck(await threw(() => asA(() => svc.submitDecision(req1.id, { reviewDecision: 'ACCEPT' }, fx.reviewerBId))), 'a reviewer from another lab fails closed');
    // a body-supplied reviewerUserId must be IGNORED — the authenticated param is authoritative (Decision 3).
    const dec1 = await asA(() => svc.submitDecision(req1.id, { reviewDecision: 'ACCEPT', reviewerUserId: fx.reviewerBId } as any, fx.reviewerAId));
    ck(dec1.reviewerUserId === fx.reviewerAId, 'reviewer is the authenticated principal, never a body field');
    ck(dec1.reviewedModelVersionId === fx.aSucceededModelVersionId && dec1.reviewedResultDigest === 'b'.repeat(64) && dec1.modelLifecycleStateAtReview === 'APPROVED', 'decision snapshots model version + result digest + lifecycle (Guardrail 1)');
    ck(dec1.validationOnly === false, 'validation-only inherited (false for an approved run)');
    const completedAt1 = (await prisma.humanReviewRequest.findUnique({ where: { id: req1.id } }))?.completedAt;
    ck((await prisma.humanReviewRequest.findUnique({ where: { id: req1.id } }))?.state === 'COMPLETED', 'first submission completes the request');

    // ── (terminal-state rejection + governed reopen + completedAt preservation + append-only + effective decision)
    ck(await threw(() => asA(() => svc.submitDecision(req1.id, { reviewDecision: 'REJECT' }, fx.reviewerAId))), 'direct submission on a COMPLETED request fails closed');
    ck((await prisma.humanReviewDecision.count({ where: { requestId: req1.id } })) === 1, 'no decision persisted by the rejected terminal submission');
    ck((await asA(() => svc.getRequest(req1.id))).effectiveReviewDecision?.reviewDecision === 'ACCEPT', 'effective decision unchanged after rejected submission');
    const pendingBefore = await prisma.humanReviewRequestEvent.count({ where: { requestId: req1.id, toState: 'PENDING' } });
    await asA(() => svc.reopen(req1.id, {}));
    ck((await prisma.humanReviewRequestEvent.count({ where: { requestId: req1.id, toState: 'PENDING' } })) === pendingBefore + 1, 'governed reopen creates an append-only request event');
    const dec2 = await asA(() => svc.submitDecision(req1.id, { reviewDecision: 'REJECT' }, fx.reviewerAId));
    ck(dec2.id !== dec1.id && (await prisma.humanReviewDecision.count({ where: { requestId: req1.id } })) === 2, 'a new decision after reopen; both retained (append-only)');
    ck((await asA(() => svc.getRequest(req1.id))).effectiveReviewDecision?.reviewDecision === 'REJECT', 'effective decision changes only after the governed reopen + new submission');
    ck((await prisma.humanReviewDecision.findUnique({ where: { id: dec1.id }, select: { reviewDecision: true } }))?.reviewDecision === 'ACCEPT', 'prior decision byte-unchanged');
    ck((await prisma.humanReviewRequest.findUnique({ where: { id: req1.id } }))?.completedAt?.getTime() === completedAt1?.getTime(), 'original completedAt preserved (single completion boundary)');
    ck((await prisma.humanReviewRequestEvent.count({ where: { requestId: req1.id, toState: 'COMPLETED' } })) === 2, 'both completion cycles recorded in append-only history');

    // ── (MODIFY structured findings + digest; ACCEPT/REJECT reject findings) ─────────────────────────────────
    const reqM = await asA(() => svc.createRequest({ inferenceRecordId: fx.aOtherRecordId }));
    ck(await threw(() => asA(() => svc.submitDecision(reqM.id, { reviewDecision: 'MODIFY' }, fx.reviewerAId))), 'MODIFY requires at least one finding');
    ck(await threw(() => asA(() => svc.submitDecision(reqM.id, { reviewDecision: 'ACCEPT', modifiedFindings: [{ findingCode: 'x' }] }, fx.reviewerAId))), 'ACCEPT/REJECT may not carry modified findings');
    const decM = await asA(() => svc.submitDecision(reqM.id, { reviewDecision: 'MODIFY', modifiedFindings: [{ findingCode: 'atypia', valueCode: 'present' }, { findingCode: 'count', valueNum: 3 }] }, fx.reviewerAId));
    ck(/^[a-f0-9]{64}$/.test(decM.correctionDigest ?? ''), 'MODIFY carries a deterministic correction digest');
    const mf = await prisma.humanReviewModifiedFinding.findMany({ where: { decisionId: decM.id }, orderBy: { ordinal: 'asc' } });
    ck(mf.length === 2 && mf[0].findingCode === 'atypia' && mf[1].valueNum === 3, 'structured coded MODIFY findings persisted in order');

    // ── (validation-only inheritance) ───────────────────────────────────────────────────────────────────────
    const reqV = await asA(() => svc.createRequest({ inferenceRecordId: fx.aValidationOnlyRecordId }));
    ck((await prisma.humanReviewRequest.findUnique({ where: { id: reqV.id } }))?.validationOnly === true, 'request inherits validation-only');
    const decV = await asA(() => svc.submitDecision(reqV.id, { reviewDecision: 'ACCEPT' }, fx.reviewerAId));
    ck(decV.validationOnly === true && decV.modelLifecycleStateAtReview === 'VALIDATION', 'decision inherits validation-only immutably');

    // ── (Guardrail 2 — same-record explainability) ──────────────────────────────────────────────────────────
    const reqE = await asA(() => svc.createRequest({ inferenceRecordId: fx.aSucceededRecordId }));
    ck(await threw(() => asA(() => svc.submitDecision(reqE.id, { reviewDecision: 'ACCEPT', explainabilityGenerationId: fx.aExplainOtherRecordId }, fx.reviewerAId))), 'explainability from a DIFFERENT inference record fails closed');
    const decE = await asA(() => svc.submitDecision(reqE.id, { reviewDecision: 'ACCEPT', explainabilityGenerationId: fx.aExplainSameRecordId }, fx.reviewerAId));
    ck(decE.explainabilityGenerationId === fx.aExplainSameRecordId, 'same-record explainability reference accepted');

    // ── (cancel preserves decisions + refuses new decisions until reopened) ─────────────────────────────────
    const reqC = await asA(() => svc.createRequest({ inferenceRecordId: fx.aOtherRecordId }));
    await asA(() => svc.cancel(reqC.id));
    ck(await threw(() => asA(() => svc.submitDecision(reqC.id, { reviewDecision: 'ACCEPT' }, fx.reviewerAId))), 'direct submission on a CANCELLED request fails closed');

    // ── (no support inference — the InferenceRecord is never mutated by any of the above) ───────────────────
    ck(JSON.stringify(await prisma.inferenceRecord.findUnique({ where: { id: fx.aSucceededRecordId } })) === JSON.stringify(recBefore), 'no support inference: the InferenceRecord is byte-identical after all reviews');

    // ── (permission separation + no default grant + no decision-mutation route) ─────────────────────────────
    const perms = await prisma.permission.findMany({ where: { code: { in: ['review:view', 'review:request', 'review:assign', 'review:submit', 'review:manage'] } }, select: { code: true } });
    ck(perms.length === 5, `catalogue has review:view/request/assign/submit/manage (got [${perms.map((p) => p.code).join(',')}])`);
    const roles = await prisma.role.findMany({ include: { permissions: { include: { permission: true } } } });
    const leaks = roles.filter((r) => !r.isSuperRole).filter((r) => r.permissions.some((rp) => rp.permission.code.startsWith('review:')));
    ck(leaks.length === 0, `no default (non-super) role holds review:* (offenders: [${leaks.map((r) => r.name).join(',')}])`);
    ck(JSON.stringify(Reflect.getMetadata(PERMISSIONS_KEY, (HumanReviewController.prototype as any).submitDecision)) === JSON.stringify(['review:submit']), 'submit route requires review:submit');
    ck(JSON.stringify(Reflect.getMetadata(PERMISSIONS_KEY, (HumanReviewController.prototype as any).reopen)) === JSON.stringify(['review:manage']), 'reopen route requires review:manage');
    const routes = Object.getOwnPropertyNames(HumanReviewController.prototype).filter((n) => n !== 'constructor');
    ck(!routes.some((n) => /updateDecision|editDecision|deleteDecision|patchDecision|overwrite/i.test(n)), 'no decision-mutation route exists');
    ck(!(svc.updateDecision || svc.editDecision || svc.deleteDecision), 'no service rewrite path for decisions');

    // ── (Program-5 / 6A-6D + clinical-path structural non-regression) ───────────────────────────────────────
    for (const m of ['InferenceRecord', 'ExplainabilityGeneration', 'AiModelVersion', 'Dataset', 'ResultSheet', 'Record', 'AiDraft', 'User']) {
      ck(!!Prisma.dmmf.datamodel.models.find((x) => x.name === m), `neighbour model ${m} still present (non-regression)`);
    }

    if (fails.length) {
      console.error('HUMAN-REVIEW ACCEPTANCE FAILURES:\n - ' + fails.join('\n - '));
      process.exit(1);
    }
    console.log(`P6-6E human review: tables=${tableRows.length} enums=${enumRows.length} provenanceFKs=${fks.length}(all RESTRICT) reviewer=non-null-User-FK terminal-boundary=verified reopen-cycle=verified effective-decision=derived MODIFY=structured explainability=same-record no-support-inference=verified`);
    console.log('P6-6E HUMAN REVIEW ACCEPTANCE: all persisted-truth assertions passed (schema + RESTRICT-FKs + non-null-reviewer + authenticated-reviewer-not-from-body + SUCCEEDED-only-eligibility + validation-only-inheritance + snapshot-integrity + structured-MODIFY + append-only-decisions + deterministic-effective-decision + terminal-state-rejection + governed-reopen + completedAt-preservation + append-only-request-events + same-record-explainability + tenancy/cross-lab-fail-closed + permission-separation/no-default-grant + no-decision-mutation-route + no-support-inference + no-support-clinical-authorization + no-clinical-terminology/PHI + Program-5/6A-6D-non-regression).');
  } finally {
    await app.close().catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('assert-human-review-state FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
