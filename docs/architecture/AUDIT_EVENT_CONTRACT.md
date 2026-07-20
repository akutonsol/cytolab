# Osieri — Canonical Audit Event Contract

**Program:** 2 — Enterprise Audit Platform · **Checkpoint:** P2-0A-R (contract & governance baseline).
**Status:** Governance document. Binding contract for every audit producer. **Design only** — this
document defines shape, serialization, versioning, and policy. It creates **no** database model,
migration, runtime recorder, request-context change, capture wiring, hash chain, permission, query
API, UI, or export. Those are separate, separately-reviewed checkpoints (P2-1…P2-10).

> **Enforcement language.** Everything below is **prohibited/required *by contract* now**. These
> properties become *enforced and certified* only after P2-1 (typed boundaries + architecture tests),
> P2-3 (exclusive capture wiring + durability), P2-4 (integrity implementation), and P2-10
> (certification). Do not describe any guarantee as "impossible by construction" until those land.

---

## 1. Authority & ownership
The **Audit Platform** is a new owner-first bounded context and the system of record for every
security- and compliance-sensitive event in Osieri. It **records facts; it never mutates domain
state**, and no other owner mutates audit rows (consistent with Decision Records D-002 one-owner,
D-011 events-are-history, D-019 compositions-never-write).

Existing domain events — `RecordStatusEvent`, `ResultSheetEvent`, `ChangeRequestEvent`,
`TrackingEvent`, `ClockEvent`, `LoginAttempt`, `SecurityAlert`, etc. — remain owned by their domains
and become **producers** into this contract. They are **not** migrated or merged.

**`AuditRecorder.record()` is the only write API.** No owner constructs or inserts an audit row
directly. `prisma.auditEvent.*` outside the Audit owner is prohibited.

## 2. Canonical envelope
```
AuditEvent
├─ identity
│  ├─ eventId                  platform-owned
│  ├─ occurredAt               producer-supplied ONLY for a fact that already happened; else platform stamps
│  ├─ recordedAt               platform-owned
│  ├─ schemaVersion            platform-owned
│  ├─ eventVersion             registry-owned (resolved from the registry, not the producer)
│  └─ sequence                 platform-owned (per-chain monotonic; set at append)
├─ classification
│  ├─ category                 (the ONLY place category lives)
│  ├─ severity
│  ├─ phiIndicator
│  ├─ dataClass
│  ├─ retentionClass
│  └─ exportable
├─ actor
│  ├─ actorType                staff | portal | service | system | anonymous
│  ├─ actorId?
│  ├─ onBehalfOfActorId?       delegation
│  └─ servicePrincipal?        for service/system actors
├─ organization
│  ├─ scope                    lab | system | cross-lab
│  ├─ labId?                   REQUIRED iff scope = lab; ABSENT otherwise
│  └─ organizationId?
├─ request?                    present per the event type's attribution policy (§7)
│  ├─ requestId
│  ├─ correlationId
│  ├─ ipAddress?
│  ├─ userAgent?
│  ├─ deviceId?
│  ├─ apiRoute?
│  └─ httpMethod?
├─ session?                    present per the event type's attribution policy (§7)
│  ├─ sessionId
│  └─ sessionKind              staff | portal | service
├─ resource
│  ├─ resourceType
│  ├─ resourceId?
│  ├─ resourceLabId?
│  ├─ parentResourceType?
│  ├─ parentResourceId?
│  └─ patientRef?              opaque pseudonymous token — see §10
├─ action
│  ├─ code                     (the ONLY place the action verb lives)
│  └─ detailCode?              structured code, not free text
├─ outcome
│  ├─ status                   success | failure | denied | error
│  ├─ statusCode?
│  ├─ errorCode?
│  └─ reasonCode?              bounded enum / reason code
├─ change?
│  ├─ beforeHash?              canonical hash of prior values — NEVER raw values
│  ├─ afterHash?               canonical hash of new values — NEVER raw values
│  └─ changedFields?           field NAMES only
├─ integrity                   platform-owned (P2-4)
│  ├─ chainId
│  ├─ prevHash
│  ├─ selfHash
│  └─ hashAlgorithm
└─ metadata
   ├─ producerModule
   ├─ executionId?             e.g. background-job / governed-operation run id
   └─ (typed, registry-defined, bounded event-specific metadata — NOT a free map)
```

**Correction applied:** `category` lives only under `classification`; the action verb lives only
under `action.code`. The registry identity of an event is **`(category, action.code, eventVersion)`**.

## 3. Platform-owned vs. producer-supplied fields
| Platform-owned (producers MUST NOT set) | Producer-supplied |
|---|---|
| `identity.eventId`, `identity.recordedAt`, `identity.sequence`, `identity.schemaVersion` | `classification.category`, `action.code`, `action.detailCode?` |
| `identity.eventVersion` (resolved from the registry) | `resource.*`, `outcome.*` |
| `integrity.*` (chainId, prevHash, selfHash, hashAlgorithm) | `change.{beforeHash?, afterHash?, changedFields?}` |
| `actor`/`organization`/`request`/`session` (auto-merged by the recorder from request context, P2-2) | `classification` overrides where the registry permits; `metadata` (typed) |
| | `identity.occurredAt` **only** when recording an earlier fact; otherwise the recorder stamps it |

## 4. Producer contract
```
Controller → Owner Service → AuditRecorder.record(input) → Audit Owner (append-only)
PROHIBITED:  Owner → prisma.auditEvent.create(...)
```
- Emit at **real mutation sites** inside owner services (the `RealtimeGateway.emitToLab` pattern); never in a composition (D-019); never controller-only.
- Producers pass **domain facts only**; the recorder auto-merges actor/organization/request/session/correlation from the request-context store (P2-2) and stamps identity + integrity.
- Canonical input shape:
  ```ts
  type AuditRecordInput = {
    occurredAt?: string;              // only for an earlier fact; else recorder stamps
    category: AuditCategory;
    action: AuditActionCode;          // registry constant
    resource: AuditResourceInput;
    outcome: AuditOutcomeInput;
    classification?: AuditClassificationOverrides;
    change?: AuditChangeInput;        // hashes + field names only
    metadata?: AuditMetadataInput;    // registry-typed per (category, action)
  };
  ```
- **Prohibited for producers:** setting any platform-owned field (§3); passing raw PHI or raw before/after values anywhere; referencing `prisma.auditEvent`; using string literals for category/action instead of registry constants.

## 5. Deterministic canonicalization
- **Canonical JSON:** UTF-8; object keys sorted lexicographically; no insignificant whitespace; timestamps UTC ISO-8601 with milliseconds; `undefined` omitted, explicit `null` preserved; numbers in shortest round-trip form.
- **Integrity input (consumed by P2-4):** `bytesToHash = canonical(event minus integrity.selfHash) ‖ prevHash`; `selfHash = SHA-256(bytesToHash)` (hex), reusing `common/crypto/phi-crypto.sha256`. `hashAlgorithm` names the scheme so it may evolve.
- Field-size caps; `changedFields` bounded; `metadata` is a typed per-event schema, not an arbitrary map.

## 6. Dual versioning (independent concerns)
- **`schemaVersion` — storage/envelope format.** Bumped when the persisted shape/columns change. Old rows remain readable; queries and the verifier tolerate multiple `schemaVersion`s; historical rows are never rewritten (immutability).
- **`eventVersion` — semantic meaning of a specific `(category, action.code)`.** Registry-owned; bumped when the meaning or required metadata of that event type changes; consumers switch on `(category, action.code, eventVersion)`.
- **Additive-evolution rule (mirrors D-010):** prefer new optional fields, categories, and actions; a field is never repurposed and never has its meaning changed without an `eventVersion` bump and a registry entry.

## 7. Attribution policies (conditional request/session)
Request and session context are **not universally required**. Each event type declares its attribution
requirements in the registry:
| Origin | Required attribution | Absent |
|---|---|---|
| **HTTP-originated** (staff/portal API) | `request.requestId` + `request.correlationId`; `actor` | — |
| **Portal session** | above + `session.sessionId` (`sessionKind=portal`) | — |
| **Service actor** | `actor.servicePrincipal` + `request.correlationId` | request/session |
| **Background job** | `metadata.executionId` (job/run id) + `request.correlationId`; `actorType=service|system` | `request.requestId`, `session` |
| **System event** | `actorType=system` + `request.correlationId` | request/session |
| **Governed maintenance** (e.g. P1-3C) | `actorType=service|system` + `metadata.executionId` + approval linkage | request/session |
The registry defines a per-event **attribution policy**; the recorder enforces it and fails closed if a
required field for that policy is missing.

## 8. Category / action registry requirements
A single typed registry maps every `(category, action.code)` → `{ currentEventVersion, defaultSeverity,
phiIndicator, dataClass, retentionClass, attributionPolicy, durabilityClass, metadataSchema }`, seeded
from the P2-0 taxonomy (Authentication, Authorization, PHI Access, Record lifecycle, Clinical workflow,
Administrative, Configuration, Exports, Security, API access, Background jobs, System, Data
maintenance). Producers import registry constants; string literals are prohibited. The registry is the
machine-readable half of this contract and the source the P2-10 coverage matrix checks against.

## 9. Durability classes (delivery policy deferred to P2-3)
Audit events **must never be silently lost.** Each event type is assigned a **durability class**; the
concrete transactional-outbox / synchronous / asynchronous delivery model is **selected in P2-3**.
| Class | Meaning | Examples |
|---|---|---|
| `CRITICAL_TRANSACTIONAL` | Must be durably recorded atomically with (or gating) the business change | role/authorization changes, exports, governed deletions |
| `REQUIRED_DURABLE` | Must be durably recorded; may use a transactional outbox | PHI reads, clinical lifecycle actions |
| `OPERATIONAL` | Best-effort durable; async acceptable | system startup, routine background-job completion |
An **in-memory retry buffer alone must not** satisfy the durable classes. Whether a business
transaction may commit ahead of the audit write depends on the class and is a P2-3 decision — this
contract does **not** pre-commit to "the business operation is never blocked."

## 10. Sensitive-data & PHI policy
- **No raw clinical content and no direct patient identifiers** (name, MRN, accession, DOB, …) may be stored in any audit field.
- A `resource.patientRef` is a salted, opaque **pseudonymous** token. It is **linkable, health-related data** and is therefore classified as **PHI or confidential security data by policy** — **not** "non-PHI." It remains protected by audit access controls and retention.
- The following are **sensitive** and protected: `ipAddress`, `userAgent`, `deviceId`, `session.sessionId`, `actor.actorId`, `resource.patientRef`.
- **Minimize/prohibit free text** rather than relying on a validator to prove arbitrary text safe:
  - `action.detailCode` — structured, registry-defined code where possible.
  - `outcome.reasonCode` — bounded enum / reason code by default.
  - Arbitrary free text — **prohibited unless a specific `(category, action)` explicitly allows it in the registry**, in which case it is bounded and passes a PHI gate as **defense-in-depth**, not as the primary control.
  - `metadata` — a **typed per-event schema**, never an unrestricted map.

## 11. Tenancy & scope invariants
No fabricated/sentinel lab id is ever used. `organization.scope` governs tenancy:
- `scope = lab` → `labId` **required**.
- `scope = system` → `labId` **absent**.
- `scope = cross-lab` → `labId` **absent**; affected lab ids belong in bounded `resource`/`metadata`, and a cross-lab event **must never masquerade as belonging to one tenant**.
Audit queries are lab-scoped by default; cross-lab/system visibility is a superuser scope (interaction with the tenancy extension is a P2-6 design point).

### 11a. Audit-ledger reads are themselves audited (P2-7C)
Reading the audit ledger with the **PHI projection** (`includePhi=true`, authorized by `audit:read_phi`) is a
sensitive act and is itself captured as `SECURITY:AUDIT_EVENT_PHI_ACCESSED`:
- **Granularity:** exactly **one** event per successful PHI request (never per returned row). List records the
  number of items released (`resultCount`; **zero still emits**); detail records `resultCount = 1` and the
  accessed event as the `resource`.
- **Not captured:** base/redacted queries (no PHI projection), rejected authorization, malformed requests, failed
  queries, and inaccessible/nonexistent detail rows.
- **Fail-closed:** the PHI response is released **only after** the capture event is durably appended. If capture
  fails the response is withheld (it never downgrades to the base projection). Base/redacted reads are unaffected.
- **Scope of the capture:** ordinary own-lab reads capture as **LAB**; any elevated/system-authorized read
  (SYSTEM/CROSS_LAB scope, or an explicit lab selection made under `audit:read_system`) captures as **SYSTEM** via
  the P2-6E0 `runSystemAsCurrentActor` bridge, preserving the acting operator's attribution. `metadata.queryScope`
  records the governed query scope; the envelope scope records the authority context.
- **Privacy:** the capture event is **non-PHI** (`phiIndicator=false`) and its bounded metadata carries no
  `patientRef`, no queried-event metadata, no raw filter values, no cursor, and no exact lab-id list.
- **Recursion** is guarded async-context-locally (a capture → recorder → query → capture execution loop is
  suppressed); a later query that returns a prior capture event is legitimate historical accountability, not
  recursion. Chain **verification** remains outside the query API (P2-9/P2-10).

### 11b. Audit Query API — certification (P2-7D)
The Audit Query API (P2-7A–C) is certified as complete and operationally ready:
- **Coverage:** every PHI-bearing response path (LAB / SYSTEM / CROSS_LAB / elevated-explicit-LAB × list / detail
  × zero-result / single / multi-page) emits **exactly one** capture; every base/redacted path emits **none**.
- **Fail-closed:** a failure in the capture append **or** the recursion guard withholds the PHI response (no
  base fallback, no silent downgrade). **Base/redacted reads remain fully available** even when the capture
  (ledger-write) path is unavailable — an intentional accountability-over-availability trade for PHI reads only.
- **Ownership:** `AuditQueryService` is the sole production operational reader of the ledger; append and verifier
  are untouched; no other direct `prisma.auditEvent` reader exists (architecture-tested).
- **Pagination/filters/projection:** opaque keyset cursor (`recordedAt` desc, `id` desc) is duplicate-/skip-free
  across equal timestamps; filters are allow-listed and bounded (24h default, 31d max, page ≤ 100, ≤ 25
  multi-values); base projection never selects `patientRef`; unknown metadata versions are redacted.
- **Performance/index:** every predicate is index-backed (`[scopeLabId, recordedAt]`, `[recordedAt]`,
  `[category|actorId|correlationId|resourceType,…]`, PK for the id tie-break); time-bounded + `take = pageSize+1`
  keeps reads O(page); the capture append is O(1). No index/schema change is required.
- **Concurrency:** the AsyncLocalStorage recursion guard isolates concurrent requests — no duplicate, missed, or
  cross-leaked captures.

### 11c. Governed audit-log export (P2-9A)
Exporting the audit ledger is a governed **egress** boundary (`POST /api/v1/audit/events/export`), NOT a second
query. It reuses the frozen `AuditQueryService` reader + the certified `AuditEventView` projection (CSV/NDJSON
serialization only; no export-specific data model), so authorization, resolved scope, PHI gating, and concealment
are inherited — an export can only ever contain rows the same principal could read interactively under the same
predicate, scope, and projection. Export authority never exceeds interactive read authority (`audit:read`,
`+audit:read_system` for SYSTEM/CROSS_LAB, `+audit:read_phi` for `projection=phi`); no new permission exists.
- **Single action:** the export is captured as `DATA_EXPORT:AUDIT_EXPORTED` (**not** `EVIDENCE_EXPORTED`, which is
  the broader "evidence left the system"; **not** `PHI_ACCESS:PHI_EXPORTED`). PHI is an **attribute** of the
  export, expressed by `metadata.projection` (`base | phi`) — there is deliberately **no** separate `phi` boolean
  and no separate PHI-export action. `CRITICAL_TRANSACTIONAL`, non-PHI, `PERMANENT`.
- **Capture-before-egress:** the bounded snapshot is assembled and serialized in memory, then the export event is
  captured **transactionally, before any response byte is written**. A capture failure propagates → zero bytes.
- **Logical export, NOT transport delivery.** `AUDIT_EXPORTED` records the governed **logical** export — *this
  export was authorized and prepared for egress* — **not** a guarantee that the client received every transmitted
  byte. Because capture commits before egress begins, it cannot observe the socket; a post-commit client
  disconnect does not un-happen the authorized export. The metadata therefore carries dataset facts
  (`exportedCount`, `truncated`) and **deliberately no byte-count or delivery-confirmation field**. A future
  transport-receipt concern, if ever needed, is a **distinct** event — never an extension of this one.
- **Bounded + coherent snapshot:** assembly iterates the frozen keyset reader up to a server-owned cap
  (`truncated` is truthful) with the page-1 time window **pinned** across all pages (no `now()` drift); the export
  never contains its own `AUDIT_EXPORTED` row (it is appended after assembly).
- **Privacy of the capture:** bounded, non-PHI metadata only — `projection`, `format`, governed `queryScope`,
  `selectedLabCount` (count, never lab ids), `exportedCount`, `truncated`, `cap`, and a value-free `filterClass`
  (predicate shape, never the raw filters). No raw predicate, lab id, patient id, correlation id, or free text.
- **R-016 fail-closed:** the export capture is scoped by `isSystemReader(principal)` (the P2-7C precedent), so **any
  elevated/system-authorized reader captures SYSTEM regardless of the export's query scope** and therefore fails
  closed on the corrupted shared `system` chain exactly like a SYSTEM PHI read — no fallback, no durability
  downgrade, zero bytes. Demonstrated in P2-9B: **all** elevated-reader exports (base + PHI, CSV + NDJSON) fail
  closed; a non-elevated LAB reader captures on the intact LAB chain. This makes R-016 a Program 2 **release
  blocker** (RISK_REGISTER.md R-016; remediation = the P2-R016 checkpoint, before P2-10). P2-9A/P2-9B are correct
  and unchanged. The confirm-and-download UX is P2-9B.

## 12. Prohibitions (by contract)
1. No update or delete of any audit event, ever (immutable).
2. `AuditRecorder` is the only writer; no `prisma.auditEvent` outside the Audit owner.
3. No raw PHI or raw before/after values — hashes and opaque refs only.
4. No composition writes; the Audit owner writes only its own table.
5. Producers cannot set platform-owned fields (§3) or forge integrity.
6. No sentinel lab id; scope invariants (§11) hold.
7. Every event's `(category, action.code, eventVersion)` exists in the registry.
8. No unrestricted free text or untyped metadata.

## 13. Deferred implementation boundaries
This checkpoint defines the contract only. Deferred: `AuditEvent` schema + isolated migration (P2-1);
request-context extension `+` `AuditContextInterceptor` (P2-2); `AuditRecorder` + owner capture (P2-3);
hash chain + verifier (P2-4); PHI-access capture (P2-5); admin/config capture (P2-6); query API (P2-7);
UI (P2-8); export & compliance (P2-9); certification (P2-10). Durability delivery model = P2-3.

## 14. Certification criteria
The contract is satisfied when, in the relevant later checkpoints: every field is typed, classified
(`dataClass`), and PHI-assessed; the producer input type structurally excludes platform-owned fields;
an architecture rule bans `prisma.auditEvent` outside the Audit owner (P2-1); serialization is proven
deterministic (round-trip + stable-hash tests, P2-4); versioning covers additive + breaking evolution;
the registry enumerates the full taxonomy with attribution + durability + metadata schemas; and the
P2-10 coverage matrix shows every security-/compliance-sensitive mutation and PHI read has a producer.
Until then these are **prohibited by contract**, not yet **enforced**.

---

*Governing references: Decision Records D-002, D-003, D-010, D-011, D-019; LOGGING_STANDARD.md §AUDIT
(PHI logging rules; "define the AUDIT subsystem when built"); SECURITY_ARCHITECTURE.md (unified audit
deferred); PRODUCTION_READINESS_CHECKLIST.md (audit trail / PHI access — Partial/Deferred). This
document authorizes no code or schema change.*
