# F4 — AI-assisted result reporting · Design proposal

**Status:** proposed (build after review). **Principle:** AI is strictly *assistive*.
Nothing AI-generated is ever released without human authorization. The feature sits
entirely on top of the existing result-sheet + authorization gate — it never
authorizes, never bypasses the gate, and never blocks the workflow if the AI is
unavailable.

Three v1 capabilities, all **on-demand** (explicit buttons, never auto-fired):
1. **Draft narrative** — structured clinical data → a house-style draft narrative the Authorizer edits.
2. **Code suggestion** — observations → suggested CodeSheet/CodeFinding codes (accept/reject).
3. **Consistency check** — flag contradictions between coded findings and the narrative before sign-off.

---

## 0. Compliance gate (before any of this ships)

Sending clinical data to a third-party API has data-protection implications. Therefore:
- **AI is OFF by default** per lab (`LabAiSettings.enabled = false`). Enabling is a deliberate admin action.
- A lab may only enable AI once a **BAA/DPA with Anthropic** (or equivalent) is in place for that deployment. This is an operational prerequisite, surfaced in the settings pane copy — not something code can enforce, but the default-off posture makes it opt-in.
- We send **minimum-necessary, de-identified** clinical data (see §2). No direct patient identifiers ever leave the server.

---

## 1. Schema

### 1a. `LabAiSettings` (one row per lab)
```prisma
model LabAiSettings {
  id             String          @id @default(uuid())
  labId          String          @unique
  lab            Lab             @relation(fields: [labId], references: [id])
  enabled        Boolean         @default(false)   // opt-in, off by default
  houseStyle     String?                            // lab's narrative template / style guidance
  redactionPolicy RedactionPolicy @default(Strict)  // Strict | Standard (see §2)
  model          String?                            // optional model override; else server default
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
}

enum RedactionPolicy {
  Strict     // no demographics at all — clinical data only
  Standard   // adds de-identified sex + age BAND (never DOB/exact age)
}
```

### 1b. `AiDraft` (provenance record — one per generation, kept forever)
```prisma
model AiDraft {
  id              String        @id @default(uuid())
  labId           String
  lab             Lab           @relation(fields: [labId], references: [id])
  resultSheetId   String
  resultSheet     ResultSheet   @relation(fields: [resultSheetId], references: [id], onDelete: Cascade)
  kind            AiDraftKind                        // Narrative | CodeSuggestion | ConsistencyCheck
  status          AiDraftStatus @default(Generated)  // Generated | Accepted | Rejected | Superseded
  // --- what the model produced ---
  output          String                             // narrative text, or JSON string for codes/consistency
  // --- provenance ---
  model           String                             // exact model id used (e.g. claude-sonnet-4-6)
  promptVersion   String                             // e.g. "narrative-v1" — bumped when the prompt changes
  redactionPolicy RedactionPolicy                    // policy snapshot applied at generation
  inputDigest     String                             // sha256 of the exact redacted payload (proves input class w/o storing PHI)
  createdById     String?                            // who triggered generation
  createdBy       User?         @relation("AiDraftCreatedBy", fields: [createdById], references: [id])
  createdAt       DateTime      @default(now())
  // --- human review (narrative kind) ---
  finalText       String?                            // the authorizer's edited text at acceptance
  editedDiff      Json?                              // structured diff: AI output → finalText
  acceptedAt      DateTime?
  acceptedById    String?
  acceptedBy      User?         @relation("AiDraftAcceptedBy", fields: [acceptedById], references: [id])

  @@index([labId])
  @@index([resultSheetId])
}

enum AiDraftKind    { Narrative CodeSuggestion ConsistencyCheck }
enum AiDraftStatus  { Generated Accepted Rejected Superseded }
```

### 1c. Relation to `ResultSheet` + the human-owned narrative
- `ResultSheet.aiDrafts AiDraft[]` (one-to-many — a sheet accumulates drafts over time; provenance is never overwritten).
- Add **`ResultSheet.narrative String?`** — the *human-owned* working narrative the authorizer edits and signs. "Accept draft" copies `AiDraft.output → ResultSheet.narrative` (then it's freely editable and human-owned). At report release, `ResultSheet.narrative → Report.content` (the release form is pre-filled with it). The AiDraft keeps the provenance; the released text lives where report content already lives.
- This gives the audit trail the spec demands: **AiDraft.output (X) → AiDraft.finalText / ResultSheet.narrative (Y) → Report.content (Y) signed by the Authorizer.**

### 1d. Audit timeline
Add two `ResultSheetEventType` values so the existing result-sheet event timeline (already feeding the portal) records AI activity next to the Authorized/Deauthorized events:
```
enum ResultSheetEventType { Authorized Deauthorized Reauthorized  AiDrafted  AiAccepted }
```

### 1e. Permissions
Add an `aidraft` object to the seed permission catalog (→ `aidraft:view/create/change/delete`). Generation/suggestion/consistency gated on **`aidraft:create`** (granted to Authorizer/Pathologist roles). Editing `LabAiSettings` gated on **`applicationprefs:change`** (it's a settings pane). Superuser bypasses as usual.

---

## 2. Redaction — exactly what is sent (the safety-critical part)

**Guarantee by construction:** the payload is **built field-by-field from an allowlist**, never filtered down from the full record. Code that assembles it only ever reads the specific clinical fields below; it *cannot* accidentally include an identifier because raw records are never spread into the request.

### Always redacted — NEVER sent (both policies)
patient first/middle/last name, registrationNo, identityToken, motherMaidenName, email, phone, address, **exact DOB / exact age**, photo · client name / account no · referring doctor name · lab account numbers · **labNumber (case number)** → replaced by an opaque per-request token `CASE-1` · **all absolute dates** → converted to relative intervals or dropped.

### Free-text scrub (targeted)
Free-text clinical fields (cervix appearance, leucorrhea, pelvic abnormalities, `sampleDescription`, `natureAndSource`, per-code `findings`) are clinically necessary but human-typed, so before sending we **strip exact-match occurrences of that patient's own known identifiers** (name tokens, registrationNo) which we hold server-side. Targeted, high-precision redaction of the one thing most likely to leak.

### The exact payload shape sent to Claude (structured clinical context)
```jsonc
{
  "caseRef": "CASE-1",                 // opaque, per-request — NOT the labNumber
  "formType": "Gynecology",            // or "NonGynecology"
  "specimens": ["CERV_SCRAP", "ENDOCERV_ASP"],
  "demographics": {                    // present ONLY under Standard policy; omitted under Strict
    "sex": "F",
    "ageBand": "40-49"                 // band, never exact age/DOB
  },
  "clinicalFeatures": {                // Gyn example — de-identified, dates → intervals/booleans
    "routineCheck": true,
    "previousCytology": false,
    "pregnant": false,
    "menopause": true,
    "pregnancies": 2,
    "cervixAppearance": "healthy",     // free-text, name-scrubbed
    "leucorrhea": null,
    "pelvicAbnormalities": null,
    "lmpIntervalDays": null,           // relative interval, never a date
    "cycleLength": null
  },
  // NonGyn variant instead carries: { "sampleDescription": "...", "natureAndSource": "..." } (name-scrubbed)
  "codedResults": [
    {
      "specimen": "CERV_SCRAP",
      "codes": [
        { "abbreviation": "NC SS", "description": "NO CELLS SEEN ON SLIDE", "abnormal": false, "note": "scant cellularity" }
      ]
    }
  ],
  "labCodes": [{ "code": "CBL" }]      // region omitted under Strict (quasi-identifier at small N)
}
```
`description` values come from the lab's CodeSheet/CodeFinding catalog (reference data, not PHI). The whole object is hashed (`inputDigest`) and stored on the AiDraft — we can later prove *what class of input* produced a draft without persisting the clinical payload itself.

---

## 3. Anthropic call

- **SDK / key:** `@anthropic-ai/sdk`, server-side in the result-sheets module. `ANTHROPIC_API_KEY` read via `ConfigService` (added to `.env.example`; never hardcoded). If the key is absent → AI treated as unavailable (graceful, see below).
- **Model:** default **`claude-sonnet-4-6`** (strong clinical reasoning at sensible cost); lab-overridable via `LabAiSettings.model`. Temperature **0.2** (consistency), bounded `max_tokens`.
- **Prompt assembly:**
  - *System prompt* = fixed role ("assistive drafting aide for a cytology/pathology lab; you draft, you do not diagnose or authorize; use ONLY the provided structured data; never invent findings; flag uncertainty; output house style") **+** the lab's `houseStyle` template.
  - *User message* = the redacted JSON (§2) + the per-capability task instruction.
- **Prompt versioning:** a constant per capability+revision — `narrative-v1`, `codes-v1`, `consistency-v1` — stored on every `AiDraft.promptVersion` for provenance/reproducibility. Bumped when we edit a prompt.
- **Structured kinds:** code suggestion + consistency request **JSON output** (tool-use/JSON), validated on return; a parse/validation failure is treated as "no suggestions" (never a hard error).
- **Graceful degradation (hard requirement):** every AI call is best-effort, wrapped in try/catch with a ~20s timeout. On disabled / missing key / timeout / API error / bad output → return a soft `{ available: false, reason }` to the UI. **Authorization never depends on AI and is never blocked by it.**
- **Rate/cost control:** per-lab enable flag; per-user/per-sheet generation cap per hour (config); stored drafts are reused on re-open instead of regenerating; the redacted payload is small structured JSON → low token cost.

---

## 4. Flow & UI integration (in the existing AuthorizationModal)

When `LabAiSettings.enabled` and the user has `aidraft:create`, the AuthorizationModal shows an **AI Assist** section:

1. **Generate draft narrative** → `POST /resultsheet/:id/ai/narrative` → creates `AiDraft(kind=Narrative, status=Generated)`, writes an `AiDrafted` event, returns the text into a **Narrative** editor in the modal (with an "AI draft • model • time" provenance chip). Nothing is authorized.
2. Authorizer **edits** the narrative freely → **Accept** → `AiDraft.status=Accepted` with `finalText` + `editedDiff` + `acceptedBy`, `ResultSheet.narrative` set, `AiAccepted` event. Still not authorized.
3. **Suggest codes** → `POST /resultsheet/:id/ai/suggest-codes` → returns suggestions; **Accept** a suggestion adds a `ResultLine` **through the existing `update(entries)` path** (so it's a normal content edit and participates in the gate); **Reject** discards. Stored as `AiDraft(kind=CodeSuggestion)` for audit.
4. **Check consistency** → `POST /resultsheet/:id/ai/consistency` → advisory banner listing any contradictions between coded findings and the narrative. Purely informational; stored as `AiDraft(kind=ConsistencyCheck)`. Does **not** block sign-off.
5. **Sign off** (existing `authorize`) → Resulted→Approved, unchanged. **Report release** pre-fills content from `ResultSheet.narrative`.

### Interaction with the de-authorize-on-edit gate (must be correct)
- **Generating/accepting a narrative** changes no authorization state (pure composition, pre-sign).
- **Editing findings (`entries`)** still de-authorizes exactly as today **and** additionally marks the latest `Narrative` AiDraft / `ResultSheet.narrative` as **stale** (`status=Superseded`) — because the narrative was drafted from now-changed data — prompting a regenerate. (The narrative text is *kept*, just flagged; the human never silently loses their edits.)
- **Editing the narrative after authorization** is treated symmetrically to editing findings: it **re-opens** the sheet (de-authorize → Approved rolls back to Resulted) so a changed narrative can never reach a released report without re-sign-off.
- Net: **AI can populate the draft, but only a human edit+sign moves the gate, and any change after signing revokes authorization.**

---

## 5. Cost / rate posture (recommended)

- **On-demand only** — never auto-fire on result-sheet create/save. Each capability is an explicit button.
- **Off by default** per lab; enabling is deliberate + compliance-gated (§0).
- **Rate limit** generations per sheet/user/hour (config); **reuse** stored drafts on re-open.
- Low temperature, bounded tokens, small structured payload → predictable low cost.

---

## Build order (once approved)
1. Schema: `LabAiSettings`, `AiDraft`, `ResultSheet.narrative`, event-type + permission additions (+ migration).
2. `AiModule`: Anthropic client wrapper, redaction assembler (§2, allowlist), prompt templates + versions, graceful-degradation guard.
3. Result-sheets endpoints: `ai/narrative`, `ai/suggest-codes`, `ai/consistency`; narrative accept + provenance capture; gate/staleness wiring.
4. Settings "AI Assistance" pane (enabled / house style / redaction / model), gated `applicationprefs:change`.
5. AuthorizationModal AI Assist section (generate/suggest/check + narrative editor + provenance chip).
6. Tests: redaction allowlist (no identifier ever present) — the highest-value test; graceful degradation when key absent; provenance + edit-diff captured; de-authorize/staleness interaction. Anthropic calls mocked in tests; no live API in CI.

## Open decisions for review
- **Model default:** `claude-sonnet-4-6` (recommended) vs `claude-opus-4-8` (max quality, higher cost).
- **Default redaction policy:** `Strict` (recommended) vs `Standard` (adds de-identified sex + age band — clinically useful for cervical screening).
- **New `aidraft` permission object + `AiDrafted`/`AiAccepted` events** (recommended) vs reuse `resultsheet:*` and skip new event types.
