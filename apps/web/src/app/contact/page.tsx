'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, LifeBuoy, CalendarCheck, ShieldCheck, ArrowRight, Check, Loader2 } from 'lucide-react';
import { MarketingPage } from '@/components/landing/marketing-chrome';
import { RED, INK, GREEN, INDIGO, VIOLET, IconTile } from '@/components/landing/marketing-ui';

type FieldErrors = Partial<Record<'name' | 'email' | 'company', string>>;

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #E5E7EB',
  fontSize: 14, color: INK, background: '#fff', outline: 'none', fontFamily: 'inherit',
};
const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' };

const CHANNELS: { Icon: typeof Mail; tint: string; title: string; desc: string; action: string; href: string }[] = [
  { Icon: CalendarCheck, tint: RED, title: 'Book a live demo', desc: 'The fastest way to evaluate CYTOLAB on your own workflow.', action: 'Schedule a demo', href: '/book-demo' },
  { Icon: LifeBuoy, tint: INDIGO, title: 'Customer support', desc: 'Existing customer? Our support team responds within one business day.', action: 'support@cytolab.demo', href: 'mailto:support@cytolab.demo' },
  { Icon: ShieldCheck, tint: VIOLET, title: 'Security & compliance', desc: 'Reviewing our controls? See our security posture and request documentation.', action: 'View security', href: '/compliance' },
];

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setErrors({});
    try {
      const res = await fetch('/api/demo-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, source: 'contact-sales' }),
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
    <MarketingPage active="support">
      <section style={{ background: 'linear-gradient(180deg, #F2F1F9 0%, #FFFFFF 55%)', padding: '72px 64px 88px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <div style={{ maxWidth: 640, marginBottom: 48 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', color: RED, textTransform: 'uppercase', marginBottom: 16 }}>Contact us</div>
            <h1 style={{ fontSize: 52, fontWeight: 800, lineHeight: 1.06, letterSpacing: '-0.03em', color: INK, margin: '0 0 16px' }}>
              Let&apos;s talk about <em style={{ fontStyle: 'italic', color: RED }}>your lab.</em>
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.65, color: '#4a4a5a' }}>
              Whether you&apos;re evaluating CYTOLAB, need support, or want to review our security posture — the right team is one message away.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 48, alignItems: 'start' }}>
            {/* LEFT — channels */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {CHANNELS.map(({ Icon, tint, title, desc, action, href }) => (
                <div key={title} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 16, padding: 22, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <IconTile tint={tint}><Icon size={20} /></IconTile>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: INK }}>{title}</div>
                      <div style={{ fontSize: 13.5, color: '#64748b', marginTop: 4, lineHeight: 1.5 }}>{desc}</div>
                      <Link href={href} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: tint, fontWeight: 700, fontSize: 13.5, textDecoration: 'none', marginTop: 10 }}>
                        {action} <ArrowRight size={14} />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* RIGHT — contact-sales form */}
            <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 24, padding: 36, boxShadow: '0 24px 70px rgba(30,20,80,0.10)' }}>
              {status === 'done' ? (
                <div style={{ textAlign: 'center', padding: '40px 8px' }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: `${GREEN}1a`, border: `1px solid ${GREEN}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                    <Check size={30} color={GREEN} strokeWidth={3} />
                  </div>
                  <h2 style={{ fontSize: 24, fontWeight: 800, color: INK, margin: '0 0 10px' }}>Message sent</h2>
                  <p style={{ fontSize: 15, color: '#64748b', lineHeight: 1.6, maxWidth: 320, margin: '0 auto 24px' }}>
                    Thanks, {form.name.split(' ')[0] || 'there'}. Our team will get back to you at <strong style={{ color: INK }}>{form.email}</strong> within one business day.
                  </p>
                  <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: RED, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                    Back to home <ArrowRight size={16} />
                  </Link>
                </div>
              ) : (
                <>
                  <h2 style={{ fontSize: 22, fontWeight: 800, color: INK, margin: '0 0 6px' }}>Talk to sales</h2>
                  <p style={{ fontSize: 14, color: '#94a3b8', margin: '0 0 24px' }}>Tell us about your lab and we&apos;ll take it from there.</p>
                  <form onSubmit={submit} noValidate>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                      <div>
                        <label style={labelStyle} htmlFor="name">Full name</label>
                        <input id="name" value={form.name} onChange={set('name')} placeholder="Dr. Jane Okafor"
                          style={{ ...inputStyle, borderColor: errors.name ? RED : '#E5E7EB' }} />
                        {errors.name && <div style={{ color: RED, fontSize: 12, marginTop: 5 }}>{errors.name}</div>}
                      </div>
                      <div>
                        <label style={labelStyle} htmlFor="email">Work email</label>
                        <input id="email" type="email" value={form.email} onChange={set('email')} placeholder="jane@yourlab.com"
                          style={{ ...inputStyle, borderColor: errors.email ? RED : '#E5E7EB' }} />
                        {errors.email && <div style={{ color: RED, fontSize: 12, marginTop: 5 }}>{errors.email}</div>}
                      </div>
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <label style={labelStyle} htmlFor="company">Lab / organization</label>
                      <input id="company" value={form.company} onChange={set('company')} placeholder="Riverside Pathology"
                        style={{ ...inputStyle, borderColor: errors.company ? RED : '#E5E7EB' }} />
                      {errors.company && <div style={{ color: RED, fontSize: 12, marginTop: 5 }}>{errors.company}</div>}
                    </div>
                    <div style={{ marginBottom: 24 }}>
                      <label style={labelStyle} htmlFor="message">How can we help?</label>
                      <textarea id="message" value={form.message} onChange={set('message')} rows={4} placeholder="Tell us what you're looking to solve…"
                        style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
                    </div>
                    <button type="submit" disabled={status === 'submitting'} style={{
                      width: '100%', padding: 15, background: RED, color: '#fff', border: 'none', borderRadius: 11,
                      fontWeight: 700, fontSize: 15, cursor: status === 'submitting' ? 'wait' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: status === 'submitting' ? 0.8 : 1,
                    }}>
                      {status === 'submitting'
                        ? <><Loader2 size={17} className="spin" /> Sending…</>
                        : <>Send message <ArrowRight size={17} /></>}
                    </button>
                    <p style={{ fontSize: 12, color: '#a3a3b5', textAlign: 'center', marginTop: 16, lineHeight: 1.5 }}>
                      Prefer to explore first? <Link href="/book-demo" style={{ color: INDIGO, textDecoration: 'none', fontWeight: 600 }}>Book a live demo</Link>.
                    </p>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
      <style dangerouslySetInnerHTML={{ __html: `@keyframes spin { to { transform: rotate(360deg); } } .spin { animation: spin 0.9s linear infinite; }` }} />
    </MarketingPage>
  );
}
