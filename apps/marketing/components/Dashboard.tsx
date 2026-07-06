import SectionReveal from './SectionReveal'

const BARS = [42, 58, 50, 71, 63, 80, 74]
const KPIS: [string, string][] = [['Turnaround', '2.4d'], ['Pending', '128'], ['Authorized', '89%']]
const QUEUE: [string, string, string][] = [
  ['DM26-03-014', 'Cervical Scrape', 'High'],
  ['DM26-10-085', 'Breast Asp.', 'High'],
  ['DM26-05-715', 'Urine Cyt.', 'Normal'],
  ['DM26-01-723', 'Breast Asp.', 'Normal'],
]

export default function Dashboard() {
  return (
    <section id="platform" className="px-[6vw] py-[120px] lg:px-8">
      <div className="mx-auto max-w-[1240px]">
        <div className="max-w-[640px]">
          <SectionReveal>
            <span className="font-mono text-[12px] uppercase tracking-[0.24em] text-blue">The platform</span>
          </SectionReveal>
          <SectionReveal delay={0.05}>
            <h2 className="mt-5 font-serif text-[clamp(32px,5vw,64px)] leading-[1.02]">Your entire lab, in one view.</h2>
          </SectionReveal>
          <SectionReveal delay={0.1}>
            <p className="mt-6 font-sans text-[18px] leading-relaxed text-ink/65">
              Live turnaround, throughput, and quality — with the working queue, AI findings, and authorization all one
              click away.
            </p>
          </SectionReveal>
        </div>

        <SectionReveal delay={0.1} className="mt-14">
          <div className="overflow-hidden rounded-2xl border bg-white shadow-[0_40px_80px_-40px_rgba(9,9,14,0.35)]" style={{ borderColor: 'rgba(9,9,14,0.1)' }}>
            <div className="flex items-center gap-2 border-b px-5 py-3.5" style={{ borderColor: 'rgba(9,9,14,0.07)', background: '#FBFBF9' }}>
              <span className="h-3 w-3 rounded-full" style={{ background: '#E2E1DB' }} />
              <span className="h-3 w-3 rounded-full" style={{ background: '#E2E1DB' }} />
              <span className="h-3 w-3 rounded-full" style={{ background: '#E2E1DB' }} />
              <span className="ml-4 font-mono text-[12px] text-ink/40">app.cytolab.io/dashboard</span>
            </div>
            <div className="grid gap-6 p-6 md:grid-cols-[1.4fr_1fr]">
              <div>
                <div className="grid grid-cols-3 gap-3">
                  {KPIS.map(([l, v]) => (
                    <div key={l} className="rounded-xl border p-4" style={{ borderColor: 'rgba(9,9,14,0.08)' }}>
                      <div className="font-mono text-[10px] uppercase tracking-wide text-ink/45">{l}</div>
                      <div className="mt-1 font-serif text-[26px] leading-none">{v}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-xl border p-5" style={{ borderColor: 'rgba(9,9,14,0.08)' }}>
                  <div className="font-mono text-[10px] uppercase tracking-wide text-ink/45">Monthly specimen volume</div>
                  <div className="mt-5 flex h-32 items-end gap-3">
                    {BARS.map((h, i) => (
                      <div key={i} className="flex-1 rounded-t-md" style={{ height: `${h}%`, background: i === BARS.length - 1 ? 'var(--blue)' : '#DADFF7' }} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="rounded-xl border p-5" style={{ borderColor: 'rgba(9,9,14,0.08)' }}>
                <div className="font-mono text-[10px] uppercase tracking-wide text-ink/45">Specimen queue</div>
                <div className="mt-4 space-y-3">
                  {QUEUE.map(([id, t, p]) => (
                    <div key={id} className="flex items-center justify-between rounded-lg border px-3 py-2.5" style={{ borderColor: 'rgba(9,9,14,0.06)' }}>
                      <div>
                        <div className="font-sans text-[13px] font-semibold">{id}</div>
                        <div className="font-sans text-[11px] text-ink/50">{t}</div>
                      </div>
                      <span className="font-mono text-[10px] uppercase tracking-wide" style={{ color: p === 'High' ? 'var(--blue)' : 'rgba(9,9,14,0.4)' }}>{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </SectionReveal>
      </div>
    </section>
  )
}
