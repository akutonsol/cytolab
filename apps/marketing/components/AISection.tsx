'use client'
import { useEffect, useRef } from 'react'
import SectionReveal from './SectionReveal'

const STEPS: [string, string][] = [
  ['01', 'Full-slide AI scan'],
  ['02', 'Abnormal cell clustering'],
  ['03', 'Explainable heatmap + confidence score'],
  ['04', 'Urgency-based routing'],
  ['05', 'Live EMR delivery — HL7/FHIR under 2s'],
]

const CARDS: [string, string, string][] = [
  ['97%', 'HSIL detection accuracy', 'ink'],
  ['91%', 'Reduction in manual review', 'blue'],
  ['~0.8s', 'Per-slide inference time', 'ink'],
]

const HEADLINE: [string, string][] = [
  ['Your new', 'solid'],
  ['digital', 'ghost'],
  ['cytotechnologist.', 'blue'],
]

export default function AISection() {
  const secRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = secRef.current
    if (!el) return
    const words = el.querySelectorAll<HTMLElement>('.word-rise-inner')
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        words.forEach((w, i) => setTimeout(() => w.classList.add('risen'), i * 90))
        obs.disconnect()
      }
    }, { threshold: 0.15 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <section ref={secRef} id="cyto-ai" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
      borderBottom: '1px solid rgba(9,9,14,0.07)', position: 'relative' }}>
      <div className="section-counter" aria-hidden="true">04</div>
      {/* LEFT — bone */}
      <div style={{ background: '#F0EFE9', padding: '5rem 3rem 5rem 2.5rem',
        borderRight: '1px solid rgba(9,9,14,0.07)', position: 'relative' }}>
        <SectionReveal direction="left">
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700,
            letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(9,9,14,0.22)',
            display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '2.5rem' }}>
            <span style={{ width: 18, height: 1, background: 'rgba(9,9,14,0.18)', display: 'inline-block' }} />
            03 · CYTO AI
          </div>
          <div style={{ lineHeight: 0.9, marginBottom: '3rem' }}>
            {HEADLINE.map(([text, tone]) => (
              <div key={text}>
                <span className="word-rise" style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom' }}>
                  <span className="word-rise-inner" style={{
                    display: 'inline-block',
                    fontFamily: 'var(--font-serif)',
                    fontSize: 'clamp(2.6rem,4.5vw,4.5rem)',
                    letterSpacing: '-0.03em',
                    color: tone === 'blue' ? '#4F46E5' : tone === 'ghost' ? 'transparent' : '#09090E',
                    WebkitTextStroke: tone === 'ghost' ? '1.5px rgba(9,9,14,0.16)' : undefined,
                    fontStyle: tone === 'blue' ? 'italic' : 'normal',
                  }}>{text}</span>
                </span>
              </div>
            ))}
          </div>
          <div>
            {STEPS.map(([n, title]) => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '16px',
                padding: '15px 0', borderTop: '1px solid rgba(9,9,14,0.07)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700,
                  color: '#4F46E5', letterSpacing: '0.06em' }}>{n}</span>
                <span style={{ fontSize: '0.92rem', fontWeight: 500, color: '#09090E' }}>{title}</span>
              </div>
            ))}
          </div>
        </SectionReveal>
      </div>

      {/* RIGHT — bg2, white cards */}
      <div style={{ background: '#E8E7E1', padding: '5rem 2.5rem', display: 'flex',
        flexDirection: 'column', justifyContent: 'center', gap: '1px' }}>
        {CARDS.map(([num, label, tone], i) => (
          <SectionReveal key={label} delay={0.06 * i} direction="right">
            <div style={{ background: '#F7F6F1', padding: '2rem 2.25rem', display: 'flex',
              alignItems: 'baseline', justifyContent: 'space-between', gap: '1.5rem' }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2.6rem,4vw,3.6rem)',
                lineHeight: 0.9, color: tone === 'blue' ? '#4F46E5' : '#09090E' }}>{num}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600,
                letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(9,9,14,0.38)',
                textAlign: 'right', maxWidth: '160px' }}>{label}</div>
            </div>
          </SectionReveal>
        ))}
      </div>
    </section>
  )
}
