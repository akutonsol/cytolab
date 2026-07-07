'use client'
import { useEffect, useRef } from 'react'
import SectionReveal from './SectionReveal'

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

  const problems = [
    { text: 'Legacy LIS — no AI, no cloud', tag: '15–20 yr old' },
    { text: 'Excel for QA tracking', tag: 'No audit trail' },
    { text: 'Disconnected billing', tag: 'Manual errors' },
    { text: 'Paper requisitions', tag: 'HIPAA risk' },
    { text: 'Overnight EMR exports', tag: '48–72h delays' },
  ]
  const solutions = [
    'AI screening on every specimen, live',
    'HL7/FHIR to Epic in under 2 seconds',
    'Billing, workforce, and QA — unified',
    'HIPAA · CAP · CLIA — out of the box',
  ]

  const bigLines = [
    [{ text: 'Labs', ghost: false },{ text: ' are', ghost: true }],
    [{ text: 'drowning', ghost: false }],
    [{ text: 'in ', ghost: true },{ text: 'chaos.', ghost: false, blue: true }],
  ]

  return (
    <section id="platform" style={{ borderBottom: '1px solid rgba(9,9,14,0.07)', overflow: 'hidden', position: 'relative' }}>
      <div className="section-counter" aria-hidden="true">01</div>
      <SectionReveal>
        <div ref={tickerRef} style={{ padding: '5rem 2.5rem 0', position: 'relative' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700,
            letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(9,9,14,0.22)',
            display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '2.5rem' }}>
            <span style={{ width: 18, height: 1, background: 'rgba(9,9,14,0.18)', display: 'inline-block' }} />
            01 · The Problem
          </div>
          {bigLines.map((line, li) => (
            <div key={li} style={{ display: 'block', lineHeight: 0.88, marginBottom: '0.25rem' }}>
              {line.map(({ text, ghost, blue }, wi) => (
                <span key={wi} className="word-rise" style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom' }}>
                  <span className="word-rise-inner" style={{
                    display: 'inline-block',
                    fontFamily: 'var(--font-serif)',
                    fontSize: 'clamp(4rem, 9vw, 8.5rem)',
                    letterSpacing: '-0.03em',
                    whiteSpace: 'pre',
                    color: ghost ? 'transparent' : blue ? '#4F46E5' : '#09090E',
                    WebkitTextStroke: ghost ? '1.5px rgba(9,9,14,0.13)' : undefined,
                    fontStyle: blue ? 'italic' : 'normal',
                  }}>{text}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </SectionReveal>

      <div style={{
        overflow: 'hidden',
        borderTop: '1px solid rgba(9,9,14,0.05)',
        borderBottom: '1px solid rgba(9,9,14,0.05)',
        padding: '0.85rem 0',
        background: 'rgba(9,9,14,0.02)',
        marginTop: '3.5rem',
      }}>
        <div className="marquee-h-track">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'clamp(1.8rem, 3.5vw, 3rem)',
              letterSpacing: '-0.02em',
              color: i % 2 === 0 ? '#09090E' : 'transparent',
              WebkitTextStroke: i % 2 === 1 ? '1px rgba(9,9,14,0.18)' : undefined,
              fontStyle: i % 2 === 1 ? 'italic' : 'normal',
              padding: '0 2.5rem',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}>
              The future of cytology is here
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
        borderTop: '1px solid rgba(9,9,14,0.07)' }}>
        <SectionReveal direction="left">
          <div style={{ padding: '3.5rem 3rem 4.5rem 2.5rem',
            borderRight: '1px solid rgba(9,9,14,0.07)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700,
              letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(9,9,14,0.22)',
              display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '2rem' }}>
              <span style={{ width: 18, height: 1, background: 'rgba(9,9,14,0.18)', display: 'inline-block' }} />
              Current Reality
            </div>
            {problems.map(({ text, tag }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '12px',
                padding: '13px 0', borderBottom: '1px solid rgba(9,9,14,0.04)',
                fontSize: '0.82rem', fontWeight: 500, color: '#09090E' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem',
                  fontWeight: 700, color: '#dc2626' }}>✕</span>
                {text}
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)',
                  fontSize: '0.62rem', color: 'rgba(9,9,14,0.28)', letterSpacing: '0.04em' }}>{tag}</span>
              </div>
            ))}
          </div>
        </SectionReveal>

        <SectionReveal direction="right">
          <div style={{ padding: '3.5rem 2.5rem 4.5rem 3rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700,
              letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(9,9,14,0.22)',
              display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '2rem' }}>
              <span style={{ width: 18, height: 1, background: 'rgba(9,9,14,0.18)', display: 'inline-block' }} />
              The Fix
            </div>
            <div style={{ background: '#4F46E5', padding: '2.5rem', borderRadius: '2px', color: '#fff' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', fontWeight: 700,
                letterSpacing: '0.14em', textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.35)', marginBottom: '1rem' }}>CYTOLAB Platform</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: '2.4rem',
                lineHeight: 0.95, marginBottom: '1.5rem' }}>One platform.<br />Zero chaos.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                {solutions.map(s => (
                  <div key={s} style={{ display: 'flex', gap: '10px', fontSize: '0.78rem',
                    color: 'rgba(255,255,255,0.7)' }}>
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
