'use client'
import { useEffect, useRef } from 'react'
import SectionReveal from './SectionReveal'

const steps = [
  'Structured case data assembled',
  'Patient identifiers redacted',
  'Language model drafts a narrative',
  'Pathologist reviews and edits',
  'Human authorizes — AI never signs out',
]

const outcomes = [
  { tag: 'Every draft', value: 'Human-reviewed', blue: false },
  { tag: 'Sign-out', value: 'Always human', blue: true },
  { tag: 'Model inputs', value: 'Redacted', blue: false },
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
    <div className="label" style={{
      color: 'rgba(9,9,14,0.22)',
      display: 'flex', alignItems: 'center', gap: 'var(--space-8)',
    }}>
      <span style={{ width: 18, height: 1, background: 'rgba(9,9,14,0.18)', display: 'inline-block' }} />
      {label}
    </div>
  )

  return (
    <section id="cyto-ai" style={{ borderBottom: '1px solid rgba(9,9,14,0.07)', overflow: 'hidden', position: 'relative' }}>
      <div className="section-counter" aria-hidden="true">04</div>

      <div ref={tickerRef} style={{ padding: 'var(--section-md) var(--section-gutter) 0' }}>
        <div style={{ marginBottom: 'var(--space-40)' }}>{sTag('03 · ASSISTIVE AI')}</div>
        {[
          [{ text: 'AI drafts.', ghost: false, blue: false }],
          [{ text: 'You', ghost: true, blue: false }],
          [{ text: 'decide.', ghost: false, blue: true }],
        ].map((line, li) => (
          <div key={li} style={{ display: 'block', lineHeight: 0.88, marginBottom: 'var(--space-4)' }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid rgba(9,9,14,0.07)', marginTop: 'var(--space-56)' }}>
        <SectionReveal direction="left">
          <div style={{ padding: 'var(--space-56) var(--space-48) var(--space-64) var(--section-gutter)', borderRight: '1px solid rgba(9,9,14,0.07)' }}>
            <div style={{ marginBottom: 'var(--space-32)' }}>{sTag('How it works')}</div>
            {steps.map((step, i) => (
              <div key={step} style={{
                display: 'flex', gap: 'var(--space-24)', padding: 'var(--space-16) 0',
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
          <div style={{ padding: 'var(--space-56) var(--section-gutter) var(--space-64) var(--space-48)', background: '#E8E7E1' }}>
            <div style={{ marginBottom: 'var(--space-32)' }}>{sTag('Outcomes')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
              {outcomes.map(({ tag, value, blue }) => (
                <div key={tag} style={{ background: '#fff', border: '1px solid rgba(9,9,14,0.07)', borderRadius: '2px', padding: 'var(--card-padding-sm)' }}>
                  <div className="label" style={{ color: 'rgba(9,9,14,0.25)', marginBottom: 'var(--space-8)' }}>{tag}</div>
                  <div className="metric-xl" style={{ color: blue ? '#4F46E5' : '#09090E' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </SectionReveal>
      </div>
    </section>
  )
}
