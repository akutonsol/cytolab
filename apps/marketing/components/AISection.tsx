import SectionReveal from './SectionReveal'

const EVIDENCE: [string, number][] = [
  ['Nuclear enlargement', 94], ['Hyperchromasia', 87], ['Dense clustering', 81], ['Irregular chromatin', 73],
]
const FEATURES = [
  'FDA-validated screening model',
  'Bethesda 2014 classification',
  'Explainable, evidence-linked findings',
  'Human-in-the-loop authorization',
]

export default function AISection() {
  return (
    <section className="px-[6vw] py-[120px] lg:px-8" style={{ background: 'var(--bg2)' }}>
      <div className="mx-auto grid max-w-[1240px] items-center gap-16 lg:grid-cols-2">
        <div>
          <SectionReveal>
            <span className="font-mono text-[12px] uppercase tracking-[0.24em] text-blue">CYTO AI</span>
          </SectionReveal>
          <SectionReveal delay={0.05}>
            <h2 className="mt-5 font-serif text-[clamp(32px,5vw,60px)] leading-[1.02]">AI that screens, explains, and defers to you.</h2>
          </SectionReveal>
          <SectionReveal delay={0.1}>
            <p className="mt-6 font-sans text-[18px] leading-relaxed text-ink/65">
              CYTO AI pre-screens every slide, classifies against the Bethesda System, and surfaces its evidence with a
              confidence score — pathologists stay in control, authorizing every result.
            </p>
          </SectionReveal>
          <SectionReveal delay={0.15}>
            <ul className="mt-8 space-y-3">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-3 font-sans text-[15px] text-ink/80">
                  <span className="grid h-5 w-5 place-items-center rounded-full text-bg" style={{ background: 'var(--blue)' }}>
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </SectionReveal>
        </div>

        <SectionReveal delay={0.1} direction="right">
          <div className="rounded-2xl border bg-white p-6 shadow-[0_40px_80px_-40px_rgba(9,9,14,0.3)]" style={{ borderColor: 'rgba(9,9,14,0.1)' }}>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wide text-ink/45">AI Findings · DM26-03-014</span>
              <span className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold text-bg" style={{ background: 'var(--blue)' }}>84% conf</span>
            </div>
            <div className="mt-5 rounded-xl p-4" style={{ background: '#EEF0FB' }}>
              <div className="font-sans text-[13px] font-semibold text-ink">Atypical squamous cells (ASC-US)</div>
              <div className="font-sans text-[12px] text-ink/55">Recommend cytotechnologist review</div>
            </div>
            <div className="mt-5 space-y-3">
              {EVIDENCE.map(([l, v]) => (
                <div key={l}>
                  <div className="flex items-center justify-between font-sans text-[12px]">
                    <span className="text-ink/70">{l}</span>
                    <span className="font-semibold text-ink">{v}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: '#E4E3DD' }}>
                    <div className="h-full rounded-full" style={{ width: `${v}%`, background: 'var(--blue)' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SectionReveal>
      </div>
    </section>
  )
}
