'use client';

// AI Workflow — expands the hero's mini-timeline into the full end-to-end story:
// specimen → digitized → AI analysis → review → report → delivered. Six connected
// steps, the AI step emphasised. Purple / glass / editorial to match HeroV2.
import { FlaskConical, ScanLine, Brain, Stethoscope, FileText, Send } from 'lucide-react';
import { PURPLE, DARK, GRAY, INK_SOFT, Section, SectionHeader, Reveal, glassCard } from './primitives';

const STEPS = [
  { n: '01', Icon: FlaskConical, title: 'Specimen', desc: 'Accessioned and barcode-tracked from collection, with full chain-of-custody.' },
  { n: '02', Icon: ScanLine, title: 'Digitized', desc: 'Whole-slide imaging at 40×, streamed to the cloud in minutes.' },
  { n: '03', Icon: Brain, title: 'AI Analysis', desc: 'Nuclei, mitoses and regions detected; grade and biomarkers pre-computed.', hot: true },
  { n: '04', Icon: Stethoscope, title: 'Review', desc: 'Board-certified sign-off with AI evidence presented side-by-side.' },
  { n: '05', Icon: FileText, title: 'Report', desc: 'Synoptic, guideline-compliant reports generated automatically.' },
  { n: '06', Icon: Send, title: 'Delivered', desc: 'Signed results pushed to the EMR / LIS — closing the loop in hours, not days.' },
];

export function WorkflowSection() {
  return (
    <Section id="workflow" tint="white">
      <SectionHeader
        eyebrow="The PathOS Workflow"
        title={<>From specimen to signed report,<br />on one intelligent pipeline.</>}
        subtitle="Every diagnosis begins with a specimen. PathOS carries it through six connected stages — with AI accelerating the work and pathologists always in command."
      />

      <Reveal delay={0.1} style={{ marginTop: 72, position: 'relative' }}>
        {/* connector line running through the step nodes (desktop) */}
        <div aria-hidden style={{ position: 'absolute', top: 34, left: 'calc(100% / 12)', right: 'calc(100% / 12)', height: 2, background: 'linear-gradient(90deg, rgba(124,92,255,0.35), rgba(124,92,255,0.15))', zIndex: 0 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 20 }}>
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={0.12 + i * 0.07}>
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', zIndex: 1 }}>
                <div style={{
                  width: 68, height: 68, borderRadius: 20, display: 'grid', placeItems: 'center', marginBottom: 20,
                  color: s.hot ? '#fff' : PURPLE,
                  background: s.hot ? `linear-gradient(150deg, #9370ff, ${PURPLE})` : 'rgba(124,92,255,0.09)',
                  border: s.hot ? 'none' : '1px solid rgba(124,92,255,0.18)',
                  boxShadow: s.hot ? '0 16px 34px -10px rgba(124,92,255,0.55)' : '0 6px 16px -8px rgba(124,92,255,0.25)',
                }}>
                  <s.Icon size={26} strokeWidth={1.9} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', color: PURPLE, marginBottom: 6 }}>{s.n}</span>
                <span style={{ fontSize: 17, fontWeight: 700, color: DARK, marginBottom: 8 }}>{s.title}</span>
                <span style={{ fontSize: 13.5, lineHeight: 1.55, color: INK_SOFT, maxWidth: 210 }}>{s.desc}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </Reveal>

      {/* summary strip */}
      <Reveal delay={0.2} style={{ marginTop: 64 }}>
        <div style={{ ...glassCard, borderRadius: 20, padding: '22px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
          {[
            ['Average turnaround', '18.4 hrs', '↓ 22% vs. manual'],
            ['Pathologist time saved', '45%', 'per case, on average'],
            ['AI pre-screen accuracy', '99.1%', 'on par with experts'],
            ['Fully auditable', '100%', 'every step logged'],
          ].map(([label, value, sub]) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 160 }}>
              <span style={{ fontSize: 12.5, color: GRAY, fontWeight: 600 }}>{label}</span>
              <span style={{ fontSize: 26, fontWeight: 800, color: DARK, letterSpacing: '-0.02em' }}>{value}</span>
              <span style={{ fontSize: 12, color: PURPLE, fontWeight: 600 }}>{sub}</span>
            </div>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}

export default WorkflowSection;
