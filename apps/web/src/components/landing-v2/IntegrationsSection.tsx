'use client';

// Integrations — "fits the stack you already run". Interoperability chips + a note
// on standards support. Names rendered as clean wordmarks (no external logos).
import { Plug, ArrowRight } from 'lucide-react';
import { PURPLE, DARK, GRAY, INK_SOFT, Section, SectionHeader, Reveal, glassCard } from './primitives';

const SYSTEMS = [
  { group: 'EMR / EHR', items: ['Epic', 'Oracle Cerner', 'MEDITECH', 'Athenahealth'] },
  { group: 'LIS', items: ['Sunquest', 'Orchard', 'Clinisys', 'NovoPath'] },
  { group: 'Scanners', items: ['Leica Aperio', 'Philips IntelliSite', 'Hamamatsu', '3DHISTECH'] },
  { group: 'Standards', items: ['HL7 v2', 'FHIR R4', 'DICOM WSI', 'SNOMED CT'] },
];

export function IntegrationsSection() {
  return (
    <Section id="integrations" tint="white">
      <SectionHeader
        eyebrow="Integrations"
        title={<>Fits the stack you already run.</>}
        subtitle="Bi-directional HL7 / FHIR, DICOM whole-slide imaging and vendor-neutral scanner support — PathOS slots into your environment instead of replacing it."
      />
      <div style={{ marginTop: 56, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
        {SYSTEMS.map((s, i) => (
          <Reveal key={s.group} delay={0.06 * i}>
            <div style={{ ...glassCard, borderRadius: 20, padding: 24, height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', color: PURPLE, background: 'rgba(124,92,255,0.10)' }}>
                  <Plug size={15} />
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: GRAY }}>{s.group}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {s.items.map((it) => (
                  <span key={it} style={{ fontSize: 16, fontWeight: 600, color: DARK, letterSpacing: '-0.01em' }}>{it}</span>
                ))}
              </div>
            </div>
          </Reveal>
        ))}
      </div>
      <Reveal delay={0.2} style={{ marginTop: 40, textAlign: 'center' }}>
        <a href="#" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: PURPLE, textDecoration: 'none' }}>
          View the full integration catalog <ArrowRight size={16} />
        </a>
        <p style={{ marginTop: 10, fontSize: 13.5, color: INK_SOFT }}>Don&apos;t see your system? Our API and webhooks connect to anything.</p>
      </Reveal>
    </Section>
  );
}

export default IntegrationsSection;
