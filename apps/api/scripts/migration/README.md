# Legacy CYTOLAB → Osieri ETL

Migration/sync tooling. **Not part of the API build** (`scripts/` is excluded from
`tsconfig.build.json`, so this never ships in `dist/`). Runs standalone via `ts-node`.

Spec: [`docs/migration/LEGACY_TO_OSIERI_MAPPING.md`](../../../../docs/migration/LEGACY_TO_OSIERI_MAPPING.md).

## What's here

| Path | What it is | Status |
|---|---|---|
| `mapping.ts` | Enum maps, EAV pivot lookup, money fields, load order | ✅ complete |
| `transforms/` | Pure transforms: coerce, money→cents, enums, EAV pivot | ✅ complete + **unit-tested** |
| `transforms.spec.ts` | 12 unit tests over synthetic fixtures | ✅ passing |
| `core/id-map.ts` | legacy-int → uuid identity map (idempotent) | ✅ complete |
| `core/legacy-source.ts` | Read-only, batched legacy Postgres reader | ✅ complete |
| `core/reconcile.ts` | Source-vs-target count reconciliation | ✅ complete |
| `mappers/*.ts` | All entity mappers: reference tables, client(+PortalUser), patient, requisition(+line), record(+status history), clinical-features (EAV pivot), specimen, therapy, results chain, report, cabinet, user | ✅ complete + type-checked vs Prisma |
| `run.ts` | CLI orchestrator (dry-run / full / incremental) + lab seed + full stage registry | ✅ complete |
| `notification` | Legacy is workspace-scoped free text; Osieri is per-user typed | ⛔ intentionally not migrated (re-derives) |
| durable id-map store + 19:00 scheduler | in-memory store today; nightly job to wire | ⏳ next |

## Safety model

- **Read-only source.** `LegacySource` sets `default_transaction_read_only = on`; run it
  against a **snapshot or read replica**, never the live primary during business hours.
- **PHI stays in the customer cloud.** Run this job inside GCP. Patient data never leaves.
- **Idempotent.** Every entity upserts on its natural key; the id-map gives stable UUIDs.
  Re-runs and the nightly incremental sync converge, never duplicate.
- **Never target the demo DB.** Point `DATABASE_URL` at the fresh prod DB only.

## Running

```bash
# from apps/api
export LEGACY_PGHOST=... LEGACY_PGPORT=5432 LEGACY_PGUSER=ricardo \
       LEGACY_PGPASSWORD=... LEGACY_PGDATABASE=cytologylab_prod
export DATABASE_URL="postgresql://.../cytolab_prod"   # the FRESH prod DB

# transform-only, no writes — exercises every transform + prints reconciliation
npx ts-node scripts/migration/run.ts --dry-run

# full initial load
npx ts-node scripts/migration/run.ts --full

# nightly incremental (19:00) — only rows changed since the given high-water mark
npx ts-node scripts/migration/run.ts --incremental --since=2026-07-19T00:00:00Z
```

### Nightly sync (Option B)

`run-nightly.ts` is the scheduled job. It tracks its own high-water mark in the target DB
(`etl_sync_state`) and advances it only when reconciliation passes — invoke it once at 19:00
via cron / Cloud Scheduler (it is NOT a self-scheduling daemon):

```bash
# crontab (America/Jamaica): 19:00 daily
0 19 * * *  cd /path/to/apps/api && npx ts-node scripts/migration/run-nightly.ts >> /var/log/etl.log 2>&1
```

The first invocation (no mark yet) does a full pull; each subsequent one syncs only rows with
`dateupdated >` the last successful run's start time. The final cutover freeze-sync is just this
job with the legacy DB set read-only.

### Target-DB bookkeeping tables

The ETL creates two small tables in the fresh prod DB (outside the Prisma schema, by design):
`etl_id_map` (legacy-int → uuid, makes re-runs idempotent) and `etl_sync_state` (the nightly
high-water mark). Both are safe to leave in place after cutover, or drop once the legacy system
is retired.

## Tests

```bash
npx jest scripts/migration/transforms.spec.ts
```

## Remaining work

1. **Durable id-map store.** `run.ts` uses `MemoryIdMapStore` — fine for a single-process full
   run, but the nightly incremental sync needs a DB-backed `IdMapStore` (a table keyed by
   `(table, legacyId)`) so mappings survive across runs.
2. **Nightly scheduler.** Wire `--incremental --since=<last run>` to a 19:00 job (cron / Cloud
   Scheduler), tracking the high-water mark per run.
3. **In-cloud dry-run.** Once the fresh prod DB exists, run `--dry-run` then `--full` against a
   legacy snapshot inside GCP and check the reconciliation report.

Order of execution is fixed by `LOAD_ORDER` in `mapping.ts` (FK dependency order).
