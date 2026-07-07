import SectionReveal from './SectionReveal'

const TIERS = [
  {
    name: 'Community Labs',
    tag: 'Single site',
    features: ['Full specimen workflow', 'Bethesda 2014 reporting', 'Patient management', 'Standard analytics', 'Email support'],
    featured: false,
  },
  {
    name: 'Regional Labs',
    tag: 'Multi-site',
    features: ['Everything in Community', 'CYTO AI screening', 'HL7 / FHIR interoperability', 'Billing + workforce', 'Priority support'],
    featured: true,
  },
  {
    name: 'Enterprise Health Systems',
    tag: 'Networks',
    features: ['Everything in Regional', 'Multi-tenant administration', 'Custom integrations', 'Dedicated success manager', 'SLA guarantee', 'Dedicated success team'],
    featured: false,
  },
]

export default function Pricing() {
  return (
    <section id="pricing" style={{ borderBottom: '1px solid rgba(9,9,14,0.07)' }}>
      <div style={{ padding: '5rem 2.5rem 3rem' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700,
          letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(9,9,14,0.22)',
          display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '2.5rem' }}>
          <span style={{ width: 18, height: 1, background: 'rgba(9,9,14,0.18)', display: 'inline-block' }} />
          06 · Pricing
        </div>
        <div style={{ lineHeight: 0.9 }}>
          <div><span style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(3rem,6vw,5.5rem)',
            letterSpacing: '-0.03em', color: '#09090E' }}>Built for every</span></div>
          <div>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(3rem,6vw,5.5rem)',
              letterSpacing: '-0.03em', color: 'transparent', WebkitTextStroke: '1.5px rgba(9,9,14,0.14)' }}>scale of </span>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(3rem,6vw,5.5rem)',
              letterSpacing: '-0.03em', color: '#4F46E5', fontStyle: 'italic' }}>laboratory.</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        borderTop: '1px solid rgba(9,9,14,0.07)' }}>
        {TIERS.map((t, i) => {
          const fg = t.featured ? '#fff' : '#09090E'
          const muted = t.featured ? 'rgba(255,255,255,0.55)' : 'rgba(9,9,14,0.4)'
          return (
            <SectionReveal key={t.name} delay={0.06 * i}>
              <div style={{ background: t.featured ? '#4F46E5' : 'transparent',
                borderRight: i < 2 ? '1px solid rgba(9,9,14,0.07)' : 'none',
                padding: '3rem 2rem 3.5rem', minHeight: '100%',
                display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700,
                  letterSpacing: '0.12em', textTransform: 'uppercase', color: muted,
                  marginBottom: '1rem' }}>{t.tag}</div>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.9rem', lineHeight: 1.05,
                  color: fg, marginBottom: '2rem' }}>{t.name}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                  {t.features.map((f) => (
                    <div key={f} style={{ display: 'flex', gap: '11px', fontSize: '0.82rem',
                      color: t.featured ? 'rgba(255,255,255,0.85)' : 'rgba(9,9,14,0.75)' }}>
                      <span style={{ color: t.featured ? 'rgba(255,255,255,0.5)' : '#4F46E5', flexShrink: 0 }}>→</span>{f}
                    </div>
                  ))}
                </div>
                <button className="mag-btn" style={{ marginTop: '2.5rem', width: '100%',
                  background: t.featured ? '#09090E' : '#09090E', color: '#F0EFE9', border: 'none',
                  padding: '13px', borderRadius: '2px', fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.07em',
                  textTransform: 'uppercase', cursor: 'pointer' }}>Request demo</button>
              </div>
            </SectionReveal>
          )
        })}
      </div>
    </section>
  )
}
