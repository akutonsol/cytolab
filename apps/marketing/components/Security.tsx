'use client'
import { useEffect, useRef } from 'react'
import SectionReveal from './SectionReveal'

const certs = [
  { name: 'HIPAA', desc: 'PHI protection' },
  { name: 'SOC 2', desc: 'Type II ready' },
  { name: 'CAP', desc: 'Accreditation' },
  { name: 'FHIR R4', desc: 'Interoperability' },
]

const features = [
  'Argon2id password hashing',
  'MFA and device trust',
  'PHI encryption — AES-256 / TLS 1.3',
  'Append-only audit log',
  'Impossible travel detection',
  'SSO / SAML 2.0',
]

export default function Security() {
  const secRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = secRef.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        el.querySelectorAll<HTMLElement>('.underline-draw').forEach((u, i) => {
          setTimeout(() => u.classList.add('drawn'), 300 + i * 180)
        })
        obs.disconnect()
      }
    }, { threshold: 0.2 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const sTagInv = (label: string) => (
    <div className="label" style={{
      color: 'rgba(240,239,233,0.22)',
      display: 'flex', alignItems: 'center', gap: 'var(--space-8)',
    }}>
      <span style={{ width: 18, height: 1, background: 'rgba(240,239,233,0.18)', display: 'inline-block' }} />
      {label}
    </div>
  )

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
    <section id="security" ref={secRef} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid rgba(9,9,14,0.07)', position: 'relative' }}>
      <div className="section-counter" aria-hidden="true" style={{ color: 'rgba(240,239,233,0.05)' }}>06</div>

      <SectionReveal direction="left">
        <div style={{ background: '#09090E', padding: 'var(--space-96) var(--space-48) var(--space-96) var(--space-40)', borderRight: '1px solid rgba(240,239,233,0.04)', height: '100%' }}>
          <div style={{ marginBottom: 'var(--space-32)' }}>{sTagInv('05 · Security')}</div>
          <div className="display-lg" style={{ marginTop: 'var(--space-32)' }}>
            <span style={{ color: '#fff' }}>Enterprise<br /></span>
            <span style={{ color: 'transparent', WebkitTextStroke: '2px rgba(240,239,233,0.2)' }}>security<br /></span>
            <span style={{ color: '#4F46E5', fontStyle: 'italic' }}>out of the box.</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: 'rgba(240,239,233,0.06)', borderRadius: '2px', overflow: 'hidden', marginTop: 'var(--space-48)' }}>
            {certs.map(c => (
              <div key={c.name} style={{ background: 'rgba(240,239,233,0.025)', padding: 'var(--space-24) var(--space-20)', textAlign: 'center' }}>
                <div className="cert-n underline-draw" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, color: '#fff' }}>{c.name}</div>
                <div style={{ fontSize: '0.6rem', color: 'rgba(240,239,233,0.2)', marginTop: '3px' }}>{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </SectionReveal>

      <SectionReveal direction="right">
        <div style={{ padding: 'var(--space-96) var(--space-40) var(--space-96) var(--space-48)' }}>
          <div style={{ marginBottom: 'var(--space-32)' }}>{sTag('05 · Features')}</div>
          <div>
            {features.map((f, i) => (
              <div key={f} style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-16)',
                padding: 'var(--space-16) 0', borderBottom: '1px solid rgba(9,9,14,0.04)',
                borderTop: i === 0 ? '1px solid rgba(9,9,14,0.04)' : 'none',
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4F46E5', flexShrink: 0 }} />
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#09090E' }}>{f}</div>
              </div>
            ))}
          </div>
        </div>
      </SectionReveal>
    </section>
  )
}
