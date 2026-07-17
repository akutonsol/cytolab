import SectionReveal from './SectionReveal'

const plans = [
  {
    tier: 'Independent Labs', name: 'Community Labs', featured: false,
    features: ['Full specimen workflow', 'Bethesda TBS 2014 reporting', 'Patient management', 'Basic analytics', 'Email support'],
  },
  {
    tier: 'Regional Labs', name: 'Regional Labs', featured: true,
    features: ['Everything in Community', 'AI-assisted report drafting', 'WSI digital slide viewer', 'HL7 / FHIR R4 integrations', 'Workforce and payroll', 'Priority support'],
  },
  {
    tier: 'Health Systems', name: 'Enterprise Health Systems', featured: false,
    features: ['Everything in Regional', 'Multi-lab tenancy', 'Custom onboarding & configuration', 'Dedicated infrastructure', 'SLA guarantee', 'Dedicated success team'],
  },
]

export default function Pricing() {
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
    <section id="pricing" style={{ borderBottom: '1px solid rgba(9,9,14,0.07)', position: 'relative' }}>
      <div className="section-counter" aria-hidden="true">07</div>
      <SectionReveal>
        <div style={{ padding: 'var(--section-md) var(--section-gutter) var(--space-56)', borderBottom: '1px solid rgba(9,9,14,0.07)' }}>
          <div style={{ marginBottom: 'var(--space-24)' }}>{sTag('06 · Plans')}</div>
          <div className="display-lg">
            Built for every<br />
            <span style={{ color: 'transparent', WebkitTextStroke: '2px rgba(9,9,14,0.2)' }}>scale of</span>{' '}
            <span style={{ color: '#4F46E5', fontStyle: 'italic' }}>laboratory.</span>
          </div>
        </div>
      </SectionReveal>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {plans.map(({ tier, name, featured, features }, i) => (
          <SectionReveal key={name} delay={i * 0.1}>
            <div style={{
              padding: 'var(--space-48) var(--space-40)',
              borderRight: i < 2 ? '1px solid rgba(9,9,14,0.07)' : 'none',
              background: featured ? '#4F46E5' : 'transparent',
              height: '100%',
            }}>
              <div className="label" style={{
                color: featured ? 'rgba(255,255,255,0.4)' : 'rgba(9,9,14,0.3)',
                marginBottom: 'var(--space-8)',
              }}>{tier}</div>
              <div className="heading-lg" style={{
                color: featured ? '#fff' : '#09090E', marginBottom: 'var(--space-32)',
              }}>{name}</div>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-8)', marginBottom: 'var(--space-40)' }}>
                {features.map(f => (
                  <li key={f} className="body-sm" style={{ display: 'flex', gap: 'var(--space-8)', alignItems: 'flex-start', color: featured ? 'rgba(255,255,255,0.65)' : 'rgba(9,9,14,0.45)' }}>
                    <span style={{ width: 3, height: 3, background: featured ? 'rgba(255,255,255,0.45)' : '#4F46E5', borderRadius: '50%', flexShrink: 0, marginTop: '6px' }} />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                className="mag-btn"
                style={{
                  width: '100%', padding: '11px', borderRadius: '2px',
                  fontFamily: 'var(--font-sans)', fontSize: '0.7rem', fontWeight: 700,
                  letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer',
                  background: featured ? '#fff' : '#09090E',
                  border: 'none',
                  color: featured ? '#4F46E5' : '#F0EFE9',
                }}
              >Request demo &rarr;</button>
            </div>
          </SectionReveal>
        ))}
      </div>
    </section>
  )
}
