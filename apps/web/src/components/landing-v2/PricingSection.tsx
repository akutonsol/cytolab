'use client';

// Pricing — three tiers, the middle one highlighted. Clean SaaS pricing cards.
import { Check, ArrowRight } from 'lucide-react';
import { PURPLE, DARK, GRAY, INK_SOFT, Section, SectionHeader, Reveal, glassCard } from './primitives';

const TIERS = [
  {
    name: 'Clinic', price: '$1,200', unit: '/ month', blurb: 'For single-site practices getting started with digital pathology.',
    features: ['Up to 5 pathologists', 'Whole-slide viewer', 'AI pre-screening', 'Synoptic reporting', 'Email support'],
    cta: 'Start free trial', highlight: false,
  },
  {
    name: 'Laboratory', price: '$4,800', unit: '/ month', blurb: 'For growing labs that need workflow, QC and integrations.',
    features: ['Unlimited pathologists', 'Everything in Clinic', 'Case management + QC', 'HL7 / FHIR integration', 'SSO / SAML', 'Priority support'],
    cta: 'Request a demo', highlight: true,
  },
  {
    name: 'Enterprise', price: 'Custom', unit: '', blurb: 'For health systems with residency, scale and compliance needs.',
    features: ['Multi-site deployment', 'Single-tenant / on-prem', 'Data residency controls', 'Dedicated success team', '99.99% uptime SLA', 'Custom integrations'],
    cta: 'Talk to sales', highlight: false,
  },
];

export function PricingSection() {
  return (
    <Section id="pricing" tint="white">
      <SectionHeader
        eyebrow="Pricing"
        title={<>Pricing that scales<br />with your lab.</>}
        subtitle="Transparent plans for every stage — from a single practice to a national network. No per-slide surprises."
      />
      <div style={{ marginTop: 60, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, alignItems: 'stretch' }}>
        {TIERS.map((t, i) => (
          <Reveal key={t.name} delay={0.08 * i}>
            <div style={{
              ...glassCard, borderRadius: 24, padding: 32, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative',
              ...(t.highlight ? {
                background: DARK, border: '1px solid rgba(124,92,255,0.5)',
                boxShadow: '0 30px 70px -24px rgba(44,30,96,0.5), 0 0 0 1px rgba(124,92,255,0.3)',
                transform: 'translateY(-8px)',
              } : {}),
            }}>
              {t.highlight && (
                <span style={{ position: 'absolute', top: 20, right: 20, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#fff', background: PURPLE, padding: '4px 10px', borderRadius: 999 }}>MOST POPULAR</span>
              )}
              <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.04em', color: t.highlight ? 'rgba(255,255,255,0.7)' : PURPLE }}>{t.name}</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '16px 0 6px' }}>
                <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', color: t.highlight ? '#fff' : DARK }}>{t.price}</span>
                <span style={{ fontSize: 15, color: t.highlight ? 'rgba(255,255,255,0.55)' : GRAY }}>{t.unit}</span>
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.55, color: t.highlight ? 'rgba(255,255,255,0.6)' : INK_SOFT, margin: '0 0 24px', minHeight: 44 }}>{t.blurb}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 13, flex: 1 }}>
                {t.features.map((f) => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14.5, color: t.highlight ? 'rgba(255,255,255,0.85)' : '#3f4557' }}>
                    <Check size={16} color={PURPLE} strokeWidth={3} /> {f}
                  </div>
                ))}
              </div>
              <a href="#" style={{
                marginTop: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 14,
                fontWeight: 700, fontSize: 15, textDecoration: 'none',
                background: t.highlight ? PURPLE : 'transparent',
                color: t.highlight ? '#fff' : DARK,
                border: t.highlight ? 'none' : '1px solid rgba(11,16,32,0.14)',
              }}>{t.cta} <ArrowRight size={16} /></a>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

export default PricingSection;
