# PathOS — Premium UI, Responsiveness & Accessibility Audit (P0)

**Status:** Audit only. No implementation. Awaiting review before any P1+ work.
**Scope:** Every production route in `apps/web` — staff app, client portal, public/marketing, auth.
**Contract:** This pass changes **presentation, responsiveness, accessibility, and consistency only**. No API, business logic, schema, permissions, auth, tenancy, lifecycle, owner-service, data-contract, clinical, or route behavior changes. No invented data/metrics/status.

> Method: static code analysis of all ~123 routes (4 parallel read-only per-route audits) + quantitative token/typography/a11y grep signals + empirical responsive measurements gathered earlier this session (390/768 sweeps across 82 app routes, portal, and marketing; plus targeted mobile screenshots). Full 10-width empirical verification (320→2560) is scheduled as a P12 deliverable, not a precondition for this audit.

---

## 0. Executive summary

The application is **functionally strong and already responsive at the structural level** (no document-level horizontal overflow was found on the 82 app routes swept at 390/768; navigation collapses to a hamburger; most wide tables scroll inside their own containers). The gap is **visual consistency and polish**, not architecture.

**The single dominant finding:** the app contains **two-and-a-half coexisting design languages**:

1. **Token-based reference kit (the gold standard)** — consumes semantic tokens (`--color-*`, `text-charcoal-heading`, `text-secondary`, `bg-surface-container`, domain tokens) and the `@/components/ui` + `components/security/ui.tsx` primitives, with correct heading/focus management. Exemplars: the **Operations** family, **Quality & Governance**, **Sign-Out**, the entire **Security** tree, **Enterprise Administration**, **profile/security**, and (partially) result-sheets/authorizer/lab-codes/tat. **Billing** is the most token-mature commercial page.
2. **Raw-hex feature-module family** — hardcodes the *same* palette inline (`text-[#0F172A]`, `bg-[#4F46E5]`, `style={{ background:'#F8FAFC' }}`) with fixed-px typography (`text-[28px]/[13px]/[11px]`). This is the majority of the app: wsi, correlation, proficiency, escalations, recalls, workload, analytics, batch-authorize, bethesda-analytics, ai-screening, coding, report-center, payments, req-tracking, appointments, employees, the payroll set, the workforce set, patients/clients/requisitions (partial), and the **entire client portal**.
3. **Bespoke showpieces** — `dashboard` and `records/[id]`: glassmorphism, radial-gradient halos, injected `<style>`, animation, no `<h1>`, zero shared primitives.

Plus a recurring **`glass-card`** (translucent + `backdrop-filter: blur`) used as the default card on most people/admin pages — the glassmorphism the brief flags to reduce.

**Quantitative scale of the drift (staff app only):**

| Signal | Count | Meaning |
|---|---|---|
| Raw hex colors (`#RRGGBB`) | **3,489** across **80** page files | Bypasses the Tier-2 token contract |
| Fixed-px font sizes (`text-[Npx]`) | **1,467** | Bypasses the type-scale tokens |
| Inline `fontSize:` | **153** | Same |
| Files using inline `style={{}}` | **84** | Styling outside the system |
| `uppercase` utilities | **271** | "Reduce unnecessary all-caps" (brief) |
| `outline-none` occurrences | **183** | Focus-visibility a11y risk |
| App pages **not** importing `@/components/ui` | **21 / 107** | Primitive-migration candidates |

**No behavior change is required to fix any of this.** Every recommendation is token migration, primitive adoption, layout-mode standardization, responsive reflow, or an a11y attribute — all presentation-layer.

---

## 1. Production route inventory

Layout modes used below (per brief §Global Layout): **STD** Standard content · **FWW** Full-width workspace · **TBL** Data table/list · **DTL** Detail record · **DASH** Dashboard/overview · **CFG** Settings/config · **AUTH** Auth/public.

**Consistency** = adherence to the token/primitive system (✅ token-based · ⚠️ mixed · ❌ raw-hex/bespoke). **Resp** = responsive risk. **Rx** = redesign(R) vs light-refinement(L). **Risk** = risk-to-change.

### 1a. Clinical & workspaces

| Route | Mode | Consistency | Resp | a11y flags | Rx | Risk |
|---|---|---|---|---|---|---|
| `/dashboard` | DASH | ❌ bespoke | med* | **no h1**, 2 aria-labels total | **R** | **High** (showpiece) |
| `/operations` (+ integration-health, quality-alerts, sla-risk) | DASH/TBL | ✅ | low–med | strong | L | Med |
| `/quality-governance` | FWW | ✅ | low | strong (focus mgmt, kbd grammar) | L | Med |
| `/records` | TBL + master-detail | ⚠️ mixed | med* | filter icon-btn unlabeled | L | Med (primary worklist) |
| `/records/[id]` | FWW (3-panel) | ❌ bespoke | **high** | **no h1**, 25 raw buttons/0 aria | **R** | **High** (clinical detail) |
| `/sign-out/[recordId]` | FWW | ✅ | med | strong | L | **High** (clinical sign-out) |
| `/wsi` | TBL | ⚠️ | med | trash icon-btn no aria | L→partial R | Low |
| `/wsi/[slideId]` | FWW (dark) | ⚠️ | med | **no h1**, add/trash no aria | L | Med (viewer) |
| `/correlation` (+`/[id]`) | TBL/DTL | ❌ | med | **select `outline-none`, no ring** | L | Low–Med |
| `/escalations` | TBL + drawer | ❌ | med | icon buttons | L | Med |
| `/recalls` | TBL + drawer | ❌ | med | icon buttons | L | Med |
| `/proficiency` (+`/[id]`) | DASH/DTL | ❌ | low–med | raw buttons | L | Low |
| `/workload` | TBL + master-detail | ❌ | med–high | selects `outline-none` | L→partial R | Med |
| `/analytics` | DASH | ⚠️ (gray ramp) | med | custom dropdown focus/aria | R-ish | Low–Med |

\* `/dashboard`, `/records` responsive already improved this session (see §11).

### 1b. Results & finance

| Route | Mode | Consistency | Resp | a11y flags | Rx | Risk |
|---|---|---|---|---|---|---|
| `/result-sheets` | TBL + sidebar | ⚠️ | med | ok (role=switch) | L | Med |
| `/authorizer` | TBL + sidebar | ⚠️ | med | tab group unlabeled | L | Med |
| `/batch-authorize` | FWW | ❌ | med | **2 h1**, expand chevron no aria | **R** | Med |
| `/result-templates` (+`/[id]`) | TBL/CFG | ⚠️ (glass-card) | low | checkbox label via title | L | Low |
| `/tat` | TBL + config | ⚠️ | med | ok | L | Med |
| `/bethesda-analytics` | DASH | ❌ | med | charts no text alt | **R** | Med |
| `/ai-screening` | DASH + queue | ❌ | med | empty `<th>` | **R** | Med |
| `/teleconsult` (+`/[id]`) | TBL/DTL | ❌ | low | ok | L | Low |
| `/coding` | FWW (tabbed) | ❌ | med | tab group + search unlabeled | **R** | Med |
| `/report-center` (+`/[reportId]`) | DASH/DTL | ❌ | med | print icon-btn no aria | **R** | Med |
| `/reports` | TBL | ⚠️ mixed eras | low–med | IconBtn uses title | L | Med |
| `/lab-codes` | TBL + sidebar | ✅-ish | med | ok | L | Med |
| `/code-sheets` | CFG | ⚠️ (delegates) | low | via shared pane | L | Low |
| `/cabinets` | FWW | ⚠️ own vocab | med | ok | L | Med — **zero-orange: `#f97316`+`#eab308` in `COLOR_HEX`** |
| `/billing` | DASH + table | ✅ most-mature | med | metric cards not buttons | L | Med |
| `/payments` | DASH + table | ❌ | med | tab decorative icon | **R** | Med |
| `/services` | TBL | ❌ biggest outlier | low–med | **zero h1** | **R** | Med |
| `/taxes` | stub | `ComingSoon` | — | — | — | Low |

### 1c. Directory & people

| Route | Mode | Consistency | Resp | a11y flags | Rx | Risk |
|---|---|---|---|---|---|---|
| `/patients` | TBL | ⚠️ (KpiCard/donut hex) | med | **no h1**, search unlabeled | L | Med |
| `/patients/[id]` | DTL | ❌ hex-saturated | **high** | **no h1**, absolute hero | **R** | Med–High |
| `/clients` | TBL | ⚠️ (twin of patients) | med | **no h1**, search unlabeled | L | Med |
| `/requisitions` | TBL | ❌ | med | tabs no role | L | Med — donut amber↔green gradient (**verify**) |
| `/req-tracking` | FWW (Kanban) | ❌ worst offender | **high** | Kanban `div onClick` (no kbd) | **R** | **High** |
| `/users` | TBL | ⚠️ (glass-card) | low | **no h1**, modal no dialog role | L | Low |
| `/roles` | TBL | ⚠️ (glass-card) | low–med | **no h1** | L | Low–Med |
| `/workspaces` | DASH | ⚠️ (TINTS hex) | med | kebab no role/kbd | L–mod | Med |
| `/departments` | DASH | ⚠️ (twin of workspaces) | med | kebab no role | L–mod | Med |
| `/employees` | TBL | ❌ | med | modal grid won't stack | **R** | Med |
| `/employees/[id]` | DTL | ❌ named hues | **high** | schedule `grid-cols-7` no collapse | **R** | Med |
| `/payroll` | DASH | ❌ | med | **no h1**, `tr onClick` not kbd | **R** | **High** |
| `/payroll/run/[id]` | DTL | ❌ | med–high | **no h1**, toggles no aria-expanded | L | Med |
| `/payroll/slip/[adviceId]` | DTL (print) | ❌ (PayslipCard) | **high** | h1 only when loaded | L (shell) | Low/Med |
| `/payroll/wizard` | FWW (stepper) | ❌ | **high** | stepper no aria-current | **R** | **High** |
| `/workforce` | DASH | ⚠️ | med | bars color+label (ok) | L | Med |
| `/workforce/leave` | TBL | ❌ | med | `outline-none` all fields | L | Med |
| `/workforce/overtime` | TBL | ❌ | med | approve/reject icon-only title | L | Med |
| `/workforce/performance` | TBL | ❌ most-hex | med | `tr onClick` not kbd | L→R (color) | Med–High |
| `/workforce/productivity` | DASH | ❌ (custom Ring) | med | Ring no role=img | L | Med |
| `/workforce/reports` | TBL | ❌ | med | **rate/pending color-only** | L | Low |
| `/workforce/schedule` | FWW (week grid) | ❌ | **high** | prev/next + cell `+` no aria | L | Med (DST math — don't touch) |
| `/workforce/timesheets` | TBL | ❌ | med | icon-only title, `window.prompt` | L | Low–Med |
| `/workforce/timesheets/[id]` | DTL | ❌ | med | **zero headings** | L | Low |
| `/appointments` | FWW (calendar) | ❌ bypasses system | **high** | day cells no aria-label | **R** | Med–High |

### 1d. Platform, config & security

| Route | Mode | Consistency | Resp | a11y flags | Rx | Risk |
|---|---|---|---|---|---|---|
| `/settings` | CFG (master-detail) | ⚠️ | low–med* | **no h1** (title is a div) | L | Low |
| `/settings/features` | CFG (card grid) | ❌ | low | modal no focus trap | **R** | Med |
| `/settings/forms` (+`/[formType]`) | CFG/DTL | ⚠️ | med | drag-reorder mouse-only | **R** (editor) | Med |
| `/security` + 8 children | DASH/TBL/CFG | ✅ (security/ui.tsx) | low–med | strong | L | Low |
| `/system` | DASH | ⚠️ | med | ok | L | **High** |
| `/system/logs` | TBL | ⚠️ | low–med | filter inputs unlabeled | L | Med |
| `/system/support` | FWW | ⚠️ | med | ok | L (large) | **High** |
| `/superuser/features` | CFG | ⚠️ | low–med | ok | L | **High** |
| `/enterprise-administration` | DASH | ✅ | low | strong | L | Med |
| `/fhir` | FWW | ⚠️ | med | preview toolbar unlabeled | L | **High** |
| `/qc` | DASH | ⚠️ | med | modal close no aria | L | **High** |
| `/qc/equipment` | TBL | ⚠️ | **high** | **7-col table NOT in `overflow-x-auto`** | L | Med |
| `/reagents` | DASH | ⚠️ | low–med | modal close no aria | L | Med |
| `/files` | TBL | ⚠️ | low–med | filter unlabeled | L | Med |
| `/notifications` | FWW | ⚠️ | **med–high** | **detail `hidden xl:block` → dead on tablet** | L | Med |
| `/messaging` | FWW | ❌ | med–high* | **Unsplash avatars for real users** | **R** | High |
| `/change-requests` | FWW | ⚠️ | med* | "New Request" decoy toast; Priority hardcoded | L | Med |
| `/knowledge-base` (+ articles) | STD/TBL | ⚠️ | low | ok | L | Low |
| `/search` | STD | ⚠️ | low | ok | L | Low |
| `/profile/security` | CFG | ✅ | low–med | ok | L | Low |

\* responsive already improved this session for settings/messaging/change-requests (see §11).

### 1e. Client portal

| Route | Mode | Consistency | Resp | a11y flags | Rx | Risk |
|---|---|---|---|---|---|---|
| `/portal/login` | AUTH | ⚠️ | low | ok | L | Low |
| `/portal/records` | TBL | ⚠️ | med | `tr onClick` mouse-only | L | Med |
| `/portal/messages` | FWW | ❌ | med* | — | **R** | Med |
| `/portal/requisitions` (+`/[batchId]`) | TBL | ❌ | **high** | **6-col table unwrapped**, horizontal step timeline crushes | **R** | Med |
| `/portal/reports` | STD | ⚠️ | med | invented `pages` at render | L | Low |

Portal note: uses **three color systems at once** (raw hex `#4F46E5` ~20×, Tailwind defaults `bg-indigo-600`/`bg-emerald-100`, and a few real tokens). Any theme/dark-mode work misses the portal entirely. Root: `src/lib/portal-ui.tsx`.

### 1f. Public / marketing / auth

| Route | Mode | Consistency | Resp | Rx | Risk |
|---|---|---|---|---|---|
| `/login` | AUTH | ⚠️ (billboard) | **high** | L (de-billboard) | Med |
| `/` (landing home) | STD (marketing) | ❌ ~95% inline style, **no media queries** | **high** | **SCOPE-LOCKED — report only** | High |
| `/platform` | STD | ⚠️ | med* | L | Low |
| `/solutions` | STD | ⚠️ | med–high | L | Low |
| `/contact`, `/book-demo` | STD + form | ⚠️ | med | L + focus fix | Low–Med |
| `/compliance` | STD | ⚠️ | med–high | L | Low |
| `/privacy`, `/terms` | STD (legal) | ⚠️ | med–low | L | Low |

\* `/platform` hero clipping already fixed this session (see §11).

---

## 2. Global design issues (thematic)

1. **Two/three design languages** (see §0). This is the root cause of ~80% of the visual-consistency debt. The fix is *migration toward the existing token kit*, not a redesign of Helix.
2. **Raw hex everywhere** — 3,489 occurrences. Both inline `style={{ background:'#4F46E5' }}` and Tailwind arbitrary values `text-[#0F172A]`. Direct violation of the "no raw hex in components" locked decision.
3. **Fixed-px typography** — 1,467 `text-[Npx]` + 153 inline `fontSize` + inline `fontFamily:'Geist'` (billing/payments/services). Bypasses the type-scale tokens; produces inconsistent page-title sizes (h1 ranges from `text-[24px]` to `text-[32px]` to `text-2xl` across pages).
4. **Inline `style={{ background:'#F8FAFC' }}` page backgrounds** — on patients/[id], req-tracking, employees(+[id]), all payroll, appointments, and most raw-hex pages. Should be a layout-level **surface token** — this *also breaks theme-awareness* on the active `feat/theme-system` branch.
5. **`glass-card` glassmorphism as default** — translucent + `backdrop-filter: blur(12px)` + heavy shadow on users/roles/workspaces/departments/employees(+[id])/payroll(+run/wizard)/result-templates/tat/reports/cabinets. Product-wide decision needed: keep or flatten to `Card`.
6. **Gradients & halos in clinical surfaces** — dashboard radial-halo animation, records/[id] gradient action buttons + injected keyframes, payroll gradients. Brief: avoid decorative effects in clinical workspaces.
7. **Marketing-scale type inside the app** — services (Geist 40px headers, `rounded-3xl`), dashboard, records/[id]. Brief: avoid oversized marketing typography in the product.
8. **Excessive uppercase** — 271 usages; loud all-caps labels (`text-[10px] uppercase tracking-wider`) dominate workforce/payroll/dashboard.
9. **Off-system neutral ramps** — analytics and payroll use the Tailwind `gray-*` ramp while the rest of the app uses `slate-*`/`charcoal`. Two neutral systems.
10. **Duplicated local components** — `Kpi`/`KpiCard`/`StatCard` reinvented in ~15 files; custom SVG rings/donuts/gauges where `Gauge` exists; local `BADGE`/`CHIP`/`StatusBadge`/`TH`/`CELL`/`SELECT`/`inp` class-string constants everywhere.

---

## 3. Responsive issues

**Structural baseline is good:** the 82-route sweep at 390/768 found **zero document overflow**; nav collapses; most wide tables are wrapped in `overflow-x-auto`. The remaining issues are specific, and several were **already fixed this session** (§11).

### Functional responsive defects (act-first)
- **`/qc/equipment`** — 7-column `<table>` is **not** wrapped in `overflow-x-auto` → real clipping/overflow on narrow screens.
- **`/portal/requisitions`** — 6-col table also unwrapped; the 4-step expander timeline lays out horizontally with `flex-1` and crushes on narrow screens.
- **`/notifications`** — detail panel is `hidden xl:block`; **below 1280px, tapping a notification (and its Mark-as-read / View actions) does nothing** — a functional gap on tablet/mobile.
- **`/services`** — feed table not in an `overflow-x-auto` container (5 cols, lower risk).

### Forced non-collapsing layouts (redesign targets)
- `/appointments` month calendar (`grid-cols-7 min-h-[104px]`), `/workforce/schedule` week grid (8-col `px-1.5`), `/employees/[id]` schedule (`grid-cols-7`), `/payroll/wizard` editable registers, `/payroll/slip` print/letter table, `/patients/[id]` absolute-positioned hero + fixed 45% image column, `/records/[id]` fixed-height 3-panel with `w-[560px]` center + `min-w-[280px]` sides (breaks below ~1100px), `/req-tracking` 5-col Kanban.
- **`/` (landing home)** — no media queries at all; fixed grids (`42% 32% 26%` @ `minHeight:940px`, `repeat(6,1fr)` logo wall) overflow below ~900px. **SCOPE-LOCKED** — report only. (`HeroV2.tsx` itself is responsive.)
- **`/login`** — billboard layout, high risk narrow.

### Already fixed this session (§11)
dashboard card grids + vitals (1-per-row on phones), messaging & settings & portal-messages single-panel master-detail, analytics stat row, `/platform` hero clipping, operations AttentionRail row collision, security-shell + users/roles full-width.

---

## 4. Accessibility issues

- **Heading hierarchy (one `<h1>` per page):**
  - **Zero `<h1>`:** dashboard, records/[id], wsi/[slideId], patients, patients/[id], clients, users, roles, payroll, payroll/run/[id], services, settings (title is a `<div>`), workforce/timesheets/[id] (no headings at all).
  - **Two `<h1>`:** batch-authorize.
  - **`<h1>` only after load (none in loading/error):** payroll/slip.
- **Focus visibility:** 183 `outline-none` occurrences. Most inputs rely on `focus:border-primary` (no ring). **`/contact` + `/book-demo`** use inline `outline:'none'` with **no `:focus` replacement possible in inline style** → invisible keyboard focus (WCAG 2.4.7). `correlation` select removes the ring with no replacement.
- **Icon-only controls without accessible names:** wsi trash/add, correlation, batch-authorize expand chevron, workforce overtime/timesheets approve/reject (use `title` not `aria-label`), workforce/schedule prev/next + empty-cell `+` (7×N unlabeled), qc/reagents/files modal-close, records filter, report-center print, billing/reports `IconBtn` (title-only).
- **Non-keyboard click targets:** `<tr onClick>` rows (payroll, workforce/performance, patients, portal/records, portal/requisitions) and `<div onClick>` Kanban cards (req-tracking) — not focusable/activatable.
- **Dialogs:** ~15 hand-rolled modals/drawers set **no** `role="dialog"`/`aria-modal`/focus-trap/Escape handling (req-tracking ×3, workspaces, departments, employees, leave, overtime, performance ×3, schedule, timesheets, appointments ×2, qc, reagents, files, settings/features). `window.prompt` used for reject reasons (timesheets ×2).
- **Tab groups:** authorizer, teleconsult, coding, bethesda, billing, payroll — plain buttons, no `role="tablist"`/`aria-selected`.
- **Color-only status:** `workforce/reports` rate/pending cells (color with no text/icon). Most other statuses are color **plus** label (good).
- **Charts:** bethesda/ai-screening/analytics have no text alternative for chart data.

---

## 5. Component-system inconsistencies & primitive gaps

**Available but underused primitives** (`@/components/ui`): `Card`, `StatCard`, `Table`/`Th`/`Td`/`Tr`, `DataTable`, `Badge`, `StatusBadge`, `Gauge`, `EmptyState`, `Skeleton`, `Button`, `IconButton`/`IconAction`, `Input`, `PillSelect`. Reference token kit for admin/security: `components/security/ui.tsx`.

**Primitive gaps to close (highest leverage first):**

1. **Shared accessible `Modal` / `Drawer` primitive — does not exist.** ~15 pages hand-roll `createPortal` scrims with inline shadows, no focus trap, no Escape, no `role="dialog"`. This is the **single biggest a11y + consistency win** and directly serves the brief's "Modals, Drawers, Overlays" section. (Note: a `Portal` primitive already exists and is used by a few pages.)
2. **Domain status-token source.** `lib/workforce.ts` (`ATT_STATUS`, `WF_STATUS`, `SHIFT_CHIP`, `rateColor`, `WARN_FG`), `lib/appointments.ts` (`TYPE_META`, `STATUS_META`), `lib/portal-ui.tsx`, and duplicated local `STATUS` maps hardcode hex and render `style={{ background:s.bg, color:s.fg }}`. Routing these through `--workflow-*`/`--status-*` domain tokens fixes ~10 routes at once **and** makes them theme-aware.
3. **`StatCard` adoption.** Local `Kpi`/`KpiCard` reimplementations in ≥15 files (patients, clients, requisitions, req-tracking, workspaces, departments, employees, payroll, workforce, productivity, appointments, result-sheets, authorizer, lab-codes, bethesda, ai-screening, teleconsult, coding, report-center, reports, billing, payments) → `StatCard`.
4. **`Badge`/`StatusBadge` adoption.** Hand-rolled inline-style status pills across the raw-hex family → `Badge`/`StatusBadge` (color + label already present, so no behavior change).
5. **`Table`/`Th`/`Td`/`Tr` adoption.** Raw `<table>` in patients/[id], req-tracking, workforce, timesheets, employees/[id], wsi, correlation, proficiency/[id] → primitives (fixes the qc/equipment + services overflow-container gaps for free).
6. **`Gauge` adoption.** Custom SVG rings/donuts in workforce/productivity (`Ring`), billing (`CollectionGauge`), patients/clients (donuts) → `Gauge`.
7. **Shared `Switch`/`Toggle` primitive.** ≥3 implementations today (settings/features, settings/forms/[formType] with off-palette `#c7c4d8`, superuser/features) plus antd `Switch` on security.
8. **`Input`/`PillSelect` adoption.** Local `inp`/`SELECT`/`fieldClass` class-string constants → primitives (also fixes the systemic `outline-none` focus gap in one place).
9. **Surface / page-background token.** Replace inline `style={{ background:'#F8FAFC' }}` with a layout-level surface token (theme-aware).
10. **Marketing kit tokenization.** `marketing-ui.tsx` `RED/INK/INDIGO/VIOLET/GREEN` consts → tokens + shared responsive grid rules refines `/solutions`, `/compliance`, `/contact`, `/book-demo`, `/privacy`, `/terms` in one pass.

**Introduce a new shared primitive only for:** the `Modal`/`Drawer` (recurs ~15×, no correct primitive exists, reusable project-wide, no behavior change) and possibly a `Switch` (recurs 3×+). Everything else is *adoption of existing primitives*, not new abstractions.

---

## 6. Zero-orange status (must pixel-verify before any sign-off)

Static scan found **one likely real violation** and several amber chips that need the pixel detector (per the constitution: "a safe solid can still be a violation" via anti-aliased edges over amber-100; "safe stops ≠ safe gradient"):

- **Likely violation — `/cabinets`** `COLOR_HEX` (page.tsx L14–16) contains `orange:'#f97316'` and `yellow:'#eab308'` (the exact `#EAB308` the constitution names), rendered as folder fills and 28px swatch buttons. Comment claims "user-chosen swatch," but they are painted pixels. **Verify + remediate.**
- **Verify (amber-fg-on-amber-bg / gradient):** requisitions donut (amber↔green interpolation), workforce (leave/performance/productivity/reports `#A16207`/`#CA8A04`/`#92400E` fills), appointments amber chips (`#FFFBEB`), settings/features + `/login` `bg-amber-50` banners, and recurring `#FEF9C3/#FEF3C7/#FFFBEB/#FDE68A` fills on system/support, fhir, qc, files, notifications, change-requests, knowledge-base/articles, portal `OnHold`/`InReview` badges. Landing gradients (red/violet/magenta) look mathematically safe but need the detector.

All of the above are candidates for the P12 pixel-detector gate. (Pages I *did* screenshot + detect this session — dashboard, changed pages, platform, portal messages — returned 0.)

---

## 7. Content-truthfulness flags (preserve, do not "fix" by inventing)

Surfaced during the audit; these are **not** styling issues but must be respected by the no-invented-data rule (fix only if the owner exposes real data; otherwise leave truthful):

- `/messaging` assigns **external Unsplash stock faces** to real staff/clients (`AVATAR_POOL`) — CSP/offline/privacy risk; migrate to the `Avatar` initials primitive.
- `/analytics` ships seeded placeholder datasets (`VOLUME`/`BREAKDOWN`/`CONVERSION`, commented "not yet exposed").
- `/change-requests` shows a hardcoded "Medium" Priority (fabricated field); "New Request" is a decoy toast.
- `/portal/reports` invents `pages` at render.

These predate this pass; the audit records them so the polish work does not entrench them.

---

## 8. Redesign vs light refinement

**Structural redesign (re-base on primitives/tokens or reflow a non-collapsing layout):** dashboard, records/[id], req-tracking, employees, employees/[id], payroll, payroll/wizard, appointments, patients/[id], batch-authorize, bethesda-analytics, ai-screening, coding, report-center, payments, services, settings/features, settings/forms/[formType], messaging, portal/messages, portal/requisitions. *(These are re-basings, not product redesigns — same data, same flows.)*

**Light refinement (structure sound; tokenize + adopt primitives + a11y fixes):** everything else — the entire operations/quality/sign-out/security/enterprise-admin family (already close), result-sheets, authorizer, lab-codes, tat, reports, cabinets, billing, patients, clients, requisitions, users, roles, workspaces, departments, the payroll detail/slip, all workforce leaf routes, wsi, correlation, proficiency, escalations, recalls, workload, analytics, the whole system/qc/fhir/reagents/files/notifications/change-requests/knowledge-base/search set, portal/records + portal/reports, and the marketing pages.

**Stubs / delegated:** taxes (`ComingSoon`), code-sheets (`SettingsListPane`).

---

## 9. Highest-risk areas (gate behind explicit approval; verify flows after)

Ranked by clinical/operational criticality × change surface:

1. **Sign-Out** (`/sign-out/[recordId]`) — clinical authority; already token-clean, so **light-touch only**.
2. **`/records/[id]`** — clinical record detail; bespoke → true redesign; highest care.
3. **`/dashboard`** — most-seen showpiece; bespoke redesign.
4. **Payroll set** (`/payroll`, `/payroll/wizard`, run/slip) — financial correctness + print; DST/print math must not move.
5. **`/req-tracking`, `/qc`, `/fhir`, `/system`, `/system/support`, `/superuser/features`, `/enterprise-administration`** — operational/config-critical.
6. **`/appointments`, `/workforce/schedule`, `/employees/[id]`** — calendar/DST date math must not be touched (styling/layout only).

Per the engineering constitution, the two true showpiece redesigns (dashboard, records/[id]) and any Sign-Out / Quality / Enterprise-Admin change require **explicit named-area approval** before implementation.

---

## 10. Recommended phased implementation order (with file groups)

Each phase is independently reviewable, testable, committable, and rollback-safe. **Stop for review after each phase.** No enormous commits.

| Phase | Scope | Primary file groups |
|---|---|---|
| **P1 — Foundations** | Confirm/extend semantic + type-scale + surface tokens; standardize the 7 layout modes + app-shell gutters/max-width; a **page-background surface token**. No page rewrites. | `src/app/globals.css`, `src/components/ui/*`, `src/app/(app)/layout.tsx`, `tailwind`/`ui/cn.ts` merge contract |
| **P2 — Shared primitives** | Build the **accessible `Modal`/`Drawer`** + `Switch`; wire `extendTailwindMerge` for any new utility. Domain status-token source. | `src/components/ui/*`, `src/lib/{workforce,appointments,portal-ui}.ts(x)` (token maps only) |
| **P3 — Nav, headers, containers** | One `<h1>` per page; consistent PageHeader; fix zero-/double-h1 pages; nav active/`aria-current`. | `layout.tsx`, `components/dashboard/nav-pills.tsx`, per-page headers |
| **P4 — Lists/tables/filters** | Migrate raw `<table>`→primitives; wrap the 2 unwrapped tables (qc/equipment, portal/requisitions, services); standardize filter/search rows; StatCard adoption. | results/finance + directory/people table pages |
| **P5 — Record & clinical detail** | `records/[id]` reflow+tokenize (approval-gated), patients/[id], correlation/[id], teleconsult/[id], proficiency/[id]. | clinical detail pages |
| **P6 — Major workspaces** | operations (light), workload, req-tracking, coding, messaging (+ Avatar), notifications tablet fix. | workspace pages |
| **P7 — Settings & administration** | settings/features + forms editor, superuser, enterprise-admin (light), fhir, qc, reagents, files; security tree already good. | settings/*, system/*, admin |
| **P8 — Forms, dialogs, drawers** | Migrate hand-rolled modals→Modal primitive; restore focus rings (contact/book-demo/correlation + systemic `outline-none`); label icon-only + tab groups. | all overlay-bearing pages |
| **P9 — Public/auth** | `/login` de-billboard; marketing kit tokenize + responsive grids (`/platform`,`/solutions`,`/contact`,`/book-demo`,`/compliance`,`/privacy`,`/terms`). Landing home report-only. | `app/(marketing)`, `marketing-ui.tsx`, `login` |
| **P10 — Portal** | Token-migrate the entire portal; portal/messages single-panel already done — finish requisitions timeline + records reflow; Avatar primitive. | `app/portal/*`, `lib/portal-ui.tsx` |
| **P11 — Mobile refinement** | Per-page mobile passes for the non-collapsing layouts (appointments/schedule/employees[id]/payroll wizard/slip). | calendar/register pages |
| **P12 — A11y + responsive + zero-orange QA** | 10-width sweep (320→2560), keyboard/focus pass, pixel-detector (cabinets first), reduced-motion, dark/light. | project-wide verification |
| **P13 — Cleanup & docs** | Remove duplicated local components; write implementation notes; final regression. | project-wide |

*(P0 = this audit. The dashboard showpiece redesign is intentionally **not** its own phase — it should be scheduled explicitly with the user after P1–P4 land the primitives it needs.)*

---

## 11. Current in-flight state (this session's approved work already in the tree)

The working tree already contains **approved responsiveness/UX fixes** from earlier this session that pre-satisfy several audit items — the audit reflects post-fix reality where noted:

- Responsive: dashboard card grids + vitals (1-per-row on phones), messaging / settings / portal-messages single-panel master-detail (+ back nav), analytics stat row, `/platform` hero clipping, operations **AttentionRail** row collision, security shell + users/roles full-width.
- Controls: many dead/duplicate buttons removed or wired across ~14 pages.
- A9: Enterprise Administration permission-matrix (descriptive, no behavior change).

These are **not** part of P0 and are already reviewed/approved; the audit simply accounts for them so P1+ does not re-litigate solved items.

---

## 12. Working-tree safety record

At audit time: **51 modified + 18 untracked** files. Modified files include this session's approved work (dashboard, messaging, settings, operations/AttentionRail, security/ui, superuser/features, lab-features, EditorialHero, globals.css, portal messages, RecordFormDrawer, analytics, etc.) **and pre-existing unrelated dirty files** (`api/…/lab-codes.service.ts`, `api/…/patients.service.ts`, `records/[id]/page.tsx`, `SettingsListPane.tsx`, `hero-v2/*`, `landing/*`, `LenisProvider.tsx`, `theme-context.tsx`, `lib/features.ts`, `ui/index.ts`, `tsconfig.json`, `app/page.tsx`, `marketing-chrome.tsx`) plus untracked scratch files (`_*.mjs`, `.claude/`, some `public/*.png`).

**This audit created exactly one file: `docs/PATHOS_PREMIUM_UI_AUDIT.md`.** No source file was modified, staged, reformatted, or committed. Every phase report will re-list changed files, unrelated files left untouched, and rollback boundary.

---

## 13. No-behavior-change contract (binding for P1+)

Every phase of this pass will preserve, unchanged: API behavior & payloads, business logic, DB schema & Prisma models, permissions & seeds, authentication, tenant scoping, lifecycle logic, owner-service logic, data contracts, route behavior, validation & submission behavior, persistence, Sign-Out / Quality / Enterprise-Administration behavior, and existing workflow ownership. No data, metric, status, or clinical content will be invented; no working feature removed; no second design system introduced; no page-specific tokens created; no blind global search-and-replace; no unrelated files staged or committed.

---

## 14. Recommendation

Approve P1 (Foundations) + P2 (shared `Modal`/`Drawer` + status tokens) first — they are low-risk, unblock every later phase, and immediately raise consistency. Defer the two showpiece redesigns (dashboard, records/[id]) to explicit, separately-approved slots. Everything else is light refinement that can proceed page-group by page-group with per-phase review.

**End of P0 audit. Awaiting review — no implementation will begin until approved.**
