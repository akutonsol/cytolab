# Osieri — Backup & Disaster Recovery Runbook

**Status:** Readiness definition (D-6). The backup mechanics are defined in Infrastructure-as-Code; a
live restore drill is a Program 9 activity (requires a provisioned instance). **No infrastructure is
provisioned by this document.**
**Scope:** the production Cloud SQL PostgreSQL 16 instance `osieri-prod-pg` (project `osieri-prod-9317`).
**Companion:** `docs/migration/CUTOVER_RUNBOOK.md`, `PROGRAM_4_DEFERRED_ITEM_REGISTER.md` §E.

---

## 1. What is defined in IaC (`deploy/terraform/cloud_sql.tf`)

| Control | Setting | Purpose |
|---|---|---|
| Automated backups | Enabled, daily @ **03:00 UTC** | Nightly full backup |
| Backup retention | **14** backups (COUNT) | ~2 weeks of restore points |
| Point-in-time recovery | **Enabled**, `transaction_log_retention_days = 7` | Restore to any second within 7 days |
| High availability | **REGIONAL** (standby in another zone) | Automatic failover on zone failure |
| Deletion protection | **On** at Terraform + API layers | Prevents accidental instance deletion |
| Disk autoresize | On | Prevents out-of-space outages |

These are inert until Program 9 sets `var.provision_cloud_sql = true`.

## 2. Targets (proposed — ratify in Program 9)

- **RPO (max data loss):** ≤ 5 minutes — bounded by PITR (WAL archiving); a zone failure fails over to
  the REGIONAL standby with near-zero loss.
- **RTO (max downtime):** ≤ 1 hour for a full restore-to-new-instance; seconds–minutes for an automatic
  HA failover.

## 3. Recovery procedures

**A. Automatic HA failover (zone loss)** — no action required; Cloud SQL promotes the standby. Verify
via the console/alerts (Stage 6 covers the CPU/uptime alerts). Cloud Run reconnects through the Auth Proxy.

**B. Point-in-time recovery (bad write / logical corruption within 7 days)**
```
gcloud sql instances clone osieri-prod-pg osieri-prod-pg-pitr \
  --point-in-time 'YYYY-MM-DDTHH:MM:SSZ' --project osieri-prod-9317
```
Validate the clone, then repoint the app (update the `DATABASE_URL` secret's connection name) or promote.

**C. Restore from a backup (instance-level)**
```
gcloud sql backups list --instance osieri-prod-pg --project osieri-prod-9317
gcloud sql backups restore <BACKUP_ID> --restore-instance osieri-prod-pg --project osieri-prod-9317
```
(Restoring onto the same instance overwrites it; prefer cloning to a new instance first to verify.)

**D. Full loss of the instance** — recreate from IaC (`terraform apply` with the provision gate on),
then restore data from the latest backup or, at initial cutover, re-run the migration + data load per
`CUTOVER_RUNBOOK.md`.

## 4. Application-layer backup (separate from Cloud SQL)

The app also has a backup module (Google Sheets / GCS export — `apps/api/src/.../backup.service.ts`,
`STORAGE_BUCKET` / `BACKUP_SHEET_ID`). That is a convenience export, **not** the DR system of record;
Cloud SQL automated backups + PITR are authoritative. Confirm bucket retention/versioning at launch
(ENV SPEC #13, Register §E).

## 5. Deferred to Program 9 (operational verification — cannot be done cost-free)

- Execute a **restore drill**: clone via PITR, connect, verify row counts + a spot PHI decrypt, tear down.
- Ratify RTO/RPO against the drill's measured timings.
- Confirm GCS bucket retention/versioning for the app-layer export.
- Decide backup **location** (region vs multi-region) and any cross-region DR copy.
