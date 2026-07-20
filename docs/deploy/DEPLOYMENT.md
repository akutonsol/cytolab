# Osieri deployment

How to run Osieri in the cloud. Pairs with
[`../architecture/TARGET_PLATFORM_ARCHITECTURE.md`](../architecture/TARGET_PLATFORM_ARCHITECTURE.md)
(the demo / pooled-prod / silo model) and the release pipeline in `.github/workflows/deploy.yml`.

## Images

Two containers, both built from the **repo root** context:

```bash
# API (NestJS) — listens on $PORT, binds all interfaces
docker build -f apps/api/Dockerfile -t osieri-api .

# Web (Next.js standalone) — serves on $PORT
docker build -f apps/web/Dockerfile -t osieri-web .
```

Run locally to smoke-test:
```bash
docker run --rm -p 4000:4000 -e PORT=4000 -e DATABASE_URL=... -e JWT_SECRET=... -e JWT_PORTAL_SECRET=... osieri-api
docker run --rm -p 3000:3000 -e PORT=3000 osieri-web
```

## Recommended host: Cloud Run

One image → deploy per environment (demo, pooled prod, each silo). Per target GCP project:

1. **Artifact Registry** repo (e.g. `osieri`).
2. **Cloud SQL** Postgres + the DB connection string in **Secret Manager**.
3. **Cloud Run** services `osieri-api` and `osieri-web` (+ a `osieri-migrate` job).
4. **Routing:** put both services behind one HTTPS load balancer with **path routing** —
   `/api/v1/*` → API, everything else → web. (In prod the LB routes `/api/v1`, so the web app
   never proxies it; the Next rewrite is a dev-only convenience.)
5. **Managed SSL** cert for the environment's domain (`demo.osieri.com`, `app.osieri.com`,
   or a silo's own domain like `cytologylab.com`).

### Required env / secrets (API)
- `DATABASE_URL` (+ `DATABASE_MIGRATION_URL`) — from Secret Manager, via the Cloud SQL connector.
- `JWT_SECRET`, `JWT_PORTAL_SECRET` — required (the API refuses to boot without them).
- GCS bucket + credentials for file storage; plus any AI keys if enabled.

### Migrations
Run `prisma migrate deploy` (as the `osieri-migrate` Cloud Run job) **before** rolling the API —
the migrate-deploy-from-empty bug is fixed, so it applies cleanly. Never `migrate dev` in prod.

## The release pipeline

`.github/workflows/deploy.yml` builds one image per app on merge to `main`, then deploys the same
image to each environment in the matrix (`demo`, `prod`, and one entry per silo project). This is
what makes updates reach every lab — pooled **and** siloed — from a single release. It ships as a
**scaffold**: set the repo `vars`/`secrets` it lists and flip `if: false` → `true` on the deploy job.

## Silo labs (e.g. CytoLabs, own account)

A silo is just another deploy target in another GCP project:
- Its own Cloud SQL + Cloud Run + domain, in the silo's account.
- The pipeline deploys the **same image** there (add it to the matrix / a second workflow with that
  project's credentials).
- Feature flags + monitoring for the silo flow over the control-plane↔silo channel (see the target
  architecture doc) — flags resolved from the control plane, telemetry reported up.

## Moving data into a new account

- **Copy** the already-migrated `pathos_prod` (Cloud SQL export → GCS → import), or
- **Re-run the ETL** from legacy into the new instance (needs cross-account access to legacy).

See [`../migration/CUTOVER_RUNBOOK.md`](../migration/CUTOVER_RUNBOOK.md).
