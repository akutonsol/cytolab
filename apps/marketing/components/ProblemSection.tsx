import SectionReveal from './SectionReveal'

const POINTS = [
  { n: '01', t: 'Manual screening bottlenecks', d: 'Cytotechnologists spend hours on repetitive screening while backlogs grow and turnaround slips.' },
  { n: '02', t: 'Fragmented, disconnected tools', d: 'Intake, results, billing, and reporting live in separate systems that never quite talk to each other.' },
  { n: '03', t: 'No line of sight', d: 'Leadership flies blind on TAT, throughput, and quality without real-time, auditable analytics.' },
]

export default function ProblemSection() {
  return (
    <section className="px-[6vw] py-[120px] lg:px-8">
      <div className="mx-auto max-w-[1240px]">
        <SectionReveal>
          <span className="font-mono text-[12px] uppercase tracking-[0.24em] text-blue">The problem</span>
        </SectionReveal>
        <SectionReveal delay={0.05}>
          <h2 className="mt-5 max-w-[18ch] font-serif text-[clamp(32px,5vw,64px)] leading-[1.02]">
            Cytology still runs on manual work and disconnected systems.
          </h2>
        </SectionReveal>
        <div className="mt-16 grid gap-px overflow-hidden rounded-2xl md:grid-cols-3" style={{ background: 'rgba(9,9,14,0.07)' }}>
          {POINTS.map((p, i) => (
            <SectionReveal key={p.n} delay={0.05 * i} className="bg-bg p-8">
              <span className="font-mono text-[13px] text-blue">{p.n}</span>
              <h3 className="mt-4 font-serif text-[24px] leading-tight">{p.t}</h3>
              <p className="mt-3 font-sans text-[15px] leading-relaxed text-ink/65">{p.d}</p>
            </SectionReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
