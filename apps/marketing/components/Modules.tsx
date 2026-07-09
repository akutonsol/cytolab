'use client'
import { useEffect, useRef } from 'react'
import SectionReveal from './SectionReveal'

const modules = [
  { n: '01', name: 'AI Cytology Screening', tag: 'AI CORE', tagColor: '#4F46E5' },
  { n: '02', name: 'Specimen Management', tag: 'CORE', tagColor: '#3f97ef' },
  { n: '03', name: 'Analytics and Reporting', tag: 'CORE', tagColor: '#3f97ef' },
  { n: '04', name: 'EMR Interoperability', tag: 'ENTERPRISE', tagColor: 'rgba(9,9,14,0.28)' },
  { n: '05', name: 'Integrated Billing', tag: 'CORE', tagColor: '#3f97ef' },
  { n: '06', name: 'Workforce Management', tag: 'CORE', tagColor: '#3f97ef' },
  { n: '07', name: 'Quality Assurance', tag: 'CORE', tagColor: '#3f97ef' },
  { n: '08', name: 'Inventory and Reagents', tag: 'CORE', tagColor: '#3f97ef' },
  { n: '09', name: 'Patient Management', tag: 'CORE', tagColor: '#3f97ef' },
  { n: '10', name: 'Enterprise Security', tag: 'ENTERPRISE', tagColor: 'rgba(9,9,14,0.28)' },
]

export default function Modules() {
  const rowsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = rowsRef.current
    if (!el) return
    el.classList.add('stagger-children')
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        el.classList.add('triggered')
        obs.disconnect()
      }
    }, { threshold: 0.05 })
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
    <section id="platform" style={{ borderBottom: '1px solid rgba(9,9,14,0.07)', position: 'relative' }}>
      <div className="section-counter" aria-hidden="true">05</div>
      <SectionReveal>
        <div style={{
          padding: 'var(--space-80) var(--space-40) var(--space-56)', borderBottom: '1px solid rgba(9,9,14,0.07)',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-64)', alignItems: 'end',
        }}>
          <div>
            <div style={{ marginBottom: 'var(--space-24)' }}>{sTag('04 · Platform')}</div>
            <div className="display-lg">
              Ten modules.<br />
              <span style={{ color: 'transparent', WebkitTextStroke: '1px rgba(9,9,14,0.13)' }}>One</span>{' '}
              <span style={{ color: '#4F46E5', fontStyle: 'italic' }}>operating</span><br />
              <span style={{ color: 'transparent', WebkitTextStroke: '1px rgba(9,9,14,0.13)' }}>system.</span>
            </div>
          </div>
          <div style={{ alignSelf: 'end' }}>
            <p className="body-md" style={{ color: 'rgba(9,9,14,0.32)', maxWidth: 'var(--measure-sm)' }}>
              One unified platform replacing every disconnected tool your lab runs today.
            </p>
          </div>
        </div>
      </SectionReveal>

      <div ref={rowsRef}>
        {modules.map(({ n, name, tag, tagColor }) => (
          <div
            key={name}
            className="mod-row-item"
            style={{
              display: 'grid', gridTemplateColumns: '56px 1fr 90px',
              alignItems: 'center', padding: 'var(--space-20) var(--space-40)',
              borderBottom: '1px solid rgba(9,9,14,0.04)',
              cursor: 'pointer', position: 'relative',
            }}
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700, color: 'rgba(9,9,14,0.18)' }}>{n}</span>
            <span className="mod-row-name" style={{ fontSize: '0.9rem', fontWeight: 600, color: '#09090E' }}>{name}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.07em', textAlign: 'right', color: tagColor }}>{tag}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
