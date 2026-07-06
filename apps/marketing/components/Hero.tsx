import SectionReveal from './SectionReveal'

export default function Hero() {
  return (
    <section id="top" className="relative px-[6vw] pb-[80px] pt-[160px] lg:px-8">
      <div className="mx-auto max-w-[1240px]">
        <SectionReveal>
          <span className="font-mono text-[12px] uppercase tracking-[0.24em] text-blue">AI-Powered Digital Pathology</span>
        </SectionReveal>
        <SectionReveal delay={0.05}>
          <h1 className="mt-6 max-w-[16ch] font-serif text-[clamp(44px,8vw,120px)] leading-[0.94]">
            The operating system for the <span style={{ fontStyle: 'italic', color: 'var(--blue)' }}>modern lab.</span>
          </h1>
        </SectionReveal>
        <SectionReveal delay={0.1}>
          <p className="mt-8 max-w-[54ch] font-sans text-[clamp(17px,1.6vw,21px)] leading-relaxed text-ink/70">
            CYTOLAB unifies AI screening, specimen management, EMR interoperability, and full lab operations in one
            platform — so cytology and pathology teams diagnose faster, with less friction.
          </p>
        </SectionReveal>
        <SectionReveal delay={0.15}>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <a href="#cta" className="rounded-full px-7 py-4 font-sans text-[15px] font-semibold text-bg" style={{ background: 'var(--ink)' }}>
              Request a demo →
            </a>
            <a
              href="#platform"
              className="rounded-full border px-7 py-4 font-sans text-[15px] font-semibold text-ink"
              style={{ borderColor: 'rgba(9,9,14,0.14)' }}
            >
              See the platform
            </a>
          </div>
        </SectionReveal>
        <SectionReveal delay={0.2}>
          <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink/45">
            <span>HIPAA-ready</span><span>·</span>
            <span>FDA-validated CYTO AI</span><span>·</span>
            <span>HL7 / FHIR</span><span>·</span>
            <span>SOC 2 in progress</span>
          </div>
        </SectionReveal>
      </div>
    </section>
  )
}
