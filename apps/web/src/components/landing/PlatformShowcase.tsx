'use client';

import { motion } from 'framer-motion';
import { Zap, BrainCircuit, FileCheck2 } from 'lucide-react';

const RED = '#E63946';
const EASE = [0.22, 0.8, 0.2, 1] as const;

const CALLOUTS = [
  { Icon: Zap, label: 'Real-time processing', desc: 'Specimens move through the pipeline instantly — no waiting, no delays.' },
  { Icon: BrainCircuit, label: 'AI-powered screening', desc: 'Every slide analyzed by our deep learning engine before pathologist review.' },
  { Icon: FileCheck2, label: 'Structured reporting', desc: 'CAP-compliant reports generated automatically, ready to sign and deliver.' },
];

export default function PlatformShowcase() {
  return (
    <div className="ps">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="ps-glow ps-glow-a" />
      <div className="ps-glow ps-glow-b" />

      {/* Headline */}
      <motion.div className="ps-head"
        initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-120px' }} transition={{ duration: 0.7, ease: EASE }}>
        <div className="ps-eyebrow">Live platform</div>
        <h2 className="ps-title">One platform. Every step <em>connected.</em></h2>
        <p className="ps-lede">
          Watch a specimen move through CYTOLAB in real time — from accessioning to
          AI screening to a signed, structured report. One continuous, intelligent pipeline.
        </p>
      </motion.div>

      {/* ── VIDEO PLAYER ── */}
      <motion.div
        initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.8, ease: EASE, delay: 0.1 }}
        style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 40px', marginTop: '48px', position: 'relative', zIndex: 2 }}
      >
        {/* Outer glow frame */}
        <div style={{
          position: 'relative',
          borderRadius: '20px',
          padding: '3px',
          background: 'linear-gradient(135deg, rgba(230,57,70,0.4) 0%, rgba(100,60,200,0.3) 50%, rgba(230,57,70,0.2) 100%)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.8), 0 32px 80px rgba(0,0,0,0.14), 0 8px 24px rgba(0,0,0,0.08), 0 0 60px rgba(230,57,70,0.08)',
        }}>
          {/* Video container */}
          <div style={{ borderRadius: '18px', overflow: 'hidden', background: '#0a0b1a', position: 'relative', aspectRatio: '16/9' }}>
            {/* Browser chrome bar */}
            <div style={{
              background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)',
              padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '12px',
            }}>
              {/* Window control dots (amber → neutral for zero-orange) */}
              <div style={{ display: 'flex', gap: '6px' }}>
                {['#FF5F57', '#CBCED9', '#28C840'].map((c, i) => (
                  <div key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: c }} />
                ))}
              </div>
              {/* URL bar */}
              <div style={{
                flex: 1, maxWidth: '320px', margin: '0 auto', background: 'rgba(255,255,255,0.08)',
                borderRadius: '6px', padding: '4px 12px', fontSize: 11, color: 'rgba(255,255,255,0.4)',
                textAlign: 'center', letterSpacing: '0.01em',
              }}>
                app.cytolab.io/dashboard
              </div>
              {/* Live badge */}
              <div style={{
                marginLeft: 'auto', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)',
                borderRadius: '20px', padding: '3px 10px', fontSize: 11, fontWeight: 600, color: '#22c55e',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'live-blink 1.5s ease-in-out infinite' }} />
                Live System
              </div>
            </div>

            {/* VIDEO ELEMENT */}
            <video autoPlay muted loop playsInline
              style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover' }}>
              <source src="/videos/product-demo.mp4" type="video/mp4" />
            </video>
          </div>
        </div>

        {/* Below video — 3 feature callouts */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px', marginTop: '48px', paddingBottom: '80px' }}>
          {CALLOUTS.map((item) => (
            <div key={item.label} style={{ textAlign: 'center', padding: '0 16px' }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14, background: 'rgba(230,57,70,0.08)',
                border: '1px solid rgba(230,57,70,0.15)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', margin: '0 auto 14px',
              }}>
                <item.Icon size={22} color={RED} strokeWidth={2} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0a0b1a', marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

const CSS = `
  .ps {
    position: relative; width: 100%; padding: 80px 56px 0; overflow: hidden; isolation: isolate;
    background: #F8F8FA;
    font-family: Geist, ui-sans-serif, system-ui, sans-serif; color: #0F172A;
  }
  .ps-glow { position: absolute; border-radius: 50%; filter: blur(90px); pointer-events: none; z-index: 0; }
  .ps-glow-a { width: 620px; height: 620px; left: 8%; top: 24%; background: radial-gradient(circle, rgba(230,57,70,.07), transparent 70%); }
  .ps-glow-b { width: 560px; height: 560px; right: 6%; bottom: 8%; background: radial-gradient(circle, rgba(99,102,241,.09), transparent 70%); }

  @keyframes live-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

  .ps-head { position: relative; z-index: 2; max-width: 720px; margin: 0 auto; text-align: center; }
  .ps-eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: ${RED}; }
  .ps-title { margin: 16px 0 0; font-size: 52px; line-height: 1.05; font-weight: 800; letter-spacing: -.03em; }
  .ps-title em { font-style: italic; color: ${RED}; }
  .ps-lede { margin: 18px auto 0; max-width: 560px; font-size: 17px; line-height: 1.65; color: #64748B; }

  @media (max-width: 900px) {
    .ps { padding: 60px 20px 0; }
    .ps-title { font-size: 36px; }
  }
`;
