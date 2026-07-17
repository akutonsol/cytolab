# AI-Screening Simulated-Data Disposition — Governed Runbook (Program 1 · P1-3B)

Environment-specific historical-data remediation for the **75 conclusively-simulated
`AIScreeningResult` rows** established in P1-3A. This is **operational tooling, not a
Prisma migration** — it must never run in application startup, seed, or migration paths,
and must not execute in new/restored/staging/customer environments by accident.

**Default posture: dry-run, fail-closed.** No secret, key, PHI, or destination path is
embedded. Nothing here mutates a database unless every precondition passes and the
explicit destructive flag is supplied.

> ⚠️ **Production execution requires documented compliance/data-owner approval.** The
> repository proves no *technical* retention/legal-hold references these rows; it does
> **not** prove the absence of an organizational/contractual/regulatory obligation.

## Commands
| Script | Purpose | Mutates? |
|---|---|---|
| `discover.ts` | Fingerprint the population; validate the simulated signature | No (read-only) |
| `export.ts` | Encrypted evidence package (AES-256-GCM) + non-PHI manifest | Writes files (external dest only) |
| `delete.ts` | Transactional, id-targeted deletion of the verified population | Yes (behind destructive flag) |
| `restore.ts` | Emergency all-or-nothing restore from the encrypted evidence | Yes (behind destructive flag) |

Run with `npx ts-node scripts/remediation/ai-screening/<cmd>.ts <flags>` from `apps/api`.

## Mandatory flags for a real deletion
```
delete.ts --manifest <path> --expected-count 75 --expected-labs 2 \
  --environment production --confirm-contained \
  --execute-destructive-disposition
```
Omitting `--execute-destructive-disposition` → dry-run (asserts everything, deletes nothing).

## Encryption key
Supply a 32-byte hex key via `AISCREENING_REMEDIATION_KEY` (approved secret channel only).
Never place keys, passwords, or salts in code or command history. Approval reference may be
supplied via `DISPOSITION_APPROVAL_REF` for the receipt.

## Governed sequence
### Before execution
1. Obtain compliance/data-owner approval; record the approval reference.
2. Confirm database backup / point-in-time-recovery health.
3. Confirm runtime containment is deployed and `AI_SCREENING` is enabled for **0/16** labs.
4. Confirm the live table population with `discover.ts`.
5. Select a **protected external** export destination (outside the repo — the tooling refuses repo paths).
6. Obtain the encryption key via the approved secret mechanism.

### Export
1. `discover.ts` — review aggregates; must report **PASS** (75 rows, 2 labs, all "Field N" signature, containment active).
2. `export.ts --environment <env> --out <external.enc> --manifest <external.json>` — writes the encrypted evidence + non-PHI manifest atomically (temp → verify decrypt+checksum → rename).
3. Verify decryptability + row/population checksums (the script does this before finalising).
4. Securely store the encrypted package; preserve the manifest + any receipt.

### Delete
1. Schedule a controlled operational window.
2. Dry-run `delete.ts --manifest <json> --environment <env>` — confirm **preconditions PASS**.
3. Execute with the full destructive flag set (above). The core runs one transaction:
   re-read → assert (exact IDs, count=75, labs=2, per-row checksum, simulated signature,
   containment active, no drift) → `deleteMany` by exact IDs → assert 75 deleted & absent → commit.
   Any mismatch aborts and rolls back.
4. Capture the execution receipt (non-PHI).

### Verify
- Targeted IDs absent; table count reflects the expected result.
- Parent `Record`/`Lab`/`User` rows intact (leaf deletion — no cascade).
- Containment + terminology tests pass; Sign-Out still shows the truthful "not available" band.
- Builds + TypeScript clean; no other tables changed.

### Rollback (emergency only)
1. Stop further operations.
2. `restore.ts --in <external.enc> --environment <env> --execute-destructive-disposition`
   (authenticates via GCM tag, refuses if any target ID already exists, all-or-nothing insert).
3. Verify restored checksums against the manifest; document the rollback.

## Safety controls (enforced)
- Dry-run default; explicit `--execute-destructive-disposition` required to mutate.
- Manifest self-checksum + per-row + population checksums; drift/tamper aborts.
- Simulated-signature revalidation at delete time ("Field N" region rule).
- Containment gate (`AI_SCREENING` enabled == 0).
- Targeted `deleteMany({ id: { in } })` only — never `TRUNCATE`, unbounded delete, date/lab/status-only, or cascade.
- Evidence is AES-256-GCM only; plaintext never written; repo-path destinations refused.
- Not interactive-prompt-dependent; flags are the protection.

## What this is **not**
Not a migration. Not app runtime. Not an organizational audit/compliance process. The
receipt is operational evidence only.
