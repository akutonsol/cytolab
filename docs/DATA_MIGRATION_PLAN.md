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
