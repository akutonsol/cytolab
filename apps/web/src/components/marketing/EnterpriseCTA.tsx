'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import s from './EnterpriseCTA.module.css';

const BioScene = dynamic(() => import('./BioScene').then((m) => ({ default: m.BioScene })), {
  ssr: false,
  loading: () => null,
});

const BADGES = ['HIPAA', 'SOC 2 Type II', 'Enterprise Ready', 'HL7', 'FHIR', 'LIS Integration'];

interface MetricDef { target: number; decimals: number; suffix: string; label: string; }
const METRICS: MetricDef[] = [
  { target: 500, decimals: 0, suffix: '+', label: 'Laboratories' },
  { target: 12.8, decimals: 1, suffix: 'M', label: 'Slides Processed' },
  { target: 99.4, decimals: 1, suffix: '%', label: 'Diagnostic Accuracy' },
  { target: 24, decimals: 0, suffix: '', label: 'Countries' },
];

function Metric({ def, active, delay }: { def: MetricDef; active: boolean; delay: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVal(def.target);
      return;
    }
    let raf = 0;
    const dur = 1600;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const p = Math.max(0, Math.min(1, (now - start) / dur));
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setVal(def.target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, def.target, delay]);

  return (
    <div className={`${s.metric} ${s.reveal}`} style={{ transitionDelay: `${420 + delay}ms` }}>
      <div className={s.metricValue}>
        {val.toFixed(def.decimals)}
        {def.suffix}
      </div>
      <div className={s.metricLabel}>{def.label}</div>
    </div>
  );
}

export function EnterpriseCTA() {
  const sectionRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  // Scroll reveal — choreograph the whole section when it enters the viewport.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            el.classList.add(s.in);
            setInView(true);
            io.disconnect();
          }
        });
      },
      { threshold: 0.18 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Mouse-driven lighting shift (soft parallax on the atmosphere layer).
  const onMove = (e: React.MouseEvent<HTMLElement>) => {
    const el = sectionRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const mx = ((e.clientX - r.left) / r.width - 0.5) * 28;
    const my = ((e.clientY - r.top) / r.height - 0.5) * 22;
    el.style.setProperty('--mx', `${mx}px`);
    el.style.setProperty('--my', `${my}px`);
  };

  return (
    <section ref={sectionRef} className={s.section} onMouseMove={onMove} aria-labelledby="cta-heading">
      <div className={s.topFade} />

      {/* Layered atmosphere (breathing bloom, beams, noise, dust) */}
      <div className={s.atmos} style={{ transform: 'translate3d(var(--mx,0), var(--my,0), 0)', transition: 'transform .35s ease' }}>
        <div className={s.glowA} />
        <div className={s.glowB} />
        <div className={s.beams} />
        <div className={s.dust} />
        <div className={s.noise} />
      </div>

      {/* Living 3D ecosystem */}
      <div className={s.scene}>
        <BioScene />
      </div>

      <div className={s.inner}>
        {/* Left — editorial */}
        <div>
          <span className={`${s.eyebrow} ${s.reveal}`} style={{ transitionDelay: '60ms' }}>
            Enterprise Pathology Platform
          </span>

          <h2 id="cta-heading" className={`${s.headline} ${s.reveal}`} style={{ transitionDelay: '160ms' }}>
            The operating system<br />
            <span className={s.bright}>modern pathology</span><br />
            labs <span className={s.accent}>deserve.</span>
          </h2>

          <p className={`${s.paragraph} ${s.reveal}`} style={{ transitionDelay: '280ms' }}>
            CYTOLAB connects specimen management, reporting, and laboratory operations
            into one intelligent platform designed for enterprise pathology.
          </p>

          <div className={`${s.ctaRow} ${s.reveal}`} style={{ transitionDelay: '380ms' }}>
            <a href="#" className={s.btnPrimary}>
              Schedule Live Demo
              <ArrowRight className={s.arrow} size={18} strokeWidth={2.4} />
            </a>
            <a href="#" className={s.btnSecondary}>Talk to Sales</a>
          </div>

          <div className={`${s.badges} ${s.reveal}`} style={{ transitionDelay: '480ms' }}>
            {BADGES.map((b) => (
              <span key={b} className={s.badge}>
                <Check size={14} strokeWidth={3} />
                {b}
              </span>
            ))}
          </div>
        </div>

        {/* Right column is the 3D scene (absolutely positioned); spacer keeps the grid. */}
        <div aria-hidden />

        {/* Metrics */}
        <div className={s.metrics}>
          {METRICS.map((m, i) => (
            <Metric key={m.label} def={m} active={inView} delay={i * 140} />
          ))}
        </div>
      </div>

      {/* Footer transition into white + lingering glow line */}
      <div className={s.footFade} />
      <div className={s.footLine} />
    </section>
  );
}
