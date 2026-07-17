'use client';

// Feature Grid — the core product capabilities, 3×2 glass cards with hover lift.
import { Brain, ScanSearch, FileText, LayoutGrid, BadgeCheck, Users } from 'lucide-react';
import { PURPLE, DARK, INK_SOFT, Section, SectionHeader, Reveal, glassCard } from './primitives';

const FEATURES = [
  { Icon: Brain, title: 'AI Pre-Screening', desc: 'Detect, quantify and grade nuclei, mitoses and IHC before a case ever reaches a pathologist.' },
  { Icon: ScanSearch, title: 'Whole-Slide Viewer', desc: 'Buttery 40× navigation and annotations — all in the browser.' },
  { Icon: FileText, title: 'Synoptic Reporting', desc: 'Structured, guideline-compliant reports auto-drafted directly from the analysis.' },
  { Icon: LayoutGrid, title: 'Case Management', desc: 'Route, prioritise and track every case with SLA-aware, sub-specialty worklists.' },
  { Icon: BadgeCheck, title: 'Quality Control', desc: 'Automated QC flags, second-read routing and real-time concordance tracking.' },
  { Icon: Users, title: 'Collaboration', desc: 'Tumor boards, consults and shared annotations in real time, across sites.' },
];

export function FeatureGridSection() {
  return (
    <Section id="features" tint="soft">
      <SectionHeader
        eyebrow="One platform"
        title={<>Everything your lab needs,<br />nothing it doesn&apos;t.</>}
        subtitle="A unified operating system for modern pathology — imaging, intelligence, reporting and workflow in one place."
      />
      <div style={{ marginTop: 64, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={0.06 * i}>
            <div className="v2-card" style={{ ...glassCard, borderRadius: 22, padding: 30, height: '100%' }}>
              <div style={{ width: 52, height: 52, borderRadius: 15, display: 'grid', placeItems: 'center', color: PURPLE, background: 'rgba(124,92,255,0.10)', border: '1px solid rgba(124,92,255,0.16)', marginBottom: 22 }}>
                <f.Icon size={24} strokeWidth={1.9} />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: DARK, margin: '0 0 10px', letterSpacing: '-0.01em' }}>{f.title}</h3>
              <p style={{ fontSize: 15, lineHeight: 1.6, color: INK_SOFT, margin: 0 }}>{f.desc}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .v2-card { transition: transform .3s cubic-bezier(.22,.8,.2,1), box-shadow .3s ease; }
        .v2-card:hover { transform: translateY(-4px); box-shadow: 0 2px 6px rgba(20,14,50,0.05), 0 30px 60px -24px rgba(44,30,96,0.28), inset 0 1px 0 rgba(255,255,255,0.7); }
        @media (prefers-reduced-motion: reduce) { .v2-card { transition: none; } }
      ` }} />
    </Section>
  );
}

export default FeatureGridSection;
