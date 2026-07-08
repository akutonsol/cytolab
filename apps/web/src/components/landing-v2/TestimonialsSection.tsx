'use client';

// Testimonials / Case Studies — pathologist & lab-leader quotes with an outcome
// stat each. Glass cards, editorial, calm.
import { Quote } from 'lucide-react';
import { PURPLE, DARK, GRAY, INK_SOFT, Section, SectionHeader, Reveal, glassCard } from './primitives';

const QUOTES = [
  {
    quote: 'PathOS gave my team back their afternoons. The AI pre-screen surfaces exactly what needs a second look, so I spend my time where it matters.',
    name: 'Dr. Elena Vasquez', role: 'Director of Pathology', org: 'Meridian Health',
    stat: '2.3×', statLabel: 'throughput increase',
  },
  {
    quote: 'We went live in six weeks with zero disruption to our LIS. Turnaround times dropped from days to hours, and our concordance actually improved.',
    name: 'Dr. James Okafor', role: 'Chief of Laboratory Medicine', org: 'Northgate Regional',
    stat: '−41%', statLabel: 'turnaround time',
  },
  {
    quote: 'The auditability is what sold our compliance team. Every AI suggestion and every sign-off is traceable. It feels built for how we actually work.',
    name: 'Dr. Priya Nair', role: 'Molecular Pathologist', org: 'Coastal Diagnostics',
    stat: '99.1%', statLabel: 'AI concordance',
  },
];

export function TestimonialsSection() {
  return (
    <Section id="customers" tint="soft">
      <SectionHeader
        eyebrow="Case Studies"
        title={<>Trusted by pathologists<br />who don&apos;t compromise.</>}
        subtitle="From regional labs to academic centers, teams choose PathOS to move faster without giving up rigor."
      />
      <div style={{ marginTop: 60, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
        {QUOTES.map((q, i) => (
          <Reveal key={q.name} delay={0.08 * i}>
            <div style={{ ...glassCard, borderRadius: 22, padding: 30, height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Quote size={26} color={PURPLE} style={{ opacity: 0.5, marginBottom: 16 }} />
              <p style={{ fontSize: 16.5, lineHeight: 1.6, color: DARK, margin: '0 0 24px', fontWeight: 500, flex: 1 }}>
                &ldquo;{q.quote}&rdquo;
              </p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 20, borderTop: '1px solid rgba(11,16,32,0.08)' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 14.5, fontWeight: 700, color: DARK }}>{q.name}</span>
                  <span style={{ fontSize: 12.5, color: GRAY }}>{q.role} · {q.org}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: PURPLE, letterSpacing: '-0.02em' }}>{q.stat}</span>
                  <span style={{ fontSize: 11, color: INK_SOFT }}>{q.statLabel}</span>
                </div>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

export default TestimonialsSection;
