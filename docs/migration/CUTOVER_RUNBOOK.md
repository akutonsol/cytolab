# Osieri cutover runbook

**Status:** ETL code ready; **target = new isolated project `osieri-prod-9317` (decided
2026-07-26), not yet provisioned** · **When:** at launch (deferred until ready to retire legacy
CYTOLAB) · Branch `feat/legacy-etl` (commit + push before cutover).

**Verified (in-repo):** ETL engine + mappers built; transforms and ETL core (id-map aliasing,
reconciliation, patient identity de-dup, counter seeding) unit-tested locally; migrate-deploy
ordering bug fixed; product renamed PathOS → Osieri.

**Target decided (2026-07-26): the new isolated project `osieri-prod-9317`** (NOT the legacy
project). The 2026-07-20 full load that reconciled `ALL OK` (29,099 patients / 32,448 records /
150,416 result lines) ran into `compact-surfer-318619` / `pathos-prod` — that was a **validation
load** and proved the ETL works end-to-end; it is **not** the cutover DB and will not be reused.
Cutover is therefore a **fresh full load** into `osieri-prod-9317` after it is provisioned. Because
the full load is only ~2 min, this costs almost nothing over an incremental delta and keeps prod in
a clean, isolated project (own billing scope + IaC + CI/CD) per the target-platform architecture.
The report artifact from THAT load (step 5) is the go/no-go evidence.

Companion: [`DATA_MIGRATION_PLAN.md`](../DATA_MIGRATION_PLAN.md) ·
[`LEGACY_TO_OSIERI_MAPPING.md`](./LEGACY_TO_OSIERI_MAPPING.md) ·
[ETL README](../../apps/api/scripts/migration/README.md).

## Facts / connection

- **Prod DB (cutover target):** GCP Cloud SQL in the **new isolated project `osieri-prod-9317`**,
  us-central1 — **provisioned by `deploy/terraform/` at step 1 (does not exist yet).** End users
  never see the infra names.
- **Legacy:** VM `cytolab-vm-instance` (us-central1-a, project `compact-surfer-318619`), container
  `cytolab-postgres`, db `cytologylab_prod`, user `ricardo`. Publishes 5432 on the host.
- **Superseded (do not reuse):** `pathos-prod` / `pathos_prod` in `compact-surfer-318619` — the
  2026-07-20 validation load only.
- **Runner:** Cloud Shell. `cloud-sql-proxy` → new DB on 127.0.0.1:5432; SSH `-L 5433:localhost:5432`
  → legacy. Run long jobs detached (`nohup … & disown`).

## Steps

### 1. Provision the isolated prod environment (Program 9)
Target = the **new isolated project `osieri-prod-9317`** (not the legacy project). The Terraform in
`deploy/terraform/` is authored + plan-reviewed (52 add / 0 destroy) but gated OFF and never
applied. At launch, flip the provision gates on and apply — this creates Cloud SQL, Cloud Run, LB,
monitoring, and CI/CD. ⚠️ Cost-bearing and outward-facing; a deliberate go-live step.
```bash
cd deploy/terraform
terraform plan     # re-review: expect the reviewed add-set, 0 destroy
terraform apply    # provisions osieri-prod-9317
```

### 2. Freeze legacy (no new writes during cutover)
Put the legacy app in maintenance / read-only so no new cases are created mid-migration. Confirm no
active users. (Do this in a short maintenance window.)

### 3. Rebuild prod cleanly with real migration history
Point `DATABASE_URL` at the freshly-provisioned `osieri-prod-9317` Cloud SQL DB. Now that the
ordering bug is fixed, use **`prisma migrate deploy`** (not the from-empty DDL) so
`_prisma_migrations` is populated and the app can manage migrations post-cutover.
```bash
cd ~/osieri/apps/api    # (git pull first if needed)
# proxy + tunnel + env  (see ETL README / prior runbook)
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
npx prisma migrate deploy          # all migrations, clean (bug fixed)
```

### 4. Final freeze-sync (full load, ~2 min)
**Prerequisite:** the ETL process MUST have the **same `ENCRYPTION_KEY`** the app uses. The key is
HMAC input for the patient identity fingerprint; a mismatch makes imported identity keys disagree
with app-generated ones, so a returning patient would duplicate after cutover.
```bash
export ENCRYPTION_KEY=…             # MUST equal the app's key
nohup npx ts-node --transpile-only scripts/migration/run.ts --full > ~/cutover.log 2>&1 & disown
tail -f ~/cutover.log              # wait for RESULT: ALL OK
```

### 5. Verify
- Reconciliation table = `RESULT: ALL OK`. This now requires BOTH: every table `source == target +
  skipped`, AND the **referential-integrity** section shows `0 orphans` for every relationship.
- `patient` row shows a `skipped` count = identity duplicates merged (one patient, many records);
  confirm it is in the expected range rather than 0 or implausibly high.
- A timestamped reconciliation **report artifact** is written (`migration-reports/recon-*.txt`, or
  `$MIGRATION_REPORT_DIR`) — archive it as the cutover audit record.
- Spot-check a patient→record join and a released report.
- Confirm `labNumber` de-dup count is expected (~825).

### 6. Reset staff logins
Legacy passwords are NOT migrated (sentinel hash). Send password-reset/invite to the migrated
staff users (only a handful) so they can sign in.

### 7. Point the Osieri app at prod + deploy
- Set the app's `DATABASE_URL` (+ `DATABASE_MIGRATION_URL`) to the `osieri-prod-9317` Cloud SQL DB
  (via the Cloud SQL connector / secret, not a raw string in code).
- Deploy the Osieri app.
- Smoke test: staff login, list records, open a case, view a report, create a test case.

### 8. Domain cutover (CytoLabs silo)
Per [`HYBRID_TENANCY_AND_CUSTOM_DOMAINS.md`](../architecture/HYBRID_TENANCY_AND_CUSTOM_DOMAINS.md):
point `cytologylab.com` (managed-SSL LB) at the Osieri app; register the lab as its `SILO` +
`LabDomain`. Keep the old nginx front door until DNS/TLS confirmed.

### 9. Rollback plan
- Keep the legacy system **intact and read-only** for at least a week. If a blocking issue appears,
  revert DNS to legacy (legacy data is unchanged since the freeze).
- The full load is idempotent and repeatable in ~2 min if a re-sync is needed.

## Post-cutover
- Decommission legacy only after a confidence window.
- Prod already lives in the clean isolated project (`osieri-prod-9317`) — no follow-up infra
  migration needed.
