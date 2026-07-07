'use client'
import { useState } from 'react'

const MODULES: [string, string, string][] = [
  ['01', 'AI Cytology Screening', 'CYTO AI · Bethesda 2014'],
  ['02', 'Specimen Management', 'Chain of custody'],
  ['03', 'Analytics and Reporting', 'Real-time TAT + QC'],
  ['04', 'EMR Interoperability', 'HL7 v2.5 · FHIR R4'],
  ['05', 'Workforce Management', 'Scheduling · payroll'],
  ['06', 'Integrated Billing', 'Charge capture'],
  ['07', 'Quality Assurance', 'CAP-ready audits'],
  ['08', 'Inventory and Reagents', 'Lot tracking'],
  ['09', 'Patient Management', 'Demographics · history'],
  ['10', 'Enterprise Security', 'Argon2id · MFA · SSO'],
]

function Row({ n, name, tag }: { n: string; name: string; tag: string }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'grid', gridTemplateColumns: '80px 1fr auto', alignItems: 'center',
        gap: '1.5rem', padding: '1.4rem 2.5rem', borderTop: '1px solid rgba(9,9,14,0.07)',
        borderLeft: `2px solid ${hover ? '#4F46E5' : 'transparent'}`,
        background: hover ? 'rgba(79,70,229,0.03)' : 'transparent',
        transition: 'all 0.25s ease', cursor: 'default' }}
    >
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700,
        letterSpacing: '0.06em', color: hover ? '#4F46E5' : 'rgba(9,9,14,0.3)', transition: 'color 0.25s' }}>{n}</span>
      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.3rem,2.2vw,1.9rem)',
        color: hover ? '#4F46E5' : '#09090E', transition: 'color 0.25s' }}>{name}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 600,
        letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(9,9,14,0.3)' }}>{tag}</span>
    </div>
  )
}

export default function Modules() {
  return (
    <section id="modules" style={{ borderBottom: '1px solid rgba(9,9,14,0.07)' }}>
      <div style={{ padding: '5rem 2.5rem 3rem' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700,
          letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(9,9,14,0.22)',
          display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '2.5rem' }}>
          <span style={{ width: 18, height: 1, background: 'rgba(9,9,14,0.18)', display: 'inline-block' }} />
          04 · Modules
        </div>
        <div style={{ lineHeight: 0.9 }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(3rem,6vw,5.5rem)',
            letterSpacing: '-0.03em', color: '#09090E' }}>Ten modules. </span>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(3rem,6vw,5.5rem)',
            letterSpacing: '-0.03em', color: 'transparent', WebkitTextStroke: '1.5px rgba(9,9,14,0.14)' }}>One </span>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(3rem,6vw,5.5rem)',
            letterSpacing: '-0.03em', color: '#4F46E5', fontStyle: 'italic' }}>operating </span>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(3rem,6vw,5.5rem)',
            letterSpacing: '-0.03em', color: 'transparent', WebkitTextStroke: '1.5px rgba(9,9,14,0.14)' }}>system.</span>
        </div>
      </div>
      <div>
        {MODULES.map(([n, name, tag]) => <Row key={n} n={n} name={name} tag={tag} />)}
      </div>
    </section>
  )
}
