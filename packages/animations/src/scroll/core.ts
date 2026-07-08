// Shared GSAP + ScrollTrigger core for the scroll-choreography motion system.
//
// Every utility here is SSR-safe (no-ops on the server), respects
// prefers-reduced-motion (elements settle instantly, no transform), and never
// bounces/overshoots — the house style is restrained: translate + opacity,
// power-curve easing, 0.6–0.9s. Used to LAYER motion onto existing sections;
// it does not restyle or move anything.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

let registered = false;

/** Register ScrollTrigger once, client-only. Returns null on the server. */
export function ensureScrollTrigger(): typeof ScrollTrigger | null {
  if (typeof window === 'undefined') return null;
  if (!registered) { gsap.registerPlugin(ScrollTrigger); registered = true; }
  return ScrollTrigger;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export type Target = Element | Element[] | NodeListOf<Element> | string;

export function resolve(target: Target): Element[] {
  if (typeof window === 'undefined') return [];
  if (typeof target === 'string') return Array.from(document.querySelectorAll(target));
  if (target instanceof Element) return [target];
  return Array.from(target as Element[]);
}

/** House easing + timing tokens (restrained, never bouncy). */
export const MOTION = {
  ease: 'power2.out',
  easeInOut: 'power2.inOut',
  y: 28,
  duration: 0.8,
  start: 'top 84%',
} as const;

export { gsap, ScrollTrigger };
