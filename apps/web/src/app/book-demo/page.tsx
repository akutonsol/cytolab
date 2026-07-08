'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, Clock, ShieldCheck, Sparkles, Check, ArrowRight, Loader2 } from 'lucide-react';
import { MarketingPage } from '@/components/landing/marketing-chrome';
import { RED, INK, GREEN, INDIGO, IconTile } from '@/components/landing/marketing-ui';

type FieldErrors = Partial<Record<'name' | 'email' | 'company', string>>;

const LAB_SIZES = ['1–5 pathologists', '6–20 pathologists', '21–50 pathologists', '50+ / health system'];
const ROLES = ['Lab Director', 'Pathologist', 'Lab Manager', 'IT / Informatics', 'Procurement', 'Other'];

const EXPECT: { Icon: typeof Clock; title: string; desc: string }[] = [
  { Icon: Clock, title: '30-minute guided walkthrough', desc: 'A live tour of the exact workflow your lab runs today — no slides.' },
  { Icon: Sparkles, title: 'See the AI on real cytology', desc: 'Watch screening, prioritization, and structured reporting end-to-end.' },
  { Icon: ShieldCheck, title: 'Security & compliance review', desc: 'HIPAA, SOC 2, audit logging, and data residency answered up front.' },
  { Icon: CalendarCheck, title: 'A tailored rollout plan', desc: 'Concrete pilot scope, timeline, and success metrics for your team.' },
];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #E5E7EB',
  fontSize: 14, color: INK, background: '#fff', outline: 'none', fontFamily: 'inherit',
};
const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' };

export default function BookDemoPage() {
  const [form, setForm] = useState({ name: '', email: '', company: '', role: '', labSize: '', message: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setErrors({});
    try {
      const res = await fetch('/api/demo-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, source: 'book-demo' }),
      });
      if (res.ok) { setStatus('done'); return; }
      const data = await res.json().catch(() => ({}));
      setErrors(data.errors ?? {});
      setStatus('idle');
    } catch {
      setErrors({ email: 'Something went wrong. Please try again.' });
      setStatus('idle');
    }
  }

  return (
    <MarketingPage active="platform">
      <section style={{ background: 'linear-gradient(180deg, #F2F1F9 0%, #FFFFFF 60%)', padding: '72px 64px 88px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'start' }}>
          {/* LEFT — value proposition */}
          <div style={{ paddingTop: 8 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(230,57,70,0.1)',
              border: '1px solid rgba(230,57,70,0.2)', borderRadius: 20, padding: '6px 14px', marginBottom: 24,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: RED }} />
              <span style={{ fontSize: 11, color: RED, fontWeight: 600, letterSpacing: '0.12em' }}>BOOK A LIVE DEMO</span>
            </div>
            <h1 style={{ fontSize: 52, fontWeight: 800, lineHeight: 1.06, letterSpacing: '-0.03em', color: INK, margin: '0 0 18px' }}>
              See CYTOLAB run<br /><em style={{ fontStyle: 'italic', color: RED }}>your</em> workflow.
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.65, color: '#4a4a5a', maxWidth: 460, marginBottom: 36 }}>
              Book a personalized walkthrough with our clinical team. We&apos;ll show you exactly how CYTOLAB
              fits your lab — from specimen intake to AI screening to signed-out report.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {EXPECT.map(({ Icon, title, desc }) => (
                <div key={title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <IconTile><Icon size={20} /></IconTile>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>{title}</div>
                    <div style={{ fontSize: 13.5, color: '#64748b', marginTop: 3, lineHeight: 1.5, maxWidth: 380 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 40, paddingTop: 28, borderTop: '1px solid #ececf5' }}>
              <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.04em' }}>Trusted by 2,500+ labs worldwide</div>
              <div style={{ display: 'flex', gap: 22, marginTop: 14, fontSize: 18, fontWeight: 800, color: '#c7c7d6' }}>
                <span>MAYO</span><span>Labcorp</span><span>Quest</span><span>Cleveland</span>
              </div>
            </div>
          </div>

          {/* RIGHT — form card / success */}
          <div style={{
            background: '#fff', border: '1px solid #E5E7EB', borderRadius: 24, padding: 36,
            boxShadow: '0 24px 70px rgba(30,20,80,0.10)', position: 'sticky', top: 100,
          }}>
            {status === 'done' ? (
              <div style={{ textAlign: 'center', padding: '32px 8px' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: `${GREEN}1a`, border: `1px solid ${GREEN}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <Check size={30} color={GREEN} strokeWidth={3} />
                </div>
                <h2 style={{ fontSize: 26, fontWeight: 800, color: INK, margin: '0 0 10px' }}>Request received</h2>
                <p style={{ fontSize: 15, color: '#64748b', lineHeight: 1.6, maxWidth: 340, margin: '0 auto 28px' }}>
                  Thanks, {form.name.split(' ')[0] || 'there'}. Our clinical team will reach out within one business
                  day to schedule your walkthrough at <strong style={{ color: INK }}>{form.email}</strong>.
                </p>
                <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: RED, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                  Back to home <ArrowRight size={16} />
                </Link>
              </div>
            ) : (
              <>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: INK, margin: '0 0 6px' }}>Request your demo</h2>
                <p style={{ fontSize: 14, color: '#94a3b8', margin: '0 0 24px' }}>No commitment. We reply within one business day.</p>
                <form onSubmit={submit} noValidate>
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle} htmlFor="name">Full name</label>
                    <input id="name" value={form.name} onChange={set('name')} placeholder="Dr. Jane Okafor"
                      style={{ ...inputStyle, borderColor: errors.name ? RED : '#E5E7EB' }} />
                    {errors.name && <div style={{ color: RED, fontSize: 12, marginTop: 5 }}>{errors.name}</div>}
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle} htmlFor="email">Work email</label>
                    <input id="email" type="email" value={form.email} onChange={set('email')} placeholder="jane@yourlab.com"
                      style={{ ...inputStyle, borderColor: errors.email ? RED : '#E5E7EB' }} />
                    {errors.email && <div style={{ color: RED, fontSize: 12, marginTop: 5 }}>{errors.email}</div>}
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle} htmlFor="company">Lab / organization</label>
                    <input id="company" value={form.company} onChange={set('company')} placeholder="Riverside Pathology"
                      style={{ ...inputStyle, borderColor: errors.company ? RED : '#E5E7EB' }} />
                    {errors.company && <div style={{ color: RED, fontSize: 12, marginTop: 5 }}>{errors.company}</div>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                    <div>
                      <label style={labelStyle} htmlFor="role">Your role</label>
                      <select id="role" value={form.role} onChange={set('role')} style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
                        <option value="">Select…</option>
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle} htmlFor="labSize">Lab size</label>
                      <select id="labSize" value={form.labSize} onChange={set('labSize')} style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
                        <option value="">Select…</option>
                        {LAB_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ marginBottom: 24 }}>
                    <label style={labelStyle} htmlFor="message">Anything specific you want to see? <span style={{ color: '#b6b6c6', fontWeight: 400 }}>(optional)</span></label>
                    <textarea id="message" value={form.message} onChange={set('message')} rows={3} placeholder="e.g. non-gyn cytology, LIS integration, TAT reporting…"
                      style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
                  </div>
                  <button type="submit" disabled={status === 'submitting'} style={{
                    width: '100%', padding: 15, background: RED, color: '#fff', border: 'none', borderRadius: 11,
                    fontWeight: 700, fontSize: 15, cursor: status === 'submitting' ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: status === 'submitting' ? 0.8 : 1,
                  }}>
                    {status === 'submitting'
                      ? <><Loader2 size={17} className="spin" /> Submitting…</>
                      : <>Request demo <ArrowRight size={17} /></>}
                  </button>
                  <p style={{ fontSize: 12, color: '#a3a3b5', textAlign: 'center', marginTop: 16, lineHeight: 1.5 }}>
                    By submitting you agree to our <Link href="/privacy" style={{ color: INDIGO, textDecoration: 'none' }}>Privacy Policy</Link>. We never share your data.
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </section>
      <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { to { transform: rotate(360deg); } } .spin { animation: spin 0.9s linear infinite; }` }} />
    </MarketingPage>
  );
}
