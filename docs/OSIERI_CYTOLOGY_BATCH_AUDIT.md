# Osieri — Cytology Batch Management: data-model audit (no module built)

| Field | Value |
|---|---|
| Status | Audit complete — screening-batch module NOT built (no screening batch is modeled) |
| Current Phase | Osieri Phase 2A (Operations) |
| Owner | Founder |
| Dependencies | [docs/OSIERI_OPERATIONS_WORKSPACE.md](OSIERI_OPERATIONS_WORKSPACE.md) §4 B4 |
| Last Updated | 2026-07-10 |
| Priority | P1 |
| Expected Next Milestone | Product decision on a persistent ScreeningBatch model |

Read-only audit for Cytology Batch Management (cytotechnologist screening batches), using the
same methodology as the [IHC](OSIERI_IHC_RETURN_QUEUE_AUDIT.md) and
[Frozen Section](OSIERI_FROZEN_SECTION_AUDIT.md) audits. Conclusion: Osieri has real, persistent
batches — but **none of them is a cytology *screening* batch**. The one persistent batch
(`RequisitionBatch`) is a client requisition-submission/billing batch; the only screening-adjacent
"batch" (`batch-authorize`) is a transient bulk action that persists nothing. Building the
requested module on either would mislabel it, so — **prefer no module over a misleading module** —
**no module was built**. No code or schema was changed.

---

## 1. The ten questions, vs. what the data can prove (for a *screening* batch)

| # | Question | Can the data prove it, for a screening batch? |
|---|---|---|
| 1 | Which cases belong to a screening batch? | **No.** No screening-batch membership exists. `RequisitionBatch` groups submission *forms*, not screening *cases* under a screener. |
| 2 | Who owns the batch? | **No** screener owner. `RequisitionBatch` is owned by a **client** (`submittedById`), not a cytotechnologist. |
| 3 | When was it created/assigned? | Only submission times (`RequisitionBatch.createdAt/submittedAt`) — not a screening assignment. |
| 4 | How many complete / pending / blocked? | `RequisitionBatch` has `totalForms` + a payment/submission `BatchStatus` — not screening progress. |
| 5 | Screening vs pathologist vs AI review? | **No.** No batch carries this distinction. AI screening is tracked **per record** (`AIScreeningResult`, `recordId @unique`), never per batch. |
| 6 | Can cases be reassigned? | **No** screening reassignment. `RequisitionBatch` is client-owned. |
| 7 | Does the batch have a due time / SLA? | **No** batch SLA. Turnaround is per-record only. |
| 8 | What action advances/completes the batch? | `batch-authorize` bulk-authorizes selected records (transient); `RequisitionBatch` advances through submission/payment. Neither advances a screening batch. |
| 9 | Is completion recorded or inferred? | `RequisitionBatch.status = COMPLETED` is recorded — but it is *submission* completion, not screening. A `batch-authorize` run records no batch at all. |
| 10 | Does batch membership persist? | `RequisitionBatch` **yes** (submission forms); `batch-authorize` **no**. Neither persists *screening* membership. |

Only submission-batch facts (2–4, 9–10) are provable, and they answer a different question than
the one asked. The screening-specific questions (1, 5, 6, 7) cannot be answered at all.

## 2. Everything audited (read-only), classified

The directive's four categories, applied to every batch-like thing in the codebase:

- **Persistent operational batch — `RequisitionBatch`.** Real and first-class: `batchNumber`,
  `clientId`, `submittedById`, `BatchStatus` (`DRAFT → PENDING_PAYMENT → PAID → SUBMITTED →
  PROCESSING → COMPLETED → REJECTED`), `totalForms`, payment fields, `forms` (DigitalRequisitionForm[]).
  It is a **client requisition-submission / billing batch**, owned by a referring clinician —
  **not** a cytotechnologist screening batch. Using it as "Cytology Batch Management" would be a
  mislabel.
- **Transient bulk action — `batch-authorize`** (`apps/api/src/modules/batch`). `preview()` filters
  eligible records (Resulted/Processing with an unauthorized, non-empty sheet) and `authorize()`
  bulk-authorizes a selected id list (capped at 50). It **creates no batch entity** — nothing is
  persisted. Per the rules, a bulk UI selection is not a batch unless it is stored; this is not.
- **Inferred grouping — forbidden.** Records could be grouped by shared `status`, `specimenDate`,
  `assignedTo`, or `workspace` (the batch-preview filters), but the directive explicitly forbids
  inferring a batch from shared status/date/user/workspace. Not used.
- **Insufficient evidence — the cytology *screening* batch.** No `ScreeningBatch` /
  cytotech-assignment / screening-worklist model or field exists (confirmed by schema sweep). AI
  screening (`AIScreeningResult`) is per record. There is nothing to observe.

## 3. Decision

**Do not build Cytology Batch Management (screening batch).** Every route to it fails the honesty
test: `RequisitionBatch` would mislabel a billing/intake batch as a screening batch and cannot
answer the screening questions (5, 6, 7); `batch-authorize` is transient and persists no batch;
grouping by shared status/date/assignee is forbidden inference. A screening-batch surface built on
any of these would be misleading. Osieri remains an intelligence layer during Phase 2A.

## 4. A truthful but *different* surface exists (noted, not built here)

`RequisitionBatch` is a genuine persistent batch and could support a truthful **read-only
Requisition Batches** operational view (batch number, client, status, form count, completion,
payment). It is **not** the requested cytology screening batch, and it is already largely surfaced
by the existing portal requisitions views. It is recorded here as an option, deliberately **not**
built under a "Cytology Batch Management" banner, because presenting an intake/billing batch as a
screening batch would be the misleading feature this increment forbids. Whether a dedicated
Operations surface for requisition intake batches is worth building is a separate product question.

## 5. Minimum future model for a truthful screening batch (proposal only — not implemented)

A cytology screening batch needs a first-class persistent entity, e.g.:

```
model ScreeningBatch {           // proposed — NOT created here
  id          String   @id @default(uuid())
  labId       String                       // tenancy (lab-scoped)
  ownerId     String                       // the cytotechnologist / reviewer who owns it
  stage       ScreeningStage               // CytotechScreening | PathologistReview | AIReview
  status      ScreeningBatchStatus @default(Open)  // Open | InProgress | Completed
  dueAt       DateTime?                     // optional batch SLA
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  completedAt DateTime?
  // membership is persisted, not inferred:
  members     ScreeningBatchCase[]          // (batchId, recordId, caseStatus: Pending|Screened|Flagged)
}
```

With this, the ten questions are answerable from recorded data: members (1), `ownerId` (2),
`createdAt`/assignment (3), member `caseStatus` counts (4), `stage` (5), member reassignment (6),
`dueAt` (7), a batch-complete action (8), `status = Completed`/`completedAt` (9), persisted
membership (10). It requires product approval, a migration authored per the project rule, and UI to
create/assign/screen batches so the data is real rather than seeded. Scope and approve as its own
capability.

## 6. Verification note

Nothing to typecheck, build, or pixel-verify: **no code was written**. That is the correct outcome.
Prefer no feature over a misleading feature; unknown is better than fabricated; a billing batch is
not a screening batch.
