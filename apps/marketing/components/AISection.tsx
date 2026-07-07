'use client'
import { useEffect, useRef } from 'react'
import SectionReveal from './SectionReveal'

const steps = [
  'Full-slide AI scan',
  'Abnormal cell clustering',
  'Explainable heatmap + confidence score',
  'Urgency-based routing',
  'Live EMR delivery — HL7/FHIR · under 2s',
]

const outcomes = [
  { tag: 'Detection accuracy', value: '97%', blue: false },
  { tag: 'Review time saved', value: '91%', blue: true },
  { tag: 'Per-slide speed', value: '~0.8s', blue: false },
]

export default function AISection() {
  const tickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = tickerRef.current
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

  const sTag = (label: string) => (
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700,
      letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(9,9,14,0.22)',
      display: 'flex', alignItems: 'center', gap: '9px',
    }}>
      <span style={{ width: 18, height: 1, background: 'rgba(9,9,14,0.18)', display: 'inline-block' }} />
      {label}
    </div>
  )

  return (
    <section id="cyto-ai" style={{ borderBottom: '1px solid rgba(9,9,14,0.07)', overflow: 'hidden', position: 'relative' }}>
      <div className="section-counter" aria-hidden="true">04</div>

      <div ref={tickerRef} style={{ padding: '5rem 2.5rem 0' }}>
        <div style={{ marginBottom: '2.5rem' }}>{sTag('03 · CYTO AI')}</div>
        {[
          [{ text: 'Your new', ghost: false, blue: false }],
          [{ text: 'digital', ghost: true, blue: false }],
          [{ text: 'cytotechnologist.', ghost: false, blue: true }],
        ].map((line, li) => (
          <div key={li} style={{ display: 'block', lineHeight: 0.88, marginBottom: '0.25rem' }}>
            {line.map(({ text, ghost, blue }, wi) => (
              <span key={wi} className="word-rise" style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom' }}>
                <span className="word-rise-inner" style={{
                  display: 'inline-block',
                  fontFamily: 'var(--font-serif)',
                  fontSize: 'clamp(4.5rem, 11vw, 11rem)',
                  letterSpacing: '-0.04em',
                  color: ghost ? 'transparent' : blue ? '#4F46E5' : '#09090E',
                  WebkitTextStroke: ghost ? '2px rgba(9,9,14,0.2)' : undefined,
                  fontStyle: blue ? 'italic' : 'normal',
                }}>{text}</span>
              </span>
            ))}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid rgba(9,9,14,0.07)', marginTop: '3.5rem' }}>
        <SectionReveal direction="left">
          <div style={{ padding: '3.5rem 3rem 4.5rem 2.5rem', borderRight: '1px solid rgba(9,9,14,0.07)' }}>
            <div style={{ marginBottom: '2rem' }}>{sTag('How it works')}</div>
            {steps.map((step, i) => (
              <div key={step} style={{
                display: 'flex', gap: '1.5rem', padding: '1.1rem 0',
                borderBottom: '1px solid rgba(9,9,14,0.04)', alignItems: 'center',
                borderTop: i === 0 ? '1px solid rgba(9,9,14,0.04)' : 'none',
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700, color: 'rgba(9,9,14,0.2)', minWidth: '22px', letterSpacing: '0.05em' }}>0{i + 1}</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#09090E' }}>{step}</span>
              </div>
            ))}
          </div>
        </SectionReveal>

        <SectionReveal direction="right">
          <div style={{ padding: '3.5rem 2.5rem 4.5rem 3rem', background: '#E8E7E1' }}>
            <div style={{ marginBottom: '2rem' }}>{sTag('Outcomes')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {outcomes.map(({ tag, value, blue }) => (
                <div key={tag} style={{ background: '#fff', border: '1px solid rgba(9,9,14,0.07)', borderRadius: '2px', padding: '1.75rem' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(9,9,14,0.25)', marginBottom: '0.5rem' }}>{tag}</div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: '3.5rem', lineHeight: 0.88, color: blue ? '#4F46E5' : '#09090E' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </SectionReveal>
      </div>
    </section>
  )
}
