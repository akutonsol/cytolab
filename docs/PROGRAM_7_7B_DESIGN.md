# Program 7 · Phase 7B — Identity Lifecycle — DESIGN OF RECORD (proposed)

**Status:** Architecture-level design of record, **AWAITING governance review**. Governance-only phase — **no**
implementation, schema, migration, dependency, endpoint, or production code is authorized by this document. Additive to
the frozen Programs 1–6 and the certified Program 7A (`p7-7a-complete` → `aef3faa`); references — and modifies nothing
in — any accepted baseline. Charter: [`PROGRAM_7_CHARTER.md`](./PROGRAM_7_CHARTER.md) (v1.3) · Guardrails:
[`PROGRAM_7_GUARDRAILS.md`](./PROGRAM_7_GUARDRAILS.md) (ET1–ET8 / GG1–GG7) · Phase 7A master closeout:
[`PROGRAM_7_7A_MASTER_CLOSEOUT.md`](./PROGRAM_7_7A_MASTER_CLOSEOUT.md).

7A answered *“who are you?”*. 7B answers *“how does your identity **enter, evolve within, and leave** the platform?”* —
identity **lifecycle**, not authentication protocols (7A), authorization policy (7C), organizations (7D), tenancy, or
clinical/AI authority.

---

## 1. Read-only preflight — current state (verified at `feat/program-7-iam` tip `aef3faa`)
The current identity lifecycle is **minimal and binary**; 7B extends it into a governed lifecycle without redefining any
frozen behavior.

- **Lifecycle state = `User.isActive` (boolean).** The only state transition is `UsersService.setActive(id, isActive)`.
  There is **no** status enum (no PENDING/SUSPENDED/DEPROVISIONED), **no** soft-delete (`deletedAt`), **no** invitation
  state, **no** provisioning-source, and **no** external-sync metadata on `User`.
- **`isActive` is the authentication gate (re-checked live).** `AuthService` requires `isActive` at password login
  (`auth.service.ts:163`), MFA continuation (`:224`), session/refresh validation (`:277`), and federated login
  (`:433`). So deactivation blocks **new** authentication and refresh; short-lived access tokens live to expiry (no
  live denylist — consistent with 7A.2b D4).
- **Deprovisioning is not wired to session teardown.** `setActive(false)` flips the flag and emits a generic
  `AuditRecorder.recordEntityStateChanged(stateKey='account_active')` — it does **not** call the existing
  `SessionService.revokeSession` / `revokeByRefreshToken` primitives (which exist).
- **D5 is genuinely unrealized.** `FederatedIdentityService.link()` exists but has **zero production callers**; federated
  login (OIDC/SAML) fails closed on an unlinked subject. All linking + JIT provisioning is deferred to 7B.
- **Staff provisioning = admin-set password.** `UsersService.create` hashes an admin-supplied password (no staff
  invitation flow). **Invitations exist only for portal users** (`portal-users.service.ts` — a **separate** external
  identity class with its own invite-token flow); 7B must not conflate the two.
- **Identity anchors (frozen, reused):** `User` (canonical identity; `@@unique[labId,email]`), `FederatedIdentity`
  (`@@unique[labId, identityProviderId, externalSubject]`, the sole external→`User.id` linkage), `IdentityProvider`
  (per-lab federation config anchor), `UserRole`/`Role` (membership), `UserSession`/`RefreshToken` (session state),
  `Account`/`Workspace`. Tenancy = `labId` + `LabContext` + the Prisma extension.
- **Audit vocabulary present:** `ROLE_CREATED/UPDATED/DELETED`, `ROLE_ASSIGNMENT_CHANGED`, `ACCOUNT_UNLOCKED`,
  `USER_MFA_RESET`, plus 7A `LOGIN_*` and the 7A.2b `SERVICE_*` codes. **Absent:** any provisioning / suspend /
  reactivate / deprovision / invitation / JIT-link lifecycle codes.

**Preflight conclusion:** 7B is a **net-additive governance + lifecycle layer** over frozen anchors. The materially new
elements are (a) a **canonical lifecycle state machine** projected additively over `isActive`, (b) **governed provisioning
paths** (manual, invitation, JIT/SCIM) that all terminate at the existing `User`/`FederatedIdentity` model, and (c) a
**lifecycle event vocabulary** on the existing append-only audit ledger. No authentication protocol, tenancy key, or
authorization evaluator changes.

## 2. Answers to the ten preflight questions
1. **Where does lifecycle begin after authentication?** Not at authentication. Lifecycle begins at **identity entry**
   (provisioning) and is *consulted* by authentication only through the existing `isActive` gate — 7A stays the
   authority on “is this principal currently allowed to authenticate.” 7B owns the transitions that *set* that gate.
2. **Canonical lifecycle state machine.** `PROVISIONED/INVITED → ACTIVE ⇄ SUSPENDED → DEPROVISIONED (terminal)`. Entry
   variants: admin-create (→ ACTIVE), invitation (→ INVITED → ACTIVE on acceptance), JIT (D5; first authorized federated
   login of an unlinked identity → ACTIVE or INVITED per policy). Each state deterministically maps to `isActive`
   (ACTIVE ⇒ true; INVITED/SUSPENDED/DEPROVISIONED ⇒ false). The state is an **additive overlay**; `isActive` remains
   the auth gate 7A reads.
3. **Lifecycle events.** `IDENTITY_PROVISIONED`, `INVITATION_ISSUED/ACCEPTED/REVOKED`, `IDENTITY_ACTIVATED`,
   `IDENTITY_SUSPENDED`, `IDENTITY_REACTIVATED`, `IDENTITY_DEPROVISIONED`, `FEDERATED_IDENTITY_LINKED/UNLINKED`,
   `GROUP_MEMBERSHIP_SYNCED` — additive `IDENTITY`/lifecycle codes on the existing ledger (append-only).
4. **Invitations vs SCIM.** Two provisioning *sources* into the same lifecycle: **invitation** = human-initiated,
   token-based, transitions INVITED→ACTIVE on acceptance; **SCIM** = system-initiated (external IdP/IdM push) that
   creates/updates/deactivates identities directly. Both write the same `User`/`FederatedIdentity` and emit the same
   lifecycle events; neither is a second identity store.
5. **External vs manual provisioning coexistence.** A **provisioning-source** attribute (MANUAL | INVITATION | SCIM |
   JIT) records origin; source-of-truth precedence (e.g., SCIM-managed fields are authoritative for SCIM-sourced
   identities) is a governed policy. Manual admin action always remains possible (break-glass), audited distinctly.
6. **JIT linking vs suspended identities.** JIT (D5) may **link** an authenticated external subject to an existing
   `User`, but it **never overrides lifecycle state**: a SUSPENDED/DEPROVISIONED user is not resurrected by a federated
   login — JIT link + authentication both fail closed against a non-ACTIVE identity. JIT is a *linking/provisioning*
   policy, never an authentication or reactivation bypass.
7. **Deprovisioning vs deletion.** **Deprovisioning** = a governed terminal lifecycle transition: `isActive=false`,
   sessions/refresh revoked (wiring the existing primitives), external links marked inactive, identity **retained** for
   audit attribution (no hard delete; GG7 stable id preserved). **Deletion** (erasure) is **out of 7B scope** (a
   separate data-governance/retention concern).
8. **Which events belong on the immutable ledger?** All lifecycle transitions + provisioning/invitation/link/sync
   outcomes — additive, append-only, coded, **no secrets/PHI** (never a password, invite token, SCIM bearer, or external
   attribute payload). Single ledger, no parallel chain (ET4).
9. **Orthogonality to tenancy.** Every lifecycle entity carries `labId`; SCIM organizations/groups/invitations are
   **administrative overlays**, never isolation keys (Principle 4 / ET3). Group sync maps to `Role`/membership, not to
   `labId`.
10. **Orthogonality to authorization.** Lifecycle sets **existence/eligibility**, never permissions. Group
    synchronization may drive `UserRole` membership, but the effective-permission computation and enforcement remain the
    single existing `PermissionsGuard` (7A/7C boundary; GG4). Lifecycle grants no authority.

## 3. Standing architectural invariants (carried forward, unmodified)
- **I1 — Single linkage:** `FederatedIdentity` remains the *only* external→`User.id` mapping; no alternate linkage store.
- **I2 — Config anchor:** `IdentityProvider` remains the federation config anchor; 7B extends lifecycle, never redefines authentication.
- **I3 — Tenancy:** `labId` + `LabContext` remain the sole operational isolation boundary; orgs/groups/invitations are administrative overlays only.
- **I4 — JIT is policy:** D5 realized as a governed lifecycle policy layered on the frozen linkage; it never changes the auth protocols and never reactivates a non-ACTIVE identity.
- **I5 — Additive only:** Programs 1–6 and Phase 7A are immutable; 7B references them and extends only additively/backward-compatibly. `isActive` remains the authentication gate.

## 4. Cross-program boundary review (7B cannot encroach — ET1–ET8)
- **ET1 clinical / ET2 AI:** 7B writes no `ResultSheet`/`Record`/`RecordStatusEvent`/`AiDraft`/`AiModelVersion`/inference
  evidence; lifecycle state never confers diagnostic/AI-approval authority (a reactivated user gains no clinical
  authority by lifecycle alone). **ET3 tenancy:** all lifecycle rows `labId`-scoped; SCIM org/group/invite never an
  isolation key. **ET4 ledger:** lifecycle events additive on the existing append-only `AuditEvent` chain; no second
  chain. **ET5 no authority-by-identity:** lifecycle sets eligibility, not permissions; no default grant. **ET6
  principal class:** 7B governs human `User` lifecycle; the 7A.2b non-human `ServicePrincipal` lifecycle (credential
  rotation/revocation) is already frozen and is *referenced, not merged* — its own governed extension if needed.
  **ET7 domain-truth:** identity lifecycle is not authoritative for employment/licensing/HR truth (Principle 10). **ET8:**
  Programs 1–6 + all 7A increments immutable. Conforms to Principles 1–12 + GG1–GG7 (esp. GG7 stable identifiers across
  lifecycle transitions — a DEPROVISIONED identity keeps its `User.id`).

## 5. Governance decisions requiring ratification (L1–L7)
- **L1 — Lifecycle-state representation.** *Recommendation:* an **additive** lifecycle-state overlay (a
  `UserLifecycleState` enum column defaulting from `isActive`, or a projection entity), with `isActive` remaining the
  frozen auth gate that each state deterministically drives. (Alternative: a separate lifecycle record. Ratify the shape;
  either way the frozen `User` auth semantics are unchanged.)
- **L2 — Provisioning sources.** Ratify the set {MANUAL, INVITATION, SCIM, JIT} and the source-of-truth precedence policy
  (§2.5); manual break-glass always available + distinctly audited.
- **L3 — SCIM scope.** *Recommendation:* SCIM 2.0 **Users** (+ **Groups** for membership sync) as the standards-first
  provisioning interface (Principle 7), inbound (IdP→Osieri) in the baseline; SCIM is a provisioning transport, never an
  identity store or a tenancy key. Ratify baseline breadth (Users-only vs Users+Groups) and defer the rest.
- **L4 — JIT policy (D5).** *Recommendation:* JIT **links** an authenticated-and-authorized external subject to an
  existing `User` under an explicit per-provider policy; **auto-create** of a brand-new `User` is a distinct, separately
  ratified sub-decision (default OFF — link-only). Never reactivates a non-ACTIVE identity.
- **L5 — Deprovisioning semantics.** Ratify: deprovision = terminal lifecycle transition + session/refresh revocation
  (wire existing primitives) + link deactivation + **retain** identity (no hard delete; deletion out of scope).
- **L6 — Invitations (staff).** Ratify a staff invitation flow (token-based, INVITED→ACTIVE) modeled on — but separate
  from — the portal invite pattern; never sets a password on the user’s behalf.
- **L7 — Lifecycle audit vocabulary.** Ratify the additive `IDENTITY`/lifecycle event codes (§2.3) as a
  Program-7-authorized additive Program 2 registry extension (no modification of existing codes), coded, no secrets/PHI.

## 6. Deferred / explicitly out of scope
Enterprise authorization / permission graph / custom roles (7C) · Organization model (7D) · delegated administration
(7E) · authentication protocol changes (7A, frozen) · hard deletion / data erasure / retention (data-governance) ·
non-human `ServicePrincipal` lifecycle beyond its frozen 7A.2b behavior · HR/employment/licensing as domain truth ·
outbound SCIM / SCIM beyond the ratified L3 baseline.

## 7. What this document authorizes
**Nothing beyond its own authoring.** It is the reviewable design of record for a governance decision. No schema,
migration, dependency, endpoint, service, SCIM implementation, or test is authorized until this DoR is reviewed and
approved, and implementation is separately authorized. No accepted baseline (`p6-complete` → `40d810e`,
`p7-7a-complete` → `aef3faa`, and the four 7A increment tags) is modified.

## 8. Governance state
| Stage | Status |
|---|---|
| Program 7 · Phase 7A | Complete & Certified (`p7-7a-complete` → `aef3faa`) |
| 7B read-only preflight + current-state map | Complete (this document, §1) |
| 7B cross-program boundary review | Drafted (this document, §4) — awaiting governance review |
| 7B Design of Record (L1–L7) | **Proposed — awaiting review** |
| 7B implementation | **Not authorized** |
