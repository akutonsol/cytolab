# Cutover readiness — status & open gaps

Living checklist for retiring legacy CYTOLAB and cutting over to Osieri. Tracks the
gaps found in the ETL/migration readiness assessment and what remains. Pair with
[`CUTOVER_RUNBOOK.md`](./CUTOVER_RUNBOOK.md) and [`DATA_MIGRATION_PLAN.md`](../DATA_MIGRATION_PLAN.md).

## Closed

- **Patient de-duplication (app + ETL).** App creation (manual + requisition portal)
  routes through `PatientsService.findOrCreate`, keyed on a deterministic `identityKey`
  (`Patient.identityKey`, `@@unique([labId, identityKey])`). The ETL patient mapper now
  computes the same key and does identity resolution: first row wins, duplicates are
  **aliased** to the survivor in the id-map and skipped, so their records re-point onto
  the surviving patient (no orphans). One patient, many records.
- **Identifier counter seeding.** Post-load stage seeds `patientRegNo`,
  `clientAccountNo`, and per-month `recordLabNo:{YYYY}-{MM}` above the imported
  high-water mark, so app-generated ids never collide with migrated ones.
- **Durable id-map.** Real runs now use `PrismaIdMapStore` (was in-memory only), so
  aliases (workspace↔client and patient dedup survivors) persist across incremental
  runs — the survivor of a dedup stays resolvable when only a duplicate's child row
  changes later.
- **Referential-integrity verification + report artifact.** Reconciliation now also
  LEFT-JOIN-checks every migrated FK for orphans (0 required to pass) and writes a
  timestamped `migration-reports/recon-*.txt` audit artifact.
- **Runbook corrected.** The unverified "full load done / ALL OK (29k patients)" claim
  is flagged as unreproducible and inconsistent with the Terraform target; treat the
  prod DB as not-yet-created until a real load produces a report artifact.
- **Tests.** ETL core (id-map aliasing, reconciliation, patient dedup, sequence
  seeding) now has unit coverage alongside the transform tests.

## Open — needs a decision or information I don't have

These were intentionally NOT attempted because doing them blind would be worse than
the gap (a mapper guessing legacy columns silently mis-migrates; provisioning infra is
a launch decision with cost/DNS side effects).

### 1. Target prod infrastructure not provisioned  — *decided; execute at launch*
**Target decided (2026-07-26): the new isolated project `osieri-prod-9317`** (clean
billing/IaC/CI-CD; CytoLabs as its own silo DB). Cutover is a fresh full load into it
(~2 min). All Terraform (Cloud SQL, Cloud Run, LB, monitoring, CI/CD) is authored +
plan-reviewed but gated OFF; the deploy pipeline is `if: false`. **Remaining action (the
one real blocker):** at launch, flip the provision gates and `terraform apply` (Program
9) — a deliberate, cost-bearing, outward-facing step, now runbook step 1. The 2026-07-20
load into `compact-surfer-318619` was validation only and will not be reused.

### 2. Unmigrated domains — *smaller than it looks; mostly empty in legacy*
No mappers exist for `Bill`/`BillLine`/`BillTax`/`Payment`, `Service`, `Appointment`,
`PatientAddress`/`ClientAddress`, or RBAC role/permission assignments. **But per the
2026-07-19 legacy-schema analysis, the legacy DB has ZERO rows in billing/payments
(`bill`, `bill_line`, `payment`, `payment_line`) and `appointment` is empty** — so those
carry **no data to migrate** and are not data-loss gaps. (Re-confirm the counts at
cutover; the observation is point-in-time.)

Potentially-material unmapped items, if they hold data: **`service`** (priced test
catalog), **patient/client addresses** (if legacy stores address columns), and **RBAC
role→permission assignments**. **Needed to proceed:** re-pull the legacy schema dump
(the earlier `~/Downloads/legacy_schema.sql` + `legacy_table_counts.txt` are gone) — a
`\d+` of `service`, `role`, `role_permission`/`user_role`, and the address columns on
`patient`/`workspace`, plus their row counts. With those, each mapper follows the
reviewed `patient.ts` template.

### 3. Legacy Mongo extraction — *need to know what's in Mongo*
The legacy source is Postgres-only; Elasticsearch is correctly excluded (rebuildable).
**Needed:** confirmation of whether legacy Mongo holds anything material that must
migrate (and its collections/shape). If it's only caches/derived data, this gap closes
as "nothing to migrate."

## Hardening still worth doing (non-blocking)
- Field-level / checksum reconciliation (current integrity is FK-orphan + counts).
- Engine-level integration test against a disposable Postgres (current tests use fakes).
