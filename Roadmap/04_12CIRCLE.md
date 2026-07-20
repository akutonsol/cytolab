# 12 Circle Fitness

| Field | Value |
|---|---|
| Status | Planning |
| Current Phase | Concept |
| Owner | Founder |
| Dependencies | Helix v1.0 (frozen) + a 12 Circle theme |
| Last Updated | 2026-07-10 |
| Priority | P2 |
| Expected Next Milestone | Theme definition and app concept |

12 Circle Fitness is a premium coaching platform built on Helix. It is the second product,
and its purpose is dual: to be an excellent fitness product, and to be the trigger that
proves Helix is reusable across domains. No codebase exists yet.

---

## Vision

A premium coaching platform that feels like Apple Fitness+, WHOOP, Oura, Nike Run Club,
Headspace, Strava, or Levels — not like a clinical tool. Energetic, springy motion; big,
legible metric readouts; airier density; an athletic brand voice. It connects coaches and
clients around measurable progress.

The four non-colour theme dimensions (type personality, motion character, density/radius,
voice) are what make 12 Circle feel distinct from Osieri while sharing the same foundation.

## App roadmap

- Client mobile-first experience: today's plan, metrics, streaks, coach messages.
- Session logging and progress history.
- Wearable-driven metric readouts front and center.
- Motion and density tuned to an athletic personality via the theme, not custom CSS.

## Coach platform

- Coach dashboard: roster, adherence, at-a-glance client status.
- Program builder and assignment.
- Messaging and check-ins.
- Reuses the roster/worklist and messaging patterns proven in Osieri.

## Client experience

- Onboarding and goal setting.
- Daily plan and adaptive adjustments.
- Progress visualization with large metric readouts.
- Notifications and reminders that acknowledge, never nag.

## Community

- Group challenges and leaderboards.
- Shared milestones and accountability.
- Optional social layer around progress.

## Nutrition

- Plan and log nutrition alongside training.
- Targets tied to goals and wearable data.
- Coach visibility and guidance.

## Wearables

- Integrate common wearable data sources (heart rate, sleep, activity, recovery).
- Normalize signals into the metric readouts.
- Drive adaptive coaching from recovery/readiness.

## AI coaching

- Adaptive program adjustments from performance and recovery data.
- Human-in-the-loop: AI proposes, coach approves.
- Measured degradation when signals are missing.

## Growth strategy

1. Define the 12 Circle Helix theme (colour, type, motion, density, voice).
2. Build the client experience MVP.
3. Add the coach platform.
4. Layer community, nutrition, wearables, and AI coaching.
5. Feed every Helix limitation discovered into [05_HELIX_v1_1.md](05_HELIX_v1_1.md); this
   product is expected to be the primary source of Helix v1.1 evidence.

Architecture decisions are recorded in [06_DECISIONS.md](06_DECISIONS.md); debt in
[07_TECHNICAL_DEBT.md](07_TECHNICAL_DEBT.md).
