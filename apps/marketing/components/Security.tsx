import SectionReveal from './SectionReveal'

const ITEMS: [string, string][] = [
  ['HIPAA-ready', 'PHI encrypted at rest (AES-256) and in transit (TLS 1.2+).'],
  ['Role-based access', 'Granular permissions and named super-roles per lab.'],
  ['Append-only audit', 'Every action logged, tamper-evident, and exportable.'],
  ['Multi-factor auth', 'TOTP + email OTP with trusted-device and lockout controls.'],
  ['Tenant isolation', 'Strict per-lab data separation enforced at the database layer.'],
  ['Encrypted backups', 'Automated, AES-256-encrypted backups with verified restore.'],
]

export default function Security() {
  return (
    <section id="security" className="px-[6vw] py-[120px] lg:px-8" style={{ background: 'var(--ink)' }}>
      <div className="mx-auto max-w-[1240px]">
        <SectionReveal>
          <span className="font-mono text-[12px] uppercase tracking-[0.24em]" style={{ color: 'var(--blue2)' }}>Security &amp; compliance</span>
        </SectionReveal>
        <SectionReveal delay={0.05}>
          <h2 className="mt-5 max-w-[16ch] font-serif text-[clamp(32px,5vw,60px)] leading-[1.02] text-bg">
            Built for PHI from the first line of code.
          </h2>
        </SectionReveal>
        <div className="mt-16 grid gap-x-12 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map(([t, d], i) => (
            <SectionReveal key={t} delay={0.03 * i}>
              <div className="h-px w-10" style={{ background: 'var(--blue2)' }} />
              <h3 className="mt-5 font-serif text-[22px] text-bg">{t}</h3>
              <p className="mt-2 font-sans text-[14px] leading-relaxed text-bg/55">{d}</p>
            </SectionReveal>
          ))}
        </div>
      </div>
    </section>
  )
}
