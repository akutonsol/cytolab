# Osieri cutover runbook

**Status:** ready · **When:** at launch (deferred until ready to retire legacy CYTOLAB) ·
**Prereq state (done 2026-07-20):** ETL built + validated; full load into prod DB reconciled
`ALL OK` (29,099 patients / 32,448 records / 150,416 result lines / …); migrate-deploy ordering
bug fixed; product renamed PathOS → Osieri. Branch `feat/legacy-etl` (commit + push before cutover).

Companion: [`DATA_MIGRATION_PLAN.md`](../DATA_MIGRATION_PLAN.md) ·
[`LEGACY_TO_OSIERI_MAPPING.md`](./LEGACY_TO_OSIERI_MAPPING.md) ·
[ETL README](../../apps/api/scripts/migration/README.md).

## Facts / connection

- **Prod DB:** GCP Cloud SQL `pathos-prod` (project `compact-surfer-318619`, us-central1),
  database `pathos_prod`, user `postgres`. (The `pathos-*` names are internal infra labels — end
  users never see them.)
- **Legacy:** VM `cytolab-vm-instance` (us-central1-a), container `cytolab-postgres`,
  db `cytologylab_prod`, user `ricardo`. Publishes 5432 on the host.
- **Runner:** Cloud Shell. `cloud-sql-proxy` → new DB on 127.0.0.1:5432; SSH `-L 5433:localhost:5432`
  → legacy. Run long jobs detached (`nohup … & disown`).

## Steps

### 1. Freeze legacy (no new writes during cutover)
Put the legacy app in maintenance / read-only so no new cases are created mid-migration. Confirm no
active users. (Do this in a short maintenance window.)

### 2. Rebuild prod cleanly with real migration history
Now that the ordering bug is fixed, use **`prisma migrate deploy`** (not the from-empty DDL) so
`_prisma_migrations` is populated and the app can manage migrations post-cutover.
```bash
cd ~/osieri/apps/api    # (git pull first if needed)
# proxy + tunnel + env  (see ETL README / prior runbook)
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
npx prisma migrate deploy          # all 64 migrations, clean (bug fixed)
```

### 3. Final freeze-sync (full load, ~2 min)
```bash
nohup npx ts-node --transpile-only scripts/migration/run.ts --full > ~/cutover.log 2>&1 & disown
tail -f ~/cutover.log              # wait for RESULT: ALL OK
```

### 4. Verify
- Reconciliation table = `RESULT: ALL OK` (every table source==target).
- Spot-check a patient→record join and a released report.
- Confirm `labNumber` de-dup count is expected (~825).

### 5. Reset staff logins
Legacy passwords are NOT migrated (sentinel hash). Send password-reset/invite to the migrated
staff users (only a handful) so they can sign in.

### 6. Point the Osieri app at prod + deploy
- Set the app's `DATABASE_URL` (+ `DATABASE_MIGRATION_URL`) to the Cloud SQL prod DB (via the
  Cloud SQL connector / secret, not a raw string in code).
- Deploy the Osieri app.
- Smoke test: staff login, list records, open a case, view a report, create a test case.

### 7. Domain cutover (CytoLabs silo)
Per [`HYBRID_TENANCY_AND_CUSTOM_DOMAINS.md`](../architecture/HYBRID_TENANCY_AND_CUSTOM_DOMAINS.md):
point `cytologylab.com` (managed-SSL LB) at the Osieri app; register the lab as its `SILO` +
`LabDomain`. Keep the old nginx front door until DNS/TLS confirmed.

### 8. Rollback plan
- Keep the legacy system **intact and read-only** for at least a week. If a blocking issue appears,
  revert DNS to legacy (legacy data is unchanged since the freeze).
- The full load is idempotent and repeatable in ~2 min if a re-sync is needed.

## Post-cutover
- Decommission legacy only after a confidence window.
- Optional brand purity: recreate the Cloud SQL instance as `osieri-prod` (empty is cheap; not
  required — infra label only).
