'use client'
import { useEffect, useRef } from 'react'
import SectionReveal from './SectionReveal'

const problems = [
  { text: 'Legacy LIS — on-prem, no cloud', tag: '15–20 yr old' },
  { text: 'Excel for QA tracking', tag: 'No audit trail' },
  { text: 'Disconnected billing', tag: 'Manual errors' },
  { text: 'Paper requisitions', tag: 'HIPAA risk' },
  { text: 'Overnight EMR exports', tag: '48–72h delays' },
]

const solutions = [
  'AI-assisted report drafting, human-reviewed',
  'HL7/FHIR to Epic in under 2 seconds',
  'Billing, workforce, and QA — unified',
  'HIPAA-aligned security — out of the box',
]

export default function ProblemSection() {
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
    <div className="label" style={{
      color: 'rgba(9,9,14,0.22)',
      display: 'flex', alignItems: 'center', gap: 'var(--space-8)',
    }}>
      <span style={{ width: 18, height: 1, background: 'rgba(9,9,14,0.18)', display: 'inline-block' }} />
      {label}
    </div>
  )

  return (
    <section id="platform" style={{ borderBottom: '1px solid rgba(9,9,14,0.07)', overflow: 'hidden', position: 'relative' }}>
      <div className="section-counter" aria-hidden="true">01</div>

      {/* Big type */}
      <div ref={tickerRef} style={{ padding: 'var(--section-md) var(--section-gutter) 0' }}>
        <div style={{ marginBottom: 'var(--space-40)' }}>{sTag('01 · The Problem')}</div>

        {[
          [{ text: 'Labs', ghost: false, blue: false }, { text: '\u00a0are', ghost: true, blue: false }],
          [{ text: 'drowning', ghost: false, blue: false }],
          [{ text: 'in\u00a0', ghost: true, blue: false }, { text: 'chaos.', ghost: false, blue: true }],
        ].map((line, li) => (
          <div key={li} style={{ display: 'block', lineHeight: 0.88, marginBottom: '0.25rem' }}>
            {line.map(({ text, ghost, blue }, wi) => (
              <span key={wi} className="word-rise" style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom' }}>
                <span className="word-rise-inner display-lg" style={{
                  display: 'inline-block',
                  color: ghost ? 'transparent' : blue ? '#4F46E5' : '#09090E',
                  WebkitTextStroke: ghost ? '2px rgba(9,9,14,0.2)' : undefined,
                  fontStyle: blue ? 'italic' : 'normal',
                }}>{text}</span>
              </span>
            ))}
          </div>
        ))}
      </div>

      {/* Horizontal marquee band */}
      <div style={{
        overflow: 'hidden', borderTop: '1px solid rgba(9,9,14,0.05)',
        borderBottom: '1px solid rgba(9,9,14,0.05)', padding: 'var(--space-16) 0',
        background: 'rgba(9,9,14,0.02)', marginTop: 'var(--space-32)',
      }}>
        <div className="marquee-h-track">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'clamp(2.2rem, 4.5vw, 4rem)',
              letterSpacing: '-0.02em',
              color: i % 2 === 0 ? '#09090E' : 'transparent',
              WebkitTextStroke: i % 2 === 1 ? '1px rgba(9,9,14,0.18)' : undefined,
              fontStyle: i % 2 === 1 ? 'italic' : 'normal',
              padding: '0 var(--space-40)', flexShrink: 0, whiteSpace: 'nowrap',
            }}>The future of cytology is here</span>
          ))}
        </div>
      </div>

      {/* Split body */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid rgba(9,9,14,0.07)' }}>
        <SectionReveal direction="left">
          <div style={{ padding: 'var(--space-56) var(--space-48) var(--space-64) var(--section-gutter)', borderRight: '1px solid rgba(9,9,14,0.07)' }}>
            <div style={{ marginBottom: 'var(--space-32)' }}>{sTag('Current Reality')}</div>
            {problems.map(({ text, tag }) => (
              <div key={text} style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-12)',
                padding: 'var(--space-12) 0', borderBottom: '1px solid rgba(9,9,14,0.04)',
                fontSize: '0.82rem', fontWeight: 500, color: '#09090E',
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700, color: '#dc2626' }}>✕</span>
                {text}
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'rgba(9,9,14,0.28)', letterSpacing: '0.04em' }}>{tag}</span>
              </div>
            ))}
          </div>
        </SectionReveal>

        <SectionReveal direction="right">
          <div style={{ padding: 'var(--space-56) var(--section-gutter) var(--space-64) var(--space-48)' }}>
            <div style={{ marginBottom: 'var(--space-32)' }}>{sTag('The Fix')}</div>
            <div style={{ background: '#4F46E5', padding: 'var(--card-padding-lg)', borderRadius: '2px', color: '#fff' }}>
              <div className="label" style={{
                color: 'rgba(255,255,255,0.35)', marginBottom: 'var(--space-16)',
              }}>CYTOLAB Platform</div>
              <div className="heading-lg" style={{ marginBottom: 'var(--space-24)' }}>
                One platform.<br />Zero chaos.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
                {solutions.map(s => (
                  <div key={s} style={{ display: 'flex', gap: 'var(--space-8)', fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)' }}>
                    <span style={{ color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>→</span>{s}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SectionReveal>
      </div>
    </section>
  )
}
