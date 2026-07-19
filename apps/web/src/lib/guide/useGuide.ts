'use client';

import { usePathname } from 'next/navigation';
import { useGuideStore } from './store';
import { JOURNEYS, type Journey, type GuideStep } from './journeys';

export interface GuideState {
  active: boolean;
  journey?: Journey;
  step?: GuideStep | null;
  stepIndex: number; // 0-based; -1 when the journey is complete
  total: number;
  completed: boolean;
  onRoute: boolean; // is the user on the screen where this step's target lives?
}

const firstIncomplete = (j: Journey, signals: string[]) => j.steps.findIndex((s) => !signals.includes(s.completeOn));

/**
 * Derive the current guided step from live state. With multiple journeys, the
 * ACTIVE journey is chosen by route relevance so the coach follows the user's
 * context: on payroll screens the payroll journey leads, on clinical screens the
 * case journey leads. Within a journey, the step is the first whose completing
 * signal hasn't fired — so it always picks up where you are.
 */
export function useGuide(): GuideState {
  const pathname = usePathname();
  const enabled = useGuideStore((s) => s.enabled);
  const signals = useGuideStore((s) => s.signals);
  const dismissed = useGuideStore((s) => s.dismissed);

  const live = JOURNEYS.filter((j) => !dismissed.includes(j.id));
  if (!enabled || live.length === 0) {
    return { active: false, stepIndex: -1, total: 0, completed: false, onRoute: false };
  }

  const withIdx = live.map((j) => ({ j, idx: firstIncomplete(j, signals) }));
  const incomplete = withIdx.filter((x) => x.idx !== -1);

  // Prefer the incomplete journey whose CURRENT step is on this route, then any
  // incomplete journey that has a step on this route, then the first incomplete,
  // then (all done) the first journey so its completion state can be dismissed.
  const pick =
    incomplete.find((x) => x.j.steps[x.idx].route?.test(pathname)) ??
    incomplete.find((x) => x.j.steps.some((s) => s.route?.test(pathname))) ??
    incomplete[0] ??
    withIdx[0];

  const journey = pick.j;
  const stepIndex = pick.idx;
  const completed = stepIndex === -1;
  const step = completed ? null : journey.steps[stepIndex];
  const onRoute = step?.route ? step.route.test(pathname) : true;

  return { active: true, journey, step, stepIndex, total: journey.steps.length, completed, onRoute };
}
