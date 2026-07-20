# P2-R016B-A2 — Dry-Run Audit-Chain Recovery Planner (READ-ONLY)

Generates a **deterministic recovery plan** for the audit hash-chains under the generation-rollover
model (P2-R016B-A1.5). It is **strictly read-only**: it performs Prisma read operations only, opens no
transactions, writes no files, and never touches `AuditChainHead`, event rows, schema, or migrations.
It produces a plan for a later, separately-authorized execution checkpoint — it does **not** execute
recovery.

## What it does

For every chain (`AuditEvent.chainId`), it:

1. **Classifies** the chain with the canonical verifier core (`verifyChainRows`) →
   `VERIFIED` / `COMPROMISED` / `AMBIGUOUS` (>1 terminal), plus head-vs-terminal correspondence.
2. Computes a **versioned verification digest** (`sha256` / schema v1) over a canonical representation
   of ordered event ids, sequences, stored + independently recomputed self-hashes, head state, and the
   verifier result — so a recovery decision is bound to the exact snapshot it planned over.
3. Emits a **recovery plan entry**:
   - `VERIFIED` → `REGISTER_ACTIVE` (backfill this chain as its partition's active g1).
   - `COMPROMISED` / `AMBIGUOUS` → `REGISTER_COMPROMISED_AND_ROLLOVER` with an **honest** recovery
     record: `verificationResult`, `failureReason`, `failureSequence`, `missingPredecessorHash`, the
     raw `verifiedPrefixLength`, and `terminalVerifiedSequence = null` (never a fabricated "last good
     event"). Execution-time fields (`newGenerationId`, `newGenerationChainId`, `recoveredAt`,
     `authorizedBy`) are listed, not assigned.

## Usage

```
cd apps/api
npx ts-node scripts/remediation/audit-chain-recovery/plan.ts          # human-readable
npx ts-node scripts/remediation/audit-chain-recovery/plan.ts --json   # deterministic machine plan
```

Exit code `0` means a plan was produced. Whether recovery is needed is signalled by the plan content
(`plan.summary.rolloversRequired`), not by the exit code.

## Files

- `shared.ts` — pure logic (classification, digest, plan). Reuses `computeSelfHash` and
  `verifyChainRows`; there is no second hash/verify implementation.
- `runtime.ts` — read-only Prisma readers + snapshot binding (git commit, redacted DB identity).
- `plan.ts` — CLI.
- `plan.spec.ts` — pure unit tests over synthetic Case-1/Case-2/AMBIGUOUS/tamper fixtures.

## Guarantees

- **No mutation.** No create/update/delete, no `$transaction`, no head advance, no schema/migration.
- **Deterministic.** For a fixed DB snapshot the JSON plan (classifications + digests) is identical
  across runs.
- **Honest.** A compromised chain never receives a designated terminal verified event.
