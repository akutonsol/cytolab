import SectionReveal from './SectionReveal'

const TIERS = [
  {
    name: 'Clinic',
    price: 'Contact',
    blurb: 'For single-site clinics moving off paper.',
    features: ['Specimen management', 'Result sheets & authorization', 'Client portal', 'Standard reports', 'Email support'],
    featured: false,
  },
  {
    name: 'Laboratory',
    price: 'Contact',
    blurb: 'For growing labs that need AI and analytics.',
    features: ['Everything in Clinic', 'CYTO AI screening', 'Turnaround & QC analytics', 'Billing & payments', 'EMR / FHIR interoperability', 'Priority support'],
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    blurb: 'For multi-site networks and health systems.',
    features: ['Everything in Laboratory', 'Multi-tenant administration', 'Dedicated success manager', 'Custom integrations', 'SSO & advanced audit', '99.9% uptime SLA'],
    featured: false,
  },
]

export default function Pricing() {
  return (
    <section id="pricing" className="px-[6vw] py-[120px] lg:px-8">
      <div className="mx-auto max-w-[1240px]">
        <SectionReveal>
          <span className="font-mono text-[12px] uppercase tracking-[0.24em] text-blue">Pricing</span>
        </SectionReveal>
        <SectionReveal delay={0.05}>
          <h2 className="mt-5 max-w-[18ch] font-serif text-[clamp(32px,5vw,64px)] leading-[1.02]">Scales with your lab.</h2>
        </SectionReveal>

        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {TIERS.map((t, i) => (
            <SectionReveal key={t.name} delay={0.05 * i}>
              <div
                className="flex h-full flex-col rounded-2xl border p-8"
                style={
                  t.featured
                    ? { background: 'var(--ink)', borderColor: 'var(--ink)' }
                    : { background: 'var(--bg)', borderColor: 'rgba(9,9,14,0.12)' }
                }
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-[26px]" style={{ color: t.featured ? 'var(--bg)' : 'var(--ink)' }}>{t.name}</h3>
                  {t.featured && (
                    <span className="rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-bg" style={{ background: 'var(--blue)' }}>Popular</span>
                  )}
                </div>
                <div className="mt-4 font-serif text-[40px] leading-none" style={{ color: t.featured ? 'var(--bg)' : 'var(--ink)' }}>{t.price}</div>
                <p className="mt-3 font-sans text-[14px]" style={{ color: t.featured ? 'rgba(240,239,233,0.6)' : 'rgba(9,9,14,0.6)' }}>{t.blurb}</p>
                <ul className="mt-7 space-y-3">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 font-sans text-[14px]" style={{ color: t.featured ? 'rgba(240,239,233,0.85)' : 'rgba(9,9,14,0.8)' }}>
                      <svg className="mt-0.5 shrink-0" width="14" height="14" viewBox="0 0 12 12" fill="none" style={{ color: t.featured ? 'var(--blue2)' : 'var(--blue)' }}>
                        <path d="M2.5 6.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href="#cta"
                  className="mt-8 inline-flex items-center justify-center rounded-full px-6 py-3 font-sans text-[14px] font-semibold transition-opacity hover:opacity-90"
                  style={
                    t.featured
                      ? { background: 'var(--blue)', color: '#fff' }
                      : { background: 'var(--ink)', color: 'var(--bg)' }
                  }
                >
                  Request a demo
                </a>
              </div>
            </SectionReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
