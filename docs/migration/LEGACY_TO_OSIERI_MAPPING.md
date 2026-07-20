# Legacy CYTOLAB → Osieri — Data Migration Mapping

**Status:** Draft (mapping locked against the real legacy schema pulled 2026-07-19) ·
**Build:** ETL not yet started · **Owner:** platform

Companions: [`../DATA_MIGRATION_PLAN.md`](../DATA_MIGRATION_PLAN.md) (strategy, interim nightly
sync, target environment) · [`../architecture/HYBRID_TENANCY_AND_CUSTOM_DOMAINS.md`](../architecture/HYBRID_TENANCY_AND_CUSTOM_DOMAINS.md)
(pool/silo & custom domains).

This document maps the **live legacy production database** (`cytologylab_prod`, PostgreSQL 14.5,
Java/Hibernate/JPA + Flyway origin, integer-sequence PKs) onto the **Osieri Prisma schema**
(`apps/api/prisma/schema.prisma`). It is the source of truth for the ETL.

The single most important finding: **Osieri's schema is a modernized descendant of this exact
legacy schema.** Entities line up ~1:1, so the migration is an entity-aligned copy with four
well-scoped transforms — not a from-scratch remodel.

---

## 1. Confirmed decisions

- **Fresh production database.** The legacy import lands in a brand-new prod DB. The demo DB
  (`cytolab-demo`) is untouched and kept for client demos. (DATA_MIGRATION_PLAN §"Target env".)
- **ETL, not `pg_dump`/`pg_restore`.** Legacy JPA schema ≠ Osieri Prisma schema; we transform.
- **Interim nightly sync (Option B).** Nightly re-sync at 19:00, legacy authoritative until
  cutover, final freeze-sync at cutover. (DATA_MIGRATION_PLAN §"Interim sync".)
- **Tenant model (confirmed 2026-07-19):** the whole legacy DB becomes **ONE Osieri `Lab`
  (CytoLabs)** — the processing lab / tenant. The three legacy "Client" workspaces are CytoLabs's
  **referring clients** (they submit requisitions and view results through the **Portal**; they are
  not CytoLabs staff and do not process samples). They become **`Client` rows + a `PortalUser`
  each**, NOT separate labs. Per-client data isolation is provided by the portal, within the one
  lab. See §3.

## 2. Source system snapshot (volumes at 2026-07-19)

| Legacy table | Rows | Legacy table | Rows |
|---|---:|---|---:|
| `clinical_item` (EAV) | 360,193 | `patient` | 29,100 |
| `record_status` | 180,620 | `notification` | 1,622 |
| `result_line` | 125,276 | `requsition` | 1,130 |
| `record` | 32,448 | `client_patient` | 889 |
| `requisition_line` | 32,425 | `auth_attempt` | 832 |
| `result_sheet` | 31,393 | `code_sheet` | 499 |
| `clinical_features` | 30,454 | `role_permission` | 486 |
| `therapy` | 30,452 | `permission` | 170 |
| `labcode_record` | 30,441 | `file_upload` | 17 |
| `specimen` | 30,384 | `role` | 10 |
| `report` | 29,527 | `users` | 4 |
| `result_entry` | 29,526 | `workspace` | 3 (+1 global) |

**Empty / negligible (skip or trivial):** `bill`, `bill_line`, `payment`, `payment_line` = **0**
(no billing data), `appointment` = 0, `secondary_user` = 0, `message*` = 4, `code_finding` = 1.

**Record status distribution:** Approved 31,280 · Completed 804 · Resulted 124 · Submitted 111 ·
Pending 74 · Processing 55 (all six exist in Osieri `RecordStatus` — clean map).

**Case mix:** overwhelmingly Gynecology (Pap). Only ~52 non-gyn cases (`Nature & Source of
Specimen` / `Sample Description` fields).

## 3. Tenant model mapping (the pivotal one)

Legacy top-level grouping is `workspace` (every `patient`/`record`/`notification` carries
`workspace_id`). There are 3 client workspaces + 1 global:

| Legacy `workspace` | domain | identifier | → Osieri |
|---|---|---|---|
| Global Workspace | Global | `global_wksp` | system/default (Account/Workspace default; not a client) |
| BIOMEDICAL LABORATORY | Client | `CBiomedical050-wksp` | **`Client`** + `PortalUser` |
| Gynae Plus | Client | `DSTEWART597-wksp` | **`Client`** + `PortalUser` |
| Microlabs Ltd | Client | `MLimited369-wksp` | **`Client`** + `PortalUser` |

Mapping rules:

- One **`Lab`** row = **CytoLabs** (name, slug `cytolabs`, currency `JMD`, keeps `cytologylab.com`).
- One **`Account`** + default **`Workspace`** under that lab (Osieri requires User/Record to hang
  off an account/workspace; the legacy Global workspace fills this role).
- Each legacy **Client-domain workspace → one `Client`** (`officeName` = workspace name) **+ one
  primary `PortalUser`** (invite-based; password set by the client, never by staff).
- **`record.workspace_id` / `patient.workspace_id` → Osieri `clientId`** (resolve via the
  workspace→Client id-map). This is what scopes each referring lab's cases to its portal.
- **Workspace ↔ client is 1:1 (confirmed 2026-07-19).** Every record in a workspace points to a
  single `client_id`, paired exactly: ws 5 (BIOMEDICAL) → client 7 · ws 6 (Gynae Plus) → client 8 ·
  ws 7 (Microlabs) → client 9. So each referring lab exists in legacy as BOTH a `workspace` and a
  `client` row; both legacy ids resolve to the **same** Osieri `Client` via a paired id-map.
- **Patient → client:** use `patient.workspace_id` (→ paired client). `client_patient` is sparse
  (only 1,007 of 29,100 patients; every one links to exactly **1** client — no fan-out), a legacy
  artifact — ignore it as the primary link.
- **Distribution:** BIOMEDICAL LABORATORY 30,736 records / 27,133 patients (95%) · Gynae Plus
  1,341 / 1,200 · Microlabs Ltd 371 / 371 · Global 0 (empty, system only).

> **Do not** create three Osieri labs. That would split CytoLabs' own bench across three isolated
> systems. The portal already isolates each client's view within one lab.

## 4. ID strategy — integer PK → UUID

Legacy uses integer sequences; Osieri uses `uuid` string PKs. The ETL maintains a persistent
**id-map** per legacy table: `(legacyTable, legacyIntId) → osieriUuid`. Every foreign key is
rewritten through the map. The map is durable (its own table in a staging DB or a keyed store) so
that:

- re-runs are **idempotent** (same legacy row → same UUID), and
- the **nightly incremental sync** can resolve updates/inserts to already-migrated rows.

Natural-key fallbacks (used to detect already-imported rows and to seed the id-map on first run):

| Entity | Natural key (verbatim from legacy) |
|---|---|
| Patient | `registrationno` (`patient.registrationno`, unique) |
| Record | `identifier` (`record.identifier`, unique) + `labnumber` |
| Client | workspace `identifier` (`*-wksp`) |
| LabCode | `code` (unique) |
| User | `email` (unique) |
| CodeSheet | `abbreviation` (unique) |

## 5. Table-by-table mapping

Legacy columns not listed are dropped (audit/system columns like `datecreated`/`dateupdated` map
to `createdAt`/`updatedAt`). Every Osieri row also gets `labId` = the CytoLabs lab.

| Legacy table | → Osieri model | Notes / column mapping |
|---|---|---|
| `workspace` (Client) | `Client` (+ `PortalUser`) | name→officeName; identifier→accountNo/username seed. §3 |
| `patient` | `Patient` | firstname/lastname/middlename, phonenumber, bloodgroup, gender, height, weight, email, dateofbirth→dateOfBirth, identity_token→identityToken, mothermaidenname→motherMaidenName, registrationno→registrationNo. **Drop `age`** (derived from DOB in Osieri). workspace_id→clientId. |
| `record` | `Record` | identifier→identifier; labnumber→labNumber; formtype→formType (Gyn/NonGyn); doctor; clinicaldiagnosis→clinicalDiagnosis; urgent; medicalentry→medicalEntry; billed; status→status (enum §6.4); patient_id→patientId; client_id→clientId; workspace_id→(client scope). **Dates (confirmed):** `datediagnosed`/`datesubmitted` are 100% NULL (dead columns) — ignore. Use `datestatus`→`dateStatus` (99.8% populated), `datecreated`→`createdAt`, and `specimen.datereceived`→`specimenDate`. |
| `record_status` | `RecordStatusEvent` | record_id→recordId; status→status; date_published/datecreated→createdAt. Append-only history (180k rows). |
| `clinical_features` + `clinical_item` | `GynClinicalFeatures` / `NonGynClinicalFeatures` | **EAV pivot — §6.2.** Discriminated by `record.formtype`. |
| `specimen` | `Specimen` | label, vialcolour→vialColour (int→String), antiseruma/b→antiserumA/B, rhsolution→rhSolution, type→type (SpecimenType), bloodgroup→bloodGroup, datereceived→dateReceived, record_id→recordId, client_id→clientId. |
| `therapy` | `Therapy` | hormone/radiation/surgical: **legacy varchar → Osieri Boolean** (non-empty ⇒ true; keep text in `other`). record_id→recordId (1:1). |
| `result_sheet` | `ResultSheet` | authorized, viewed, record_id→recordId; authorized-by/at unknown in legacy → leave null (or infer from report). |
| `result_entry` | `ResultEntry` | resultsheet_id→resultSheetId, specimen_id→specimenId. |
| `result_line` | `ResultLine` | abbreviation, result, findings, abnormalfinding→abnormalFinding, resultentry_id→resultEntryId. **Exact match.** |
| `report` | `Report` | authorizerreference→authorizerReference, content, digitalsignature→digitalSignature, medicalentry→medicalEntry, writtenby→writtenBy (free text; map to writtenById if it resolves to a user), resultsheet_id→resultSheetId, signature_id→(file → GCS). |
| `requsition` | `Requisition` | status→status (RequisitionStatus §6.4), amount→amount (**float→cents §6.3**), datereceived→dateReceived, workspace_id→(client scope). |
| `requisition_line` | `RequisitionLine` | form→formType, iscompleted→isCompleted, isurgent→isUrgent, description→notes, amount→amount (**cents**), record_id→recordId, requisition_id→requisitionId. |
| `labcode` | `LabCode` | code, region. |
| `labcode_record` | (denormalize) | M:N labcode↔record; Osieri has LabCode on Client, not Record — fold into client's labCode or a record tag. **Confirm §12.** |
| `cabinet` | `Cabinet` | label, identifier, color, client_id→clientId. |
| `code_sheet` | `CodeSheet` | abbreviation, description (499 rows — the findings dictionary). |
| `code_finding` | `CodeFinding` | abbreviation, description (1 row). |
| `client` | `Client` (reconcile) | 2 rows — merge with workspace-derived clients (§3, §12). |
| `client_patient` | `Patient.clientId` | 889 M:N links → set patient's client (a patient with multiple clients: pick primary, confirm §12). |
| `users` | `User` | email, firstname/lastname, user_type→role, **password NOT migrated** (§9). role_id→roles. |
| `authorizer` | `User.authorizerDesignation` | type (Pathologist/Cytologist)→authorizerDesignation; digitalsignature/signatureimage→signatureUrl (GCS). Fold into the User (authorizer.user_id). |
| `role` | `Role` | role→name, issuperrole→isSuperRole, type→scope. |
| `permission` | `Permission` | permissioncode→code, name→label. |
| `role_permission` | `RolePermission` | M:N. |
| `auth_attempt` | (skip or `AuthAttempt`) | transient lockout state — safe to skip; re-derives. |
| `notification` | — (**not migrated**) | Legacy is workspace-scoped free text (title/content/type); Osieri `Notification` is per-**user** with a typed enum + read/archive state. No clean mapping — notifications re-derive from live activity post-cutover. |
| `service` | `Service` | name, description, cost (**float→cents**). 3 rows. |
| `tax` | `Tax` | name, percentage, taxcode. 3 rows. |
| `department`,`employee`,`employee_details`,`payroll`,`pay_advice`,`earning`,`deduction` | `Department`/`Employee`/`PayrollRun`/`PayAdvice` | HR/payroll, 2–9 rows each. Low priority; migrate after clinical core. |
| `account`,`account_prefs`,`application_prefs`,`prefs`,`prefsgroup`,`setting`,`value_set` | config | Re-seed Osieri config instead of importing verbatim. **Confirm §12.** |
| `file_upload` | GCS + reference cols | §8. |

## 6. The four transforms

### 6.1 Integer PK → UUID
See §4. Central mechanical task; drives the id-map + FK rewrite.

### 6.2 EAV → typed clinical features (the hard one)
Legacy stores each case's clinical form as loose key/value rows: `clinical_features` (1:1 with
record, id-only) + `clinical_item` (360k rows: `name`, `value`, `datatype`). Osieri stores them as
typed 1:1 models. Only **~18 distinct field names** exist — the full pivot map:

| Legacy `clinical_item.name` | dtype | → Osieri field | Coercion |
|---|---|---|---|
| LMP | text | `GynClinicalFeatures.lmp` | parse date |
| Now Pregnant | bool | `nowPregnant` | bool |
| No. of Pregnancy / No. of Pregnancies | text | `pregnancies` | parse int |
| Routine Check | bool/text | `routineCheck` | coerce→bool |
| Previous Cytology | bool/text | `previousCytology` | coerce→bool |
| Menopause | bool | `menopause` | bool |
| Date of Menopause | text | `dateOfMenopause` | parse date |
| Length of Cycle | text | `lengthOfCycle` | string |
| Leucorrhea | text | `leucorrhea` | string |
| Pelvic Abnormalities | text | `pelvicAbnormalities` | string |
| Clinical Appearance of Cervix | text | `clinicalAppearanceOfCervix` | string |
| Nature & Source of Specimen | text | `NonGynClinicalFeatures.natureAndSource` | string |
| Sample Description | text | `NonGynClinicalFeatures.sampleDescription` | string |
| Clinical Diagnosis | text | `Record.clinicalDiagnosis` (already a column) | reconcile |
| Registration No. | text | `Patient.registrationNo` (already a column) | reconcile |

**Name-variant drift:** the same field appears under multiple `datatype`s/spellings ("Previous
Cytology" text+bool; "Routine Check" bool×2; "No. of Pregnancy" vs "Pregnancies"). The pivot
**coalesces variants by canonical field** and coerces (`"true"/"yes"/"1"` → true). Discriminate
Gyn vs NonGyn by `record.formtype`. This is the only step needing a curated lookup — the table
above IS that lookup.

### 6.3 Money: float → integer minor units
Legacy stores amounts as `double precision` (dollars). Osieri stores `Int` **cents**. Convert
`round(value * 100)`. Applies to `requsition.amount`, `requisition_line.amount`, `service.cost`.
(Billing tables are empty, so `bill`/`payment` amounts don't arise.) `tax.percentage` stays a
percentage.

### 6.4 Enum split
Legacy has one shared `status_enum` (18 values). Osieri splits by domain. Maps:

- **`record.status` → `RecordStatus`:** Approved→Approved, Completed→Completed, Resulted→Resulted,
  Submitted→Submitted, Pending→Pending, Processing→Processing. (Only these 6 occur.)
- **`requsition.status` → `RequisitionStatus`** and **result-sheet/report states** — map at build
  from the actual values present (verify §12).
- `specimen.type` (`specimen_enum`) → `SpecimenType`; `authorizer.type` → `AuthorizerDesignation`;
  `client_type.type` → `ClientTypeEnum`; `patient.gender` → `Gender`.

## 7. Skip list (do not migrate)

`spring_session`, `spring_session_attributes` (Java session store), `flyway_schema_history`
(legacy migration ledger), `message`/`message_header`/`message_thread` (4 rows, defunct),
`appointment` (0), `auth_attempt` (transient), `secondary_user` (0). Elasticsearch + MongoDB are
**not** in this DB (rebuildable / separate; Osieri uses Postgres FTS).

## 8. Files (`file_upload`, 17 rows) → GCS

Legacy `file_upload` (signatures, workspace logos, a few result-sheet PDFs) references blobs on the
VM disk (`uploaddirectory` + `uuid`). Only **17** files — trivial. ETL copies each blob to the
Osieri GCS bucket and rewrites the reference into the typed field:
`users.signatureimage`→`User.signatureUrl`, `workspace.logo`→`Lab.logoUrl`/`Client` branding,
`record.resultsheetfile`→`ResultSheet.fileUrl`. (Only 17 stored PDFs for 31k sheets — Osieri
renders on demand, so we are not moving 31k files.) PHI stays in the customer's cloud; blobs go
GCS-to-GCS.

## 9. Users, auth, passwords (4 users)

Legacy `users.password` + `saltsecret` use the legacy hashing scheme, incompatible with Osieri
`passwordHash`. With only **4 staff users**, do **not** attempt to rehash: create the users with
`isActive`, map roles/authorizer designation, and **issue password-reset/invite tokens at cutover**
(staff set their own password). Portal client logins are invite-based by design (staff never set an
external password).

## 10. Sequences (`LabSequence` seeding)

Osieri generates `Patient.registrationNo`, `Record.labNumber`, `Requisition.referenceNo`, and
per-line accession numbers from per-lab `LabSequence` counters. After import, **seed each counter
above the max legacy value** so newly created records never collide with imported ones. Imported
identifiers are kept **verbatim**.

## 11. ETL architecture (to build)

A standalone, resumable Node/TS job (in `apps/api` tooling or a `packages/etl` workspace) that:

1. **Extract** from a legacy **snapshot/replica** (never the live primary during business hours) —
   read-only, ordered by FK dependency (workspace→client→patient→record→…).
2. **Transform** per §5–§6 (id-map, EAV pivot, cents, enums), with a curated lookup for §6.2.
3. **Load** into the fresh prod DB via Prisma, **idempotent upsert** keyed on the natural key /
   id-map (safe to re-run; the nightly sync reuses this path).
4. **High-water-mark incremental** (Option B): after the first full load, each nightly run pulls
   only rows with `dateupdated > lastRunAt` (+ new inserts), upserts them, at 19:00.
5. **Dry-run + reconciliation:** every run reports per-table source vs target counts and a diff;
   the run **fails loudly** on mismatch. A `--dry-run` mode transforms without loading.
6. **Never touches the live legacy write path.** Extraction is read-only; all writes go to the new
   prod DB.

## 12. Open items

**Resolved 2026-07-19:**
- ✅ **Workspace/client relationship:** 1:1 paired (§3). Patient→client via `patient.workspace_id`;
  `client_patient` is a sparse artifact (ignore). No multi-client patients.
- ✅ **Record dates:** `datediagnosed`/`datesubmitted` are dead (100% NULL). Use `datestatus`,
  `datecreated`, and `specimen.datereceived` (§5).
- ✅ **Requisition status values:** Partial 710 · Completed 433 · Pending 7 → `RequisitionStatus`
  (Partial/Completed/Pending). Verify these three exist in the target enum at build.

**Still confirm at build (non-blocking):**
1. **Exact `client` roster:** confirm clients 7/8/9 are the only real referring entities (the
   `reltuples≈2` estimate was stale; records reference client ids 7–9). Any unreferenced client
   rows = drop or map as contacts.
2. **`labcode_record` M:N:** Osieri attaches LabCode to Client, not Record — confirm the intended
   home (client-level vs a per-record tag).
3. **Result-sheet / report status** target-enum values (from actual legacy values at extract time).
4. **Config tables** (`prefs`, `setting`, `value_set`, `application_prefs`): recommend **re-seed**
   Osieri defaults rather than import.

## 13. Runbook (sequence at cutover — see DATA_MIGRATION_PLAN for the full plan)

1. Provision fresh prod Cloud SQL DB → `prisma migrate deploy` (empty Osieri schema).
2. Seed the CytoLabs `Lab` + `Account` + default `Workspace` + roles/permissions.
3. Full ETL load from a legacy snapshot → reconcile counts → dry-run on staging.
4. Nightly incremental sync (19:00) until go-live; legacy remains authoritative.
5. At cutover: legacy read-only → final freeze-sync → seed `LabSequence` counters → issue staff
   password resets + portal invites → verify → keep legacy as rollback.
