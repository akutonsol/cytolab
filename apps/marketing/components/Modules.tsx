import SectionReveal from './SectionReveal'

const MODULES: [string, string][] = [
  ['Specimen Management', 'Accessioning, tracking, and cabinets across the full chain of custody.'],
  ['CYTO AI Screening', 'Automated pre-screening with Bethesda classification and confidence.'],
  ['Result Sheets', 'Structured entry, templates, and one-click authorization.'],
  ['Billing & Payments', 'Charge capture, invoicing, and reconciliation built for labs.'],
  ['Workforce', 'Attendance, scheduling, payroll, and productivity analytics.'],
  ['Quality Control', 'QC runs, equipment logs, proficiency, and CAP-ready reporting.'],
  ['Report Center', 'Operational and clinical reports with one-click export.'],
  ['EMR / FHIR', 'HL7 and FHIR interoperability with referring systems.'],
  ['Client Portal', 'Secure result delivery and requisition tracking for clinics.'],
]

export default function Modules() {
  return (
    <section id="modules" className="px-[6vw] py-[120px] lg:px-8">
      <div className="mx-auto max-w-[1240px]">
        <SectionReveal>
          <span className="font-mono text-[12px] uppercase tracking-[0.24em] text-blue">Modules</span>
        </SectionReveal>
        <SectionReveal delay={0.05}>
          <h2 className="mt-5 max-w-[18ch] font-serif text-[clamp(32px,5vw,64px)] leading-[1.02]">One platform. Every lab workflow.</h2>
        </SectionReveal>
        <div className="mt-16 grid gap-px overflow-hidden rounded-2xl md:grid-cols-2 lg:grid-cols-3" style={{ background: 'rgba(9,9,14,0.07)' }}>
          {MODULES.map(([t, d], i) => (
            <SectionReveal key={t} delay={0.03 * (i % 3)} className="bg-bg p-8 transition-colors hover:bg-bg2">
              <span className="inline-block h-8 w-8 rounded-lg" style={{ background: 'var(--blue)', opacity: 0.16 }} />
              <h3 className="mt-6 font-serif text-[22px] leading-tight">{t}</h3>
              <p className="mt-2 font-sans text-[14px] leading-relaxed text-ink/60">{d}</p>
            </SectionReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
