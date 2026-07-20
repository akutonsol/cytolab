# Provision the CytoLabs account (silo)

Short checklist for standing up CytoLabs' **own** GCP account/project as the first silo.
CytoLabs owns it (billing, data, domain `cytologylab.com`); you get IAM to deploy + maintain.
Pairs with [`../architecture/TARGET_PLATFORM_ARCHITECTURE.md`](../architecture/TARGET_PLATFORM_ARCHITECTURE.md),
[`DEPLOYMENT.md`](./DEPLOYMENT.md), and [`../migration/CUTOVER_RUNBOOK.md`](../migration/CUTOVER_RUNBOOK.md).

## 1. Account + project
- [ ] CytoLabs GCP org/account created (or identified); a project e.g. `cytolabs-prod`.
- [ ] Grant your deploy identity IAM (Cloud Run Admin, Cloud SQL Admin, Artifact Registry Admin,
      Secret Manager Admin, Service Account User).
- [ ] `gcloud config set project cytolabs-prod`
- [ ] Enable APIs: `gcloud services enable run.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com compute.googleapis.com`

## 2. Data store
- [ ] Cloud SQL Postgres 16 instance (e.g. `osieri-prod`), a DB `osieri`, an app user.
- [ ] Store the connection string in **Secret Manager** (`DATABASE_URL`) — never in code/env plaintext.
- [ ] Also secrets: `JWT_SECRET`, `JWT_PORTAL_SECRET`, GCS creds, any AI keys.

## 3. File storage
- [ ] GCS bucket for uploads (signatures, report PDFs); grant the runtime SA access.

## 4. Images + runtime
- [ ] Artifact Registry repo (e.g. `osieri`).
- [ ] Cloud Run services `osieri-api` + `osieri-web`, and an `osieri-migrate` job (runs
      `prisma migrate deploy` — clean from empty now).
- [ ] HTTPS load balancer + **Google-managed SSL** for `cytologylab.com`; **path-route**
      `/api/v1/*` → API, everything else → web.

## 5. Release pipeline
- [ ] Add this project as a target in `.github/workflows/deploy.yml` (a matrix entry / a second
      workflow with this account's WIF creds). Same image ships here → CytoLabs gets every update.

## 6. Register the silo in the control plane (shared/pool DB)
- [ ] Set the CytoLabs `Lab`: `tenancyMode = SILO`, `databaseSecretRef` = the Secret Manager ref,
      optional `dataRegion`.
- [ ] Add a `LabDomain` row: `hostname = cytologylab.com`, `status = ACTIVE` once TLS is live.
- [ ] `LabFeature` for CytoLabs stays in the **control-plane** DB (silo reads flags centrally).

## 7. Cross-account channel (for Control Center over the silo)
- [ ] Decide: control plane **pulls** (private/cross-account connection to the silo DB) or the silo
      **pushes** telemetry + reads config up. This carries both **monitoring** and **feature flags**.

## 8. Data in
- [ ] **Copy** `pathos_prod` (Cloud SQL export → GCS → import into CytoLabs' instance), **or**
      **re-run the ETL** from legacy into it (needs cross-account access to the legacy VM).

## 9. Go live
- [ ] Deploy (pipeline) → `migrate deploy` → smoke test (login, records, a report).
- [ ] Reset migrated staff logins (sentinel passwords).
- [ ] Cut `cytologylab.com` over per the cutover runbook; keep legacy read-only as rollback.

**What I still need from you to build D/E:** the CytoLabs **project id**, region, and confirmation of
the app host (Cloud Run vs VM). With those I can wire the pipeline target + the silo channel.
