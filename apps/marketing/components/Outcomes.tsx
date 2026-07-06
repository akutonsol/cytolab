import SectionReveal from './SectionReveal'

const STATS = [
  { v: '40%', l: 'Faster turnaround', s: 'from accession to authorized report' },
  { v: '3×', l: 'Screening throughput', s: 'with CYTO AI pre-screening' },
  { v: '98%', l: 'AI concordance', s: 'against expert cytotechnologist review' },
  { v: '100%', l: 'Audit coverage', s: 'every action logged and traceable' },
]

export default function Outcomes() {
  return (
    <section className="px-[6vw] py-[120px] lg:px-8" style={{ background: 'var(--ink)' }}>
      <div className="mx-auto max-w-[1240px]">
        <SectionReveal>
          <span className="font-mono text-[12px] uppercase tracking-[0.24em]" style={{ color: 'var(--blue2)' }}>Outcomes</span>
        </SectionReveal>
        <SectionReveal delay={0.05}>
          <h2 className="mt-5 max-w-[16ch] font-serif text-[clamp(32px,5vw,64px)] leading-[1.02] text-bg">
            Measurable results, from day one.
          </h2>
        </SectionReveal>
        <div className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s, i) => (
            <SectionReveal key={s.l} delay={0.05 * i}>
              <div className="font-serif text-[clamp(48px,6vw,84px)] leading-none text-bg">{s.v}</div>
              <div className="mt-4 font-sans text-[16px] font-semibold text-bg">{s.l}</div>
              <div className="mt-1 font-sans text-[13px] text-bg/50">{s.s}</div>
            </SectionReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
