'use client';

// Security & Compliance — dark, high-gravitas section. Compliance badges + the
// controls that matter to regulated labs. Light text on DARK, purple accents.
import { Lock, KeyRound, ScrollText, EyeOff, Globe, Activity, ShieldCheck } from 'lucide-react';
import { PURPLE, DARK, Reveal, Eyebrow } from './primitives';

const BADGES = ['HIPAA', 'SOC 2 Type II', 'GDPR', 'HITRUST', 'ISO 27001', '21 CFR Part 11'];

const CONTROLS = [
  { Icon: Lock, title: 'End-to-end encryption', desc: 'AES-256 at rest, TLS 1.3 in transit, per-tenant key isolation.' },
  { Icon: KeyRound, title: 'SSO / SAML + RBAC', desc: 'Enterprise identity, granular roles, least-privilege by default.' },
  { Icon: ScrollText, title: 'Immutable audit trail', desc: 'Every view, edit and sign-off logged and tamper-evident.' },
  { Icon: EyeOff, title: 'PHI-safe AI', desc: 'Redaction in the AI path; no patient data leaves your tenant.' },
  { Icon: Globe, title: 'Data residency', desc: 'Choose your region; single-tenant deployment available.' },
  { Icon: Activity, title: '99.99% uptime SLA', desc: 'Multi-region failover with continuous monitoring.' },
];

export function SecuritySection() {
  return (
    <section id="compliance" style={{ position: 'relative', background: DARK, padding: '120px 72px', overflow: 'hidden' }}>
      {/* faint purple aura, no hard edges */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(60% 60% at 80% 0%, rgba(124,92,255,0.16) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1600, margin: '0 auto' }}>
        <Reveal style={{ maxWidth: 720 }}>
          <Eyebrow>Security &amp; Compliance</Eyebrow>
          <h2 style={{ margin: '20px 0 0', fontSize: 'clamp(32px, 3.4vw, 46px)', lineHeight: 1.06, fontWeight: 700, letterSpacing: '-0.03em', color: '#fff' }}>
            Built for the most regulated<br />environments in medicine.
          </h2>
          <p style={{ margin: '18px 0 0', maxWidth: 560, fontSize: 18, lineHeight: 1.6, color: 'rgba(255,255,255,0.62)' }}>
            Diagnostic data demands more than best-effort security. PathOS is engineered for HIPAA, SOC&nbsp;2 and clinical-grade auditability from the ground up.
          </p>
        </Reveal>

        {/* compliance badges */}
        <Reveal delay={0.1} style={{ marginTop: 40, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {BADGES.map((b) => (
            <span key={b} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, color: 'rgba(255,255,255,0.9)',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', padding: '9px 16px', borderRadius: 999,
            }}>
              <ShieldCheck size={15} color={PURPLE} /> {b}
            </span>
          ))}
        </Reveal>

        {/* controls grid */}
        <div style={{ marginTop: 56, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {CONTROLS.map((c, i) => (
            <Reveal key={c.title} delay={0.06 * i}>
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 18, padding: 26, height: '100%' }}>
                <span style={{ width: 46, height: 46, borderRadius: 13, display: 'grid', placeItems: 'center', color: '#fff', background: 'rgba(124,92,255,0.18)', border: '1px solid rgba(124,92,255,0.3)', marginBottom: 18 }}>
                  <c.Icon size={21} strokeWidth={1.9} />
                </span>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>{c.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: 'rgba(255,255,255,0.58)', margin: 0 }}>{c.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export default SecuritySection;
