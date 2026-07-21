# Program 4 · Phase D-2A — Foundational Infrastructure (Terraform)

**Status:** Authored for architectural review — **NOT applied**. This is infrastructure-as-code that
**codifies** the D-2A foundational resources per the frozen Environment Specification
`docs/PROGRAM_4_ENVIRONMENT_SPECIFICATION.md` (**Revision 2, `aa2fd28`**). Nothing here has been run:
no `terraform apply`, no `gcloud`, no live GCP resources, no secret values, no DNS, no database work.

## What this provisions (only when later applied)

Strictly the D-2A **identity-independent foundation** in the new production project **`osieri-prod`**
(`us-central1`):

1. **Project bootstrap** — `google_project` (metadata + labels + billing link) and required **APIs**
   (`project.tf`).
2. **Artifact Registry** — Docker repo **`osieri`** + repo-scoped deploy write access
   (`artifact_registry.tf`).
3. **Service accounts** — exactly the four identities from spec §5: `osieri-deployer`, `osieri-api-run`,
   `osieri-web-run`, `osieri-migrate` (`service_accounts.tf`).
4. **IAM** — only the role-level bindings frozen in spec §5d, least-privilege (`iam.tf`).
5. **Cloud Run foundations** — service shells `osieri-api` / `osieri-web` and job `osieri-migrate`
   (`cloud_run.tf`) — **DEFAULT DEFERRED to D-2C** per D-2A ruling (`create_cloud_run_shells = false`);
   see the "Cloud Run shells" note below.
6. **Logging foundations** — Data-Access audit logs + Logging/Error-Reporting APIs (`logging.tf`). **No
   alerting.**
7. **Secret Manager skeleton** — **empty secret containers** named `osieri-prod-<NAME>` (`secret_manager.tf`)
   — **no versions, no values**.
8. **Cloud SQL skeleton (optional, default OFF)** — `cloud_sql.tf`, gated by
   `var.create_cloud_sql_skeleton` (default `false`). **Deferred to D-2B** because instance
   backup/PITR settings depend on the still-blocked backup/DR decision (#11).

## Explicitly EXCLUDED (per the D-2A authorization / still-blocked decisions)

No DNS, domains, SSL certs, Load Balancer, secret **values/versions**, DB restore/migration, PITR,
backups, monitoring **alerts**, CI/CD auth changes, GitHub workflow edits, container **application**
deploys, or cutover. These belong to D-2B / D-2C / D-3 and the blocked HIGH decisions #6/#10/#11.

## Least-privilege IAM (frozen from spec §5d)

- **Deployment authority is not inherited by runtime SAs**; runtime SAs cannot deploy.
- **`roles/iam.serviceAccountUser` is scoped per-SA** (granted on each runtime SA to the deployer) —
  **never project-wide**.
- **Secret access is individual-secret-scoped** (`google_secret_manager_secret_iam_member` per secret),
  not blanket project `secretAccessor`.
- **Migration authority is isolated** — only `osieri-migrate` accesses the `DATABASE_MIGRATION_URL`
  secret and the privileged DB user (created in D-2B, not here).
- **`osieri-web-run` gets no privileged roles** (logging only).
- **Artifact Registry write is repo-scoped**, not project-wide.
- **No primitive roles** (`roles/owner` / `roles/editor`).
- **GCS `objectUser` for `osieri-api-run` is DEFERRED** to when the uploads bucket exists (D-2B) — the
  bucket name (`STORAGE_BUCKET`) is per-env `TBD`.

## Cloud Run shells (review note)

A Cloud Run v2 service/job cannot exist without a container image, so a "shell" would use the **public
placeholder** `us-docker.pkg.dev/cloudrun/container/hello`. **Per the D-2A architectural ruling, all
Cloud Run creation is DEFERRED to D-2C** — the default is now **`create_cloud_run_shells = false`**, so a
D-2A apply creates **no** Cloud Run resources (and no placeholder revisions). The definitions remain in
`cloud_run.tf` for D-2C, where the real `osieri` image, secrets, networking, and scaling are wired in.
Set `create_cloud_run_shells = true` only if shells are explicitly needed early.

## State backend

No remote backend is configured (local state by default). The GCS state bucket is a **bootstrap** step
established in D-2B; a `backend "gcs"` block is intentionally left commented in `versions.tf`.

## How this would be applied (later, after review + separate authorization)

```
cp terraform.tfvars.example terraform.tfvars   # fill real project/billing/org values (never committed)
terraform init
terraform fmt -check                            # formatting clean
terraform validate                              # must pass
terraform plan                                  # review: ZERO unexpected destroys, ZERO drift
terraform apply                                 # ONLY under explicit authorization; not part of this checkpoint
```

**Mandatory apply gate (D-2B prerequisite, per D-2A ruling 8):** before any `terraform apply` is
authorized, `terraform fmt -check` + `terraform validate` must pass and `terraform plan` must show
**zero unexpected destroys, zero drift**, with the **provider lock file committed**. Authoring
(this checkpoint) does not run these — `terraform`/`gcloud` are not present in the authoring environment.
`terraform.tfvars`, state, and any SA key are git-ignored (see `.gitignore`); **no real values are
committed**.
