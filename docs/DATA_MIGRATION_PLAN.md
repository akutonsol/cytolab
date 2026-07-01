# Data Migration Plan

Migrating legacy Cytolab (Java/Spring + Postgres) data into Cytolab 2.0
(NestJS + Prisma + Postgres). This document tracks the rules and invariants that
the import scripts MUST follow. It grows as each domain is migrated; entries are
added when a 2.0 schema decision affects how legacy data is imported.

Multi-lab tenancy (F1): every imported row is stamped with the destination
`labId`. Imports run under `LabContext.runSystem()` (tenancy bypass) with the
`labId` supplied explicitly per source lab.

---

## Patients

### Registration number (`Patient.registrationNo`)

The patient's permanent lab ID. **Scheme (A): seeded numeric counter**, lab-scoped.

- **Column:** `String`, `@@unique([labId, registrationNo])`. Stored as a string so
  legacy values are preserved **verbatim** — leading zeros, odd lengths, any
  format — and generated + imported values coexist in one column.
- **Import = verbatim, generator bypassed.** The import writes each legacy
  `registrationNo` directly; it never calls the 2.0 generator for imported rows.
  The unique constraint makes any in-source duplicate **fail loudly** (a real
  data problem to resolve at source) rather than being silently overwritten.
- **Generation (2.0-created patients only)** uses a per-lab monotonic counter in
  `LabSequence(labId, name="patientRegNo", value)`, allocated atomically
  (`update … { value: { increment: 1 } }`, which returns the new value and is
  atomic at the row level), formatted as a zero-padded numeric string.
- **Seed step (REQUIRED, per lab, run AFTER patient import and BEFORE any
  2.0-created patient in that lab):**
  ```
  seed = max( CAST(registrationNo AS BIGINT) )   -- over numeric rows only, for this lab
  LabSequence(labId, "patientRegNo").value = seed   -- next allocation = seed + 1
  ```
  - Non-numeric legacy `registrationNo` values are preserved verbatim but
    **excluded** from the max — they can never collide with numeric generated
    values anyway.
  - A new lab with no imports starts the counter at a base (`10000000`, so the
    first generated value is `10000001` — an 8-digit legacy-style number).
- **Fail-closed backstop:** generation still inserts under the unique constraint
  and **retries** on the rare conflict, so even a mis-seeded counter can never
  overwrite an existing number.

#### Post-migration invariant / check

> For every lab: **no generated `registrationNo` is ≤ the max imported numeric
> `registrationNo` for that lab.**

Concretely, after seeding and before go-live, assert
`LabSequence.value >= max(numeric imported registrationNo)` for each lab, and
spot-check that the next generated number is strictly greater than every
imported numeric value in that lab.

### Seeded-counter identifiers — the shared pattern (now THREE)

Three human-facing identifiers use the **identical** atomic-seeded-counter
pattern above (String column, `@@unique([labId, …])`, import-verbatim,
per-lab `LabSequence`, seed to `max(numeric imported)`, unique-constraint retry
backstop, and the "no generated ≤ max imported numeric" post-migration check):

| Identifier | Column | `LabSequence` name | Base | Format |
|---|---|---|---|---|
| Patient registration no. | `Patient.registrationNo` | `patientRegNo` | `10000000` | zero-padded 8-digit numeric |
| **Requisition Ref#** | `Requisition.referenceNo` | `requisitionRef` | `1000` | plain numeric (e.g. `1460`) |
| **Client account no.** | `Client.accountNo` | `clientAccountNo` | `100000` | `<LAB_PREFIX>-<n>` (e.g. `CYLB-577071`) |

- **Requisition `referenceNo`:** import legacy Ref#s verbatim; seed
  `requisitionRef` to `max(numeric imported referenceNo)` per lab.
- **Client `accountNo`:** import legacy AC#s **verbatim** (including the legacy
  prefix, e.g. `CYLB-577071`). For 2.0-generated numbers the prefix is derived
  from the lab slug; seed `clientAccountNo` to the max **numeric part** of the
  imported account numbers per lab. Because imports are verbatim, a legacy
  prefix that differs from the derived one is preserved as-is.

### Age (`Patient.age` → derived, not stored)

- 2.0 **derives age from `dateOfBirth`** (read-only, computed); it is not stored
  and not accepted as input.
- **Migration rule:** going forward, derive from DOB. If a legacy record has an
  **age but no DOB**, optionally **back-calculate an approximate DOB**
  (`Jan 1 of (importYear − age)`) to preserve the information, and **flag those
  rows as approximate** (e.g., a migration audit column / report) so they are
  never mistaken for a verified DOB. Records with neither DOB nor age import with
  a null DOB.

### Addresses (`PatientAddress`, 1:many)

- New model `PatientAddress` (lab-scoped, `patientId` FK, cascade on patient
  delete) supports **one or more** addresses per patient ("Add Address").
- **Mapping:** legacy patient address data (free-text or columns) maps into one
  or more `PatientAddress` rows. Decide per source: default is **one address per
  patient** unless the legacy schema clearly stores multiple. Preserve any
  label/type if present; otherwise import as a single unlabeled address.

### Avatar (`Patient.avatarUrl`, deferred)

- `Patient.avatarUrl` is a **nullable stub**; actual upload/serving is deferred
  to **Phase 6 (file storage)**. Migration of legacy patient photos (if any) is a
  **later pass** once file storage exists — import patients with `avatarUrl =
  null` for now.

---

## Clients

### Client email (`Client.email`, new)

- `Client.email` is added (nullable) to support the patient form's **"choose
  client by name OR email"** search.
- **Backfill:** populate from legacy client records where an email exists.
  Clients without a legacy email import with `email = null` (still searchable by
  name).

### Lab code (`Client.labCodeId`, new)

- `Client.labCodeId` (FK → `LabCode`, nullable) closes the Phase 3 "LabCode ↔
  Client" tracked debt (legacy "Labcode" dropdown on the client form).
- **Mapping:** for each legacy client, resolve its assigned lab code/region to
  the matching `LabCode` row in the destination lab (import lab codes first),
  and set `labCodeId`. Clients with no legacy lab code import with `null`.

### Active / Blocked (`Client.active`, `Client.blocked`, new)

- Mirror the legacy Active/Blocked toggles.
- **Backfill:** map the legacy client status → `active` (default `true` if the
  legacy record was enabled) and `blocked` (default `false`). If the legacy
  system has no explicit blocked flag, import `blocked = false`.

### Client type (Doctor / Laboratory)

- The Doctor/Laboratory toggle resolves to a `ClientType` row (find-or-create by
  `type`). **Mapping:** map the legacy client's type to `Doctor` or `Laboratory`
  and attach the corresponding `ClientType` (created per lab on first use).

### Addresses (`ClientAddress`, 1:many)

- New `ClientAddress` (lab-scoped, `clientId` FK, cascade) mirrors
  `PatientAddress`. **Mapping:** legacy client address data maps into one or more
  `ClientAddress` rows (default one per client unless the legacy schema stores
  multiple). Preserve any label/type if present.

### Avatar (`Client.avatarUrl`, deferred)

- Nullable stub; upload/serving deferred to **Phase 6 file storage**. Import
  clients with `avatarUrl = null`; migrate legacy photos in a later pass.

### Client portal login: inline credentials → invite-based `PortalUser`

Legacy created the client's login **inline** (username + email + password + 2FA)
on the client form. 2.0 uses **invite-based** provisioning (Finding 2, option B).

- **Legacy passwords are NOT migrated.** Staff never hold external users'
  passwords, and legacy hashes are a different scheme/trust boundary. Instead,
  each legacy client login is re-created as a `PortalUser` and the client is
  **re-invited** to set a new password via the F2 single-use email token.
- **Mapping per legacy client login:**
  - `PortalUser.email` = legacy login email; `passwordHash = null` (until the
    client accepts the invite).
  - `PortalUser.username` = the legacy username if present, else auto-generated
    (lab-unique). `twoFactorEnabled` = the legacy 2FA flag (the client
    re-enrolls the secret in the portal — 2FA secrets are **not** migrated).
  - The client's main login is flagged `isPrimary`; additional contact logins
    (if any) import as non-primary.
- **Invite timing:** the migration can either send invites in a controlled batch
  at cutover or leave `PortalUser`s un-invited and invite on first portal
  rollout. Either way, no client can log in until they accept an invite.
- **Post-migration check:** every imported `PortalUser` has `passwordHash = null`
  (no legacy password leaked into 2.0) and a unique `(labId, email)` /
  `(labId, username)`.

## Requisitions

### Ref# (`Requisition.referenceNo`)

- Seeded-counter identifier — see the shared pattern above (`requisitionRef`,
  base `1000`, plain numeric). Import legacy Ref#s **verbatim**.

### Money: Float → Int (minor units / cents) — ⚠️ convert on import

- 2.0 stores all money as **integer minor units (cents)**, never floats
  (Phase 4 standard). `Requisition.amount` and `RequisitionLine.amount` were
  changed from `Float` to `Int`.
- **Import rule:** legacy float amounts (dollars, e.g. `50.00`) must be
  **converted to integer cents: `round(amount × 100)`**. `50.00 → 5000`.
- **Flag rounding:** use banker's/`round-half-up` consistently and **log any
  amount whose `×100` is not already integral** (e.g. `19.999`), so
  sub-cent legacy values are reviewed rather than silently rounded. The
  requisition total is `Σ line amounts` — recompute it from the (converted)
  line costs on import rather than trusting a separately-stored legacy total.
- This applies to **every** money column migrated (bills, payments, services,
  taxes already `Int`); requisition amounts were the last floats and are now
  aligned.

### Line form type + fulfillment

- `RequisitionLine.formType` (`Gynecology` | `NonGynecology`) — map from the
  legacy Gyn/Nongyn toggle; defaults to `Gynecology`.
- `RequisitionLine.notes` (was `description`) — map legacy line notes.
- **Ordered/Fulfilled/status are derived, not imported:** after records and
  their `requisitionLine.recordId` links are imported, the requisition's
  `Partial`/`Completed` status and each line's `isCompleted` are recomputed from
  the linked records' statuses (fulfilled = `Completed`-or-beyond). Don't import
  a stale legacy status; let the recompute set it.

## Roles / RBAC

### `Role.isSuperRole` (new) — replaces the hardcoded 'Superuser' name

- The permission bypass now keys off `Role.isSuperRole`, not a role named
  'Superuser'. **Mapping:** set `isSuperRole = true` for the legacy `super_role`
  roles (e.g. named super roles like "P. McCarthy", "M. Donegal", and the
  canonical Superuser). Ordinary roles import with `isSuperRole = false`.
- Seeded default roles realigned to the legacy set: `Superuser` (super),
  `Authorizers`, `Pathologist`, `Lab Technician`, `Receptionist`. The retired
  `Standard`/`Authorizer`/`Staff` default names are dropped.
- **"Clients" is NOT a staff role** — it is the portal identity (structurally
  client-scoped `PortalUser`); do not import it into the staff `Role` table.

### Permission catalog — full 2.0 catalog enables 1:1 role→permission mapping

- 2.0 seeds the **full legacy permission catalog** (154 codes: 36 standard-CRUD
  objects + `notification[view,delete]`, `applicationprefs[view,change,reports,
  dashboard]`, `accountprefs[view,change]` + `record:submit`,
  `resultsheet:authorize`), including objects whose modules aren't built yet
  (earning, deduction, employeedetails, clinicalformitem, appointment, …). This
  makes each **legacy role → permission** assignment map **1:1** by code.
- **Unmapped codes MUST be surfaced, never silently dropped.** The import
  compares every legacy permission code against the 2.0 catalog and **reports any
  code with no 2.0 equivalent for human review** — it does not drop them. Each is
  then confirmed as one of: a **consolidated line-item** (`requisitionline`,
  `billline`, `paymentline` — no 2.0 equivalent; the role's parent-object
  permission covers it), a **duplicate/typo**, or a genuine gap to **add to the
  catalog**. (Reconciliation: 154 seeded + 12 line-item codes = 166; ~4 legacy
  codes from the source list are still unaccounted and must be caught by this
  review.)
- **Line-item permissions have no legacy-line-permission equivalent to map:**
  `requisitionline`/`billline` are managed via their parent object's permission;
  `paymentline` is gone in 2.0 (Payment settles a Bill directly). Legacy
  assignments of these map to the parent (`requisition`/`bill`/`payment`) or are
  dropped with a review note.

### `Role.scope` (RoleScope) — preserved from legacy User/Workspace

- `Role.scope` (`User` | `Workspace`, default `User`) preserves the legacy role
  **User/Workspace toggle**. **Mapping:** set `scope` from the legacy role's
  User/Workspace flag. Workspace-CONSTRAINED **enforcement** is deferred (future
  RBAC) — the column only preserves the value and drives the admin UI selector;
  Workspace-scoped roles behave as User-scoped until enforcement lands.

### ⚠️ The seed is AUTHORITATIVE and DESTRUCTIVE — dev/bootstrap ONLY

- `prisma/seed.ts` is the source of truth for the permission catalog: it
  **deletes every permission not in the catalog and cascades their
  RolePermission rows**. This is correct for a fresh dev/bootstrap database.
- **NEVER run the seed against a production or migrated database holding real
  data.** Doing so would delete any legacy permission not in the 2.0 catalog and
  drop its role links. **Migration and production use additive, reviewed schema
  changes and data imports — not the seed.**

### Deferred (future RBAC): workspace-constraint roles

- The legacy Roles tab's **"Workspace Constraint Role"** (workspace-scoped roles)
  is **not** built. `Role.scope` carries the value but enforcement is deferred.
  Tracked as a future RBAC feature; `Client.workspaceId` exists to carry the
  association when that lands.
