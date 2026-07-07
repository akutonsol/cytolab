'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { ArrowRight, Play } from 'lucide-react';

// The animated WebGL specimen vial (Three.js) — browser-only, so SSR is off.
const SpecimenTube3D = dynamic(
  () => import('@/components/auth/SpecimenTube3D').then((m) => ({ default: m.SpecimenTube3D })),
  { ssr: false, loading: () => <div style={{ width: '100%', height: '100%' }} /> },
);

const RED = '#E53A34';

/**
 * Premium editorial hero. Two-column: editorial copy left, animated 3D vial
 * right. Entrance staggers the badge → headline lines → copy → buttons; on
 * scroll the layers drift at slightly different speeds for depth.
 */
export function EditorialHero() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setScrollY(window.scrollY));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Parallax: badge drifts up; headline/paragraph/buttons lag progressively
  // (95% / 90% / 85% scroll speed) so they trail the scroll and add depth.
  const drift = (factor: number) => ({ transform: `translate3d(0, ${scrollY * factor}px, 0)` });

  return (
    <section
      style={{
        maxWidth: 1680,
        margin: '0 auto',
        padding: '120px 72px 80px',
        display: 'grid',
        gridTemplateColumns: '620px 1fr',
        alignItems: 'center',
        gap: 80,
      }}
      className="hero-grid"
    >
      {/* ── Left: editorial copy ── */}
      <div>
        {/* Category badge */}
        <div style={drift(-0.2)}>
          <span
            className="hero-rise"
            style={{
              animationDelay: '100ms',
              display: 'inline-flex',
              alignItems: 'center',
              height: 36,
              padding: '0 18px',
              borderRadius: 999,
              background: 'rgba(229,58,52,.08)',
              border: '1px solid rgba(229,58,52,.12)',
              fontSize: 11,
              letterSpacing: '.25em',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: RED,
              whiteSpace: 'nowrap',
              gap: 10,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: 999, background: RED, flexShrink: 0 }} />
            Artificial Intelligence • Pathology Labs
          </span>
        </div>

        {/* Headline — each line animates independently */}
        <div style={{ ...drift(0.05), marginTop: 40 }}>
          <h1
            className="hero-headline"
            style={{ fontWeight: 650, lineHeight: 0.96, letterSpacing: '-.05em', color: '#111111', maxWidth: 640, margin: 0 }}
          >
            <span className="hero-rise" style={{ display: 'block', animationDelay: '220ms' }}>Unified pathology.</span>
            <span className="hero-rise" style={{ display: 'block', animationDelay: '340ms' }}>One platform.</span>
            <span
              className="hero-rise"
              style={{ display: 'block', animationDelay: '460ms', fontStyle: 'italic', fontWeight: 500, color: RED }}
            >
              Cellular level.
            </span>
          </h1>
        </div>

        {/* Supporting copy */}
        <div style={{ ...drift(0.1), marginTop: 40 }}>
          <p
            className="hero-rise"
            style={{ animationDelay: '580ms', maxWidth: 520, fontSize: 22, lineHeight: 1.75, fontWeight: 400, color: '#6A7280', margin: 0 }}
          >
            CYTOLAB unifies every step of your workflow with AI-powered screening, intelligent
            workflows, and real-time insights—so you can focus on what matters most: better outcomes.
          </p>
        </div>

        {/* CTA row */}
        <div style={{ ...drift(0.15), marginTop: 48 }}>
          <div className="hero-rise" style={{ animationDelay: '700ms', display: 'flex', alignItems: 'center', gap: 24 }}>
            <a
              href="#"
              className="hero-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                height: 56,
                padding: '0 32px',
                borderRadius: 999,
                background: 'linear-gradient(180deg, #E5423C 0%, #C7291F 100%)',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: 16,
                textDecoration: 'none',
                boxShadow: '0 10px 26px rgba(199,41,31,.30), inset 0 1px 0 rgba(255,255,255,.28)',
              }}
            >
              Request Demo
              <ArrowRight size={18} strokeWidth={2.4} />
            </a>

            {/* Secondary CTA — circular play + label */}
            <a href="#" className="hero-watch" style={{ display: 'inline-flex', alignItems: 'center', gap: 14, textDecoration: 'none' }}>
              <span
                className="hero-play"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 56,
                  height: 56,
                  borderRadius: 999,
                  background: '#ffffff',
                  boxShadow: '0 8px 24px rgba(17,17,17,.10)',
                }}
              >
                <Play size={20} fill={RED} stroke={RED} style={{ marginLeft: 3 }} />
              </span>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#111111' }}>Watch Overview</span>
            </a>
          </div>
        </div>
      </div>

      {/* ── Right: animated 3D specimen vial ── */}
      <div className="hero-vial" style={{ height: 720, position: 'relative' }}>
        <SpecimenTube3D />
      </div>
    </section>
  );
}
