'use client';

// Global smooth-scroll engine for the MARKETING surfaces only (landing + routed
// marketing pages). Mounted from the landing page and the MarketingPage shell,
// so it never touches the authenticated app's scroll containers.
//
// Design goals (Apple / Stripe / Linear — restrained, not locomotive):
//  • one RAF loop shared with GSAP's ticker (no double loop, no jitter)
//  • ScrollTrigger updates are driven from Lenis
//  • prefers-reduced-motion → no smoothing at all (native scroll)
//  • no scroll locking, keyboard + browser history preserved
import { useEffect } from 'react';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Lenis housekeeping CSS (mirrors lenis/dist/lenis.css) — critically disables
// CSS `scroll-behavior: smooth` while Lenis is active so the two don't fight.
const LENIS_CSS = `
  html.lenis, html.lenis body { height: auto; }
  .lenis.lenis-smooth { scroll-behavior: auto !important; }
  .lenis.lenis-smooth [data-lenis-prevent] { overscroll-behavior: contain; }
  .lenis.lenis-stopped { overflow: hidden; }
  .lenis.lenis-smooth iframe { pointer-events: none; }
`;

export function SmoothScroll() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return; // honor reduced motion — native scroll, no engine

    gsap.registerPlugin(ScrollTrigger);

    const lenis = new Lenis({
      duration: 1.05,                                   // gentle, ~Apple/Stripe
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.6,
    });

    // Single unified RAF: drive Lenis from GSAP's ticker, feed ScrollTrigger.
    lenis.on('scroll', ScrollTrigger.update);
    const onTick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(onTick);
    gsap.ticker.lagSmoothing(0);

    // Smooth in-page hash anchors (plain <a href="#..."> only; leave Next
    // <Link> routing untouched). Preserve history via pushState.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
      const a = (e.target as HTMLElement)?.closest?.('a');
      if (!a) return;
      const href = a.getAttribute('href') || '';
      const hash = href.startsWith('#') ? href : (href.startsWith('/#') && location.pathname === '/') ? href.slice(1) : '';
      if (!hash || hash === '#') return;
      let el: Element | null = null;
      try { el = document.querySelector(hash); } catch { return; }
      if (!el) return;
      e.preventDefault();
      lenis.scrollTo(el as HTMLElement, { offset: -90 });
      history.pushState(null, '', hash);
    };
    document.addEventListener('click', onClick);

    // Refresh triggers once layout/images settle.
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener('load', refresh);

    return () => {
      document.removeEventListener('click', onClick);
      window.removeEventListener('load', refresh);
      gsap.ticker.remove(onTick);
      gsap.ticker.lagSmoothing(500, 33); // restore GSAP default
      lenis.destroy();
    };
  }, []);

  return <style dangerouslySetInnerHTML={{ __html: LENIS_CSS }} />;
}
