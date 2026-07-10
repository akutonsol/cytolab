# PathOS v2 — Product Architecture Review

| Field | Value |
|---|---|
| Status | Review — critique of [docs/PATHOS_v2.md](docs/PATHOS_v2.md) |
| Current Phase | Product Architecture Review |
| Owner | Founder |
| Dependencies | docs/PATHOS_v2.md (draft), Helix v1.0 (frozen) |
| Last Updated | 2026-07-10 |
| Priority | P0 |
| Expected Next Milestone | Blueprint revised, then approved as the implementation contract |

This document critiques the blueprint. It does not rewrite it. The reviewer's stance is
adversarial by design: the blueprint is complete, not yet correct. The goal is to make PathOS
exceptional before a line of implementation code is written.

**Overall verdict: conditional pass.** The blueprint has a genuinely strong spine — evidence
before confidence, workflow over pages, the human as decision of record. But it is written for
"pathology software" in the generic, when the product's own codebase says it is a **cytology**
platform, and it dodges the two questions every enterprise buyer asks first: *is this my system
of record or a layer on top of it*, and *is the AI a regulated device*. It also models the
specimen's journey instead of the pathologist's day, which hides the highest-stakes workflows
(frozen section, the IHC re-review loop, amendments). Six changes below would move it from
"good product doc" to "contract worth building against."

---

## Section-by-section review

Each section is scored against the eight review lenses: differentiated, enterprise-grade,
reduces cognitive load, improves trust, best workflow, memorable, unnecessary complexity,
stronger alternative.

### 1. Product vision

**What holds up.** The "participant, not filing cabinet" frame is a clean articulation, and
"evidence before confidence" is a real, ownable wedge. A pathologist would recognize the
problem.

**Would a hospital CIO immediately understand why this exists?** Partly — and then they would
ask two questions the document cannot answer, and stall:

1. **System of record, or intelligence layer?** The vision says "one system, end to end… unifies
   the entire diagnostic journey" (replacement) and also "integrate PathOS with hospital
   systems" (layer). These are different products with different sales cycles, different risk,
   and different buyers. A CIO running Epic Beaker or Cerner CoPath will not rip out their LIS
   of record on a startup's promise. Leaving this ambiguous is the single biggest strategic risk
   in the document.
2. **Is the AI a regulated device?** For an AI that touches diagnosis, the first enterprise
   question is FDA status and the validation burden the lab inherits (CAP requires the lab to
   validate any AI before clinical use). The vision never states its regulatory posture. "AI
   assists" is the right *positioning* (assistive/CADe, not autonomous) but the document treats
   it as a design principle, not a regulatory stance.

**Weak / generic.** "Reduce cognitive load," "continuous observable workflow" are true of every
modern clinical tool. The vision needs a sharper, defensible wedge than "we unify things."

**Stronger alternative.** Declare the wedge explicitly: PathOS is a **cytology-first diagnostic
intelligence layer** that sits alongside the LIS of record, makes the lab's day observable, and
gives the pathologist a calibrated second reader that is prior-case aware. Name the deployment
model (coexist via HL7/FHIR now, replace later where the customer wants it). Name the regulatory
stance (assistive; quantification features first because they carry a lower regulatory bar than
diagnosis).

### 2. Personas

**The core problem: these are software roles, not pathology roles.** Pathologist, Technician,
Manager, Administrator, IT is the org chart of any B2B SaaS. It is not the cast of a pathology
lab, and the omissions are consequential because they change what gets built.

Missing, and several deserve first-class support:

- **Cytotechnologist — first-class, and currently absent.** The product is cytology (the
  codebase has `bethesda`, Pap workflows). In cytology the cytotech screens first and the
  pathologist reviews flagged cases. Omitting the primary screener from a cytology platform is
  the most serious persona gap in the document.
- **Resident / fellow — first-class in academic accounts.** The resident-preview →
  attending-sign-out double-read is the spine of Mayo, Hopkins, and Cleveland Clinic workflows.
  A resident is not a junior pathologist with fewer permissions; it is a distinct teaching
  workflow with preview, hand-off, and attention to discrepancy.
- **Medical Director / QA lead — distinct from "Administrator."** The blueprint's Administrator
  fuses LIS configuration with clinical quality governance. Those are different people. QA owns
  discrepancy review, proficiency, amendments, and CAP inspection readiness.
- **Referring clinician — already served by the portal, yet not a persona.** The product ships a
  clinician portal; the blueprint does not list its user.
- **Molecular / genomic pathologist, tumor-board (MDT) participants, external consultants** —
  second tier, but real, especially for reference and academic centers (Mayo is a global consult
  destination).

**Recommendation.** Promote Cytotechnologist, Resident/Fellow, and Medical Director/QA to
first-class personas. Add Referring Clinician (portal). Note Molecular, Tumor Board, and External
Consultant as Phase 3 personas.

### 3. Core workspaces

**Are four correct? Two of the four are miscut.**

- **AI Review and Report Studio should likely be one workspace.** A pathologist reviewing a case
  and writing its report is a single continuous act: sign-out. Splitting them into two workspaces
  reintroduces exactly the tool-switch the vision condemns. The blueprint's own principle
  (workflow-first, reduce switching) argues for a unified **Sign-out Workspace**: review →
  findings → report → sign, in one place, with the report drafting *inside* the review, not a
  destination you travel to.
- **Quality & Governance has no home.** QA, discrepancy tracking, proficiency, amendments, and
  clinical audit are scattered between Operations and Administration. For any enterprise or
  academic buyer, quality is a workspace, owned by the Medical Director, not a tab in admin.

**Will users naturally think this way?** A pathologist thinks in one workspace (sign-out) 90% of
the day. The symmetric "four equal workspaces" over-weights the three they rarely enter.

**Stronger alternative (redraw, do not add):**

1. **Sign-out** (AI Review + Report merged) — the pathologist's home.
2. **Operations** — the lab's live state (keep as is; strong).
3. **Quality & Governance** — QA, discrepancy, proficiency, amendments, clinical audit.
4. **Administration** — org, users, permissions, integrations, API, system (IT-facing config).

Same count, better cut. Sign-out becomes the signature; Quality becomes the enterprise moat.

### 4. Information architecture

**Good instinct, wrong symmetry.** The workspace model is right, but presenting four co-equal
workspaces in global navigation misrepresents how time is spent. IA should be **asymmetric**: the
worklist/case is home; the others are destinations entered deliberately.

**Will users always know where they are?** Yes at the workspace level, but the risky boundary is
the report. If report lives in a separate workspace, "where am I in this case" fractures at the
worst moment. Merging review and report (Section 3) fixes this.

**Can context switching be reduced?** The highest-frequency loop is worklist ↔ case ↔ report ↔
sign. That loop must be a single continuous surface. Cross-workspace jumps (queue → case, case →
prior specimen) must carry full state.

**Missing IA primitive: the patient's prior specimens.** Pathology is longitudinal — the current
case is read against the patient's history (prior biopsies, prior Paps). Global search lists
"patient" but the *prior-case pivot* is a first-order clinical need, not a search result. It
deserves to be a standing element of the case context.

### 5. AI interaction model — critiqued heavily

This is the heart of PathOS, and it is the strongest section — and still not yet un-leaveable.

**What is genuinely good.** Evidence before confidence; override as a first-class single gesture;
explicit degradation; confidence as a supporting attribute rather than a floating number. These
are correct and better than most shipping products.

**Where it falls short:**

- **No trust *mechanism*, only trust *intent*.** The doc says trust "accrues from consistent
  behavior." Real trust in a diagnostic AI is built from a **track record the pathologist can
  see**: "this model has agreed with you on 2,400 cases; here are the 30 you overrode and the
  pattern in them," segmented by case type. Without a visible concordance history, trust is
  asserted, not earned.
- **Override is treated as one-way.** The moment AI and pathologist disagree is the most valuable
  event in the system — it either catches a human miss or exposes an AI weakness. The model
  records the override but does not treat discordance as a **two-way safety and QA signal** that
  feeds Quality & Governance. This is a missed connection between the AI model and the (missing)
  Quality workspace.
- **Automation bias is unaddressed.** Evidence-first mitigates it, but a high-confidence AI
  finding on a busy day still invites rubber-stamping. The document has no active de-biasing
  move. The strongest available answer is **read-first, then reveal**: the pathologist commits a
  preliminary impression before the AI is shown, then sees agreement or disagreement. This builds
  calibrated trust *and* prevents automation bias *and* generates the concordance record — one
  interaction solving three problems. It should be the signature, not "evidence first."
- **Quantification is missing, and it is the safest, highest-value AI.** The model is entirely
  about diagnostic *findings*. But AI's least controversial, most superhuman contribution is
  **measurement** — mitotic counts, Ki-67 index, tumor cellularity, HER2 scoring. Quantification
  carries a lower regulatory bar and delivers daily value. Its absence understates the product's
  strongest, most defensible AI surface.

**What would make another vendor impossible to go back to?** Not stated, and it must be. Three
candidates, best first: (a) a calibrated second reader that shows its concordance with *you* and
is prior-case aware; (b) quantification you can trust and defend in the report to the counted
cell; (c) traceability so complete the report is defensible to the pixel. Pick one as the spine.

### 6. Clinical workflow — walking an actual day

**The core flaw: Section 7 models the specimen's journey, not the pathologist's day.** The
arrival → scan → AI → review → approval → report → archive pipeline is real for a specimen and
misleading for a person. A real day is interrupt-driven and non-linear, and the linear model
hides the highest-stakes workflows.

Friction found by walking a day:

- **Morning.** The pathologist opens a worklist. On what order? STAT/urgent, frozen pending,
  oldest-first, subspecialty routing, and — critically — *cases whose IHC and molecular have
  returned* versus those still waiting. Worklist intelligence is the first thing they touch and
  the blueprint does not design it.
- **Frozen section (intraoperative consult) is entirely missing.** It is the most time-critical,
  highest-stakes workflow in the building: a surgeon is waiting, the turnaround is ~20 minutes,
  and the answer changes the operation in progress. It needs its own stripped, time-boxed mode.
  Its absence is a serious gap for any hospital-based lab.
- **The IHC / special-stains loop breaks the one-way arrow.** The pathologist reviews H&E, orders
  IHC, the case goes *back* to the lab, and returns hours later for re-review. The workflow must
  model "review → order → wait → re-review," including how the case re-enters the worklist when
  stains return. The linear pipeline cannot express this.
- **Batch cytology screening is under-designed.** High-volume normal Pap screening is a rapid
  triage act (confirm normal en masse, flag the abnormal). The blueprint mentions batch
  *authorization* but never designs batch *review* — for a cytology-first product, this is a core
  daily experience.
- **Second opinion / intradepartmental consult.** "Come look at this" — the informal curbside and
  the formal consult — is daily and undesigned, sync and async.
- **Late amendments / addenda.** A signed report that must change when molecular returns days
  later is a first-class, audited, notification-heavy workflow. The blueprint mentions amendments
  but treats them as an edge case rather than a designed loop.

**Recommendation.** Reframe Section 7 around the pathologist's day (worklist intelligence,
interrupts, the IHC loop, frozen section, amendments) and keep the specimen pipeline as the
operational substrate beneath it.

### 7. Enterprise

**Would Mayo, Hopkins, Cleveland Clinic, Quest, or Labcorp find gaps? Yes.**

- **System-of-record coexistence.** All of them run an LIS of record (Epic Beaker, Cerner,
  PowerPath). The single most important enterprise question — how PathOS coexists with it — is
  unanswered. Results must flow back to the LIS via **HL7 v2 (ORU)**, not only FHIR; most labs
  still run HL7 v2 interfaces. The blueprint names FHIR only.
- **Gigapixel imaging at scale.** Whole-slide images are 1–4 GB each, gigapixel. Storage,
  streaming, and retention at institutional volume is a real architectural question the blueprint
  does not touch, and **DICOM WSI** is the emerging standard interface. (Storage today is GCS; the
  scale story is unstated.)
- **Validation and CAP readiness as a *feature*.** Every lab must validate the AI and document it
  for CAP inspection. Shipping **validation/verification tooling** turns a customer burden into a
  selling point. No one owns this well.
- **21 CFR Part 11 e-signatures**, audit export, data residency, disaster recovery and uptime
  SLAs — table stakes for these buyers, currently unstated.
- **Academic specifics.** Resident teaching workflow, subspecialty sign-out routing, tumor
  boards, research/biobank cohorting, and very high consult volume (Mayo). **Reference-lab
  specifics** (Quest/Labcorp): multi-site load balancing, outreach result delivery to thousands
  of ordering providers, courier/logistics, interface-engine throughput.
- **Enterprise quality analytics.** Turnaround by subspecialty, discrepancy rate, amendment rate,
  proficiency — the Medical Director's dashboard and the CAP inspector's evidence. Currently
  folded into generic "analytics."

### 8. Signature experiences — the most important section, challenged

Of the five proposed, only two would make a pathologist tell another pathologist.

- **Evidence-first review** — good, but approaching table stakes (Paige, PathAI, Proscia all show
  regions). Memorable: marginal.
- **Confidence builds through evidence** — this is a principle, not a behavior. What does the user
  *do*? Undefined. Not memorable as written.
- **Side-by-side comparison** — table stakes; every viewer does it. Not a signature.
- **Report traceability** — genuinely differentiated and memorable. Every statement links to the
  pixel and the decision. Keep and make it the spine of Report/Sign-out.
- **Workflow timeline** — useful, not "tell a colleague" material.

**Verdict: the signature set is too safe.** Stronger candidates, designed to be remembered and
recommended:

1. **Read-first, then reveal.** Commit your impression, then the AI shows agreement or
   disagreement. De-biases, builds calibrated trust, creates your concordance record. This is the
   one pathologists would talk about.
2. **Prior-aware reading.** The system automatically surfaces the patient's prior specimens and
   states the delta ("progression from the 2023 biopsy") — turning a painful manual hunt into an
   automatic one.
3. **Trustworthy quantification.** One gesture to count/measure (Ki-67, mitoses, HER2), with the
   counted cells shown, editable, and defensible in the report.
4. **The concordance ledger.** The AI shows its track record with you, by case type. Trust as
   data.
5. **Frozen-section mode.** A calm, time-boxed, single-purpose intraoperative surface for the
   highest-stakes minutes in the lab.

### 9. Competitive analysis

Compared against the current enterprise landscape (Paige, PathAI, Ibex, Proscia Concentriq,
Philips IntelliSite, Sectra, Aiforia; LIS incumbents Epic Beaker, Cerner CoPath, Sunquest
PowerPath) — without copying them:

- **Where PathOS exceeds.** Unified workflow across operations, review, reporting, and portal
  (competitors are point solutions — image management *or* AI *or* LIS). Design and experience
  quality. Evidence-first + report-to-pixel traceability. One coherent system and one design
  language.
- **Where PathOS is merely equal.** WSI viewing, region highlighting, side-by-side, basic AI
  findings, dashboards. These are commodity.
- **Where PathOS is weaker.** No FDA-cleared AI (Paige and PathAI hold clearances; PathOS's AI is
  unvalidated). LIS-of-record depth (Beaker/PowerPath). Gigapixel storage/streaming and DICOM/HL7
  breadth. Install base and institutional trust. Validation tooling.

**The one capability that would make PathOS unquestionably different:** a **calibrated,
prior-aware second reader** — an AI positioned not as autopilot but as the best resident who
remembers every case you have ever signed and every prior on this patient, shows its concordance
with you, and quantifies what it claims. That is a position no incumbent owns, and it is
achievable within Helix and the existing "AI assists, human signs" architecture.

### 10. Roadmap order

**Building the signature first is the riskiest, most expensive, most regulated path.** The AI
Review Workspace is the hardest to build and the one that requires validated AI to be clinically
usable. Leading with it delays revenue and front-loads regulatory risk.

**Value-optimal resequencing:**

1. **Operations first.** Turnaround, workload, SLA visibility. No FDA, immediate ROI, sellable on
   its own, and the wedge that gets PathOS into the building before the AI is validated.
2. **Sign-out (review + report) with traceability.** The differentiator, at a lower regulatory
   bar than diagnostic AI; quantification-first AI can ship here (measurement < diagnosis in
   regulatory risk).
3. **Diagnostic AI review**, once validated, and **Quality & Governance**, which the concordance
   data from steps 2–3 makes possible.
4. **Integration (HL7 v2 / FHIR / DICOM) is foundational, not late.** It is the gate to any
   deployment and should be sequenced first alongside Operations, not treated as a Section 8
   capability.

---

## Strengths

- Evidence before confidence, and the human as the decision of record — a correct, defensible,
  and differentiating spine.
- Workflow-over-pages framing and the workspace model are the right mental model.
- Report traceability ("to the pixel") is a genuine, memorable differentiator.
- Graceful degradation and "AI never throws" are the right reliability posture for clinical use.
- The blueprint is grounded in a real, extensive feature surface, not vapor.

## Weaknesses

- Strategic ambiguity: system of record vs intelligence layer is never resolved.
- Regulatory posture (AI clearance, customer validation burden) is unstated.
- Personas are generic software roles; the product's own cytology identity (cytotechnologist),
  academic reality (resident, QA/Medical Director), and shipped portal (referring clinician) are
  missing.
- Review and Report are split into two workspaces, reintroducing the tool-switch the vision
  condemns; Quality & Governance has no home.
- Section 7 models the specimen's journey, not the pathologist's day, hiding frozen section, the
  IHC re-review loop, batch cytology review, consults, and amendments.
- The signature set is too safe; three of five are near table stakes.
- The AI model asserts trust but provides no mechanism (concordance history, discordance as QA
  signal, de-biasing).

## Risks

- **Enterprise sales stall** on the unanswered system-of-record and regulatory questions.
- **Patient-safety / automation bias** from high-confidence AI without active de-biasing.
- **Scale** — gigapixel WSI storage/streaming and HL7/DICOM breadth are unaddressed and could
  block deployment.
- **Scope dilution** — four symmetric workspaces over-serve rare roles and under-serve the core
  sign-out loop.
- **Regulatory drag** — building diagnostic AI first front-loads the longest, riskiest path.
- **Identity drift** — a cytology product described as generic pathology builds for the wrong
  primary user.

## Missed opportunities

- **Cytology-native positioning.** The product is cytology; surgical-path AI is crowded, cytology
  screening less so. The cytotech screening workflow is an available wedge.
- **Prior-case intelligence.** Automatic longitudinal comparison is high-value and currently
  manual everywhere.
- **Discordance as a two-birds asset.** AI/human disagreement is both an AI value prop and a CAP
  QA requirement; wiring it into Quality & Governance serves both.
- **Validation tooling as a product.** Turn the CAP validation burden into a selling point.
- **Quantification-first AI.** The lowest-regulatory-risk, highest-daily-value AI surface, absent
  from the model.

## Recommendations

1. **Resolve the strategic question in the vision:** declare PathOS a cytology-first intelligence
   layer that coexists with the LIS of record (HL7 v2 / FHIR / DICOM), with replacement as an
   option, not the default. State the assistive regulatory posture and quantification-first plan.
2. **Rewrite personas around the lab:** promote Cytotechnologist, Resident/Fellow, and Medical
   Director/QA to first-class; add Referring Clinician; note Molecular, Tumor Board, External
   Consultant as Phase 3.
3. **Merge AI Review and Report into a single Sign-out workspace; add Quality & Governance.** Keep
   the count at four by redrawing the lines.
4. **Reframe the clinical workflow around the pathologist's day:** worklist intelligence,
   interrupts, the IHC re-review loop, frozen section, batch cytology review, consults, and
   amendments — with the specimen pipeline as the substrate.
5. **Give the AI model a trust mechanism:** read-first-then-reveal, a visible concordance ledger,
   discordance routed to Quality, and quantification as a first-class AI surface.
6. **Answer enterprise explicitly:** LIS coexistence, HL7 v2 / DICOM, gigapixel storage,
   21 CFR Part 11, validation tooling, and enterprise quality analytics.

## Priority changes

- **Resequence the roadmap:** Operations + Integration first (revenue, no FDA), then Sign-out +
  traceability + quantification, then diagnostic AI (post-validation) + Quality & Governance.
- **Promote integration** (HL7 v2 / FHIR / DICOM) from a Section 8 capability to a foundational,
  first-sequenced workstream.
- **Demote generic diagnostic AI** from "build first" to "build once validated," leading with
  quantification instead.
- **Elevate Quality & Governance** from an admin sub-area to a first-class workspace.

## Potential signature features

Ranked by memorability and defensibility:

1. **Read-first, then reveal** — de-biasing, trust-building, concordance-generating. The signature.
2. **Report traceable to the pixel** — keep from the blueprint; make it the spine of Sign-out.
3. **Prior-aware reading** — automatic longitudinal comparison against the patient's history.
4. **Trustworthy quantification** — defensible counts and measurements, editable, in the report.
5. **The concordance ledger** — the AI's track record with you, by case type. Trust as data.
6. **Frozen-section mode** — a calm, time-boxed surface for the highest-stakes minutes in the lab.

---

## Disposition

The blueprint should not be approved as written. It should be revised against the six
recommendations — most importantly the strategic/regulatory declaration (1), the persona rewrite
(2), the Sign-out merge plus Quality workspace (3), and the day-shaped workflow (4) — and then
re-reviewed. None of these require anything beyond Helix v1.0; they are product-architecture
changes, not design-system changes. Once revised, this document and the updated
[docs/PATHOS_v2.md](docs/PATHOS_v2.md) together become the implementation contract for Phase 2.
