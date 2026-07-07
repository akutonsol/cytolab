import SectionReveal from './SectionReveal'

const CERTS: [string, string][] = [
  ['HIPAA', 'PHI safeguards'],
  ['SOC 2', 'Type II'],
  ['CAP', 'Accreditation-ready'],
  ['FHIR R4', 'HL7 v2.5'],
]

const FEATURES = [
  'Argon2id password hashing',
  'MFA and device trust',
  'PHI encryption — AES-256 / TLS 1.3',
  'Append-only audit log',
  'Impossible-travel detection',
  'SSO / SAML 2.0',
]

export default function Security() {
  return (
    <section id="security" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
      borderBottom: '1px solid rgba(9,9,14,0.07)' }}>
      {/* LEFT — dark */}
      <div style={{ background: '#09090E', color: '#F0EFE9', padding: '5rem 3rem 5rem 2.5rem',
        position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(240,239,233,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(240,239,233,0.02) 1px,transparent 1px)',
          backgroundSize: '48px 48px', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700,
            letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(240,239,233,0.25)',
            display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '2.5rem' }}>
            <span style={{ width: 18, height: 1, background: 'rgba(240,239,233,0.2)', display: 'inline-block' }} />
            05 · Security
          </div>
          <div style={{ lineHeight: 0.9, marginBottom: '3rem' }}>
            <div><span style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2.6rem,4.5vw,4.5rem)',
              letterSpacing: '-0.03em', color: '#F0EFE9' }}>Enterprise</span></div>
            <div><span style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2.6rem,4.5vw,4.5rem)',
              letterSpacing: '-0.03em', color: 'transparent', WebkitTextStroke: '1.5px rgba(240,239,233,0.18)' }}>security</span></div>
            <div><span style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2.6rem,4.5vw,4.5rem)',
              letterSpacing: '-0.03em', color: '#4F46E5', fontStyle: 'italic' }}>out of the box.</span></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
            border: '1px solid rgba(240,239,233,0.09)', maxWidth: '420px' }}>
            {CERTS.map(([name, sub], i) => (
              <div key={name} style={{ padding: '1.5rem',
                borderRight: i % 2 === 0 ? '1px solid rgba(240,239,233,0.09)' : 'none',
                borderTop: i > 1 ? '1px solid rgba(240,239,233,0.09)' : 'none' }}>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.6rem', color: '#F0EFE9',
                  marginBottom: '0.3rem' }}>{name}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', fontWeight: 600,
                  letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(240,239,233,0.35)' }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT — light */}
      <div style={{ background: '#F0EFE9', padding: '5rem 2.5rem 5rem 3rem', display: 'flex',
        flexDirection: 'column', justifyContent: 'center' }}>
        <SectionReveal direction="right">
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', fontWeight: 700,
            letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(9,9,14,0.22)',
            marginBottom: '1.5rem' }}>Built-in controls</div>
          {FEATURES.map((f) => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '14px',
              padding: '16px 0', borderTop: '1px solid rgba(9,9,14,0.07)',
              fontSize: '0.95rem', fontWeight: 500, color: '#09090E' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4F46E5', flexShrink: 0 }} />
              {f}
            </div>
          ))}
        </SectionReveal>
      </div>
    </section>
  )
}
