const COLS: [string, string[]][] = [
  ['Platform', ['Dashboard', 'CYTO AI', 'Modules', 'Security', 'Pricing']],
  ['Company', ['About', 'Careers', 'Blog', 'Contact']],
  ['Legal', ['Privacy', 'Terms', 'HIPAA', 'SOC 2']],
]

export default function Footer() {
  return (
    <footer className="px-[6vw] pb-12 pt-20 lg:px-8" style={{ borderTop: '1px solid rgba(9,9,14,0.1)' }}>
      <div className="mx-auto max-w-[1240px]">
        <div className="grid gap-12 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-md" style={{ background: 'var(--ink)' }}>
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--blue)' }} />
              </span>
              <span className="font-serif text-[20px]">CYTOLAB</span>
            </div>
            <p className="mt-4 max-w-[30ch] font-sans text-[14px] leading-relaxed text-ink/55">
              The AI-powered digital pathology operating system for the modern laboratory.
            </p>
          </div>
          {COLS.map(([title, links]) => (
            <div key={title}>
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink/40">{title}</div>
              <ul className="mt-4 space-y-2.5">
                {links.map((l) => (
                  <li key={l}>
                    <a href="#" className="font-sans text-[14px] text-ink/70 transition-colors hover:text-ink">{l}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t pt-8 sm:flex-row sm:items-center" style={{ borderColor: 'rgba(9,9,14,0.1)' }}>
          <span className="font-mono text-[12px] text-ink/45">© 2026 CYTOLAB. All rights reserved.</span>
          <span className="font-mono text-[12px] text-ink/45">HIPAA-ready · SOC 2 · HL7/FHIR</span>
        </div>
      </div>
    </footer>
  )
}
